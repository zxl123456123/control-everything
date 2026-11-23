"""Durable transport only: messages survive retries without granting task authority."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from control_everything.integrations.remote_hub.automation_mailbox import AutomationMailbox
from control_everything.integrations.remote_hub.identity import HubError
from control_everything.integrations.remote_hub.store import RemoteHubStore
from control_everything.integrations.remote_hub import store as hub_store
from .test_remote_hub_support import A, B, bind, complete, recovery, service


class AutomationMailboxTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / 'hub.db'
        self.hub = service(self.path)
        self.now = [1000]
        self.hub.store.clock = lambda: self.now[0]
        self.device = bind(self.hub)
        self.mailbox = AutomationMailbox(self.hub.store)
        self.token = self.device['control_token']
        self.payload = {'kind': 'decision', 'task_id': 'task-a', 'decision_id': 'decision-a'}

    def receive(self, event_id='event-a', payload=None):
        return self.mailbox.receive(self.device['device_id'], self.device['generation'],
                                    'feishu:test-app', event_id, self.payload if payload is None else payload)

    def test_receive_survives_reopen_and_equivalent_json_does_not_duplicate(self):
        first = self.receive()
        self.mailbox = AutomationMailbox(RemoteHubStore(self.path))
        second = self.receive(payload=dict(reversed(list(self.payload.items()))))
        self.assertEqual(second, first)
        self.assertEqual(first['state'], 'pending')
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM automation_inbox').fetchone()[0], 1)

    def test_offline_receive_duplicate_claim_and_ack_survive_restart(self):
        self.hub.store.update_online(self.hub.store.authenticate_control(self.token), self.token, False)
        first = self.receive()
        self.assertEqual(self.receive(), first)
        mailbox = AutomationMailbox(RemoteHubStore(self.path, clock=lambda: self.now[0]))
        claimed = mailbox.claim(self.token)
        self.assertEqual((claimed['id'], claimed['payload']), (first['id'], self.payload))
        self.assertIsNone(mailbox.claim(self.token))
        self.assertEqual(mailbox.acknowledge(self.token, first['id'], claimed['lease_id']),
                         {'id': first['id'], 'state': 'acknowledged'})
        reopened = AutomationMailbox(RemoteHubStore(self.path, clock=lambda: self.now[0]))
        self.assertEqual(reopened.acknowledge(self.token, first['id'], claimed['lease_id']),
                         {'id': first['id'], 'state': 'acknowledged'})
        self.assertIsNone(reopened.claim(self.token))
        self.assertEqual(self.receive()['state'], 'acknowledged')

    def test_duplicate_id_with_changed_content_or_destination_is_rejected(self):
        first = self.receive()
        with self.assertRaises(HubError) as changed:
            self.receive(payload={**self.payload, 'task_id': 'other-task'})
        self.assertEqual(changed.exception.code, 'mailbox_event_conflict')
        other = bind(self.hub, identity=B)
        with self.assertRaises(HubError):
            self.mailbox.receive(other['device_id'], other['generation'], 'feishu:test-app', 'event-a', self.payload)
        self.assertEqual(self.mailbox.claim(self.token)['id'], first['id'])
        self.assertIsNone(self.mailbox.claim(other['control_token']))

    def test_concurrent_delivery_and_claim_have_one_winner(self):
        with ThreadPoolExecutor(4) as workers:
            received = list(workers.map(lambda _: self.receive(), range(8)))
        self.assertEqual(len({item['id'] for item in received}), 1)
        with ThreadPoolExecutor(4) as workers:
            claimed = list(workers.map(lambda _: self.mailbox.claim(self.token), range(4)))
        self.assertEqual(sum(item is not None for item in claimed), 1)

    def test_expired_lease_replays_same_message_and_rejects_old_ack(self):
        message = self.receive()
        old = self.mailbox.claim(self.token)
        self.now[0] = old['lease_expires_at'] + 1
        with self.assertRaises(HubError):
            self.mailbox.acknowledge(self.token, message['id'], old['lease_id'])
        current = self.mailbox.claim(self.token)
        self.assertEqual(current['id'], old['id'])
        self.assertNotEqual(current['lease_id'], old['lease_id'])
        with self.assertRaises(HubError):
            self.mailbox.acknowledge(self.token, message['id'], old['lease_id'])
        self.mailbox.acknowledge(self.token, message['id'], current['lease_id'])

    def test_revocation_and_disabled_members_block_read_and_ack(self):
        message = self.receive()
        claim = self.mailbox.claim(self.token)
        self.hub.store.set_member(A, 'disabled')
        with self.assertRaises(HubError):
            self.mailbox.claim(self.token)
        with self.assertRaises(HubError):
            self.mailbox.acknowledge(self.token, message['id'], claim['lease_id'])
        self.hub.store.set_member(A)
        self.hub.store.mark_revoking(self.device['device_id'])
        reopened = AutomationMailbox(RemoteHubStore(self.path))
        with self.assertRaises(HubError) as denied:
            reopened.claim(self.token)
        self.assertEqual(denied.exception.code, 'invalid_control_token')
        with self.assertRaises(HubError):
            self.receive('event-b')

    def test_rotated_credential_invalidates_lease_and_can_reclaim(self):
        self.receive()
        old = self.mailbox.claim(self.token)
        rotated = complete(self.hub, A, recovery(self.hub, self.device))['control_token']
        with self.assertRaises(HubError):
            self.mailbox.claim(self.token)
        with self.assertRaises(HubError):
            self.mailbox.acknowledge(rotated, old['id'], old['lease_id'])
        new = self.mailbox.claim(rotated)
        self.assertEqual(new['id'], old['id'])
        self.assertNotEqual(new['lease_id'], old['lease_id'])

    def test_wrong_generation_and_oversized_payload_are_rejected(self):
        with self.assertRaises(HubError):
            self.mailbox.receive(self.device['device_id'], self.device['generation'] + 1,
                                  'feishu:test-app', 'event-a', self.payload)
        for payload in ({'text': 'a' * 65537}, {'value': float('nan')}, ['not-an-envelope']):
            with self.subTest(payload_type=type(payload).__name__), self.assertRaises(HubError):
                self.receive(payload=payload)
        self.assertIsNone(self.mailbox.claim(self.token))

    def test_foreign_device_cannot_ack_even_with_message_and_lease_ids(self):
        self.receive()
        claimed = self.mailbox.claim(self.token)
        foreign = bind(self.hub, identity=B)
        with self.assertRaises(HubError):
            self.mailbox.acknowledge(foreign['control_token'], claimed['id'], claimed['lease_id'])
        self.assertEqual(self.receive()['state'], 'pending')

    def test_new_device_generation_cannot_claim_or_ack_old_messages(self):
        self.receive()
        claimed = self.mailbox.claim(self.token)
        with self.hub.store.transaction() as db:
            db.execute('UPDATE devices SET generation=generation+1 WHERE device_id=?', (self.device['device_id'],))
        self.assertIsNone(self.mailbox.claim(self.token))
        with self.assertRaises(HubError):
            self.mailbox.acknowledge(self.token, claimed['id'], claimed['lease_id'])

    def test_storage_failure_is_not_reported_as_received(self):
        with self.hub.store.transaction() as db:
            db.execute("CREATE TRIGGER reject_inbox BEFORE INSERT ON automation_inbox "
                       "BEGIN SELECT RAISE(ABORT, 'synthetic storage failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.receive()
        with self.hub.store.transaction() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM automation_inbox').fetchone()[0], 0)
            db.execute('DROP TRIGGER reject_inbox')
        self.assertEqual(self.receive()['state'], 'pending')

    def test_v3_migration_preserves_devices_and_pre_migration_backup(self):
        with self.hub.store.transaction() as db:
            db.execute('DROP TABLE automation_inbox')
            db.execute('UPDATE schema_version SET version=3')
            before = [dict(row) for row in db.execute('SELECT * FROM devices')]
        migrated = RemoteHubStore(self.path)
        backup = Path(str(self.path) + hub_store.MAILBOX_BACKUP_SUFFIX)
        backup_bytes = backup.read_bytes()
        with closing(sqlite3.connect(backup)) as db:
            db.row_factory = sqlite3.Row
            self.assertEqual(db.execute('SELECT version FROM schema_version').fetchone()[0], 3)
            self.assertEqual([dict(row) for row in db.execute('SELECT * FROM devices')], before)
            self.assertIsNone(db.execute("SELECT name FROM sqlite_master WHERE name='automation_inbox'").fetchone())
        with migrated.transaction() as db:
            self.assertEqual(db.execute('SELECT version FROM schema_version').fetchone()[0], 4)
            self.assertEqual([dict(row) for row in db.execute('SELECT * FROM devices')], before)
        AutomationMailbox(migrated).receive(self.device['device_id'], self.device['generation'],
                                            'feishu:test-app', 'event-a', self.payload)
        RemoteHubStore(self.path)
        self.assertEqual(backup.read_bytes(), backup_bytes)
        # The backup is a usable old-schema restore source, not just an existing file.
        restored_path = self.path.with_name('restored.db')
        restored_path.write_bytes(backup_bytes)
        restored = RemoteHubStore(restored_path)
        self.assertEqual(restored.authenticate_control(self.token)['device_id'], self.device['device_id'])

    def test_migration_failure_rolls_back_schema_and_keeps_backup(self):
        with self.hub.store.transaction() as db:
            db.execute('DROP TABLE automation_inbox')
            db.execute('UPDATE schema_version SET version=3')
        with patch.object(hub_store, '_INDEXES', (*hub_store._INDEXES[:2], 'INVALID INDEX SQL')):
            with self.assertRaises(sqlite3.OperationalError):
                RemoteHubStore(self.path)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT version FROM schema_version').fetchone()[0], 3)
            self.assertIsNone(db.execute("SELECT name FROM sqlite_master WHERE name='automation_inbox'").fetchone())
        self.assertTrue(Path(str(self.path) + hub_store.MAILBOX_BACKUP_SUFFIX).is_file())
        migrated = RemoteHubStore(self.path)
        self.assertEqual(migrated.authenticate_control(self.token)['device_id'], self.device['device_id'])
