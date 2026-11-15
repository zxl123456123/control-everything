"""Verify that the Feishu recipe refuses mismatched or unrelated source changes."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('feishu_builder', ROOT / 'tools/packaging/build_openclaw_feishu.py')
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


class FeishuSourceBoundaryTests(unittest.TestCase):
    def setUp(self):
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
