"""Reading documents and public capture history belong to one local profile."""
from datetime import datetime, timezone
import copy
import hashlib
import json
import re
from pathlib import Path
import threading

from control_everything.workspace.news_article import load_article
from control_everything.workspace.news_research import ResearchJobs
from control_everything.workspace.news_sections import SectionFeeds, SectionStore


class NewsReader:
    def __init__(self, root, source, *, runtime=None, fetcher=None):
        self.root, self.source = Path(root), source
        self.reader_id = hashlib.sha256(str(self.root.resolve()).encode('utf-8')).hexdigest()[:32]
        self.lock = threading.RLock()
        self.root.mkdir(parents=True, exist_ok=True)
        self.research = {item['id']: item for item in self._read('research-items.json', [])}
        self.feeds = self._read('feeds.json', {})
        self.sections = SectionStore(self._read, self._write)
        self.custom = SectionFeeds(self._read, self._write, fetcher=fetcher)
        self.known = {}
        self.article_lock = threading.Lock()
        self.jobs = ResearchJobs(self.root, self.merge, self.collected_urls, runtime=runtime)

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
        temporary = self.root / (name + '.tmp')
        temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
        temporary.replace(self.root / name)

    def sample(self, *, refresh=False):
        with self.lock:
            sections = self.sections.sections
            streams, sources = {}, []
            for section in sections:
                stream = section['id']
                if section.get('preset'):
                    preset = section['preset']
                    value = self.source.refresh(preset) if refresh and preset == 'ai' else self.source.get(preset)
                    prior = self.feeds.get(preset, {})
                    failed = {row['id'] for row in value['sources'] if not row['last_success_at']}
                    items = value['items'] + [item for item in prior.get('items', []) if item['source_id'] in failed]
                    streams[stream] = {**value, 'items': items}
                else:
                    value = self.custom.view(section, force=refresh)
                    streams[stream] = value
                sources.extend(value['sources'])
            self.feeds = {section['preset']: copy.deepcopy(streams[section['id']]) for section in sections if section.get('preset')}
            self._write('feeds.json', self.feeds)
            research = list(self.research.values())
            urls = {item['url'] for item in research}
            # Collected research lands in the AI section, or the first section when the user removed it.
            target = 'ai' if 'ai' in streams else next(iter(streams), None)
            if target:
                streams[target]['items'] = research + [item for item in streams[target]['items'] if item['url'] not in urls]
            def publication(item):
                raw = item.get('published_at') or item.get('submitted_at') or item.get('updated_at') or item.get('published_raw') or ''
                try:
                    date = datetime.fromisoformat(raw.replace('Z', '+00:00'))
                    if date.tzinfo is None:
                        date = date.replace(tzinfo=timezone.utc)
                    return date.timestamp()
                except ValueError:
                    return 0
            if target:
                streams[target]['items'].sort(key=publication, reverse=True)
            for stream in streams.values():
                self.known.update((item['id'], item) for item in stream['items'])
            stamps = [item.get('fetched_at') for stream in streams.values() for item in stream['items'] if item.get('fetched_at')]
            return {'reader_id': self.reader_id, 'sample': {'captured_at': max(stamps) if stamps else None, 'sources': sources, 'streams': streams},
                    'sections': self.sections.view(),
                    'covers': {'items': []},
                    'refreshing': any(stream['refresh']['state'] == 'pending' or stream['refresh']['reason'] == 'worker_busy' for stream in streams.values())}

    def save_sections(self, payload):
        """Replace the section list (validated); returns the section view."""
        with self.lock:
            return self.sections.save(payload)

    def restore_sections(self):
        with self.lock:
            return self.sections.restore_presets()

    def merge(self, items):
        with self.lock:
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
            self.research = incoming
            self._write('research-items.json', list(incoming.values()))
        return self.sample()

    def article(self, identity, *, retry=False):
        if not isinstance(identity, str) or not re.fullmatch('[a-f0-9]{24}', identity):
            return None
        with self.lock:
            item = self.known.get(identity)
        if item is None:
            saved = self._read('article-cache/' + identity + '.json', None)
            return saved if isinstance(saved, dict) and saved.get('id') == identity else None
        if item.get('body_blocks'):
            return {'id': identity, 'title': item['title'], 'blocks': item['body_blocks'], 'images': item.get('images', []),
                    'content_kind': item.get('content_kind', 'summary'), 'source_url': item['url'], 'reason': None,
                    'fetched_at': item['fetched_at'], **{key: item[key] for key in ('author', 'published_at', 'published_raw', 'updated_at',
                        'references', 'references_total', 'content_type', 'completeness', 'incomplete', 'published_precision') if key in item}}
        if not self.article_lock.acquire(blocking=False):
            return {'id': identity, 'title': item['title'], 'blocks': [{'type': 'p', 'text': item['summary']}] if item.get('summary') else [],
                    'images': [], 'content_kind': 'summary', 'source_url': item['url'], 'reason': 'reader_busy', 'fetched_at': item['fetched_at']}
        try:
            return load_article(item, self.root / 'article-cache', retry=retry)
        finally:
            self.article_lock.release()

    def close(self):
        self.custom.close()
        self.jobs.close()
