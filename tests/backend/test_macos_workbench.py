"""macOS artifact, environment and owned subprocess contracts."""

from dataclasses import replace
import json
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
import sys
import tempfile
from unittest.mock import Mock, patch

from control_everything.integrations.workbench_runtime import workbench_environment
from control_everything.platform.darwin_process import DarwinAPI
from tests.backend import test_workbench_runtime as fixtures


class MacEnvironmentTests(unittest.TestCase):
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
    def test_macos_artifact_selects_node_and_system_git(self):
        manifest = self.run / 'output-manifest.json'
        rows = json.loads(manifest.read_text())
        row = next(row for row in rows['files'] if row['path'].endswith('/node.exe'))
        original = self.engine / row['path']
        row['path'] = row['path'][:-4]
        original.rename(self.engine / row['path'])
        manifest.write_text(json.dumps(rows))
        git = self.root / 'git'
        git.write_bytes(b'fixture git')
        self.manager.config = replace(self.config, git_executable=git)
        with patch('control_everything.integrations.workbench_runtime.sys.platform', 'darwin'):
            self.manager._prepare('http://127.0.0.1:12345')
        self.assertEqual(self.manager._node.name, 'node')
        self.assertNotIn('ComSpec', self.manager._env)


if __name__ == '__main__':
    unittest.main()
