"""Socket-free integration contracts using disposable management data only."""

import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch

from control_everything.http.workbench import WorkbenchAssets
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


if __name__ == "__main__":
    unittest.main()
