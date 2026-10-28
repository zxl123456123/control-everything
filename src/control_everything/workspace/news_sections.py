"""User-defined reading sections (专栏): what is stored, how it is validated and how custom feeds are fetched.

A section is a named bundle of feeds with an optional keyword filter. ``ai`` and ``hn`` are preset sections: they keep
their hardened worker-backed sources, but the user may rename, recolour, reorder, delete and restore them. Custom
sections read their feeds in-process through :mod:`news_feeds`.
"""
import hashlib
import json
import re
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from control_everything.workspace import news_feeds
from control_everything.workspace.news_catalog import BY_URL, PRESETS

MAX_SECTIONS, MAX_SOURCES, MAX_KEYWORDS, MAX_ITEMS = 12, 12, 10, 60
COLORS = ('teal', 'orange', 'blue', 'purple', 'pink', 'green', 'red', 'gray')
STALE_AFTER, RETRY_AFTER = 900, 60


class SectionError(ValueError):
    """Raised when a section payload is not acceptable; ``code`` is machine readable."""

    def __init__(self, code):
        super().__init__(code)
        self.code = code


def source_id(url):
    """Stable id of a feed URL: the catalogue id when known, otherwise a short hash."""
    row = BY_URL.get(url)
    return row['id'] if row else 'u' + hashlib.sha1(url.encode('utf-8')).hexdigest()[:10]


def _text(value, limit, code, *, empty=False):
    if not isinstance(value, str):
        raise SectionError(code)
    value = re.sub(r'\s+', ' ', value).strip()
    if (not value and not empty) or len(value) > limit or any(unicodedata.category(c).startswith('C') for c in value):
        raise SectionError(code)
    return value


def _words(value, code):
    if not isinstance(value, list) or len(value) > MAX_KEYWORDS:
        raise SectionError(code)
    seen, rows = set(), []
    for word in value:
        word = _text(word, 30, code)
        if word.casefold() not in seen:
            seen.add(word.casefold())
            rows.append(word)
    return rows


def _source(row):
    if not isinstance(row, dict) or not set(row) <= {'id', 'url', 'name'} or 'url' not in row:
        raise SectionError('invalid_source')
    url = _text(row['url'], 500, 'invalid_source')
    if not url.startswith('https://'):
        raise SectionError('invalid_source_url')
    try:
        news_feeds.check_url(url, proxied=True)  # syntax and literal-address policy; DNS is checked at fetch time
    except news_feeds.FeedError:
        raise SectionError('invalid_source_url') from None
    known = BY_URL.get(url)
    name = _text(row.get('name') or (known['name'] if known else (url.split('/')[2])), 40, 'invalid_source', empty=False)
    return {'id': source_id(url), 'url': url, 'name': name}


def default_sections():
    return [dict(section, sources=[], include=[], exclude=[]) for section in PRESETS]


def normalise(payload, previous=()):
    """Validate a full replacement list. Returns ``(sections, removed_presets)``; raises SectionError."""
    if not isinstance(payload, list) or len(payload) > MAX_SECTIONS:
        raise SectionError('invalid_sections')
    known = {section['id']: section for section in previous}
    presets = {section['id']: section for section in PRESETS}
    rows, ids = [], set()
    for raw in payload:
        if not isinstance(raw, dict) or not set(raw) <= {'id', 'name', 'emoji', 'color', 'sources', 'include', 'exclude', 'preset'}:
            raise SectionError('invalid_section')
        identity = raw.get('id')
        if identity is not None and (not isinstance(identity, str) or not re.fullmatch(r'[a-z][a-z0-9]{1,15}', identity)):
            raise SectionError('invalid_section')
        preset = identity in presets
        if identity is not None and not preset and identity not in known:
            raise SectionError('unknown_section')
        if identity is None:
            identity = 'c' + hashlib.sha1(('%s%s' % (time.time_ns(), len(rows))).encode()).hexdigest()[:9]
        if identity in ids:
            raise SectionError('duplicate_section')
        ids.add(identity)
        color = raw.get('color', presets[identity]['color'] if preset else COLORS[len(rows) % len(COLORS)])
        if color not in COLORS:
            raise SectionError('invalid_color')
        emoji = _text(raw.get('emoji', ''), 8, 'invalid_emoji', empty=True)
        row = {'id': identity, 'name': _text(raw.get('name'), 16, 'invalid_name'), 'emoji': emoji, 'color': color,
               'sources': [], 'include': [], 'exclude': []}
        if preset:
            row['preset'] = presets[identity]['preset']
        else:
            sources = raw.get('sources', [])
            if not isinstance(sources, list) or len(sources) > MAX_SOURCES:
                raise SectionError('too_many_sources')
            row['sources'] = list({item['url']: item for item in map(_source, sources)}.values())
            row['include'] = _words(raw.get('include', []), 'invalid_keywords')
            row['exclude'] = _words(raw.get('exclude', []), 'invalid_keywords')
        rows.append(row)
    return rows, [key for key in presets if key not in ids]


def keep(item, include, exclude):
    """Keyword filter: any ``include`` word must occur (when given) and no ``exclude`` word may occur."""
    haystack = ' '.join(str(item.get(key) or '') for key in ('title', 'summary', 'source_name')).casefold()
    if include and not any(word.casefold() in haystack for word in include):
        return False
    return not any(word.casefold() in haystack for word in exclude)


class SectionStore:
    """sections.json inside the profile's reader root."""

    def __init__(self, read, write):
        self._read, self._write = read, write
        stored = read('sections.json', None)
        try:
            self.sections, self.removed = normalise(stored['sections'], stored['sections']) if isinstance(stored, dict) else (default_sections(), [])
        except (SectionError, KeyError, TypeError):
            self.sections, self.removed = default_sections(), []

    def save(self, payload):
        sections, removed = normalise(payload, self.sections)
        self._write('sections.json', {'version': 1, 'sections': sections})
        self.sections, self.removed = sections, removed
        return self.view()

    def restore_presets(self):
        have = {section['id'] for section in self.sections}
        return self.save(self.sections + [dict(s, sources=[], include=[], exclude=[]) for s in PRESETS if s['id'] not in have])

    def view(self):
        return {'sections': self.sections, 'removed_presets': self.removed}


class SectionFeeds:
    """Background fetch + cache of custom feeds, one entry per URL. Never blocks the reader response."""

    def __init__(self, read, write, *, fetcher=None, executor=None, clock=time.time):
        self._read, self._write, self.clock = read, write, clock
        self.fetcher = fetcher or (lambda url, sid, name: news_feeds.read_feed(url, sid, name))
        self.executor = executor if executor is not None else ThreadPoolExecutor(max_workers=4, thread_name_prefix='news-sections')
        self.lock = threading.RLock()
        cache = read('section-cache.json', {})
        self.cache = cache if isinstance(cache, dict) else {}
        self.pending = set()
        self.closed = False

    def _state(self, entry):
        stale = RETRY_AFTER if entry and entry.get('error') else STALE_AFTER
        return not entry or self.clock() - entry.get('at', 0) > stale

    def request(self, sources, *, force=False):
        """Schedule fetches for stale sources; returns True when anything is in flight."""
        with self.lock:
            if self.closed:
                return False
            for source in sources:
                if source['url'] not in self.pending and (force or self._state(self.cache.get(source['url']))):
                    self.pending.add(source['url'])
                    self.executor.submit(self._fetch, source)
            return bool(self.pending & {source['url'] for source in sources})

    def _fetch(self, source):
        entry = {'at': self.clock()}
        try:
            got = self.fetcher(source['url'], source['id'], source['name'])
            entry['items'] = got['result']['items'][:20]
            entry['ok_at'] = got['fetched_at']
            entry['title'] = got.get('title')
        except news_feeds.FeedError as error:
            entry['error'] = news_feeds.describe(error.code)
            entry['error']['code'] = error.code
            entry['items'] = (self.cache.get(source['url']) or {}).get('items', [])
            entry['ok_at'] = (self.cache.get(source['url']) or {}).get('ok_at')
        except Exception:  # a broken third-party feed must never take the reader down
            entry['error'] = {**news_feeds.describe('worker_failed'), 'code': 'worker_failed'}
            entry['items'] = (self.cache.get(source['url']) or {}).get('items', [])
            entry['ok_at'] = (self.cache.get(source['url']) or {}).get('ok_at')
        with self.lock:
            self.pending.discard(source['url'])
            if self.closed:
                return
            self.cache[source['url']] = entry
            try:
                self._write('section-cache.json', self.cache)
            except OSError:
                pass

    def view(self, section, *, force=False):
        """Envelope shaped like the preset streams so the reader treats every section the same way."""
        busy = self.request(section['sources'], force=force)
        items, sources, seen = [], [], set()
        for source in section['sources']:
            entry = self.cache.get(source['url']) or {}
            error = entry.get('error')
            sources.append({'id': source['id'], 'name': source['name'], 'url': source['url'],
                            'last_success_at': entry.get('ok_at'), 'status': 'unavailable' if error else ('available' if entry else 'pending'),
                            'reason': error['code'] if error else None, 'message': error['message'] if error else None,
                            'hint': error['hint'] if error else None})
            for item in entry.get('items', []):
                if item['url'] not in seen and keep(item, section['include'], section['exclude']):
                    seen.add(item['url'])
                    items.append(dict(item))
        items.sort(key=lambda row: row.get('published_at') or '', reverse=True)
        stamps = [row['last_success_at'] for row in sources if row['last_success_at']]
        return {'items': items[:MAX_ITEMS], 'sources': sources, 'refresh': {'state': 'pending' if busy else 'idle', 'reason': None},
                'sampled_at': max(stamps) if stamps else datetime.now(timezone.utc).isoformat()}

    def close(self):
        with self.lock:
            self.closed = True
            self.pending.clear()
        self.executor.shutdown(wait=False, cancel_futures=True)
