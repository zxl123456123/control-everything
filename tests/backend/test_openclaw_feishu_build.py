"""Verify that the Feishu recipe refuses mismatched or unrelated source changes."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import io
import tarfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('feishu_builder', ROOT / 'tools/packaging/build_openclaw_feishu.py')
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


class FeishuSourceBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.pack_policy = {'assets': {}, 'licenseReadmes': {},
                            'fsSafeNativeLicense': {'bindingSha256': {}}}
        policy = mock.patch.object(BUILDER, 'pack_policy', return_value=self.pack_policy)
        policy.start()
        self.addCleanup(policy.stop)
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.source = Path(self.temporary.name)
        self.git('init', '-q')
        (self.source / 'package.json').write_text(json.dumps({'version': 'fixture', 'packageManager': 'fixture'}))
        (self.source / 'entry.ts').write_bytes(b'export const value = 1;\n')
        self.git('add', 'package.json', 'entry.ts')
        self.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture')
        self.patch = self.source / '.git' / 'fixture.patch'
        self.patch.write_bytes(b'diff --git a/entry.ts b/entry.ts\n--- a/entry.ts\n+++ b/entry.ts\n@@ -1 +1 @@\n-export const value = 1;\n+export const value = 2;\n')
        self.manifest = {'commit': self.git('rev-parse', 'HEAD'), 'version': 'fixture',
                         'packageManager': 'fixture', 'patchSha256': BUILDER.digest(self.patch.read_bytes()),
                         'licenseSha256': BUILDER.digest((BUILDER.RECIPE / 'LICENSE').read_bytes()),
                         'files': {'entry.ts': {'originalSha256': BUILDER.digest(b'export const value = 1;\n'),
                                                'patchedSha256': BUILDER.digest(b'export const value = 2;\n')}}}

    def git(self, *arguments):
        return subprocess.check_output(['git', *arguments], cwd=self.source, text=True, stderr=subprocess.STDOUT).strip()

    def test_package_rejects_traversal_without_extracting(self):
        archive = self.source / '.git' / 'unsafe.tgz'
        with tarfile.open(archive, 'w:gz') as package:
            member = tarfile.TarInfo('package/../../outside')
            member.size = 1
            package.addfile(member, io.BytesIO(b'x'))
        with self.assertRaisesRegex(ValueError, 'Unsafe package path'):
            BUILDER.inspect_package(archive)

    def test_package_requires_license_inside_archive(self):
        archive = self.source / '.git' / 'missing-license.tgz'
        with tarfile.open(archive, 'w:gz') as package:
            for name in ('package.json', 'openclaw.plugin.json', 'README.md'):
                member = tarfile.TarInfo('package/' + name)
                member.size = 2
                package.addfile(member, io.BytesIO(b'{}'))
        with self.assertRaisesRegex(ValueError, 'missing LICENSE'):
            BUILDER.inspect_package(archive)

    def package_fixture(self, extra=None, manifest=None):
        archive = self.source / '.git' / 'fixture.tgz'
        files = {'package.json': json.dumps(manifest or {}).encode(),
                 'openclaw.plugin.json': b'{}', 'LICENSE': b'license', 'README.md': b'readme'}
        files.update(extra or {})
        with tarfile.open(archive, 'w:gz') as package:
            for name, data in files.items():
                member = tarfile.TarInfo('package/' + name)
                member.size = len(data)
                package.addfile(member, io.BytesIO(data))
        return archive

    def test_failed_pack_records_command_and_preserves_overlay_bytes(self):
        output = self.source / '.git' / 'pack-output'
        output.mkdir()
        (output / 'tmp').mkdir()
        node = self.source / '.git' / 'toolchain' / 'node.exe'
        npm = node.parent / 'node_modules/npm/bin/npm-cli.js'
        npm.parent.mkdir(parents=True)
        npm.write_text('')
        plugin = self.source / 'extensions/feishu'
        plugin.mkdir(parents=True)
        original = b'{ "original": true }\n'
        for name in ('package.json', 'openclaw.plugin.json'):
            (plugin / name).write_bytes(original)
        receipt = {'commands': [], 'packageBuilt': False, 'installValidated': False}
        with mock.patch.object(BUILDER.subprocess, 'check_output', return_value='11.19.1'), \
                mock.patch.object(BUILDER.subprocess, 'run', return_value=subprocess.CompletedProcess([], 7)):
            with self.assertRaises(subprocess.CalledProcessError):
                BUILDER.pack_candidate(self.source, node, output, {}, receipt)
        self.assertEqual(receipt['commands'][0]['exitCode'], 7)
        self.assertFalse(receipt['packageBuilt'])
        self.assertFalse(receipt['installValidated'])
        self.assertEqual((plugin / 'package.json').read_bytes(), original)
        self.assertTrue((output / 'pack.stdout.json').is_file())
        self.assertTrue((output / 'pack.log').is_file())

    def test_successful_pack_hashes_runtime_without_claiming_install_validation(self):
        for mismatch in (None, 'runtime', 'channel-schema'):
            with self.subTest(mismatch=mismatch):
                output = self.source / '.git' / ('pack-' + (mismatch or 'good'))
                output.mkdir()
                (output / 'tmp').mkdir()
                node = output / 'toolchain/node.exe'
                npm = node.parent / 'node_modules/npm/bin/npm-cli.js'
                npm.parent.mkdir(parents=True)
                npm.write_text('')
                plugin = self.source / 'extensions/feishu'
                (plugin / 'dist').mkdir(parents=True, exist_ok=True)
                (plugin / 'package.json').write_bytes(b'{ "original": true }\n')
                channel = {'schema': {'type': 'object', 'additionalProperties': False},
                           'uiHints': {'accounts.*.automationProducerToken': {'sensitive': True}}}
                (plugin / 'openclaw.plugin.json').write_text(
                    json.dumps({'channelConfigs': {'feishu': channel}}), encoding='utf-8')
                (plugin / 'dist/index.js').write_bytes(b'actual runtime')
                published = ({**channel, 'schema': {'type': 'object'}} if mismatch == 'channel-schema'
                             else {**channel, 'label': 'Feishu'})
                archive = self.package_fixture({
                    'dist/index.js': b'wrong' if mismatch == 'runtime' else b'actual runtime',
                    'openclaw.plugin.json': json.dumps({'id': 'feishu',
                        'channelConfigs': {'feishu': published}}).encode(),
                })
                def pack(*args, **kwargs):
                    import shutil
                    shutil.copyfile(archive, output / 'tar/candidate.tgz')
                    kwargs['stdout'].write(json.dumps([{'filename': 'candidate.tgz', 'integrity': 'sha512-fixture'}]).encode())
                    return subprocess.CompletedProcess([], 0)
                receipt = {'commands': [], 'packageBuilt': False, 'installValidated': False}
                with mock.patch.object(BUILDER.subprocess, 'check_output', return_value='11.19.1'), \
                        mock.patch.object(BUILDER.subprocess, 'run', side_effect=pack):
                    if mismatch:
                        expected = 'Packed runtime differs' if mismatch == 'runtime' else 'Packed Feishu channel schema differs'
                        with self.assertRaisesRegex(ValueError, expected):
                            BUILDER.pack_candidate(self.source, node, output, {}, receipt)
                        self.assertFalse(receipt['packageBuilt'])
                    else:
                        BUILDER.pack_candidate(self.source, node, output, {}, receipt)
                        self.assertTrue(receipt['packageBuilt'])
                        self.assertEqual(receipt['npmIntegrity'], 'sha512-fixture')
                self.assertFalse(receipt['installValidated'])

    def test_runtime_fields_allow_original_typescript_sources(self):
        archive = self.package_fixture({'dist/index.js': b'export {}'}, {'openclaw': {
            'extensions': ['./index.ts'], 'runtimeExtensions': ['./dist/index.js']}})
        self.assertIn('package/dist/index.js', BUILDER.inspect_package(archive)['files'])

    def test_missing_runtime_entry_is_rejected(self):
        archive = self.package_fixture(manifest={'openclaw': {'runtimeSetupEntry': './dist/setup.js'}})
        with self.assertRaisesRegex(ValueError, 'missing runtime entry'):
            BUILDER.inspect_package(archive)

    def test_unknown_nested_dependency_is_not_owned_by_outer_package(self):
        archive = self.package_fixture({
            'node_modules/a/package.json': b'{}', 'node_modules/a/LICENSE': b'license',
            'node_modules/a/node_modules/unknown/index.js': b'bad'}, {'bundledDependencies': ['a']})
        with self.assertRaisesRegex(ValueError, 'Unexpected bundled file'):
            BUILDER.inspect_package(archive)

    def test_pack_assets_require_exact_names_and_bytes(self):
        icon = {'assets/icon.png': b'published icon'}
        self.pack_policy['assets'] = {'assets/icon.png': BUILDER.digest(icon['assets/icon.png'])}
        BUILDER.inspect_package(self.package_fixture(icon))
        for files, error in (
            ({}, 'Missing or changed plugin asset'),
            ({'assets/icon.png': b'changed'}, 'Missing or changed plugin asset'),
            ({**icon, 'assets/other.png': b'other'}, 'Unexpected plugin file'),
        ):
            with self.subTest(files=files), self.assertRaisesRegex(ValueError, error):
                BUILDER.inspect_package(self.package_fixture(files))

    def test_bundle_resolves_present_optional_dependencies_but_requires_normal_dependencies(self):
        root = {'bundledDependencies': ['a']}
        required = {'node_modules/a/package.json': json.dumps({
            'dependencies': {'nested': '1.0.0'},
            'optionalDependencies': {'platform': '1.0.0', 'other-platform': '1.0.0'},
        }).encode(), 'node_modules/a/LICENSE': b'license'}
        nested = {'node_modules/a/node_modules/nested/package.json': b'{}',
                  'node_modules/a/node_modules/nested/LICENSE': b'license'}
        platform = {'node_modules/platform/package.json': b'{}',
                    'node_modules/platform/LICENSE': b'license'}
        BUILDER.inspect_package(self.package_fixture({**required, **nested, **platform}, root))
        BUILDER.inspect_package(self.package_fixture({**required, **nested}, root))
        with self.assertRaisesRegex(ValueError, 'Missing bundled dependency: node_modules/nested'):
            BUILDER.inspect_package(self.package_fixture({**required, **platform}, root))
        with self.assertRaisesRegex(ValueError, 'Missing dependency license: node_modules/platform'):
            platform.pop('node_modules/platform/LICENSE')
            BUILDER.inspect_package(self.package_fixture({**required, **nested, **platform}, root))

    def test_readme_license_requires_published_bytes_for_the_known_version(self):
        self.pack_policy['licenseReadmes'] = {
            'a': {'version': '1.0.0', 'sha256': BUILDER.digest(b'published license in readme')},
        }
        root = {'bundledDependencies': ['a']}
        valid = {'node_modules/a/package.json': b'{"name":"a","version":"1.0.0"}',
                 'node_modules/a/README.md': b'published license in readme'}
        BUILDER.inspect_package(self.package_fixture(valid, root))
        for name, content in (
            ('node_modules/a/README.md', b'other readme'),
            ('node_modules/a/package.json', b'{"name":"a","version":"2.0.0"}'),
        ):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Missing dependency license'):
                BUILDER.inspect_package(self.package_fixture({**valid, name: content}, root))

    def test_fs_safe_binding_requires_exact_binary_and_shared_license(self):
        platform = '@openclaw/fs-safe-win32-x64-msvc'
        self.pack_policy['fsSafeNativeLicense'] = {
            'version': '0.26.5',
            'bindingSha256': {platform: BUILDER.digest(b'published binary')},
            'licenseSha256': BUILDER.digest(b'published shared license'),
        }
        root = {'bundledDependencies': ['@openclaw/fs-safe']}
        binary = f'node_modules/{platform}/fs-safe-native.node'
        license_file = 'node_modules/@openclaw/fs-safe/LICENSE'
        files = {'node_modules/@openclaw/fs-safe/package.json': json.dumps({
                    'optionalDependencies': {platform: '0.26.5'},
                 }).encode(),
                 f'node_modules/{platform}/package.json': json.dumps({
                    'name': platform, 'version': '0.26.5',
                 }).encode(),
                 binary: b'published binary', license_file: b'published shared license'}
        BUILDER.inspect_package(self.package_fixture(files, root))
        for name in (binary, license_file):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Missing dependency license'):
                BUILDER.inspect_package(self.package_fixture({**files, name: b'changed'}, root))

    def test_pristine_check_has_no_source_side_effect(self):
        self.assertEqual(BUILDER.verify_source(self.source, self.manifest, self.patch), 'pristine')
        self.assertEqual((self.source / 'entry.ts').read_bytes(), b'export const value = 1;\n')

    def test_patch_roundtrip_reconstructs_and_reverses_exact_bytes(self):
        output = self.source / '.git' / 'proof'
        output.mkdir()
        BUILDER.verify_patch_roundtrip(self.source, self.manifest, self.patch, output)
        self.assertEqual((output / 'patch-check' / 'entry.ts').read_bytes(), b'export const value = 1;\n')
        self.assertEqual((self.source / 'entry.ts').read_bytes(), b'export const value = 1;\n')

    def test_exact_applied_patch_can_be_verified_again(self):
        self.git('apply', str(self.patch))
        self.assertEqual(BUILDER.verify_source(self.source, self.manifest, self.patch), 'patched')

    def test_unrelated_work_is_preserved_and_rejected(self):
        other = self.source / 'notes.txt'
        other.write_text('preserve this')
        with self.assertRaisesRegex(ValueError, 'outside the registered patch'):
            BUILDER.verify_source(self.source, self.manifest, self.patch)
        self.assertEqual(other.read_text(), 'preserve this')

    def test_wrong_commit_and_changed_patch_are_rejected(self):
        wrong = {**self.manifest, 'commit': '0' * 40}
        with self.assertRaisesRegex(ValueError, 'commit mismatch'):
            BUILDER.verify_source(self.source, wrong, self.patch)
        self.patch.write_bytes(self.patch.read_bytes() + b'\n')
        with self.assertRaisesRegex(ValueError, 'patch hash mismatch'):
            BUILDER.verify_source(self.source, self.manifest, self.patch)

    def test_cli_rejects_wrong_source_and_records_failure_without_applying(self):
        parent = ROOT / 'work' / 'openclaw-feishu-tests'
        parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=parent) as directory:
            output = Path(directory) / 'result'
            result = subprocess.run([sys.executable, str(ROOT / 'tools/packaging/build_openclaw_feishu.py'),
                                     '--source', str(self.source), '--node', sys.executable,
                                     '--pnpm', str(self.patch), '--output', str(output)],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            receipt = json.loads((output / 'receipt.json').read_text())
            self.assertEqual(receipt['status'], 'failed')
            self.assertIn('commit mismatch', receipt['error'])
            self.assertFalse(receipt['runtimeBuilt'])
            self.assertEqual(receipt['commands'], [])
            self.assertEqual((self.source / 'entry.ts').read_bytes(), b'export const value = 1;\n')


if __name__ == '__main__':
    unittest.main()
