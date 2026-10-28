"""Acceptance-driver contracts with synthetic files and socket-free HTTP handlers."""

from email.message import Message
from io import BytesIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from urllib.parse import urlsplit

from control_everything.http.gateway import PanelHandler
from control_everything.http.workbench import WorkbenchAssets
from control_everything.installation.maintenance import launcher_bytes
from control_everything.paths import web_root
from tests.backend.test_workbench_http import asset_fixture
from tests.e2e import verify_installed_product as acceptance


class InstalledProductAcceptanceTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def test_launcher_matches_each_installed_product_and_rejects_wrong_entry(self):
        version_id = '0.1.0a2-' + 'a' * 16
        version = self.root / 'versions' / version_id
        version.mkdir(parents=True)
        for desktop in (False, True):
            with self.subTest(desktop=desktop):
                document = {'product': 'session-panel', 'version': '0.1.0a2', 'closure': 'a' * 64,
                            'files': [{'path': 'desktop-runtime.json'}] if desktop else []}
                (version / 'product.json').write_text(json.dumps(document), encoding='utf-8')
                launcher = self.root / 'session-panel.cmd'
                launcher.write_bytes(launcher_bytes(version_id, desktop=desktop))
                driver = acceptance.Acceptance(self.root, {})
                driver.launcher(self.root, version_id)
                launcher.write_bytes(launcher_bytes(version_id, desktop=not desktop))
                with self.assertRaisesRegex(ValueError, 'active_launcher_target'):
                    driver.launcher(self.root, version_id)
        document['closure'] = 'b' * 64
        (version / 'product.json').write_text(json.dumps(document), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'active_product_identity'):
            driver.launcher(self.root, version_id)

    def test_manifest_selects_desktop_assembly_without_legacy_fallback(self):
        desktop = SimpleNamespace(server=object())
        with patch('control_everything.http.desktop.build_desktop', return_value=desktop) as build, \
                patch('control_everything.http.gateway.build_profile_server', return_value=object()) as legacy:
            self.assertEqual(acceptance.build_probe_server(self.root, self.root / 'profile',
                             {'files': [{'path': 'desktop-runtime.json'}]}, None), (desktop.server, desktop))
            build.assert_called_once_with(self.root, self.root / 'profile', port=0)
            legacy.assert_not_called()
            build.side_effect = ValueError('broken desktop')
            with self.assertRaisesRegex(ValueError, 'broken desktop'):
                acceptance.build_probe_server(self.root, self.root / 'profile',
                                              {'files': [{'path': 'desktop-runtime.json'}]}, None)
            legacy.assert_not_called()
            server, owner = acceptance.build_probe_server(self.root, self.root / 'profile', {'files': []}, 'offline')
            self.assertIs(server, legacy.return_value)
            self.assertIsNone(owner)
            legacy.assert_called_once_with(str(self.root / 'profile'), port=0, news_source='offline')

    def resources(self, *, corrupt=False):
        root = self.root / 'web'
        entries = {'web-index.html': b'<script src="./assets/main.js"></script>',
                   'assets/main.js': b'export {}'}
        assets = WorkbenchAssets(root, asset_fixture(root, entries))
        server = SimpleNamespace(workbench_assets=assets, profile=None, workspace=None,
                                 expected_host='127.0.0.1:1234', origin='http://127.0.0.1:1234',
                                 local_origin='http://127.0.0.1:1234',
                                 workbench_runtime=Mock(ready=True, websocket_origin='ws://127.0.0.1:23456'))
        visited = []
        def open_resource(url, timeout):
            handler = PanelHandler.__new__(PanelHandler)
            handler.server, handler.path = server, urlsplit(url).path
            handler.headers = Message()
            handler.headers['Host'] = server.expected_host
            handler.wfile = BytesIO()
            response_headers = {}
            handler.send_response = lambda code: self.assertEqual(code, 200)
            handler.send_header = lambda key, value: response_headers.__setitem__(key, value)
            handler.end_headers = lambda: None
            handler.do_GET()
            raw = handler.wfile.getvalue()
            response = BytesIO(raw + b'wrong' if corrupt else raw)
            response.headers = response_headers
            visited.append(handler.path)
            return response
        return server, SimpleNamespace(open=open_resource), visited

    def test_desktop_probe_checks_real_studio_routing_and_all_registered_assets(self):
        server, opener, visited = self.resources()
        rows = acceptance.verify_desktop_resources(server, opener, web_root())
        self.assertEqual(visited, ['/studio', '/workbench/assets/main.js', '/desktop', '/desktop.js'])
        self.assertEqual([row['url'] for row in rows], visited)
        self.assertTrue(all(len(row['sha256']) == 64 for row in rows))

    def test_desktop_probe_rejects_stale_runtime_and_changed_http_bytes(self):
        server, opener, visited = self.resources(corrupt=True)
        server.workbench_runtime.ready = False
        with self.assertRaisesRegex(ValueError, 'desktop_runtime_not_ready'):
            acceptance.verify_desktop_resources(server, opener, web_root())
        self.assertEqual(visited, [])
        server.workbench_runtime.ready = True
        with self.assertRaisesRegex(ValueError, 'desktop_resource_bytes:/studio'):
            acceptance.verify_desktop_resources(server, opener, web_root())

    def test_registration_and_shortcut_guards_still_block_without_mutation(self):
        with patch('winreg.OpenKey') as registry:
            with self.assertRaisesRegex(ValueError, 'existing_app_id_registration'):
                acceptance.guard_registration()
            registry.assert_called_once()
        shortcut = self.root / 'Microsoft/Windows/Start Menu/Programs/Session Panel.lnk'
        shortcut.parent.mkdir(parents=True)
        shortcut.write_bytes(b'owned fixture')
        with patch('winreg.OpenKey', side_effect=FileNotFoundError), \
                patch.dict(acceptance.os.environ, {'APPDATA': str(self.root)}):
            with self.assertRaisesRegex(ValueError, 'existing_start_menu_shortcut'):
                acceptance.guard_registration()
        self.assertEqual(shortcut.read_bytes(), b'owned fixture')


if __name__ == '__main__':
    unittest.main()
