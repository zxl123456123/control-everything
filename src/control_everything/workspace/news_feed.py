"""Bounded profile feed worker; public fixed-feed protocol remains unchanged."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import copy
import hashlib
import http.client
import ipaddress
import json
from pathlib import Path
import re
import socket
import ssl
import sys
import time
from urllib.parse import urljoin, urlsplit

if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from control_everything.workspace.news_parse import parse_feed_result, parse_hn_result
from control_everything.workspace.news_settings import normalize_url, strict_json, atomic_bytes
from control_everything.workspace.news_worker import OwnedBatch, NewsWindowsAPI, validate_result, _pairs, LINE_BYTES, HN

REASONS = {'timeout', 'http_error', 'oversize', 'invalid_feed', 'unsupported_format', 'parse_budget',
           'redirect_rejected', 'encoding_unsupported', 'worker_failed', 'platform_unsupported',
           'private_address', 'unsupported_content_type', 'invalid_url'}
MIMES = {'application/rss+xml', 'application/atom+xml', 'application/xml', 'text/xml', 'text/plain'}
CONTENT_FIELDS = {'body_blocks', 'images', 'content_kind', 'content_truncated'}


def checked_url(url):
    try:
        normalize_url(url)
        return urlsplit(url)
    except (ValueError, UnicodeError):
        raise ValueError('invalid_url') from None


def public_addresses(host, *, resolver=socket.getaddrinfo):
    addresses = resolver(host, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('private_address')
    return addresses


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, addresses, *, deadline, clock=time.monotonic, socket_factory=socket.socket, context=None):
        self.addresses, self.deadline, self.clock, self.socket_factory = addresses, deadline, clock, socket_factory
        super().__init__(host, timeout=max(.001, deadline - clock()), context=context or ssl.create_default_context())

    def connect(self):
        last = None
        for family, kind, protocol, _, address in self.addresses:
            remaining = self.deadline - self.clock()
            if remaining <= 0:
                raise TimeoutError()
            raw = self.socket_factory(family, kind, protocol)
            raw.settimeout(remaining)
            try:
                raw.connect(address)
                self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
                return
            except OSError as error:
                raw.close()
                last = error
        raise last or OSError('connection_failed')


def fetch_feed(source, deadline, *, resolver=socket.getaddrinfo, connection_factory=PinnedHTTPSConnection, clock=time.monotonic):
    url = source['url']
    for hop in range(4):
        parsed = checked_url(url)
        if clock() >= deadline:
            raise TimeoutError()
        addresses = public_addresses(parsed.hostname, resolver=resolver)
        if clock() >= deadline:
            raise TimeoutError()
        connection = connection_factory(parsed.hostname, addresses, deadline=deadline, clock=clock)
        try:
            target = parsed.path or '/'
            if parsed.query:
                target += '?' + parsed.query
            connection.request('GET', target, headers={'Host': parsed.netloc, 'User-Agent': 'MianbanWorkspace/1.0',
                               'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain',
                               'Accept-Encoding': 'identity'})
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader('Location')
                if not location or hop == 3 or any(ord(c) <= 32 for c in location) or '\\' in location:
                    raise ValueError('redirect_rejected')
                url = urljoin(url, location)
                checked_url(url)
                continue
            if response.status != 200:
                raise ValueError('http_error')
            mime = response.headers.get_content_type()
            permitted = {'application/json', 'text/plain'} if source['id'] == 'hn' and source['url'] == HN[2] else MIMES
            if mime not in permitted:
                raise ValueError('unsupported_content_type')
            if response.headers.get('Content-Encoding', 'identity').lower() not in ('', 'identity'):
                raise ValueError('encoding_unsupported')
            length = response.headers.get('Content-Length')
            if length is not None and (not re.fullmatch(r'\d+', length) or int(length) > 1048576):
                raise ValueError('oversize')
            data = bytearray()
            while True:
                remaining = deadline - clock()
                if remaining <= 0:
                    raise TimeoutError()
                transport = connection.sock or getattr(getattr(response.fp, 'raw', None), '_sock', None)
                if transport:
                    transport.settimeout(remaining)
                chunk = response.read(min(65536, 1048577 - len(data)))
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > 1048576:
                    raise ValueError('oversize')
            stamp = datetime.now(timezone.utc).isoformat()
            result = parse_hn_result(bytes(data), stamp) if source['kind'] == 'hn' else parse_feed_result(
                bytes(data), source['id'], source['name'], stamp, feed_url=url, include_content=True)
            return result, url, mime, stamp
        finally:
            connection.close()
    raise ValueError('redirect_rejected')


def _bounded_frame(frame):
    # Preserve basic facts; trim only opt-in content in original article order.
    if frame['result']:
        for item in reversed(frame['result']['items']):
            while len(json.dumps(frame, ensure_ascii=False).encode('utf-8')) > LINE_BYTES:
                if item.get('images'):
                    item['images'].pop()
                elif item.get('body_blocks'):
                    item['body_blocks'].pop()
                else:
                    break
                item['content_truncated'] = True
    if len(json.dumps(frame, ensure_ascii=False).encode('utf-8')) > LINE_BYTES:
        raise ValueError('oversize')
    return frame


def collect_source(source, token, revision):
    stamp = datetime.now(timezone.utc).isoformat()
    frame = {'schema': 1, 'type': 'source', 'token': token, 'revision': revision, 'source_id': source['id'],
             'result': None, 'reason': None, 'url': source['url'], 'mime': None, 'fetched_at': stamp}
    try:
        result, url, mime, stamp = fetch_feed(source, time.monotonic() + 15)
        frame.update(result=result, url=url, mime=mime, fetched_at=stamp)
        return _bounded_frame(frame)
    except (OSError, http.client.HTTPException, ValueError) as error:
        frame['reason'] = 'timeout' if isinstance(error, TimeoutError) else str(error) if str(error) in REASONS else 'http_error'
        frame['result'] = None
        return frame


class ProfileFeedFrames:
    def __init__(self, sources, token, revision):
        self.sources = {s['id']: s for s in sources}
        self.token, self.revision = token, revision
        self.pending = bytearray()
        self.frames, self.seen, self.total = [], set(), 0
        self.done = False

    def feed(self, data):
        self.total += len(data)
        if self.total > len(self.sources) * (LINE_BYTES + 1) + 256:
            raise ValueError('oversize')
        self.pending.extend(data)
        while b'\n' in self.pending:
            line, _, self.pending = self.pending.partition(b'\n')
            if len(line) > LINE_BYTES or self.done:
                raise ValueError('worker_failed')
            value = json.loads(line.decode('utf-8'), object_pairs_hook=_pairs,
                               parse_constant=lambda _: (_ for _ in ()).throw(ValueError('worker_failed')))
            self.accept(value)
        if len(self.pending) > LINE_BYTES:
            raise ValueError('oversize')

    def accept(self, value):
        common = {'schema', 'type', 'token', 'revision'}
        if (not isinstance(value, dict) or type(value.get('schema')) is not int or value.get('schema') != 1
                or value.get('token') != self.token or type(value.get('revision')) is not int or value['revision'] != self.revision):
            raise ValueError('worker_failed')
        if set(value) == common and value['type'] == 'done':
            if self.seen != set(self.sources):
                raise ValueError('worker_failed')
            self.done = True
            return
        if set(value) != common | {'source_id', 'result', 'reason', 'url', 'mime', 'fetched_at'} or value['type'] != 'source':
            raise ValueError('worker_failed')
        key = value['source_id']
        if key not in self.sources or key in self.seen or value['reason'] not in REASONS | {None}:
            raise ValueError('worker_failed')
        checked_url(value['url'])
        if not isinstance(value['fetched_at'], str) or len(value['fetched_at']) > 64 or datetime.fromisoformat(value['fetched_at']).tzinfo is None:
            raise ValueError('worker_failed')
        if value['mime'] is not None and (not isinstance(value['mime'], str) or len(value['mime']) > 128):
            raise ValueError('worker_failed')
        result = value['result']
        source = self.sources[key]
        if value['reason'] is None:
            if not isinstance(result, dict) or not isinstance(result.get('items'), list):
                raise ValueError('worker_failed')
            basic = copy.deepcopy(result)
            for original, item in zip(result['items'], basic['items']):
                if source['kind'] != 'hn':
                    if not CONTENT_FIELDS <= set(original):
                        raise ValueError('worker_failed')
                    for field in CONTENT_FIELDS:
                        item.pop(field)
                    self.validate_content(original)
                expected = hashlib.sha256((key + ':' + original['url']).encode()).hexdigest()[:24]
                if original['id'] != expected:
                    raise ValueError('worker_failed')
            validate_result(basic, key, source['name'], 'hn' if source['kind'] == 'hn' else 'ai')
        elif result is not None:
            raise ValueError('worker_failed')
        self.seen.add(key)
        self.frames.append(value)

    @staticmethod
    def validate_content(item):
        if item['content_kind'] not in ('summary', 'feed_content') or type(item['content_truncated']) is not bool:
            raise ValueError('worker_failed')
        blocks, images = item['body_blocks'], item['images']
        if (not isinstance(blocks, list) or len(blocks) > 64 or any(not isinstance(b, dict) or set(b) != {'type', 'text'}
                or b['type'] not in ('p', 'h2', 'li') or not isinstance(b['text'], str) or not b['text'] for b in blocks)
                or sum(len(b['text']) for b in blocks) > 24000 or not isinstance(images, list) or len(images) > 12):
            raise ValueError('worker_failed')
        for image in images:
            if not isinstance(image, dict) or set(image) != {'url', 'alt', 'caption'}:
                raise ValueError('worker_failed')
            checked_url(image['url'])
            if any(not isinstance(image[f], str) or len(image[f]) > 300 for f in ('alt', 'caption')):
                raise ValueError('worker_failed')


class ProfileFeedAPI(NewsWindowsAPI):
    def __init__(self, request):
        super().__init__()
        self.request = request

    def spawn(self, owned, stream, token):
        owned.process, owned.thread, owned.pid = self.base.spawn(sys.executable,
            ['-I', '-B', '-X', 'utf8', str(Path(__file__).resolve()), '1', token, str(self.request)],
            Path(__file__).resolve().parents[2], owned.child_handles)


class ProfileFeedBatch(OwnedBatch):
    def __init__(self, root, sources, token, revision, deadline, stop, *, api=None, clock=time.monotonic):
        self.request_path = Path(root) / 'feed-request.json'
        self.request = {'schema': 1, 'token': token, 'revision': revision, 'sources': sources}
        self._validate_request(self.request)
        super().__init__('profile', token, deadline, stop, api=api, clock=clock)
        self.frames = ProfileFeedFrames(sources, token, revision)

    @staticmethod
    def _validate_request(value):
        if (not isinstance(value, dict) or set(value) != {'schema', 'token', 'revision', 'sources'}
                or type(value['schema']) is not int or value['schema'] != 1 or not isinstance(value['token'], str)
                or not re.fullmatch('[a-f0-9]{32}', value['token']) or type(value['revision']) is not int or value['revision'] < 0
                or not isinstance(value['sources'], list) or not 1 <= len(value['sources']) <= 24):
            raise ValueError('worker_failed')
        seen = set()
        for s in value['sources']:
            if (not isinstance(s, dict) or set(s) != {'id', 'kind', 'url', 'name', 'enabled', 'group', 'include', 'exclude'}
                    or not isinstance(s['id'], str) or not re.fullmatch(r'(?:google_ai|openai|huggingface|hn|feed_[a-f0-9]{32})', s['id'])
                    or s['id'] in seen or s['enabled'] is not True or not isinstance(s['name'], str) or not 1 <= len(s['name']) <= 80
                    or s['kind'] not in ('rss', 'hn') or s['kind'] == 'hn' and (s['id'] != 'hn' or s['url'] != HN[2])):
                raise ValueError('worker_failed')
            checked_url(s['url'])
            seen.add(s['id'])

    def run(self):
        atomic_bytes(self.request_path, json.dumps(self.request, ensure_ascii=False).encode())
        try:
            self._validate_request(strict_json(self.request_path.read_bytes()))
            self.api = self.api or ProfileFeedAPI(self.request_path)
            return super().run()
        finally:
            # A live or unverified worker may still be reading its request.
            if self.process is None and self.job is None:
                self.request_path.unlink(missing_ok=True)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 3 or argv[0] != '1' or not re.fullmatch('[a-f0-9]{32}', argv[1]):
        return 2
    path = Path(argv[2])
    if path.name != 'feed-request.json' or not path.is_absolute():
        return 2
    request = strict_json(path.read_bytes())
    ProfileFeedBatch._validate_request(request)
    if request['token'] != argv[1]:
        return 2
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(collect_source, source, request['token'], request['revision']) for source in request['sources']]
        for future in as_completed(futures):
            sys.stdout.buffer.write(json.dumps(future.result(), ensure_ascii=False).encode('utf-8') + b'\n')
            sys.stdout.buffer.flush()
    print(json.dumps({'schema': 1, 'type': 'done', 'token': request['token'], 'revision': request['revision']}), flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
