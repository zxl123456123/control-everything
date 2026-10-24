"""Distribution gates reject missing ownership, stale chunks and incomplete notices."""

import base64
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
import tarfile
import tempfile

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

    def test_fixed_repository_transport_fragment_and_lowercase_notice(self):
        for repository in ['git://github.com/example/mono.git', 'git+https://github.com/example/mono.git#main']:
            with self.subTest(repository=repository):
                package = {'name': 'pkg', 'version': '1.0.0', 'metadataSha256': 'e' * 64, 'notices': []}
                registry = json.dumps({'name': 'pkg', 'version': '1.0.0', 'gitHead': 'f' * 40,
                                       'repository': {'url': repository}})
                prepared = {'name': 'pkg', 'version': '1.0.0', 'metadata_sha256': 'e' * 64,
                            'registry_metadata': registry, 'registry_metadata_sha256': hashlib.sha256(registry.encode()).hexdigest(),
                            'notices': [{**self.notice, 'source': 'https://raw.githubusercontent.com/example/mono/' + 'f' * 40 + '/license'}]}
                D.resolve_notices(package, [prepared])
                for source in ['https://raw.githubusercontent.com/other/mono/' + 'f' * 40 + '/license',
                               'https://raw.githubusercontent.com/example/mono/main/license']:
                    changed = copy.deepcopy(prepared)
                    changed['notices'][0]['source'] = source
                    with self.assertRaisesRegex(D.DistributionError, 'distribution_notice_source_mismatch'):
                        D.resolve_notices({**package, 'notices': []}, [changed])

    def archive_notice_fixture(self):
        metadata = json.dumps({'name': 'pkg', 'version': '1.0.0'}).encode()
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w:gz') as archive:
            for name, data in [('package/package.json', metadata), ('package/README.md', b'MIT fixture'),
                               ('package/index.js', b'fixture code')]:
                member = tarfile.TarInfo(name)
                member.size = len(data)
                archive.addfile(member, io.BytesIO(data))
        data = output.getvalue()
        registry = {'name': 'pkg', 'version': '1.0.0', 'dist': {
            'tarball': 'https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz',
            'integrity': 'sha512-' + base64.b64encode(hashlib.sha512(data).digest()).decode()}}
        package = {'name': 'pkg', 'version': '1.0.0', 'metadataSha256': hashlib.sha256(metadata).hexdigest(), 'notices': []}
        raw = json.dumps(registry)
        prepared = {'name': 'pkg', 'version': '1.0.0', 'metadata_sha256': package['metadataSha256'],
                    'registry_metadata': raw, 'registry_metadata_sha256': hashlib.sha256(raw.encode()).hexdigest(),
                    'registry_tarball': {'base64': base64.b64encode(data).decode()},
                    'notices': [{**self.notice, 'source': registry['dist']['tarball'] + '!package/README.md'}]}
        return package, prepared, registry

    def test_registry_archive_binds_metadata_and_complete_original_notice_member(self):
        package, prepared, _registry = self.archive_notice_fixture()
        D.resolve_notices(copy.deepcopy(package), [prepared])
        for mutate, error in [
            (lambda p: p['registry_tarball'].update(base64=base64.b64encode(b'wrong archive').decode()), 'archive_integrity'),
            (lambda p: p['notices'][0].update(source=p['notices'][0]['source'].replace('README.md', 'missing.md')), 'archive_member'),
            (lambda p: p['notices'][0].update(text='different', sha256=hashlib.sha256(b'different').hexdigest()), 'archive_member'),
            (lambda p: p['notices'][0].update(source=p['notices'][0]['source'].replace('registry.npmjs.org', 'example.test')), 'archive_member'),
        ]:
            with self.subTest(error=error):
                changed = copy.deepcopy(prepared)
                mutate(changed)
                with self.assertRaisesRegex(D.DistributionError, error):
                    D.resolve_notices(copy.deepcopy(package), [changed])
        changed = copy.deepcopy(prepared)
        changed['metadata_sha256'] = 'f' * 64
        with self.assertRaisesRegex(D.DistributionError, 'archive_metadata'):
            D.resolve_notices({**package, 'metadataSha256': 'f' * 64}, [changed])

    def test_registry_archive_integrity_must_also_equal_actual_dependency_lock(self):
        package, prepared, registry = self.archive_notice_fixture()
        record = copy.deepcopy(self.record)
        record['bundles'][0]['owners'][0]['package'] = package
        record['bundles'][0]['owners'][0]['sha256'] = hashlib.sha256(b'fixture code').hexdigest()
        with tempfile.TemporaryDirectory() as temporary:
            unit = Path(temporary) / 'unit'
            directory = unit / '.build/distribution'
            directory.mkdir(parents=True)
            run = Path(temporary) / 'run'
            run.mkdir()
            for label in ['runtime', 'web', 'mobile']:
                (directory / (label + '.json')).write_text(json.dumps(record))
            (run / 'package-license-inputs.json').write_text(json.dumps([prepared]))
            names = ['pinned-node', 'windows-security', 'windows-cli-launcher', 'node-pty-conpty', 'ripgrep']
            external = [dict(name=name, version='1', integrity='fixture', output_paths=['out/web/main.js'],
                             output_hashes={'out/web/main.js': 'a' * 64}, notices=[self.notice]) for name in names]
            (run / 'external-dependency-notices.json').write_text(json.dumps(external))
            lock = {'packages': [{'name': 'pkg', 'version': '1.0.0', 'integrity': registry['dist']['integrity']}]}
            (run / 'dependency-manifest.json').write_text(json.dumps(lock))
            D.collect(unit, self.rows, run)
            lock['packages'][0]['integrity'] = 'sha512-other-published-archive'
            (run / 'dependency-manifest.json').write_text(json.dumps(lock))
            with self.assertRaisesRegex(D.DistributionError, 'distribution_notice_registry_integrity'):
                D.collect(unit, self.rows, run)

    @unittest.skipUnless(os.environ.get('PACKAGING_ACTUAL_NOTICE_INPUTS'), 'actual fixed r2 notice materials not supplied')
    def test_actual_release_notice_chains_and_tampering(self):
        entries = json.loads(Path(os.environ['PACKAGING_ACTUAL_NOTICE_INPUTS']).read_text(encoding='utf-8'))
        owners = json.loads(Path(os.environ['PACKAGING_ACTUAL_NOTICE_OWNERS']).read_text(encoding='utf-8'))
        for key, owner in owners.items():
            entry = next(row for row in entries if key == row['name'] + '@' + row['version'])
            package = copy.deepcopy(owner['package'])
            D.resolve_notices(package, [entry])
            D.check_registry_input(package, owner)
        cases = [
            ('format@0.2.2', lambda e: e['linked_license']['materials'][0].update(sha256='0' * 64), 'linked_materials'),
            ('format@0.2.2', lambda e: e['notices'][0].update(text='new invented copyright'), 'linked_body'),
            ('react-remove-scroll-bar@2.3.8', lambda e: e['same_content_license'].update(original_source_zip=base64.b64encode(b'fake source').decode()), 'same_content_source'),
            ('react-remove-scroll-bar@2.3.8', lambda e: e['same_content_license'].update(licensed_source_zip=base64.b64encode(b'fake licensed source').decode()), 'same_content_source'),
            ('react-remove-scroll-bar@2.3.8', lambda e: e['notices'][-1].update(text='different license'), 'same_content_body'),
        ]
        for key, mutate, error in cases:
            with self.subTest(key=key, error=error):
                entry = copy.deepcopy(next(row for row in entries if key == row['name'] + '@' + row['version']))
                mutate(entry)
                with self.assertRaisesRegex(D.DistributionError, error):
                    D.resolve_notices(copy.deepcopy(owners[key]['package']), [entry])
        key = 'react-remove-scroll-bar@2.3.8'
        entry = next(row for row in entries if key == row['name'] + '@' + row['version'])
        package = copy.deepcopy(owners[key]['package'])
        D.resolve_notices(package, [entry])
        with self.assertRaisesRegex(D.DistributionError, 'archive_input'):
            D.check_registry_input(package, {**owners[key], 'sha256': '0' * 64})

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
