"""No listener or child process: owner, cache generation and schedule contracts."""
from datetime import datetime, timezone, timedelta
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from control_everything.workspace.news_reader import NewsReader
from control_everything.workspace.news_runtime import NewsRuntime, NewsBusy, NewsUnavailable, RevisionConflict
from tests.backend.test_news_settings import body


class Owner:
    def __init__(self, allowed=True):
        self.allowed, self.released = allowed, False
    def acquire(self): return self.allowed
    def release(self): self.released = True


class RuntimeTests(unittest.TestCase):
    def make_reader(self, root, owner=None, clock=None, runner=None):
        reader = NewsReader(root, None, runtime_factory=lambda r: NewsRuntime(r, owner=owner or Owner(), clock=clock, feed_runner=runner))
        self.addCleanup(lambda: reader.close() if not reader.runtime.closed else None)
        return reader

    def test_snapshot_never_fetches_or_writes_and_preserves_old_reader_id(self):
        with tempfile.TemporaryDirectory() as folder:
            reader = self.make_reader(folder)
            self.assertEqual(reader.reader_id, hashlib.sha256(str(Path(folder).resolve()).encode()).hexdigest()[:32])
            self.assertEqual(reader.sample()['sample']['streams']['ai']['items'], [])
            self.assertEqual(list(Path(folder).iterdir()), [])
            reader.close()

    def test_cas_and_replace_failure_do_not_publish(self):
        with tempfile.TemporaryDirectory() as folder:
            reader = self.make_reader(folder)
            first = reader.runtime.save_settings(body(reader.runtime.settings))
            self.assertEqual(first['settings']['revision'], 1)
            with self.assertRaises(RevisionConflict): reader.runtime.save_settings(body({**reader.runtime.settings, 'revision': 0}))
            before = copy.deepcopy(reader.runtime.settings)
            with patch('control_everything.workspace.news_settings.save', side_effect=OSError('disk')):
                with self.assertRaises(OSError): reader.runtime.save_settings(body(before))
            self.assertEqual(reader.runtime.settings, before)
            reader.close()

    def test_non_owner_reads_without_writes_or_start(self):
        with tempfile.TemporaryDirectory() as folder:
            reader = self.make_reader(folder, owner=Owner(False))
            reader.runtime.start()
            self.assertEqual(reader.runtime.snapshot()['owner'], 'owner_elsewhere')
            with self.assertRaises(NewsUnavailable): reader.runtime.save_settings(body(reader.runtime.settings))
            with self.assertRaises(NewsUnavailable): reader.runtime.request_feed()
            self.assertEqual(list(Path(folder).iterdir()), [])
            reader.close()

    def test_invalid_settings_preserved_and_read_only(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'settings.json'
            path.write_bytes(b'{broken')
            reader = self.make_reader(folder)
            self.assertEqual(reader.runtime.snapshot()['reason'], 'settings_invalid')
            with self.assertRaises(NewsUnavailable): reader.runtime.request_feed()
            self.assertEqual(path.read_bytes(), b'{broken')
            # Blocked owner intentionally retained until this simulated process exits.
            with self.assertRaises(NewsUnavailable): reader.close()

    def test_manual_busy_never_queues_and_due_merges(self):
        with tempfile.TemporaryDirectory() as folder:
            now = datetime.fromisoformat('2026-10-25T00:00:00+00:00')
            reader = self.make_reader(folder, clock=lambda: now)
            value = body(reader.runtime.settings)
            value['schedule'].update(enabled=True, interval_minutes=15)
            reader.runtime.save_settings(value)
            reader.runtime.slot = {'id': 'busy'}
            with self.assertRaises(NewsBusy): reader.runtime.request_feed()
            self.assertFalse(reader.runtime.status['pending_due'])
            reader.runtime.tick(now + timedelta(hours=2))
            self.assertTrue(reader.runtime.status['pending_due'])
            self.assertEqual(reader.runtime.status['next_run_at'], '2026-10-25T02:15:00+00:00')
            reader.runtime.tick(now + timedelta(hours=3))
            self.assertTrue(reader.runtime.status['pending_due'])
            value = body(reader.runtime.settings)
            value['schedule']['enabled'] = False
            reader.runtime.save_settings(value)
            self.assertFalse(reader.runtime.status['pending_due'])
            reader.runtime.slot = None
            reader.close()

    def test_display_change_does_not_reanchor_schedule(self):
        with tempfile.TemporaryDirectory() as folder:
            now = datetime.fromisoformat('2026-10-25T00:00:00+00:00')
            reader = self.make_reader(folder, clock=lambda: now)
            value = body(reader.runtime.settings)
            value['schedule'].update(enabled=True, interval_minutes=15)
            reader.runtime.save_settings(value)
            due = reader.runtime.status['next_run_at']
            now += timedelta(minutes=5)
            value = body(reader.runtime.settings)
            value['sources'][0]['name'] = 'Renamed'
            reader.runtime.save_settings(value)
            self.assertEqual(reader.runtime.status['next_run_at'], due)
            reader.close()

    def item(self):
        url = 'https://openai.com/index/sample'
        return {'id': hashlib.sha256(('openai:' + url).encode()).hexdigest()[:24], 'source_id': 'openai',
                'source_name': 'OpenAI', 'title': 'Sample', 'url': url, 'summary': 'Summary',
                'fetched_at': '2026-10-25T00:00:00+00:00', 'content_origin': 'publisher_feed',
                'body_blocks': [{'type': 'p', 'text': 'Summary'}], 'content_kind': 'summary'}

    def test_delayed_article_cannot_write_after_close_or_overwrite_new_owner(self):
        with tempfile.TemporaryDirectory() as folder:
            owner = Owner()
            reader = self.make_reader(folder, owner=owner)
            item = self.item()
            reader.known[item['id']] = item
            entered, resume = threading.Event(), threading.Event()
            outcome = []
            def delayed(item, root, *, commit_cache):
                entered.set()
                self.assertTrue(resume.wait(3))
                outcome.append(commit_cache(item['id'], b'{"old":true}', b'old'))
                return {'reason': 'reader_closed'}
            with patch('control_everything.workspace.news_reader.load_article', side_effect=delayed):
                thread = threading.Thread(target=reader.article, args=(item['id'],))
                thread.start()
                self.assertTrue(entered.wait(3))
                reader.close()
                self.assertTrue(owner.released)
                cache = Path(folder) / 'article-cache'
                cache.mkdir()
                new = cache / (item['id'] + '.json')
                new.write_bytes(b'new-owner')
                resume.set()
                thread.join(3)
            self.assertFalse(thread.is_alive())
            self.assertEqual(outcome, [False])
            self.assertEqual(new.read_bytes(), b'new-owner')
            self.assertFalse(new.with_suffix('.html').exists())
            self.assertTrue(reader.article_lock.acquire(False))
            reader.article_lock.release()
            reader.close()

    def test_close_waits_for_commit_gate_before_owner_release(self):
        with tempfile.TemporaryDirectory() as folder:
            owner = Owner()
            reader = self.make_reader(folder, owner=owner)
            entered, resume = threading.Event(), threading.Event()
            actual = __import__('control_everything.workspace.news_reader', fromlist=['atomic_bytes']).atomic_bytes
            def held(path, data):
                if str(path).endswith('.html'):
                    entered.set()
                    self.assertTrue(resume.wait(3))
                actual(path, data)
            with patch('control_everything.workspace.news_reader.atomic_bytes', side_effect=held):
                commit = threading.Thread(target=reader._commit_article, args=(reader.runtime.owner_generation, 'a'*24, b'{}', b'html'))
                commit.start()
                self.assertTrue(entered.wait(3))
                closed = threading.Thread(target=reader.close)
                closed.start()
                self.assertFalse(owner.released)
                resume.set()
                commit.join(3)
                closed.join(3)
            self.assertFalse(commit.is_alive() or closed.is_alive())
            self.assertTrue(owner.released)

    def test_write_failure_keeps_owner_and_releases_article_lock(self):
        with tempfile.TemporaryDirectory() as folder:
            owner = Owner()
            reader = self.make_reader(folder, owner=owner)
            with patch('control_everything.workspace.news_reader.atomic_bytes', side_effect=OSError('disk')):
                with self.assertRaises(OSError): reader._commit_article(reader.runtime.owner_generation, 'a'*24, b'{}', None)
            with self.assertRaises(NewsUnavailable): reader.close()
            self.assertFalse(owner.released)

    def test_fixed_summary_still_loads_fulltext_custom_summary_never_fetches(self):
        with tempfile.TemporaryDirectory() as folder:
            reader = self.make_reader(folder)
            item = self.item()
            reader.known[item['id']] = item
            with patch('control_everything.workspace.news_reader.load_article', return_value={'content_kind': 'full_text'}) as load:
                self.assertEqual(reader.article(item['id'])['content_kind'], 'full_text')
                load.assert_called_once()
            item = {**item, 'source_id': 'feed_' + 'a'*32, 'url': 'https://example.org/article'}
            item['id'] = hashlib.sha256((item['source_id'] + ':' + item['url']).encode()).hexdigest()[:24]
            reader.known[item['id']] = item
            with patch('control_everything.workspace.news_article._fetch_html') as fetch:
                self.assertEqual(reader.article(item['id'])['reason'], 'unsupported_source')
                fetch.assert_not_called()
            reader.close()

    def test_close_terminal_write_failure_keeps_owner(self):
        with tempfile.TemporaryDirectory() as folder:
            owner = Owner()
            reader = self.make_reader(folder, owner=owner)
            with patch('control_everything.workspace.news_settings.atomic_bytes', side_effect=OSError('disk')):
                with self.assertRaises(OSError): reader.close()
            self.assertFalse(owner.released)

    def test_restart_missed_and_interrupted_merge_once_without_reanchoring(self):
        with tempfile.TemporaryDirectory() as folder:
            now = datetime.fromisoformat('2026-10-25T00:00:00+00:00')
            first = self.make_reader(folder, clock=lambda: now)
            value = body(first.runtime.settings)
            value['schedule'].update(enabled=True, interval_minutes=15)
            first.runtime.save_settings(value)
            first.runtime.status.update(state='running', result=None)
            first.runtime._persist()
            # Simulated crash: preserve persisted running, no real process.
            first.runtime.closed = True
            second = self.make_reader(folder, clock=lambda: now + timedelta(hours=4))
            with patch('control_everything.workspace.news_runtime.threading.Thread'):
                second.runtime.start()
            self.assertEqual(second.runtime.status['result'], 'interrupted')
            self.assertTrue(second.runtime.status['pending_due'])
            with patch.object(second.runtime, '_begin') as begin:
                second.runtime.tick()
                begin.assert_called_once_with('scheduled', 'feed', None)
            self.assertEqual(second.runtime.status['next_run_at'], '2026-10-25T04:15:00+00:00')
            second.runtime.thread = None
            second.close()

    def test_fake_feed_runner_uses_single_slot_and_no_browser_for_manual(self):
        class Runner:
            def __init__(self, *args): pass
            def run(self): return [], 'timeout', True
        with tempfile.TemporaryDirectory() as folder:
            reader = self.make_reader(folder, runner=Runner)
            with patch.object(reader.jobs, 'begin') as browser:
                reader.runtime.request_feed()
                reader.runtime.worker.join(3)
                self.assertIsNone(reader.runtime.slot)
                self.assertEqual(reader.runtime.status['result'], 'failed')
                browser.assert_not_called()
            reader.close()

    def test_cleanup_failure_holds_slot_blocks_next_and_keeps_owner(self):
        class Runner:
            def __init__(self, *args): pass
            def run(self): return [], 'timeout', False
        with tempfile.TemporaryDirectory() as folder:
            owner = Owner()
            reader = self.make_reader(folder, owner=owner, runner=Runner)
            reader.runtime.request_feed()
            reader.runtime.worker.join(3)
            self.assertTrue(reader.runtime.blocked)
            self.assertIsNotNone(reader.runtime.slot)
            with self.assertRaises(NewsUnavailable): reader.runtime.request_feed()
            with self.assertRaises(NewsUnavailable): reader.close()
            self.assertFalse(owner.released)

    def test_feed_failure_disable_and_profiles_preserve_old_items(self):
        with tempfile.TemporaryDirectory() as folder:
            a = self.make_reader(Path(folder) / 'a')
            b = self.make_reader(Path(folder) / 'b')
            item = self.item()
            source = a.runtime.settings['sources'][1]
            a.accept_feeds([source], [{'source_id': 'openai', 'reason': None, 'result': {'items': [item]},
                                     'fetched_at': item['fetched_at']}], None)
            before = a.sample()['sample']['streams']['ai']['items']
            value = body(a.runtime.settings)
            value['sources'][1]['enabled'] = False
            a.runtime.save_settings(value)
            a.accept_feeds([], [], 'timeout')
            self.assertEqual(a.sample()['sample']['streams']['ai']['items'], before)
            self.assertEqual(b.sample()['sample']['streams']['ai']['items'], [])
            a.close()
            b.close()

    def test_browser_inner_thread_start_failure_is_terminal_and_close_safe(self):
        from control_everything.workspace.news_research import ResearchJobs
        import os
        with tempfile.TemporaryDirectory() as folder:
            jobs = ResearchJobs(folder, lambda _: None)
            failed_thread = __import__('unittest.mock', fromlist=['Mock']).Mock()
            failed_thread.start.side_effect = RuntimeError('cannot start thread')
            with patch.dict(os.environ, {'CONTROL_EVERYTHING_NEWS_NODE': __file__}), patch('control_everything.workspace.news_research.threading.Thread', return_value=failed_thread):
                with self.assertRaisesRegex(OSError, 'news_browser_start_failed'):
                    jobs.begin('AI', 'coding')
            self.assertIsNone(jobs.thread)
            self.assertEqual(jobs.latest()['state'], 'failed')
            self.assertEqual(jobs.latest()['reason'], 'worker_start_failed')
            self.assertIsNone(jobs.process)
            jobs.close()
            failed_thread.join.assert_not_called()

    def test_browser_outer_start_failure_holds_slot_until_cleanup_then_recovers(self):
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as folder:
            reader = self.make_reader(folder)
            admitted, cleanup = Mock(), Mock()
            admitted.return_value = {'job_id': 'a'*32, 'state': 'running'}
            def confirm_cleanup():
                self.assertIsNotNone(reader.runtime.slot)
                self.assertTrue(reader.runtime.blocked)
                self.assertTrue(reader.jobs.stop.is_set())
                # Joining here must happen after the caller released reader.lock.
                acquired = []
                def other():
                    with reader.lock: acquired.append(True)
                check = threading.Thread(target=other)
                check.start()
                check.join(2)
                self.assertEqual(acquired, [True])
                return True
            failed = Mock()
            failed.start.side_effect = RuntimeError('cannot start outer thread')
            original_thread = threading.Thread
            def factory(*args, **kwargs):
                return failed if kwargs.get('name') == 'news-run' else original_thread(*args, **kwargs)
            with patch.object(reader.jobs, 'begin', admitted), patch.object(reader.jobs, 'cancel_current', side_effect=confirm_cleanup) as cancel, patch('control_everything.workspace.news_runtime.threading.Thread', side_effect=factory):
                with self.assertRaisesRegex(NewsUnavailable, 'worker_start_failed'):
                    reader.runtime.request_research('AI', 'coding')
                cancel.assert_called_once()
            admitted.assert_called_once()
            self.assertIsNone(reader.runtime.slot)
            self.assertIsNone(reader.runtime.worker)
            self.assertFalse(reader.runtime.blocked)
            self.assertEqual(reader.runtime.status['result'], 'failed')
            reader.close()

    def test_browser_outer_start_failure_unconfirmed_cleanup_retains_slot_and_owner(self):
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as folder:
            owner = Owner()
            reader = self.make_reader(folder, owner=owner)
            failed = Mock()
            failed.start.side_effect = RuntimeError('cannot start outer thread')
            with patch.object(reader.jobs, 'begin', return_value={'job_id': 'a'*32, 'state': 'running'}), patch.object(reader.jobs, 'cancel_current', return_value=False) as cancel, patch('control_everything.workspace.news_runtime.threading.Thread', return_value=failed):
                with self.assertRaises(NewsUnavailable): reader.runtime.request_research('AI', 'coding')
                cancel.assert_called_once()
            self.assertTrue(reader.runtime.blocked)
            self.assertIsNotNone(reader.runtime.slot)
            with self.assertRaises(NewsUnavailable): reader.runtime.request_feed()
            with self.assertRaises(NewsUnavailable): reader.close()
            self.assertFalse(owner.released)

    def test_research_close_failure_uses_owner_retention_gate(self):
        from control_everything.workspace.news_runtime import _RETAINED_OWNERS
        for failure in ('cancel_false', 'close_exception'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as folder:
                owner = Owner()
                reader = self.make_reader(folder, owner=owner)
                target = patch.object(reader.jobs, 'cancel_current', return_value=False) if failure == 'cancel_false' else patch.object(reader.jobs, 'close', side_effect=OSError('cleanup_unverified'))
                with target:
                    with self.assertRaisesRegex(NewsUnavailable, 'cleanup_unverified'):
                        reader.close()
                self.assertIn(owner, _RETAINED_OWNERS)
                self.assertFalse(owner.released)
                self.assertTrue(reader.runtime.blocked)
                with self.assertRaises(NewsUnavailable): reader.runtime.request_feed()
                reader.close()
