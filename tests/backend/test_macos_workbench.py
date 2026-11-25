"""macOS artifact, environment and owned subprocess contracts."""

from dataclasses import replace
import json
import hashlib
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
import sys
import tempfile
import stat
import subprocess
import traceback
from unittest.mock import Mock, patch

from control_everything.integrations.workbench_runtime import workbench_environment
from control_everything.platform.darwin_process import DarwinAPI, owned_runtime_socket
from control_everything.platform.windows_jobs import ProcessError
from control_everything.http.macos_desktop import news_runtime, smoke_window
from control_everything.http.macos_smoke import smoke_terminal
from tests.backend import test_workbench_runtime as fixtures


class MacEnvironmentTests(unittest.TestCase):
    def test_short_socket_matches_profile_hash_user_and_private_directory_ownership(self):
        state = Path('/profile/' + 'long-directory/' * 20 + 'state')
        key = hashlib.sha256(str(state).encode()).hexdigest()[:12]
        endpoint = str(Path('/tmp') / '.orca-daemon-123' / key / 'o-42-runt.sock')
        directory = SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=123)
        socket = SimpleNamespace(st_mode=stat.S_IFSOCK | 0o600, st_uid=123)
        with patch('control_everything.platform.darwin_process.os.getuid', return_value=123, create=True), \
             patch.object(Path, 'resolve', return_value=Path('/private/tmp')), \
             patch.object(Path, 'lstat', side_effect=[directory, directory, socket]):
            self.assertEqual(owned_runtime_socket(endpoint, state, 42, 'runtime'), endpoint)
        with patch('control_everything.platform.darwin_process.os.getuid', return_value=123, create=True), \
             patch.object(Path, 'resolve', return_value=Path('/private/tmp')), \
             patch.object(Path, 'lstat', return_value=SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=456)):
            with self.assertRaises(ProcessError):
                owned_runtime_socket(endpoint, state, 42, 'runtime')
    def test_isolated_environment_has_posix_tools_without_windows_variables(self):
        env = workbench_environment(Path('/profile'), Path('/bundle/node'), Path('/usr/bin/git'),
                                    'http://127.0.0.1:8766', ambient={}, platform='darwin')
        self.assertNotIn('SHELL', env)
        self.assertTrue(env['PATH'].endswith(':/usr/bin:/bin:/usr/sbin:/sbin'))
        self.assertNotIn('ComSpec', env)
        self.assertEqual(env['HOME'], str(Path('/profile/home')))

    def test_process_creation_time_matches_daemon_ps_second_precision(self):
        with patch('control_everything.platform.darwin_process.subprocess.run',
                   return_value=SimpleNamespace(stdout='Wed Nov 25 12:34:56 2026\n')) as run:
            value = DarwinAPI().process_creation_time(SimpleNamespace(pid=42))
        self.assertEqual(value, 1795610096000)
        self.assertEqual(run.call_args.kwargs['env']['TZ'], 'UTC')

    def test_process_group_does_not_signal_reaped_leaders(self):
        process = Mock()
        process.poll.return_value = 0
        with patch('control_everything.platform.darwin_process.os.killpg', create=True) as kill:
            DarwinAPI().terminate_job([process])
        kill.assert_not_called()

    def test_cleanup_detects_surviving_process_group_after_leader_exits(self):
        process = Mock(pid=42)
        process.poll.return_value = 0
        with patch('control_everything.platform.darwin_process.os.killpg', create=True):
            self.assertEqual(DarwinAPI().active([process]), 1)

    @unittest.skipUnless(sys.platform == 'darwin', 'requires Darwin ps, fcntl and process groups')
    def test_real_profile_lock_and_owned_process_cleanup(self):
        api = DarwinAPI()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            owner = api.owner(root / 'owner.lock')
            self.assertIsNotNone(owner)
            self.assertIsNone(api.owner(root / 'owner.lock'))
            job = api.create_job('test')
            process, stdin, stdout, pid, created = api.launch(
                Path(sys.executable), ['-c', 'import time; time.sleep(30)'], root, dict(os.environ), job)
            try:
                self.assertEqual(pid, process.pid)
                self.assertGreater(created, 0)
                self.assertEqual(api.exit_code(process), 259)
                api.terminate_job(job)
                self.assertEqual(api.active(job), 0)
            finally:
                api.terminate_process(process)
                for handle in (stdin, stdout, process, owner):
                    api.close(handle)


class MacArtifactTests(unittest.TestCase):
    setUp = fixtures.WorkbenchRuntimeTests.setUp
    rpc = fixtures.WorkbenchRuntimeTests.rpc
    def test_window_smoke_requires_studio_load_and_closed_window_report(self):
        report = self.root / 'window.json'
        desktop = SimpleNamespace(window_host=self.root / 'session-panel-window',
                                  server=SimpleNamespace(server_port=12345))
        def run(command, **options):
            self.assertEqual(command, [desktop.window_host, '12345', '--smoke-report', report])
            self.assertEqual(options, {'check': True, 'timeout': 45})
            report.write_text('{"status":"passed","startupPath":"/studio","windowClosed":true}')
        with patch('control_everything.http.macos_desktop.subprocess.run', side_effect=run):
            self.assertTrue(smoke_window(desktop, report)['windowClosed'])
        with patch('control_everything.http.macos_desktop.subprocess.run'):
            # A previous successful report cannot validate an invocation that writes nothing.
            with self.assertRaises(FileNotFoundError):
                smoke_window(desktop, report)
        def unclosed(command, **options):
            report.write_text('{"status":"passed","startupPath":"/studio","windowClosed":false}')
        with patch('control_everything.http.macos_desktop.subprocess.run', side_effect=unclosed):
            with self.assertRaisesRegex(ValueError, 'macos_smoke_window_failed'):
                smoke_window(desktop, report)
    def test_macos_artifact_selects_node_and_system_git(self):
        manifest = self.run / 'output-manifest.json'
        rows = json.loads(manifest.read_text())
        row = next(row for row in rows['files'] if row['path'].endswith('/node.exe'))
        original = self.engine / row['path']
        row['path'] = row['path'][:-8] + 'bin/node'
        (self.engine / row['path']).parent.mkdir()
        original.rename(self.engine / row['path'])
        manifest.write_text(json.dumps(rows))
        git = self.root / 'git'
        git.write_bytes(b'fixture git')
        self.manager.config = replace(self.config, git_executable=git)
        with patch('control_everything.integrations.workbench_runtime.sys.platform', 'darwin'):
            self.manager._prepare('http://127.0.0.1:12345')
        self.assertEqual(self.manager._node.name, 'node')
        self.assertNotIn('ComSpec', self.manager._env)

    def test_news_uses_verified_bundled_node_and_playwright_and_rejects_changed_bytes(self):
        root = self.root / 'product'
        engine, build = root / 'workbench-engine', root / 'build'
        build.mkdir(parents=True)
        node = b'fixture macOS node'
        sha = hashlib.sha256(node).hexdigest()
        contents = {'out/orcad/.runtime-node': sha.encode(),
                    f'out/runtimes/node-{sha}/bin/node': node,
                    'out/node_modules/playwright-core/package.json': b'{"name":"playwright-core","version":"1.64.0"}',
                    'out/node_modules/playwright-core/index.js': b'fixture browser'}
        rows = []
        for name, raw in contents.items():
            file = engine / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(raw)
            rows.append({'path': name, 'sha256': hashlib.sha256(raw).hexdigest()})
        (build / 'build-provenance.json').write_text('{"status":"build_only_verified"}')
        (build / 'output-manifest.json').write_text(json.dumps({'files': rows}))
        result = news_runtime(root)
        self.assertEqual(result['node'], str(engine / f'out/runtimes/node-{sha}/bin/node'))
        self.assertEqual(result['playwright_core'], str(engine / 'out/node_modules/playwright-core'))
        (engine / 'out/node_modules/playwright-core/index.js').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'news_runtime_build_changed'):
            news_runtime(root)


class MacSmokeTerminalTests(unittest.TestCase):
    def test_cli_timeout_does_not_pair_or_expose_local_command_details(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            runtime = SimpleNamespace(config=SimpleNamespace(data_root=root,
                engine_root=root, git_executable=root / 'git.exe'), _node=root / 'node.exe',
                _env={'FIXTURE_PRIVATE_ENV': 'fixture-private-value'},
                bootstrap_runtime=Mock(), revoke_device=Mock())
            timeout = subprocess.TimeoutExpired(['node', 'fixture-local-command'], 40,
                output='fixture-local-output', stderr='fixture-private-value')
            with patch('control_everything.http.macos_smoke.subprocess.run', side_effect=[
                    SimpleNamespace(returncode=0), SimpleNamespace(returncode=0), timeout]):
                with self.assertRaisesRegex(RuntimeError, 'smoke_cli_timeout:repo:add') as caught:
                    smoke_terminal(SimpleNamespace(runtime=runtime))
            message = ''.join(traceback.format_exception(caught.exception))
            for private in ('fixture-local-command', 'fixture-local-output', 'fixture-private-value'):
                self.assertNotIn(private, message)
            runtime.bootstrap_runtime.assert_not_called()
            runtime.revoke_device.assert_not_called()

    def test_terminal_input_echo_cannot_satisfy_nonce_and_cli_stays_on_owned_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            runtime = SimpleNamespace(config=SimpleNamespace(data_root=root,
                engine_root=root / 'engine', git_executable=root / 'git.exe'),
                _node=root / 'node.exe', _env={'ZKYQ_PAIRING_CODE': 'fixture', 'ZKYQ_ENVIRONMENT': 'fixture'})
            sent, calls = [], []
            def run(command, **options):
                if command[0] == str(runtime.config.git_executable):
                    return SimpleNamespace(returncode=0)
                calls.append(command[2:4])
                self.assertNotIn('--pairing-code', command)
                self.assertNotIn('ZKYQ_PAIRING_CODE', options['env'])
                self.assertNotIn('ZKYQ_ENVIRONMENT', options['env'])
                self.assertEqual(options['env']['ZKYQ_USER_DATA_PATH'], str(root / 'state'))
                operation = tuple(command[2:4])
                result = {}
                if operation == ('repo', 'add'):
                    result = {'repo': {'id': 'fixture-repo'}}
                elif operation == ('worktree', 'create'):
                    result = {'worktree': {'id': 'fixture-worktree'}}
                elif operation == ('terminal', 'create'):
                    result = {'terminal': {'handle': 'fixture-terminal'}}
                elif operation == ('terminal', 'send'):
                    sent.append(command[command.index('--text') + 1])
                elif operation == ('terminal', 'read'):
                    result = {'terminal': {'tail': sent}}
                return SimpleNamespace(returncode=0, stdout=json.dumps(result))
            with patch('control_everything.http.macos_smoke.subprocess.run', side_effect=run), \
                 patch('control_everything.http.macos_smoke.time.monotonic', side_effect=[0, 1, 21]), \
                 patch('control_everything.http.macos_smoke.time.sleep'):
                with self.assertRaisesRegex(RuntimeError, 'smoke_terminal_output_timeout'):
                    smoke_terminal(SimpleNamespace(runtime=runtime))
            self.assertIn(['worktree', 'rm'], calls)


if __name__ == '__main__':
    unittest.main()
