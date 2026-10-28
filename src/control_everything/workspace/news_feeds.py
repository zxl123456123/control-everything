"""Fetch one user-chosen RSS/Atom feed with bounded retries and errors a person can act on.

The built-in AI and Hacker News streams keep their isolated worker (``news_worker``). Feeds that a person adds
to a custom section are plain public documents, so they are read in-process here, with the same parser, size
cap and https-only article rule, plus address checks so a feed URL cannot point at the local network.
"""
import gzip
from datetime import datetime, timezone
import ipaddress
import os
import re
import socket
import time
import zlib
from html import unescape
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from control_everything.workspace.news_parse import ATOM, MAX_FEED_BYTES, _tree, parse_feed_result, safe_news_url

UA = 'MianbanWorkspace/1.0 (+feed-reader)'
BROWSER_UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
              'Chrome/126.0 Safari/537.36')
ACCEPT = 'application/atom+xml, application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.4'

# code -> (what happened, what to do). Every failure a person can see maps to exactly one entry.
ERRORS = {
    'bad_url': ('网址格式不正确', '请填写以 http:// 或 https:// 开头的完整订阅地址。'),
    'blocked_address': ('不允许读取本机或内网地址', '该域名解析到了本机/内网地址，也可能是 DNS 被污染；请填写公开网站的订阅地址，或开启系统代理后重试。'),
    'dns_failure': ('无法解析域名', '检查拼写；若是境外站点，可能被网络屏蔽，可开启系统代理后重试。'),
    'timeout': ('连接超时', '站点响应太慢或被网络限制；境外站点可开启系统代理后重试，或换用国内可直连的来源。'),
    'connection_reset': ('连接被中断', '常见于网络封锁或不稳定线路；可开启系统代理后重试，或换用其他来源。'),
    'tls_error': ('安全连接失败', '站点证书或加密握手异常，也可能被网络干扰；可改用其他来源。'),
    'http_403': ('站点拒绝访问（403）', '对方限制了自动读取；可尝试站点的其他订阅地址或换来源。'),
    'http_404': ('订阅地址不存在（404）', '地址可能已变更；可在站点首页查找 RSS 图标，或直接粘贴站点首页让系统自动发现。'),
    'http_429': ('请求过于频繁（429）', '稍后再试。'),
    'http_error': ('站点返回错误', '稍后重试；持续失败请换来源。'),
    'redirect_rejected': ('跳转异常', '订阅地址的跳转过多或指向不支持的地址，请换用站点给出的最终地址。'),
    'oversize': ('订阅内容过大', '单个订阅文件超过 1 MB，请换用更精简的订阅地址。'),
    'not_feed': ('这不是订阅地址', '该网址返回的是普通网页，且未找到 RSS/Atom 订阅入口，请填写订阅地址。'),
    'invalid_feed': ('订阅内容无法解析', '文件不是有效的 RSS/Atom，请确认地址。'),
    'unsupported_format': ('暂不支持这种订阅格式', '目前支持 RSS 2.0 与 Atom；请选择站点提供的这两种格式之一。'),
    'parse_budget': ('订阅条目过多', '请换用条目更少的订阅地址。'),
    'encoding_unsupported': ('订阅编码暂不支持', '请换用其他订阅地址。'),
    'no_items': ('订阅里没有可读文章', '文章链接需为 https；请换用其他订阅地址。'),
    'worker_failed': ('读取未完成', '稍后重试。'),
}
RETRYABLE = {'timeout', 'connection_reset', 'http_error', 'dns_failure'}


class FeedError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code if code in ERRORS else 'worker_failed'


def describe(code):
    message, hint = ERRORS.get(code, ERRORS['worker_failed'])
    return {'code': code if code in ERRORS else 'worker_failed', 'message': message, 'hint': hint}


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def default_opener():
    """System proxies (environment or Windows settings) are honoured, because many users reach foreign sites that way."""
    if os.environ.get('CONTROL_EVERYTHING_NEWS_NO_PROXY') == '1':
        return build_opener(ProxyHandler({}), _NoRedirect())
    return build_opener(ProxyHandler(), _NoRedirect())


def _uses_proxy(url):
    from urllib.request import getproxies
    scheme = urlsplit(url).scheme
    return scheme in getproxies() and os.environ.get('CONTROL_EVERYTHING_NEWS_NO_PROXY') != '1'


def check_url(value, *, resolver=socket.getaddrinfo, proxied=False):
    """Return a normalized public http(s) URL or raise FeedError."""
    if not isinstance(value, str) or not 8 <= len(value.strip()) <= 2048:
        raise FeedError('bad_url')
    value = value.strip()
    if any(ord(char) < 33 for char in value) or '\\' in value:
        raise FeedError('bad_url')
    try:
        parts = urlsplit(value)
        host, port = parts.hostname, parts.port
    except ValueError:
        raise FeedError('bad_url') from None
    if parts.scheme not in ('http', 'https') or not host or parts.username or parts.password:
        raise FeedError('bad_url')
    if port not in (None, 80, 443, 8080, 8443):
        raise FeedError('bad_url')
    lowered = host.lower().rstrip('.')
    if lowered == 'localhost' or lowered.endswith(('.localhost', '.local', '.internal', '.lan', '.home.arpa')):
        raise FeedError('blocked_address')
    try:
        literal = ipaddress.ip_address(lowered.strip('[]'))
    except ValueError:
        literal = None
    if literal is not None:
        if not literal.is_global:
            raise FeedError('blocked_address')
        return value
    if '.' not in lowered:
        raise FeedError('bad_url')
    if proxied:
        return value
    try:
        addresses = {row[4][0] for row in resolver(lowered, port or (443 if parts.scheme == 'https' else 80), type=socket.SOCK_STREAM)}
    except socket.gaierror:
        raise FeedError('dns_failure') from None
    except OSError:
        raise FeedError('dns_failure') from None
    if os.environ.get('CONTROL_EVERYTHING_NEWS_ALLOW_PRIVATE') == '1':
        # Development sandboxes resolve every name to a fake non-global address behind a transparent proxy.
        return value
    if not addresses or any(not ipaddress.ip_address(address.split('%')[0]).is_global for address in addresses):
        raise FeedError('blocked_address')
    return value


def _classify(error):
    if isinstance(error, FeedError):
        return error.code
    if isinstance(error, HTTPError):
        return {403: 'http_403', 404: 'http_404', 410: 'http_404', 429: 'http_429'}.get(error.code, 'http_error')
    reason = error.reason if isinstance(error, URLError) else error
    if isinstance(reason, (TimeoutError, socket.timeout)):
        return 'timeout'
    if isinstance(reason, socket.gaierror):
        return 'dns_failure'
    text = str(reason).lower()
    if 'ssl' in text or 'certificate' in text or 'handshake' in text or getattr(reason, '__class__', None).__name__.startswith('SSL'):
        return 'tls_error'
    if isinstance(reason, (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)) or 'reset' in text or 'eof' in text:
        return 'connection_reset'
    if 'timed out' in text:
        return 'timeout'
    return 'connection_reset' if isinstance(reason, ConnectionError) else 'http_error'


def _read(response, deadline, clock):
    encoding = (response.headers.get('Content-Encoding') or 'identity').lower()
    raw = bytearray()
    while True:
        if deadline - clock() <= 0:
            raise TimeoutError()
        chunk = response.read(65536)
        if not chunk:
            break
        raw.extend(chunk)
        if len(raw) > MAX_FEED_BYTES + 65536:
            raise FeedError('oversize')
    if encoding in ('', 'identity'):
        data = bytes(raw)
    elif encoding in ('gzip', 'x-gzip'):
        data = gzip.GzipFile(fileobj=__import__('io').BytesIO(bytes(raw))).read(MAX_FEED_BYTES + 1)
    elif encoding == 'deflate':
        try:
            data = zlib.decompressobj().decompress(bytes(raw), MAX_FEED_BYTES + 1)
        except zlib.error:
            data = zlib.decompressobj(-15).decompress(bytes(raw), MAX_FEED_BYTES + 1)
    else:
        raise FeedError('encoding_unsupported')
    if len(data) > MAX_FEED_BYTES:
        raise FeedError('oversize')
    return data


def get_document(url, *, opener=None, deadline=None, clock=time.monotonic, sleep=time.sleep, resolver=socket.getaddrinfo,
                 attempts=2):
    """GET with manual redirects, retry on transient failures and one browser-UA retry after a 403.

    Returns ``(data, final_url, mime, tries)`` or raises FeedError."""
    opener = opener or default_opener()
    deadline = deadline if deadline is not None else clock() + 14
    agent, tries, last = UA, 0, None
    while tries < attempts + 1:
        tries += 1
        current = url
        try:
            for hop in range(6):
                if deadline - clock() <= 0:
                    raise TimeoutError()
                current = check_url(current, resolver=resolver, proxied=_uses_proxy(current))
                request = Request(current, headers={'User-Agent': agent, 'Accept': ACCEPT, 'Accept-Encoding': 'gzip'})
                try:
                    response = opener.open(request, timeout=max(1, min(8, deadline - clock())))
                except HTTPError as error:
                    if error.code in (301, 302, 303, 307, 308):
                        location = error.headers.get('Location')
                        error.close()
                        if not location or hop == 5:
                            raise FeedError('redirect_rejected') from None
                        target = urljoin(current, location)
                        if urlsplit(current).scheme == 'https' and urlsplit(target).scheme != 'https':
                            raise FeedError('redirect_rejected')
                        current = target
                        continue
                    error.close()
                    raise
                with response:
                    mime = response.headers.get_content_type()[:128]
                    return _read(response, deadline, clock), current, mime, tries
            raise FeedError('redirect_rejected')
        except (FeedError, HTTPError, URLError, OSError, TimeoutError, ValueError, zlib.error, EOFError) as error:
            code = _classify(error)
            last = code
            if code == 'http_403' and agent == UA:
                agent = BROWSER_UA
                continue
            if code in RETRYABLE or (isinstance(error, HTTPError) and error.code >= 500):
                if code == 'dns_failure' and tries >= 2:
                    break
                if tries <= attempts and deadline - clock() > 2:
                    sleep(min(1.0, 0.4 * tries))
                    continue
            break
    raise FeedError(last or 'worker_failed')


_LINK = re.compile(r'<link\b[^>]*>', re.I)


def discover(html, base):
    """Find the first RSS/Atom alternate link in an HTML page."""
    text = html[:200000].decode('utf-8', 'ignore') if isinstance(html, (bytes, bytearray)) else html[:200000]
    for tag in _LINK.findall(text):
        attributes = {name.lower(): unescape(value) for name, _, value in re.findall(r'([\w:-]+)\s*=\s*(["\'])(.*?)\2', tag)}
        if 'alternate' in attributes.get('rel', '').lower() and re.search(r'(rss|atom)\+xml', attributes.get('type', ''), re.I) \
                and attributes.get('href'):
            return urljoin(base, attributes['href'])
    return None


def feed_title(data):
    try:
        root = _tree(data)
    except ValueError:
        return None
    node = root.find(ATOM + 'title') if root.tag == ATOM + 'feed' else (root.find('channel/title') if root.tag == 'rss' else None)
    text = ''.join(node.itertext()).strip() if node is not None else ''
    return re.sub(r'\s+', ' ', text)[:80] or None


def read_feed(url, source_id, name, *, require_items=True, **options):
    """Fetch and parse one feed. Returns the parsed result plus feed metadata, or raises FeedError."""
    data, final, mime, tries = get_document(url, **options)
    discovered = None
    head = data.lstrip(b'\xef\xbb\xbf \t\r\n')[:512].lower()
    if head.startswith((b'<!doctype html', b'<html')) or (b'<rss' not in head and b'<feed' not in head and b'<rdf' not in head
                                                           and b'<?xml' not in head):
        target = discover(data, final)
        if not target:
            raise FeedError('not_feed')
        data, final, mime, more = get_document(target, **options)
        tries += more
        discovered = final
    try:
        fetched = datetime.now(timezone.utc).isoformat()
        result = parse_feed_result(data, source_id, name, fetched, feed_url=final, upgrade_http=True)
    except ValueError as error:
        raise FeedError(str(error) if str(error) in ERRORS else 'invalid_feed') from None
    stamp = datetime.now(timezone.utc).isoformat()
    for item in result['items']:
        item['fetched_at'] = stamp
    if require_items and not result['items']:
        raise FeedError('no_items')
    return {'result': result, 'url': final, 'mime': mime, 'title': feed_title(data), 'tries': tries,
            'discovered_from': discovered, 'fetched_at': stamp}


def probe(url, *, resolver=socket.getaddrinfo, **options):
    """What the add-source dialog shows: feed title, newest article, or a precise reason with a fix hint."""
    try:
        got = read_feed(url, 'probe', 'probe', resolver=resolver, **options)
    except FeedError as error:
        return {'ok': False, 'error': describe(error.code)}
    items = sorted(got['result']['items'], key=lambda row: row.get('published_at') or '', reverse=True)
    latest = items[0] if items else None
    return {'ok': True, 'url': got['url'], 'title': got['title'], 'format': got['result']['format'], 'count': len(items),
            'discovered': got['discovered_from'] is not None,
            'latest': {'title': latest['title'], 'url': latest['url'], 'published_at': latest.get('published_at')} if latest else None}
