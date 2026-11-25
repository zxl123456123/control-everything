"""Attachment reuse never overwrites or publishes releases and never executes downloads."""
import hashlib
import importlib.util
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

TOOLS = Path(__file__).parents[2] / 'tools/packaging'
spec = importlib.util.spec_from_file_location('windows_installer_qa', TOOLS / 'windows_installer_qa.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
spec = importlib.util.spec_from_file_location('reuse_release_asset', TOOLS / 'reuse_release_asset.py')
reuse = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {'windows_installer_qa': qa}):
    spec.loader.exec_module(reuse)


def request():
    return {'source_release_id': 1, 'source_asset_id': 2, 'target_release_id': 3,
            'target_tag': 'v0.1.0a20', 'target_commit': 'a' * 40,
            'target_name': 'session-panel-0.1.0a20-windows-x64.exe', 'sha256': 'b' * 64, 'size': 68}


class ReuseReleaseAssetTests(unittest.TestCase):
    def test_only_two_exact_attachment_kinds_and_fixed_ids_are_accepted(self):
        for key, value in [('target_name', 'other.exe'), ('target_tag', 'latest'), ('size', True),
                           ('target_commit', 'main'), ('source_release_id', 3), ('sha256', 'bad')]:
            item = request()
            item[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                reuse.validate_request(item)

    def test_target_must_remain_the_exact_existing_draft(self):
        for changes in [{'draft': False}, {'target_commitish': 'main'}, {'tag_name': 'v0.1.0a19'}]:
            target = dict(draft=True, target_commitish='a' * 40, tag_name='v0.1.0a20')
            target.update(changes)
            with patch.object(reuse, 'read_api', return_value=target), self.assertRaises(ValueError):
                reuse.check_target(request(), 'synthetic')

    def test_existing_identical_asset_is_idempotent_and_conflict_never_uploads(self):
        item = request()
        asset = {'id': 2, 'name': item['target_name'], 'state': 'uploaded', 'size': 68, 'digest': 'sha256:' + item['sha256']}
        for digest in [asset['digest'], 'sha256:' + 'c' * 64]:
            existing = dict(asset, id=4, digest=digest)
            with tempfile.TemporaryDirectory() as directory, patch.object(reuse, 'read_api', return_value={'draft': True, 'target_commitish': item['target_commit']}), patch.object(reuse, 'assets', return_value=[asset]), patch.object(reuse, 'check_target', return_value=existing), patch.object(reuse, 'upload') as upload, patch.object(reuse, 'download') as download:
                if digest == asset['digest']:
                    self.assertEqual(reuse.copy_asset(item, Path(directory) / 'new', 'synthetic')['status'], 'already-present')
                else:
                    with self.assertRaises(ValueError):
                        reuse.copy_asset(item, Path(directory) / 'new', 'synthetic')
                upload.assert_not_called()
                download.assert_not_called()

    def test_payload_digest_size_and_kind_are_checked_without_execution(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'attachment'
            data = bytearray(68)
            data[:2] = b'MZ'
            struct.pack_into('<I', data, 60, 64)
            data[64:] = b'PE\0\0'
            path.write_bytes(data)
            item = dict(request(), sha256=hashlib.sha256(data).hexdigest())
            reuse.check_file(path, item)
            for change in [{'size': 67}, {'sha256': 'c' * 64}, {'target_name': 'session-panel-0.1.0a20-sources.zip'}]:
                with self.assertRaises(ValueError):
                    reuse.check_file(path, dict(item, **change))
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('LICENSE', 'synthetic sources')
            item.update(target_name='session-panel-0.1.0a20-sources.zip', size=path.stat().st_size,
                        sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            reuse.check_file(path, item)

    def test_previous_public_sources_are_verified_before_one_upload(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / 'sources.zip'
            with zipfile.ZipFile(fixture, 'w') as archive:
                archive.writestr('LICENSE', 'synthetic sources')
            item = dict(request(), target_name='session-panel-0.1.0a20-sources.zip', size=fixture.stat().st_size,
                        sha256=hashlib.sha256(fixture.read_bytes()).hexdigest())
            source = {'id': 2, 'name': 'session-panel-0.1.0a19-sources.zip', 'state': 'uploaded',
                      'size': item['size'], 'digest': 'sha256:' + item['sha256']}
            target = dict(source, id=5, name=item['target_name'])
            with patch.object(reuse, 'read_api', return_value={'draft': False, 'tag_name': 'v0.1.0a19'}), patch.object(reuse, 'assets', return_value=[source]), patch.object(reuse, 'check_target', side_effect=[None, None, target]), patch.object(reuse, 'download', side_effect=lambda _, path, token: path.write_bytes(fixture.read_bytes())), patch.object(reuse, 'upload', return_value=target) as upload:
                self.assertEqual(reuse.copy_asset(item, Path(directory) / 'download', 'synthetic'), {'status': 'copied', 'asset_id': 5})
                upload.assert_called_once()
            with patch.object(reuse, 'read_api', return_value={'draft': True, 'tag_name': 'v0.1.0a19'}), patch.object(reuse, 'assets', return_value=[source]), patch.object(reuse, 'download') as download:
                with self.assertRaises(ValueError):
                    reuse.copy_asset(item, Path(directory) / 'unused', 'synthetic')
                download.assert_not_called()

    def test_target_change_after_download_prevents_the_only_write(self):
        item = request()
        source = {'id': 2, 'name': item['target_name'], 'state': 'uploaded', 'size': item['size'],
                  'digest': 'sha256:' + item['sha256']}
        with tempfile.TemporaryDirectory() as directory, patch.object(reuse, 'read_api', return_value={'draft': True}), patch.object(reuse, 'assets', return_value=[source]), patch.object(reuse, 'check_target', side_effect=[None, ValueError('target_draft_identity')]), patch.object(reuse, 'download'), patch.object(reuse, 'check_file'), patch.object(reuse, 'upload') as upload:
            with self.assertRaisesRegex(ValueError, 'target_draft_identity'):
                reuse.copy_asset(item, Path(directory) / 'download', 'synthetic')
            upload.assert_not_called()
