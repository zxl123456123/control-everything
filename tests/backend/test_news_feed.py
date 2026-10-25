"""Offline feed transport, content and exact protocol tests."""
import copy
from datetime import datetime, timezone
from email.message import Message
import json
import socket
import unittest
from unittest.mock import Mock
from control_everything.workspace import news_feed as feed
from control_everything.workspace.news_parse import parse_feed_result
from control_everything.workspace.news_settings import default_settings
from control_everything.workspace.news_research import BrowserFrames

STAMP = '2026-10-25T00:00:00+00:00'
XML = b'<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>Report</title><link>https://example.org/report</link><description>Teaser</description><content:encoded><![CDATA[<h2>Results</h2><p>Measured findings.</p><script>POISON</script><img src="/image.png" alt="Diagram"><img src="http://127.0.0.1/a">]]></content:encoded></item></channel></rss>'
PUBLIC = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))]
PRIVATE = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 443))]


class FeedTests(unittest.TestCase):
    def source(self):
        return {**default_settings()['sources'][0], 'id': 'feed_' + 'a'*32, 'url': 'https://example.org/rss', 'name': 'Example'}

    def test_opt_in_content_keeps_old_protocol_unchanged(self):
        basic = parse_feed_result(XML, 'a', 'A', STAMP)
        rich = parse_feed_result(XML, 'a', 'A', STAMP, include_content=True, feed_url='https://example.org/rss')
        self.assertNotIn('body_blocks', basic['items'][0])
        row = rich['items'][0]
        self.assertEqual(row['id'], basic['items'][0]['id'])
        self.assertEqual(row['content_kind'], 'feed_content')
        self.assertEqual(row['body_blocks'], [{'type': 'h2', 'text': 'Results'}, {'type': 'p', 'text': 'Measured findings.'}])
        self.assertEqual(row['images'], [{'url': 'https://example.org/image.png', 'alt': 'Diagram', 'caption': ''}])

    def test_atom_xhtml_and_xml_base(self):
        xml = b'<feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://example.org/base/"><entry><title>A</title><link href="article"/><content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Body</p><img src="image.png"/><script>POISON</script></div></content></entry></feed>'
        row = parse_feed_result(xml, 'a', 'A', STAMP, include_content=True)['items'][0]
        self.assertEqual(row['url'], 'https://example.org/base/article')
        self.assertEqual(row['images'][0]['url'], 'https://example.org/base/image.png')
        self.assertNotIn('POISON', str(row['body_blocks']))

    def test_summary_remains_summary_and_content_budget_is_explicit(self):
        xml = b'<rss version="2.0"><channel><item><title>A</title><link>https://example.org/a</link><description>' + b'x'*25000 + b'</description></item></channel></rss>'
        row = parse_feed_result(xml, 'a', 'A', STAMP, include_content=True)['items'][0]
        self.assertEqual(row['content_kind'], 'summary')
        self.assertEqual(sum(len(b['text']) for b in row['body_blocks']), 24000)
        self.assertTrue(row['content_truncated'])

    def test_xml_entities_depth_and_size_rejected(self):
        for xml in (b'<!DOCTYPE rss [<!ENTITY x "secret">]><rss version="2.0"><channel>&x;</channel></rss>',
                    b'<a>'*65 + b'</a>'*65, b' '*1048577):
            with self.subTest(size=len(xml)), self.assertRaises(ValueError): parse_feed_result(xml, 'a', 'A', STAMP)

    def test_all_dns_addresses_must_be_global(self):
        for rows in ([], PRIVATE, PUBLIC + PRIVATE, [(socket.AF_INET6, socket.SOCK_STREAM, 6, '', ('::1', 443, 0, 0))]):
            with self.subTest(rows=rows), self.assertRaises(ValueError): feed.public_addresses('example.org', resolver=lambda *a, **k: rows)
        self.assertEqual(feed.public_addresses('example.org', resolver=lambda *a, **k: PUBLIC), PUBLIC)

    def response(self, status=200, mime='application/rss+xml', data=XML, headers=None):
        response = Mock(status=status)
        message = Message()
        message['Content-Type'] = mime
        for key, value in (headers or {}).items(): message[key] = value
        response.headers = message
        response.getheader.side_effect = message.get
        response.read.side_effect = [data, b'']
        return response

    def connection(self, response):
        conn = Mock()
        conn.getresponse.return_value = response
        return conn

    def test_transport_pins_addresses_once_and_preserves_host(self):
        resolver = Mock(return_value=PUBLIC)
        conn = self.connection(self.response())
        factory = Mock(return_value=conn)
        result, _, _, _ = feed.fetch_feed(self.source(), 100, resolver=resolver, connection_factory=factory, clock=lambda: 0)
        self.assertEqual(result['returned_count'], 1)
        resolver.assert_called_once()
        self.assertEqual(factory.call_args.args, ('example.org', PUBLIC))
        self.assertEqual(conn.request.call_args.kwargs['headers']['Host'], 'example.org')
        conn.close.assert_called_once()

    def test_socket_connect_uses_checked_ip_and_original_tls_name(self):
        raw, tls = Mock(), Mock()
        context = Mock()
        context.wrap_socket.return_value = tls
        conn = feed.PinnedHTTPSConnection('example.org', PUBLIC, deadline=10, clock=lambda: 0,
                                        socket_factory=Mock(return_value=raw), context=context)
        conn.connect()
        raw.connect.assert_called_once_with(('93.184.216.34', 443))
        context.wrap_socket.assert_called_once_with(raw, server_hostname='example.org')

    def test_redirect_rechecks_dns_and_rejects_private_next_hop(self):
        resolver = Mock(side_effect=[PUBLIC, PRIVATE])
        conn = self.connection(self.response(status=302, headers={'Location': 'https://next.example.org/rss'}))
        factory = Mock(return_value=conn)
        with self.assertRaisesRegex(ValueError, 'private_address'):
            feed.fetch_feed(self.source(), 100, resolver=resolver, connection_factory=factory, clock=lambda: 0)
        self.assertEqual(resolver.call_count, 2)
        factory.assert_called_once()
        conn.close.assert_called_once()

    def test_compression_mime_length_stream_limit_and_deadline(self):
        responses = [self.response(headers={'Content-Encoding': 'gzip'}), self.response(mime='text/html'),
                     self.response(headers={'Content-Length': '1048577'}), self.response(data=b'x'*1048577)]
        for response in responses:
            conn = self.connection(response)
            with self.subTest(response=response), self.assertRaises(ValueError):
                feed.fetch_feed(self.source(), 100, resolver=lambda *a, **k: PUBLIC, connection_factory=lambda *a, **k: conn, clock=lambda: 0)
            conn.close.assert_called_once()
        with self.assertRaises(TimeoutError): feed.fetch_feed(self.source(), 0, clock=lambda: 1)

    def frame(self):
        source = self.source()
        return {'schema': 1, 'type': 'source', 'token': 'a'*32, 'revision': 1, 'source_id': source['id'],
                'result': parse_feed_result(XML, source['id'], source['name'], STAMP, include_content=True, feed_url=source['url']),
                'reason': None, 'url': source['url'], 'mime': 'application/rss+xml', 'fetched_at': STAMP}

    def test_exact_frames_and_terminal_source_set(self):
        frames = feed.ProfileFeedFrames([self.source()], 'a'*32, 1)
        frames.feed(json.dumps(self.frame()).encode() + b'\n')
        frames.feed(json.dumps({'schema': 1, 'type': 'done', 'token': 'a'*32, 'revision': 1}).encode() + b'\n')
        self.assertTrue(frames.done)
        with self.assertRaises(ValueError): frames.feed(b'{}\n')
        with self.assertRaises(ValueError): feed.ProfileFeedFrames([self.source()], 'a'*32, 1).accept({'schema': 1, 'type': 'done', 'token': 'a'*32, 'revision': 1})

    def test_forged_token_source_fields_identity_and_image_rejected(self):
        for change in ('token', 'source', 'field', 'identity', 'image', 'content_field'):
            frame = self.frame()
            if change == 'token': frame['token'] = 'b'*32
            if change == 'source': frame['source_id'] = 'unknown'
            if change == 'field': frame['extra'] = 1
            if change == 'identity': frame['result']['items'][0]['id'] = 'b'*24
            if change == 'image': frame['result']['items'][0]['images'][0]['url'] = 'https://127.0.0.1/a'
            if change == 'content_field': frame['result']['items'][0]['body_blocks'][0]['html'] = '<script>'
            with self.subTest(change=change), self.assertRaises(ValueError): feed.ProfileFeedFrames([self.source()], 'a'*32, 1).accept(frame)

    def test_line_and_browser_event_limits(self):
        with self.assertRaises(ValueError): feed.ProfileFeedFrames([self.source()], 'a'*32, 1).feed(b'x'*(256*1024+1))
        with self.assertRaises(ValueError): BrowserFrames(lambda _: None).feed(b'x'*65537)
        events = BrowserFrames(lambda _: None)
        for _ in range(1000): events.feed(b'{"stage":"visit","message":"ok"}\n')
        with self.assertRaises(ValueError): events.feed(b'{"stage":"visit","message":"ok"}\n')

    def test_profile_owned_batch_assigns_before_resume_and_validates_complete_set(self):
        import tempfile
        import threading
        from pathlib import Path
        from tests.backend.test_daily_news_source import FakeAPI
        class API(FakeAPI):
            def __init__(inner):
                super().__init__()
                inner.output = [json.dumps(self.frame()).encode()+b'\n', json.dumps({'schema':1,'type':'done','token':'a'*32,'revision':1}).encode()+b'\n']
            def read(inner, pipe):
                if inner.output: return inner.output.pop(0)
                inner.running = False
                return b''
        with tempfile.TemporaryDirectory() as folder:
            api = API()
            batch = feed.ProfileFeedBatch(folder, [self.source()], 'a'*32, 1, 10, threading.Event(), api=api, clock=lambda: 0)
            frames, reason, cleaned = batch.run()
            self.assertTrue(cleaned)
            self.assertIsNone(reason)
            self.assertEqual(len(frames), 1)
            operations = [c[0] for c in api.calls]
            self.assertLess(operations.index('assign'), operations.index('resume'))
            self.assertFalse((Path(folder) / 'feed-request.json').exists())

    def test_browser_owned_batch_output_and_cleanup_failure(self):
        import tempfile
        import threading
        from pathlib import Path
        from control_everything.workspace.news_research import BrowserBatch
        from tests.backend.test_daily_news_source import FakeAPI
        for fail in (None, 'assign'):
            with self.subTest(fail=fail), tempfile.TemporaryDirectory() as folder:
                class API(FakeAPI):
                    def read(inner, pipe):
                        inner.running = False
                        return b''
                api = API(fail=fail)
                batch = BrowserBatch('synthetic-node', Path(folder) / 'request.json', threading.Event(), lambda _: None, api=api)
                frames, reason, cleaned = batch.run()
                self.assertTrue(cleaned)
                self.assertEqual(reason, 'worker_failed' if fail else None)
                operations = [c[0] for c in api.calls]
                if fail: self.assertNotIn('resume', operations)
                else: self.assertLess(operations.index('assign'), operations.index('resume'))
