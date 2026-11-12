"""Exercise durable delivery boundaries without GitHub, models, or live messages."""
import copy
from contextlib import closing
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from control_everything.integrations import progress_notifications as monitor


class ProgressNotificationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.config = {'state_dir': str(self.root / 'state'), 'repository': 'example/project',
                       'project_owner': 'example', 'project_number': 1, 'route_identity': 'fixture'}
        self.now = datetime(2026, 11, 12, 1, 0, tzinfo=timezone.utc)
        self.items = [{'id': 'issue:1', 'kind': 'issue', 'number': 1, 'title': 'Example task',
                       'url': 'https://github.com/example/project/issues/1', 'state': 'OPEN',
                       'owners': ['alice'], 'updated_at': self.now.isoformat(), 'status': '开发中'}]
        self.sent = []

    def send(self, body, delivery_uuid, *, deadline=None):
        self.sent.append((body, delivery_uuid))
        return 'om_fixture'

    def execute(self, action='poll', **kwargs):
        return monitor.run(self.config, action, collect=lambda: copy.deepcopy(self.items),
                           send=kwargs.pop('send', self.send), now=kwargs.pop('now', self.now), **kwargs)

    def rows(self):
        with closing(sqlite3.connect(self.root / 'state/progress.sqlite3')) as database:
            return database.execute('SELECT status,body,uuid FROM outbox ORDER BY id').fetchall()

    def test_first_poll_is_a_silent_baseline_and_identical_poll_is_silent(self):
        self.assertEqual(self.execute()['status'], 'baseline')
        self.assertEqual(self.execute()['sent'], 0)
        self.assertEqual(self.sent, [])
        self.assertEqual(self.rows(), [])

    def test_preview_neither_creates_state_nor_sends(self):
        result = self.execute('preview')
        self.assertEqual(result['status'], 'preview')
        self.assertIn('alice', result['message'])
        self.assertFalse((self.root / 'state').exists())
        self.assertEqual(self.sent, [])

    def test_completion_is_durable_and_not_repeated_after_reopening_database(self):
        self.execute()
        self.items[0].update(state='CLOSED', state_reason='COMPLETED', status='已完成')
        self.assertEqual(self.execute()['sent'], 1)
        self.assertEqual(self.execute()['sent'], 0)
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.rows()[0][0], 'sent')

    def test_failed_collection_does_not_consume_snapshot_or_create_delivery(self):
        self.execute()
        def failed():
            raise ValueError('incomplete_page')
        with self.assertRaisesRegex(ValueError, 'incomplete_page'):
            monitor.run(self.config, 'poll', collect=failed, send=self.send, now=self.now)
        self.items[0].update(state='CLOSED', state_reason='COMPLETED')
        self.assertEqual(self.execute()['sent'], 1)

    def test_unknown_send_is_retried_with_same_uuid_only_inside_deduplication_window(self):
        self.execute()
        self.items[0].update(state='CLOSED', state_reason='COMPLETED')
        attempts = []
        def uncertain(body, delivery_uuid, *, deadline=None):
            attempts.append(delivery_uuid)
            raise TimeoutError('fixture')
        self.assertEqual(self.execute(send=uncertain)['unknown'], 1)
        self.assertEqual(self.execute(now=self.now + timedelta(minutes=5))['sent'], 1)
        self.assertEqual(attempts, [self.sent[0][1]])
        self.assertEqual(self.execute()['sent'], 0)

    def test_unknown_send_after_one_hour_is_retained_without_another_post(self):
        self.execute()
        self.items[0].update(state='CLOSED', state_reason='COMPLETED')
        def uncertain(body, delivery_uuid, *, deadline=None):
            raise TimeoutError('fixture')
        self.execute(send=uncertain)
        result = self.execute(now=self.now + timedelta(hours=2))
        self.assertEqual(result['unknown'], 1)
        self.assertEqual(self.sent, [])
        self.assertEqual(self.rows()[0][0], 'unknown')

    def test_pre_send_failure_keeps_delivery_retryable_without_expiring_uuid_window(self):
        self.execute()
        self.items[0].update(state='CLOSED', state_reason='COMPLETED')
        def unavailable(body, delivery_uuid, *, deadline=None):
            raise monitor.NotSent('token_unavailable')
        self.assertEqual(self.execute(send=unavailable)['pending'], 1)
        self.assertEqual(self.execute(now=self.now + timedelta(hours=2))['sent'], 1)

    def test_daily_is_sent_once_at_or_after_shanghai_1830(self):
        self.execute()
        before = datetime(2026, 11, 12, 10, 29, tzinfo=timezone.utc)
        self.assertEqual(self.execute(now=before)['sent'], 0)
        due = before + timedelta(minutes=1)
        self.assertEqual(self.execute(now=due)['sent'], 1)
        self.assertEqual(self.execute(now=due + timedelta(minutes=5))['sent'], 0)
        self.assertEqual(self.execute(now=due + timedelta(days=1))['sent'], 1)

    def test_startup_announces_current_progress_once_without_old_completion_events(self):
        self.assertEqual(self.execute('startup')['sent'], 1)
        self.assertEqual(self.execute('startup')['sent'], 0)
        self.assertIn('自动播报已启用', self.sent[0][0])
        self.assertIn('alice', self.sent[0][0])

    def test_route_change_does_not_reuse_an_existing_group_ledger(self):
        self.execute()
        self.config['route_identity'] = 'different_group'
        with self.assertRaisesRegex(ValueError, 'monitor_identity_changed'):
            self.execute()
        self.assertEqual(self.sent, [])

    def test_large_reports_are_split_without_omitting_text(self):
        parts = monitor.split_message('abc\n' * 3000)
        self.assertGreater(len(parts), 1)
        self.assertEqual(''.join(parts), 'abc\n' * 3000)
        self.assertTrue(all(len(part) <= 8000 for part in parts))

    def test_startup_after_daily_time_does_not_send_two_reports(self):
        after = self.now.replace(hour=11)
        self.assertEqual(self.execute('startup', now=after)['sent'], 1)
        self.assertEqual(self.execute(now=after + timedelta(minutes=5))['sent'], 0)

    def test_same_day_report_growth_does_not_send_extra_parts(self):
        after = self.now.replace(hour=11)
        with patch('control_everything.integrations.progress_report.daily', return_value='x' * 7990):
            self.assertEqual(self.execute(now=after)['sent'], 1)
        with patch('control_everything.integrations.progress_report.daily', return_value='x' * 9000):
            self.assertEqual(self.execute(now=after + timedelta(minutes=5))['sent'], 0)

    def test_process_death_after_claim_recovers_with_original_uuid(self):
        self.execute()
        self.items[0].update(state='CLOSED', state_reason='COMPLETED')
        script = (
            'import json,os,sys; from datetime import datetime; '
            'from control_everything.integrations.progress_notifications import run; '
            'config,items,now=json.loads(sys.argv[1]); '
            'run(config,"poll",collect=lambda:items,send=lambda *args,**kwargs:os._exit(9),now=datetime.fromisoformat(now))'
        )
        result = subprocess.run([sys.executable, '-B', '-c', script,
                                 json.dumps([self.config, self.items, self.now.isoformat()])], capture_output=True)
        self.assertEqual(result.returncode, 9, result.stderr)
        claimed_uuid = self.rows()[0][2]
        self.assertEqual(self.execute(now=self.now + timedelta(minutes=5))['sent'], 1)
        self.assertEqual(self.sent[0][1], claimed_uuid)

    def test_late_worker_failure_cannot_undo_another_workers_confirmed_receipt(self):
        for error in (monitor.NotSent('fixture'), TimeoutError('fixture')):
            with self.subTest(error=type(error).__name__):
                self.execute()
                self.items[0].update(state='CLOSED', state_reason='COMPLETED')
                def late_failure(body, delivery_uuid, *, deadline=None):
                    with closing(sqlite3.connect(self.root / 'state/progress.sqlite3')) as connection:
                        connection.execute("UPDATE outbox SET status='sent',message_id='om_other_worker',last_attempt=last_attempt+300")
                        connection.commit()
                    raise error
                result = self.execute(send=late_failure)
                self.assertEqual((result['pending'], result['unknown']), (0, 0))
                self.assertEqual(self.rows()[0][0], 'sent')
                self.items[0].update(state='OPEN')
                self.execute()


if __name__ == '__main__':
    unittest.main()
