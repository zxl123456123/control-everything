"""Pure build contracts; subprocesses are mocked except local Git attribute checks."""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('workbench_engine_build', ROOT / 'tools/packaging/workbench_engine.py')
BUILD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)


class WorkbenchBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.unit = self.root / BUILD.UNIT
        self.unit.mkdir(parents=True)
        self.env = {**os.environ, 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull}
        subprocess.run(['git', '-c', 'init.templateDir=', 'init', '-q', str(self.root)],
                       env=self.env, check=True, capture_output=True)
        self.manifest = {'schema': 1, 'unit': BUILD.UNIT, 'scope': 'source-and-build-only',
                         'upstream': {'repository': BUILD.REPOSITORY, 'commit': BUILD.UPSTREAM},
                         'files': [], 'resources': [], 'local_files': ['build-origin.json'], 'adapted_files': []}
        self.add_source('.gitattributes', b'* text=auto eol=lf\n*.png -text\n*.ico -text\n')
        self.add_source('LICENSE', b'Fixture license\n')
        self.add_source('src/shared/agent-icons/fixture.png', b'\x89PNG\r\nfixture')
        self.add_source('resources/build/icon.ico', b'\x00\x00\x01\x00fixture')
        self.add_source('src/renderer/src/lib/agent-favicon-assets.ts', b'import a from "../../../../shared/agent-icons/fixture.png"\n')
        self.add_source('mobile/src/components/mobile-agent-icon-assets.ts', b'const a = require("../../../src/shared/agent-icons/fixture.png")\n')
        for name in ('src/shared/agent-icons/fixture.png', 'resources/build/icon.ico'):
            self.manifest['resources'].append({'path': name, 'sha256': BUILD.sha256(self.unit / name),
                                                'license_paths': ['LICENSE'], 'reason': 'fixture'})
        BUILD.write_json(self.unit / 'build-origin.json', {'repository': BUILD.REPOSITORY, 'upstreamCommit': BUILD.UPSTREAM})
        (self.root / BUILD.SOURCE_MANIFEST).parent.mkdir(parents=True)
        self.save()

    def add_source(self, name, raw):
        target = self.unit / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        blob = subprocess.run(['git', 'hash-object', '--stdin'], input=raw, cwd=self.root,
                              env=self.env, capture_output=True, check=True).stdout.decode().strip()
        self.manifest['files'].append({'path': name, 'source_path': name, 'git_blob': blob,
                                      'sha256': hashlib.sha256(raw).hexdigest(), 'reason': 'fixture', 'kind': 'source'})

    def save(self):
        BUILD.write_json(self.root / BUILD.SOURCE_MANIFEST, self.manifest)

    def directory_link(self, link, target):
        if os.name == 'nt':
            env = {**os.environ, 'TEST_LINK_PATH': str(link), 'TEST_LINK_TARGET': str(target)}
            subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command',
                            'New-Item -ItemType Junction -Path $env:TEST_LINK_PATH -Target $env:TEST_LINK_TARGET | Out-Null'],
                           env=env, check=True, capture_output=True)
        else:
            link.symlink_to(target, target_is_directory=True)

    def test_source_hash_uses_actual_bytes_but_git_blob_respects_attributes(self):
        first = BUILD.check_source(self.root)
        text = self.unit / 'LICENSE'
        text.write_bytes(b'Fixture license\r\n')
        second = BUILD.check_source(self.root)
        self.assertNotEqual(first['sourceTreeSha256'], second['sourceTreeSha256'])
        self.assertEqual(first['upstreamCommit'], BUILD.UPSTREAM)
        self.assertEqual(first['fileCount'], 7)

    def test_pinned_source_and_resources_keep_bytes_with_autocrlf_checkout(self):
        (self.root / '.gitattributes').write_bytes((ROOT / '.gitattributes').read_bytes())
        attributes = (ROOT / BUILD.UNIT / '.gitattributes').read_bytes()
        (self.unit / '.gitattributes').write_bytes(attributes)
        names = ('resources/native-chat-visuals/.claude-plugin/plugin.json',
                 'resources/native-chat-visuals/skills/orca-chat-visuals/SKILL.md',
                 'mobile/app.config.js', 'mobile/package.json', 'mobile/pnpm-lock.yaml',
                 'src/renderer/src/assets/main.css', 'src/renderer/src/i18n/locales/zh.json')
        raw = '{"fixture": "合成 UTF-8"}\n'.encode('utf-8')
        expected = dict.fromkeys(names, raw)
        expected.update({'mobile/patches/fixture.patch': b'patch\r\n',
                         'mobile/src/fixture.png': b'\x89PNG\r\n\x1a\n\x00fixture'})
        for name, content in expected.items():
            target = self.unit / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        subprocess.run(['git', '-c', 'core.autocrlf=true', 'add', '--', '.gitattributes', BUILD.UNIT],
                       cwd=self.root, env=self.env, check=True, capture_output=True)
        checkout = self.root / 'checkout'
        subprocess.run(['git', '-c', 'core.autocrlf=true', 'checkout-index',
                        '--prefix=' + checkout.as_posix() + '/', '--all'],
                       cwd=self.root, env=self.env, check=True, capture_output=True)
        for name, content in expected.items():
            with self.subTest(resource=name):
                self.assertEqual((checkout / BUILD.UNIT / name).read_bytes(), content)
        self.assertEqual((checkout / BUILD.UNIT / '.gitattributes').read_bytes(), attributes)

    def test_resource_bytes_missing_icon_and_unknown_files_are_rejected(self):
        icon = self.unit / 'resources/build/icon.ico'
        icon.write_bytes(b'changed')
        with self.assertRaisesRegex(BUILD.BuildError, 'source_blob_mismatch|resource_hash_mismatch'):
            BUILD.check_source(self.root)
        icon.unlink()
        with self.assertRaisesRegex(BUILD.BuildError, 'source_file_set_mismatch'):
            BUILD.check_source(self.root)

    def test_unknown_source_cannot_hide_behind_unit_prefix(self):
        (self.unit / 'unknown.txt').write_text('unknown')
        with self.assertRaisesRegex(BUILD.BuildError, 'source_file_set_mismatch'):
            BUILD.check_source(self.root)

    def test_only_exact_generated_files_and_known_build_trees_are_excluded(self):
        before = BUILD.check_source(self.root)
        for relative in (*BUILD.MOBILE_GENERATED, 'src/packages/process-host/dist/index.js', 'mobile/.expo/state.json',
                         'native/windows-cli-launcher/target/release/orca.exe'):
            target = self.unit / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('generated fixture')
        self.assertEqual(BUILD.check_source(self.root)['sourceTreeSha256'], before['sourceTreeSha256'])
        (self.unit / 'mobile/src/terminal/unapproved.generated.ts').write_text('not declared')
        arbitrary = self.unit / 'native/other/target/unknown.bin'
        arbitrary.parent.mkdir(parents=True)
        arbitrary.write_bytes(b'undeclared')
        self.assertIn('native/other/target/unknown.bin', BUILD.source_files(self.unit))
        with self.assertRaisesRegex(BUILD.BuildError, 'source_file_set_mismatch'):
            BUILD.check_source(self.root)

    def test_adaptation_requires_original_and_current_hash(self):
        row = next(row for row in self.manifest['files'] if row['path'] == 'LICENSE')
        (self.unit / 'LICENSE').write_text('Changed fixture\n', encoding='utf-8')
        self.manifest['adapted_files'] = [{'path': 'LICENSE', 'upstream_sha256': row['sha256'],
                                         'current_sha256': BUILD.sha256(self.unit / 'LICENSE'), 'reason': 'fixture edit'}]
        self.save()
        BUILD.check_source(self.root)
        self.manifest['adapted_files'][0]['upstream_sha256'] = '0' * 64
        self.save()
        with self.assertRaisesRegex(BUILD.BuildError, 'adapted_source_mismatch'):
            BUILD.check_source(self.root)

    def test_missing_resource_license_and_provider_reference_fail(self):
        self.manifest['resources'][0]['license_paths'] = []
        self.save()
        with self.assertRaisesRegex(BUILD.BuildError, 'resource_license_missing'):
            BUILD.check_source(self.root)
        self.manifest['resources'][0]['license_paths'] = ['LICENSE']
        name = 'mobile/src/components/mobile-agent-icon-assets.ts'
        row = next(row for row in self.manifest['files'] if row['path'] == name)
        (self.unit / name).write_text('require("agent-icons/missing.png")')
        self.manifest['adapted_files'] = [{'path': name, 'upstream_sha256': row['sha256'],
                                         'current_sha256': BUILD.sha256(self.unit / name), 'reason': 'test'}]
        self.save()
        with self.assertRaisesRegex(BUILD.BuildError, 'provider_icon_missing'):
            BUILD.check_source(self.root)

    def test_fixed_commands_disable_implicit_lifecycles_and_never_start(self):
        steps = BUILD.build_commands('node.exe', 'pnpm.exe', self.unit, self.root / 'run', self.root / 'scratch')
        self.assertEqual([name for name, _, _ in steps], ['install-root', 'install-mobile', 'packages',
                         'mobile-generated', 'runtime-pin', 'mobile-web', 'process-tree', 'web', 'runtime'])
        for _, _, command in steps[:2]:
            self.assertIn('--frozen-lockfile', command)
            self.assertIn('--ignore-scripts', command)
        self.assertIn('--scratch-root=' + str(self.root / 'scratch'), steps[6][2])
        self.assertFalse(any(word in {'start', 'dev', 'open', 'smoke:orcad-terminal'} for _, _, command in steps for word in command))
        with patch.dict(os.environ, {'ORCA_PNPM_FORCE_GLOBAL_VIRTUAL_STORE_IN_CI': '1', 'ORCA_PNPM_GLOBAL_VIRTUAL_STORE': '1'}):
            env = BUILD.build_environment(self.root / 'node.exe', self.root / 'pnpm.exe')
        self.assertEqual(env['ORCA_PNPM_GLOBAL_VIRTUAL_STORE'], '0')
        self.assertNotIn('ORCA_PNPM_FORCE_GLOBAL_VIRTUAL_STORE_IN_CI', env)
        cached = BUILD.build_commands('node.exe', 'pnpm.exe', self.unit, self.root / 'run', self.root / 'scratch', self.root / 'shared-downloads')
        for _, _, command in cached[:2]:
            self.assertEqual(command[-1], str(self.root / 'shared-downloads'))
            self.assertIn('--frozen-lockfile', command)
            self.assertIn('--ignore-scripts', command)

    def test_failed_step_stops_and_keeps_receipt_and_prior_logs(self):
        run = self.root / 'run'
        run.mkdir()
        steps = [('one', self.root, ['one']), ('two', self.root, ['two']), ('three', self.root, ['three'])]
        with patch.object(BUILD.subprocess, 'run', side_effect=[SimpleNamespace(returncode=0), SimpleNamespace(returncode=7)]) as execute:
            with self.assertRaisesRegex(BUILD.BuildError, 'build_step_failed:two:7'):
                BUILD.run_steps(steps, run, {})
        self.assertEqual(execute.call_count, 2)
        self.assertEqual([row['exitCode'] for row in BUILD.read_json(run / 'steps.json')], [0, 7])
        self.assertTrue((run / 'two.log').is_file())
        self.assertFalse((run / 'three.log').exists())

    def test_owned_paths_reject_escape_relative_existing_and_links(self):
        parent = self.root / 'work'
        parent.mkdir()
        for candidate in (self.root / 'elsewhere', Path('relative')):
            with self.assertRaises(BUILD.BuildError):
                BUILD.owned_directory(candidate, parent)
        (parent / 'existing').mkdir()
        with self.assertRaisesRegex(BUILD.BuildError, 'run_directory_exists'):
            BUILD.owned_directory(parent / 'existing', parent, fresh=True)
        with patch.object(Path, 'lstat', return_value=SimpleNamespace(st_mode=0, st_file_attributes=0x400)):
            with self.assertRaisesRegex(BUILD.BuildError, 'linked_path'):
                BUILD.unlinked(parent)

    def test_unknown_or_missing_output_fails_before_publication(self):
        output = self.unit / 'out/web'
        output.mkdir(parents=True)
        (output / 'web-index.html').write_text('fixture')
        rows = BUILD.output_rows(self.unit, {'out/web': ['web-index.html']})
        self.assertEqual(rows[0]['path'], 'out/web/web-index.html')
        (output / 'leaked.config.json').write_text('{}')
        with self.assertRaisesRegex(BUILD.BuildError, 'output_file_set_mismatch'):
            BUILD.output_rows(self.unit, {'out/web': ['web-index.html']})

    def test_build_records_host_dirty_separately_without_starting_a_process(self):
        node, pnpm = self.root / 'node.exe', self.root / 'pnpm.exe'
        node.write_bytes(b'node fixture')
        pnpm.write_bytes(b'pnpm fixture')
        run = self.root / 'work/workbench-engine-build/one'
        with patch.object(BUILD, 'checked', side_effect=['v24.19.0', '12.14.0', 'a' * 40, ' M file']), \
                patch.object(BUILD, 'check_source', return_value={'upstreamCommit': BUILD.UPSTREAM, 'sourceTreeSha256': 'b' * 64}), \
                patch.object(BUILD, 'run_steps') as steps, \
                patch.object(BUILD, 'check_output', return_value={'status': 'fixture'}):
            BUILD.build(node, pnpm, self.root / 'work/ce-native', run, self.root)
        receipt = BUILD.read_json(run / 'build-provenance.json')
        self.assertEqual(receipt['hostCommit'], 'a' * 40)
        self.assertEqual(receipt['upstreamCommit'], BUILD.UPSTREAM)
        self.assertTrue(receipt['dirty'])
        self.assertEqual(receipt['tools']['pnpm']['sha256'], BUILD.sha256(pnpm))
        self.assertEqual(len(steps.call_args.args[0]), 9)

    def test_bad_materials_stop_before_install_or_output_creation(self):
        node, pnpm = self.root / 'node.exe', self.root / 'pnpm.exe'
        node.write_bytes(b'node')
        pnpm.write_bytes(b'pnpm')
        run = self.root / 'work/workbench-engine-build/bad-materials'
        materials = SimpleNamespace(read_inputs=lambda directory: (_ for _ in ()).throw(ValueError('bad proof')))
        with patch.object(BUILD, 'material_api', return_value=materials), \
                patch.object(BUILD, 'check_source', return_value={}), \
                patch.object(BUILD, 'checked') as command, patch.object(BUILD, 'run_steps') as steps:
            with self.assertRaisesRegex(BUILD.BuildError, 'distribution_materials_invalid:bad proof'):
                BUILD.build(node, pnpm, self.root / 'work/ce-native', run, self.root,
                            materials=self.root / 'reviewed')
        command.assert_not_called()
        steps.assert_not_called()
        self.assertFalse(run.exists())

    def test_material_binding_precedes_but_cannot_replace_distribution_validation(self):
        run = self.root / 'work/workbench-engine-build/materials'
        run.mkdir(parents=True)
        node = self.unit / 'out/runtimes/node.exe'
        node.parent.mkdir(parents=True)
        node.write_bytes(b'node')
        BUILD.write_json(run / 'build-provenance.json', {'tools': {
            'node': {'path': str(node), 'sha256': BUILD.sha256(node)}, 'pnpm': {'path': str(self.root / 'pnpm.exe')}}})
        data = {'web': [], 'mobile': {'assets': []}, 'runtime': [], 'newsRuntime': {'files': []},
                'node': {'path': 'out/runtimes/node.exe', 'executableSha256': BUILD.sha256(node)},
                'dependencies': [], 'artifactVersion': 'fixture'}
        calls = []
        def prepare(unit, rows, directory, materials):
            self.assertTrue((directory / 'output-manifest.json').is_file())
            self.assertTrue((directory / 'dependency-manifest.json').is_file())
            calls.append((unit, rows, materials))
            return {'input_hashes': {'external-components.json': 'a' * 64}}
        with patch.object(BUILD, 'material_api', return_value=SimpleNamespace(prepare=prepare)), \
                patch.object(BUILD, 'run_steps'), patch.object(BUILD, 'output_rows', return_value=[]), \
                patch.object(BUILD.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=json.dumps(data), stderr='')):
            with self.assertRaisesRegex(BUILD.BuildError, 'distribution_notices_incomplete:distribution_record_missing'):
                BUILD.check_output(run, self.root, materials=self.root / 'reviewed')
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1][0]['sha256'], BUILD.sha256(node))
        result = BUILD.read_json(run / 'build-provenance.json')
        self.assertEqual(result['distribution'], 'not_verified')
        self.assertIn('materials', result)
        result['distribution'] = 'closure_verified'
        BUILD.write_json(run / 'build-provenance.json', result)
        def reject_materials(*args):
            raise ValueError('changed proof')
        with patch.object(BUILD, 'material_api', return_value=SimpleNamespace(prepare=reject_materials)), \
                patch.object(BUILD, 'run_steps'), patch.object(BUILD, 'output_rows', return_value=[]), \
                patch.object(BUILD.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=json.dumps(data), stderr='')):
            with self.assertRaisesRegex(BUILD.BuildError, 'distribution_materials_invalid:changed proof'):
                BUILD.check_output(run, self.root, materials=self.root / 'reviewed')
        self.assertEqual(BUILD.read_json(run / 'build-provenance.json')['distribution'], 'not_verified')

    @unittest.skipUnless(os.name == 'nt', 'Windows junction test')
    def test_build_rejects_dependency_root_junctions_before_install(self):
        other = self.root / 'other-checkout' / 'node_modules'
        other.mkdir(parents=True)
        sentinel = other / 'sentinel.txt'
        sentinel.write_text('unchanged', encoding='utf-8')
        node, pnpm = self.root / 'node.exe', self.root / 'pnpm.exe'
        node.write_bytes(b'node')
        pnpm.write_bytes(b'pnpm')
        for relative in ('node_modules', 'mobile/node_modules'):
            with self.subTest(relative=relative):
                link = self.unit / relative
                self.directory_link(link, other)
                try:
                    with patch.object(BUILD, 'run_steps') as steps, \
                            patch.object(BUILD, 'check_source', return_value={'upstreamCommit': BUILD.UPSTREAM, 'sourceTreeSha256': 'b' * 64}), \
                            patch.object(BUILD, 'checked', side_effect=['v24.19.0', '12.14.0', 'a' * 40, '']), \
                            patch.object(BUILD, 'check_output', return_value={}):
                        with self.assertRaisesRegex(BUILD.BuildError, 'linked_dependency_root'):
                            BUILD.build(node, pnpm, self.root / 'work/ce-native',
                                        self.root / 'work/workbench-engine-build/one', self.root)
                    steps.assert_not_called()
                    self.assertEqual(sentinel.read_text(encoding='utf-8'), 'unchanged')
                    self.assertFalse((self.root / 'work/workbench-engine-build/one').exists())
                finally:
                    link.rmdir()

    def test_build_accepts_package_links_inside_dependency_roots(self):
        modules = self.unit / 'node_modules'
        target = modules / '.pnpm' / 'package'
        target.mkdir(parents=True)
        link = modules / 'package'
        self.directory_link(link, target)
        node, pnpm = self.root / 'node.exe', self.root / 'pnpm.exe'
        node.write_bytes(b'node')
        pnpm.write_bytes(b'pnpm')
        with patch.object(BUILD, 'checked', side_effect=['v24.19.0', '12.14.0', 'a' * 40, '']), \
                patch.object(BUILD, 'check_source', return_value={'upstreamCommit': BUILD.UPSTREAM, 'sourceTreeSha256': 'b' * 64}), \
                patch.object(BUILD, 'run_steps') as steps, \
                patch.object(BUILD, 'check_output', return_value={}):
            BUILD.build(node, pnpm, self.root / 'work/ce-native',
                        self.root / 'work/workbench-engine-build/one', self.root)
        steps.assert_called_once()

    def test_build_rejects_dangling_dependency_root_link(self):
        link = self.unit / 'node_modules'
        target = self.root / 'missing'
        target.mkdir()
        self.directory_link(link, target)
        target.rmdir()
        with patch.object(BUILD, 'run_steps') as steps, \
                patch.object(BUILD, 'check_source', return_value={}):
            with self.assertRaisesRegex(BUILD.BuildError, 'linked_dependency_root'):
                BUILD.build(self.root / 'node.exe', self.root / 'pnpm.exe', self.root / 'work/ce-native',
                            self.root / 'work/workbench-engine-build/one', self.root)
        steps.assert_not_called()


if __name__ == '__main__':
    unittest.main()
