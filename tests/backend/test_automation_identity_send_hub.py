"""Identity transport uses the real authenticated Hub HTTP boundary."""
from datetime import datetime, timezone
import unittest
import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from unittest.mock import patch

from . import test_automation_producer_http as producer_tests


class IdentitySendTests(unittest.TestCase):
    setUp = producer_tests.AutomationProducerHTTPTests.setUp
    request = producer_tests.AutomationProducerHTTPTests.request
    stop = producer_tests.AutomationProducerHTTPTests.stop

    def registration(self):
        return dict(producer_id='producer-a', challenge_id='b' * 32, nonce='nonce',
                    expires_at=datetime.fromtimestamp(self.hub.store.clock() + 300, timezone.utc).isoformat(),
                    expected_context={k: v for k, v in self.config.items() if k != 'token_sha256'})

    def test_strict_context_expiry_and_auth(self):
        path = '/remote/desktop/identity-send/register'
        body = self.registration()
        for change in ({'chat_id': 'forged'}, {'expires_at': '2026-01-01T00:00:00'},
                       {'expires_at': '2000-01-01T00:00:00+00:00'}):
            self.assertEqual(self.request(path, dict(body, **change))[0], 400)
        self.assertEqual(self.request(path, body, token=self.producer_token)[0], 401)
        from control_everything.integrations.remote_hub.admin import build_service
        self.private['automation_producers'][0]['chat_id'] = 'new-chat'
        self.config_path.write_text(json.dumps(self.private), encoding='utf-8')
        self.hub.__dict__.update(build_service(self.config_path).__dict__)
        self.assertEqual(self.request(path, body)[0], 409)
        with self.hub.store.transaction() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM automation_identity_send').fetchone()[0], 0)

    def test_concurrent_claim_and_restart(self):
        body = self.registration()
        self.assertEqual(self.request('/remote/desktop/identity-send/register', body)[0], 200)
        sender = self.hub.automation_identity_send
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: sender.claim(self.producer_token, {'producer_id': 'producer-a'}), range(2)))
        self.assertEqual(sum(r['attempt'] is not None for r in results), 1)
        from control_everything.integrations.remote_hub.admin import build_service
        self.hub.__dict__.update(build_service(self.config_path).__dict__)
        self.assertIsNone(self.hub.automation_identity_send.claim(self.producer_token, {'producer_id': 'producer-a'})['attempt'])

    def test_same_challenge_cannot_move_to_rotated_context(self):
        body = self.registration()
        path = '/remote/desktop/identity-send/register'
        self.assertEqual(self.request(path, body)[0], 200)
        from control_everything.integrations.remote_hub.admin import build_service
        self.private['automation_producers'][0]['chat_id'] = 'new-chat'
        self.config_path.write_text(json.dumps(self.private), encoding='utf-8')
        self.hub.__dict__.update(build_service(self.config_path).__dict__)
        body['expected_context']['chat_id'] = 'new-chat'
        self.assertEqual(self.request(path, body)[0], 409)

    def test_v4_migration_backup_preserves_inbox(self):
        from control_everything.integrations.remote_hub.store import RemoteHubStore, IDENTITY_SEND_BACKUP_SUFFIX
        path = self.hub.store.path
        with self.hub.store.transaction() as db:
            before = [tuple(row) for row in db.execute('SELECT * FROM automation_inbox')]
            self.assertTrue(before)
            db.execute('DROP TABLE automation_identity_send')
            db.execute('UPDATE schema_version SET version=4')
        store = RemoteHubStore(path)
        with store.transaction() as db:
            self.assertEqual(db.execute('SELECT version FROM schema_version').fetchone()[0], 5)
            self.assertEqual([tuple(row) for row in db.execute('SELECT * FROM automation_inbox')], before)
        with closing(sqlite3.connect(path + IDENTITY_SEND_BACKUP_SUFFIX)) as backup:
            self.assertEqual(backup.execute('SELECT version FROM schema_version').fetchone()[0], 4)
            self.assertEqual(backup.execute('SELECT * FROM automation_inbox').fetchall(), before)

    def test_queued_expiry_never_grants_permission(self):
        body = self.registration()
        path = '/remote/desktop/identity-send/'
        registered = self.request(path + 'register', body)[1]
        now = datetime.fromisoformat(body['expires_at']).timestamp() + 1
        with patch.object(self.hub.store, 'clock', return_value=now):
            self.assertEqual(self.request(path + 'status', {'challenge_id': body['challenge_id']})[1]['state'], 'expired')
            self.assertEqual(self.request(path + 'register', body)[1]['attempt_id'], registered['attempt_id'])
            response = self.request('/remote/producer/identity-send/claim', {'producer_id': 'producer-a'}, token=self.producer_token)
            self.assertEqual(response[:2], (200, {'attempt': None}))

    def test_token_rotation_and_revocation_reject_claim_and_result(self):
        body = self.registration()
        registered = self.request('/remote/desktop/identity-send/register', body)[1]
        claim = {'producer_id': 'producer-a'}
        base = '/remote/producer/identity-send/'
        self.assertEqual(self.request(base + 'claim', claim, token=self.producer_token)[0], 200)
        result = dict(claim, attempt_id=registered['attempt_id'], state='sent', message_id='sdk-id')
        import hashlib
        from control_everything.integrations.remote_hub.admin import build_service
        replacement = 'replacement-producer-' + 'b' * 43
        self.private['automation_producers'][0]['token_sha256'] = hashlib.sha256(replacement.encode()).hexdigest()
        self.config_path.write_text(json.dumps(self.private), encoding='utf-8')
        self.hub.__dict__.update(build_service(self.config_path).__dict__)
        self.assertEqual(self.request(base + 'claim', claim, token=self.producer_token)[0], 401)
        self.assertEqual(self.request(base + 'result', result, token=self.producer_token)[0], 401)
        self.assertEqual(self.request(base + 'claim', claim, token=replacement)[:2], (200, {'attempt': None}))
        self.assertEqual(self.request(base + 'result', result, token=replacement)[0], 409)
        with self.hub.store.transaction() as db:
            db.execute("UPDATE devices SET state='revoked' WHERE device_id=?", (self.device['device_id'],))
        self.assertEqual(self.request(base + 'claim', claim, token=replacement)[0], 409)
        self.assertEqual(self.request(base + 'result', result, token=replacement)[0], 409)

    def test_expiry_rotation_and_member_boundaries(self):
        body = self.registration()
        sender = self.hub.automation_identity_send
        registered = self.request('/remote/desktop/identity-send/register', body)[1]
        claim = {'producer_id': 'producer-a'}
        result = dict(claim, attempt_id=registered['attempt_id'], state='sent', message_id='sdk-id')
        self.assertEqual(self.request('/remote/producer/identity-send/result', result, token=self.producer_token)[0], 409)
        sender.claim(self.producer_token, claim)
        with patch.object(self.hub.store, 'clock', return_value=datetime.fromisoformat(body['expires_at']).timestamp() + 1):
            status = self.request('/remote/desktop/identity-send/status', {'challenge_id': body['challenge_id']})[1]
            self.assertEqual(status['state'], 'unknown')
            self.assertEqual(sender.result(self.producer_token, result)['state'], 'sent')
        from control_everything.integrations.remote_hub.automation_producer import AutomationProducers
        sender.producers = AutomationProducers([dict(self.config, chat_id='rotated')])
        from control_everything.integrations.remote_hub.identity import HubError
        with self.assertRaises(HubError):
            sender.result(self.producer_token, result)
        sender.producers = self.hub.automation_producers
        with self.hub.store.transaction() as db:
            db.execute("UPDATE members SET status='inactive'")
        with self.assertRaises(HubError):
            sender.claim(self.producer_token, claim)

    def test_failed_v4_migration_rolls_back(self):
        from control_everything.integrations.remote_hub import store as store_module
        path = self.hub.store.path
        with self.hub.store.transaction() as db:
            before = [tuple(row) for row in db.execute('SELECT * FROM automation_inbox')]
            db.execute('DROP TABLE automation_identity_send')
            db.execute('UPDATE schema_version SET version=4')
        with patch.dict(store_module._TABLES, automation_identity_send='INVALID DDL'):
            with self.assertRaises(sqlite3.OperationalError):
                store_module.RemoteHubStore(path)
        with closing(sqlite3.connect(path)) as db:
            self.assertEqual(db.execute('SELECT version FROM schema_version').fetchone()[0], 4)
            self.assertEqual(db.execute('SELECT * FROM automation_inbox').fetchall(), before)

    def test_once_and_late_receipt(self):
        body = dict(producer_id='producer-a', challenge_id='a' * 32, nonce='nonce',
                    expires_at=datetime.fromtimestamp(self.hub.store.clock() + 300, timezone.utc).isoformat(),
                    expected_context={k: v for k, v in self.config.items() if k != 'token_sha256'})
        path = '/remote/desktop/identity-send/'
        status, registered, *_ = self.request(path + 'register', body)
        self.assertEqual(status, 200)
        self.assertEqual(self.request(path + 'register', body)[1], registered)
        self.assertEqual(self.request(path + 'register', dict(body, nonce='other'))[0], 409)
        producer = '/remote/producer/identity-send/'
        claim_body = dict(producer_id='producer-a')
        claim = self.request(producer + 'claim', claim_body, token=self.producer_token)[1]['attempt']
        self.assertEqual(claim['attempt_id'], registered['attempt_id'])
        self.assertIsNone(self.request(producer + 'claim', claim_body, token=self.producer_token)[1]['attempt'])
        result = dict(claim_body, attempt_id=claim['attempt_id'], state='unknown')
        self.assertEqual(self.request(producer + 'result', result, token=self.producer_token)[1]['state'], 'unknown')
        result.update(state='sent', message_id='sdk-message')
        self.assertEqual(self.request(producer + 'result', result, token=self.producer_token)[1]['state'], 'sent')
        self.assertEqual(self.request(producer + 'result', dict(result, message_id='other'), token=self.producer_token)[0], 409)


if __name__ == '__main__':
    unittest.main()
