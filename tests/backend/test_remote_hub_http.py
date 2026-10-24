"""Loopback-only fake-peer HTTP framing and identity boundary tests."""

import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest

from control_everything.http.remote_hub import build_server
from control_everything.integrations.remote_hub.identity import HubError
from .test_remote_hub_support import A, INSTALL, KEY, service


class FakeIdentities:
    def authenticate(self, token, kind, trusted_sub=None):
        if token != "synthetic-access-token" or (trusted_sub is not None and trusted_sub != A.sub):
            raise HubError("invalid_identity", 401)
        return A


class RemoteHubHTTPTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.hub = service(Path(temporary.name) / "hub.db")
        self.hub.identities = FakeIdentities()
        self.server = build_server(("127.0.0.1", 0), self.hub)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=2)
        self.addCleanup(connection.close)
        connection.request(method, path, body, headers or {})
        response = connection.getresponse()
        return response.status, json.loads(response.read()), dict(response.getheaders())

    def test_desktop_challenge_and_invalid_fields_have_no_secrets(self):
        body = {"installation_id": INSTALL, "public_key": KEY, "name": "Computer"}
        headers = {"Authorization": "Bearer synthetic-access-token", "Content-Type": "application/json"}
        status, result, response_headers = self.request("POST", "/remote/desktop/enrollment", json.dumps(body), headers)
        self.assertEqual(status, 200)
        self.assertEqual(set(result), {"challenge_id", "payload", "expires_at"})
        self.assertEqual(response_headers["Cache-Control"], "no-store")
        body["owner"] = "forged"
        status, result, _ = self.request("POST", "/remote/desktop/enrollment", json.dumps(body), headers)
        self.assertEqual((status, result["error"]), (400, "invalid_request_fields"))

    def test_browser_session_sets_private_cookie_but_forged_chain_is_rejected(self):
        headers = {"X-Auth-Request-Access-Token": "synthetic-access-token", "X-Auth-Request-User": A.sub,
                   "X-CE-Route-Proof": self.hub.route_proof}
        status, result, response_headers = self.request("GET", "/remote/api/session", headers=headers)
        self.assertEqual(status, 200)
        self.assertIn("Secure; HttpOnly; SameSite=Lax", response_headers["Set-Cookie"])
        self.assertIn("csrf", result)
        headers["X-CE-Route-Proof"] = "forged"
        self.assertEqual(self.request("GET", "/remote/api/session", headers=headers)[0], 403)

    def test_oversize_content_and_duplicate_security_headers_are_rejected(self):
        status, result, _ = self.request("POST", "/remote/desktop/enrollment", b"",
                                        {"Content-Length": "16385", "Content-Type": "application/json"})
        self.assertEqual((status, result["error"]), (413, "request_too_large"))
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=2)
        self.addCleanup(connection.close)
        connection.putrequest("GET", "/remote/desktop/config")
        connection.putheader("Authorization", "Bearer synthetic-access-token")
        connection.putheader("Authorization", "Bearer forged")
        connection.endheaders()
        response = connection.getresponse()
        self.assertEqual(response.status, 400)
        self.assertEqual(json.loads(response.read())["error"], "ambiguous_security_header")

    def test_only_exact_documents_without_context_return_to_account_entry(self):
        headers = {"X-Auth-Request-Access-Token": "synthetic-access-token", "X-Auth-Request-User": A.sub,
                   "X-CE-Route-Proof": self.hub.route_proof, "X-Forwarded-Method": "GET"}
        for cookie in (None, "__Host-ce_remote=expired-synthetic-cookie"):
            for path in sorted(self.hub.document_paths):
                with self.subTest(path=path, cookie=bool(cookie)):
                    request = {**headers, "X-Forwarded-Uri": path}
                    if cookie:
                        request["Cookie"] = cookie
                    status, _, extra = self.request("GET", "/internal/authorize", headers=request)
                    self.assertEqual((status, extra.get("Location")), (303, "/remote"))
        for path, context, method in (("/api/bootstrap", None, "GET"), ("/studio-shell", None, "GET"),
                                      ("/studio", "A" * 32, "GET"), ("/studio", "", "GET"),
                                      ("/workbench-runtime?orca-client=web&ce_context=" + "A" * 32, None, "GET"),
                                      ("/studio?unknown=1", None, "GET"), ("/studio", None, "POST")):
            with self.subTest(path=path, context=context, method=method):
                request = {**headers, "X-Forwarded-Uri": path, "X-Forwarded-Method": method}
                if context is not None:
                    request["X-CE-Context"] = context
                status, _, extra = self.request("GET", "/internal/authorize", headers=request)
                self.assertEqual(status, 401)
                self.assertNotIn("Location", extra)

    def test_expired_and_logged_out_document_session_redirects_but_fragment_stays_denied(self):
        headers = {"X-Auth-Request-Access-Token": "synthetic-access-token", "X-Auth-Request-User": A.sub,
                   "X-CE-Route-Proof": self.hub.route_proof, "X-Forwarded-Method": "HEAD",
                   "X-Forwarded-Uri": "/studio"}
        session, cookie = self.hub.session(A, "")
        cookie_header = cookie.split(";", 1)[0]
        self.hub.sessions.logout(A, cookie_header.split("=", 1)[1], session["csrf"], self.hub.public_origin)
        headers["Cookie"] = cookie_header
        self.assertEqual(self.request("GET", "/internal/authorize", headers=headers)[0], 303)
        _, cookie = self.hub.session(A, "")
        headers["Cookie"] = cookie.split(";", 1)[0]
        self.hub.store.clock = lambda: 10001
        self.assertEqual(self.request("GET", "/internal/authorize", headers=headers)[0], 303)
        headers["X-CE-Context"] = "A" * 32
        self.assertEqual(self.request("GET", "/internal/authorize", headers=headers)[0], 401)

    def test_session_redirect_requires_raw_document_uri_and_absent_upgrade(self):
        headers = {"X-Auth-Request-Access-Token": "synthetic-access-token", "X-Auth-Request-User": A.sub,
                   "X-CE-Route-Proof": self.hub.route_proof}
        for method in ("GET", "HEAD"):
            for origin in (None, self.hub.public_origin):
                request = {**headers, "X-Forwarded-Method": method, "X-Forwarded-Uri": "/studio"}
                if origin is not None:
                    request["Origin"] = origin
                with self.subTest(method=method, origin=origin):
                    status, _, extra = self.request("GET", "/internal/authorize", headers=request)
                    self.assertEqual((status, extra.get("Location")), (303, "/remote"))
        cases = [("/studio?", {}), ("/studio?x=1", {}), ("/studio#", {}),
                 ("/studio", {"Upgrade": "websocket", "Connection": "Upgrade"}),
                 ("/studio", {"Upgrade": ""}), ("/studio", {"Origin": ""}),
                 ("/studio", {"Origin": "https://foreign.example.test"}),
                 ("/studio", {"X-CE-Context": ""}), ("/studio/", {}),
                 ("https://workbench.example.test/studio", {})]
        for uri, extra_headers in cases:
            with self.subTest(uri=uri, extra_headers=extra_headers):
                request = {**headers, "X-Forwarded-Method": "GET", "X-Forwarded-Uri": uri, **extra_headers}
                status, _, extra = self.request("GET", "/internal/authorize", headers=request)
                self.assertEqual(status, 401)
                self.assertNotIn("Location", extra)
