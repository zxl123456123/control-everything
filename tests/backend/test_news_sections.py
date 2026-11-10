"""Custom reading sections: validation, persistence, keyword filter, background feeds and HTTP routes."""
import json
import shutil
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from urllib.parse import urlsplit

from control_everything.workspace import news_feeds
from control_everything.workspace.news_reader import NewsReader
from control_everything.workspace.news_sections import SectionError, SectionFeeds, SectionStore, keep, normalise, source_id

FEED = 'https://sspai.com/feed'
OWN = 'https://blog.example.org/atom.xml'


def article(title, url, summary='', published='2026-10-27T10:00:00+00:00'):
    return {'id': 'a' * 24, 'title': title, 'url': url, 'summary': summary, 'source_id': 'x', 'source_name': 'x',
            'published_at': published, 'fetched_at': published}


class Inline:
    """Executor that runs the job immediately so tests stay deterministic."""

    def submit(self, call, *args):
        call(*args)

    def shutdown(self, **_):
        pass


class Source:
    def get(self, stream):
        return {'items': [], 'sources': [{'id': 'qbitai', 'last_success_at': '2026-10-27T09:00:00+00:00', 'status': 'available',
                                          'reason': None}], 'refresh': {'state': 'idle', 'reason': None}, 'sampled_at': None}

    refresh = get


class Normalise(unittest.TestCase):
    def test_new_section_gets_id_defaults_and_trimmed_fields(self):
        rows, removed = normalise([{'name': '  我的  专栏 ', 'emoji': '📚', 'sources': [{'url': FEED}], 'include': ['AI', 'ai'], 'exclude': ['广告']}])
        self.assertEqual((rows[0]['name'], rows[0]['include'], rows[0]['sources'][0]['name']), ('我的 专栏', ['AI'], '少数派'))
        self.assertRegex(rows[0]['id'], r'^c[a-f0-9]{9}$')
        self.assertEqual(removed, ['ai', 'hn'])

    def test_presets_are_editable_but_keep_fixed_sources(self):
        rows, removed = normalise([{'id': 'hn', 'name': '黑客新闻', 'color': 'blue', 'sources': [{'url': FEED}]}])
        self.assertEqual((rows[0]['name'], rows[0]['sources'], rows[0]['preset']), ('黑客新闻', [], 'hn'))
        self.assertEqual(removed, ['ai'])

    def test_rejections(self):
        bad = ([{'name': ''}], [{'name': 'x' * 17}], [{'name': 'a', 'color': 'neon'}], [{'name': 'a', 'bogus': 1}],
               [{'name': 'a', 'sources': [{'url': 'http://sspai.com/feed'}]}], [{'name': 'a', 'sources': [{'url': 'https://127.0.0.1/x'}]}],
               [{'name': 'a', 'sources': [{'url': FEED}] * 1, 'include': ['x'] * 11}], [{'id': 'cnope0000', 'name': 'a'}],
               [{'id': 'ai', 'name': 'a'}, {'id': 'ai', 'name': 'b'}], [{'name': 'a'}] * 13, 'nope', [{'name': 'a\u0007'}])
        for payload in bad:
            with self.subTest(payload=str(payload)[:50]), self.assertRaises(SectionError):
                normalise(payload)

    def test_duplicate_source_urls_collapse_and_ids_are_stable(self):
        rows, _ = normalise([{'name': 'a', 'sources': [{'url': FEED}, {'url': FEED}, {'url': OWN, 'name': '博客'}]}])
        self.assertEqual([row['id'] for row in rows[0]['sources']], ['sspai', source_id(OWN)])
        self.assertEqual(source_id(OWN), source_id(OWN))

    def test_keyword_filter(self):
        item = article('Rust 2026 发布', 'https://e.com/1', '带来新的编译器', )
        self.assertTrue(keep(item, [], []))
        self.assertTrue(keep(item, ['rust'], []))
        self.assertFalse(keep(item, ['python'], []))
        self.assertFalse(keep(item, ['rust'], ['编译器']))
        self.assertFalse(keep(item, [], ['RUST']))


class Store(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, True)

    def reader(self, **options):
        reader = NewsReader(self.root, Source(), **options)
        self.addCleanup(reader.close)
        return reader

    def test_first_run_has_the_two_presets_and_survives_restart(self):
        reader = self.reader()
        self.assertEqual([s['id'] for s in reader.sections.sections], ['ai', 'hn'])
        saved = reader.save_sections([{'id': 'hn', 'name': '热门'}, {'name': '开发', 'sources': [{'url': FEED}]}])
        again = self.reader()
        self.assertEqual([s['name'] for s in again.sections.sections], ['热门', '开发'])
        self.assertEqual(saved['removed_presets'], ['ai'])
        self.assertTrue((self.root / 'sections.json').exists())

    def test_corrupt_file_falls_back_to_presets(self):
        (self.root / 'sections.json').write_text('{"sections": [{"name": 1}]}')
        self.assertEqual([s['id'] for s in self.reader().sections.sections], ['ai', 'hn'])

    def test_failed_write_does_not_publish_new_sections(self):
        store = SectionStore(lambda name, default: default, Mock(side_effect=OSError('disk error')))
        before = store.view()
        with self.assertRaises(OSError):
            store.save([{'id': 'ai', 'name': 'changed'}])
        self.assertEqual(store.view(), before)

    def test_delete_then_restore_presets_keeps_custom_sections(self):
        reader = self.reader()
        custom = reader.save_sections([{'name': '开发', 'sources': [{'url': FEED}]}])['sections']
        restored = reader.restore_sections()
        self.assertEqual([s['id'] for s in restored['sections']], [custom[0]['id'], 'ai', 'hn'])
        self.assertEqual(restored['removed_presets'], [])

    def test_reorder_is_persisted(self):
        reader = self.reader()
        reader.save_sections([{'id': 'hn', 'name': 'Hacker News'}, {'id': 'ai', 'name': 'AI 新闻'}])
        self.assertEqual([s['id'] for s in self.reader().sections.sections], ['hn', 'ai'])

    def test_deleting_everything_is_allowed_and_sample_stays_valid(self):
        reader = self.reader()
        reader.save_sections([])
        sample = reader.sample()
        self.assertEqual((sample['sample']['streams'], sample['sections']['sections']), ({}, []))


class Feeds(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, True)
        self.now, self.calls, self.outcome = [1000.0], [], {}

        def fetcher(url, sid, name):
            self.calls.append(url)
            outcome = self.outcome[url]
            if isinstance(outcome, news_feeds.FeedError):
                raise outcome
            return {'result': {'items': [dict(i, source_id=sid, source_name=name) for i in outcome]}, 'title': 'T',
                    'fetched_at': '2026-10-27T12:00:00+00:00'}
        self.fetcher = fetcher
        self.reader = NewsReader(self.root, Source(), fetcher=fetcher)
        self.reader.custom.executor = Inline()
        self.reader.custom.clock = lambda: self.now[0]
        self.addCleanup(self.reader.close)

    def make(self, **extra):
        rows = self.reader.save_sections([{'name': '开发', 'sources': [{'url': FEED}, {'url': OWN}], **extra}])['sections']
        return rows[0]['id']

    def stream(self, section, **options):
        return self.reader.sample(**options)['sample']['streams'][section]

    def test_items_are_merged_deduplicated_sorted_and_filtered(self):
        self.outcome = {FEED: [article('Rust 新版', 'https://e.com/1', published='2026-10-26T00:00:00+00:00'),
                               article('八卦', 'https://e.com/2')],
                        OWN: [article('Rust 新版（转载）', 'https://e.com/1'), article('Rust 工具链', 'https://e.com/3')]}
        section = self.make(include=['rust'])
        self.stream(section)  # first view schedules the fetch (inline here)
        value = self.stream(section)
        self.assertEqual([i['title'] for i in value['items']], ['Rust 工具链', 'Rust 新版'])
        self.assertEqual([s['status'] for s in value['sources']], ['available', 'available'])
        self.assertEqual(value['refresh']['state'], 'idle')

    def test_failing_source_reports_reason_and_hint_but_keeps_other_items(self):
        self.outcome = {FEED: news_feeds.FeedError('http_404'), OWN: [article('可读', 'https://e.com/9')]}
        section = self.make()
        self.stream(section)
        value = self.stream(section)
        bad = value['sources'][0]
        self.assertEqual((bad['reason'], bad['status']), ('http_404', 'unavailable'))
        self.assertTrue(bad['message'] and bad['hint'])
        self.assertEqual([i['title'] for i in value['items']], ['可读'])

    def test_cache_prevents_refetching_until_stale_and_failure_retries_sooner(self):
        self.outcome = {FEED: news_feeds.FeedError('timeout'), OWN: [article('a', 'https://e.com/1')]}
        section = self.make()
        self.stream(section)
        self.assertEqual(len(self.calls), 2)
        self.stream(section)
        self.assertEqual(len(self.calls), 2)
        self.now[0] += 61
        self.stream(section)
        self.assertEqual(self.calls.count(FEED), 2)
        self.assertEqual(self.calls.count(OWN), 1)
        self.now[0] += 900
        self.stream(section)
        self.assertEqual(self.calls.count(OWN), 2)

    def test_manual_refresh_forces_fetch_and_stale_items_survive_a_failure(self):
        self.outcome = {FEED: [article('旧闻', 'https://e.com/1')], OWN: []}
        section = self.make()
        self.stream(section)
        self.outcome[FEED] = news_feeds.FeedError('timeout')
        value = self.stream(section, refresh=True)
        self.assertEqual([i['title'] for i in value['items']], ['旧闻'])
        self.assertEqual(value['sources'][0]['reason'], 'timeout')

    def test_unexpected_fetcher_exception_is_contained(self):
        self.outcome = {FEED: [], OWN: []}
        self.reader.custom.fetcher = Mock(side_effect=RuntimeError('boom'))
        section = self.make()
        self.stream(section)
        self.assertEqual(self.stream(section)['sources'][0]['reason'], 'worker_failed')

    def test_cache_is_persisted_for_the_next_start(self):
        self.outcome = {FEED: [article('留存', 'https://e.com/1')], OWN: []}
        section = self.make()
        self.stream(section)
        again = NewsReader(self.root, Source(), fetcher=self.fetcher)
        self.addCleanup(again.close)
        self.assertEqual(again.sample()['sample']['streams'][section]['items'][0]['title'], '留存')

    def test_research_items_follow_the_first_section_when_ai_is_deleted(self):
        self.outcome = {FEED: [], OWN: []}
        section = self.make()
        self.reader.research = {'r': {'id': 'b' * 24, 'url': 'https://e.com/r', 'title': 'R', 'source_id': 'r', 'source_name': 'r',
                                      'summary': '', 'fetched_at': '2026-10-27T00:00:00+00:00'}}
        self.assertEqual(self.stream(section)['items'][0]['title'], 'R')

    def test_sections_are_returned_with_the_reader_envelope(self):
        section = self.make(include=['x'])
        self.outcome = {FEED: [], OWN: []}
        envelope = self.reader.sample()
        self.assertEqual(envelope['sections']['sections'][0]['id'], section)
        self.assertIn(section, envelope['sample']['streams'])
        json.dumps(envelope)

    def test_close_blocks_late_cache_writes_and_new_requests(self):
        started, release, done = threading.Event(), threading.Event(), threading.Event()
        writes = Mock()

        def fetch(*args):
            started.set()
            if not release.wait(5):
                raise RuntimeError('test fetch timed out')
            return {'result': {'items': []}, 'fetched_at': 'now'}

        feeds = SectionFeeds(lambda name, default: default, writes, fetcher=fetch)
        source = {'url': FEED, 'id': 'sspai', 'name': '少数派'}
        original_fetch = feeds._fetch

        def observed_fetch(source):
            try:
                original_fetch(source)
            finally:
                done.set()

        feeds._fetch = observed_fetch
        try:
            self.assertTrue(feeds.request([source]))
            self.assertTrue(started.wait(5))
            feeds.close()
            self.assertFalse(feeds.request([source], force=True))
            release.set()
            self.assertTrue(done.wait(5))
            writes.assert_not_called()
            self.assertNotIn(FEED, feeds.cache)
        finally:
            release.set()
            feeds.close()


class Routes(unittest.TestCase):
    def setUp(self):
        self.reader = Mock()
        self.server = SimpleNamespace(news_reader=self.reader, _news_reader_lock=threading.Lock(), _news_reader_closed=False)

    def post(self, route, body):
        from control_everything.http.news_reader import handle_post
        handler = Mock(server=self.server, read_json_body=Mock(return_value=body))
        handle_post(handler, urlsplit('/api/workspace/news/' + route))
        return handler

    def test_sections_route_validates_body_shape_and_budget(self):
        self.reader.save_sections.return_value = {'sections': [], 'removed_presets': []}
        handler = self.post('sections', {'sections': []})
        handler.read_json_body.assert_called_once_with(max_bytes=60000, strict=True)
        handler.reply.assert_called_once_with(200, {'sections': [], 'removed_presets': []})
        for body in ({}, {'sections': [], 'x': 1}, {'restore': False}, [], {'sections': [], 'restore': True}):
            handler = self.post('sections', body)
            handler.reject.assert_called_once_with(400, 'invalid_request')

    def test_restore_and_validation_error_code(self):
        self.reader.restore_sections.return_value = {'sections': []}
        self.assertEqual(self.post('sections', {'restore': True}).reply.call_args.args[0], 200)
        self.reader.save_sections.side_effect = SectionError('invalid_name')
        handler = self.post('sections', {'sections': [{}]})
        handler.reply.assert_called_once_with(400, {'error': 'invalid_name'})

    def test_source_test_maps_failures_and_warns_about_blocked_hosts(self):
        from control_everything.http import news_reader as routes
        original = routes.news_feeds.probe
        try:
            routes.news_feeds.probe = Mock(side_effect=lambda url: {'ok': False, 'error': news_feeds.describe('http_404')})
            handler = self.post('source-test', {'url': 'https://www.bbc.com/feed.xml'})
            status, body = handler.reply.call_args.args
            self.assertEqual((status, body['error']['code']), (200, 'http_404'))
            self.assertIn('中国大陆', body['china_warning'])
            handler = self.post('source-test', {'url': FEED})
            self.assertNotIn('china_warning', handler.reply.call_args.args[1])
            for body in ({}, {'url': 1}, {'url': 'x' * 501}, {'url': FEED, 'x': 1}):
                self.post('source-test', body).reject.assert_called_once_with(400, 'invalid_request')
        finally:
            routes.news_feeds.probe = original

    def test_source_test_is_limited_to_two_concurrent_probes(self):
        from control_everything.http import news_reader as routes
        held = [routes._PROBES.acquire(blocking=False) for _ in range(2)]
        try:
            self.assertEqual(self.post('source-test', {'url': FEED}).reply.call_args.args, (429, {'error': 'busy'}))
        finally:
            for _ in held:
                routes._PROBES.release()

    def test_catalog_route_lists_categories_and_sources(self):
        from control_everything.http.news_reader import handle_get
        handler = Mock(server=self.server)
        handle_get(handler, urlsplit('/api/workspace/news/catalog'))
        status, body = handler.reply.call_args.args
        self.assertEqual(status, 200)
        self.assertEqual({row['category'] for row in body['sources']}, {row['id'] for row in body['categories']})


if __name__ == '__main__':
    unittest.main()
