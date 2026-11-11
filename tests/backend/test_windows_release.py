"""Synthetic local release orchestration; no build, installer or network process runs."""
from contextlib import redirect_stderr
import importlib.util
import io
import json
from pathlib import Path
import subprocess
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
        self.commit = COMMIT
        self.engine_commit = COMMIT
        self.material_hash = 'f' * 64
        self.bad_sources = False
        self.changed_input = False
        self.changed_graph = False
        (self.root / 'private-cargo.exe').write_bytes(b'compiler fixture')
        self.cargo_metadata = {'packages': [{'id': 'fixture', 'name': 'fixture', 'version': '1'}],
                               'resolve': {'root': 'fixture', 'nodes': [{'id': 'fixture', 'deps': []}]}}

    def runner(self, argv, **kwargs):
        name = Path(kwargs['stdout'].name).name.removesuffix('.stdout.log')
        output = Path(kwargs['stdout'].name).parent
        self.calls.append((name, argv, kwargs['env']))
        self.assertFalse(kwargs['shell'])
        self.assertEqual(kwargs['cwd'], self.root)
        text = {'source-commit': self.commit, 'source-status': ' M source' if self.dirty else '',
                'node-version': 'v24.19.0', 'pnpm-version': '12.14.0', 'inno-version': 'Inno Setup 7.1.0',
                'cargo-metadata': json.dumps(self.cargo_metadata)}.get(name, 'fixture output')
        kwargs['stdout'].write(text.encode())
        kwargs['stderr'].write(b'fixture stderr')
        if name == self.fail_step:
            return SimpleNamespace(returncode=17)
        if name == 'desktop-window':
            window = output / 'desktop-window'
            window.mkdir()
            for asset in ('session-panel-window.exe', 'session-panel.ico', 'window-build.json'):
                (window / asset).write_bytes(b'window fixture')
        if name == 'python-package':
            (output / 'dist').mkdir()
            for asset in ('project.whl', 'project.tar.gz'):
                (output / 'dist' / asset).write_bytes(b'fixture')
        if name == 'observer-build':
            observer = self.root / 'work/native-observer/release-install'
            observer.mkdir(parents=True)
            for asset in ('session-panel-observer.exe', 'manifest.json', 'build-info.json'):
                (observer / asset).write_bytes(b'observer fixture')
        if name == 'engine-build':
            self.engine.mkdir(parents=True)
            engine_output = self.root / 'web/workbench-engine/out/web/main.js'
            engine_output.parent.mkdir(parents=True)
            engine_output.write_bytes(b'engine fixture')
            graphs = self.root / 'web/workbench-engine/.build/distribution'
            graphs.mkdir(parents=True)
            for label in ('runtime', 'web', 'mobile'):
                RELEASE.write(graphs / (label + '.json'), {'schema': 1, 'bundles': []})
            RELEASE.write(self.engine / 'output-manifest.json', {'schema': 1, 'files': [
                {'path': 'out/web/main.js', 'bytes': engine_output.stat().st_size,
                 'sha256': RELEASE.sha(engine_output)}]})
            (self.engine / 'distribution-notices.json').write_bytes(b'original notices')
            (self.engine / 'steps.json').write_bytes(b'original steps')
            RELEASE.write(self.engine / 'build-provenance.json',
                          {'hostCommit': self.engine_commit, 'status': 'build_only_verified',
                           'distribution': 'closure_verified',
                           'materials': {'input_hashes': {'external-components.json': 'f' * 64}}})
        if name == 'product':
            engine_run = Path(argv[argv.index('--engine-run') + 1])
            (engine_run / 'distribution-notices.json').write_bytes(b'recollected notices')
            payload = output / 'payload'
            payload.mkdir()
            RELEASE.write(payload / 'product.json', {'source': {'commit': COMMIT, 'dirty': False},
                          'version': '0.1.0a2', 'closure': 'b' * 64})
            bundle = output / 'session-panel-0.1.0a2-sources.zip'
            bundle.write_bytes(b'fixture source')
            RELEASE.write(payload / 'SOURCE-AVAILABILITY.json',
                          {'archive': bundle.name, 'bytes': bundle.stat().st_size,
                           'sha256': '0' * 64 if self.bad_sources else RELEASE.sha(bundle)})
        if name == 'installer':
            (output / 'installer').mkdir()
            (output / 'installer/session-panel-0.1.0a2-windows-x64.exe').write_bytes(b'fixture installer')
            if self.changed_input:
                Path(self.values['endpoints']).write_bytes(b'changed input')
            if self.changed_graph:
                (self.root / 'web/workbench-engine/.build/distribution/runtime.json').write_bytes(b'changed')
        return SimpleNamespace(returncode=0)

    def build(self, **options):
        with patch.object(RELEASE, 'observer_environment',
                          return_value=({'PYTHONPATH': 'untrusted', 'PYTHONHOME': 'untrusted'},
                                        {'cargo': str(self.root / 'private-cargo.exe')})), \
                patch.object(RELEASE, 'material_inputs', return_value={'external-components.json': self.material_hash}), \
                patch.object(RELEASE, 'payload_inputs', return_value={'wheels': []}, create=True):
            return RELEASE.build(self.inputs, options.pop('run_name', 'fixture'),
                                 root=self.root, runner=self.runner, **options)

    def late_failure(self):
        self.fail_step = 'product'
        with self.assertRaisesRegex(ValueError, 'release_step_failed:product:17'):
            self.build()
        self.fail_step = None
        self.calls.clear()

    def original_evidence(self):
        return {str(path): path.read_bytes() for directory in (self.output, self.engine)
                for path in directory.rglob('*') if path.is_file()}

    def test_reuse_compiled_failure_only_assembles_in_new_directories(self):
        self.late_failure()
        before = self.original_evidence()
        result = self.build(run_name='retry', reuse_build='fixture')
        names = [name for name, _, _ in self.calls]
        self.assertEqual(names[-3:], ['product', 'inno-includes', 'installer'])
        self.assertFalse(set(names) & {'desktop-window', 'python-package', 'observer-build', 'engine-build'})
        self.assertEqual(result['status'], 'candidate-built-awaiting-acceptance')
        self.assertEqual(result['reused_build']['run'], 'fixture')
        self.assertEqual(before, self.original_evidence())
        product = next(argv for name, argv, _ in self.calls if name == 'product')
        self.assertEqual(Path(product[product.index('--engine-run') + 1]), self.engine.with_name('retry'))
        self.assertTrue((self.output.with_name('retry') / 'installer').is_dir())

    def test_reuse_rejects_early_failure_or_missing_checkpoint(self):
        self.fail_step = 'engine-build'
        with self.assertRaisesRegex(ValueError, 'release_step_failed:engine-build'):
            self.build()
        self.fail_step = None
        with self.assertRaisesRegex(ValueError, 'reuse_build_checkpoint_required'):
            self.build(run_name='retry', reuse_build='fixture')

    def test_reuse_rejects_absent_checkpoint_even_after_compilation(self):
        self.late_failure()
        receipt = RELEASE.read(self.output / 'build-receipt.json')
        receipt.pop('compilation', None)
        RELEASE.write(self.output / 'build-receipt.json', receipt)
        with self.assertRaisesRegex(ValueError, 'reuse_build_checkpoint_required'):
            self.build(run_name='retry', reuse_build='fixture')

    def test_reuse_rejects_boolean_checkpoint_schema_before_assembly(self):
        self.late_failure()
        receipt = RELEASE.read(self.output / 'build-receipt.json')
        receipt['compilation']['schema'] = True
        RELEASE.write(self.output / 'build-receipt.json', receipt)
        with self.assertRaisesRegex(ValueError, 'reuse_build_checkpoint_required'):
            self.build(run_name='retry', reuse_build='fixture')
        self.assertNotIn('product', [name for name, _, _ in self.calls])

    def test_reuse_requires_same_commit_clean_source_inputs_tools_and_materials(self):
        self.late_failure()
        cases = [('commit', lambda: setattr(self, 'commit', 'c' * 40)),
                 ('dirty', lambda: setattr(self, 'dirty', True)),
                 ('endpoints', lambda: Path(self.values['endpoints']).write_bytes(b'changed')),
                 ('tool', lambda: Path(self.values['pnpm']).write_bytes(b'changed')),
                 ('materials', lambda: setattr(self, 'material_hash', 'c' * 64))]
        for name, mutate in cases:
            with self.subTest(name=name):
                mutate()
                self.calls.clear()
                with self.assertRaisesRegex(ValueError, 'reuse_build_identity|dirty_release_source'):
                    self.build(run_name='retry-' + name, reuse_build='fixture')
                self.assertNotIn('product', [step for step, _, _ in self.calls])
                self.commit, self.dirty, self.material_hash = COMMIT, False, 'f' * 64
                for key in ('endpoints', 'pnpm'):
                    Path(self.values[key]).write_bytes(key.encode())

    def test_reuse_rejects_changed_compiled_bytes_and_receipts(self):
        self.late_failure()
        targets = [self.output / 'dist/project.whl', self.output / 'cargo-packages.json',
                   self.output / 'desktop-window/session-panel-window.exe',
                   self.root / 'work/native-observer/release-install/manifest.json',
                   self.root / 'web/workbench-engine/out/web/main.js',
                   self.engine / 'build-provenance.json', self.engine / 'output-manifest.json']
        for index, target in enumerate(targets):
            with self.subTest(target=target.name):
                original = target.read_bytes()
                target.write_bytes(original + b' ')
                with self.assertRaisesRegex(ValueError, 'reuse_build_artifacts_changed'):
                    self.build(run_name='retry-' + str(index), reuse_build='fixture')
                target.write_bytes(original)

    def test_reuse_failure_preserves_original_evidence_for_another_attempt(self):
        self.late_failure()
        before = self.original_evidence()
        self.fail_step = 'installer'
        with self.assertRaisesRegex(ValueError, 'release_step_failed:installer:17'):
            self.build(run_name='retry', reuse_build='fixture')
        self.assertEqual(before, self.original_evidence())
        self.assertEqual(RELEASE.read(self.output.with_name('retry') / 'build-receipt.json')['status'], 'failed')
        self.fail_step = None
        self.assertEqual(self.build(run_name='retry-again', reuse_build='fixture')['status'],
                         'candidate-built-awaiting-acceptance')
        self.assertEqual(before, self.original_evidence())

    def test_reuse_after_initial_installer_failure_keeps_compilation_receipts_pristine(self):
        self.fail_step = 'installer'
        with self.assertRaisesRegex(ValueError, 'release_step_failed:installer:17'):
            self.build()
        self.assertEqual((self.engine / 'distribution-notices.json').read_bytes(), b'original notices')
        self.assertEqual((self.engine / 'assembly/distribution-notices.json').read_bytes(), b'recollected notices')
        before = self.original_evidence()
        self.fail_step = None
        self.assertEqual(self.build(run_name='retry', reuse_build='fixture')['status'],
                         'candidate-built-awaiting-acceptance')
        self.assertEqual(before, self.original_evidence())

    def test_reuse_rejects_removed_or_unrecorded_compiled_files(self):
        self.late_failure()
        path = self.output / 'dist/project.tar.gz'
        original = path.read_bytes()
        path.unlink()
        with self.assertRaisesRegex(ValueError, 'reuse_build_artifacts_changed'):
            self.build(run_name='retry-missing', reuse_build='fixture')
        path.write_bytes(original)
        (self.root / 'web/workbench-engine/out/unrecorded.js').write_bytes(b'new file')
        with self.assertRaisesRegex(ValueError, 'reuse_build_artifacts_changed'):
            self.build(run_name='retry-extra', reuse_build='fixture')

    def test_reuse_rejects_changed_removed_or_new_distribution_graphs(self):
        self.late_failure()
        graphs = self.root / 'web/workbench-engine/.build/distribution'
        for operation in ('changed', 'removed', 'new'):
            with self.subTest(operation=operation):
                target = graphs / ('extra.json' if operation == 'new' else 'runtime.json')
                original = target.read_bytes() if target.exists() else None
                if operation == 'removed':
                    target.unlink()
                else:
                    target.write_bytes((original or b'{}') + b' ')
                self.calls.clear()
                try:
                    with self.assertRaisesRegex(ValueError, 'reuse_build_artifacts_changed'):
                        self.build(run_name='retry-graph-' + operation, reuse_build='fixture')
                    self.assertNotIn('product', [name for name, _, _ in self.calls])
                finally:
                    if original is None:
                        target.unlink()
                    else:
                        target.write_bytes(original)

    def test_distribution_graph_changes_during_assembly_prevent_candidate_success(self):
        self.changed_graph = True
        with self.assertRaisesRegex(ValueError, 'compilation_inputs_changed'):
            self.build()
        self.assertEqual(RELEASE.read(self.output / 'build-receipt.json')['status'], 'failed')

    def test_reuse_rejects_successful_candidates_and_escaping_or_same_run(self):
        self.build()
        with self.assertRaisesRegex(ValueError, 'reuse_build_checkpoint_required'):
            self.build(run_name='retry', reuse_build='fixture')
        for previous in ('../fixture', 'retry', '.', '/outside'):
            with self.subTest(previous=previous), self.assertRaisesRegex(ValueError, 'invalid_reuse_build'):
                self.build(run_name='retry', reuse_build=previous)

    def test_preflight_runs_same_checks_without_compiling_or_installing(self):
        result = self.build(check_only=True)
        self.assertEqual(result['status'], 'preflight-verified')
        self.assertEqual([name for name, _, _ in self.calls], [
            'source-commit', 'source-status', 'node-version', 'pnpm-version',
            'inno-version', 'python-environment', 'python-dependencies', 'engine-source'])
        self.assertFalse(self.engine.exists())
        self.assertFalse((self.output / 'dist').exists())
        self.assertTrue(all(row['exit_code'] == 0 for row in result['steps']))

    def test_prepared_payload_failure_prevents_source_scan_and_compilation(self):
        with patch.object(RELEASE, 'material_inputs', return_value={}), \
                patch.object(RELEASE, 'payload_inputs', side_effect=ValueError('locked_wheel_missing'), create=True):
            with self.assertRaisesRegex(ValueError, 'locked_wheel_missing'):
                RELEASE.build(self.inputs, 'fixture', root=self.root, runner=self.runner)
        self.assertNotIn('engine-source', [name for name, _, _ in self.calls])
        self.assertNotIn('desktop-window', [name for name, _, _ in self.calls])
        self.assertEqual(RELEASE.read(self.output / 'build-receipt.json')['status'], 'failed')

    def test_preflight_subprocess_failure_records_failed_receipt(self):
        error = subprocess.CalledProcessError(23, ['vswhere.exe', '-latest'])
        with patch.object(RELEASE, 'material_inputs', return_value={}), \
                patch.object(RELEASE, 'payload_inputs', side_effect=error):
            with self.assertRaises(subprocess.CalledProcessError):
                RELEASE.build(self.inputs, 'fixture', root=self.root, runner=self.runner)
        receipt = RELEASE.read(self.output / 'build-receipt.json')
        self.assertEqual(receipt['status'], 'failed')
        self.assertEqual(receipt['error'], str(error))
        self.assertNotIn('desktop-window', [name for name, _, _ in self.calls])

    def test_cli_reports_preflight_subprocess_failure_as_nonzero(self):
        error = subprocess.CalledProcessError(23, ['vswhere.exe', '-latest'])
        stderr = io.StringIO()
        with patch.object(RELEASE, 'build', side_effect=error), redirect_stderr(stderr):
            result = RELEASE.main(['--inputs', str(self.inputs), '--run-name', 'fixture'])
        self.assertEqual(result, 1)
        self.assertIn('windows_release_failed:' + str(error), stderr.getvalue())

    def test_download_cache_is_reused_between_candidates_and_can_be_explicit(self):
        cache = self.root / 'shared-pnpm-store'
        result = self.build(store_dir=cache)
        engine = next(argv for name, argv, _ in self.calls if name == 'engine-build')
        self.assertEqual(engine[engine.index('--store-dir') + 1], str(cache))
        self.assertEqual(result['download_store'], str(cache))

    def test_invalid_download_cache_is_rejected_before_commands(self):
        for cache in (Path('relative'), Path(self.values['runtime_zip']), Path(self.root.anchor)):
            with self.subTest(cache=cache), self.assertRaisesRegex(ValueError, 'store|absolute_canonical'):
                self.build(store_dir=cache)
        self.assertEqual(self.calls, [])

    def test_native_path_budget_counts_windows_utf16_units_before_compilation(self):
        suffix = RELEASE.NATIVE_STATE_PATH
        remaining = 259 - len(str(self.root / suffix).encode('utf-16-le')) // 2 - 1
        short = self.root / ('x' * remaining)
        RELEASE.check_native_path(short)
        with self.assertRaisesRegex(ValueError, 'windows_native_path_budget'):
            RELEASE.check_native_path(self.root / ('x' * (remaining + 1)))
        with self.assertRaisesRegex(ValueError, 'windows_native_path_budget'):
            RELEASE.check_native_path(self.root / ('x' * (remaining - 1) + '\U0001f680'))

    def test_complete_candidate_binds_source_and_passes_every_desktop_input(self):
        result = self.build()
        self.assertEqual(result['status'], 'candidate-built-awaiting-acceptance')
        self.assertEqual(result['commit'], COMMIT)
        commands = {name: argv for name, argv, _ in self.calls}
        self.assertIn('--release', commands['observer-build'])
        self.assertIn('--materials', commands['engine-build'])
        engine = commands['engine-build']
        self.assertEqual(engine[engine.index('--store-dir') + 1],
                         str(self.root / 'work/windows-release/pnpm-store'))
        names = [name for name, _, _ in self.calls]
        self.assertLess(names.index('engine-source'), names.index('desktop-window'))
        window = commands['desktop-window']
        self.assertEqual(window[window.index('--sdk') + 1], self.values['webview2_sdk'])
        cargo = commands['cargo-metadata']
        self.assertEqual(cargo[cargo.index('--filter-platform') + 1], 'x86_64-pc-windows-msvc')
        product = commands['product']
        for flag in ('wheel', 'wheelhouse', 'runtime-zip', 'observer-release', 'output',
                     'cargo-packages', 'inno-license', 'engine-root', 'engine-run',
                     'portable-git', 'git-receipt', 'endpoints', 'desktop-window'):
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
