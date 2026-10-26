"""Socket-free integration contracts using disposable management data only."""

import hashlib
import json
from email.message import Message
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from urllib.parse import urlsplit
import unittest
from unittest.mock import Mock, patch

from control_everything.http.workbench import WorkbenchAssets, STUDIO_CSP, handle_get
from control_everything.integrations.remote_access import RemoteAccess
from tests.backend import test_profile_http as fixtures
from tests.backend.test_project_management import project_body


def asset_fixture(root, files=None):
    files = files or {"web-index.html": b"<!doctype html><div id='root'></div>", "assets/main.js": b"export {}"}
    entries = []
    for relative, content in files.items():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        entries.append({"path": relative, "mime": "text/html; charset=utf-8" if relative.endswith(".html") else "text/javascript; charset=utf-8",
                        "sha256": hashlib.sha256(content).hexdigest(), "bytes": len(content)})
    manifest = root.parent / "web-assets.json"
    manifest.write_text(json.dumps({"schema": 1, "files": entries}), encoding="utf-8")
    return manifest


class WorkbenchAssetTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name) / "web"
        self.manifest = asset_fixture(self.root)

    def test_manifest_is_exact_and_changed_bytes_are_rejected(self):
        assets = WorkbenchAssets(self.root, self.manifest)
        self.assertEqual(assets.read("assets/main.js")[0], b"export {}")
        for value in ("../secret", "assets/../../secret", "/web-index.html", "assets\\main.js", "assets/%2e%2e/secret", ".vite/manifest.json", "assets/main.js.map"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                assets.read(value)
        (self.root / "unlisted.js").write_text("secret", encoding="utf-8")
        with self.assertRaises(FileNotFoundError):
            assets.read("unlisted.js")
        (self.root / "assets/main.js").write_bytes(b"export {x}")
        with self.assertRaisesRegex(ValueError, "workbench_asset_changed"):
            assets.read("assets/main.js")

    def test_manifest_rejects_duplicate_and_unlisted_types(self):
        manifest = json.loads(self.manifest.read_text(encoding="utf-8"))
        manifest["files"].append(manifest["files"][0])
        self.manifest.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaises(ValueError):
            WorkbenchAssets(self.root, self.manifest)
        manifest["files"][-1] = {**manifest["files"][0], "path": "runtime.exe"}
        self.manifest.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "invalid_workbench_asset"):
            WorkbenchAssets(self.root, self.manifest)

    def test_links_are_rechecked_before_serving_and_manifest_types_are_strict(self):
        assets = WorkbenchAssets(self.root, self.manifest)
        with patch.object(Path, "is_junction", return_value=True):
            with self.assertRaisesRegex(ValueError, "linked_workbench_asset"):
                assets.read("assets/main.js")
        original = json.loads(self.manifest.read_text(encoding="utf-8"))
        for field, value in (("sha256", None), ("bytes", True), ("mime", "text/javascript\r\nInjected: value")):
            manifest = json.loads(json.dumps(original))
            manifest["files"][0][field] = value
            self.manifest.write_text(json.dumps(manifest), encoding="utf-8")
            with self.subTest(field=field), self.assertRaises(ValueError):
                WorkbenchAssets(self.root, self.manifest)


class WorkbenchHTTPTests(unittest.TestCase):
    request = fixtures.ProfileHTTPTests.request

    def setUp(self):
        fixtures.ProfileHTTPTests.setUp(self)
        self.project = self.profile.store.save_project(project_body(self.root / "repo"))
        self.runtime = Mock(ready=True, websocket_origin="ws://127.0.0.1:23456")
        self.runtime.bootstrap.return_value = {"runtime": {"environmentId": "fixture-host", "offer": {"v": 2}},
                                               "target": {"repoId": "fixture-repo"}}
        self.runtime.bootstrap_runtime.return_value = {"runtime": {"environmentId": "fixture-host",
                                                                  "offer": {"v": 2, "endpoint": "ws://127.0.0.1:23456"}}}
        self.server.workbench_runtime = self.runtime
        self.server.workbench_assets = WorkbenchAssets(self.root / "web", asset_fixture(self.root / "web"))

    def test_bootstrap_uses_registered_directory_and_frozen_response(self):
        status, value = self.request("/api/workbench/bootstrap", "POST", {"project_id": self.project["id"]})
        self.assertEqual(status, 200)
        self.assertEqual(set(value), {"project", "runtime", "target", "returnUrl"})
        self.assertEqual(value["project"], {"id": self.project["id"], "name": self.project["name"]})
        self.runtime.bootstrap.assert_called_once_with(self.project["id"], self.project["name"], str(self.root / "repo"))
        self.assertNotIn("authToken", json.dumps(value))
        self.assertEqual(value["returnUrl"], "/studio#project/" + self.project["id"])

    def test_runtime_bootstrap_needs_no_registered_project_and_keeps_project_contract(self):
        self.workspace.registered_projects = Mock(return_value=[])
        status, value = self.request('/api/workbench/runtime-bootstrap', 'POST', {})
        self.assertEqual((status, set(value)), (200, {'runtime'}))
        self.runtime.bootstrap_runtime.assert_called_once_with()
        self.runtime.bootstrap.assert_not_called()
        self.workspace.registered_projects.assert_not_called()
        self.assertEqual(self.request('/api/workbench/bootstrap', 'POST', {})[0], 400)

    def test_runtime_bootstrap_validates_permissions_and_exact_body_before_mint(self):
        path = '/api/workbench/runtime-bootstrap'
        for headers in ({'Host': 'evil'}, {'Origin': 'http://elsewhere'}, {'X-Session-CSRF': 'bad'},
                        {'X-Session-Client': ''}, {'Origin': [self.server.origin] * 2}):
            with self.subTest(headers=headers):
                self.assertEqual(self.request(path, 'POST', {}, headers)[0], 403)
        for body in ({'project_id': self.project['id']}, {'endpoint': 'ws://elsewhere'}, None, [], {'directory': 'C:/example/project'}):
            with self.subTest(body=body):
                self.assertEqual(self.request(path, 'POST', body)[0], 400)
        self.assertEqual(self.request(path + '?x=1', 'POST', {})[0], 400)
        self.runtime.bootstrap_runtime.assert_not_called()

    def test_runtime_bootstrap_remote_context_and_endpoint_are_not_relaxed(self):
        self.server.remote_access = RemoteAccess('https://workbench.example.test', 'A' * 43)
        headers = {'Host': 'workbench.example.test', 'Origin': 'https://workbench.example.test',
                   'X-CE-Device-Proof': 'A' * 43}
        path = '/api/workbench/runtime-bootstrap'
        self.assertEqual(self.request(path, 'POST', {}, headers)[0], 403)
        self.runtime.bootstrap_runtime.assert_not_called()
        headers.update({'X-CE-Page-Context': 'B' * 32, 'X-CE-Storage-Scope': 'c' * 64})
        status, value = self.request(path, 'POST', {}, headers)
        self.assertEqual(status, 200)
        self.runtime.bootstrap_runtime.assert_called_once_with(remote=True)
        self.assertEqual(value['runtime']['offer']['endpoint'], 'wss://workbench.example.test/workbench-runtime')
        self.assertEqual(self.runtime.bootstrap_runtime.return_value['runtime']['offer']['endpoint'], 'ws://127.0.0.1:23456')

    def test_security_and_body_validation_precede_runtime(self):
        body = {"project_id": self.project["id"]}
        for headers in ({"Host": "evil"}, {"Origin": "http://elsewhere"}, {"Origin": []},
                        {"Origin": [self.server.origin, self.server.origin]}, {"Host": [self.server.expected_host] * 2},
                        {"X-Session-CSRF": "bad"}, {"X-Session-Client": ""}):
            with self.subTest(headers=headers):
                self.assertEqual(self.request("/api/workbench/bootstrap", "POST", body, headers)[0], 403)
        for invalid in ({**body, "directory": "C:/example/private"}, {**body, "endpoint": "ws://elsewhere"}, {}, {"project_id": "../bad"}):
            self.assertEqual(self.request("/api/workbench/bootstrap", "POST", invalid)[0], 400)
        self.assertEqual(self.request("/api/workbench/bootstrap?x=1", "POST", body)[0], 400)
        self.assertEqual(self.request("/api/workbench/bootstrap", "POST", b" " * 4097)[0], 413)
        self.runtime.bootstrap.assert_not_called()

    def test_changed_directory_discards_new_device_and_never_returns_success(self):
        original = self.runtime.bootstrap.return_value
        def change(*_args):
            body = project_body(self.root / "replacement")
            body.update(id=self.project["id"])
            self.profile.store.save_project(body)
            return original
        self.runtime.bootstrap.side_effect = change
        status, value = self.request("/api/workbench/bootstrap", "POST", {"project_id": self.project["id"]})
        self.assertEqual((status, value["reason"]), (409, "project_directory_changed"))
        self.runtime.discard_bootstrap.assert_called_once_with(original)
        self.runtime.discard_bootstrap.side_effect = RuntimeError("fixture revoke failure")
        self.runtime.bootstrap.side_effect = lambda *_args: {**original}
        self.workspace.registered_projects = Mock(side_effect=[[
            {**self.project, "directories": [{"id": "main", "path": "C:/example/before"}]}
        ], [{**self.project, "directories": [{"id": "main", "path": "C:/example/after"}]}]])
        self.assertEqual(self.request("/api/workbench/bootstrap", "POST", {"project_id": self.project["id"]})[1]["reason"], "workbench_device_cleanup_failed")

    def test_static_routes_require_ready_runtime_and_exact_manifest(self):
        page = "/workbench/web-index.html?project_id=" + self.project["id"]
        self.assertEqual(self.request(page)[0], 200)
        csp = self.last_handler.reply.call_args.kwargs["csp"]
        self.assertIn("connect-src 'self' ws://127.0.0.1:23456;", csp)
        self.assertNotIn("ws://*", csp)
        self.assertEqual(self.request("/workbench/assets/main.js")[0], 200)
        for path in ("/workbench/src/main.ts", "/workbench/assets/main.js.map", "/workbench/%2e%2e/secret", "/workbench/assets%5cmain.js"):
            self.assertIn(self.request(path)[0], (400, 404))
        self.assertEqual(self.request("/workbench/unknown.js")[0], 404)
        (self.root / "web/assets/main.js").write_bytes(b"tampered")
        self.assertEqual(self.request("/workbench/assets/main.js")[0], 503)
        self.runtime.ready = False
        self.assertEqual(self.request(page)[0], 503)
        self.runtime.start.assert_not_called()
        self.assertEqual(self.request("/studio")[0], 200)
        self.assertIn(b"id='root'", self.last_handler.reply.call_args.args[1])
        self.assertIn("connect-src 'self' ws://127.0.0.1:23456;", self.last_handler.reply.call_args.kwargs['csp'])
        self.assertEqual(self.request("/studio-shell")[0], 200)
        self.assertIn(b'data-isolated-preview="true"', self.last_handler.reply.call_args.args[1])

    def test_workbench_only_allows_wasm_compilation_without_js_eval_or_new_origins(self):
        baseline = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                    "img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; "
                    "connect-src 'self' {socket}; object-src 'none'; frame-src 'self' blob:; "
                    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        for remote in (False, True):
            for route in ('/studio', '/workbench/web-index.html?project_id=' + self.project['id']):
                with self.subTest(remote=remote, route=route):
                    if remote:
                        access = RemoteAccess('https://workbench.example.test', 'A' * 43)
                        self.server.remote_access = access
                        headers = Message()
                        headers['X-CE-Device-Proof'] = 'A' * 43
                        handler = SimpleNamespace(server=self.server, headers=headers, reply=Mock(), reject=Mock())
                        self.assertTrue(handle_get(handler, urlsplit(route)))
                        handler.reject.assert_not_called()
                        socket = access.websocket_origin
                    else:
                        self.assertEqual(self.request(route)[0], 200)
                        handler, socket = self.last_handler, self.runtime.websocket_origin
                    policy = handler.reply.call_args.kwargs['csp']
                    directives = {part.strip().split()[0]: part.strip().split()[1:] for part in policy.split(';') if part.strip()}
                    self.assertEqual(directives['script-src'], ["'self'", "'wasm-unsafe-eval'"])
                    self.assertNotIn("'unsafe-eval'", directives['script-src'])
                    self.assertEqual(policy.replace(" 'wasm-unsafe-eval'", ''), baseline.format(socket=socket))
        for route in ('/studio-shell', '/workspace-admin'):
            self.assertEqual(self.request(route)[0], 200)
            expected = STUDIO_CSP.replace("frame-src 'none'", f"frame-src {self.server.origin}/news") if route == '/studio-shell' else STUDIO_CSP
            self.assertEqual(self.last_handler.reply.call_args.kwargs['csp'], expected)
            self.assertNotIn("'wasm-unsafe-eval'", STUDIO_CSP)
            self.assertNotIn("'unsafe-eval'", STUDIO_CSP)

    def test_remote_standalone_news_frame_uses_the_verified_public_origin(self):
        from email.message import Message
        from urllib.parse import urlsplit
        self.server.remote_access = RemoteAccess('https://workbench.example.test', 'A' * 43)
        headers = Message()
        headers['X-CE-Device-Proof'] = 'A' * 43
        handler = SimpleNamespace(server=self.server, headers=headers, reply=Mock(), reject=Mock())
        self.assertTrue(handle_get(handler, urlsplit('/studio-shell')))
        policy = handler.reply.call_args.kwargs['csp']
        self.assertEqual(policy, STUDIO_CSP.replace("frame-src 'none'", 'frame-src https://workbench.example.test/news'))

    def test_studio_entry_keeps_manifest_checks_and_resolves_fixed_asset_urls(self):
        files = {"web-index.html": b'<script type="module" src="./assets/main.js"></script><link rel="stylesheet" href="./assets/main.css">',
                 "assets/main.js": b'export {}', "assets/main.css": b'body{}'}
        self.server.workbench_assets = WorkbenchAssets(self.root / 'web', asset_fixture(self.root / 'web', files))
        self.assertEqual(self.request('/studio')[0], 200)
        body = self.last_handler.reply.call_args.args[1]
        self.assertIn(b'src="/workbench/assets/main.js"', body)
        self.assertIn(b'href="/workbench/assets/main.css"', body)
        self.assertNotIn(b'iframe', body)
        self.assertEqual(self.request('/studio-shell?src=elsewhere')[0], 400)
        (self.root / 'web/web-index.html').write_bytes(b'tampered')
        self.assertEqual(self.request('/studio')[0], 503)
        self.runtime.start.assert_not_called()

    def test_mobile_guide_is_an_exact_public_javascript_resource(self):
        from control_everything.http.workbench import WEB
        self.assertEqual(self.request('/mobile-device-entry.js')[0], 200)
        reply = self.last_handler.reply.call_args.args
        self.assertEqual(reply[1], (WEB / 'workspace/mobile-device-entry.js').read_bytes())
        self.assertEqual(reply[2], 'text/javascript; charset=utf-8')
        self.assertEqual(self.request('/mobile-device-entry.js?token=fixture')[0], 400)
        self.runtime.start.assert_not_called()

    def test_legacy_entry_returns_to_integrated_projects_and_admin_remains_explicit(self):
        self.request('/studio')
        handler = self.last_handler
        handler.path = '/workspace'
        handler.send_response, handler.send_header, handler.end_headers = Mock(), Mock(), Mock()
        handler.reply.reset_mock()
        handler.do_GET()
        handler.send_response.assert_called_once_with(302)
        handler.send_header.assert_any_call('Location', '/studio')
        handler.reply.assert_not_called()
        self.assertEqual(self.request('/workspace-admin')[0], 200)
        self.assertIn(b'data-integration-admin="true"', self.last_handler.reply.call_args.args[1])
        self.assertRegex(self.last_handler.reply.call_args.args[1],
                         br'<body\b[^>]*class="ce-workspace-management"')
        self.assertEqual(self.request('/workspace-admin?src=elsewhere')[0], 400)
        self.server.workbench_runtime = None
        self.assertEqual(self.request('/workspace')[0], 200)
        self.assertNotIn(b'data-integration-admin="true"', self.last_handler.reply.call_args.args[1])
        self.assertRegex(self.last_handler.reply.call_args.args[1],
                         br'<body\b[^>]*class="ce-workspace-management"')


if __name__ == "__main__":
    unittest.main()
