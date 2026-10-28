"""Mocked-HTTP tests for the in-process feed fetcher: fallback, retry, redirects and error mapping."""
import gzip
import io
import socket
import unittest
from unittest.mock import patch
from email.message import Message
from urllib.error import HTTPError, URLError

from control_everything.workspace import news_feeds as nf
from control_everything.workspace.news_catalog import BY_ID, CATALOG, UNREACHABLE_HOSTS, host_of

RSS = ('<?xml version="1.0"?><rss version="2.0"><channel><title>Demo feed</title>'
       '<item><title>Newest</title><link>%s</link><pubDate>Tue, 27 Oct 2026 10:00:00 GMT</pubDate></item>'
       '<item><title>Older</title><link>https://example.com/older</link><pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate></item>'
       '</channel></rss>')


def public(*_args, **_kwargs):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))]


def headers(**values):
    message = Message()
    for key, value in values.items():
        message[key.replace('_', '-')] = value
    return message


class Response:
    def __init__(self, body, mime='application/rss+xml', encoding=None):
        self.body, self.position = body, 0
        self.headers = headers(Content_Type=mime, **({'Content_Encoding': encoding} if encoding else {}))

    def read(self, size=-1):
        chunk = self.body[self.position:] if size < 0 else self.body[self.position:self.position + size]
        self.position += len(chunk)
        return chunk

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class Script:
    """Opener that replays a list of responses/exceptions and records the requests."""

    def __init__(self, *steps):
        self.steps, self.requests = list(steps), []

    def open(self, request, timeout=None):
        self.requests.append(request)
        step = self.steps.pop(0)
        if isinstance(step, BaseException):
            raise step
        return step


def http_error(code, location=None):
    values = {'Location': location} if location else {}
    message = Message()
    for key, value in values.items():
        message[key] = value
    return HTTPError('https://example.com/feed', code, 'x', message, io.BytesIO(b''))


def rss(link='https://example.com/new'):
    return (RSS % link).encode('utf-8')


class Fetch(unittest.TestCase):
    def get(self, *steps, **options):
        opener = Script(*steps)
        sleeps = []
        options.setdefault('resolver', public)
        result = nf.get_document('https://example.com/feed', opener=opener, sleep=sleeps.append, **options)
        return result, opener, sleeps

    def code(self, *steps, **options):
        with self.assertRaises(nf.FeedError) as caught:
            self.get(*steps, **options)
        return caught.exception.code

    def test_plain_fetch_returns_body_mime_and_try_count(self):
        (data, final, mime, tries), opener, _ = self.get(Response(rss()))
        self.assertEqual((final, mime, tries), ('https://example.com/feed', 'application/rss+xml', 1))
        self.assertIn(b'Demo feed', data)
        self.assertEqual(opener.requests[0].get_header('User-agent'), nf.UA)

    def test_gzip_body_is_decoded(self):
        (data, *_), *_ = self.get(Response(gzip.compress(rss()), encoding='gzip'))
        self.assertIn(b'Newest', data)

    def test_transient_timeout_is_retried_with_backoff(self):
        (_, _, _, tries), opener, sleeps = self.get(URLError(socket.timeout('timed out')), Response(rss()))
        self.assertEqual((tries, len(opener.requests)), (2, 2))
        self.assertEqual(len(sleeps), 1)

    def test_server_error_is_retried_then_reported(self):
        self.assertEqual(self.code(http_error(503), http_error(503), http_error(503)), 'http_error')

    def test_403_retries_once_with_a_browser_user_agent(self):
        (_, _, _, tries), opener, _ = self.get(http_error(403), Response(rss()))
        self.assertEqual(tries, 2)
        self.assertEqual(opener.requests[1].get_header('User-agent'), nf.BROWSER_UA)

    def test_persistent_403_is_mapped_with_a_fix_hint(self):
        self.assertEqual(self.code(http_error(403), http_error(403)), 'http_403')
        self.assertTrue(nf.describe('http_403')['hint'])

    def test_http_status_mapping(self):
        for status, code in ((404, 'http_404'), (410, 'http_404'), (429, 'http_429')):
            with self.subTest(status=status):
                self.assertEqual(self.code(http_error(status)), code)

    def test_redirect_is_followed_manually(self):
        (data, final, *_), opener, _ = self.get(http_error(301, '/moved'), Response(rss()))
        self.assertEqual(final, 'https://example.com/moved')
        self.assertEqual(len(opener.requests), 2)

    def test_https_to_http_downgrade_is_rejected(self):
        self.assertEqual(self.code(http_error(302, 'http://example.com/feed')), 'redirect_rejected')

    def test_redirect_to_private_address_is_rejected(self):
        self.assertEqual(self.code(http_error(302, 'https://127.0.0.1/feed')), 'blocked_address')

    def test_redirect_loop_is_cut(self):
        self.assertEqual(self.code(*[http_error(302, '/again')] * 7), 'redirect_rejected')

    def test_oversize_body_is_rejected(self):
        self.assertEqual(self.code(Response(b'x' * (nf.MAX_FEED_BYTES + 200000))), 'oversize')

    def test_tls_and_reset_errors_are_mapped(self):
        self.assertEqual(self.code(*[URLError(Exception('SSL: CERTIFICATE_VERIFY_FAILED'))] * 3), 'tls_error')
        self.assertEqual(self.code(*[URLError(ConnectionResetError())] * 3), 'connection_reset')

    def test_unsupported_content_encoding(self):
        self.assertEqual(self.code(Response(b'abc', encoding='br')), 'encoding_unsupported')

    def test_deadline_is_enforced(self):
        ticks = iter(range(0, 100, 20))
        self.assertEqual(self.code(Response(rss()), clock=lambda: next(ticks), deadline=30), 'timeout')


class AddressPolicy(unittest.TestCase):
    def check(self, url, resolver=public, proxied=False):
        with self.assertRaises(nf.FeedError) as caught:
            nf.check_url(url, resolver=resolver, proxied=proxied)
        return caught.exception.code

    def test_loopback_private_and_local_names_are_blocked(self):
        for url in ('https://localhost/feed', 'https://127.0.0.1/feed', 'https://[::1]/feed', 'https://10.0.0.5/feed',
                    'https://192.168.1.1/feed', 'https://169.254.169.254/latest', 'https://printer.local/feed',
                    'https://nas.lan/feed'):
            with self.subTest(url=url):
                self.assertEqual(self.check(url), 'blocked_address')

    def test_bad_schemes_ports_and_credentials(self):
        for url in ('ftp://example.com/feed', 'file:///etc/passwd', 'https://user:pw@example.com/feed',
                    'https://example.com:22/feed', 'not a url', 'https://singlelabel/feed'):
            with self.subTest(url=url):
                self.assertEqual(self.check(url), 'bad_url')

    def test_hostname_resolving_to_a_private_address_is_blocked(self):
        private = lambda *a, **k: [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('10.1.2.3', 443))]
        self.assertEqual(self.check('https://sneaky.example.com/feed', resolver=private), 'blocked_address')

    def test_dns_failure_is_reported(self):
        def fail(*a, **k):
            raise socket.gaierror('nope')
        self.assertEqual(self.check('https://example.com/feed', resolver=fail), 'dns_failure')

    def test_no_proxy_does_not_skip_address_validation(self):
        with patch('urllib.request.getproxies', return_value={'https': 'http://proxy.example:8080'}), patch.object(nf, 'proxy_bypass', return_value=True):
            self.assertFalse(nf._uses_proxy('https://internal.example/feed'))

    def test_connection_rechecks_dns_and_pins_the_checked_address(self):
        with patch.object(nf.socket, 'getaddrinfo', return_value=public()), patch.object(nf.socket, 'create_connection') as connect:
            nf._public_connection(('example.com', 443), 3)
            connect.assert_called_once_with(('93.184.216.34', 443), 3, None)
        private = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 443))]
        with patch.object(nf.socket, 'getaddrinfo', return_value=private), patch.object(nf.socket, 'create_connection') as connect:
            with self.assertRaises(nf.FeedError):
                nf._public_connection(('example.com', 443), 3)
            connect.assert_not_called()

    def test_public_connection_tries_remaining_validated_addresses(self):
        addresses = [(socket.AF_INET6, socket.SOCK_STREAM, 6, '', ('2606:4700::1111', 443, 0, 0)), *public()]
        with patch.object(nf.socket, 'getaddrinfo', return_value=addresses), patch.object(nf.socket, 'create_connection', side_effect=[OSError('unreachable'), 'connected']) as connect:
            self.assertEqual(nf._public_connection(('example.com', 443), 3), 'connected')
            self.assertEqual([call.args[0] for call in connect.call_args_list], [('2606:4700::1111', 443), ('93.184.216.34', 443)])

    def test_handlers_pin_direct_connections_but_allow_configured_proxy_transport(self):
        for scheme, handler_type in [('http', nf._PublicHTTPHandler), ('https', nf._PublicHTTPSHandler)]:
            for proxied in (False, True):
                with self.subTest(scheme=scheme, proxied=proxied):
                    request = nf.Request(scheme + '://example.com/feed')
                    if proxied:
                        request.set_proxy('127.0.0.1:8080', 'http')
                    handler = handler_type()
                    captured = []
                    def inspect(factory, req, **kwargs):
                        connection = factory(req.host, timeout=3, **kwargs)
                        captured.append(connection._create_connection)
                        connection.close()
                    with patch.object(handler, 'do_open', side_effect=inspect):
                        getattr(handler, scheme + '_open')(request)
                    self.assertEqual(captured[0] is nf._public_connection, not proxied)

    def test_proxied_requests_leave_resolution_to_the_proxy(self):
        def explode(*a, **k):
            raise AssertionError('must not resolve locally')
        self.assertEqual(nf.check_url('https://example.com/feed', resolver=explode, proxied=True), 'https://example.com/feed')


class Probe(unittest.TestCase):
    def probe(self, *steps):
        opener = Script(*steps)
        return nf.probe('https://example.com/feed', opener=opener, resolver=public, sleep=lambda _: None), opener

    def test_success_reports_title_count_and_newest_item(self):
        result, _ = self.probe(Response(rss('https://example.com/new')))
        self.assertTrue(result['ok'])
        self.assertEqual((result['title'], result['count'], result['latest']['title']), ('Demo feed', 2, 'Newest'))

    def test_html_page_is_autodiscovered(self):
        page = b'<html><head><link rel="alternate" type="application/rss+xml" href="/rss.xml"></head></html>'
        result, opener = self.probe(Response(page, mime='text/html'), Response(rss()))
        self.assertTrue(result['ok'] and result['discovered'])
        self.assertEqual(opener.requests[1].full_url, 'https://example.com/rss.xml')

    def test_html_without_a_feed_gives_a_clear_reason(self):
        result, _ = self.probe(Response(b'<html><body>hello</body></html>', mime='text/html'))
        self.assertEqual(result['error']['code'], 'not_feed')
        self.assertIn('RSS', result['error']['hint'])

    def test_http_article_links_are_upgraded_to_https(self):
        result, _ = self.probe(Response(rss('http://example.com/plain')))
        self.assertTrue(result['latest']['url'].startswith('https://'))

    def test_empty_feed_reports_no_items(self):
        empty = b'<?xml version="1.0"?><rss version="2.0"><channel><title>t</title></channel></rss>'
        result, _ = self.probe(Response(empty))
        self.assertEqual(result['error']['code'], 'no_items')

    def test_rss1_is_reported_as_unsupported_not_crashed(self):
        rdf = b'<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF>'
        result, _ = self.probe(Response(rdf))
        self.assertFalse(result['ok'])
        self.assertIn(result['error']['code'], ('unsupported_format', 'invalid_feed'))

    def test_every_error_code_has_a_message_and_hint(self):
        for code in nf.ERRORS:
            self.assertTrue(nf.describe(code)['message'] and nf.describe(code)['hint'], code)


class Catalogue(unittest.TestCase):
    def test_entries_are_unique_https_and_not_on_the_unreachable_list(self):
        self.assertEqual(len({row['id'] for row in CATALOG}), len(CATALOG))
        self.assertEqual(len({row['url'] for row in CATALOG}), len(CATALOG))
        for row in CATALOG:
            host = host_of(row['url'])
            self.assertTrue(row['url'].startswith('https://'), row['id'])
            self.assertFalse(any(host == bad or host.endswith('.' + bad) for bad in UNREACHABLE_HOSTS), row['id'])

    def test_catalogue_covers_every_requested_category_and_both_languages(self):
        self.assertEqual({row['category'] for row in CATALOG}, {'tech', 'ai', 'dev', 'science', 'design', 'business', 'world'})
        self.assertTrue({'zh', 'en'} <= {row['language'] for row in CATALOG})
        self.assertIn('github_trending', BY_ID)

    def test_preset_worker_feeds_avoid_unreachable_hosts(self):
        from control_everything.workspace.news_worker import FEEDS
        for _, _, url in FEEDS:
            host = host_of(url)
            self.assertFalse(any(host == bad or host.endswith('.' + bad) for bad in UNREACHABLE_HOSTS), url)


if __name__ == '__main__':
    unittest.main()
