"""Profile settings: stable identities, strict limits and atomic persistence."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from control_everything.workspace import news_settings as settings


def body(current):
    return {'expected_revision': current['revision'], **{k: copy.deepcopy(current[k]) for k in ('sources', 'view', 'schedule')}}


class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.current = settings.default_settings()

    def test_default_is_memory_only_and_preserves_builtin_ids(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(settings.load(folder), self.current)
            self.assertEqual(list(Path(folder).iterdir()), [])
        self.assertEqual([s['id'] for s in self.current['sources']], ['qbitai', 'aiera', 'infoq_cn', 'msr', 'hn'])

    def test_new_identity_stable_on_rename_url_and_disable(self):
        candidate = body(self.current)
        candidate['sources'].append({**copy.deepcopy(candidate['sources'][0]), 'id': None, 'name': 'Feed', 'url': 'https://example.org/rss'})
        saved = settings.validate_settings(candidate, self.current)
        key = saved['sources'][-1]['id']
        self.assertTrue(key.startswith('feed_'))
        changed = body(saved)
        changed['sources'][-1].update(name='Renamed', url='https://example.org/atom', enabled=False, group='New')
        self.assertEqual(settings.validate_settings(changed, saved)['sources'][-1]['id'], key)

    def test_unknown_fields_ids_removal_and_builtin_changes_rejected(self):
        for change in ('unknown', 'id', 'kind', 'url', 'remove'):
            value = body(self.current)
            if change == 'unknown': value['extra'] = 1
            elif change == 'remove': value['sources'].pop()
            else: value['sources'][0][change] = {'id': 'forged', 'kind': 'hn', 'url': 'https://example.org/rss'}[change]
            with self.subTest(change=change), self.assertRaises(ValueError):
                settings.validate_settings(value, self.current)

    def test_public_urls_and_duplicate_normalization(self):
        for url in ('http://example.org/rss', 'https://127.0.0.1/rss', 'https://[::1]/rss', 'https://example.org:444/rss',
                    'https://u:p@example.org/rss', 'https://example.org/rss#x', 'https://site.local/rss', 'https://example.org/\n'):
            with self.subTest(url=url), self.assertRaises(ValueError):
                settings.normalize_url(url)
        self.assertEqual(settings.normalize_url('https://EXAMPLE.org:443'), 'https://example.org/')

    def test_persistence_roundtrip_and_replace_failure_preserves_file(self):
        with tempfile.TemporaryDirectory() as folder:
            saved = settings.validate_settings(body(self.current), self.current)
            settings.save(folder, saved)
            self.assertEqual(settings.load(folder), saved)
            original = (Path(folder) / 'settings.json').read_bytes()
            with patch.object(Path, 'replace', side_effect=OSError('disk')):
                with self.assertRaises(OSError): settings.save(folder, {**saved, 'revision': 2})
            self.assertEqual((Path(folder) / 'settings.json').read_bytes(), original)
            self.assertEqual(list(Path(folder).glob('*.tmp')), [])

    def test_corruption_unknown_schema_duplicate_fields_do_not_default(self):
        for data in (b'{', b'{"schema":2}', b'{"x":1,"x":2}'):
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / 'settings.json'
                path.write_bytes(data)
                with self.assertRaises(ValueError): settings.load(folder)
                self.assertEqual(path.read_bytes(), data)

    def test_limits_keywords_and_whole_document(self):
        for field, invalid in (('name', ''), ('name', 'x'*81), ('group', 'x'*41), ('include', ['x']*21), ('exclude', [''])):
            value = body(self.current)
            value['sources'][0][field] = invalid
            with self.subTest(field=field), self.assertRaises(ValueError): settings.validate_settings(value, self.current)
        with self.assertRaises(ValueError): settings.strict_json(b' '*65537)

    def test_unhashable_view_source_id_is_a_validation_error(self):
        value = body(self.current)
        value['view']['source_id'] = {}
        with self.assertRaisesRegex(ValueError, 'view'):
            settings.validate_settings(value, self.current)
