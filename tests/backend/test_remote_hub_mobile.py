"""Bearer-only mobile surface: service rules and loopback HTTP contract with a fake identity peer."""

import dataclasses
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest

from control_everything.http.remote_hub import build_server
from control_everything.integrations.remote_hub.identity import HubError, Identity
from .test_remote_hub_support import A, B, INSTALL, KEY, bind, service

MOBILE_A = dataclasses.replace(A, azp="workbench-mobile", name="ada", display_name="Ada L", email="ada@example.test")
MOBILE_B = dataclasses.replace(B, azp="workbench-mobile", name="bob")
TOKENS = {"synthetic-mobile-token-a": MOBILE_A, "synthetic-mobile-token-b": MOBILE_B}


class FakeIdentities:
    """Records the requested kind so tests prove the mobile route never uses browser/desktop trust."""

    def __init__(self):
        self.kinds = []

    def authenticate(self, token, kind, trusted_sub=None):
        self.kinds.append(kind)
        if kind != "mobile" or token not in TOKENS:
            raise HubError("invalid_identity", 401)
        return TOKENS[token]


class MobileServiceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.hub = service(Path(temporary.name) / "hub.db")

    def test_me_reports_membership_and_token_claims(self):
        me = self.hub.mobile_me(MOBILE_A)
        self.assertEqual(me, {"account": {"sub": "account-a", "name": "ada", "display_name": "Ada L", "email": "ada@example.test"},
                              "membership": "active", "admin": False})
        stranger = dataclasses.replace(MOBILE_A, sub="stranger", display_name="", email="")
        me = self.hub.mobile_me(stranger)
        self.assertEqual((me["membership"], me["account"]["email"], me["account"]["display_name"]), ("inactive", None, None))
        self.hub.store.set_member(MOBILE_B, "disabled")
        self.assertEqual(self.hub.mobile_me(MOBILE_B)["membership"], "disabled")
        self.hub.admin_subjects = frozenset([(A.issuer, A.sub)])
        self.assertTrue(self.hub.mobile_me(MOBILE_A)["admin"])

    def test_devices_lists_only_own_with_effective_state_and_metadata(self):
        self.assertEqual(self.hub.mobile_devices(MOBILE_A), {"items": []})
        bound = bind(self.hub)
        self.hub.heartbeat(bound["control_token"], INSTALL, True, os_name="Windows", os_version="11 23H2", app_version="0.4.2")
        item = self.hub.mobile_devices(MOBILE_A)["items"][0]
        self.assertEqual(item, {"device_id": bound["device_id"], "name": "Synthetic computer", "state": "online",
                                "last_seen": 1000, "created_at": 1000, "os_name": "Windows", "os_version": "11 23H2",
                                "app_version": "0.4.2", "cleanup_failed": False})
        self.assertEqual(self.hub.mobile_devices(MOBILE_B), {"items": []})
        # A heartbeat older than the 45 second window must not read as online.
        self.hub.store.clock = lambda: 1046
        self.assertEqual(self.hub.mobile_devices(MOBILE_A)["items"][0]["state"], "offline")

    def test_heartbeat_metadata_is_optional_validated_and_not_erased(self):
        bound = bind(self.hub)
        self.hub.heartbeat(bound["control_token"], INSTALL, True, os_name="Linux", os_version="6.8")
        self.hub.heartbeat(bound["control_token"], INSTALL, True)
        item = self.hub.mobile_devices(MOBILE_A)["items"][0]
        self.assertEqual((item["os_name"], item["os_version"], item["app_version"]), ("Linux", "6.8", None))
        for value in ("bad\nvalue", "", "x" * 65, 7):
            with self.subTest(value=value), self.assertRaises(HubError) as caught:
                self.hub.heartbeat(bound["control_token"], INSTALL, True, os_name=value)
            self.assertEqual(caught.exception.code, "invalid_device_info")

    def test_activate_reuses_invite_rules_and_never_reactivates_disabled(self):
        stranger = dataclasses.replace(MOBILE_A, sub="stranger")
        with self.assertRaises(HubError) as caught:
            self.hub.mobile_activate(stranger, "x" * 20)
        self.assertEqual(caught.exception.code, "invalid_invitation")
        invite = self.hub.store.create_invitation()
        self.assertEqual(self.hub.mobile_activate(stranger, invite)["membership"], "active")
        with self.assertRaises(HubError):
            self.hub.mobile_activate(MOBILE_B, invite)  # consumed
        self.hub.store.set_member(MOBILE_B, "disabled")
        with self.assertRaises(HubError) as caught:
            self.hub.mobile_activate(MOBILE_B, self.hub.store.create_invitation())
        self.assertEqual(caught.exception.code, "member_disabled")
        self.assertEqual(self.hub.mobile_me(MOBILE_B)["membership"], "disabled")

    def test_revoke_is_owner_only_and_rate_limited(self):
        bound = bind(self.hub)
        with self.assertRaises(HubError) as caught:
            self.hub.mobile_revoke(MOBILE_B, bound["device_id"])
        self.assertEqual((caught.exception.code, caught.exception.status), ("device_not_found", 404))
        self.assertEqual(self.hub.mobile_revoke(MOBILE_A, bound["device_id"])["state"], "revoked")
        self.assertEqual(self.hub.mobile_devices(MOBILE_A)["items"][0]["state"], "revoked")
        for _ in range(9):
            self.hub.mobile_revoke(MOBILE_A, bound["device_id"])
        with self.assertRaises(HubError) as caught:
            self.hub.mobile_revoke(MOBILE_A, bound["device_id"])
        self.assertEqual(caught.exception.status, 429)

    def test_logout_invalidates_every_session_of_that_member_only(self):
        for identity in (A, A, B):
            self.hub.sessions.open(dataclasses.replace(identity, sid=str(id(object()))), "")
        result = self.hub.mobile_logout(MOBILE_A)
        self.assertEqual(result, {"logged_out": True, "sessions_invalidated": 2})
        self.assertEqual(self.hub.mobile_logout(MOBILE_A)["sessions_invalidated"], 0)
        with self.hub.store.transaction() as db:
            live = [row[0] for row in db.execute(
                "SELECT i.sub FROM browser_sessions s JOIN identities i ON i.account_id=s.account_id WHERE s.invalidated=0")]
        self.assertEqual(live, ["account-b"])

    def test_disabling_a_member_invalidates_their_browser_sessions(self):
        csrf, cookie = self.hub.sessions.open(A, "")
        token = cookie.split(";", 1)[0].split("=", 1)[1]
        self.hub.sessions.validate(A, token)
        self.hub.store.set_member(A, "disabled")
        with self.assertRaises(HubError) as caught:
            self.hub.sessions.validate(A, token)
        self.assertEqual(caught.exception.code, "session_required")


class MobileHTTPTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.hub = service(Path(temporary.name) / "hub.db")
        self.hub.identities = self.identities = FakeIdentities()
        self.server = build_server(("127.0.0.1", 0), self.hub)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def call(self, method, path, body=None, token="synthetic-mobile-token-a", headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=2)
        self.addCleanup(connection.close)
        sent = dict(headers or {})
        if token:
            sent["Authorization"] = "Bearer " + token
        if method == "POST":
            sent["Content-Type"] = "application/json"
            body = json.dumps({} if body is None else body)
        connection.request(method, path, body, sent)
        response = connection.getresponse()
        return response.status, json.loads(response.read()), dict(response.getheaders())

    def test_every_route_requires_a_valid_mobile_bearer_and_uses_the_mobile_kind(self):
        routes = [("GET", "/remote/mobile/me"), ("GET", "/remote/mobile/devices"), ("POST", "/remote/mobile/activate"),
                  ("POST", "/remote/mobile/logout"), ("POST", "/remote/mobile/devices/" + "0" * 24 + "/revoke")]
        for method, path in routes:
            with self.subTest(route=path):
                self.assertEqual(self.call(method, path, token=None)[1]["error"], "bearer_required")
                status, result, _ = self.call(method, path, token="synthetic-mobile-token-zz")
                self.assertEqual((status, result["error"]), (401, "invalid_identity"))
        self.assertTrue(self.identities.kinds and set(self.identities.kinds) == {"mobile"})

    def test_cookies_and_proxy_headers_cannot_substitute_for_the_bearer(self):
        forged = {"Cookie": "__Host-ce_remote=abc", "X-Auth-Request-User": A.sub,
                  "X-Auth-Request-Access-Token": "synthetic-mobile-token-a", "X-CE-Route-Proof": self.hub.route_proof}
        status, result, _ = self.call("GET", "/remote/mobile/me", token=None, headers=forged)
        self.assertEqual((status, result["error"]), (401, "bearer_required"))

    def test_me_and_devices_json_contract_without_cookies_or_cors(self):
        bound = bind(self.hub)
        status, me, headers = self.call("GET", "/remote/mobile/me")
        self.assertEqual((status, me["membership"], me["account"]["email"]), (200, "active", "ada@example.test"))
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertNotIn("Set-Cookie", headers)
        self.assertFalse([name for name in headers if name.lower().startswith("access-control-")])
        status, devices, _ = self.call("GET", "/remote/mobile/devices")
        self.assertEqual((status, [d["device_id"] for d in devices["items"]]), (200, [bound["device_id"]]))
        self.assertEqual(set(devices["items"][0]), {"device_id", "name", "state", "last_seen", "created_at", "os_name",
                                                    "os_version", "app_version", "cleanup_failed"})
        self.assertEqual(self.call("GET", "/remote/mobile/devices", token="synthetic-mobile-token-b")[1], {"items": []})

    def test_preflight_is_not_answered_and_methods_and_fields_are_strict(self):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=2)
        self.addCleanup(connection.close)
        connection.request("OPTIONS", "/remote/mobile/me", headers={"Origin": "https://evil.test",
                                                                    "Access-Control-Request-Method": "GET"})
        response = connection.getresponse(); response.read()
        self.assertNotEqual(response.status, 200)
        self.assertIsNone(response.getheader("Access-Control-Allow-Origin"))
        self.assertEqual(self.call("POST", "/remote/mobile/me")[1]["error"], "method_not_allowed")
        self.assertEqual(self.call("GET", "/remote/mobile/activate")[1]["error"], "method_not_allowed")
        self.assertEqual(self.call("GET", "/remote/mobile/nope")[0], 404)
        self.assertEqual(self.call("POST", "/remote/mobile/activate", {"invite": "x" * 20, "extra": 1})[1]["error"], "invalid_request_fields")
        self.assertEqual(self.call("POST", "/remote/mobile/logout", {"x": 1})[1]["error"], "invalid_request_fields")
        self.assertEqual(self.call("GET", "/remote/mobile/me?x=1")[1]["error"], "invalid_request_uri")
        self.assertEqual(self.call("POST", "/remote/mobile/devices/ZZ/revoke")[0], 404)

    def test_activate_then_me_and_error_shape_matches_existing_endpoints(self):
        status, result, _ = self.call("POST", "/remote/mobile/activate", {"invite": "short"})
        self.assertEqual((status, result), (400, {"error": "invalid_invitation"}))
        invite = self.hub.store.create_invitation()
        status, result, _ = self.call("POST", "/remote/mobile/activate", {"invite": invite}, token="synthetic-mobile-token-b")
        self.assertEqual((status, result["membership"]), (200, "active"))
        self.hub.store.set_member(MOBILE_B, "disabled")
        status, result, _ = self.call("POST", "/remote/mobile/activate", {"invite": self.hub.store.create_invitation()},
                                      token="synthetic-mobile-token-b")
        self.assertEqual((status, result), (403, {"error": "member_disabled"}))

    def test_revoke_over_http_is_owner_only(self):
        bound = bind(self.hub)
        path = f"/remote/mobile/devices/{bound['device_id']}/revoke"
        self.assertEqual(self.call("POST", path, token="synthetic-mobile-token-b")[:2], (404, {"error": "device_not_found"}))
        status, result, _ = self.call("POST", path)
        self.assertEqual((status, result["state"]), (200, "revoked"))

    def test_logout_ends_browser_sessions_but_does_not_need_or_set_cookies(self):
        _, cookie = self.hub.sessions.open(A, "")
        token = cookie.split(";", 1)[0].split("=", 1)[1]
        status, result, headers = self.call("POST", "/remote/mobile/logout")
        self.assertEqual((status, result), (200, {"logged_out": True, "sessions_invalidated": 1}))
        self.assertNotIn("Set-Cookie", headers)
        with self.assertRaises(HubError):
            self.hub.sessions.validate(A, token)

    def test_rate_limit_returns_429_in_the_standard_error_shape(self):
        for _ in range(60):
            self.assertEqual(self.call("GET", "/remote/mobile/me")[0], 200)
        self.assertEqual(self.call("GET", "/remote/mobile/me")[:2], (429, {"error": "rate_limited"}))
        self.assertEqual(self.call("GET", "/remote/mobile/me", token="synthetic-mobile-token-b")[0], 200)

    def test_desktop_and_browser_routes_still_reject_mobile_tokens(self):
        # The fake only trusts the mobile kind, mirroring the real per-client azp check.
        status, result, _ = self.call("GET", "/remote/desktop/identity")
        self.assertEqual((status, result["error"]), (401, "invalid_identity"))
