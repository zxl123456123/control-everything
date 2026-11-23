import tempfile
from pathlib import Path
import unittest
from unittest.mock import Mock
import threading
from types import SimpleNamespace
from urllib.request import build_opener, Request

from control_everything.workspace.store import WorkspaceStore
from control_everything.workspace.automation_remote_inbox import RemoteAutomationInbox


class ActualHTTPCallerTests(unittest.TestCase):
    def run_receipt(self, lose_ack):
        from control_everything.http.remote_hub import build_server
        from control_everything.http.desktop import Desktop
        from control_everything.integrations.remote_connector import RemoteConnector, RemotePeer, ConnectorStore
        from control_everything.integrations.remote_hub.automation_mailbox import AutomationMailbox
        from .test_remote_hub_support import service, bind, INSTALL
        from .test_remote_connector import Protector
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            hub = service(root / 'hub.db')
            device = bind(hub)
            received = AutomationMailbox(hub.store).receive(device['device_id'], device['generation'], 's', 'e', {'decision': 'yes'})
            server = build_server(('127.0.0.1', 0), hub)
            thread = threading.Thread(target=server.serve_forever, kwargs={'poll_interval': .01})
            thread.start()
            try:
                store = ConnectorStore(root / 'private', protector=Protector(), secure_directory=lambda _: None,
                                       api=SimpleNamespace(owner=lambda _: object(), close=lambda _: None))
                credential = {key: device[key] for key in ('device_id', 'generation', 'credential_revision', 'control_token')}
                store.write('credentials.bin', credential, protected=True)
                store.write('installation.json', {'installation_id': INSTALL})
                config = SimpleNamespace(hub_origin='https://app.example.test', issuer='https://id.example.test/realms/test')
                local = WorkspaceStore(root / 'local.db', profile=True)
                def business_facts():
                    with local.connection() as db:
                        tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
                                  if row[0] != 'automation_remote_inbox']
                        return {name: [tuple(row) for row in db.execute('SELECT * FROM "' + name + '" ORDER BY rowid')]
                                for name in tables}
                before = business_facts()
                calls = []
                lost = [False]
                class LoopbackTransport:
                    def open(self, request, timeout):
                        path = request.full_url[len(config.hub_origin):]
                        calls.append(path)
                        if path.endswith('/automation/ack'):
                            with local.connection() as db:
                                self_test.assertEqual(db.execute('SELECT state FROM automation_remote_inbox').fetchone()[0], 'pending_validation')
                        mapped = Request('http://127.0.0.1:' + str(server.server_port) + path,
                                         data=request.data, headers=dict(request.header_items()), method=request.method)
                        response = build_opener().open(mapped, timeout=timeout)
                        if lose_ack and path.endswith('/automation/ack') and not lost[0]:
                            lost[0] = True
                            response.read()
                            response.close()
                            raise OSError('synthetic response lost after server commit')
                        return response
                self_test = self
                def caller():
                    peer = RemotePeer(config)
                    peer.opener = LoopbackTransport()
                    connector = RemoteConnector(config, store, peer=peer, keys=Mock(), mailbox_sink=RemoteAutomationInbox(local))
                    connector._tunnel = SimpleNamespace(running=True, close=Mock())
                    runtime = SimpleNamespace(ready=True, websocket_origin='ws://127.0.0.1:12345')
                    desktop_server = Mock()
                    desktop_server.server_address = ('127.0.0.1', 8766)
                    desktop = Desktop(desktop_server, runtime, connector)
                    desktop.configure_runtime = lambda: True
                    return desktop
                desktop = caller()
                desktop.tick()
                if lose_ack:
                    with local.connection() as db:
                        self.assertEqual(db.execute('SELECT ack_state FROM automation_remote_inbox').fetchone()[0], 'pending')
                    local = WorkspaceStore(root / 'local.db', profile=True)
                    desktop = caller()
                    desktop.tick()
                    self.assertEqual(calls.count('/remote/desktop/automation/claim'), 1)
                    self.assertEqual(calls.count('/remote/desktop/automation/ack'), 2)
                with local.connection() as db:
                    row = db.execute('SELECT * FROM automation_remote_inbox').fetchone()
                    self.assertEqual(row['message_id'], received['id'])
                    self.assertEqual(row['ack_state'], 'acknowledged')
                self.assertEqual(business_facts(), before)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(2)

    def test_actual_http_desktop_receipt(self):
        self.run_receipt(False)

    def test_actual_http_ack_response_loss_and_reopen(self):
        self.run_receipt(True)


class DurableInboxTests(unittest.TestCase):
    def test_revision_and_generation_do_not_reuse_old_ack_authority(self):
        with tempfile.TemporaryDirectory() as directory:
            inbox = RemoteAutomationInbox(WorkspaceStore(Path(directory) / 'db', profile=True))
            binding = dict(hub_origin='https://hub.example.test', device_id='d', generation=1, credential_revision=1)
            envelope = dict(id='m', source='s', event_id='e', payload={}, lease_id='l', lease_expires_at=0.)
            inbox.receive(binding, envelope)
            revised = {**binding, 'credential_revision': 2}
            self.assertIsNone(inbox.pending_ack(revised))
            inbox.receive(revised, {**envelope, 'lease_id': 'new'})
            self.assertEqual(inbox.pending_ack(revised)['lease_id'], 'new')
            replaced = {**revised, 'generation': 2}
            self.assertIsNone(inbox.pending_ack(replaced))
            with self.assertRaisesRegex(ValueError, 'conflict'):
                inbox.receive(replaced, envelope)

    def test_desktop_close_still_cleans_up_after_worker_timeout(self):
        from control_everything.http.desktop import Desktop
        from control_everything.integrations.remote_connector import ConnectorError
        server, runtime, connector = Mock(), Mock(), Mock()
        server.desktop_account = None
        desktop = Desktop(server, runtime, connector)
        desktop._worker = Mock()
        desktop._worker.is_alive.return_value = True
        with self.assertRaisesRegex(ConnectorError, 'cleanup_unverified'):
            desktop.close()
        connector.close.assert_called_once()
        runtime.close.assert_called_once()
        server.server_close.assert_called_once()

    def test_desktop_close_rechecks_worker_after_connector_cleanup(self):
        from control_everything.http.desktop import Desktop
        server, runtime, connector = Mock(), Mock(), Mock()
        server.desktop_account = None
        desktop = Desktop(server, runtime, connector)
        desktop._worker = Mock()
        desktop._worker.is_alive.return_value = True
        connector.close.side_effect = lambda: setattr(desktop._worker.is_alive, 'return_value', False)
        desktop.close()
        runtime.close.assert_called_once()
        server.server_close.assert_called_once()

    def test_commit_reopen_dedup_conflict_and_precise_ack(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'workspace.db'
            binding = dict(hub_origin='https://hub.example.test', device_id='d', generation=1,
                           credential_revision=1)
            envelope = dict(id='m', source='s', event_id='e', payload={'text': 'hello'},
                            lease_id='lease1', lease_expires_at=100.)
            inbox = RemoteAutomationInbox(WorkspaceStore(path, profile=True))
            self.assertFalse(inbox.receive(binding, envelope)['duplicate'])
            inbox = RemoteAutomationInbox(WorkspaceStore(path, profile=True))
            self.assertEqual(inbox.pending_ack(binding), {'message_id': 'm', 'lease_id': 'lease1'})
            self.assertTrue(inbox.receive(binding, envelope)['duplicate'])
            with self.assertRaises(ValueError):
                inbox.receive(binding, {**envelope, 'payload': {'text': 'changed'}})
            inbox.acknowledge(binding, 'm', 'wrong')
            self.assertIsNotNone(inbox.pending_ack(binding))
            inbox.expire_lease(binding, 'm', 'lease1')
            self.assertIsNone(inbox.pending_ack(binding))
            inbox.receive(binding, {**envelope, 'lease_id': 'lease2'})
            inbox.acknowledge(binding, 'm', 'lease2')
            self.assertIsNone(inbox.pending_ack(binding))
            with inbox.store.connection() as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM automation_remote_inbox').fetchone()[0], 1)
                self.assertEqual(db.execute('SELECT state FROM automation_remote_inbox').fetchone()[0], 'pending_validation')
