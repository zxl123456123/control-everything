"""Exercise the root-run protocol harness against loopback fake HTTP peers only."""

from contextlib import redirect_stdout
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import http.client
import io
import json
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from tests.e2e import remote_device_acceptance as harness


class AcceptanceHarnessTests(unittest.TestCase):
    def setUp(self):
        self.options, self.posts = {}, []
        self.states = {"a": "online", "b": "online"}
        case = self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def serve(self):
                cookie = SimpleCookie(self.headers.get("Cookie", ""))
                owner = cookie["oauth"].value if "oauth" in cookie else None
                valid = owner in ("a", "b") and (cookie.get("__Host-ce_remote") is not None
                        and (cookie["__Host-ce_remote"].value == "current-" + owner or case.options.get("accept_stale")))
                if not valid and case.options.get("trust_forged_identity") and self.headers.get("X-Auth-Request-User"):
                    owner, valid = "b", True
                if self.path.startswith(("/__ce_remote_health", "/internal/authorize")):
                    return self.reply(200 if case.options.get("expose_internal") else 404, {})
                if not valid:
                    return self.reply(401, {})
                if self.path == "/remote/api/session":
                    device = None if case.states[owner] == "revoked" else {
                        "device_id": ("b" if case.options.get("wrong_device") else owner) * 24,
                        "generation": 1, "state": case.states[owner]}
                    return self.reply(200, {"account": {"sub": "subject-" + owner}, "device": device,
                                            "membership": "active", "csrf": "hub-csrf-" + owner})
                if self.path == "/studio":
                    if case.states[owner] != "online" and not case.options.get("offline_fallback"):
                        return self.reply(503, {})
                    return self.reply(200, '<head><meta name="ce-remote-context" content="' + owner.upper() * 32 + '"></head>')
                if self.path == "/api/bootstrap":
                    if self.headers.get("X-CE-Context") != owner.upper() * 32 and not case.options.get("accept_cross_context"):
                        return self.reply(403, {})
                    if case.states[owner] != "online":
                        return self.reply(503, {})
                    routed = "a" if (case.options.get("wrong_route") or (
                        case.options.get("trust_forged_route") and self.headers.get("X-CE-Upstream"))) else owner
                    return self.reply(200, {"csrf_token": "local-csrf-" + routed})
                if self.command == "POST" and self.path == "/remote/api/devices/" + "a" * 24 + "/revoke":
                    if owner != "a" or self.headers.get("X-CE-CSRF") != "hub-csrf-a":
                        return self.reply(403, {})
                    case.posts.append(self.path)
                    case.states["a"] = "revoking" if case.options.get("delayed_cleanup") else "revoked"
                    return self.reply(200, {"state": case.states["a"]})
                return self.reply(404, {})

            def reply(self, status, value):
                raw = value.encode() if isinstance(value, str) else json.dumps(value).encode()
                self.send_response(status)
                self.send_header("Content-Length", str(len(raw)))
                if case.options.get("leak_header") and self.path == "/api/bootstrap":
                    self.send_header("X-CE-Device-Proof", "SYNTHETIC-SECRET-MUST-NOT-LOG")
                self.end_headers()
                self.wfile.write(raw)
            do_GET = do_POST = serve
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)
        # Only this test replaces TLS transport; the real CLI always verifies HTTPS certificates.
        self.connection_patch = patch.object(harness.http.client, "HTTPSConnection", http.client.HTTPConnection)
        self.connection_patch.start()
        self.addCleanup(self.connection_patch.stop)
        self.config = {"origin": "https://127.0.0.1:" + str(self.server.server_port),
                       "old_cookie_a": "__Host-ce_remote=old-a", "temporary_a_device_id": "a" * 24}
        for owner in ("a", "b"):
            self.config[owner] = {"cookie": f"oauth={owner}; __Host-ce_remote=current-{owner}", "sub": "subject-" + owner,
                                  "device_id": owner * 24, "generation": 1, "bootstrap_csrf": "local-csrf-" + owner}

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def run_harness(self, **options):
        report = {"checks": []}
        harness.run(self.config, report, **options)
        return report

    def test_default_checks_pass_without_any_post(self):
        report = self.run_harness()
        self.assertEqual(report["result"], "http_checks_passed")
        self.assertEqual(self.posts, [])

    def test_missing_old_cookie_is_reported_not_run(self):
        del self.config["old_cookie_a"]
        report = self.run_harness()
        self.assertEqual(report["result"], "http_checks_passed_with_not_run")
        self.assertIn({"case": "invalidated_a_cookie_rejected", "status": "not_run"}, report["checks"])

    def test_explicit_offline_phase_does_not_fall_back_to_b(self):
        self.states["a"] = "offline"
        self.config["context_a"] = "A" * 32
        self.assertEqual(self.run_harness(offline=True)["result"], "http_checks_passed")
        self.assertEqual(self.states["b"], "online")

    def test_only_explicit_matching_temporary_a_can_be_revoked(self):
        for target in ("b" * 24, "unmatched"):
            with self.subTest(target=target), self.assertRaises(harness.AcceptanceFailure):
                self.run_harness(revoke=target)
        self.assertEqual(self.posts, [])
        report = self.run_harness(revoke="a" * 24)
        self.assertEqual(len(self.posts), 1)
        self.assertEqual(self.states, {"a": "revoked", "b": "online"})
        self.assertLessEqual(report["directory_revocation_elapsed_seconds"], 5)

    def test_missing_private_temporary_designation_prevents_revoke(self):
        del self.config["temporary_a_device_id"]
        with self.assertRaises(harness.AcceptanceFailure):
            self.run_harness(revoke="a" * 24)
        self.assertEqual(self.posts, [])

    def test_directory_cleanup_over_budget_is_not_reported_as_pass(self):
        self.options = {"delayed_cleanup": True}
        times = iter((0, 6, 6))
        clock = SimpleNamespace(monotonic=lambda: next(times, 6), sleep=lambda delay: None)
        with patch.object(harness, "time", clock), self.assertRaises(harness.AcceptanceFailure) as caught:
            self.run_harness(revoke="a" * 24)
        self.assertEqual(str(caught.exception), "directory_cleanup_within_5_seconds")
        self.assertEqual(self.states["b"], "online")

    def test_cross_account_stale_cookie_public_internal_and_wrong_routes_fail(self):
        for defect in ("accept_cross_context", "accept_stale", "expose_internal", "wrong_route", "wrong_device",
                       "leak_header", "trust_forged_identity", "trust_forged_route"):
            with self.subTest(defect=defect):
                self.options = {defect: True}
                with self.assertRaises(harness.AcceptanceFailure):
                    self.run_harness()
        self.assertEqual(self.posts, [])

    def test_offline_fallback_is_rejected(self):
        self.states["a"], self.options = "offline", {"offline_fallback": True}
        with self.assertRaises(harness.AcceptanceFailure):
            self.run_harness(offline=True)

    def test_cli_reports_no_cookies_csrf_or_response_secrets(self):
        self.options = {"leak_header": True}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "private.json"
            path.write_text(json.dumps(self.config), encoding="utf-8")
            path.chmod(0o600)
            output = io.StringIO()
            with redirect_stdout(output):
                result = harness.main(["--input-private", str(path)])
        self.assertEqual(result, 1)
        rendered = output.getvalue()
        self.assertEqual(json.loads(rendered)["failure"], "public_internal_header_leak")
        for secret in ("current-a", "current-b", "local-csrf-a", "local-csrf-b", "SYNTHETIC-SECRET-MUST-NOT-LOG", "subject-a"):
            self.assertNotIn(secret, rendered)
