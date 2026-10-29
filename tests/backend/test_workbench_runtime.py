"""Synthetic filesystem and fake Win32 contracts; never launch a runtime or model."""

import hashlib
from dataclasses import replace
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import uuid

from control_everything.integrations.workbench_runtime import (
    RuntimeConfig, WorkbenchRuntime, WorkbenchUnavailable, workbench_environment, loopback_origin, safe_path,
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
            repo = {'id': 'repo-id', 'path': params['path'], 'displayName': params['displayName']}
            self.repos.append(repo)
            return {'repo': repo}
        if method == 'repo.update':
            repo = next(row for row in self.repos if 'id:' + row['id'] == params['repo'])
            repo.update(params['updates'])
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

    def test_remote_grants_are_journaled_before_exposure_and_retired_after_restart(self):
        from unittest.mock import Mock
        self.start()
        original = self.manager._owner_call
        names = iter(('local-device', 'remote-device'))
        def owner(method, params):
            value = original(method, params)
            if method == 'platform.bootstrapDevice':
                device = next(names)
                value['deviceId'] = value['offer']['pairedDeviceId'] = device
            return value
        self.manager._owner_call = owner
        self.manager.bootstrap('p1', 'Project', self.repo)
        self.manager.bootstrap('p1', 'Project', self.repo, remote=True)
        self.assertEqual(self.manager._read_remote_grants(), {'remote-device'})
        restored = WorkbenchRuntime(self.config)
        restored._rpc = Mock(return_value={'revoked': True})
        restored.revoke_remote_devices()
        restored._rpc.assert_called_once_with('platform.revokeDevice', {'deviceId': 'remote-device'})
        self.assertEqual(restored._read_remote_grants(), set())

    def test_remote_ledger_failure_revokes_offer_before_return(self):
        self.start()
        with patch.object(self.manager, '_write_remote_grants', side_effect=OSError('synthetic failure')):
            with self.assertRaises(OSError):
                self.manager.bootstrap('p1', 'Project', self.repo, remote=True)
        self.assertEqual(self.rpc_calls[-1], ('platform.revokeDevice', {'deviceId': 'device-id'}))
        self.assertFalse(self.manager._devices)

    def test_inspect_repo_checks_owned_identity_without_mutation_or_offer(self):
        self.start()
        environment = str(uuid.uuid5(uuid.NAMESPACE_URL, 'control-everything:workbench:60a8f814-a084-44de-923e-b920354aef21'))
        runtime = self.manager.status()['runtimeId']
        self.repos = [{'id': 'native-repo', 'path': str(self.repo), 'displayName': 'Native name',
                       'connectionId': None, 'executionHostId': 'runtime:' + environment}]
        self.assertEqual(self.manager.inspect_repo(environment, runtime, 'native-repo'),
                         {'repo_id': 'native-repo', 'directory': str(self.repo.resolve()), 'name': 'Native name',
                          'environment_id': environment, 'runtime_id': runtime})
        self.assertEqual(self.rpc_calls, [('repo.list', {})])
        self.assertEqual(self.manager._devices, {})
        for env, identity in ((str(uuid.uuid4()), runtime), (environment, 'stale-runtime')):
            with self.subTest(env=env, identity=identity), self.assertRaises(WorkbenchUnavailable):
                self.manager.inspect_repo(env, identity, 'native-repo')
        self.assertEqual(self.rpc_calls, [('repo.list', {})])

    def test_inspect_repo_rejects_unknown_ssh_foreign_duplicate_and_missing_directory(self):
        self.start()
        environment = str(uuid.uuid5(uuid.NAMESPACE_URL, 'control-everything:workbench:60a8f814-a084-44de-923e-b920354aef21'))
        runtime = self.manager.status()['runtimeId']
        original = {'id': 'native-repo', 'path': str(self.repo), 'displayName': 'Native'}
        for rows in ([], [original, original], [{**original, 'connectionId': 'ssh-id'}],
                     [{**original, 'executionHostId': 'ssh:ssh-id'}],
                     [{**original, 'executionHostId': 'runtime:foreign'}],
                     [original, {**original, 'id': 'second-id'}],
                     [{**original, 'path': str(self.root / 'missing')}],
                     [{**original, 'path': 'relative'}], [None]):
            self.repos = rows
            with self.subTest(rows=rows), self.assertRaises(WorkbenchUnavailable):
                self.manager.inspect_repo(environment, runtime, 'native-repo')
        self.assertTrue(all(method == 'repo.list' for method, _ in self.rpc_calls))

    def test_inspect_repo_rechecks_runtime_after_owner_read_and_refuses_linked_paths(self):
        self.start()
        environment = str(uuid.uuid5(uuid.NAMESPACE_URL, 'control-everything:workbench:60a8f814-a084-44de-923e-b920354aef21'))
        runtime = self.manager.status()['runtimeId']
        self.repos = [{'id': 'native-repo', 'path': str(self.repo), 'displayName': 'Native'}]
        original = self.manager._read_identity()
        with patch.object(self.manager, '_read_identity', side_effect=[original, original, ({**original[0], 'runtimeId': 'changed'}, *original[1:])]):
            with self.assertRaises(WorkbenchUnavailable):
                self.manager.inspect_repo(environment, runtime, 'native-repo')
        def checked_path(value):
            if Path(value) == self.repo:
                raise WorkbenchUnavailable('runtime_path_invalid')
            return safe_path(value)
        with patch('control_everything.integrations.workbench_runtime.safe_path', side_effect=checked_path):
            with self.assertRaises(WorkbenchUnavailable):
                self.manager.inspect_repo(environment, runtime, 'native-repo')

    def test_empty_workbench_only_bootstraps_runtime_without_project_or_root(self):
        from dataclasses import replace
        self.manager.config = replace(self.config, allowed_workspace_roots=())
        self.start()
        result = self.manager.bootstrap_runtime()
        self.assertEqual(set(result), {'runtime'})
        self.assertEqual([method for method, _ in self.rpc_calls], ['platform.bootstrapDevice'])
        self.assertEqual(self.repos, [])
        self.assertNotIn('authToken', json.dumps(result))
        self.manager.discard_bootstrap(result)
        self.assertEqual(self.rpc_calls[-1], ('platform.revokeDevice', {'deviceId': 'device-id'}))

    def test_empty_workbench_reuses_remote_journal_and_identity_cleanup(self):
        self.start()
        with patch.object(self.manager, '_write_remote_grants', side_effect=OSError('synthetic failure')):
            with self.assertRaises(OSError):
                self.manager.bootstrap_runtime(remote=True)
        self.assertEqual(self.rpc_calls[-1], ('platform.revokeDevice', {'deviceId': 'device-id'}))
        self.assertFalse(self.manager._devices)
        original = self.manager._owner_call
        def wrong_identity(method, params):
            value = original(method, params)
            if method == 'platform.bootstrapDevice':
                value['offer']['hostDescriptor']['installationId'] = str(uuid.uuid4())
            return value
        self.manager._owner_call = wrong_identity
        with self.assertRaisesRegex(WorkbenchUnavailable, 'runtime_identity_mismatch'):
            self.manager.bootstrap_runtime()
        self.assertEqual(self.rpc_calls[-1], ('platform.revokeDevice', {'deviceId': 'device-id'}))
        self.assertFalse(self.manager._devices)

    def test_remote_proof_only_enters_controlled_environment(self):
        from dataclasses import replace
        self.manager.config = replace(self.config, public_origin='https://workbench.example.test', device_proof='A'*43,
            remote_device_id='device-1', remote_generation=1, platform_installation_id='platform-installation-1')
        self.start()
        spawn = next(row for row in self.api.calls if row[0] == 'spawn')
        self.assertNotIn('A'*43, str(spawn[2]))
        self.assertEqual(spawn[3]['CE_WORKBENCH_DEVICE_PROOF'], 'A'*43)
        self.assertEqual(spawn[3]['CE_REMOTE_INSTALLATION_ID'], 'platform-installation-1')
        self.assertNotIn('A'*43, repr(self.manager.config))

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

    def test_desktop_inherits_host_configuration_without_creating_agent_homes(self):
        host = self.root / 'user'
        config = replace(self.config, inherit_host_environment=True)
        self.manager.config = config
        inherited = {
            'HOME': str(host), 'USERPROFILE': str(host), 'APPDATA': str(host / 'roaming'),
            'LOCALAPPDATA': str(host / 'local'), 'PATH': str(host / 'bin'),
            'CLAUDE_CONFIG_DIR': str(host / 'claude'), 'CODEX_HOME': str(host / 'codex'),
            'ANTHROPIC_BASE_URL': 'https://gateway.example.test', 'ANTHROPIC_AUTH_TOKEN': 'fixture-token',
            'HTTPS_PROXY': 'http://proxy.example.test:8080', 'GIT_CONFIG_GLOBAL': str(host / 'gitconfig'),
            'TEMP': str(host / 'tmp'), 'TMP': str(host / 'tmp'),
            'CE_WORKBENCH_PUBLIC_ORIGIN': 'https://stale.example.test',
            'CE_WORKBENCH_DEVICE_PROOF': 'stale-proof', 'CE_REMOTE_DEVICE_ID': 'stale-device',
            'CE_WORKBENCH_CREDENTIAL_ROOT': str(host / 'stale-credentials'),
        }
        with patch.dict(os.environ, inherited):
            self.start()
        env = next(row for row in self.api.calls if row[0] == 'spawn')[3]
        for key, value in inherited.items():
            if key.startswith('CE_') or key == 'PATH':
                continue
            self.assertEqual(env[key], value, key)
        self.assertEqual(env['PATH'].split(os.pathsep)[0], inherited['PATH'])
        self.assertEqual(env['CE_WORKBENCH_HOST_ENVIRONMENT'], '1')
        self.assertEqual(env['CE_WORKBENCH_ISOLATED'], '1')
        self.assertEqual(env['CE_WORKBENCH_ORIGIN'], 'http://127.0.0.1:12345')
        self.assertEqual(env['ORCA_USER_DATA'], str(self.data / 'state'))
        for key in ('CE_WORKBENCH_PUBLIC_ORIGIN', 'CE_WORKBENCH_DEVICE_PROOF', 'CE_REMOTE_DEVICE_ID',
                    'CE_WORKBENCH_CREDENTIAL_ROOT'):
            self.assertNotIn(key, env)
        self.assertFalse(host.exists())
        self.assertFalse((self.data / 'home').exists())

    def test_desktop_preserves_default_agent_home_lookup_and_authoritative_remote_proof(self):
        ambient = {'SystemRoot': str(self.root / 'system'), 'USERPROFILE': str(self.root / 'user')}
        env = workbench_environment(self.data, self.engine / 'node.exe', self.config.git_executable,
                                    'http://127.0.0.1:12345', ambient, inherit_host_environment=True,
                                    remote_origin='https://workbench.example.test', device_proof='A' * 43)
        for key in ('HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'):
            self.assertNotIn(key, env)
        self.assertEqual(env['USERPROFILE'], ambient['USERPROFILE'])
        self.assertEqual(env['CE_WORKBENCH_DEVICE_PROOF'], 'A' * 43)
        self.assertEqual(env['CE_WORKBENCH_PUBLIC_ORIGIN'], 'https://workbench.example.test')

    def test_desktop_discards_case_variant_of_untrusted_credential_root(self):
        ambient = {'SystemRoot': str(self.root / 'system'), 'USERPROFILE': str(self.root / 'user'),
                   'ce_workbench_credential_root': str(self.root / 'untrusted')}
        env = workbench_environment(self.data, self.engine / 'node.exe', self.config.git_executable,
                                    'http://127.0.0.1:12345', ambient, inherit_host_environment=True)
        self.assertNotIn('CE_WORKBENCH_CREDENTIAL_ROOT', {key.upper() for key in env})
        self.assertEqual(env['USERPROFILE'], ambient['USERPROFILE'])

    def test_explicit_credential_root_preserves_host_configuration(self):
        selected = self.data / 'state' / 'credentials'
        selected.mkdir(parents=True)
        ambient = {'SystemRoot': str(self.root / 'system'), 'HOME': str(self.root / 'host'),
                   'CLAUDE_CONFIG_DIR': str(self.root / 'host-claude'),
                   'CE_WORKBENCH_CREDENTIAL_ROOT': str(self.root / 'untrusted')}
        env = workbench_environment(self.data, self.root / 'node.exe', self.config.git_executable,
                                    'http://127.0.0.1:12345', ambient, inherit_host_environment=True,
                                    credential_root=selected)
        self.assertEqual(env['CE_WORKBENCH_CREDENTIAL_ROOT'], str(selected))
        self.assertEqual(env['HOME'], ambient['HOME'])
        self.assertEqual(env['CLAUDE_CONFIG_DIR'], ambient['CLAUDE_CONFIG_DIR'])

    def test_explicit_credential_root_cannot_escape_profile_or_be_missing(self):
        for selected in (self.root, self.data / 'state', self.data / 'state' / 'missing'):
            with self.subTest(selected=selected), self.assertRaises(WorkbenchUnavailable):
                workbench_environment(self.data, self.root / 'node.exe', self.config.git_executable,
                                      'http://127.0.0.1:12345', credential_root=selected)

    def test_system_directory_survives_legacy_pty_path_scanner(self):
        node, git = self.root / 'node/node.exe', self.root / 'git/git.exe'
        system = self.root / 'system'
        env = workbench_environment(self.data, node, git, 'http://127.0.0.1:12345',
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

    def test_bootstrap_opens_plain_project_directory_as_folder(self):
        self.start()
        self.manager.bootstrap('project', 'Demo', self.repo)
        self.assertIn(('repo.add', {'path': str(self.repo), 'displayName': 'Demo', 'kind': 'folder'}), self.rpc_calls)
        self.assertFalse((self.repo / '.git').exists())

    def test_bootstrap_does_not_expand_plain_project_to_parent_repository(self):
        (self.repo.parent / '.git').mkdir()
        self.start()
        self.manager.bootstrap('project', 'Demo', self.repo)
        self.assertIn(('repo.add', {'path': str(self.repo), 'displayName': 'Demo', 'kind': 'folder'}), self.rpc_calls)

    def test_bootstrap_preserves_git_directory_and_linked_worktree_registration(self):
        self.start()
        for marker in ('directory', 'file'):
            with self.subTest(marker=marker):
                project = self.repo / marker
                project.mkdir()
                if marker == 'directory':
                    (project / '.git').mkdir()
                else:
                    (project / '.git').write_text('gitdir: ../repository/.git/worktrees/linked\n')
                self.manager.bootstrap('project', 'Demo', project)
                self.assertIn(('repo.add', {'path': str(project), 'displayName': 'Demo', 'kind': 'git'}), self.rpc_calls)

    def test_bootstrap_reuses_existing_repo_without_changing_kind(self):
        (self.repo / '.git').mkdir()
        existing = {'id': 'existing-repo', 'path': str(self.repo), 'kind': 'folder', 'displayName': 'Demo'}
        self.repos.append(existing.copy())
        self.start()
        result = self.manager.bootstrap('project', 'Demo', self.repo)
        self.assertEqual(result['target'], {'repoId': 'existing-repo'})
        self.assertEqual(self.repos, [existing])
        self.assertEqual([method for method, _ in self.rpc_calls], ['repo.list', 'worktree.list', 'platform.bootstrapDevice'])

    def test_bootstrap_updates_project_name_without_replacing_repo_or_sessions(self):
        self.repos.append({'id': 'existing-repo', 'path': str(self.repo), 'kind': 'folder', 'displayName': 'Old'})
        self.start()
        result = self.manager.bootstrap('project', 'Renamed', self.repo)
        self.assertEqual(result['target'], {'repoId': 'existing-repo'})
        self.assertEqual(self.repos[0]['kind'], 'folder')
        self.assertEqual(self.repos[0]['displayName'], 'Renamed')
        self.assertEqual(self.rpc_calls[1], ('repo.update', {'repo': 'id:existing-repo', 'updates': {'displayName': 'Renamed'}}))
        self.assertEqual([method for method, _ in self.rpc_calls], ['repo.list', 'repo.update', 'worktree.list', 'platform.bootstrapDevice'])

    def test_bootstrap_does_not_downgrade_invalid_git_marker_after_rpc_failure(self):
        (self.repo / '.git').write_text('invalid git marker')
        self.start()
        def rejected(method, params):
            if method == 'repo.add':
                self.rpc_calls.append((method, params))
                raise WorkbenchUnavailable('runtime_protocol_error')
            return self.rpc(method, params)
        with patch.object(self.manager, '_owner_call', side_effect=rejected):
            with self.assertRaisesRegex(WorkbenchUnavailable, 'runtime_protocol_error'):
                self.manager.bootstrap('project', 'Demo', self.repo)
        self.assertEqual(self.rpc_calls, [
            ('repo.list', {}),
            ('repo.add', {'path': str(self.repo), 'displayName': 'Demo', 'kind': 'git'}),
        ])

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
