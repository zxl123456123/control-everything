"""No-listener creator HTTP contract tests; library and server sockets are synthetic."""

from email.message import Message
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from control_everything.execution.creator_process import CreatorProcesses
from control_everything.http.creator import CreatorHandler, CreatorServer, RESOURCES, agent_client_url, main


class CreatorHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        for filename, _content_type in RESOURCES.values():
            (root / filename).write_text("synthetic resource", encoding="utf-8")
        self.project = {"id": "a" * 32, "name": "创作工程", "kind": "2d", "project_path": "synthetic/project",
                        "user_data_key": "ControlEverythingCreator/" + "a" * 32}
        self.library = Mock(root=root)
        self.library.projects.return_value = [self.project]
        self.library.create.return_value = self.project
        self.library.save_brief.return_value = {"project_id": "a" * 32, "saved": True}
        self.library.detail.return_value = {"project": self.project, "files": [{"path": "main.tscn", "kind": "scene"}],
                                            "files_truncated": False, "brief": "原始文本"}
        self.processes = Mock()
        self.processes.snapshot.return_value = CreatorProcesses().snapshot()
        self.processes.start.return_value = {"run_id": "b" * 32, "state": "starting"}
        self.server = SimpleNamespace(library=self.library, processes=self.processes, resource_root=root,
                                      expected_host="127.0.0.1:8770", origin="http://127.0.0.1:8770",
                                      csrf_token="token", agent_client_url="")

    def request(self, path="/api/creator/state", method="GET", body=None, headers=None):
        handler = CreatorHandler.__new__(CreatorHandler)
        handler.server, handler.path, handler.command = self.server, path, method
        handler.headers = Message()
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode() if body is not None else b""
        values = {"Host": self.server.expected_host}
        if method == "POST":
            values.update({"Origin": self.server.origin, "X-Creator-CSRF": "token", "Content-Type": "application/json",
                           "Content-Length": str(len(data))})
        values.update(headers or {})
        for key, value in values.items():
            for item in value if isinstance(value, list) else [value]:
                handler.headers[key] = item
        handler.rfile, handler.wfile = io.BytesIO(data), io.BytesIO()
        handler.connection = Mock()
        handler.send_response, handler.send_header, handler.end_headers = Mock(), Mock(), Mock()
        getattr(handler, "do_" + method)()
        self.handler = handler
        status = handler.send_response.call_args.args[0]
        response_headers = dict(call.args for call in handler.send_header.call_args_list)
        raw = handler.wfile.getvalue()
        content = json.loads(raw) if response_headers["Content-Type"].startswith("application/json") and raw else raw
        return status, content, response_headers

    def action(self, action="play", project_id="a" * 32, **extra):
        return self.request("/api/creator/action", "POST", {"project_id": project_id, "action": action, **extra})

    def test_v2_state_projects_and_unconfigured_agent_contract(self):
        status, state, _headers = self.request()
        self.assertEqual(status, 200)
        self.assertEqual(set(state), {"version", "csrf_token", "library_path", "projects", "agent",
                                     "capabilities", "busy_project_ids", "operations"})
        self.assertEqual(state["version"], 2)
        self.assertEqual(state["projects"], [self.project])
        self.assertEqual(state["operations"], {"edit": None, "play": None, "check": None})
        self.assertEqual(state["capabilities"], {"create": True, "edit": True, "play": True, "check": True})
        self.assertEqual(state["busy_project_ids"], [])
        self.assertEqual(state["agent"], {"mode": "workbench_client", "client_url": "",
                                         "connection_state": "unverified", "can_submit": False})
        self.assertEqual(self.action()[:2], (202, {"run_id": "b" * 32, "state": "starting"}))
        self.processes.start.assert_called_once_with("play", "a" * 32, self.library.prepare, self.library.run)

    def test_create_detail_and_brief_exact_shapes(self):
        status, value, _ = self.request("/api/creator/projects", "POST", {"name": "创作工程", "kind": "2d"})
        self.assertEqual((status, value), (201, {"project": self.project}))
        status, detail, _ = self.request("/api/creator/projects/" + "a" * 32)
        self.assertEqual(status, 200)
        self.assertEqual(set(detail), {"project", "files", "files_truncated", "brief"})
        self.library.detail.assert_called_with("a" * 32)
        response = self.request("/api/creator/brief", "POST", {"project_id": "a" * 32, "text": "😀" * 4000})
        self.assertEqual(response[:2], (200, {"project_id": "a" * 32, "saved": True}))
        self.library.save_brief.assert_called_with("a" * 32, "😀" * 4000)

    def test_security_checks_precede_body_and_mutations(self):
        for headers, expected in (({"Host": "localhost:8770"}, "host_rejected"),
                                  ({"Host": [self.server.expected_host] * 2}, "host_rejected"),
                                  ({"Origin": "https://elsewhere.invalid"}, "origin_rejected"),
                                  ({"Origin": []}, "origin_rejected"),
                                  ({"Origin": [self.server.origin] * 2}, "origin_rejected"),
                                  ({"X-Creator-CSRF": "wrong"}, "csrf_rejected"),
                                  ({"X-Creator-CSRF": ["token", "token"]}, "csrf_rejected")):
            with self.subTest(headers=headers):
                status, result, _ = self.request("/api/creator/projects", "POST", b"invalid JSON", headers)
                self.assertEqual((status, result["error"]), (403, expected))
                self.assertEqual(set(result), {"error", "message"})
                self.assertEqual(self.handler.rfile.tell(), 0)
        self.library.create.assert_not_called()
        self.processes.start.assert_not_called()
        self.assertEqual(self.request(headers={"Origin": "null"})[0], 403)
        self.assertEqual(self.request(headers={"Host": "attacker.invalid"})[0], 403)

    def test_body_budget_duplicates_and_json_types(self):
        cases = [(b'{}', {"Content-Length": []}), (b'{}', {"Content-Length": ["2", "2"]}),
                 (b'{}', {"Transfer-Encoding": "chunked"}), (b'{}', {"Content-Type": "text/plain"}),
                 (b'{}', {"Content-Type": ["application/json"] * 2}), (b'{}', {"Content-Length": "8"}),
                 (b" " * 16385, {}), (b"[]", {}), (b'{"action":"play","action":"edit"}', {}),
                 (b'{"action":NaN}', {}), (b'\xff', {})]
        for body, headers in cases:
            with self.subTest(body=body[:30], headers=headers):
                self.assertEqual(self.request("/api/creator/action", "POST", body, headers)[0], 422)
        self.processes.start.assert_not_called()

    def test_extra_fields_old_protocol_and_arbitrary_paths_are_rejected(self):
        for body in ({"action": "play"}, {"action": "play", "project_id": "a" * 32, "path": "../other"},
                     {"action": "play", "project_id": "a" * 32, "argv": []},
                     {"action": "play", "project_id": "a" * 32, "url": "https://example.invalid"}):
            self.assertEqual(self.request("/api/creator/action", "POST", body)[0], 422)
        for action in ("verify", "save_exit", "command", [], True):
            self.assertEqual(self.action(action)[0], 422)
        for project_id in ("../other", "A" * 32, "", [], None):
            self.assertEqual(self.action(project_id=project_id)[0], 422)
        for path, body in (("/api/creator/projects", {"name": "a", "kind": "2d", "path": "outside"}),
                           ("/api/creator/brief", {"project_id": "a" * 32, "text": "", "confirmed": True})):
            self.assertEqual(self.request(path, "POST", body)[0], 422)
        self.processes.start.assert_not_called()

    def test_conflicts_and_scan_failures_are_explicit_not_empty_success(self):
        for reason in ("action_busy", "project_busy", "service_closed"):
            self.processes.start.side_effect = ValueError(reason)
            status, value, _ = self.action()
            self.assertEqual((status, value["error"]), (409, reason))
        self.processes.start.side_effect = ValueError("project_not_found")
        self.assertEqual(self.action()[0], 404)
        self.processes.start.side_effect = OSError("private local command")
        self.assertEqual(self.action()[1]["error"], "operation_failed")
        self.library.projects.side_effect = ValueError("library_scan_failed")
        status, body, _ = self.request()
        self.assertEqual((status, body["error"]), (503, "library_scan_failed"))
        self.assertNotIn("projects", body)
        self.library.detail.side_effect = PermissionError("private path")
        self.assertEqual(self.request("/api/creator/projects/" + "a" * 32)[1]["error"], "project_read_failed")

    def test_only_static_allowlist_and_same_origin_csp(self):
        self.assertEqual(RESOURCES['/ui-theme.js'], ('ui-theme.js', 'text/javascript; charset=utf-8'))
        self.assertNotIn('/ui-dialog.js', RESOURCES)
        self.assertNotIn('/remote-context.js', RESOURCES)
        for path in RESOURCES:
            status, content, headers = self.request(path)
            self.assertEqual(status, 200)
            self.assertEqual(content, b"synthetic resource")
            self.assertEqual(headers["Cache-Control"], "no-store")
            self.assertIn("connect-src 'self'", headers["Content-Security-Policy"])
            self.assertIn("frame-src 'none'", headers["Content-Security-Policy"])
            self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
            self.assertFalse(any(name.startswith("Access-Control-") for name in headers))
        for path in ("/creator.js?x=1", "/ui-theme.js?x=1", "/ui-theme.js/extra", "/%75i-theme.js",
                     "/remote/ui-theme.js", "/ui-dialog.js", "/remote-context.js", "/studio-shell.js",
                     "/api/creator/state?x=1", "/../AGENTS.md", "/%2e%2e/library",
                     "/api/creator/projects/../../../file", "/api/creator/projects/" + "A" * 32,
                     "/api/creator/projects/" + "a" * 32 + "?x=1", "/project.godot", "/library/",
                     "//creator.js", "/creator.html", "/api/creator/files/main.tscn"):
            self.assertEqual(self.request(path)[0], 404)
        self.assertEqual(self.request("/api/creator/action?x=1", "POST", {})[0], 404)
        self.assertEqual(self.request(method="OPTIONS")[0], 405)

    def test_agent_url_is_optional_and_never_invents_a_connection(self):
        for value in ("", "http://127.0.0.1:9999/", "https://example.invalid/client"):
            self.assertEqual(agent_client_url(value), value)
        for value in ("http://user:pass@example.invalid/", "http://example.invalid/?token=secret",
                      "http://example.invalid/#session", " http://example.invalid/", "file:synthetic-project",
                      "http://example.invalid:99999/", "http://example.invalid\\other", None):
            with self.assertRaises(ValueError):
                agent_client_url(value)

    def test_server_binding_and_shutdown_are_mocked_without_kill(self):
        def bind(server, address, handler):
            self.assertEqual(address, ("127.0.0.1", 8770))
            self.assertIs(handler, CreatorHandler)
            server.server_port = 8770
        with patch("http.server.ThreadingHTTPServer.__init__", bind):
            server = CreatorServer(8770, self.library, self.processes)
        self.assertEqual(server.expected_host, "127.0.0.1:8770")
        self.assertEqual(server.agent_client_url, "")
        self.assertTrue(server.csrf_token)
        self.processes.close.return_value = [{"pid": 42, "project_id": "a" * 32, "run_id": "b" * 32, "evidence_path": "synthetic"}]
        with patch("http.server.ThreadingHTTPServer.server_close") as close, patch("builtins.print") as output:
            server.server_close()
        close.assert_called_once()
        self.processes.close.assert_called_once()
        self.assertIn("仍在运行", output.call_args_list[0].args[0])

    def test_cli_bind_failure_has_no_port_fallback_or_old_arguments(self):
        with patch("control_everything.http.creator.GodotLibrary") as library, \
                patch("control_everything.http.creator.CreatorServer", side_effect=OSError("occupied")) as server, \
                patch("sys.stderr", new_callable=io.StringIO) as errors:
            code = main(["--engine", "engine.exe", "--library", "library"])
        self.assertEqual(code, 1)
        self.assertIn("occupied", errors.getvalue())
        server.assert_called_once_with(8770, library.return_value, client_url="")


if __name__ == "__main__":
    unittest.main()
