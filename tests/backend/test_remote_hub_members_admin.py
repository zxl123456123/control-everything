"""Admin member console: roster, enable/disable and device revoke are admin-only and leak no secrets."""

import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import Mock

from control_everything.http.remote_hub import build_server
from control_everything.integrations.remote_hub.identity import HubError, Identity
from .test_remote_hub_support import A, B, bind, KEY_B, service

C = Identity(A.issuer, "account-c", A.azp, 10000)
SECRET_FIELDS = ("public_key", "key_fingerprint", "proxy_secret", "control_token_hash", "http_port", "ws_port",
                 "installation_id", "route_proof", "synthetic-internal-proof", "token")


class Identities:
    def __init__(self):
        self.people = {"token-a": A, "token-b": B}

    def authenticate(self, token, kind, trusted_sub=None):
        identity = self.people.get(token)
        if identity is None or (trusted_sub is not None and trusted_sub != identity.sub):
            raise HubError("invalid_identity", 401)
        return identity


class MembersAdminTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.hub = service(Path(temporary.name) / "hub.db")
        self.hub.admin_subjects = frozenset([(A.issuer, A.sub)])
        self.hub.store.set_member(C)

    def error(self, code, function, *args):
        with self.assertRaises(HubError) as caught:
            function(*args)
        self.assertEqual(caught.exception.code, code)

    def test_roster_lists_members_devices_and_sessions_without_secrets(self):
        bind(self.hub, B, "synthetic-installation-0002", KEY_B)
        self.hub.session(B, "")
        page = self.hub.admin_roster(A)
        self.assertEqual((page["total"], page["limit"], page["offset"]), (3, 25, 0))
        rows = {row["sub"]: row for row in page["items"]}
        self.assertEqual(set(rows), {"account-a", "account-b", "account-c"})
        self.assertTrue(rows["account-a"]["admin"])
        self.assertFalse(rows["account-b"]["admin"])
        self.assertEqual(rows["account-b"]["sessions"], 1)
        self.assertEqual(rows["account-b"]["last_active"], 1000)
        self.assertEqual(rows["account-b"]["devices"][0]["state"], "provisioned")
        self.assertEqual(rows["account-c"]["devices"], [])
        self.assertIsNone(rows["account-c"]["last_active"])
        text = json.dumps(page)
        for field in SECRET_FIELDS:
            self.assertNotIn(field, text)

    def test_roster_pagination_and_stale_online_state(self):
        result = bind(self.hub, B, "synthetic-installation-0002", KEY_B)
        self.hub.heartbeat(result["control_token"], "synthetic-installation-0002", True)
        row = next(r for r in self.hub.admin_roster(A)["items"] if r["sub"] == "account-b")
        self.assertEqual(row["devices"][0]["state"], "online")
        self.hub.store.clock = lambda: 1100
        row = next(r for r in self.hub.admin_roster(A)["items"] if r["sub"] == "account-b")
        self.assertEqual(row["devices"][0]["state"], "offline")
        page = self.hub.admin_roster(A, limit=1, offset=2)
        self.assertEqual((len(page["items"]), page["total"]), (1, 3))
        for limit, offset in ((0, 0), (101, 0), (1, -1), ("1", 0), (True, 0)):
            self.error("invalid_pagination", self.hub.admin_roster, A, limit, offset)

    def test_roster_names_come_from_the_optional_directory_and_survive_its_outage(self):
        self.assertIsNone(self.hub.admin_roster(A)["items"][0]["name"])
        self.assertFalse(self.hub.admin_roster(A)["names_available"])
        directory = self.hub.user_directory = Mock(issuer=A.issuer)
        directory.page.return_value = ([{"sub": "account-b", "name": "Bea"}], 1)
        rows = {r["sub"]: r for r in self.hub.admin_roster(A)["items"]}
        self.assertEqual(rows["account-b"]["name"], "Bea")
        self.assertIsNone(rows["account-c"]["name"])
        directory.page.side_effect = HubError("member_directory_unavailable", 503)
        self.assertEqual(len(self.hub.admin_roster(A)["items"]), 3)

    def test_non_admin_cannot_read_or_change_members(self):
        self.error("admin_required", self.hub.admin_roster, B)
        self.error("admin_required", self.hub.set_member_status, B, "account-c", "disabled")
        self.assertEqual(self.hub.admin_roster(A)["items"][2]["membership"], "active")

    def test_disable_blocks_access_ends_sessions_and_enable_restores(self):
        _, cookie = self.hub.session(C, "")
        token = cookie.split(";")[0].split("=", 1)[1]
        self.assertEqual(self.hub.sessions.validate(C, token)["sub"], "account-c")
        self.assertEqual(self.hub.set_member_status(A, "account-c", "disabled"), {"sub": "account-c", "membership": "disabled"})
        self.error("session_required", self.hub.sessions.validate, C, token)
        self.error("membership_required", self.hub.require_member, C)
        self.assertEqual(self.hub.session(C, "")[0]["membership"], "disabled")
        self.hub.set_member_status(A, "account-c", "active")
        self.hub.require_member(C)

    def test_disable_validation_and_guards(self):
        self.error("cannot_change_admin", self.hub.set_member_status, A, "account-a", "disabled")
        self.error("member_not_found", self.hub.set_member_status, A, "nobody", "disabled")
        self.error("invalid_member_status", self.hub.set_member_status, A, "account-c", "deleted")
        for sub in ("", None, 5, "x" * 257, "bad\nsub"):
            self.error("invalid_member", self.hub.set_member_status, A, sub, "disabled")
        self.hub.set_member_status(A, "account-c", "disabled")
        self.assertEqual(self.hub.admin_roster(A)["items"][2]["membership"], "disabled")

    def test_admin_can_revoke_a_members_device_and_non_owner_cannot(self):
        result = bind(self.hub, B, "synthetic-installation-0002", KEY_B)
        self.error("device_not_found", self.hub.revoke, C, result["device_id"])
        self.assertEqual(self.hub.revoke(A, result["device_id"])["state"], "revoked")
        row = next(r for r in self.hub.admin_roster(A)["items"] if r["sub"] == "account-b")
        self.assertEqual(row["devices"][0]["state"], "revoked")
        self.assertFalse(row["devices"][0]["cleanup_failed"])
        self.error("device_not_found", self.hub.revoke, A, "0" * 24)


class MembersAdminHTTPTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.hub = service(Path(temporary.name) / "hub.db")
        self.hub.identities = Identities()
        self.hub.admin_subjects = frozenset([(A.issuer, A.sub)])
        self.hub.store.set_member(C)
        self.server = build_server(("127.0.0.1", 0), self.hub)
        thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        thread.start()
        self.addCleanup(lambda: (self.server.shutdown(), self.server.server_close(), thread.join(timeout=2)))

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=2)
        self.addCleanup(connection.close)
        data = json.dumps(body) if body is not None else None
        extra = {"Content-Type": "application/json"} if body is not None else {}
        connection.request(method, path, data, {**extra, **(headers or {})})
        response = connection.getresponse()
        return response.status, json.loads(response.read()), dict(response.getheaders())

    def login(self, token, sub, with_csrf=True):
        headers = {"X-Auth-Request-Access-Token": token, "X-Auth-Request-User": sub, "X-CE-Route-Proof": self.hub.route_proof}
        _, session, extra = self.request("GET", "/remote/api/session", headers=headers)
        headers["Cookie"] = extra["Set-Cookie"].split(";", 1)[0]
        if with_csrf:
            headers["X-CE-CSRF"] = session["csrf"]
        return headers

    def test_roster_requires_login_session_csrf_and_admin(self):
        path = "/remote/api/admin/roster?limit=25&offset=0"
        self.assertEqual(self.request("GET", path)[0], 403)  # no proxy proof
        anonymous = {"X-Auth-Request-Access-Token": "token-a", "X-Auth-Request-User": A.sub, "X-CE-Route-Proof": self.hub.route_proof}
        self.assertEqual(self.request("GET", path, headers=anonymous)[0], 401)  # no session cookie
        admin = self.login("token-a", A.sub)
        self.assertEqual(self.request("GET", path, headers=self.login("token-a", A.sub, False))[0], 403)  # no CSRF
        status, page, extra = self.request("GET", path, headers=admin)
        self.assertEqual((status, page["total"], extra["Cache-Control"]), (200, 3, "no-store"))
        self.assertEqual(self.request("GET", path, headers={**admin, "Origin": "https://elsewhere.example.test"})[0], 403)
        member = self.login("token-b", B.sub)
        status, body, _ = self.request("GET", path, headers=member)
        self.assertEqual((status, body["error"]), (403, "admin_required"))
        self.assertNotIn("items", body)
        for bad in ("?limit=0", "?limit=101", "?foo=1", "?limit=1&limit=2"):
            self.assertEqual(self.request("GET", "/remote/api/admin/roster" + bad, headers=admin)[0], 400)
        self.assertEqual(self.request("POST", "/remote/api/admin/roster", {}, admin)[0], 405)

    def test_status_change_needs_csrf_origin_admin_and_exact_fields(self):
        path, body = "/remote/api/admin/members/status", {"sub": "account-c", "status": "disabled"}
        admin = self.login("token-a", A.sub)
        origin = {"Origin": self.hub.public_origin}
        self.assertEqual(self.request("POST", path, body, {**admin, **origin, "X-CE-CSRF": "wrong"})[0], 403)
        self.assertEqual(self.request("POST", path, body, admin)[0], 403)  # missing Origin
        self.assertEqual(self.request("POST", path, body, {**admin, "Origin": "null"})[0], 403)
        member = self.login("token-b", B.sub)
        status, answer, _ = self.request("POST", path, body, {**member, **origin})
        self.assertEqual((status, answer["error"]), (403, "admin_required"))
        self.assertEqual(self.hub.admin_roster(A)["items"][2]["membership"], "active")
        self.assertEqual(self.request("POST", path, {"sub": "account-c"}, {**admin, **origin})[0], 400)
        self.assertEqual(self.request("POST", path, {**body, "extra": 1}, {**admin, **origin})[0], 400)
        self.assertEqual(self.request("POST", path, {"sub": "account-a", "status": "disabled"}, {**admin, **origin})[0], 409)
        status, answer, _ = self.request("POST", path, body, {**admin, **origin})
        self.assertEqual((status, answer), (200, {"sub": "account-c", "membership": "disabled"}))
        self.assertEqual(self.request("POST", path, {"sub": "ghost", "status": "active"}, {**admin, **origin})[0], 404)

    def test_member_revoke_route_is_admin_or_owner_only_over_http(self):
        result = bind(self.hub, B, "synthetic-installation-0002", KEY_B)
        path, origin = f"/remote/api/devices/{result['device_id']}/revoke", {"Origin": self.hub.public_origin}
        self.hub.identities.people["token-c"] = C
        stranger = self.login("token-c", C.sub)
        self.assertEqual(self.request("POST", path, {}, {**stranger, **origin})[0], 404)
        admin = self.login("token-a", A.sub)
        status, answer, _ = self.request("POST", path, {}, {**admin, **origin})
        self.assertEqual((status, answer["state"]), (200, "revoked"))


if __name__ == "__main__":
    unittest.main()
