"""Strict, profile-local subscription settings without network side effects."""
import copy
import json
import os
import re
import sys
from pathlib import Path
import uuid
from urllib.parse import urlsplit, urlunsplit

from .news_parse import safe_news_url
from .news_schedule import validate_schedule
from .news_worker import FEEDS, HN

MAX_BYTES = 65536
BUILTINS = {row[0]: row for row in (*FEEDS, HN)}


def normalize_url(value):
    if (not isinstance(value, str) or len(value.encode('utf-8')) > 2048
            or any(ord(c) <= 32 or ord(c) == 127 for c in value) or not safe_news_url(value)):
        raise ValueError('sources.url')
    parsed = urlsplit(value)
    if parsed.port not in (None, 443) or parsed.fragment:
        raise ValueError('sources.url')
    host = parsed.hostname.lower().encode('idna').decode('ascii')
    if ':' in host:
        host = '[' + host + ']'
    return urlunsplit(('https', host, parsed.path or '/', parsed.query, ''))


def default_settings():
    return {'schema': 1, 'revision': 0, 'sources': [
        {'id': key, 'kind': 'hn' if key == 'hn' else 'rss', 'url': url, 'name': name,
         'enabled': True, 'group': '', 'include': [], 'exclude': []} for key, name, url in BUILTINS.values()],
        'view': {'source_id': None, 'group': None},
        'schedule': {'enabled': False, 'mode': 'interval', 'interval_minutes': None, 'times': [],
                     'timezone': 'Asia/Shanghai', 'browser': {'enabled': False, 'topic': None, 'query': ''}}}


def strict_json(data):
    def pairs(rows):
        result = {}
        for key, value in rows:
            if key in result:
                raise ValueError('duplicate_field')
            result[key] = value
        return result
    if len(data) > MAX_BYTES:
        raise ValueError('settings_too_large')
    return json.loads(data, object_pairs_hook=pairs, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('invalid_number')))


def validate_settings(body, current):
    if not isinstance(body, dict) or set(body) != {'expected_revision', 'sources', 'view', 'schedule'}:
        raise ValueError('settings.fields')
    if type(body['expected_revision']) is not int or body['expected_revision'] < 0:
        raise ValueError('expected_revision')
    sources, seen, urls = body['sources'], set(), set()
    if not isinstance(sources, list) or not 4 <= len(sources) <= 24:
        raise ValueError('sources.count')
    known = {s['id']: s for s in current['sources']}
    normalized = []
    for row in sources:
        if not isinstance(row, dict) or set(row) != {'id', 'kind', 'url', 'name', 'enabled', 'group', 'include', 'exclude'}:
            raise ValueError('sources.fields')
        row = copy.deepcopy(row)
        key = row['id']
        if key is None:
            key = row['id'] = 'feed_' + uuid.uuid4().hex
            if row['kind'] != 'rss':
                raise ValueError('sources.kind')
        elif (not isinstance(key, str) or not (key in BUILTINS or re.fullmatch(r'feed_[a-f0-9]{32}', key))
              or key not in known or row['kind'] != known[key]['kind']):
            raise ValueError('sources.id')
        if row['kind'] != ('hn' if key == 'hn' else 'rss'):
            raise ValueError('sources.kind')
        if key in seen or type(row['enabled']) is not bool:
            raise ValueError('sources.enabled')
        seen.add(key)
        if not isinstance(row['name'], str) or not 1 <= len(row['name'].strip()) <= 80:
            raise ValueError('sources.name')
        row['name'] = row['name'].strip()
        if not isinstance(row['group'], str) or len(row['group']) > 40:
            raise ValueError('sources.group')
        url = normalize_url(row['url'])
        if url in urls or key in BUILTINS and row['url'] != BUILTINS[key][2]:
            raise ValueError('sources.url')
        urls.add(url)
        if key not in BUILTINS:
            row['url'] = url
        for field in ('include', 'exclude'):
            words = row[field]
            if not isinstance(words, list) or len(words) > 20 or any(not isinstance(w, str) or not 1 <= len(w.strip()) <= 80 for w in words):
                raise ValueError('sources.' + field)
            row[field] = [w.strip() for w in words]
        normalized.append(row)
    # Sources are disabled rather than removed, preserving their stable identity.
    if not set(known) <= seen:
        raise ValueError('sources.removal_unsupported')
    view = body['view']
    if (not isinstance(view, dict) or set(view) != {'source_id', 'group'} or view['source_id'] is not None and (not isinstance(view['source_id'], str) or view['source_id'] not in seen)
            or view['group'] is not None and (not isinstance(view['group'], str) or len(view['group']) > 40)):
        raise ValueError('view')
    schedule = validate_schedule(body['schedule'])
    if schedule['enabled'] and schedule['browser']['enabled'] and sys.platform != 'win32':
        raise ValueError('schedule.browser_platform_unsupported')
    result = {'schema': 1, 'revision': current['revision'] + 1, 'sources': normalized,
              'view': copy.deepcopy(view), 'schedule': schedule}
    if len(json.dumps(result, ensure_ascii=False).encode('utf-8')) > MAX_BYTES:
        raise ValueError('settings_too_large')
    return result


def load(root):
    path = Path(root) / 'settings.json'
    if not path.exists():
        return default_settings()
    value = strict_json(path.read_bytes())
    if (not isinstance(value, dict) or set(value) != {'schema', 'revision', 'sources', 'view', 'schedule'}
            or type(value['schema']) is not int or value['schema'] != 1 or type(value['revision']) is not int or value['revision'] < 1):
        raise ValueError('settings_invalid')
    baseline = default_settings()
    # Validate persisted custom identities without allocating replacements.
    baseline['sources'] = value['sources']
    if not isinstance(value['sources'], list) or any(not isinstance(s, dict) or not isinstance(s.get('id'), str) for s in value['sources']):
        raise ValueError('settings_invalid')
    candidate = validate_settings({'expected_revision': value['revision'], **{k: value[k] for k in ('sources', 'view', 'schedule')}}, baseline)
    candidate['revision'] = value['revision']
    if not set(BUILTINS) <= {s['id'] for s in candidate['sources']}:
        raise ValueError('settings_invalid')
    return candidate


def atomic_bytes(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temporary.open('xb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def save(root, value):
    atomic_bytes(Path(root) / 'settings.json', (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
