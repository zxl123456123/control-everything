"""Synthetic filesystem and fake Win32 contracts; never launch a runtime or model."""

import hashlib
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import uuid

from control_everything.integrations.workbench_runtime import (
    RuntimeConfig, WorkbenchRuntime, WorkbenchUnavailable, isolated_environment, loopback_origin,
)
from control_everything.platform.windows_jobs import ProcessError, WindowsAPI


class FakeAPI:
    def __init__(self, data):
        self.data = data
        self.calls = []
        self.codes = {}
        self.next_pid = 100
        self.fail_assign = False

    def owner(self, path):
        return 'owner'

    def create_job(self, name):
        self.calls.append(('job', name))
        return 'job'

    def pipes(self):
        return 'stdin', 'stdout', ('child-in', 'child-out', 'child-error')

    def spawn(self, exe, argv, cwd, child, **kwargs):
        self.next_pid += 1
        pid = self.next_pid
        self.codes[pid] = 259
        self.calls.append(('spawn', str(exe), list(argv), kwargs['env']))
        if '--no-pairing' in argv:
            state = self.data / 'state'
            state.mkdir(parents=True, exist_ok=True)
            (state / 'orca-runtime.json').write_text(json.dumps({'runtimeId': f'runtime-{pid}', 'pid': pid,
                'authToken': 'fixture-owner-secret', 'startedAt': 1250,
                'transports': [{'kind': 'named-pipe', 'endpoint': r'\\.\pipe\fixture'},
                               {'kind': 'websocket', 'endpoint': 'ws://127.0.0.1:23456'}]}))
            (state / 'orcad.lock').write_text(json.dumps({'pid': pid, 'startedAtMs': 1234,
                'nonce': f'nonce-{pid}', 'version': 'fixture-version'}))
            (state / 'host-installation.json').write_text(json.dumps({'installationId': '60a8f814-a084-44de-923e-b920354aef21'}))
        return pid, 'thread', pid

    def assign(self, job, process):
        self.calls.append(('assign', job, process))
        if self.fail_assign:
            raise ProcessError('assign_failed')

    def process_creation_time(self, process):
        return 1234

    def resume(self, thread):
        self.calls.append(('resume', thread))

    def close(self, handle):
        self.calls.append(('close', handle))

    def exit_code(self, process):
        return self.codes[process]

    def read_available(self, pipe):
        return None

    def terminate_process(self, process):
        self.calls.append(('terminate_process', process))
        self.codes[process] = 0

    def terminate_job(self, job):
        self.calls.append(('terminate_job', job))
        self.codes = {pid: 0 for pid in self.codes}

    def active(self, job):
        return sum(code == 259 for code in self.codes.values())


class WorkbenchRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.engine, self.run, self.data = (self.root / name for name in ('engine', 'run', 'data'))
        self.run.mkdir()
        self.repo = self.root / 'repos/demo'
        self.repo.mkdir(parents=True)
        node = b'synthetic node executable'
        digest = hashlib.sha256(node).hexdigest()
        outputs = {'out/orcad/orcad.js': b'fixture', 'out/orcad/platform-owner-client.js': b'fixture',
                   'out/orcad/.version': b'fixture-version',
                   'out/orcad/.runtime-node': digest.encode(), 'out/runtimes/node-' + digest + '/node.exe': node}
        rows = []
        for name, raw in outputs.items():
            file = self.engine / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(raw)
            rows.append({'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
        (self.run / 'build-provenance.json').write_text(json.dumps({'status': 'build_only_verified'}))
        (self.run / 'output-manifest.json').write_text(json.dumps({'files': rows}))
        git = self.root / 'git.exe'
        git.write_bytes(b'fixture git')
        self.config = RuntimeConfig(self.engine, self.run, self.data, git, (self.root / 'repos',))
        self.api = FakeAPI(self.data)
        self.rpc_calls = []
        self.repos = []
        self.manager = WorkbenchRuntime(self.config, api=self.api, owner_call=self.rpc)
        self.addCleanup(lambda: self.manager.close(force=True))
        self.environment = patch.dict(os.environ, {'SystemRoot': str(self.root / 'system'), 'OPENAI_API_KEY': 'never-inherit'})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def rpc(self, method, params):
        self.rpc_calls.append((method, params))
        if method == 'repo.list':
            return {'repos': self.repos}
        if method == 'repo.add':
            repo = {'id': 'repo-id', 'path': params['path']}
            self.repos.append(repo)
            return {'repo': repo}
        if method == 'worktree.list':
            return {'worktrees': []}
        if method == 'platform.bootstrapDevice':
            return {'available': True, 'deviceId': 'device-id', 'offer': {'v': 2, 'scope': 'runtime',
                'endpoint': 'ws://127.0.0.1:23456', 'deviceToken': 'fixture-device-secret',
                'pairedDeviceId': 'device-id', 'publicKeyB64': 'fixture-key',
                'hostDescriptor': {'installationId': '60a8f814-a084-44de-923e-b920354aef21'}}}
        if method == 'platform.revokeDevice':
            return {'ok': True}
        raise AssertionError(method)

    def start(self):
        self.manager.start('http://127.0.0.1:12345', timeout=.1)

    def test_constructor_and_not_ready_status_do_not_start(self):
        self.assertFalse(self.manager.ready)
        self.assertEqual(self.api.calls, [])
        with self.assertRaises(WorkbenchUnavailable):
            _ = self.manager.websocket_origin

    def test_start_is_suspended_assigned_and_has_only_isolated_environment(self):
        self.start()
        names = [row[0] for row in self.api.calls]
        self.assertLess(names.index('assign'), names.index('resume'))
        spawn = next(row for row in self.api.calls if row[0] == 'spawn')
        env = spawn[3]
        self.assertNotIn('OPENAI_API_KEY', env)
        self.assertEqual(env['HOME'], str(self.data / 'home'))
        self.assertEqual(env['CODEX_HOME'], str(self.data / 'home/codex'))
        self.assertEqual(env['CE_WORKBENCH_ORIGIN'], 'http://127.0.0.1:12345')
        self.assertEqual(env['ORCA_VERSION'], 'fixture-version')
        self.assertIn('--no-pairing', spawn[2])
        self.assertTrue(self.manager.ready)
        self.assertEqual(self.manager.websocket_origin, 'ws://127.0.0.1:23456')
        self.assertNotIn('fixture-owner-secret', json.dumps(self.manager.status()))

    def test_only_loopback_http_origin_with_exact_port_is_accepted(self):
        for value in ('http://localhost:1234', 'http://127.0.0.1:1234/other', 'http://127.0.0.1:bad',
                      'https://127.0.0.1:1234', 'http://user@127.0.0.1:1234'):
            with self.subTest(value=value), self.assertRaises(WorkbenchUnavailable):
                loopback_origin(value)

    def test_system_directory_survives_legacy_pty_path_scanner(self):
        node, git = self.root / 'node/node.exe', self.root / 'git/git.exe'
        system = self.root / 'system'
        env = isolated_environment(self.data, node, git, 'http://127.0.0.1:12345',
                                   {'SystemRoot': str(system)})
        parts = env['PATH'].split(os.pathsep)
        # The pinned node-pty scanner consumes only delimiter-terminated segments.
        self.assertIn(str(system / 'System32'), parts[:-1])
        self.assertEqual(parts[0], str(node.parent))
        self.assertEqual(parts[-1], str(git.parent))
        self.assertTrue(all(parts))

    def test_existing_foreign_profile_and_changed_build_are_rejected(self):
        self.data.mkdir()
        (self.data / 'personal.json').write_text('{}')
        with self.assertRaisesRegex(WorkbenchUnavailable, 'runtime_profile_not_isolated'):
            self.start()
        self.assertFalse(any(row[0] == 'spawn' for row in self.api.calls))
        (self.engine / 'out/orcad/orcad.js').write_text('changed')
        with self.assertRaisesRegex(WorkbenchUnavailable, 'runtime_build_changed'):
            self.start()

    def test_metadata_pid_creation_time_and_nonce_are_rechecked_before_rpc(self):
        self.start()
        path = self.data / 'state/orcad.lock'
        original = json.loads(path.read_text())
        for field, value in (('pid', 999), ('startedAtMs', 999), ('nonce', 'other-instance')):
            path.write_text(json.dumps({**original, field: value}))
            with self.subTest(field=field), self.assertRaisesRegex(WorkbenchUnavailable, 'runtime_identity_mismatch'):
                self.manager.bootstrap('project', 'Demo', self.repo)
        self.assertEqual(self.rpc_calls, [])

    def test_bootstrap_verifies_repo_and_returns_device_offer_without_owner(self):
        self.start()
        result = self.manager.bootstrap('project', 'Demo', self.repo)
        self.assertEqual(result['target'], {'repoId': 'repo-id'})
        uuid.UUID(result['runtime']['environmentId'])
        self.assertNotIn('fixture-owner-secret', json.dumps(result))
        self.assertEqual([method for method, _ in self.rpc_calls], ['repo.list', 'repo.add', 'worktree.list', 'platform.bootstrapDevice'])
        again = self.manager.bootstrap('project', 'Demo', self.repo)
        self.assertEqual(again['runtime']['environmentId'], result['runtime']['environmentId'])
        self.assertEqual(sum(method == 'repo.add' for method, _ in self.rpc_calls), 1)
        self.manager.discard_bootstrap(result)
        self.manager.discard_bootstrap(result)
        self.assertEqual(sum(method == 'platform.revokeDevice' for method, _ in self.rpc_calls), 1)

    def test_unapproved_directory_never_reaches_owner_rpc(self):
        self.start()
        with self.assertRaisesRegex(WorkbenchUnavailable, 'project_directory_not_allowed'):
            self.manager.bootstrap('project', 'Demo', self.root)
        self.assertEqual(self.rpc_calls, [])

    def test_assignment_failure_terminates_only_created_process_and_owned_job(self):
        self.api.fail_assign = True
        with self.assertRaisesRegex(ProcessError, 'assign_failed'):
            self.start()
        self.assertIn(('terminate_process', 101), self.api.calls)
        self.assertIn(('terminate_job', 'job'), self.api.calls)
        self.assertFalse(any(row[0] == 'resume' for row in self.api.calls))

    def test_managed_stop_busy_retains_job_and_no_forced_kill(self):
        self.start()
        def complete(argv, **kwargs):
            request = json.loads(Path(argv[-1]).read_text())
            self.assertEqual(request['instance']['nonce'], 'nonce-101')
            self.api.codes[101] = 0
            return {**request, 'verdict': 'exited', 'receiptPersisted': True, 'retirement': 'live'}
        with patch.object(self.manager, '_capture', side_effect=complete):
            with self.assertRaisesRegex(WorkbenchUnavailable, 'runtime_daemon_busy'):
                self.manager.close()
        self.assertEqual(self.manager._job, 'job')
        self.assertFalse(any(row[0] == 'terminate_job' for row in self.api.calls))

    def test_stop_response_nonce_mismatch_is_not_exit_evidence(self):
        self.start()
        with patch.object(self.manager, '_capture', return_value={'verdict': 'exited', 'receiptPersisted': True,
                          'runtimeId': 'runtime-101', 'instance': {'nonce': 'wrong'}}):
            with self.assertRaisesRegex(WorkbenchUnavailable, 'runtime_stop_unverified'):
                self.manager.stop()
        self.assertTrue(self.manager.ready)

    def test_restart_reuses_owned_job_but_rechecks_new_process_identity(self):
        self.start()
        before = self.manager.bootstrap('project', 'Demo', self.repo)
        old_runtime = self.manager.status()['runtimeId']
        def complete(argv, **kwargs):
            request = json.loads(Path(argv[-1]).read_text())
            self.assertNotIn('retireIdleDaemon', request)
            self.api.codes[self.manager._pid] = 0
            return {**request, 'verdict': 'exited', 'receiptPersisted': True}
        with patch.object(self.manager, '_capture', side_effect=complete):
            self.manager.stop()
        self.start()
        after = self.manager.bootstrap('project', 'Demo', self.repo)
        self.assertNotEqual(self.manager.status()['runtimeId'], old_runtime)
        self.assertEqual(before['runtime']['environmentId'], after['runtime']['environmentId'])
        self.assertEqual(sum(row[0] == 'job' for row in self.api.calls), 1)
        self.assertFalse(any(row[0] == 'terminate_job' for row in self.api.calls))

    def test_minted_device_is_revoked_if_host_identity_check_fails(self):
        self.start()
        (self.data / 'state/host-installation.json').write_text(json.dumps({'installationId': str(uuid.uuid4())}))
        with self.assertRaisesRegex(WorkbenchUnavailable, 'runtime_identity_mismatch'):
            self.manager.bootstrap('project', 'Demo', self.repo)
        self.assertEqual(self.rpc_calls[-1], ('platform.revokeDevice', {'deviceId': 'device-id'}))

    def test_owner_credentials_are_only_in_helper_stdin_with_expected_instance(self):
        self.start()
        self.manager._owner_call = None
        with patch.object(self.manager, '_capture', return_value={'ok': True, 'result': {'repos': []}}) as capture:
            self.manager._rpc('repo.list', {})
        argv, request = capture.call_args.args
        self.assertEqual(argv, [self.manager._helper])
        self.assertNotIn('fixture-owner-secret', repr(argv))
        self.assertEqual(request['authToken'], 'fixture-owner-secret')
        self.assertEqual(request['expectedRuntimeId'], 'runtime-101')

    def test_creation_time_primitive_uses_held_handle_and_integer_epoch(self):
        seen = []
        def times(handle, created, *other):
            seen.append(handle)
            ticks = 116444736000000000 + 123456789 * 10000
            created._obj.dwLowDateTime = ticks & 0xffffffff
            created._obj.dwHighDateTime = ticks >> 32
            return 1
        api = object.__new__(WindowsAPI)
        api.kernel = SimpleNamespace(GetProcessTimes=times)
        self.assertEqual(api.process_creation_time('held-handle'), 123456789)
        self.assertEqual(seen, ['held-handle'])


if __name__ == '__main__':
    unittest.main()
