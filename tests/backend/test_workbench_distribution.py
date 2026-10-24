"""Distribution gates reject missing ownership, stale chunks and incomplete notices."""

import hashlib
import importlib.util
import json
from pathlib import Path
import unittest

from control_everything.installation.maintenance import launcher_bytes

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('distribution', ROOT / 'tools/packaging/workbench_distribution.py')
D = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(D)


class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.notice = {'source': 'package/LICENSE', 'text': 'MIT fixture',
                       'sha256': hashlib.sha256(b'MIT fixture').hexdigest()}
        self.rows = [{'path': 'out/web/main.js', 'sha256': 'a' * 64, 'bytes': 1}]
        self.record = {'schema': 1, 'bundles': [{'inputs': {'node_modules/pkg/index.js': {}},
                       'outputs': {'out/web/main.js': {'sha256': 'a' * 64, 'inputs': {'node_modules/pkg/index.js': {}}}},
                       'owners': [{'input': 'node_modules/pkg/index.js', 'package': {
                           'name': 'pkg', 'version': '1.0.0', 'notices': [self.notice]}}]}]}

    def validate(self, external=()):
        return D.validate(ROOT, self.rows, [self.record], external)

    def test_actual_bundle_with_notice(self):
        self.assertIn('pkg@1.0.0', self.validate()['packages'])

    def test_unknown_dynamic_chunk_rejected(self):
        self.rows.append({'path': 'out/web/lazy.js', 'sha256': 'b' * 64, 'bytes': 1})
        with self.assertRaisesRegex(D.DistributionError, 'distribution_unattributed'):
            self.validate()

    def test_external_notice_cannot_hide_an_unrecorded_dynamic_chunk(self):
        self.rows.append({'path': 'out/web/lazy.js', 'sha256': 'b' * 64, 'bytes': 1})
        external = {'name': 'fake-native', 'version': '1', 'integrity': 'archive-pin',
                    'output_paths': ['out/web/lazy.js'], 'output_hashes': {'out/web/lazy.js': 'b' * 64},
                    'notices': [self.notice]}
        with self.assertRaisesRegex(D.DistributionError, 'external_bundle_without_record'):
            self.validate([external])

    def test_changed_chunk_rejected(self):
        self.rows[0]['sha256'] = 'b' * 64
        with self.assertRaisesRegex(D.DistributionError, 'distribution_output_hash'):
            self.validate()

    def test_missing_package_license_is_not_a_dev_exemption(self):
        self.record['bundles'][0]['owners'][0]['package']['notices'] = []
        with self.assertRaisesRegex(D.DistributionError, 'distribution_notice_missing'):
            self.validate()

    def test_changed_notice_hash_rejected(self):
        self.notice['text'] = 'different'
        with self.assertRaisesRegex(D.DistributionError, 'distribution_notice_hash_or_source'):
            self.validate()

    def test_fixed_source_notice_requires_exact_package_metadata_and_version(self):
        package = self.record['bundles'][0]['owners'][0]['package']
        package.update(notices=[], metadataSha256='e' * 64)
        registry = json.dumps({'name': 'pkg', 'version': '1.0.0', 'gitHead': 'f' * 40,
                               'repository': {'url': 'https://github.com/example/mono.git'}})
        prepared = {'name': 'pkg', 'version': '1.0.0', 'metadata_sha256': 'd' * 64,
                    'registry_metadata': registry, 'registry_metadata_sha256': hashlib.sha256(registry.encode()).hexdigest(),
                    'notices': [{**self.notice, 'source': 'https://raw.githubusercontent.com/example/mono/' + 'f' * 40 + '/LICENSE'}]}
        with self.assertRaisesRegex(D.DistributionError, 'distribution_notice_identity_hash'):
            D.validate(ROOT, self.rows, [self.record], [], [prepared])
        prepared['metadata_sha256'] = 'e' * 64
        D.validate(ROOT, self.rows, [self.record], [], [prepared])

    def test_missing_external_dll_notice_rejected(self):
        self.rows.append({'path': 'out/orcad/native.dll', 'sha256': 'c' * 64, 'bytes': 1})
        external = {'name': 'native', 'version': '1', 'integrity': 'c' * 64,
                    'output_paths': ['out/orcad/native.dll'], 'notices': []}
        with self.assertRaisesRegex(D.DistributionError, 'external_dependency_notice_invalid'):
            self.validate([external])

    def test_unresolved_source_rejected(self):
        self.record['bundles'][0]['owners'][0]['unresolved'] = True
        with self.assertRaisesRegex(D.DistributionError, 'distribution_input_unresolved'):
            self.validate()

    def test_external_dll_exact_hash_required(self):
        self.rows.append({'path': 'out/orcad/native.dll', 'sha256': 'c' * 64, 'bytes': 1})
        component = {'name': 'native', 'version': '1', 'integrity': 'archive-pin',
                     'output_paths': ['out/orcad/native.dll'], 'notices': [self.notice],
                     'output_hashes': {'out/orcad/native.dll': 'd' * 64}}
        with self.assertRaisesRegex(D.DistributionError, 'external_dependency_output_hash'):
            self.validate([component])
        component['output_hashes']['out/orcad/native.dll'] = 'c' * 64
        self.validate([component])

    def test_unknown_external_import_rejected(self):
        self.record['bundles'][0]['outputs']['out/web/main.js']['imports'] = [{'path': 'missing', 'external': True}]
        with self.assertRaisesRegex(D.DistributionError, 'imports='):
            self.validate()

    def test_recorded_builtin_allowed(self):
        self.record['builtinModules'] = ['node:fs']
        self.record['bundles'][0]['outputs']['out/web/main.js']['imports'] = [{'path': 'node:fs', 'external': True}]
        self.validate()

    def test_stable_installed_launcher_uses_version_product_root(self):
        raw = launcher_bytes('0.1.0a2-1234', desktop=True).decode('ascii')
        self.assertIn('-m control_everything.http.desktop --product-root "%~dp0versions\\0.1.0a2-1234"', raw)
        self.assertTrue(raw.endswith(' %*\r\n'))

    def test_old_product_maintenance_keeps_existing_entry(self):
        self.assertIn(b'-m control_everything.gateway', launcher_bytes('0.1.0a1-1234', desktop=False))


if __name__ == '__main__':
    unittest.main()
