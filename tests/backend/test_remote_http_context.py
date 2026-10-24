"""Pure policy and socket-free HTTP tests for the explicit remote instance."""

from email.message import Message
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from control_everything.http.gateway import PanelHandler

from control_everything.http.gateway import make_server
from control_everything.integrations.remote_access import RemoteAccess, public_origin
from tests.backend import test_workbench_http as fixtures
from tests.backend import test_profile_http as profile_fixtures

SECRET = "A" * 43
ORIGIN = "https://workbench.example.test"


class RemoteAccessTests(unittest.TestCase):
    def test_server_mode_is_explicit_and_keeps_internal_loopback_origin(self):
        remote = RemoteAccess(ORIGIN, SECRET)
        for policy in (None, remote):
            server = SimpleNamespace(server_address=('127.0.0.1', 8773))
            news = Mock()
            with patch('control_everything.http.gateway.PanelServer', return_value=server), \
                 patch('control_everything.http.gateway.NewsSource', return_value=news):
                actual = make_server(None, ('127.0.0.1', 8773), remote_access=policy)
            self.assertEqual(actual.local_origin, 'http://127.0.0.1:8773')
            self.assertEqual(actual.origin, actual.local_origin)
            self.assertEqual(actual.expected_host, '127.0.0.1:8773')
        with self.assertRaises(ValueError):
            make_server(None, ('192.0.2.10', 8773), remote_access=remote)

    def test_only_canonical_https_origin(self):
        for value in (ORIGIN, "https://192.0.2.1", "https://[2001:db8::1]:8443"):
            self.assertEqual(public_origin(value), value)
        for value in (None, "", "http://example.test", ORIGIN + "/", ORIGIN + "?", ORIGIN + "#",
                      ORIGIN + ":443", "HTTPS://workbench.example.test", "https://EXAMPLE.test",
                      "https://u:p@example.test", "https://example.test:0", "https://example.test:65536",
                      "https://example.test/other", "https://example.test\n", "https://example..test",
                      "https://127.1", "https://0177.0.0.1", "https://0x7f000001", "https://例子.test",
                      "https://[fe80::1%25en0]"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                public_origin(value)

    def test_secret_is_required_canonical_and_not_printable(self):
        remote = RemoteAccess(ORIGIN, SECRET)
        self.assertNotIn(SECRET, repr(remote))
        self.assertEqual(remote.websocket_endpoint, "wss://workbench.example.test/workbench-runtime")
        for secret in (None, "", "short", "a" * 42, "!" * 43, "A" * 42 + "B", "A" * 44 + "="):
            with self.subTest(secret=secret), self.assertRaises(ValueError):
                RemoteAccess(ORIGIN, secret)

    def test_proxy_proof_does_not_trust_forwarded_headers(self):
        remote = RemoteAccess(ORIGIN, SECRET)
        headers = Message()
        headers["Host"], headers["X-CE-Device-Proof"] = remote.authority, SECRET
        self.assertTrue(remote.accept_proxy_request(headers))
        headers["Forwarded"] = 'host=localhost;proto=http'
        headers["X-Forwarded-Host"] = 'localhost'
        self.assertTrue(remote.accept_proxy_request(headers))
        for name, value in (("Host", remote.authority), ("X-CE-Device-Proof", SECRET),
                            ("Origin", "null"), ("Origin", ""), ("Origin", ORIGIN + ", " + ORIGIN)):
            copy = Message()
            copy["Host"], copy["X-CE-Device-Proof"] = remote.authority, SECRET
            copy[name] = value
            self.assertFalse(remote.accept_proxy_request(copy))


class RemoteHTTPTests(unittest.TestCase):
    setUp = fixtures.WorkbenchHTTPTests.setUp

    def request(self, path, method="GET", body=None, headers=None):
        self.server.remote_access = RemoteAccess(ORIGIN, SECRET)
        self.server.expected_host = self.server.remote_access.authority
        self.server.origin = ORIGIN
        return fixtures.WorkbenchHTTPTests.request(self, path, method, body,
                                          {"X-CE-Device-Proof": SECRET, "X-CE-Page-Context": "C" * 32, "X-CE-Storage-Scope": "a" * 64, **(headers or {})})

    def test_every_route_rejects_missing_proof_and_localhost_forgery(self):
        self.server.source = {"private": "sensitive-source-metadata"}
        for route in ("/studio", "/health", "/api/bootstrap", "/api/agent/status",
                      "/workbench/assets/main.js", "/api/workspace"):
            for headers in ({"X-CE-Device-Proof": []}, {"Host": "127.0.0.1:1234"},
                            {"X-CE-Device-Proof": "B" * 43}, {"Host": ["workbench.example.test"] * 2},
                            {"X-CE-Device-Proof": [SECRET] * 2}, {"X-Session-Client": "stdio"},
                            {"Origin": "http://127.0.0.1:1234"}, {"Origin": "null"}):
                with self.subTest(route=route, headers=headers):
                    self.assertEqual(self.request(route, headers=headers)[0], 403)
                    self.assertNotIn('sensitive-source-metadata', str(self.last_handler.reply.call_args))
        self.runtime.bootstrap.assert_not_called()

    def test_agent_early_routes_rejected_even_with_valid_proof(self):
        for route in ("/api/agent/status", "/api/workspace/agents/heartbeat"):
            self.assertEqual(self.request(route)[1]["reason"], "remote_agent_route_rejected")
            self.assertEqual(self.request(route, "POST", {})[1]["reason"], "remote_agent_route_rejected")

    def test_original_csrf_and_public_origin_are_required_for_writes(self):
        body = {"project_id": self.project["id"]}
        for headers in ({"Origin": []}, {"Origin": ""}, {"Origin": [ORIGIN] * 2},
                        {"X-Session-CSRF": []}, {"X-Session-CSRF": "wrong"},
                        {"X-Session-Client": "stdio"}, {"X-CE-Device-Proof": []}):
            self.assertEqual(self.request("/api/workbench/bootstrap", "POST", body, headers)[0], 403)
        self.runtime.bootstrap.assert_not_called()
        self.assertEqual(self.request("/api/workbench/bootstrap", "POST", body)[0], 200)
        self.assertEqual(self.request("/api/bootstrap")[0], 200)

    def test_authorized_remote_business_write_uses_existing_store(self):
        body = {"text": "Remote fixture todo", "project_id": self.project["id"]}
        self.assertEqual(self.request('/api/todos', 'POST', body, {"X-Session-CSRF": 'wrong'})[0], 403)
        self.assertEqual(self.request('/api/workspace/todos')[1]['items'], [])
        status, response = self.request('/api/todos', 'POST', body)
        self.assertEqual(status, 200)
        item = response['todos'][0]
        self.assertEqual(item['text'], body['text'])
        self.assertEqual(self.request('/api/workspace/todos')[1]['items'][0]['id'], item['id'])

    def test_options_and_unknown_verbs_cannot_skip_remote_gate(self):
        self.assertEqual(self.request("/studio", "OPTIONS", headers={"X-CE-Device-Proof": []})[0], 403)
        handler = self.last_handler
        with patch('http.server.BaseHTTPRequestHandler.parse_request', return_value=True):
            for method in ("HEAD", "PUT", "DELETE", "TRACE", "CUSTOM"):
                handler.command = method
                handler.reply.reset_mock()
                self.assertFalse(handler.parse_request())
                self.assertEqual(handler.reply.call_args.args[0], 403)

    def test_public_bootstrap_is_a_copy_and_csp_contains_only_public_wss(self):
        original = self.runtime.bootstrap.return_value
        original["runtime"]["offer"].update(endpoint="ws://127.0.0.1:23456", deviceToken="fixture-token",
                                              pairedDeviceId="fixture-device", scope="runtime")
        status, response = self.request("/api/workbench/bootstrap", "POST", {"project_id": self.project["id"]})
        self.assertEqual(status, 200)
        offer = response["runtime"]["offer"]
        self.assertEqual(offer["endpoint"], "wss://workbench.example.test/workbench-runtime")
        self.assertEqual(offer["deviceToken"], "fixture-token")
        self.assertEqual(original["runtime"]["offer"]["endpoint"], "ws://127.0.0.1:23456")
        self.assertNotIn(SECRET, str(response))
        for route in ("/studio",):
            self.assertEqual(self.request(route)[0], 200)
            csp = self.last_handler.reply.call_args.kwargs["csp"]
            self.assertIn("connect-src 'self' wss://workbench.example.test;", csp)
            self.assertNotIn("127.0.0.1", csp)

    def test_remote_browser_cannot_invoke_owner_revoke(self):
        self.assertEqual(self.request("/api/workbench/revoke", "POST", {"device_id":"device-A"})[0], 404)
        self.runtime.revoke_device.assert_not_called()

    def test_metadata_required_even_for_initial_bootstrap_and_shell(self):
        for path in ("/studio", "/studio-shell", "/api/bootstrap", "/api/workspace"):
            for headers in ({"X-CE-Page-Context": []}, {"X-CE-Storage-Scope": []},
                            {"X-CE-Page-Context": "bad"}, {"X-CE-Storage-Scope": "z"*64}):
                self.assertEqual(self.request(path, headers=headers)[0], 403)
        self.runtime.bootstrap.assert_not_called()

    def test_remote_historical_and_local_management_paths_fail_closed(self):
        for path in ("/desktop", "/workbench/web-index.html?project_id="+self.project["id"], "/api/desktop/remote/status"):
            self.assertEqual(self.request(path)[0],403)

    def test_gateway_mounts_dual_channel_http_health_before_context_gate(self):
        access = RemoteAccess(ORIGIN, SECRET)
        self.server.remote_connector = SimpleNamespace(remote_access=access, health_identity={
            "device_id":"device-A", "generation":3, "platform_installation_id":"install-A"})
        nonce = 'N' * 32
        status, value = self.request('/__ce_remote_health?nonce=' + nonce, headers={"Origin":ORIGIN})
        self.assertEqual(status, 200)
        self.assertEqual(value, {"nonce":nonce, "device_id":"device-A", "generation":3,
                                 "platform_installation_id":"install-A", "channel":"http", "ready":True})
        for headers in ({"Origin":[]}, {"Origin":"null"}, {"X-CE-Device-Proof":[]}):
            self.assertEqual(self.request('/__ce_remote_health?nonce=' + nonce, headers=headers)[0],403)
        self.runtime.ready = False
        self.assertEqual(self.request('/__ce_remote_health?nonce=' + nonce, headers={"Origin":ORIGIN})[0],503)

    def test_exact_static_asset_needs_proof_but_no_page_context(self):
        self.assertEqual(self.request('/workbench/assets/main.js', headers={
            "X-CE-Page-Context":[], "X-CE-Storage-Scope":[]})[0],200)
        self.assertEqual(self.request('/workbench/assets/unlisted.png', headers={
            "X-CE-Page-Context":[], "X-CE-Storage-Scope":[]})[0],403)


class LocalDesktopHTTPTests(unittest.TestCase):
    request = fixtures.WorkbenchHTTPTests.request

    def setUp(self):
        profile_fixtures.ProfileHTTPTests.setUp(self)
        peer = patch.object(PanelHandler, 'client_address', ('127.0.0.1', 12345), create=True)
        peer.start()
        self.addCleanup(peer.stop)
        self.server.local_origin = self.server.origin
        self.connector = Mock()
        self.connector.status.return_value = {"state":"unbound", "configured":True}
        self.server.remote_connector = self.connector

    def test_status_is_readonly_and_needs_no_registered_project(self):
        self.assertEqual(self.workspace.registered_projects(), [])
        self.assertEqual(self.request('/api/desktop/remote/status')[0],200)
        self.connector.status.assert_called_once_with()
        self.connector.begin_authorization.assert_not_called()
        self.connector.connect.assert_not_called()
        self.assertEqual(self.request('/api/desktop/remote/status?unknown=1')[0],400)

    def test_local_confirmation_requires_empty_body_origin_and_csrf(self):
        for body in ({"owner":"other"}, []):
            self.assertEqual(self.request('/api/desktop/remote/confirm','POST',body)[0],400)
        self.assertEqual(self.request('/api/desktop/remote/confirm','POST',{}, {"Origin":[]})[0],403)
        self.connector.confirm.assert_not_called()
        self.assertEqual(self.request('/api/desktop/remote/confirm','POST',{})[0],200)
        self.connector.confirm.assert_called_once_with()
