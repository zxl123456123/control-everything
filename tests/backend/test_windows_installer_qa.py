"""Fixed release inputs reject ambiguous identities before any executable download."""
from copy import deepcopy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from tempfile import TemporaryDirectory

spec = importlib.util.spec_from_file_location('windows_installer_qa', Path(__file__).parents[2] / 'tools/packaging/windows_installer_qa.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


def request():
    item = {'release_id': 1, 'version': '0.1.0a19', 'source_commit': 'a' * 40, 'draft': False,
            'installer': {'id': 2, 'sha256': 'b' * 64}, 'product': {'id': 3, 'sha256': 'c' * 64}}
    return {'candidate': item, 'baseline': dict(deepcopy(item), version='0.1.0a18', release_id=4)}


class WindowsInstallerQaTests(unittest.TestCase):
    def test_only_fixed_repository_release_identities_are_accepted(self):
        self.assertEqual(qa.validate_request({'mode': 'smoke'}), {'mode': 'smoke'})
        self.assertEqual(qa.validate_request(request()), request())
        mutations = [('release_id', True), ('version', '../latest'), ('source_commit', 'HEAD'),
                     ('draft', 'true'), ('installer', {'id': 2, 'sha256': 'bad'}),
                     ('product', {'id': -1, 'sha256': 'c' * 64})]
        for key, value in mutations:
            with self.subTest(key=key):
                value_request = request()
                value_request['candidate'][key] = value
                with self.assertRaises(ValueError):
                    qa.validate_request(value_request)
        value = request()
        value['repository'] = 'other/repository'
        with self.assertRaises(ValueError):
            qa.validate_request(value)

    def test_private_baseline_and_same_version_are_rejected(self):
        for change in ({'draft': True}, {'version': '0.1.0a19'}):
            value = request()
            value['baseline'].update(change)
            with self.assertRaises(ValueError):
                qa.validate_request(value)

    def test_mismatching_release_assets_are_rejected_before_download(self):
        for release in [{'draft': True}, {'draft': False, 'tag_name': 'v0.1.0a18'}]:
            with TemporaryDirectory() as temporary, patch.object(qa, 'read_api', return_value=release), patch.object(qa, 'download') as download:
                with self.assertRaises(ValueError):
                    qa.prepare(Path(temporary) / 'inputs', request(), 'synthetic-token')
                download.assert_not_called()


if __name__ == '__main__':
    unittest.main()
