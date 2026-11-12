"""GitHub event ranges and scanner setup use synthetic checkouts, never live events."""
import contextlib
import ctypes
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('ci_changes', ROOT / 'tools/scripts/check_ci_changes.py')
CI = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CI)


class CiChangesTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.git('init', '-q')
        self.git('config', 'user.name', 'CI Fixture')
        self.git('config', 'user.email', 'ci@example.invalid')

    def git(self, *args):
        return subprocess.run(['git', *args], cwd=self.root, check=True, capture_output=True,
                              text=True, encoding='utf-8').stdout.strip()

    def commit(self, name):
        (self.root / name).write_text('synthetic fixture\n')
        self.git('add', name)
        self.git('commit', '-qm', 'test: synthetic fixture')
        return self.git('rev-parse', 'HEAD')

    def test_push_keeps_the_entire_event_range(self):
        before = self.commit('base.txt')
        self.commit('middle.txt')
        after = self.commit('head.txt')
        args = CI.scan_arguments(self.root, 'push', {'before': before, 'after': after}, after)
        self.assertEqual(args, ['changes', '--base', before, '--head', after])

    def test_initial_push_explicitly_requests_all_reachable_commits(self):
        head = self.commit('first.txt')
        self.assertEqual(CI.scan_arguments(self.root, 'push',
                         {'before': '0' * 40, 'after': head, 'created': True}, head),
                         ['changes', '--from-root', '--head', head])
        with self.assertRaisesRegex(ValueError, 'initial-push'):
            CI.scan_arguments(self.root, 'push', {'before': '0' * 40, 'after': head}, head)

    def test_fork_pr_checks_the_base_to_merge_result(self):
        original = self.commit('original.txt')
        self.git('checkout', '-qb', 'feature')
        head = self.commit('feature.txt')
        self.git('checkout', '--detach', original)
        base = self.commit('base-advanced.txt')
        self.git('merge', '--no-ff', '-m', 'test: synthetic merge', 'feature')
        merged = self.git('rev-parse', 'HEAD')
        event = {'pull_request': {'base': {'sha': base}, 'head': {'sha': head, 'repo': {'fork': True}}}}
        self.assertEqual(CI.scan_arguments(self.root, 'pull_request', event, merged),
                         ['changes', '--base', base, '--head', merged])
        event['pull_request']['base']['sha'] = original
        with self.assertRaisesRegex(ValueError, 'pr-merge-identity'):
            CI.scan_arguments(self.root, 'pull_request', event, merged)

    def test_malformed_sha_missing_commit_or_wrong_checkout_is_rejected(self):
        before = self.commit('base.txt')
        head = self.commit('head.txt')
        for invalid in ('HEAD^', 'a' * 39, 'a' * 64, '--help', None, '0' * 40):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                CI.scan_arguments(self.root, 'push', {'before': before, 'after': head}, invalid)
        with self.assertRaisesRegex(ValueError, 'checkout-identity'):
            CI.scan_arguments(self.root, 'push', {'before': before, 'after': before}, before)
        with self.assertRaisesRegex(ValueError, 'event-head-identity'):
            CI.scan_arguments(self.root, 'push', {'before': before, 'after': before}, head)
        with self.assertRaises(ValueError):
            CI.scan_arguments(self.root, 'push', {'before': 'f' * 40, 'after': head}, head)
        for event in (None, [], {}):
            with self.subTest(event=event), self.assertRaises(ValueError):
                CI.scan_arguments(self.root, 'pull_request', event, head)

    def test_manual_check_retains_one_commit_and_handles_a_root_commit(self):
        first = self.commit('first.txt')
        self.assertEqual(CI.scan_arguments(self.root, 'workflow_dispatch', {}, first),
                         ['changes', '--from-root', '--head', first])
        head = self.commit('second.txt')
        self.assertEqual(CI.scan_arguments(self.root, 'workflow_dispatch', {}, head),
                         ['changes', '--base', first, '--head', head])
        with self.assertRaisesRegex(ValueError, 'unsupported-event'):
            CI.scan_arguments(self.root, 'pull_request_target', {}, head)

    def test_main_reads_event_file_and_propagates_scanner_failure(self):
        before = self.commit('base.txt')
        head = self.commit('head.txt')
        event_path = self.root / 'event.json'
        event_path.write_text(json.dumps({'before': before, 'after': head,
                                         'head_commit': {'message': 'unused event text'}}))
        environment = {'GITHUB_EVENT_NAME': 'push', 'GITHUB_EVENT_PATH': str(event_path), 'GITHUB_SHA': head}
        with patch.dict(os.environ, environment), patch.object(CI.CHECKS, 'main', return_value=1) as checker:
            self.assertEqual(CI.main(['--root', str(self.root)]), 1)
        self.assertEqual(checker.call_args.args[0][:5], ['changes', '--base', before, '--head', head])
        event_path.write_text('null')
        with patch.dict(os.environ, environment), patch.object(CI.CHECKS, 'main') as checker, \
                contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(CI.main(['--root', str(self.root)]), 1)
            checker.assert_not_called()


class CiWorkflowTests(unittest.TestCase):
    @unittest.skipUnless(os.name == 'nt', 'Windows backend environment contract')
    def test_backend_step_sets_child_utf8_and_canonical_temp_and_preserves_failure(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text(encoding='utf-8')
        step = re.search(r'(?ms)^      - name: Run backend tests\n(.*?)(?=^      - |\Z)', workflow)
        self.assertIsNotNone(step, 'backend tests need their own environment setup')
        self.assertIn("        env:\n          PYTHONUTF8: '1'", step[1])
        script = textwrap.dedent(step[1].split('        run: |\n', 1)[1])
        self.assertNotIn('GITHUB_ENV', script)
        self.assertNotIn('SetEnvironmentVariable', script)
        with tempfile.TemporaryDirectory(prefix='ci environment fixture ') as temporary:
            root = Path(temporary).resolve()
            tests = root / 'tests'
            tests.mkdir()
            inherited = root / 'runner temp'
            inherited.mkdir()
            short = ctypes.create_unicode_buffer(32768)
            self.assertGreater(ctypes.windll.kernel32.GetShortPathNameW(str(inherited), short, len(short)), 0)
            self.assertEqual(Path(short.value).resolve(), inherited)
            probe = tests / 'test_environment.py'
            probe.write_text(textwrap.dedent('''
                import os
                from pathlib import Path
                import subprocess
                import sys
                import tempfile
                import unittest

                class EnvironmentTests(unittest.TestCase):
                    def test_environment(self):
                        self.assertEqual(sys.flags.utf8_mode, 1)
                        self.assertEqual(os.environ['PYTHONUTF8'], '1')
                        expected = str((Path.cwd() / 'work/ci-tests/tmp').resolve())
                        self.assertEqual(tempfile.gettempdir(), expected)
                        for name in ('TEMP', 'TMP', 'TMPDIR'):
                            self.assertEqual(os.environ[name], expected)
                        with tempfile.TemporaryDirectory() as directory:
                            self.assertEqual(Path(directory), Path(directory).resolve())
                        print(chr(0x4e2d) + chr(0x6587))
                        child = subprocess.run([sys.executable, '-c',
                            "import sys; assert sys.flags.utf8_mode == 1; print(chr(0x4e2d))"],
                            capture_output=True)
                        self.assertEqual(child.returncode, 0, child.stderr)
                        self.assertEqual(child.stdout.decode('utf-8').strip(), chr(0x4e2d))
            '''), encoding='utf-8')
            environment = {**os.environ, 'PYTHONUTF8': '1',
                           'PATH': str(Path(sys.executable).parent) + os.pathsep + os.environ['PATH'],
                           **{name: short.value for name in ('TEMP', 'TMP', 'TMPDIR')}}
            environment.pop('PYTHONIOENCODING', None)
            command = [shutil.which('pwsh') or 'powershell.exe', '-NoProfile', '-NonInteractive',
                       '-Command', script]
            result = subprocess.run(command, cwd=root, env=environment, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('中文'.encode('utf-8'), result.stdout)
            probe.write_text('raise AssertionError("fixture failure must fail the step")\n', encoding='utf-8')
            result = subprocess.run(command, cwd=root, env=environment, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b'fixture failure must fail the step', result.stderr)

    def test_automatic_triggers_readonly_permissions_and_manual_readiness(self):
        workflow = (ROOT / '.github/workflows/ci.yml').read_text(encoding='utf-8')
        for event in ('push', 'pull_request'):
            self.assertRegex(workflow, rf'(?m)^  {event}:\n    branches: \[main, develop\]$')
        self.assertIn('  workflow_dispatch:', workflow)
        self.assertIn('permissions:\n  contents: read', workflow)
        self.assertNotIn('pull_request_target:', workflow)
        self.assertNotRegex(workflow, r'(?m)^concurrency:')
        for name in ('windows-tests', 'architecture-boundaries'):
            block = re.search(rf'(?ms)^  {name}:\n(.*?)(?=^  [a-z][\w-]*:|\Z)', workflow)[1]
            self.assertIn('concurrency:', block)
            self.assertIn('github.event_name', block)
            self.assertIn('github.ref', block)
            self.assertIn('cancel-in-progress:', block)
        content = re.search(r'(?ms)^  new-content-checks:\n(.*?)(?=^  [a-z][\w-]*:|\Z)', workflow)[1]
        self.assertNotIn('concurrency:', content)
        self.assertIn('tools/scripts/check_ci_changes.py', content)
        self.assertNotIn('HEAD^', content)
        self.assertIn("if: github.event_name == 'workflow_dispatch'", workflow)
        for checkout in re.finditer(r'(?ms)^      - uses: actions/checkout@.*?(?=^      - |\Z)', workflow):
            self.assertIn('persist-credentials: false', checkout[0])

    @unittest.skipUnless(os.name == 'nt', 'Windows scanner setup contract')
    def test_scanner_installation_uses_repository_work_and_checks_archive_hash(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            installer = root / 'tools/scripts/install_gitleaks.ps1'
            installer.parent.mkdir(parents=True)
            shutil.copyfile(ROOT / 'tools/scripts/install_gitleaks.ps1', installer)
            expected = re.search(r"\$expected = '([a-f0-9]+)'", installer.read_text())[1]
            script = '''
function Invoke-WebRequest { param($Uri, $OutFile) [IO.File]::WriteAllText($OutFile, 'archive fixture') }
function Get-FileHash { param($LiteralPath, $Algorithm) [pscustomobject]@{ Hash = $env:TEST_HASH } }
function Expand-Archive { param($LiteralPath, $DestinationPath)
    [IO.Directory]::CreateDirectory($DestinationPath) | Out-Null
    [IO.File]::WriteAllText((Join-Path $DestinationPath 'gitleaks.exe'), 'never executed fixture')
}
& $env:TEST_INSTALLER -Destination $env:TEST_DESTINATION
'''
            environment = {**os.environ, 'TEST_INSTALLER': str(installer),
                           'TEST_DESTINATION': 'work/tools/gitleaks-8.30.1', 'TEST_HASH': expected}
            result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script],
                                    env=environment, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertTrue((root / 'work/tools/gitleaks-8.30.1/gitleaks.exe').is_file())
            self.assertFalse((root / 'tools/work').exists())
            environment.update(TEST_DESTINATION='work/tools/rejected', TEST_HASH='0' * 64)
            result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', script],
                                    env=environment, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((root / 'work/tools/rejected').exists())


if __name__ == '__main__':
    unittest.main()
