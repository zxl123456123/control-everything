"""Reader persistence, source identity, HTTP permissions and owned job contracts."""
import copy
import hashlib
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import threading
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from control_everything.workspace.news_reader import NewsReader
from control_everything.workspace.news_research import ResearchJobs
from tests.backend import test_execution_http
from control_everything.http.gateway import PanelServer
from control_everything.http.news_reader import _reader


def item(url='https://blog.google/article', date='2026-10-23T08:00:00+00:00', source='google_ai'):
    return {'id': hashlib.sha256((source + ':' + url).encode()).hexdigest()[:24], 'url': url,
            'title': 'An article', 'summary': 'Source summary', 'source_id': source, 'source_name': source,
            'published_at': date, 'fetched_at': '2026-10-23T09:00:00+00:00', 'stream': 'ai'}


class Source:
    def __init__(self):
        self.items = [item()]
        self.failed = False
        self.refreshes = []

    def get(self, stream):
        return {'items': [] if self.failed or stream == 'hn' else copy.deepcopy(self.items),
                'sources': [{'id': 'google_ai', 'last_success_at': None if self.failed else '2026-10-23T09:00:00+00:00',
                             'status': 'unavailable' if self.failed else 'available', 'reason': 'timeout' if self.failed else None}],
                'refresh': {'state': 'idle', 'reason': None}, 'sampled_at': '2026-10-23T09:00:00+00:00'}

    def refresh(self, stream):
        self.refreshes.append(stream)
        return self.get(stream)


class ReaderTests(unittest.TestCase):
    def test_feed_updated_time_orders_without_inventing_publication(self):
        row = {**item('https://github.com/example/release', None, 'github_com'),
               'updated_at': '2026-10-26T00:00:00+00:00',
               'body_blocks': [{'type': 'p', 'text': 'Actual publisher release note.'}]}
        result = self.reader.merge([row])
        self.assertEqual(result['sample']['streams']['ai']['items'][0]['id'], row['id'])
        document = self.reader.article(row['id'])
        self.assertIsNone(document['published_at'])
        self.assertEqual(document['updated_at'], row['updated_at'])

    def test_zero_matches_complete_but_blocked_sources_fail(self):
        for stages, expected in ((['search', 'merge'], 'complete'), (['blocked', 'merge'], 'failed')):
            identity = ('a' if expected == 'complete' else 'b') * 32
            folder = self.reader.jobs.root / identity
            folder.mkdir(parents=True)
            (folder / 'result.json').write_text(json.dumps({'items': []}), encoding='utf-8')
            job = {'job_id': identity, 'state': 'running', 'topic': 'coding', 'events': []}
            process = Mock(stdout=iter(json.dumps({'stage': stage, 'message': stage}) + '\n' for stage in stages))
            process.stderr.read.return_value = ''
            process.wait.return_value = process.poll.return_value = 0
            with patch('control_everything.workspace.news_research.subprocess.Popen', return_value=process):
                self.reader.jobs._run(job, folder / 'request.json', 'node')
            self.assertEqual(job['state'], expected)
            self.assertEqual('error' in job, expected == 'failed')

    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = Source()
        self.reader = NewsReader(self.root, self.source)

    def test_real_source_replaces_snapshot_and_newest_publication_leads(self):
        self.reader.sample()
        older = {**item('https://x.com/example/status/123', '2025-01-02T00:00:00Z', 'x'),
                 'body_blocks': [{'type': 'p', 'text': 'Original post'}]}
        sample = self.reader.merge([older])
        self.assertEqual(sample['sample']['streams']['ai']['items'][0]['url'], self.source.items[0]['url'])
        self.assertFalse(any('body_blocks' in row for row in self.reader.feeds['ai']['items']))
        saved = NewsReader(self.root, self.source)
        self.assertIn(older['id'], saved.research)
        self.assertNotIn(older['id'], NewsReader(self.root / 'other', self.source).research)

    def test_same_source_url_keeps_original_identity_and_full_content(self):
        original = self.source.items[0]
        self.reader.sample()
        capture = {**original, 'id': 'a' * 24, 'source_id': 'blog_google',
                   'body_blocks': [{'type': 'p', 'text': 'Captured text'}], 'images': [], 'content_kind': 'full_text'}
        rows = self.reader.merge([capture])['sample']['streams']['ai']['items']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['id'], original['id'])
        self.assertEqual(self.reader.article(original['id'])['blocks'], capture['body_blocks'])

    def test_failed_refresh_preserves_old_time_and_content(self):
        before = self.reader.sample()
        self.source.failed = True
        after = self.reader.sample(refresh=True)
        self.assertEqual(after['sample']['streams']['ai']['items'], before['sample']['streams']['ai']['items'])
        self.assertEqual(after['sample']['captured_at'], before['sample']['captured_at'])
        self.assertEqual(after['sample']['sources'][0]['reason'], 'timeout')
        self.assertEqual(self.source.refreshes, ['ai'])

    def test_unknown_article_never_fetches(self):
        with patch('control_everything.workspace.news_reader.load_article') as fetch:
            self.assertIsNone(self.reader.article('a' * 24))
            fetch.assert_not_called()

    def test_collection_skips_captured_bodies_but_retries_summaries_in_its_own_profile(self):
        full = {**item('https://sspai.com/post/full'), 'content_kind': 'full_text',
                'body_blocks': [{'type': 'p', 'text': 'A captured article body.'}]}
        feed = {**item('https://github.com/example/release'), 'content_kind': 'summary',
                'completeness': 'feed_content', 'body_blocks': [{'type': 'p', 'text': 'Publisher release notes.'}]}
        summary = {**item('https://sspai.com/post/summary'), 'content_kind': 'summary',
                   'completeness': 'feed_summary', 'body_blocks': [{'type': 'p', 'text': 'Short source excerpt.'}]}
        self.reader.merge([full, feed, summary])
        self.assertCountEqual(self.reader.collected_urls(), [full['url'], feed['url']])
        restored = NewsReader(self.root, self.source)
        self.assertCountEqual(restored.collected_urls(), [full['url'], feed['url']])
        self.assertEqual(NewsReader(self.root / 'other', self.source).collected_urls(), [])
        jobs = self.reader.jobs
        with patch.dict(os.environ, {'CONTROL_EVERYTHING_NEWS_NODE': __file__}), patch.object(jobs, '_run'):
            job = jobs.begin('coding', 'coding')
            jobs.thread.join(timeout=1)
        config = json.loads((jobs.root / job['job_id'] / 'request.json').read_text(encoding='utf-8'))
        self.assertCountEqual(config['known_urls'], [full['url'], feed['url']])
        self.assertNotIn('known_urls', job)

    def test_saved_document_remains_readable_after_leaving_feed_window(self):
        identity = 'a' * 24
        folder = self.root / 'article-cache'
        folder.mkdir()
        saved = {'id': identity, 'content_kind': 'full_text', 'blocks': [{'type': 'p', 'text': 'Saved body'}]}
        (folder / (identity + '.json')).write_text(json.dumps(saved), encoding='utf-8')
        with patch('control_everything.workspace.news_reader.load_article') as fetch:
            self.assertEqual(self.reader.article(identity), saved)
            self.assertIsNone(self.reader.article('../' + identity))
            self.assertIsNone(self.reader.article('b' * 24))
            fetch.assert_not_called()

    def test_excerpt_metadata_and_image_survive_reader(self):
        post = {**item('https://x.com/example/status/123', None, 'x'), 'published_raw': '2026-01-02',
                'published_precision': 'day', 'content_kind': 'summary', 'completeness': 'public_embed',
                'incomplete': True, 'images': [{'url': 'https://pbs.twimg.com/card_img/example', 'caption': '链接预览图'}],
                'body_blocks': [{'type': 'p', 'text': 'Actual excerpt'}]}
        self.reader.merge([post])
        doc = self.reader.article(post['id'])
        self.assertTrue(doc['incomplete'])
        self.assertIsNone(doc['published_at'])
        self.assertEqual(doc['images'], post['images'])

    def test_history_restores_only_terminal_own_job_and_exact_frame(self):
        jobs = self.reader.jobs
        identity = 'a' * 32
        folder = jobs.root / identity
        folder.mkdir(parents=True)
        saved = {'job_id': identity, 'state': 'partial', 'topic': 'coding', 'query': 'agents', 'events': []}
        (folder / 'job.json').write_text(json.dumps(saved), encoding='utf-8')
        (folder / 'frame-001.jpg').write_bytes(b'fixture')
        self.assertEqual(jobs.latest(), saved)
        self.assertEqual(jobs.frame_path(identity, 'frame-001.jpg'), folder / 'frame-001.jpg')
        self.assertIsNone(jobs.frame_path(identity, '../job.json'))
        self.assertIsNone(jobs.snapshot('../' + identity))
        jobs.latest()['events'].append('changed')
        self.assertEqual(jobs.latest()['events'], [])
        saved['state'] = 'running'
        (folder / 'job.json').write_text(json.dumps(saved), encoding='utf-8')
        self.assertIsNone(ResearchJobs(self.root, Mock()).latest())

    def test_invalid_requests_missing_node_and_busy_do_not_spawn(self):
        jobs = self.reader.jobs
        for query, topic in [(None, 'coding'), ('', 'coding'), ('x' * 241, 'coding'), ('x', []), ('x', 'unknown')]:
            with self.assertRaises(ValueError):
                jobs.begin(query, topic)
        with patch.dict(os.environ, {'CONTROL_EVERYTHING_NEWS_NODE': str(self.root / 'missing')}):
            with self.assertRaises(OSError):
                jobs.begin('AI coding', 'coding')
        with patch.dict(os.environ, {'CONTROL_EVERYTHING_NEWS_NODE': __file__}), patch('subprocess.Popen') as spawn:
            jobs.jobs['b' * 32] = {'job_id': 'b' * 32, 'state': 'running'}
            with self.assertRaises(RuntimeError):
                jobs.begin('AI coding', 'coding')
            spawn.assert_not_called()

    def test_close_only_stops_owned_process_and_waits_its_thread(self):
        jobs = self.reader.jobs
        jobs.process, jobs.thread = Mock(), Mock()
        with patch.object(jobs, '_stop') as stop:
            jobs.close()
            stop.assert_called_once_with(jobs.process)
        self.assertTrue(jobs.closed)
        jobs.thread.join.assert_called_once_with(timeout=5)


class ReaderHTTPTests(unittest.TestCase):
    request = test_execution_http.ExecutionHTTPTests.request

    def setUp(self):
        self.reader = Mock()
        self.reader.sample.return_value = {'sample': {}}
        self.server = SimpleNamespace(news_reader=self.reader, _news_reader_lock=threading.Lock(),
            _news_reader_closed=False,
            expected_host='127.0.0.1:1234', origin='http://127.0.0.1:1234', csrf_token='token')

    def test_only_explicit_same_origin_embedding_changes_ancestor_policy(self):
        from urllib.parse import urlsplit
        from control_everything.http.news_reader import handle_get, CSP
        handler = Mock()
        for route in ('/news', '/news?embedded=1'):
            handler.reset_mock()
            self.assertTrue(handle_get(handler, urlsplit(route)))
            csp = handler.reply.call_args.kwargs['csp']
            expected = CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'") if '?' in route else CSP
            self.assertEqual(csp, expected)
            self.assertEqual(handler.reply.call_args.args[0], 200)
        for route in ('/news?embedded=0', '/news?embedded=1&embedded=1', '/news?embedded=1&url=https://example.com', '/news-reader.js?embedded=1'):
            handler.reset_mock()
            handle_get(handler, urlsplit(route))
            handler.reject.assert_called_once_with(400, 'invalid_query')
            handler.reply.assert_not_called()
        self.assertEqual(self.request('/news?embedded=1', headers={'Host': 'evil'})[0], 403)

    def test_existing_permission_gate_precedes_all_reader_work(self):
        for headers in ({'Host': 'evil'}, {'X-Session-Client': ''}):
            self.assertEqual(self.request('/api/workspace/news/reader', headers=headers)[0], 403)
        for headers in ({'Origin': ''}, {'X-Session-CSRF': ''}, {'X-Session-Client': ''}):
            self.assertEqual(self.request('/api/workspace/news/research', 'POST', {'query': 'AI', 'topic': 'coding'}, headers)[0], 403)
        self.reader.sample.assert_not_called()
        self.reader.jobs.begin.assert_not_called()

    def test_query_body_budgets_and_refresh(self):
        self.assertEqual(self.request('/api/workspace/news/reader?url=https://example.com')[0], 400)
        for query in ('', 'id=bad', 'id=' + 'a' * 24 + '&id=' + 'b' * 24):
            self.assertEqual(self.request('/api/workspace/news/article?' + query)[0], 400)
        self.assertEqual(self.request('/api/workspace/news/reader/refresh', 'POST', {})[0], 200)
        self.reader.sample.assert_called_once_with(refresh=True)
        self.assertEqual(self.request('/api/workspace/news/research', 'POST', {'url': 'https://example.com'})[0], 400)
        self.assertEqual(self.request('/api/workspace/news/research', 'POST', b' ' * 2049)[0], 413)
        self.assertEqual(self.request('/api/workspace/news/translate', 'POST', {'texts': [1], 'source': 'en', 'target': 'zh'})[0], 400)

    def test_article_retry_is_explicit_and_rejects_other_parameters(self):
        identity = 'a' * 24
        self.reader.article.return_value = {'id': identity}
        self.assertEqual(self.request('/api/workspace/news/article?id=' + identity + '&retry=1')[0], 200)
        self.reader.article.assert_called_once_with(identity, retry=True)
        for suffix in ('&retry=0', '&retry=', '&retry=1&retry=1', '&retry=1&url=https://example.com'):
            self.assertEqual(self.request('/api/workspace/news/article?id=' + identity + suffix)[0], 400)

    def test_screenshot_capture_is_optional_and_boolean(self):
        self.reader.jobs.begin.return_value = {'job_id': 'a' * 32}
        for capture in (False, True):
            self.assertEqual(self.request('/api/workspace/news/research', 'POST',
                             {'query': 'AI', 'topic': 'coding', 'capture_frames': capture})[0], 202)
            self.reader.jobs.begin.assert_called_with('AI', 'coding', capture_frames=capture)
        self.assertEqual(self.request('/api/workspace/news/research', 'POST',
                         {'query': 'AI', 'topic': 'coding', 'capture_frames': 'false'})[0], 400)

    def test_unknown_document_and_active_job_status(self):
        self.reader.article.return_value = None
        self.assertEqual(self.request('/api/workspace/news/article?id=' + 'a' * 24)[0], 404)
        self.reader.jobs.begin.side_effect = RuntimeError('research_running')
        self.reader.jobs.latest.return_value = {'job_id': 'a' * 32, 'state': 'running', 'events': []}
        response = self.request('/api/workspace/news/research', 'POST', {'query': 'AI', 'topic': 'coding'})
        self.assertEqual(response[0], 409)
        self.assertEqual(response[1]['state'], 'running')

    def test_static_reader_csp_and_no_network_side_effect(self):
        self.assertEqual(self.request('/news')[0], 200)
        self.assertIn('img-src', self.last_handler.reply.call_args.kwargs['csp'])
        self.assertIn('frame-src \'none\'', self.last_handler.reply.call_args.kwargs['csp'])
        self.reader.sample.assert_not_called()

    def test_disconnected_client_is_not_sent_an_error_reply(self):
        self.request('/api/workspace/news/reader', disconnect=True)
        self.last_handler.reply.assert_called_once()

    def test_reader_cleanup_failure_does_not_skip_existing_cleanup(self):
        server = PanelServer.__new__(PanelServer)
        server._news_reader_lock = threading.Lock()
        server.news_reader, server.news_source, server.observer, server.execution = Mock(), Mock(), Mock(), Mock()
        reader, source, observer, execution = server.news_reader, server.news_source, server.observer, server.execution
        server._news_lease = 'lease'
        reader.close.side_effect = subprocess.TimeoutExpired('taskkill', 10)
        with patch('http.server.ThreadingHTTPServer.server_close'), self.assertRaises(subprocess.TimeoutExpired):
            server.server_close()
        source.release.assert_called_once_with('lease')
        observer.close_client.assert_called_once()
        execution.close.assert_called_once()
        with self.assertRaises(OSError):
            _reader(server)

    def test_reader_scope_is_stable_only_for_its_profile(self):
        with TemporaryDirectory() as temporary:
            first = NewsReader(Path(temporary) / 'a', Source())
            again = NewsReader(Path(temporary) / 'a', Source())
            other = NewsReader(Path(temporary) / 'b', Source())
            self.assertEqual(first.sample()['reader_id'], again.sample()['reader_id'])
            self.assertNotEqual(first.reader_id, other.reader_id)


if __name__ == '__main__':
    unittest.main()
