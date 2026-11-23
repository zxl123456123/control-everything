"""Synthetic clicks through real Hub and local HTTP; TLS and sending are excluded."""
import threading
import unittest
from types import SimpleNamespace
from unittest.mock import Mock
from urllib.request import Request, build_opener

from control_everything.integrations.remote_connector import ConnectorStore, RemoteConnector, RemotePeer
from control_everything.workspace.automation_remote_inbox import RemoteAutomationInbox
from control_everything.workspace.automation_identity_inbox import AutomationIdentityInbox
from tests.backend import test_automation_identity_http as local_fixture
from tests.backend import test_automation_producer_http as hub_fixture
from tests.backend.test_remote_connector import Protector
from tests.backend.test_remote_hub_support import INSTALL


class IdentityFlowHTTPTests(unittest.TestCase):
    def test_transport_reopen_explicit_confirmation(self):
        hub = hub_fixture.AutomationProducerHTTPTests()
        try:
            hub.setUp()
        finally:
            self._cleanups.extend(hub._cleanups)
            hub._cleanups.clear()
        local = local_fixture.IdentityHTTPTests()
        try:
            local.setUp()
        finally:
            self._cleanups.extend(local._cleanups)
            local._cleanups.clear()
        with local.profile.store.connection() as db:
            db.execute("INSERT INTO projects VALUES('project-a','Project A',0,'now','now',0)")
        local.base = '/api/workspace/projects/project-a/automation-identities'
        config = SimpleNamespace(hub_origin=hub.hub.public_origin, issuer=hub.private['issuer'])
        store = ConnectorStore(local.root / 'connector', protector=Protector(), secure_directory=lambda _: None,
                               api=SimpleNamespace(owner=lambda _: object(), close=lambda _: None))
        store.write('credentials.bin', {k: hub.device[k] for k in
                    ('device_id', 'generation', 'credential_revision', 'control_token')}, protected=True)
        store.write('installation.json', {'installation_id': INSTALL})
        calls = []

        class LoopbackTransport:
            def open(self, request, timeout):
                # Test-only HTTPS mapping preserves HTTP semantics; TLS is not tested.
                path = request.full_url[len(config.hub_origin):]
                calls.append(path)
                mapped = Request('http://127.0.0.1:' + str(hub.server.server_port) + path,
                                 data=request.data, headers=dict(request.header_items()), method=request.method)
                return build_opener().open(mapped, timeout=timeout)

        def caller():
            peer = RemotePeer(config)
            peer.opener = LoopbackTransport()
            connector = RemoteConnector(config, store, peer=peer, keys=Mock(),
                                        mailbox_sink=RemoteAutomationInbox(local.profile.store))
            connector._tunnel = SimpleNamespace(running=True, close=Mock())
            return connector

        connector = caller()
        local.server.remote_connector = connector
        context = connector.identity_context('producer-a', 'project-a')
        self.assertEqual(context['app_id'], 'app-a')
        status, challenge = local.request('/challenges', 'POST', {'producer_id': 'producer-a'})
        self.assertEqual(status, 201, challenge)
        service = local.workspace.identity_service(connector.current_binding)
        # Internal trusted sender receipt is simulated; no card is sent.
        service.attach_message('project-a', challenge['challenge_id'], 'message-a')
        body = {k: v for k, v in hub.body.items() if k != 'decision'}
        body['binding'] = dict(namespace='control-everything.identity.v1',
                               challenge_id=challenge['challenge_id'], nonce=challenge['nonce'])
        self.assertEqual(hub.receive(body)[0], 200)
        connector.connect(8766, 12345)
        connector.connect(8766, 12345)
        with local.profile.store.connection() as db:
            row = db.execute("SELECT ack_state FROM automation_remote_inbox WHERE event_id=?",
                             (body['event_id'],)).fetchone()
            self.assertEqual(row['ack_state'], 'acknowledged')
        self.assertIn('/remote/desktop/automation/ack', calls)
        adapter = AutomationIdentityInbox(local.profile.store, service, connector.current_binding)
        self.assertEqual(adapter.drain(threading.Event())['processed'], 1)
        connector = caller()
        local.server.remote_connector = connector
        service = local.workspace.identity_service(connector.current_binding)
        reopened = AutomationIdentityInbox(local.profile.store, service, connector.current_binding)
        self.assertEqual(reopened.drain(threading.Event())['processed'], 0)
        fact = local.request()[1]['identities'][0]
        self.assertEqual(len(fact['candidates']), 1)
        self.assertEqual(fact['bindings'], [])
        candidate = fact['candidates'][0]['id']
        status, binding = local.request('/confirm', 'POST', {'candidate_id': candidate})
        self.assertEqual(status, 200, binding)
        self.assertEqual(binding['candidate_id'], candidate)
        status, revoked = local.request('/revoke', 'POST', {'binding_id': binding['id']})
        self.assertEqual(status, 200, revoked)
        self.assertEqual(revoked['state'], 'revoked')
        with local.profile.store.connection() as db:
            for table in ('task_reviews', 'task_items', 'automation_flows'):
                self.assertEqual(db.execute('SELECT count(*) FROM ' + table).fetchone()[0], 0)
