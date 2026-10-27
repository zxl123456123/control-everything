"""Loopback-only fake-peer HTTP framing and identity boundary tests."""

from concurrent.futures import ThreadPoolExecutor
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import Mock

from control_everything.http.remote_hub import build_server
from control_everything.integrations.remote_hub.identity import HubError, TokenIntrospector
from control_everything.integrations.remote_hub.directory import KeycloakUserDirectory
from .test_remote_hub_support import A, INSTALL, KEY, bind, service


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

    def test_admin_registration_directory_needs_own_session_csrf_and_admin(self):
        self.hub.admin_subjects = frozenset([(A.issuer, A.sub)])
        directory = self.hub.user_directory = Mock(issuer=A.issuer)
        directory.page.return_value = ([{"sub": "registered-only", "name": "Registered member",
                                         "registered_at": 1700000000, "enabled": True}], 1)
        headers = {"X-Auth-Request-Access-Token": "synthetic-access-token", "X-Auth-Request-User": A.sub,
                   "X-CE-Route-Proof": self.hub.route_proof}
        path = "/remote/api/admin/members?limit=25&offset=0"
        self.assertEqual(self.request("GET", path, headers=headers)[0], 401)
        _, session, extra = self.request("GET", "/remote/api/session", headers=headers)
        headers["Cookie"] = extra["Set-Cookie"].split(";", 1)[0]
        self.assertEqual(self.request("GET", path, headers=headers)[0], 403)
        headers["X-CE-CSRF"] = session["csrf"]
        status, page, extra = self.request("GET", path, headers=headers)
        self.assertEqual(status, 200)
        self.assertEqual(page["items"][0]["membership"], "inactive")
        self.assertIsNone(page["items"][0]["device"])
        self.assertEqual(extra["Cache-Control"], "no-store")
        self.assertNotIn("Set-Cookie", extra)
        self.assertEqual(self.request("GET", path, headers={**headers, "Origin": self.hub.public_origin})[0], 200)
        for change in [{"Origin": "https://elsewhere.example.test"}, {"Origin": "null"}, {"X-CE-CSRF": "wrong"}]:
            self.assertEqual(self.request("GET", path, headers={**headers, **change})[0], 403)
        directory.page.reset_mock()
        self.hub.admin_subjects = frozenset()
        self.assertEqual(self.request("GET", path, headers=headers)[0], 403)
        directory.page.assert_not_called()
        self.hub.admin_subjects = frozenset([(A.issuer, A.sub)])
        self.hub.sessions.logout(A, headers["Cookie"].split("=", 1)[1], session["csrf"], self.hub.public_origin)
        self.assertEqual(self.request("GET", path, headers=headers)[0], 401)

    def test_admin_directory_pagination_is_strict_and_get_does_not_relax_post_origin(self):
        self.hub.admin_subjects = frozenset([(A.issuer, A.sub)])
        directory = self.hub.user_directory = Mock(issuer=A.issuer)
        directory.page.return_value = ([], 0)
        headers = {"X-Auth-Request-Access-Token": "synthetic-access-token", "X-Auth-Request-User": A.sub,
                   "X-CE-Route-Proof": self.hub.route_proof}
        _, session, extra = self.request("GET", "/remote/api/session", headers=headers)
        headers.update({"Cookie": extra["Set-Cookie"].split(";", 1)[0], "X-CE-CSRF": session["csrf"]})
        path = "/remote/api/admin/members"
        self.assertEqual(self.request("GET", path, headers=headers)[0], 200)
        directory.page.assert_called_once_with(25, 0)
        directory.page.reset_mock()
        for query in ["limit=0", "limit=101", "offset=-1", "offset=2147483648", "limit=1&limit=2", "other=1", "offset=", "limit=25&offset=0&other=1"]:
            self.assertEqual(self.request("GET", path + "?" + query, headers=headers)[0], 400, query)
        directory.page.assert_not_called()
        self.assertEqual(self.request("GET", "/remote/api/session?limit=25", headers=headers)[0], 400)
        post_headers = {**headers, "Content-Type": "application/json"}
        self.assertEqual(self.request("POST", path, "{}", post_headers)[0], 405)
        self.assertEqual(self.request("POST", "/remote/api/invitations", "{}", post_headers)[0], 403)
        self.hub.user_directory = None
        status, body = self.request("GET", path, headers=headers)[:2]
        self.assertEqual((status, body["source"], body["total"]), (200, "hub_members", 2))

    def test_malformed_idp_unicode_is_a_directory_error_not_a_dropped_connection(self):
        self.hub.admin_subjects = frozenset([(A.issuer, A.sub)])
        directory = self.hub.user_directory = KeycloakUserDirectory(A.issuer, "synthetic", "synthetic-secret")
        headers = {"X-Auth-Request-Access-Token": "synthetic-access-token", "X-Auth-Request-User": A.sub,
                   "X-CE-Route-Proof": self.hub.route_proof}
        _, session, extra = self.request("GET", "/remote/api/session", headers=headers)
        headers.update({"Cookie": extra["Set-Cookie"].split(";", 1)[0], "X-CE-CSRF": session["csrf"]})
        for profile in [{"id": "member", "username": "bad\ud800name"}, {"id": "bad\udc00subject"}]:
            directory._json = Mock(side_effect=[{"access_token": "synthetic"}, 1, [profile]])
            status, body, response_headers = self.request("GET", "/remote/api/admin/members", headers=headers)
            self.assertEqual((status, body), (503, {"error": "member_directory_unavailable"}))
            self.assertEqual(response_headers["Cache-Control"], "no-store")

    def test_cold_authorization_burst_is_queued_then_processed_without_connection_loss(self):
        # Pause accept, not handlers: exercise the real listen backlog under a connection burst.
        server = build_server(("127.0.0.1", 0), self.hub)
        headers = {"X-Auth-Request-Access-Token": "synthetic-access-token", "X-Auth-Request-User": A.sub,
                   "X-CE-Route-Proof": self.hub.route_proof}
        def connect(_):
            connection = http.client.HTTPConnection(*server.server_address, timeout=0.75)
            try:
                connection.request("GET", "/remote/api/session", headers=headers)
                return connection
            except OSError:
                connection.close()
                return None
        with ThreadPoolExecutor(max_workers=32) as pool:
            connections = list(pool.map(connect, range(32)))
        thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        thread.start()
        statuses = []
        try:
            for connection in connections:
                if connection is not None:
                    connection.sock.settimeout(10)
                    response = connection.getresponse()
                    statuses.append(response.status)
                    response.read()
            self.assertEqual(len(statuses), 32, 'cold burst connections must survive the accept pause')
            self.assertEqual(statuses, [200] * 32)
        finally:
            for connection in connections:
                if connection is not None:
                    connection.close()
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def refresh_session_fixture(self):
        now = [1000]
        self.hub.store.clock = lambda: now[0]
        def introspect(token):
            if token == 'synthetic-unavailable-token':
                raise OSError('synthetic introspection failure')
            result = dict(active=True, iss=A.issuer, sub=A.sub, sid='same-sid',
                          aud=['workbench-hub'], azp='workbench-web', exp=1060 if token == 'synthetic-short-token' else 10000)
            if token == 'synthetic-inactive-token': result['active'] = False
            if token == 'synthetic-wrong-aud-token': result['aud'] = ['other']
            if token == 'synthetic-wrong-azp-token': result['azp'] = 'other'
            if token == 'synthetic-wrong-sub-token': result['sub'] = 'other-subject'
            if token == 'synthetic-wrong-issuer-token': result['iss'] = 'https://other.example.test/realms/test'
            if token == 'synthetic-other-sid-token': result['sid'] = 'synthetic-other-sid-token'
            if token == 'synthetic-missing-sid-token': result.pop('sid')
            return result
        self.hub.identities = TokenIntrospector(A.issuer, 'workbench-hub', 'synthetic-secret',
                                                clock=lambda: now[0], transport=introspect)
        device = bind(self.hub)
        self.hub.heartbeat(device['control_token'], INSTALL, True)
        headers = {'X-Auth-Request-Access-Token': 'synthetic-short-token', 'X-Auth-Request-User': A.sub,
                   'X-CE-Route-Proof': self.hub.route_proof}
        status, session, extra = self.request('GET', '/remote/api/session', headers=headers)
        self.assertEqual(status, 200)
        headers['Cookie'] = extra['Set-Cookie'].split(';', 1)[0]
        headers['X-Forwarded-Method'] = 'GET'
        headers['X-Forwarded-Uri'] = '/studio'
        status, _, extra = self.request('GET', '/internal/authorize', headers=headers)
        self.assertEqual(status, 200)
        headers['X-CE-Context'] = extra['X-CE-Page-Context']
        headers['X-Forwarded-Uri'] = '/api/bootstrap'
        return now, device, headers, session

    def test_refreshed_token_preserves_original_context_until_absolute_session_deadline(self):
        now, device, headers, first = self.refresh_session_fixture()
        cookie = headers['Cookie'].split('=', 1)[1]
        original_expiry = self.hub.sessions.validate(self.hub.identities.authenticate('synthetic-short-token', 'browser'), cookie)['expires']
        now[0] = 1061
        self.hub.heartbeat(device['control_token'], INSTALL, True)
        self.assertEqual(self.request('GET', '/internal/authorize', headers=headers)[0], 401)
        headers['X-Auth-Request-Access-Token'] = 'synthetic-refreshed-token'
        self.assertEqual(self.request('GET', '/internal/authorize', headers=headers)[0], 200)
        status, current, extra = self.request('GET', '/remote/api/session', headers=headers)
        self.assertEqual((status, current['csrf'], current['session_changed']), (200, first['csrf'], False))
        self.assertNotIn('Set-Cookie', extra)
        identity = self.hub.identities.authenticate('synthetic-refreshed-token', 'browser')
        self.assertEqual(self.hub.sessions.validate(identity, cookie)['expires'], original_expiry)
        self.assertEqual(original_expiry, 2800)
        now[0] = 2799
        self.hub.heartbeat(device['control_token'], INSTALL, True)
        self.assertEqual(self.request('GET', '/internal/authorize', headers=headers)[0], 200)
        self.assertEqual(self.request('GET', '/remote/api/session', headers=headers)[1]['session_changed'], False)
        now[0] = 2800
        self.hub.heartbeat(device['control_token'], INSTALL, True)
        self.assertEqual(self.request('GET', '/internal/authorize', headers=headers)[0], 401)
        _, created, extra = self.request('GET', '/remote/api/session', headers=headers)
        self.assertTrue(created['session_changed'])
        headers['Cookie'] = extra['Set-Cookie'].split(';', 1)[0]
        self.assertEqual(self.request('GET', '/internal/authorize', headers=headers)[0], 403)

    def test_session_ttl_does_not_bypass_token_identity_sid_or_logout(self):
        now, device, headers, first = self.refresh_session_fixture()
        now[0] = 1061
        self.hub.heartbeat(device['control_token'], INSTALL, True)
        for token, expected in [('synthetic-short-token', 401), ('synthetic-inactive-token', 401), ('synthetic-wrong-aud-token', 403), ('synthetic-wrong-azp-token', 403),
                                ('synthetic-wrong-sub-token', 403), ('synthetic-wrong-issuer-token', 401), ('synthetic-other-sid-token', 401),
                                ('synthetic-missing-sid-token', 401), ('synthetic-unavailable-token', 503)]:
            with self.subTest(token=token):
                request = {**headers, 'X-Auth-Request-Access-Token': token}
                self.assertEqual(self.request('GET', '/internal/authorize', headers=request)[0], expected)
        headers['X-Auth-Request-Access-Token'] = 'synthetic-refreshed-token'
        self.assertEqual(self.request('GET', '/internal/authorize', headers=headers)[0], 200)
        logout = {**headers, 'Origin': self.hub.public_origin, 'X-CE-CSRF': first['csrf'], 'Content-Type': 'application/json'}
        self.assertEqual(self.request('POST', '/remote/api/logout', '{}', logout)[0], 200)
        self.assertEqual(self.request('GET', '/internal/authorize', headers=headers)[0], 401)
        _, created, extra = self.request('GET', '/remote/api/session', headers=headers)
        self.assertTrue(created['session_changed'])
        headers['Cookie'] = extra['Set-Cookie'].split(';', 1)[0]
        self.assertEqual(self.request('GET', '/internal/authorize', headers=headers)[0], 403)

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
