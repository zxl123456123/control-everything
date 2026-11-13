"""Persist authentic deliveries before ack; never call GitHub or Feishu in these tests."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid

from control_everything.integrations import github_event_queue as queue
from control_everything.integrations.progress_feishu import NotSent


class GitHubEventQueueTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.config = {'state_dir': str(self.root / 'state'), 'repository': 'example/project',
                       'repository_id': 42, 'route_identity': 'fixed-route'}
        self.secret = b'fixture-webhook-secret-not-a-real-key-' * 2
        self.delivery = str(uuid.uuid4())
        self.payload = {'repository': {'full_name': 'example/project', 'id': 42},
                        'action': 'closed', 'unused': 'raw-private-field-must-not-be-stored'}
        self.body = json.dumps(self.payload, ensure_ascii=False).encode()
        self.now = 10000.0
        self.sent = []

    def signature(self, body):
        return 'sha256=' + hmac.new(self.secret, body, hashlib.sha256).hexdigest()

    def accept(self, *, delivery=None, event='issues', body=None, config=None):
        body = self.body if body is None else body
        return queue.accept_event(config or self.config, self.secret, delivery or self.delivery,
                                  event, body, self.signature(body))

    def rows(self, query, parameters=()):
        with closing(sqlite3.connect(self.root / 'state/progress.sqlite3')) as database:
            return database.execute(query, parameters).fetchall()

    def sender(self, body, delivery_uuid, *, deadline=None):
        self.sent.append((body, delivery_uuid, deadline))
        return 'om_fixture'

    def test_official_github_hmac_test_vector(self):
        # GitHub's published vector predates our stronger public secret-length requirement.
        queue._verify_signature(b"It's a Secret to Everybody", b'Hello, World!',
            'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17')
        with self.assertRaises(PermissionError):
            queue._verify_signature(b"It's a Secret to Everybody", b'Hello, World?',
                'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17')

    def test_raw_unicode_bytes_are_verified_before_parsing_or_writing(self):
        body = json.dumps({**self.payload, 'title': '中文更新'}, ensure_ascii=False).encode()
        with patch.object(queue, 'render_event', return_value='已验证摘要'):
            self.assertEqual(self.accept(body=body)['status'], 'accepted')
        with self.assertRaises(PermissionError):
            queue.accept_event(self.config, self.secret, str(uuid.uuid4()), 'issues',
                               body + b' ', self.signature(body))
        self.assertEqual(len(self.rows('SELECT delivery FROM webhook_receipts')), 1)

    def test_missing_or_bad_signatures_never_create_state(self):
        for signature in ('', None, 'sha1=fixture', 'sha256=' + '0' * 64):
            with self.subTest(signature=signature), self.assertRaises(PermissionError):
                queue.accept_event(self.config, self.secret, self.delivery, 'issues', b'not json', signature)
        self.assertFalse((self.root / 'state').exists())

    def test_short_secret_or_invalid_delivery_is_rejected_without_state(self):
        with self.assertRaises(ValueError):
            queue.accept_event(self.config, b'short', self.delivery, 'issues', self.body, self.signature(self.body))
        with self.assertRaises(ValueError):
            self.accept(delivery='not-a-uuid')
        self.assertFalse((self.root / 'state').exists())

    def test_json_object_and_both_fixed_repository_identifiers_are_required(self):
        bodies = [b'[]', b'null', b'"text"', b'{',
                  json.dumps({**self.payload, 'repository': {'full_name': 'other/project', 'id': 42}}).encode(),
                  json.dumps({**self.payload, 'repository': {'full_name': 'example/project', 'id': 43}}).encode(),
                  json.dumps({**self.payload, 'repository': {'full_name': 'example/project', 'id': True}}).encode()]
        for body in bodies:
            with self.subTest(body=body), self.assertRaises(ValueError):
                self.accept(body=body)
        self.assertFalse((self.root / 'state').exists())

    def test_accept_is_durable_but_does_not_send_and_stores_no_raw_payload(self):
        with patch.object(queue, 'render_event', return_value='安全摘要'):
            self.assertEqual(self.accept()['status'], 'accepted')
        self.assertEqual(self.rows('SELECT status,body FROM outbox'), [('pending', '安全摘要')])
        self.assertNotIn(self.payload['unused'].encode(), (self.root / 'state/progress.sqlite3').read_bytes())
        self.assertNotIn(self.secret, (self.root / 'state/progress.sqlite3').read_bytes())
        self.assertEqual(self.sent, [])
        self.assertEqual(queue.drain(self.config, self.sender, clock=lambda: self.now)['sent'], 1)
        self.assertEqual(queue.drain(self.config, self.sender, clock=lambda: self.now + 1)['sent'], 0)
        self.assertEqual(len(self.sent), 1)
        self.assertIsNone(queue.retry_delay(self.config, self.now))

    def test_duplicate_delivery_binds_original_bytes_and_event(self):
        with patch.object(queue, 'render_event', return_value='摘要'):
            self.accept()
            self.assertEqual(self.accept()['status'], 'duplicate')
            with self.assertRaisesRegex(ValueError, 'delivery_payload_changed'):
                self.accept(event='push')
            with self.assertRaisesRegex(ValueError, 'delivery_payload_changed'):
                self.accept(body=self.body + b' ')
        self.assertEqual(len(self.rows('SELECT id FROM outbox')), 1)

    def test_receipt_time_and_internal_identity_stay_fixed_across_redelivery_and_send_retry(self):
        received = datetime(2026, 11, 12, 7, 9, 10, tzinfo=timezone.utc)
        payload = {**self.payload, 'action': 'opened', 'sender': {'login': 'actor'},
                   'issue': {'number': 7, 'title': '修复连接', 'assignees': [],
                             'created_at': '2001-01-01T00:00:00Z', 'updated_at': '2001-01-01T00:00:00Z'}}
        body = json.dumps(payload).encode()
        with patch.object(queue, 'datetime', create=True) as clock:
            clock.now.return_value = received
            self.assertEqual(self.accept(body=body)['status'], 'accepted')
            original = self.rows('SELECT body,uuid FROM outbox')[0]
            self.assertIn('2026-11-12 15:09:10', original[0])
            self.assertIn('北京时间', original[0])
            self.assertNotIn('事件编号：', original[0])
            self.assertNotIn('2001-01-01', original[0])
            clock.now.return_value = received + timedelta(days=1)
            self.assertEqual(self.accept(body=body)['status'], 'duplicate')
        attempted = []
        def disconnected(message, delivery_uuid, *, deadline=None):
            attempted.append((message, delivery_uuid))
            raise TimeoutError('fixture')
        self.assertEqual(queue.drain(self.config, disconnected, clock=lambda: self.now)['unknown'], 1)
        self.assertEqual(queue.drain(self.config, self.sender, clock=lambda: self.now + 121)['sent'], 1)
        self.assertEqual(attempted, [original])
        self.assertEqual(self.sent[0][:2], original)
        self.assertEqual(self.rows('SELECT body,uuid FROM outbox'), [original])

    def test_ping_and_ignored_events_are_recorded_without_messages(self):
        with patch.object(queue, 'render_event', return_value=None) as render:
            self.assertEqual(self.accept(event='ping')['status'], 'ping')
            render.assert_not_called()
            self.assertEqual(self.accept(delivery=str(uuid.uuid4()), event='star')['status'], 'ignored')
        self.assertEqual(self.rows('SELECT outcome FROM webhook_receipts ORDER BY outcome'), [('ignored',), ('ping',)])
        self.assertEqual(self.rows('SELECT id FROM outbox'), [])

    def test_render_failure_does_not_consume_delivery(self):
        with patch.object(queue, 'render_event', side_effect=ValueError('invalid_event')):
            with self.assertRaises(ValueError):
                self.accept()
        with patch.object(queue, 'render_event', return_value='补正摘要'):
            self.assertEqual(self.accept()['status'], 'accepted')

    def test_queue_and_receipt_commit_or_rollback_together(self):
        original = queue._queue
        def fail_after_insert(*args):
            original(*args)
            raise OSError('fixture_disk_error')
        with patch.object(queue, 'render_event', return_value='摘要'), patch.object(queue, '_queue', side_effect=fail_after_insert):
            with self.assertRaises(OSError):
                self.accept()
        self.assertEqual(self.rows('SELECT id FROM outbox'), [])
        self.assertEqual(self.rows('SELECT delivery FROM webhook_receipts'), [])
        with patch.object(queue, 'render_event', return_value='摘要'):
            self.assertEqual(self.accept()['status'], 'accepted')

    def test_same_delivery_concurrently_creates_one_queue_entry(self):
        with patch.object(queue, 'render_event', return_value='摘要'):
            with ThreadPoolExecutor(max_workers=6) as workers:
                outcomes = list(workers.map(lambda _: self.accept()['status'], range(6)))
        self.assertEqual(outcomes.count('accepted'), 1)
        self.assertEqual(outcomes.count('duplicate'), 5)
        self.assertEqual(len(self.rows('SELECT id FROM outbox')), 1)

    def test_changed_repository_or_route_cannot_drain_an_existing_ledger(self):
        with patch.object(queue, 'render_event', return_value='摘要'):
            self.accept()
        for field, value in (('repository', 'other/project'), ('repository_id', 43), ('route_identity', 'other-route')):
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'event_identity_changed'):
                queue.drain({**self.config, field: value}, self.sender, clock=lambda: self.now)
        self.assertEqual(self.sent, [])

    def test_pending_known_not_sent_backs_off_when_another_event_wakes_worker(self):
        with patch.object(queue, 'render_event', return_value='摘要'):
            self.accept()
        calls = []
        def unavailable(*args, **kwargs):
            calls.append(args)
            raise NotSent('token_unavailable')
        self.assertEqual(queue.drain(self.config, unavailable, clock=lambda: self.now)['pending'], 1)
        self.assertEqual(queue.retry_delay(self.config, self.now), 120)
        queue.drain(self.config, unavailable, clock=lambda: self.now + 1)
        self.assertEqual(len(calls), 1)
        self.assertEqual(queue.drain(self.config, self.sender, clock=lambda: self.now + 120)['sent'], 1)

    def test_uncertain_delivery_retries_same_uuid_and_stops_after_window(self):
        with patch.object(queue, 'render_event', return_value='摘要'):
            self.accept()
        def uncertain(*args, **kwargs):
            raise TimeoutError('fixture')
        queue.drain(self.config, uncertain, clock=lambda: self.now)
        original = self.rows('SELECT uuid FROM outbox')[0][0]
        self.assertEqual(queue.retry_delay(self.config, self.now + 60), 60)
        self.assertIsNone(queue.retry_delay(self.config, self.now + 3300))
        self.assertEqual(queue.drain(self.config, self.sender, clock=lambda: self.now + 3400)['unknown'], 1)
        self.assertEqual(self.sent, [])
        self.assertEqual(original, self.rows('SELECT uuid FROM outbox')[0][0])

    def test_uncertain_result_recovers_inside_window_using_original_uuid(self):
        with patch.object(queue, 'render_event', return_value='摘要'):
            self.accept()
        def uncertain(*args, **kwargs):
            raise TimeoutError('fixture')
        queue.drain(self.config, uncertain, clock=lambda: self.now)
        original = self.rows('SELECT uuid FROM outbox')[0][0]
        self.assertEqual(queue.retry_delay(self.config, self.now + 1), 119)
        self.assertEqual(queue.drain(self.config, self.sender, clock=lambda: self.now + 120)['sent'], 1)
        self.assertEqual(self.sent[0][1], original)

    def test_legacy_polling_ledger_cannot_be_consumed_by_event_worker(self):
        with closing(queue._database(self.config['state_dir'])) as database:
            database.execute("INSERT INTO metadata VALUES('identity','legacy-monitor-route')")
            database.commit()
        with self.assertRaisesRegex(ValueError, 'unowned_event_ledger'):
            queue.drain(self.config, self.sender, clock=lambda: self.now)
        self.assertEqual(self.sent, [])

    def test_process_death_after_claim_can_be_recovered_from_persisted_event(self):
        with patch.object(queue, 'render_event', return_value='摘要'):
            self.accept()
        script = ('import json,os,sys; from control_everything.integrations.github_event_queue import drain; '
                  'drain(json.loads(sys.argv[1]),lambda *a,**k:os._exit(9),clock=lambda:10000.0)')
        process = subprocess.run([sys.executable, '-B', '-c', script, json.dumps(self.config)], capture_output=True)
        self.assertEqual(process.returncode, 9, process.stderr)
        original = self.rows('SELECT uuid FROM outbox')[0][0]
        self.assertEqual(queue.retry_delay(self.config, self.now), 120)
        self.assertEqual(queue.drain(self.config, self.sender, clock=lambda: self.now + 121)['sent'], 1)
        self.assertEqual(self.sent[0][1], original)


if __name__ == '__main__':
    unittest.main()
