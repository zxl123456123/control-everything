"""Plain-text reading for server-selected public news sources."""
from datetime import datetime, timezone
import hashlib
import http.client
import ipaddress
import json
from pathlib import Path
from queue import Empty, Queue
import re
import socket
import ssl
import threading
import time
from urllib.parse import urljoin, urlsplit

HOSTS = {'google_ai': 'blog.google', 'openai': 'openai.com', 'huggingface': 'huggingface.co'}
MAX_BYTES = 3 * 1024 * 1024
TIMEOUT = 12
FAILURE_RETRY_SECONDS = 60
IMAGE_EXTRACTION_VERSION = 1
PRUNE_XPATH = ['//script', '//style', '//noscript', '//nav', '//footer', '//form',
               '//iframe', '//*[@hidden]', '//*[@aria-hidden="true"]']


def _now():
    return datetime.now(timezone.utc).isoformat()


def _validate_url(url, host):
    try:
        parsed = urlsplit(url)
        if (not isinstance(url, str) or len(url) > 2048 or any(ord(c) <= 32 for c in url)
                or '\\' in url or parsed.scheme != 'https' or parsed.hostname != host
                or parsed.username is not None or parsed.password is not None
                or parsed.port not in (None, 443) or parsed.fragment):
            raise ValueError('unsupported_url')
        return parsed
    except (TypeError, ValueError):
        raise ValueError('unsupported_url') from None


def _public_addresses(host, timeout=4):
    resolved = Queue(maxsize=1)
    def resolve():
        try:
            resolved.put(socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM))
        except OSError as error:
            resolved.put(error)
    threading.Thread(target=resolve, daemon=True).start()
    try:
        addresses = resolved.get(timeout=timeout)
    except Empty:
        raise TimeoutError() from None
    if isinstance(addresses, OSError):
        raise addresses
    if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
        raise ValueError('private_address')
    return addresses


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """Connect to a checked address while retaining hostname-based TLS verification."""
    def connect(self):
        deadline = time.monotonic() + self.timeout
        last_error = None
        for family, kind, protocol, _, address in _public_addresses(self.host, self.timeout):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError()
            raw = socket.socket(family, kind, protocol)
            raw.settimeout(remaining)
            try:
                raw.connect(address)
                self.sock = self._context.wrap_socket(raw, server_hostname=self.host)
                return
            except OSError as error:
                raw.close()
                last_error = error
        raise last_error or OSError('connection_failed')


def _read_response(response, connection, deadline):
    if response.headers.get('Content-Encoding', 'identity').lower() not in ('', 'identity'):
        raise ValueError('encoding_unsupported')
    if response.headers.get_content_type() not in ('text/html', 'application/xhtml+xml'):
        raise ValueError('unsupported_content_type')
    length = response.headers.get('Content-Length')
    if length is not None and int(length) > MAX_BYTES:
        raise ValueError('oversize')
    data = bytearray()
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError()
        if connection.sock:
            connection.sock.settimeout(min(4, remaining))
        chunk = response.read(min(65536, MAX_BYTES + 1 - len(data)))
        if not chunk:
            return bytes(data)
        data.extend(chunk)
        if len(data) > MAX_BYTES:
            raise ValueError('oversize')


def _fetch_html(url, host):
    deadline = time.monotonic() + TIMEOUT
    for hop in range(4):
        parsed = _validate_url(url, host)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError()
        connection = _PinnedHTTPSConnection(host, timeout=min(4, remaining), context=ssl.create_default_context())
        try:
            target = parsed.path or '/'
            if parsed.query:
                target += '?' + parsed.query
            connection.request('GET', target, headers={'User-Agent': 'MianbanWorkspace/1.0',
                                'Accept': 'text/html', 'Accept-Encoding': 'identity'})
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader('Location')
                if not location or hop == 3 or '\\' in location or any(ord(c) <= 32 for c in location):
                    raise ValueError('redirect_rejected')
                url = urljoin(url, location)
                try:
                    _validate_url(url, host)
                except ValueError:
                    raise ValueError('redirect_rejected') from None
                continue
            if response.status != 200:
                raise ValueError('http_' + str(response.status))
            return _read_response(response, connection, deadline), url
        finally:
            connection.close()
    raise ValueError('redirect_rejected')


def _extract_tree(html, source_url, include_images=False):
    if len(html) > MAX_BYTES:
        raise ValueError('oversize')
    try:
        from trafilatura import bare_extraction
    except ImportError:
        raise ValueError('extractor_unavailable') from None
    article = bare_extraction(html, url=source_url, favor_precision=True,
                              include_comments=False, include_tables=True,
                              include_images=include_images, include_links=False,
                              include_formatting=True, with_metadata=False,
                              prune_xpath=PRUNE_XPATH)
    if article is None or article.body is None:
        raise ValueError('extraction_insufficient')
    return article.body


def extract_blocks(html, source_url):
    """Use the mature extractor, then expose text only rather than source HTML."""
    body = _extract_tree(html, source_url)
    blocks = []
    for node in body.iter():
        if node.tag not in ('p', 'head', 'item', 'cell', 'quote', 'code'):
            continue
        if any(parent.tag in ('p', 'head', 'item', 'cell', 'quote', 'code') for parent in node.iterancestors()):
            continue
        text = ''.join(node.itertext())
        text = text.replace('\r\n', '\n').replace('\r', '\n').strip('\n') if node.tag == 'code' else re.sub(r'\s+', ' ', text).strip()
        kind = {'head': {'h3': 'h3', 'h4': 'h4', 'h5': 'h4', 'h6': 'h4'}.get(node.get('rend'), 'h2'),
                'item': 'li', 'quote': 'quote', 'code': 'code'}.get(node.tag, 'p')
        if text.strip():
            blocks.append({'type': kind, 'text': text})
    if sum(len(row['text']) for row in blocks) < 350 or len(blocks) < 2:
        raise ValueError('extraction_insufficient')
    return blocks


def _image_url(value, source_url):
    """Return source-owned HTTPS image URLs without making image requests."""
    if not isinstance(value, str) or not value or len(value) > 2048:
        return None
    if '\\' in value or any(ord(char) <= 32 for char in value):
        return None
    try:
        url = urljoin(source_url, value)
        parsed = urlsplit(url)
        source_host = urlsplit(source_url).hostname
        permitted = parsed.hostname == source_host and source_host in HOSTS.values()
        if (source_host == 'blog.google' and parsed.hostname == 'storage.googleapis.com'
                and parsed.path.startswith('/gweb-uniblog-publish-prod/images/')):
            permitted = True
        if (len(url) > 2048 or not permitted or parsed.scheme != 'https' or parsed.username is not None
                or parsed.password is not None or parsed.port not in (None, 443)
                or parsed.fragment or not re.search(r'\.(?:avif|gif|jpe?g|png|webp)$', parsed.path, re.I)):
            return None
        return url
    except ValueError:
        return None


def _image_candidates(node, source_url):
    candidates = []
    for attr in ('data-src', 'src'):
        if url := _image_url(node.get(attr), source_url):
            candidates.append((0, url))
    for attr in ('data-srcset', 'srcset'):
        for part in node.get(attr, '').split(','):
            fields = part.split()
            if len(fields) == 2 and re.fullmatch(r'[1-9]\d*w', fields[1]):
                if url := _image_url(fields[0], source_url):
                    candidates.append((int(fields[1][:-1]), url))
    return candidates


def extract_images(html, source_url):
    """Keep article images selected by Trafilatura and enrich from their source nodes."""
    body = _extract_tree(html, source_url, include_images=True)
    from trafilatura.utils import load_html
    tree = load_html(html)
    if tree is None:
        return []
    originals = {}
    for node in tree.iter('img'):
        for _, url in _image_candidates(node, source_url):
            originals.setdefault(url, node)
    og_images = {_image_url(node.get('content'), source_url)
                 for node in tree.xpath('//meta[@property="og:image"]')}
    images, seen = [], set()
    for graphic in body.iter('graphic'):
        source = _image_url(graphic.get('src'), source_url)
        if not source:
            continue
        node = originals.get(source)
        if node is None:
            continue
        lineage = [node, *node.iterancestors()]
        if any(parent.tag in ('nav', 'header', 'footer', 'aside', 'form')
               or parent.get('hidden') is not None or parent.get('aria-hidden') == 'true'
               or re.search(r'(?:display\s*:\s*none|visibility\s*:\s*hidden)', parent.get('style', ''), re.I)
               for parent in lineage):
            continue
        decorative = ' '.join([node.get('class', ''), node.get('id', ''), urlsplit(source).path])
        if re.search(r'(?:^|[-_./\s])(logo|icon|avatar|tracking|pixel|spacer)(?:[-_./\s]|$)', decorative, re.I):
            continue
        if any(re.fullmatch(r'\d+(?:px)?', node.get(attr, ''))
               and int(node.get(attr).removesuffix('px')) < 80 for attr in ('width', 'height')):
            continue
        candidates = _image_candidates(node, source_url)
        wide = [row for row in candidates if row[0] >= 1200]
        url = min(wide)[1] if wide else max(candidates, key=lambda row: row[0])[1]
        if url in seen:
            continue
        seen.add(url)
        figures = node.xpath('ancestor::figure[1]//figcaption')
        caption = ' '.join(''.join(part.itertext()) for part in figures)
        context = ' '.join(parent.get('class', '') for parent in lineage[:6])
        is_cover = source in og_images or re.search(r'(?:^|[-_\s])hero(?:[-_\s]|$)', context)
        images.append({'url': url, 'alt': re.sub(r'\s+', ' ', node.get('alt', '')).strip(),
                       'caption': re.sub(r'\s+', ' ', caption).strip(),
                       'kind': 'cover' if is_cover else 'body'})
    return images


def load_article(item, cache_root, *, retry=False):
    """Accept a server-selected feed item, never a user-submitted URL parameter."""
    if not isinstance(item, dict) or not re.fullmatch('[a-f0-9]{24}', str(item.get('id', ''))):
        raise ValueError('invalid_item')
    source_url = item.get('url', '')
    expected = hashlib.sha256((str(item.get('source_id')) + ':' + source_url).encode()).hexdigest()[:24]
    if item['id'] != expected or not isinstance(item.get('title'), str):
        raise ValueError('invalid_item')
    cache_root = Path(cache_root)
    cache_root.mkdir(parents=True, exist_ok=True)
    cache = cache_root / (item['id'] + '.json')
    summary = item.get('summary')
    summary_blocks = [{'type': 'p', 'text': summary}] if isinstance(summary, str) and summary else []
    feed_blocks = [{'type': 'p', 'text': text} for text in item.get('feed_content', '').split('\n\n') if text.strip()]
    fallback_blocks = feed_blocks or summary_blocks
    if cache.is_file():
        saved = json.loads(cache.read_text(encoding='utf-8'))
        if saved.get('source_url') == source_url and saved.get('id') == item['id']:
            # Feed metadata can change without changing the source URL or article ID.
            current = {**saved, 'title': item['title'], 'feed_fetched_at': item.get('fetched_at')}
            if saved.get('content_kind') == 'full_text':
                html_cache = cache.with_suffix('.html')
                if saved.get('images_version') != IMAGE_EXTRACTION_VERSION and html_cache.is_file():
                    try:
                        current['images'] = extract_images(html_cache.read_bytes(), saved.get('resolved_url', source_url))
                        current['images_version'] = IMAGE_EXTRACTION_VERSION
                        cache.write_text(json.dumps(current, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
                    except (OSError, ValueError):
                        pass
                return current
            try:
                age = (datetime.fromisoformat(_now()) - datetime.fromisoformat(saved['fetched_at'])).total_seconds()
            except (KeyError, TypeError, ValueError):
                age = FAILURE_RETRY_SECONDS
            if not retry and (saved.get('reason') == 'unsupported_source' and item.get('source_id') != 'hn'
                              or saved.get('reason') != 'unsupported_source' and 0 <= age < FAILURE_RETRY_SECONDS):
                # Keep the attempt time; a new feed sample must not extend the cooldown.
                return {**current, 'blocks': fallback_blocks, 'feed_content': bool(feed_blocks),
                        'feed_content_truncated': item.get('feed_content_truncated', False)}
    result = {'id': item['id'], 'title': item['title'],
              'blocks': fallback_blocks, 'feed_content': bool(feed_blocks),
              'feed_content_truncated': item.get('feed_content_truncated', False),
              'images': [], 'content_kind': 'summary', 'reason': None,
              'source_url': source_url, 'fetched_at': _now()}
    host = HOSTS.get(item.get('source_id'))
    if item.get('source_id') == 'hn':
        host = urlsplit(source_url).hostname
    try:
        if host is None:
            raise ValueError('unsupported_source')
        _validate_url(source_url, host)
        html, resolved_url = _fetch_html(source_url, host)
        try:
            result['images'] = extract_images(html, resolved_url)
            result['images_version'] = IMAGE_EXTRACTION_VERSION
        except ValueError:
            pass
        result['blocks'] = extract_blocks(html, resolved_url)
        result['content_kind'] = 'full_text'
        result['resolved_url'] = resolved_url
        result['html_sha256'] = hashlib.sha256(html).hexdigest()
        (cache_root / (item['id'] + '.html')).write_bytes(html)
    except TimeoutError:
        result['reason'] = 'timeout'
    except (OSError, http.client.HTTPException):
        result['reason'] = 'network_error'
    except ValueError as error:
        known = {'unsupported_source', 'unsupported_url', 'private_address', 'redirect_rejected',
                 'oversize', 'encoding_unsupported', 'unsupported_content_type',
                 'extraction_insufficient', 'extractor_unavailable'}
        result['reason'] = str(error) if str(error) in known or re.fullmatch(r'http_\d{3}', str(error)) else 'extraction_failed'
    result['fetched_at'] = _now()
    result['feed_fetched_at'] = item.get('fetched_at')
    cache.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return result
