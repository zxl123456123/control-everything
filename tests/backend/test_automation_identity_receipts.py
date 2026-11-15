"""Transport receipt polling attaches only a trusted sent status."""
import hashlib
import json
import threading
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import Mock, patch
from urllib.request import Request, build_opener

from control_everything.http.desktop import Desktop
from control_everything.integrations.remote_connector import ConnectorError, ConnectorStore, RemoteConnector, RemotePeer
from control_everything.workspace.automation_identities import IdentityService
from control_everything.workspace.automation_identity_inbox import AutomationIdentityInbox
from control_everything.workspace.automation_identity_receipts import AutomationIdentityReceipts
from control_everything.workspace.automation_remote_inbox import RemoteAutomationInbox
from control_everything.workspace.store import WorkspaceError, WorkspaceStore
from tests.backend import test_automation_identities as identity_fixtures
from tests.backend import test_automation_producer_http as hub_fixture
from tests.backend.test_remote_connector import Protector
from tests.backend.test_remote_hub_support import INSTALL


class ReceiptTests(unittest.TestCase):
    def setUp(self):
        identity_fixtures.IdentityTests.setUp(self)
        self.connector = Mock()
        self.connector.current_binding.side_effect = lambda: dict(self.binding)
        self.adapter = AutomationIdentityReceipts(self.store, self.service, self.connector)
        self.stop = threading.Event()

    def awaiting(self):
        return self.service.create_challenge('p', self.context)

    def status_for(self, created, **changes):
        with self.store.connection() as db:
            row = db.execute('SELECT * FROM automation_identity_challenges WHERE id=?',
                             (created['challenge_id'],)).fetchone()
        context = {key: row['account_id' if key == 'channel_account_id' else key]
                   for key in ('producer_id', 'project_id', 'channel_account_id', 'app_id', 'chat_id', 'device_id', 'generation')}
        body = {'attempt_id': 'ab' * 16, 'challenge_id': created['challenge_id'], 'state': 'sent',
                'expires_at': row['expires_at'], 'context': context, 'message_id': 'card'}
        body.update(changes)
        return body

    def test_missing_registration_waits_without_sending(self):
        created = self.awaiting()
        self.connector.identity_send_status.side_effect = ConnectorError('not_found', 404)
        self.assertEqual(self.adapter.drain(self.stop)['waiting'], 1)
        self.assertEqual(self.service.list('p')[0]['state'], 'awaiting_message')
        self.connector.register_identity_send.assert_not_called()
        self.assertEqual(created['challenge_id'], self.service.list('p')[0]['id'])

    def test_network_and_database_faults_retry_without_attaching(self):
        created = self.awaiting()
        self.connector.identity_send_status.side_effect = ConnectorError('remote_network_unavailable')
        self.assertEqual(self.adapter.drain(self.stop)['error'], 1)
        self.connector.identity_send_status.side_effect = lambda challenge_id: self.status_for(created)
        self.assertEqual(self.adapter.drain(self.stop)['attached'], 0)
        self.assertEqual(self.adapter.drain(self.stop)['attached'], 1)
        self.assertEqual(self.service.list('p')[0]['bindings'], [])
        other = self.awaiting()
        with patch.object(self.store, 'connection', side_effect=WorkspaceError('storage_error')):
            self.assertEqual(self.adapter.drain(self.stop)['error'], 1)
        self.binding['generation'] = 2
        self.adapter.drain(self.stop)
        self.binding['generation'] = 1
        self.connector.identity_send_status.side_effect = lambda challenge_id: self.status_for(other)
        self.assertEqual(self.adapter.drain(self.stop)['attached'], 1)

    def test_rejects_wrong_context_generation_expiry_and_control_characters(self):
        created = self.awaiting()
        mismatched = self.status_for(created)
        mismatched['context'] = dict(mismatched['context'], chat_id='other')
        self.connector.identity_send_status.return_value = mismatched
        self.assertEqual(self.adapter.drain(self.stop)['invalid'], 1)
        self.binding['generation'] = 2
        self.adapter.drain(self.stop)
        self.binding['generation'] = 1
        self.connector.identity_send_status.return_value = self.status_for(created, message_id='bad\nid')
        self.assertEqual(self.adapter.drain(self.stop)['invalid'], 1)
        self.binding['generation'] = 2
        self.adapter.drain(self.stop)
        self.binding['generation'] = 1
        def expire(challenge_id):
            with self.store.connection() as db:
                db.execute("UPDATE automation_identity_challenges SET expires_at=? WHERE id=?",
                           ('2000-01-01T00:00:00+00:00', challenge_id))
            return self.status_for(created, expires_at=created['expires_at'])
        self.connector.identity_send_status.side_effect = expire
        self.assertEqual(self.adapter.drain(self.stop)['invalid'], 1)
        self.assertEqual(self.service.list('p')[0]['state'], 'awaiting_message')
        self.assertEqual(self.service.list('p')[0]['bindings'], [])

    def test_expired_rows_are_not_polled(self):
        self.awaiting()
        with self.store.connection() as db:
            db.execute("UPDATE automation_identity_challenges SET expires_at='2000-01-01T00:00:00+00:00'")
        self.assertEqual(self.adapter.drain(self.stop)['waiting'], 0)
        self.connector.identity_send_status.assert_not_called()

    def test_fair_cursor_reaches_a_later_registered_challenge(self):
        rows = [self.awaiting() for _ in range(33)]
        target = rows[-1]['challenge_id']
        def status(challenge_id):
            if challenge_id != target:
                raise ConnectorError('not_found', 404)
            return self.status_for(rows[-1])
        self.connector.identity_send_status.side_effect = status
        for _ in range(32):
            self.assertEqual(self.adapter.drain(self.stop)['waiting'], 1)
        self.assertEqual(self.adapter.drain(self.stop)['attached'], 1)
        self.connector.register_identity_send.assert_not_called()

    def test_rebuilt_adapter_attaches_once(self):
        created = self.awaiting()
        self.connector.identity_send_status.return_value = self.status_for(created)
        self.assertEqual(self.adapter.drain(self.stop)['attached'], 1)
        rebuilt = AutomationIdentityReceipts(self.store, self.service, self.connector)
        self.assertEqual(rebuilt.drain(self.stop)['attached'], 0)
        self.assertEqual(self.service.list('p')[0]['state'], 'pending')
        self.assertEqual(self.service.list('p')[0]['message_id'], 'card')

    def test_tick_polls_receipt_before_inbox(self):
        desktop = Desktop.__new__(Desktop)
        desktop.configuration_changed = False
        desktop.connector = Mock()
        desktop.restart_required = False
        desktop._stop = self.stop
        desktop.runtime = SimpleNamespace(ready=True, websocket_origin='ws://127.0.0.1:1234')
        desktop.server = SimpleNamespace(server_address=('127.0.0.1', 8766))
        desktop.configure_runtime = Mock(return_value=True)
        order = []
        desktop.connector.connect.side_effect = lambda *args, **kwargs: order.append('connect')
        desktop.identity_receipts = Mock()
        desktop.identity_receipts.drain.side_effect = lambda stop: order.append('receipt') or {
            'attached': 0, 'waiting': 0, 'invalid': 0, 'error': 1}
        desktop.identity_inbox = Mock()
        desktop.identity_inbox.drain.side_effect = lambda stop: order.append('inbox') or {
            'processed': 0, 'invalid': 0, 'error': 0}
        desktop._tick()
        self.assertEqual(order, ['connect', 'receipt', 'inbox'])
        desktop.identity_inbox.drain.assert_called_once_with(desktop._stop)


class ReceiptJointTests(unittest.TestCase):
    def test_real_hub_status_attaches_on_the_desktop_tick(self):
        hub = hub_fixture.AutomationProducerHTTPTests()
        try:
            hub.setUp()
        finally:
            self._cleanups.extend(hub._cleanups)
            hub._cleanups.clear()
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        store = WorkspaceStore(root / 'workspace.db', profile=True)
        with store.connection() as db:
            db.execute("INSERT INTO projects VALUES('project-a','Project',0,'now','now',0)")
        binding = {'hub_origin': hub.hub.public_origin, 'device_id': hub.device['device_id'],
                   'generation': hub.device['generation']}
        context = {**binding, 'producer_id': 'producer-a', 'channel_account_id': 'channel-a',
                   'app_id': 'app-a', 'chat_id': 'chat-a', 'project_id': 'project-a'}
        calls = []

        class LoopbackTransport:
            def open(self, request, timeout):
                path = request.full_url[len(binding['hub_origin']):]
                calls.append(path)
                mapped = Request('http://127.0.0.1:' + str(hub.server.server_port) + path,
                                 data=request.data, headers=dict(request.header_items()), method=request.method)
                return build_opener().open(mapped, timeout=timeout)

        credentials = ConnectorStore(root / 'connector', protector=Protector(), secure_directory=lambda _: None,
                                     api=SimpleNamespace(owner=lambda _: object(), close=lambda _: None))
        credentials.write('credentials.bin', {key: hub.device[key] for key in (
            'device_id', 'generation', 'credential_revision', 'control_token')}, protected=True)
        credentials.write('installation.json', {'installation_id': INSTALL})
        peer = RemotePeer(SimpleNamespace(hub_origin=binding['hub_origin'], issuer=hub.private['issuer']))
        peer.opener = LoopbackTransport()
        connector = RemoteConnector(SimpleNamespace(hub_origin=binding['hub_origin'], issuer=hub.private['issuer']),
                                    credentials, peer=peer, keys=Mock(),
                                    mailbox_sink=RemoteAutomationInbox(store),
                                    tunnel_factory=lambda config: SimpleNamespace(running=True, start=Mock(), close=Mock()))
        connector._tunnel = SimpleNamespace(running=True, start=Mock(), close=Mock())
        service = IdentityService(store, connector.current_binding)
        created = service.create_challenge('project-a', context, lifetime_seconds=300)
        expected = {key: context[key] for key in (
            'producer_id', 'project_id', 'channel_account_id', 'app_id', 'chat_id', 'device_id', 'generation')}
        registered = hub.request('/remote/desktop/identity-send/register', {
            'producer_id': 'producer-a', 'challenge_id': created['challenge_id'], 'nonce': created['nonce'],
            'expires_at': created['expires_at'], 'expected_context': expected})
        self.assertEqual(registered[0], 200, registered[1])
        claimed = hub.request('/remote/producer/identity-send/claim', {'producer_id': 'producer-a'},
                              token=hub.producer_token)
        self.assertIsNotNone(claimed[1]['attempt'], claimed[1])
        resulted = hub.request('/remote/producer/identity-send/result', {
            'producer_id': 'producer-a', 'attempt_id': claimed[1]['attempt']['attempt_id'],
            'state': 'sent', 'message_id': 'card-joint'}, token=hub.producer_token)
        self.assertEqual(resulted[0], 200, resulted[1])
        payload = {'kind': 'feishu_identity_binding', 'project_id': 'project-a',
                   **{key: context[key] for key in ('producer_id', 'channel_account_id', 'app_id', 'chat_id')},
                   'message_id': 'card-joint', 'actor_open_id': 'operator-a',
                   'binding': {'namespace': 'control-everything.identity.v1',
                               'challenge_id': created['challenge_id'], 'nonce': created['nonce']}}
        source = 'feishu:' + hashlib.sha256(json.dumps(
            [context['channel_account_id'], context['app_id']], separators=(',', ':')).encode()).hexdigest()
        RemoteAutomationInbox(store).receive({**binding, 'credential_revision': hub.device['credential_revision']},
            {'id': 'inbox-joint', 'source': source, 'event_id': 'event-joint', 'payload': payload,
             'lease_id': 'lease', 'lease_expires_at': 100})
        receipts = AutomationIdentityReceipts(store, service, connector)
        inbox = AutomationIdentityInbox(store, service, connector.current_binding)
        desktop = Desktop.__new__(Desktop)
        desktop.configuration_changed = False
        desktop.connector = connector
        desktop.restart_required = False
        desktop._stop = threading.Event()
        desktop.runtime = SimpleNamespace(ready=True, websocket_origin='ws://127.0.0.1:1234')
        desktop.server = SimpleNamespace(server_address=('127.0.0.1', 8766))
        desktop.configure_runtime = Mock(return_value=True)
        desktop.identity_receipts = receipts
        desktop.identity_inbox = inbox
        desktop._tick()
        facts = {row['id']: row for row in service.list('project-a')}
        fact = facts[created['challenge_id']]
        self.assertEqual(fact['state'], 'pending')
        self.assertEqual(fact['message_id'], 'card-joint')
        self.assertEqual(len(fact['candidates']), 1)
        self.assertEqual(fact['bindings'], [])
        rebuilt = AutomationIdentityReceipts(store, service, connector)
        self.assertEqual(rebuilt.drain(threading.Event())['attached'], 0)
        missing = service.create_challenge('project-a', context, lifetime_seconds=300)
        self.assertEqual(rebuilt.drain(threading.Event())['waiting'], 1)
        self.assertNotIn('/remote/desktop/identity-send/register', calls)
        self.assertIn('/remote/desktop/identity-send/status', calls)
        later = {row['id']: row for row in service.list('project-a')}
        self.assertEqual(later[missing['challenge_id']]['state'], 'awaiting_message')
