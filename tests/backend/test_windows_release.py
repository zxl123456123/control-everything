"""Synthetic local release orchestration; no build, installer or network process runs."""
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('windows_release', ROOT / 'tools/packaging/build_windows_release.py')
RELEASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RELEASE)
COMMIT = 'a' * 40


class WindowsReleaseTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.output = self.root / 'work/windows-release/fixture'
        self.engine = self.root / 'work/workbench-engine-build/fixture'
        self.inputs = self.root / 'inputs.json'
        values = {'schema': 1}
        for name in RELEASE.INPUTS:
            path = self.root / 'prepared' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            if name in RELEASE.DIRECTORIES:
                path.mkdir()
            else:
                path.write_bytes(name.encode())
            values[name] = str(path)
        self.values = values
        for name in ('ISCC.exe', 'license.txt'):
            (Path(values['inno_dir']) / name).write_bytes(name.encode())
        pins = self.root / 'tools/packaging/downloads.json'
        pins.parent.mkdir(parents=True)
        RELEASE.write(pins, {'python': {'sha256': RELEASE.sha(values['runtime_zip'])}, 'inno': {'version': '7.1.0'}})
        (pins.parent / 'requirements.txt').write_text('build==1.6.1\n')
        RELEASE.write(self.inputs, values)
        (self.root / 'pyproject.toml').write_text('[project]\nversion="0.1.0a2"\n')
        self.calls = []
        self.fail_step = None
        self.dirty = False
        self.engine_commit = COMMIT
        self.bad_sources = False
        self.changed_input = False
        self.cargo_metadata = {'packages': [{'id': 'fixture', 'name': 'fixture', 'version': '1'}],
                               'resolve': {'root': 'fixture', 'nodes': [{'id': 'fixture', 'deps': []}]}}

    def runner(self, argv, **kwargs):
        name = Path(kwargs['stdout'].name).name.removesuffix('.stdout.log')
        self.calls.append((name, argv, kwargs['env']))
        self.assertFalse(kwargs['shell'])
        self.assertEqual(kwargs['cwd'], self.root)
        text = {'source-commit': COMMIT, 'source-status': ' M source' if self.dirty else '',
                'node-version': 'v24.19.0', 'pnpm-version': '12.14.0', 'inno-version': 'Inno Setup 7.1.0',
                'cargo-metadata': json.dumps(self.cargo_metadata)}.get(name, 'fixture output')
        kwargs['stdout'].write(text.encode())
        kwargs['stderr'].write(b'fixture stderr')
        if name == self.fail_step:
            return SimpleNamespace(returncode=17)
        if name == 'python-package':
            (self.output / 'dist').mkdir()
            for asset in ('project.whl', 'project.tar.gz'):
                (self.output / 'dist' / asset).write_bytes(b'fixture')
        if name == 'engine-build':
            self.engine.mkdir(parents=True)
            RELEASE.write(self.engine / 'build-provenance.json',
                          {'hostCommit': self.engine_commit, 'distribution': 'closure_verified',
                           'materials': {'input_hashes': {'external-components.json': 'f' * 64}}})
        if name == 'product':
            payload = self.output / 'payload'
            payload.mkdir()
            RELEASE.write(payload / 'product.json', {'source': {'commit': COMMIT, 'dirty': False},
                          'version': '0.1.0a2', 'closure': 'b' * 64})
            bundle = self.output / 'session-panel-0.1.0a2-sources.zip'
            bundle.write_bytes(b'fixture source')
            RELEASE.write(payload / 'SOURCE-AVAILABILITY.json',
                          {'archive': bundle.name, 'bytes': bundle.stat().st_size,
                           'sha256': '0' * 64 if self.bad_sources else RELEASE.sha(bundle)})
        if name == 'installer':
            (self.output / 'installer').mkdir()
            (self.output / 'installer/session-panel-0.1.0a2-windows-x64.exe').write_bytes(b'fixture installer')
            if self.changed_input:
                Path(self.values['endpoints']).write_bytes(b'changed input')
        return SimpleNamespace(returncode=0)

    def build(self):
        with patch.object(RELEASE, 'observer_environment',
                          return_value=({'PYTHONPATH': 'untrusted', 'PYTHONHOME': 'untrusted'},
                                        {'cargo': str(self.root / 'private-cargo.exe')})), \
                patch.object(RELEASE, 'material_inputs', return_value={'external-components.json': 'f' * 64}):
            return RELEASE.build(self.inputs, 'fixture', root=self.root, runner=self.runner)

    def test_complete_candidate_binds_source_and_passes_every_desktop_input(self):
        result = self.build()
        self.assertEqual(result['status'], 'candidate-built-awaiting-acceptance')
        self.assertEqual(result['commit'], COMMIT)
        commands = {name: argv for name, argv, _ in self.calls}
        self.assertIn('--release', commands['observer-build'])
        self.assertIn('--materials', commands['engine-build'])
        cargo = commands['cargo-metadata']
        self.assertEqual(cargo[cargo.index('--filter-platform') + 1], 'x86_64-pc-windows-msvc')
        product = commands['product']
        for flag in ('wheel', 'wheelhouse', 'runtime-zip', 'observer-release', 'output',
                     'cargo-packages', 'inno-license', 'engine-root', 'engine-run',
                     'portable-git', 'git-receipt', 'endpoints'):
            self.assertIn('--' + flag, product)
        self.assertIn('--release', product)
        self.assertEqual(RELEASE.read(self.output / 'cargo-packages.json'), self.cargo_metadata['packages'])
        self.assertTrue(all(row['exit_code'] == 0 for row in result['steps']))
        self.assertEqual(result['installer']['sha256'], RELEASE.sha(result['installer']['path']))
        self.assertEqual(result['source_bundle']['sha256'], RELEASE.sha(result['source_bundle']['path']))
        self.assertNotIn('gh', {argv[0] for _, argv, _ in self.calls})
        for name, _, env in self.calls:
            self.assertNotIn('PYTHONPATH', env, name)
            self.assertNotIn('PYTHONHOME', env, name)

    def test_nonzero_keeps_evidence_and_prevents_product_and_installer(self):
        self.fail_step = 'engine-build'
        with self.assertRaisesRegex(ValueError, 'release_step_failed:engine-build:17'):
            self.build()
        receipt = RELEASE.read(self.output / 'build-receipt.json')
        self.assertEqual(receipt['status'], 'failed')
        self.assertEqual(receipt['steps'][-1]['exit_code'], 17)
        self.assertEqual((self.output / 'engine-build.stderr.log').read_bytes(), b'fixture stderr')
        self.assertNotIn('product', [name for name, _, _ in self.calls])
        with self.assertRaisesRegex(ValueError, 'new_release_outputs_required'):
            self.build()

    def test_dirty_source_stops_before_dependency_or_build_execution(self):
        self.dirty = True
        with self.assertRaisesRegex(ValueError, 'dirty_release_source'):
            self.build()
        self.assertEqual([name for name, _, _ in self.calls], ['source-commit', 'source-status'])

    def test_missing_or_relative_inputs_do_not_create_output(self):
        Path(self.values['runtime_zip']).unlink()
        with self.assertRaisesRegex(ValueError, 'release_input_missing:runtime_zip'):
            self.build()
        self.assertFalse(self.output.exists())
        self.values['runtime_zip'] = 'relative.zip'
        RELEASE.write(self.inputs, self.values)
        with self.assertRaisesRegex(ValueError, 'absolute_canonical_path_required'):
            self.build()

    def test_runtime_pin_is_checked_before_any_command(self):
        Path(self.values['runtime_zip']).write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'runtime_archive_hash'):
            self.build()
        self.assertEqual(self.calls, [])

    def test_engine_from_another_commit_never_reaches_product(self):
        self.engine_commit = 'c' * 40
        with self.assertRaisesRegex(ValueError, 'engine_release_identity'):
            self.build()
        self.assertNotIn('product', [name for name, _, _ in self.calls])

    def test_tampered_source_attachment_is_not_a_successful_candidate(self):
        self.bad_sources = True
        with self.assertRaisesRegex(ValueError, 'source_archive_hash'):
            self.build()
        self.assertEqual(RELEASE.read(self.output / 'build-receipt.json')['status'], 'failed')

    def test_run_name_cannot_escape_owned_output(self):
        for name in ('../outside', 'a/b', '.', 'a b'):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'invalid_release_run_name'):
                RELEASE.build(self.inputs, name, root=self.root, runner=self.runner)
        self.assertEqual(self.calls, [])

    def test_existing_observer_output_is_not_overwritten(self):
        observer = self.root / 'work/native-observer/release-install'
        observer.mkdir(parents=True)
        (observer / 'sentinel').write_bytes(b'previous candidate')
        with self.assertRaisesRegex(ValueError, 'new_release_outputs_required'):
            self.build()
        self.assertEqual((observer / 'sentinel').read_bytes(), b'previous candidate')
        self.assertEqual(self.calls, [])

    def test_invalid_materials_stop_before_any_build_or_output(self):
        with patch.object(RELEASE, 'material_inputs', side_effect=ValueError('materials_schema')):
            with self.assertRaisesRegex(ValueError, 'materials_schema'):
                RELEASE.build(self.inputs, 'fixture', root=self.root, runner=self.runner)
        self.assertFalse(self.output.exists())
        self.assertEqual(self.calls, [])

    def test_changed_input_during_build_cannot_be_reported_as_a_bound_candidate(self):
        self.changed_input = True
        with self.assertRaisesRegex(ValueError, 'release_inputs_changed'):
            self.build()
        self.assertEqual(RELEASE.read(self.output / 'build-receipt.json')['status'], 'failed')

    def test_cargo_platform_graph_keeps_transitive_and_build_packages_only(self):
        def edge(package, kind=None):
            return {'pkg': package, 'dep_kinds': [{'kind': kind}]}
        metadata = {'packages': [{'id': name, 'name': name} for name in
                                ('root', 'normal', 'transitive', 'build', 'dev', 'other-platform')],
                    'resolve': {'root': 'root', 'nodes': [
                        {'id': 'root', 'deps': [edge('normal'), edge('build', 'build'), edge('dev', 'dev')]},
                        {'id': 'normal', 'deps': [edge('transitive')]},
                        {'id': 'transitive', 'deps': []}, {'id': 'build', 'deps': []},
                        {'id': 'dev', 'deps': []}]}}
        self.assertEqual([p['id'] for p in RELEASE.observer_packages(metadata)],
                         ['root', 'normal', 'transitive', 'build'])

    def test_cargo_missing_graph_root_node_or_package_stops_before_product(self):
        invalid = [
            {'packages': []},
            {'packages': [], 'resolve': {'root': None, 'nodes': []}},
            {'packages': [], 'resolve': {'root': 'root', 'nodes': [{'id': 'root', 'deps': []}]}},
            {'packages': [{'id': 'root'}], 'resolve': {'root': 'root', 'nodes': []}},
            {'packages': [{'id': 'root'}], 'resolve': {'root': 'root', 'nodes': [
                {'id': 'root', 'deps': [{'pkg': 'missing', 'dep_kinds': [{'kind': 'build'}]}]}]}},
        ]
        for metadata in invalid:
            with self.subTest(metadata=metadata), self.assertRaisesRegex(ValueError, 'cargo_dependency_'):
                RELEASE.observer_packages(metadata)
        self.cargo_metadata = invalid[0]
        with self.assertRaisesRegex(ValueError, 'cargo_dependency_'):
            self.build()
        self.assertNotIn('engine-build', [name for name, _, _ in self.calls])
        self.assertEqual(RELEASE.read(self.output / 'build-receipt.json')['status'], 'failed')
