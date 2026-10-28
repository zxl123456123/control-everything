"""Reading documents and public capture history belong to one local profile."""
from datetime import datetime, timezone
import copy
import hashlib
import json
import re
from pathlib import Path
import threading

from .news_article import load_article
from .news_research import ResearchJobs
from .news_runtime import NewsRuntime
from .news_settings import atomic_bytes
from .news_sections import SectionFeeds, SectionStore


class NewsReader:
    def __init__(self, root, source, *, runtime_factory=NewsRuntime, runtime=None, fetcher=None):
        self.root, self.source = Path(root).resolve(), source
        self.reader_id = hashlib.sha256(str(self.root).encode('utf-8')).hexdigest()[:32]
        self.lock = threading.RLock()
        self.research = {item['id']: item for item in self._read('research-items.json', [])}
        self.feeds = self._read('feeds.json', {})
        self.known = {}
        self.article_lock = threading.Lock()
        self.jobs = ResearchJobs(self.root, self.merge, self.collected_urls, runtime=runtime)
        self.runtime = runtime_factory(self)
        self.sections = SectionStore(self._read, self._write)
        self.custom = SectionFeeds(self._read, self._write, fetcher=fetcher)
        if self.runtime.owner != 'owned':
            self.custom.close()
        self.sample()

    def collected_urls(self):
        with self.lock:
            return [item['url'] for item in self.research.values() if item.get('body_blocks') and
                    (item.get('content_kind') == 'full_text' or item.get('completeness') == 'feed_content')]

    def _read(self, name, default):
        try:
            return json.loads((self.root / name).read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return default

    def _write(self, name, value):
        self.runtime.require_owner_open()
        atomic_bytes(self.root / name, (json.dumps(value, ensure_ascii=False) + '\n').encode('utf-8'))

    def sample(self, *, refresh=False):
        if refresh:
            return self.runtime.request_feed()
        with self.lock:
            if self.runtime.owner != 'owned':
                self.feeds = self._read('feeds.json', self.feeds)
                self.research = {i['id']: i for i in self._read('research-items.json', list(self.research.values()))}
            streams = {}
            sources = []
            for section in self.sections.sections:
                key = section['id']
                if section.get('preset'):
                    streams[key] = copy.deepcopy(self.feeds.get(section['preset'], {
                        'schema': 1, 'stream': key, 'status': 'pending', 'reason': 'not_loaded',
                        'items': [], 'sources': [], 'sampled_at': None,
                        'refresh': {'state': 'idle', 'reason': None, 'retry_after_ms': 0}}))
                else:
                    streams[key] = self.custom.view(section)
                sources.extend(streams[key].get('sources', []))
            research = list(self.research.values())
            urls = {item['url'] for item in research}
            target = 'ai' if 'ai' in streams else next(iter(streams), None)
            if target:
                streams[target]['items'] = research + [i for i in streams[target]['items'] if i['url'] not in urls]
            def publication(item):
                raw = item.get('published_at') or item.get('submitted_at') or item.get('updated_at') or item.get('published_raw') or ''
                try:
                    date = datetime.fromisoformat(raw.replace('Z', '+00:00'))
                    return (date if date.tzinfo else date.replace(tzinfo=timezone.utc)).timestamp()
                except ValueError:
                    return 0
            if target:
                streams[target]['items'].sort(key=publication, reverse=True)
            for stream in streams.values():
                self.known.update((item['id'], item) for item in stream['items'])
            stamps = [i.get('fetched_at') for stream in streams.values() for i in stream['items'] if i.get('fetched_at')]
            runtime = self.runtime.snapshot()
            return {'reader_id': self.reader_id, 'sample': {'captured_at': max(stamps) if stamps else None,
                    'sources': sources, 'streams': streams}, 'sections': self.sections.view(), 'covers': {'items': []},
                    'refreshing': self.runtime.slot is not None or any(s['refresh']['state'] == 'pending' for s in streams.values()),
                    'settings_revision': self.runtime.settings['revision'], 'runtime': runtime}

    def save_sections(self, payload):
        with self.lock:
            return self.sections.save(payload)

    def restore_sections(self):
        with self.lock:
            return self.sections.restore_presets()

    def refresh_sections(self):
        with self.lock:
            self.runtime.require_owner_open()
            for section in self.sections.sections:
                if not section.get('preset'):
                    self.custom.request(section['sources'], force=True)

    def accept_feeds(self, sources, frames, reason):
        with self.lock:
            self.runtime.require_owner_open()
            by_id = {f['source_id']: f for f in frames}
            requested = {s['id']: s for s in sources}
            prior_items = [i for s in self.feeds.values() for i in s.get('items', [])]
            prior_sources = {i['id']: i for s in self.feeds.values() for i in s.get('sources', [])}
            streams = {}
            for stream in ('ai', 'hn'):
                items, statuses = [], []
                for config in self.runtime.settings['sources']:
                    if ('hn' if config['kind'] == 'hn' else 'ai') != stream:
                        continue
                    key, frame = config['id'], by_id.get(config['id'])
                    if frame and requested.get(key, {}).get('url') != config['url']:
                        frame = None
                    old = prior_sources.get(key, {})
                    success = frame is not None and frame['reason'] is None
                    current = frame['result']['items'] if success else [i for i in prior_items if i['source_id'] == key]
                    items.extend(current)
                    status = {**old, 'id': key, 'name': config['name'], 'url': config['url'], 'enabled': config['enabled'],
                              'status': 'available' if success else 'stale' if current else 'unavailable',
                              'reason': None if success else frame['reason'] if frame else reason or old.get('reason', 'not_loaded'),
                              'sampled_at': frame['fetched_at'] if frame else old.get('sampled_at'),
                              'last_success_at': frame['fetched_at'] if success else old.get('last_success_at'), 'item_count': len(current)}
                    statuses.append(status)
                streams[stream] = {'schema': 1, 'stream': stream, 'status': 'available' if items else 'pending',
                                   'reason': None if items else 'not_loaded', 'items': items, 'sources': statuses,
                                   'sampled_at': datetime.now(timezone.utc).isoformat(),
                                   'refresh': {'state': 'idle', 'reason': reason, 'retry_after_ms': 0}}
            configured = {source['id'] for source in self.runtime.settings['sources']}
            for stream, previous in self.feeds.items():
                if stream in streams:
                    # Retain historical source identities after the curated defaults change.
                    streams[stream]['items'].extend(item for item in previous.get('items', []) if item['source_id'] not in configured)
                    streams[stream]['sources'].extend(source for source in previous.get('sources', []) if source['id'] not in configured)
            self._write('feeds.json', streams)
            self.feeds = streams

    def merge(self, items):
        with self.lock:
            self.runtime.require_owner_open()
            originals = {item['url']: item for stream in self.feeds.values() for item in stream.get('items', [])}
            normalized = []
            for item in items:
                original = originals.get(item['url'])
                if original:
                    item = {**original, **item, 'id': original['id'], 'source_id': original['source_id'],
                            'source_name': original['source_name'], 'published_at': item.get('published_at') or original.get('published_at')}
                normalized.append(item)
            incoming = {item['id']: item for item in normalized}
            urls = {item['url'] for item in normalized}
            incoming.update((key, item) for key, item in self.research.items() if key not in incoming and item['url'] not in urls)
            self._write('research-items.json', list(incoming.values()))
            self.research = incoming
        return self.sample()

    @staticmethod
    def _projection(item, reason=None):
        return {'id': item['id'], 'title': item['title'], 'blocks': item.get('body_blocks') or
                ([{'type': 'p', 'text': item['summary']}] if item.get('summary') else []), 'images': item.get('images', []),
                'content_kind': item.get('content_kind', 'summary'), 'source_url': item['url'], 'reason': reason,
                'fetched_at': item['fetched_at'], **{key: item[key] for key in ('author', 'published_at', 'published_raw', 'updated_at',
                'references', 'references_total', 'content_type', 'completeness', 'incomplete', 'published_precision', 'content_truncated') if key in item}}

    def _commit_article(self, generation, identity, data, html):
        if not re.fullmatch('[a-f0-9]{24}', identity):
            raise ValueError('invalid_article')
        with self.lock:
            if not self.runtime.can_commit_article(generation):
                return False
            try:
                root = self.root / 'article-cache'
                if html is not None:
                    atomic_bytes(root / (identity + '.html'), html)
                atomic_bytes(root / (identity + '.json'), data)
            except OSError:
                self.runtime.blocked = True
                self.runtime.status.update(state='blocked', reason='article_write_failed')
                raise
            return True

    def article(self, identity, *, retry=False):
        if not isinstance(identity, str) or not re.fullmatch('[a-f0-9]{24}', identity):
            return None
        with self.lock:
            item = copy.deepcopy(self.known.get(identity))
            generation = self.runtime.owner_generation
            writable = self.runtime.can_commit_article(generation)
        if item is None or not writable:
            saved = self._read('article-cache/' + identity + '.json', None)
            return saved if isinstance(saved, dict) and saved.get('id') == identity else self._projection(item, 'reader_closed' if self.runtime.closed else 'owner_elsewhere') if item else None
        if 'body_blocks' in item and (item.get('content_kind') in ('feed_content', 'full_text') or item.get('content_origin') != 'publisher_feed'):
            return self._projection(item)
        if not self.article_lock.acquire(blocking=False):
            return self._projection(item, 'reader_busy')
        try:
            with self.lock:
                if not self.runtime.can_commit_article(generation):
                    return self._projection(item, 'reader_closed')
            options = {'retry': True} if retry else {}
            return load_article(item, self.root / 'article-cache', **options, commit_cache=lambda key, data, html:
                                self._commit_article(generation, key, data, html))
        finally:
            self.article_lock.release()

    def close(self):
        self.custom.close()
        self.runtime.close()
