"""Verify fixed-source extraction and retain distinct live capture evidence."""
import argparse
from datetime import datetime, timezone
from email.message import Message
import hashlib
import io
import json
from pathlib import Path
import socket
import tempfile
import time
import unittest
from unittest.mock import patch

from control_everything.workspace import news_article as content
from importlib.util import find_spec

ROOT = Path(__file__).resolve().parent


def item(source_id, url, summary='Source-provided summary.'):
    return {'id': hashlib.sha256((source_id + ':' + url).encode()).hexdigest()[:24],
            'source_id': source_id, 'url': url, 'title': 'Article test', 'summary': summary,
            'fetched_at': '2026-10-22T00:00:00+00:00'}


@unittest.skipUnless(find_spec('trafilatura'), 'Install the news extra to verify extraction')
class ArticleTests(unittest.TestCase):
    def image_html(self, inner):
        paragraph = 'Measured coding results are described alongside their methods and limitations. ' * 7
        return ('<html><body><article><h1>Research report</h1><p>' + paragraph + '</p>' +
                inner + '<p>' + paragraph + '</p></article></body></html>').encode()

    def test_article_images_preserve_figure_alt_caption_and_choose_readable_srcset(self):
        html = self.image_html('<figure><img src="/chart-small.webp" alt="Accuracy &amp; cost" '
                               'srcset="/chart-small.webp 400w, /chart-readable.webp 1200w, /chart-huge.webp 2400w">'
                               '<figcaption>Measured <em>results</em>, with confidence intervals.</figcaption></figure>')
        images = content.extract_images(html, 'https://blog.google/article')
        self.assertEqual(images, [{'url': 'https://blog.google/chart-readable.webp',
                                  'alt': 'Accuracy & cost',
                                  'caption': 'Measured results, with confidence intervals.', 'kind': 'body'}])

    def test_image_urls_reject_unsafe_schemes_hosts_ports_and_credentials(self):
        for value in ('javascript:alert(1)', 'data:image/png;base64,AAAA', 'file:///image.png',
                      'http://blog.google/chart.png', '//127.0.0.1/chart.png',
                      'https://localhost/chart.png', 'https://blog.google.evil.test/chart.png',
                      'https://blog.google:444/chart.png', 'https://u:p@blog.google/chart.png',
                      'https://storage.googleapis.com/another-bucket/chart.png',
                      'https://blog.google/chart.svg', 'https://blog.google/chart.png#fragment',
                      'https://blog.google/chart.png\nHeader'):
            with self.subTest(value=value):
                self.assertIsNone(content._image_url(value, 'https://blog.google/article'))
        self.assertEqual(content._image_url('../chart.png', 'https://blog.google/articles/one'),
                         'https://blog.google/chart.png')

    def test_images_ignore_decorations_hidden_navigation_tracking_and_duplicates(self):
        html = self.image_html('<nav><img src="/navigation.png"></nav>'
                               '<figure><img src="/chart.png" alt="Result chart"></figure>'
                               '<figure><img src="/chart.png" alt="Duplicate chart"></figure>'
                               '<img src="/logo.png"><img src="/tiny.png" width="1" height="1">'
                               '<div hidden><img src="/hidden.png"></div>'
                               '<div style="display:none"><img src="/invisible.png"></div>'
                               '<img src="https://127.0.0.1/private.png">'
                               '<img src="data:image/png;base64,AAAA">')
        images = content.extract_images(html, 'https://blog.google/article')
        self.assertEqual([row['url'] for row in images], ['https://blog.google/chart.png'])

    def test_text_only_article_has_no_invented_images(self):
        self.assertEqual(content.extract_images(self.image_html(''), 'https://blog.google/article'), [])

    def test_images_do_not_promote_insufficient_text_to_full_article(self):
        data = item('google_ai', 'https://blog.google/article')
        html = b'<article><p>A short source-provided teaser.</p><figure><img src="/chart.png"></figure></article>'
        with tempfile.TemporaryDirectory() as directory, patch.object(content, '_fetch_html', return_value=(html, data['url'])):
            result = content.load_article(data, directory)
            self.assertEqual(result['content_kind'], 'summary')
            self.assertEqual(result['reason'], 'extraction_insufficient')
            self.assertEqual(result['blocks'], [{'type': 'p', 'text': data['summary']}])

    def test_image_only_article_exposes_gallery_without_inventing_full_text(self):
        data = item('google_ai', 'https://blog.google/article', None)
        html = (b'<article><h1>Diagram</h1><figure><img src="/chart.png" alt="Useful diagram">'
                b'<figcaption>Workflow diagram.</figcaption></figure></article>')
        with tempfile.TemporaryDirectory() as directory, patch.object(content, '_fetch_html', return_value=(html, data['url'])):
            result = content.load_article(data, directory)
            self.assertEqual(result['content_kind'], 'summary')
            self.assertEqual(result['reason'], 'extraction_insufficient')
            self.assertEqual(result['blocks'], [])
            self.assertEqual(result['images'], [{'url': 'https://blog.google/chart.png',
                                               'alt': 'Useful diagram', 'caption': 'Workflow diagram.', 'kind': 'body'}])

    def test_legacy_success_cache_enriches_images_without_fetch_or_timestamp_change(self):
        data = item('google_ai', 'https://blog.google/article')
        saved = {'id': data['id'], 'title': data['title'], 'source_url': data['url'],
                 'content_kind': 'full_text', 'reason': None, 'images': [],
                 'blocks': [{'type': 'p', 'text': 'Verified cached body.'}],
                 'fetched_at': '2026-10-22T11:59:11+00:00'}
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / (data['id'] + '.json')
            cache.write_text(json.dumps(saved), encoding='utf-8')
            cache.with_suffix('.html').write_bytes(self.image_html('<figure><img src="/chart.png"></figure>'))
            with patch.object(content, '_fetch_html') as fetch:
                first = content.load_article(data, directory)
                self.assertEqual(first['fetched_at'], saved['fetched_at'])
                self.assertEqual(first['blocks'], saved['blocks'])
                self.assertEqual(first['images'][0]['url'], 'https://blog.google/chart.png')
                self.assertEqual(first['images_version'], content.IMAGE_EXTRACTION_VERSION)
                with patch.object(content, 'extract_images') as extract:
                    self.assertEqual(content.load_article(data, directory), first)
                    extract.assert_not_called()
                fetch.assert_not_called()

    def test_extract_preserves_order_without_executable_or_navigation_content(self):
        paragraph = 'Useful research report describing the measured results and their limitations. ' * 7
        html = ('<html><body><nav>POISON_NAV</nav><article><h1>Title</h1><p>' + paragraph +
                '</p><h2>Second section</h2><p>' + paragraph + ' Ending marker.</p>' +
                '<script>POISON_SCRIPT</script><style>POISON_STYLE</style>' +
                '<p hidden>POISON_HIDDEN</p><p aria-hidden="true">POISON_ARIA</p>' +
                '<ul><li>First measured observation with sufficient specific information.</li>' +
                '<li>Second measured observation with sufficient specific information.</li></ul>' +
                '</article><footer>POISON_FOOTER</footer></body></html>').encode()
        blocks = content.extract_blocks(html, 'https://blog.google/article')
        text = '\n'.join(row['text'] for row in blocks)
        self.assertNotIn('POISON', text)
        self.assertLess(text.index('Useful research'), text.index('Second section'))
        self.assertTrue(any(row['type'] == 'h2' for row in blocks))
        self.assertTrue(any(row['type'] == 'li' for row in blocks))
        self.assertTrue(all(set(row) == {'type', 'text'} for row in blocks))

    def test_rejects_non_public_url_shapes(self):
        for url in ('http://blog.google/a', 'https://blog.google:444/a',
                    'https://user:pass@blog.google/a', 'https://127.0.0.1/a',
                    'https://blog.google.evil.test/a', 'file:///local/file',
                    'https://blog.google/a\nHeader', 'https://blog.google/a#fragment'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                content._validate_url(url, 'blog.google')

    def test_rejects_private_dns(self):
        row = (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, '', ('127.0.0.1', 443))
        with patch.object(socket, 'getaddrinfo', return_value=[row]), self.assertRaisesRegex(ValueError, 'private_address'):
            content._public_addresses('blog.google')

    def test_dns_timeout_is_bounded(self):
        def slow(*args, **kwargs):
            time.sleep(.2)
            return []
        start = time.monotonic()
        with patch.object(socket, 'getaddrinfo', side_effect=slow), self.assertRaises(TimeoutError):
            content._public_addresses('blog.google', timeout=.01)
        self.assertLess(time.monotonic() - start, .1)

    def test_cross_host_redirect_never_connects_to_other_host(self):
        class Redirect:
            status = 302
            def getheader(self, key):
                return 'https://openai.com/article'
        class Connection:
            def __init__(self, host, **kwargs):
                self.host = host
            def request(self, *args, **kwargs):
                pass
            def getresponse(self):
                return Redirect()
            def close(self):
                pass
        with patch.object(content, '_PinnedHTTPSConnection', side_effect=Connection) as connection:
            with self.assertRaisesRegex(ValueError, 'redirect_rejected'):
                content._fetch_html('https://blog.google/article', 'blog.google')
            self.assertEqual(connection.call_count, 1)

    def test_read_deadline_is_enforced(self):
        response = io.BytesIO(b'<html/>')
        response.headers = Message()
        response.headers['Content-Type'] = 'text/html'
        connection = type('Connection', (), {'sock': None})()
        with self.assertRaises(TimeoutError):
            content._read_response(response, connection, time.monotonic() - 1)

    def test_rejects_oversize_html(self):
        with self.assertRaisesRegex(ValueError, 'oversize'):
            content.extract_blocks(b'x' * (content.MAX_BYTES + 1), 'https://blog.google/article')

    def test_rejects_oversize_stream_without_content_length(self):
        response = io.BytesIO(b'x' * (content.MAX_BYTES + 1))
        response.headers = Message()
        response.headers['Content-Type'] = 'text/html'
        connection = type('Connection', (), {'sock': None})()
        with self.assertRaisesRegex(ValueError, 'oversize'):
            content._read_response(response, connection, time.monotonic() + 4)

    def test_insufficient_text_is_not_full_text(self):
        with self.assertRaisesRegex(ValueError, 'extraction_insufficient'):
            content.extract_blocks(b'<article><p>Short teaser.</p></article>', 'https://blog.google/article')

    def test_unsupported_hn_is_summary_and_never_fetched(self):
        data = item('hn', 'https://unknown.example/article', None)
        with tempfile.TemporaryDirectory() as directory, patch.object(content, '_fetch_html') as fetch:
            result = content.load_article(data, directory)
            self.assertEqual(result['content_kind'], 'summary')
            self.assertEqual(result['reason'], 'unsupported_source')
            self.assertEqual(result['blocks'], [])
            fetch.assert_not_called()

    def test_fallback_retains_summary_and_timestamp_and_cached_result(self):
        data = item('google_ai', 'https://blog.google/article')
        with tempfile.TemporaryDirectory() as directory, patch.object(content, '_fetch_html', side_effect=TimeoutError):
            result = content.load_article(data, directory)
            self.assertEqual(result['content_kind'], 'summary')
            self.assertEqual(result['reason'], 'timeout')
            self.assertEqual(result['blocks'][0]['text'], data['summary'])
            self.assertEqual(result['feed_fetched_at'], data['fetched_at'])
            self.assertIsNotNone(datetime.fromisoformat(result['fetched_at']).tzinfo)

    def test_cache_reuses_same_source_without_second_fetch(self):
        data = item('google_ai', 'https://blog.google/article')
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(content, '_fetch_html', side_effect=TimeoutError):
                first = content.load_article(data, directory)
            with patch.object(content, '_fetch_html') as fetch:
                second = content.load_article(data, directory)
                self.assertEqual(first, second)
                fetch.assert_not_called()

    def test_changed_feed_replaces_cached_fallback_during_retry_cooldown(self):
        data = item('google_ai', 'https://blog.google/article', 'Earlier source summary.')
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(content, '_now', return_value='2026-10-22T12:00:00+00:00'):
                with patch.object(content, '_fetch_html', side_effect=TimeoutError):
                    first = content.load_article(data, directory)
            data.update(title='Updated source title', summary='Updated source summary.',
                        fetched_at='2026-10-22T12:00:20+00:00')
            with patch.object(content, '_now', return_value='2026-10-22T12:00:20+00:00'):
                with patch.object(content, '_fetch_html') as fetch:
                    second = content.load_article(data, directory)
                    self.assertEqual(second['title'], data['title'])
                    self.assertEqual(second['blocks'], [{'type': 'p', 'text': data['summary']}])
                    self.assertEqual(second['feed_fetched_at'], data['fetched_at'])
                    self.assertEqual(second['fetched_at'], first['fetched_at'])
                    fetch.assert_not_called()

    def test_removed_feed_summary_does_not_keep_old_cached_text(self):
        data = item('hn', 'https://unknown.example/article', 'Earlier source summary.')
        with tempfile.TemporaryDirectory() as directory:
            content.load_article(data, directory)
            data['summary'] = None
            with patch.object(content, '_fetch_html') as fetch:
                result = content.load_article(data, directory)
                self.assertEqual(result['blocks'], [])
                fetch.assert_not_called()

    def test_expired_failure_retries_despite_more_recent_feed_sampling(self):
        data = item('google_ai', 'https://blog.google/article')
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(content, '_now', return_value='2026-10-22T12:00:00+00:00'):
                with patch.object(content, '_fetch_html', side_effect=TimeoutError):
                    content.load_article(data, directory)
            data['fetched_at'] = '2026-10-22T12:00:59+00:00'
            with patch.object(content, '_now', return_value='2026-10-22T12:01:01+00:00'):
                with patch.object(content, '_fetch_html', side_effect=TimeoutError) as fetch:
                    result = content.load_article(data, directory)
                    fetch.assert_called_once()
                    self.assertEqual(result['fetched_at'], '2026-10-22T12:01:01+00:00')

    def test_retry_failure_starts_new_cooldown(self):
        data = item('google_ai', 'https://blog.google/article')
        with tempfile.TemporaryDirectory() as directory:
            for current_time in ('2026-10-22T12:00:00+00:00', '2026-10-22T12:01:01+00:00'):
                with patch.object(content, '_now', return_value=current_time):
                    with patch.object(content, '_fetch_html', side_effect=TimeoutError):
                        content.load_article(data, directory)
            with patch.object(content, '_now', return_value='2026-10-22T12:01:02+00:00'):
                with patch.object(content, '_fetch_html') as fetch:
                    content.load_article(data, directory)
                    fetch.assert_not_called()

    def test_invalid_or_future_attempt_timestamp_cannot_pin_failure_cache(self):
        data = item('google_ai', 'https://blog.google/article')
        for timestamp in (None, 'invalid-time', '2026-10-22T13:00:00+00:00', '2026-10-22T11:59:59'):
            with self.subTest(timestamp=timestamp), tempfile.TemporaryDirectory() as directory:
                with patch.object(content, '_fetch_html', side_effect=TimeoutError):
                    saved = content.load_article(data, directory)
                saved['fetched_at'] = timestamp
                (Path(directory) / (data['id'] + '.json')).write_text(json.dumps(saved), encoding='utf-8')
                with patch.object(content, '_now', return_value='2026-10-22T12:00:00+00:00'):
                    with patch.object(content, '_fetch_html', side_effect=TimeoutError) as fetch:
                        content.load_article(data, directory)
                        fetch.assert_called_once()

    def test_expired_failure_can_recover_to_full_text(self):
        data = item('google_ai', 'https://blog.google/article')
        expected_blocks = [{'type': 'p', 'text': 'Recovered article body.'}]
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(content, '_now', return_value='2026-10-22T12:00:00+00:00'):
                with patch.object(content, '_fetch_html', side_effect=TimeoutError):
                    content.load_article(data, directory)
            with patch.object(content, '_now', return_value='2026-10-22T12:01:00+00:00'):
                with patch.object(content, '_fetch_html', return_value=(b'<article/>', data['url'])) as fetch:
                    with patch.object(content, 'extract_blocks', return_value=expected_blocks):
                        result = content.load_article(data, directory)
                        self.assertEqual(result['content_kind'], 'full_text')
                        self.assertIsNone(result['reason'])
                        self.assertEqual(result['blocks'], expected_blocks)
                        fetch.assert_called_once()

    def test_success_cache_is_reused_after_feed_updates_and_time_passes(self):
        data = item('google_ai', 'https://blog.google/article')
        expected_blocks = [{'type': 'p', 'text': 'Verified full article body.'}]
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(content, '_fetch_html', return_value=(b'<article/>', data['url'])):
                with patch.object(content, 'extract_blocks', return_value=expected_blocks):
                    first = content.load_article(data, directory)
            data.update(title='Current feed title', summary='Current source summary.',
                        fetched_at='2026-10-23T12:00:00+00:00')
            with patch.object(content, '_now', return_value='2026-10-23T12:01:00+00:00'):
                with patch.object(content, '_fetch_html') as fetch:
                    second = content.load_article(data, directory)
                    self.assertEqual(second['content_kind'], 'full_text')
                    self.assertEqual(second['blocks'], expected_blocks)
                    self.assertEqual(second['title'], data['title'])
                    self.assertEqual(second['fetched_at'], first['fetched_at'])
                    fetch.assert_not_called()

    def test_item_id_url_mismatch_rejected(self):
        data = item('google_ai', 'https://blog.google/article')
        data['url'] = 'https://blog.google/other'
        with tempfile.TemporaryDirectory() as directory, self.assertRaisesRegex(ValueError, 'invalid_item'):
            content.load_article(data, directory)



if __name__ == "__main__":
    unittest.main()
