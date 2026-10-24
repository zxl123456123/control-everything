"""Owned SSH process tests with synthetic Win32 handles."""
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from control_everything.integrations.remote_tunnel import RemoteTunnel, TunnelConfig
from control_everything.platform.windows_jobs import ProcessError
class FakeTunnelAPI:
    def __init__(self, fail=None):
        self.fail = fail
        self.calls = []
        self.code = 259
        self.active_count = 1
        self.read_result = None
        self.read_error = False

    def record(self, method, *args):
        self.calls.append((method, *args))
        if self.fail == method:
            raise ProcessError('fixture-' + method)

    def create_job(self, name):
        self.record('job', name)
        return 'job'

    def pipes(self):
        self.record('pipes')
        return 'stdin', 'stdout', ('child-in', 'child-out', 'child-error')

    def spawn(self, exe, argv, cwd, child, **kwargs):
        self.record('spawn', exe, argv, cwd, child, kwargs)
        return 'process', 'thread', 100

    def assign(self, job, process):
        self.record('assign', job, process)

    def resume(self, thread):
        self.record('resume', thread)

    def exit_code(self, process):
        self.record('exit', process)
        return self.code

    def terminate_process(self, process):
        self.record('terminate_process', process)
        self.code = 0

    def terminate_job(self, job):
        self.record('terminate_job', job)
        self.code = 0
        self.active_count = 0

    def active(self, job):
        self.record('active', job)
        return self.active_count

    def read_available(self, _pipe):
        if self.read_error:
            raise ProcessError('fixture-reader')
        return self.read_result

    def close(self, handle):
        if handle is not None:
            self.record('close', handle)

class RemoteTunnelTests(unittest.TestCase):
    def config(self):
        return SimpleNamespace(tunnel=TunnelConfig(Path('C:/example/ssh.exe'), Path('C:/example/ssh.conf'), 'workbench-tunnel',18773,18774))
    def test_command_has_only_explicit_forwardings_and_no_secret_or_shell(self):
        config = self.config()
        api = FakeTunnelAPI()
        tunnel = RemoteTunnel(config.tunnel, api=api)
        self.addCleanup(tunnel.close)
        tunnel.start(8773, 23456)
        spawn = next(row for row in api.calls if row[0] == 'spawn')
        argv = spawn[2]
        self.assertEqual(argv[-1], 'workbench-tunnel')
        self.assertIn('127.0.0.1:18773:127.0.0.1:8773', argv)
        self.assertIn('127.0.0.1:18774:127.0.0.1:23456', argv)
        for value in ('StrictHostKeyChecking=yes', 'ExitOnForwardFailure=yes', 'BatchMode=yes',
                      'ControlPath=none', 'ControlMaster=no', 'IdentityAgent=none', 'ForkAfterAuthentication=no'):
            self.assertIn(value, argv)
        self.assertNotIn('A' * 43, str(spawn))
        self.assertEqual(spawn[1], config.tunnel.executable)
        self.assertEqual(spawn[3], config.tunnel.config_file.parent)
        self.assertEqual(spawn[4], ('child-in', 'child-out', 'child-error'))
        self.assertEqual(spawn[5], {})
        names = [row[0] for row in api.calls]
        self.assertLess(names.index('job'), names.index('spawn'))
        self.assertLess(names.index('spawn'), names.index('assign'))
        self.assertLess(names.index('assign'), names.index('resume'))
        self.assertNotIn('job', spawn[4])
        tunnel.close()
        self.assertIn(('terminate_job', 'job'), api.calls)
        self.assertIn(('active', 'job'), api.calls)
        for handle in ('stdin', 'stdout', 'process', 'thread', 'job', 'child-in', 'child-out', 'child-error'):
            self.assertEqual(api.calls.count(('close', handle)), 1)
        before = list(api.calls)
        tunnel.close()
        self.assertEqual(api.calls, before)
        self.assertFalse(tunnel.running)

    def test_start_failures_close_every_created_handle_without_resuming_unassigned_process(self):
        config = self.config()
        for fail in ('job', 'pipes', 'spawn', 'assign', 'resume'):
            with self.subTest(fail=fail):
                api = FakeTunnelAPI(fail)
                tunnel = RemoteTunnel(config.tunnel, api=api)
                with self.assertRaises(ProcessError):
                    tunnel.start(8773, 23456)
                self.assertFalse(tunnel.running)
                if fail != 'job':
                    self.assertIn(('close', 'job'), api.calls)
                if fail in ('spawn', 'assign', 'resume'):
                    for handle in ('stdin', 'stdout', 'child-in', 'child-out', 'child-error'):
                        self.assertIn(('close', handle), api.calls)
                if fail in ('assign', 'resume'):
                    self.assertIn(('terminate_process', 'process'), api.calls)
                    self.assertIn(('close', 'process'), api.calls)
                    self.assertIn(('close', 'thread'), api.calls)
                if fail == 'assign':
                    self.assertNotIn(('resume', 'thread'), api.calls)

    def test_immediate_exit_and_reader_start_failure_are_cleaned(self):
        config = self.config()
        api = FakeTunnelAPI()
        api.code = 255
        tunnel = RemoteTunnel(config.tunnel, api=api)
        with self.assertRaisesRegex(ProcessError, 'start_failed'):
            tunnel.start(8773, 23456)
        self.assertIn(('close', 'job'), api.calls)
        api = FakeTunnelAPI()
        tunnel = RemoteTunnel(config.tunnel, api=api)
        with patch('control_everything.integrations.remote_tunnel.threading.Thread.start', side_effect=RuntimeError('fixture-start')):
            with self.assertRaises(RuntimeError):
                tunnel.start(8773, 23456)
        self.assertIn(('close', 'job'), api.calls)
        self.assertIn(('close', 'process'), api.calls)

    def test_reader_error_fails_but_normal_eof_keeps_live_forwarding_process(self):
        config = self.config()
        for eof in (True, False):
            api = FakeTunnelAPI()
            tunnel = RemoteTunnel(config.tunnel, api=api)
            tunnel.start(8773, 23456)
            if eof:
                api.read_result = b''
                tunnel._reader.join(timeout=1)
                self.assertFalse(tunnel._reader.is_alive())
                self.assertFalse(tunnel._reader_failed.is_set())
                self.assertTrue(tunnel.running)
                api.code = 0
                self.assertFalse(tunnel.running)
            else:
                api.read_error = True
                self.assertTrue(tunnel._reader_failed.wait(1))
                self.assertFalse(tunnel.running)
            tunnel.close()
            self.assertIn(('close', 'job'), api.calls)

    def test_terminate_active_and_nonzero_cleanup_failures_still_close_handles(self):
        config = self.config()
        for fail in ('terminate_job', 'active', 'nonzero'):
            with self.subTest(fail=fail):
                api = FakeTunnelAPI()
                tunnel = RemoteTunnel(config.tunnel, api=api)
                tunnel.start(8773, 23456)
                if fail == 'nonzero':
                    api.active = Mock(return_value=1)
                else:
                    api.fail = fail
                with patch('control_everything.integrations.remote_tunnel.time.monotonic', side_effect=[0, 3]):
                    with self.assertRaises(ProcessError):
                        tunnel.close()
                for handle in ('process', 'stdout', 'job'):
                    self.assertIn(('close', handle), api.calls)
                self.assertFalse(tunnel.running)
                tunnel.close()

    def test_termination_failure_during_assign_failure_still_releases_handles(self):
        api = FakeTunnelAPI('assign')
        api.terminate_process = Mock(side_effect=ProcessError('fixture-terminate'))
        tunnel = RemoteTunnel(self.config().tunnel, api=api)
        with self.assertRaises(ProcessError):
            tunnel.start(8773, 23456)
        for handle in ('stdin', 'stdout', 'process', 'thread', 'job', 'child-in', 'child-out', 'child-error'):
            self.assertIn(('close', handle), api.calls)
        tunnel.close()
