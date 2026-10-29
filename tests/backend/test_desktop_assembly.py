"""Product assembly and active-work preservation contracts."""

from dataclasses import replace
from io import BytesIO
from email.message import Message
import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from control_everything.http.desktop import Desktop, _news_runtime, build_desktop
from control_everything.workspace import news_settings
from control_everything.workspace.news_runtime import NewsRuntime
from control_everything.http.gateway import PanelHandler, build_profile_server
from control_everything.http.remote_context import inject
from control_everything.integrations.remote_access import RemoteAccess
from control_everything.integrations.workbench_runtime import RuntimeConfig, WorkbenchUnavailable


class DesktopAssemblyTests(unittest.TestCase):
    def test_saved_endpoints_are_loaded_when_desktop_restarts(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            config = {'engine_root': 'engine', 'build_run': 'build', 'git': 'git.exe',
                      'ssh': 'ssh.exe', 'keygen': 'ssh-keygen.exe', 'issuer': '', 'hub_origin': ''}
            (root / 'desktop-runtime.json').write_text(json.dumps(config))
            files = [{'path': name} for name in ('desktop-runtime.json', 'engine/output', 'build/output', 'git.exe', 'ssh.exe', 'ssh-keygen.exe')]
            server = Mock(profile=SimpleNamespace(data_dir=root / 'profile'))
            saved = {'issuer': 'https://identity.example.test/realm', 'hub_origin': 'https://hub.example.test', 'storage': 'isolated'}
            with patch('control_everything.http.desktop.manifest.verify_payload', return_value={'files': files}), \
                 patch('control_everything.http.desktop.build_profile_server', return_value=server), \
                 patch('control_everything.http.desktop._news_runtime', return_value={}), \
                 patch('control_everything.http.desktop.WorkbenchAssets'), \
                 patch('control_everything.http.desktop.WorkbenchRuntime'), \
                 patch('control_everything.http.desktop.InitialServerConfig') as setup, \
                 patch('control_everything.http.desktop.ConnectorConfig') as connector_config, \
                 patch('control_everything.http.desktop.ConnectorStore') as connector_store, \
                 patch('control_everything.http.desktop.RemoteConnector'), \
                 patch('control_everything.http.desktop.RemoteAccount'):
                setup.return_value.load.return_value = saved
                desktop = build_desktop(root)
                connector_store.assert_called_once_with(root / 'profile' / 'remote' / 'self-hosted')
                connector_store.reset_mock()
                setup.return_value.load.reset_mock()
                setup.return_value.load.return_value = {**saved, 'storage': 'generation-' + 'a' * 32}
                build_desktop(root)
                connector_store.assert_called_once_with(root / 'profile' / 'remote' / ('generation-' + 'a' * 32))
                connector_store.reset_mock()
                setup.return_value.load.reset_mock()
                setup.return_value.load.return_value = {**saved, 'storage': 'legacy'}
                legacy = build_desktop(root)
                connector_store.assert_called_once_with(root / 'profile' / 'remote')
            setup.return_value.load.assert_called_once_with(None)
            self.assertEqual(connector_config.call_args.args[:2], (saved['issuer'], saved['hub_origin']))
            self.assertIs(desktop.server_setup, setup.return_value)
            self.assertIsNone(legacy.server_setup)

    def test_installed_desktop_uses_host_environment(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            config = {'engine_root': 'engine', 'build_run': 'build', 'git': 'git.exe',
                      'ssh': 'ssh.exe', 'keygen': 'ssh-keygen.exe', 'issuer': '', 'hub_origin': ''}
            (root / 'desktop-runtime.json').write_text(json.dumps(config))
            files = [{'path': name} for name in ('desktop-runtime.json', 'engine/output', 'build/output', 'git.exe', 'ssh.exe', 'ssh-keygen.exe')]
            server = Mock(profile=SimpleNamespace(data_dir=root / 'profile'))
            with patch('control_everything.http.desktop.manifest.verify_payload', return_value={'files': files}), \
                 patch('control_everything.http.desktop.build_profile_server', return_value=server), \
                 patch('control_everything.http.desktop._news_runtime', return_value={}), \
                 patch('control_everything.http.desktop.WorkbenchAssets'), \
                 patch('control_everything.http.desktop.WorkbenchRuntime') as runtime:
                build_desktop(root)
            self.assertTrue(runtime.call_args.args[0].inherit_host_environment)

    def test_news_runtime_uses_only_manifest_registered_node_and_exact_core(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            prefix = 'workbench-engine/out/'
            core = prefix + 'node_modules/playwright-core/'
            node_hash = hashlib.sha256(b'pinned node fixture').hexdigest()
            node = prefix + 'runtimes/node-' + node_hash + '/node.exe'
            contents = {prefix + 'orcad/.runtime-node': node_hash.encode(), node: b'pinned node fixture',
                        core + 'index.js': b'module.exports = {}',
                        core + 'package.json': json.dumps({'name': 'playwright-core', 'version': '1.64.0'}).encode()}
            for name, raw in contents.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(raw)
            files = [{'path': name, 'sha256': hashlib.sha256(raw).hexdigest()} for name, raw in contents.items()]
            self.assertEqual(_news_runtime(root, 'workbench-engine', files),
                             {'node': str(root / node), 'playwright_core': str(root / core)})
            self.assertEqual(_news_runtime(root, 'workbench-engine', files[:-1]), {})
            changed = [{**row, 'sha256': '0' * 64} if row['path'] == node else row for row in files]
            with self.assertRaisesRegex(ValueError, 'news_runtime_node_identity'):
                _news_runtime(root, 'workbench-engine', changed)
            (root / (core + 'package.json')).write_text(json.dumps({'name': 'playwright-core', 'version': '1.63.0'}))
            with self.assertRaisesRegex(ValueError, 'news_runtime_browser_identity'):
                _news_runtime(root, 'workbench-engine', files)

    def test_installed_news_runtime_is_injected_before_enabled_schedule_start(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            product, data = root / 'product', root / 'profile'
            prefix = 'workbench-engine/out/'
            node_bytes = b'pinned node fixture'
            node_hash = hashlib.sha256(node_bytes).hexdigest()
            node = prefix + 'runtimes/node-' + node_hash + '/node.exe'
            core = prefix + 'node_modules/playwright-core/'
            config = {'engine_root': 'workbench-engine', 'build_run': 'build-run',
                      'git': 'tools/git.exe', 'ssh': 'tools/ssh.exe', 'keygen': 'tools/ssh-keygen.exe',
                      'issuer': '', 'hub_origin': ''}
            contents = {'desktop-runtime.json': json.dumps(config).encode(),
                        prefix + 'orcad/.runtime-node': node_hash.encode(), node: node_bytes,
                        core + 'index.js': b'module.exports = {}',
                        core + 'package.json': json.dumps({'name': 'playwright-core', 'version': '1.64.0'}).encode(),
                        'build-run/web-assets.json': b'{}', 'tools/git.exe': b'fixture',
                        'tools/ssh.exe': b'fixture', 'tools/ssh-keygen.exe': b'fixture'}
            for name, raw in contents.items():
                target = product / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
            files = [{'path': name, 'sha256': hashlib.sha256(raw).hexdigest()}
                     for name, raw in contents.items()]
            settings = news_settings.default_settings()
            settings['schedule'].update(enabled=True, mode='interval', interval_minutes=15)
            settings = news_settings.validate_settings(
                {'expected_revision': settings['revision'], **{key: settings[key] for key in ('sources', 'view', 'schedule')}},
                news_settings.default_settings())
            news_settings.save(data / 'news-reader', settings)
            expected = {'node': str(product / node), 'playwright_core': str(product / core)}
            started = []

            def inspect_start(scheduler):
                runtime = scheduler.reader.jobs.runtime
                started.append((scheduler, dict(runtime) if runtime is not None else None,
                                dict(scheduler.settings['schedule'])))

            # Keep real profile/gateway/reader construction; never start collectors or Node.
            with patch('control_everything.http.desktop.manifest.verify_payload', return_value={'files': files}), \
                 patch('control_everything.http.desktop.WorkbenchRuntime') as workbench, \
                 patch('control_everything.http.desktop.WorkbenchAssets'), \
                 patch('control_everything.workspace.native_progress_observer.NativeProgressObserver'), \
                 patch.object(NewsRuntime, 'start', autospec=True, side_effect=inspect_start) as start:
                desktop = build_desktop(product, data, port=0)
                try:
                    self.assertEqual(len(started), 1)
                    scheduler, runtime_at_start, schedule_at_start = started[0]
                    self.assertIs(scheduler, desktop.server.news_reader.runtime)
                    self.assertEqual(scheduler.reader.root, (data / 'news-reader').resolve())
                    self.assertEqual(schedule_at_start, settings['schedule'])
                    self.assertTrue(schedule_at_start['enabled'])
                    self.assertEqual(runtime_at_start, expected)
                    start.assert_called_once_with(desktop.server.news_reader.runtime)
                    self.assertEqual(desktop.server.news_runtime, expected)
                    workbench.return_value.start.assert_not_called()
                finally:
                    desktop.server.server_close()

    def test_source_profile_keeps_default_news_runtime_when_starting_schedule(self):
        with TemporaryDirectory() as temporary:
            data = Path(temporary)
            settings = news_settings.default_settings()
            body = {'expected_revision': settings['revision'],
                    **{key: settings[key] for key in ('sources', 'view', 'schedule')}}
            body['schedule'].update(enabled=True, mode='interval', interval_minutes=15)
            news_settings.save(data / 'news-reader', news_settings.validate_settings(body, settings))
            at_start = []
            with patch.object(NewsRuntime, 'start', autospec=True,
                              side_effect=lambda scheduler: at_start.append(
                                  (scheduler.reader.jobs.runtime, scheduler.settings['schedule']['enabled']))):
                server = build_profile_server(data, port=0)
                try:
                    self.assertEqual(at_start, [(None, True)])
                    self.assertIsNone(server.news_runtime)
                finally:
                    server.server_close()

    def setup_desktop(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        config = RuntimeConfig(root, root, root / 'data', root / 'git.exe', ())
        runtime = Mock(config=config, ready=True, websocket_origin='ws://127.0.0.1:24000')
        server = SimpleNamespace(local_origin='http://127.0.0.1:1234', server_address=('127.0.0.1', 1234),
                                 workspace=Mock(), attach_workbench_runtime=Mock())
        connector = Mock(remote_access=None, health_identity=None)
        return Desktop(server, runtime, connector), root

    def test_busy_managed_stop_preserves_local_runtime_and_does_not_connect_or_force(self):
        desktop, _ = self.setup_desktop()
        desktop.connector.remote_access = RemoteAccess('https://workbench.example.test', 'A' * 43)
        desktop.connector.health_identity = {'device_id':'d', 'generation':1, 'platform_installation_id':'i'}
        original = desktop.runtime.config
        desktop.runtime.close.side_effect = WorkbenchUnavailable('runtime_daemon_busy')
        desktop.tick()
        self.assertTrue(desktop.restart_required)
        self.assertEqual(desktop.runtime.config, original)
        desktop.runtime.close.assert_not_called()
        desktop.runtime.start.assert_not_called()
        desktop.connector.connect.assert_not_called()
        desktop.tick()
        desktop.runtime.close.assert_not_called()

    def test_configuration_change_blocks_background_connection_until_restart(self):
        desktop, _ = self.setup_desktop()
        desktop.configuration_changed = True
        desktop.tick()
        desktop.connector.connect.assert_not_called()
        desktop.runtime.start.assert_not_called()

    def test_roots_follow_registered_main_directories_only_without_runtime_restart(self):
        desktop, root = self.setup_desktop()
        desktop.server.workspace.registered_projects.return_value = []
        desktop.refresh_workspace_roots()
        self.assertEqual(desktop.runtime.config.allowed_workspace_roots, ())
        project = root / 'project'; project.mkdir()
        desktop.server.workspace.registered_projects.return_value = [
            {'directories':[{'id':'main','path':str(project)}]},
            {'archived':True,'directories':[{'id':'main','path':str(root)}]},
            {'directories':[{'id':'other','path':str(root)}]}]
        desktop.refresh_workspace_roots()
        self.assertEqual(desktop.runtime.config.allowed_workspace_roots, (project.resolve(),))
        desktop.runtime.close.assert_not_called()
        desktop.runtime.start.assert_not_called()
        desktop.server.workspace.registered_projects.return_value = [{'directories':[{'id':'main','path':'relative'}]}]
        with self.assertRaises(WorkbenchUnavailable):
            desktop.refresh_workspace_roots()

    def test_confirmed_access_precedes_the_only_runtime_start_and_cleanup(self):
        desktop, _ = self.setup_desktop()
        desktop.runtime.ready = False
        events = []
        def prepare():
            events.append('prepare')
            desktop.connector.remote_access = RemoteAccess('https://workbench.example.test', 'A' * 43)
            desktop.connector.health_identity = {'device_id':'d', 'generation':2, 'platform_installation_id':'i'}
        def start(origin):
            events.append('start')
            self.assertEqual(desktop.runtime.config.remote_device_id, 'd')
            self.assertEqual(origin, desktop.server.local_origin)
        desktop.connector.prepare_access.side_effect = prepare
        desktop.runtime.start.side_effect = start
        desktop.connector.resume_revocation_cleanup.side_effect = lambda: events.append('cleanup')
        with patch('control_everything.http.desktop.threading.Thread'):
            desktop.start()
        self.assertEqual(events, ['prepare', 'start', 'cleanup'])
        desktop.runtime.start.assert_called_once()
        desktop.runtime.close.assert_not_called()

    def test_health_and_html_meta_are_before_any_script_and_never_include_proof(self):
        headers = Message()
        headers['X-CE-Device-Proof'] = 'A' * 43
        headers['X-CE-Page-Context'] = 'C' * 32
        headers['X-CE-Storage-Scope'] = 'a' * 64
        html = b'<!doctype html><html><head><script src="app.js"></script></head></html>'
        result = inject(SimpleNamespace(headers=headers), html)
        self.assertLess(result.index(b'ce-remote-context'), result.index(b'<script'))
        self.assertNotIn(b'A' * 43, result)
        headers.replace_header('X-CE-Page-Context', '"><script>bad</script>')
        with self.assertRaises(ValueError):
            inject(SimpleNamespace(headers=headers), html)

