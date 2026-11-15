"""Synthetic transport receipts exercise real local SQLite identity facts."""
import hashlib
import json
import sqlite3
import threading
import unittest
from unittest.mock import patch, Mock
from types import SimpleNamespace

from tests.backend import test_automation_identities as identity_fixtures
from control_everything.workspace.store import WorkspaceStore
from control_everything.workspace.automation_identities import IdentityService
from control_everything.workspace.automation_identity_inbox import AutomationIdentityInbox
from control_everything.workspace.automation_remote_inbox import RemoteAutomationInbox


class IdentityInboxTests(unittest.TestCase):
    challenge = identity_fixtures.IdentityTests.challenge
    def setUp(self):
        identity_fixtures.IdentityTests.setUp(self)
        self.adapter = AutomationIdentityInbox(self.store, self.service, lambda: dict(self.binding))
        self.stop = threading.Event()

    def receipt(self, challenge, event='event', **changes):
        payload = {'kind':'feishu_identity_binding','project_id':'p',
            **{k:self.context[k] for k in ('producer_id','channel_account_id','app_id','chat_id')},
            'message_id':'card','actor_open_id':'user',
            'binding':{'namespace':'control-everything.identity.v1','challenge_id':challenge['challenge_id'],'nonce':challenge['nonce']}}
        payload.update(changes)
        binding = {**self.binding,'credential_revision':1}
        envelope = {'id':'inbox-'+event,'source':'feishu:'+hashlib.sha256(json.dumps(['account','app'],separators=(',', ':')).encode()).hexdigest(),
            'event_id':event,'payload':payload,'lease_id':'lease','lease_expires_at':100}
        RemoteAutomationInbox(self.store).receive(binding,envelope)
        return binding,envelope

    def test_reopen_and_confirmed_success_excluded(self):
        c = self.challenge()
        binding,e = self.receipt(c)
        RemoteAutomationInbox(self.store).acknowledge(binding,e['id'],'lease')
        self.assertEqual(self.adapter.drain(self.stop),dict(processed=1,invalid=0,error=0))
        candidate = self.service.list('p')[0]['candidates'][0]
        self.service.confirm('p',candidate['id'])
        store = WorkspaceStore(self.store.path,profile=True)
        reopened = AutomationIdentityInbox(store,IdentityService(store,lambda:dict(self.binding)),lambda:dict(self.binding))
        self.assertEqual(reopened.drain(self.stop),dict(processed=0,invalid=0,error=0))

    def test_late_attach_and_fair_batches(self):
        c = self.service.create_challenge('p',self.context)
        for n in range(33):
            self.receipt(c,str(n),kind='wrong')
        self.receipt(c,'valid')
        self.assertEqual(self.adapter.drain(self.stop)['invalid'],32)
        self.assertEqual(self.adapter.drain(self.stop)['invalid'],2)
        self.service.attach_message('p',c['challenge_id'],'card')
        self.adapter.drain(self.stop)
        self.assertEqual(self.adapter.drain(self.stop)['processed'],1)

    def test_database_failure_retries_and_scope_changes(self):
        c = self.challenge()
        self.receipt(c)
        with patch.object(self.service,'receive_candidate',side_effect=sqlite3.OperationalError('busy')):
            self.assertEqual(self.adapter.drain(self.stop)['error'],1)
        self.binding['generation'] = 2
        self.assertEqual(self.adapter.drain(self.stop)['processed'],0)
        self.binding['generation'] = 1
        self.assertEqual(self.adapter.drain(self.stop)['processed'],1)

    def test_real_store_conversion_keeps_desktop_tick_alive(self):
        from control_everything.http.desktop import Desktop
        c = self.challenge()
        self.receipt(c)
        desktop = Desktop.__new__(Desktop)
        desktop.configuration_changed = False
        desktop.connector = Mock()
        desktop.restart_required = False
        desktop._stop = self.stop
        desktop.runtime = SimpleNamespace(ready=True, websocket_origin='ws://localhost:1234')
        desktop.server = SimpleNamespace(server_address=('localhost',8766))
        desktop.configure_runtime = Mock(return_value=True)
        desktop.identity_inbox = self.adapter
        def failing_receive(*args):
            with self.store.connection() as db:
                db.execute('SELECT * FROM missing_identity_test_table')
        with patch.object(self.service, 'receive_candidate', side_effect=failing_receive):
            desktop._tick()
        self.assertEqual(desktop.identity_inbox_result, dict(processed=0, invalid=0, error=1))
        self.assertEqual(self.adapter._cursor, ('', ''))
        desktop._tick()
        self.assertEqual(desktop.identity_inbox_result, dict(processed=1, invalid=0, error=0))
        self.assertEqual(len(self.service.list('p')[0]['candidates']), 1)

    def test_stop_and_bad_source(self):
        c = self.challenge()
        self.receipt(c)
        with self.store.connection() as db:
            db.execute("UPDATE automation_remote_inbox SET source='wrong'")
        self.stop.set()
        self.assertEqual(self.adapter.drain(self.stop)['invalid'],0)
        self.stop.clear()
        self.assertEqual(self.adapter.drain(self.stop)['invalid'],1)


class DesktopIdentityTickTests(unittest.TestCase):
    def test_tick_connect_returns_before_drain_and_configuration_guard(self):
        from control_everything.http.desktop import Desktop
        desktop = Desktop.__new__(Desktop)
        desktop.configuration_changed = True
        desktop.connector = Mock()
        desktop.restart_required = False
        desktop._stop = threading.Event()
        desktop.runtime = SimpleNamespace(ready=True,websocket_origin='ws://localhost:1234')
        desktop.server = SimpleNamespace(server_address=('localhost',8766))
        desktop.configure_runtime = Mock(return_value=True)
        desktop.identity_inbox = Mock()
        desktop._tick()
        desktop.connector.connect.assert_not_called()
        desktop.configuration_changed = False
        lock = threading.Lock()
        def connect(*args, **kwargs):
            with lock:
                pass
        desktop.connector.connect.side_effect = connect
        def drain(stop):
            self.assertTrue(lock.acquire(blocking=False))
            lock.release()
        desktop.identity_inbox.drain.side_effect = drain
        desktop._tick()
        desktop.identity_inbox.drain.assert_called_once_with(desktop._stop)


if __name__ == '__main__':
    unittest.main()
