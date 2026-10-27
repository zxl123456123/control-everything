"""Account login never enrolls a computer or sends OAuth credentials to the UI."""

from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from control_everything.integrations.remote_account import RemoteAccount
from control_everything.integrations.remote_connector import ConnectorError, ConnectorStore
from .test_remote_connector import ClockStop, Protector


class Peer:
    config = SimpleNamespace(issuer="https://id.example.test/realms/team", client_id="workbench-desktop")

    def __init__(self):
        self.calls, self.replies = [], []
        self.admin = True
        self.identity_error = None
        self.grant = {"device_code": "private-device-code", "user_code": "TEST-CODE", "expires_in": 60,
                      "interval": 1, "verification_uri": self.config.issuer + "/device"}

    def request(self, method, path, body=None, token=None, *, oauth=False):
        self.calls.append((method, path, body, token))
        if path == "/auth/device":
            return deepcopy(self.grant)
        if path == "/token":
            if self.replies:
                reply = self.replies.pop(0)
                if isinstance(reply, Exception):
                    raise reply
                return reply
            return {"access_token": "private-access-token", "refresh_token": "private-refresh-token", "expires_in": 300}
        if path.endswith("/identity"):
            if self.identity_error:
                raise self.identity_error
            return {"account": {"issuer": self.config.issuer, "sub": "synthetic-owner", "name": "Owner"},
                    "admin": self.admin, "membership": "active"}
        if path.startswith("/remote/desktop/admin/members?"):
            return {"items": [], "total": 0, "offset": 0, "limit": 25}
        if path == "/remote/desktop/invitations":
            return {"invitation": "synthetic-invitation"}
        raise AssertionError(path)


class AccountTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.store = ConnectorStore(Path(temporary.name), protector=Protector())
        self.peer, self.clock = Peer(), [1000]
        self.account = RemoteAccount(self.peer, self.store, clock=lambda: self.clock[0])
        self.account._stop = ClockStop(self.clock)

    def login(self):
        with patch("control_everything.integrations.remote_account.threading.Thread"):
            status = self.account.authorize()
        self.assertEqual(status["state"], "authorizing")
        self.assertNotIn("device_code", status)
        self.account._poll(self.peer.grant)

    def test_login_persists_protected_account_without_enrollment_or_browser_token(self):
        self.login()
        status = self.account.status()
        self.assertEqual(status["account"]["name"], "Owner")
        self.assertTrue(status["admin"])
        self.assertNotIn("private-", str(status))
        raw = (self.store.root / "account-oauth.json").read_bytes()
        self.assertTrue(raw.startswith(b"PROTECTED:"))
        self.assertFalse(any("enrollment" in call[1] for call in self.peer.calls))
        restored = RemoteAccount(self.peer, self.store, clock=lambda: self.clock[0])
        self.assertEqual(restored.status()["account"]["sub"], "synthetic-owner")

    def test_refresh_and_logout_do_not_revoke_or_rebind_a_computer(self):
        self.login()
        self.clock[0] += 300
        self.assertEqual(self.account.status()["state"], "signed_in")
        self.assertTrue(any(call[2] and call[2].get("grant_type") == "refresh_token" for call in self.peer.calls))
        self.account._worker = None
        self.assertIsNone(self.account.logout()["account"])
        self.assertFalse((self.store.root / "account-oauth.json").exists())
        self.assertFalse(any("revoke" in call[1] or "enrollment" in call[1] for call in self.peer.calls))

    def test_role_loss_is_checked_before_directory_access(self):
        self.login()
        self.account.members()
        before = len([call for call in self.peer.calls if "/admin/members" in call[1]])
        self.peer.admin = False
        with self.assertRaisesRegex(ConnectorError, "admin_required"):
            self.account.members()
        self.assertEqual(len([call for call in self.peer.calls if "/admin/members" in call[1]]), before)
        self.assertFalse(self.account.status()["admin"])

    def test_expired_or_revoked_identity_does_not_keep_an_admin_view(self):
        self.login()
        self.clock[0] += 31
        self.peer.identity_error = ConnectorError("invalid_identity", 401)
        status = self.account.status()
        self.assertIsNone(status["account"])
        self.assertFalse(status["admin"])
        self.assertIsNone(self.store.read("account-oauth.json", protected=True))

    def test_slow_down_and_pending_obey_the_grant_interval(self):
        self.peer.replies = [ConnectorError("authorization_pending"), ConnectorError("slow_down")]
        self.login()
        self.assertEqual(self.account._stop.waits, [1, 1, 6])
        self.assertEqual(self.account.status()["state"], "signed_in")

    def test_cross_origin_authorization_and_cancelled_late_token_are_rejected(self):
        self.peer.grant["verification_uri"] = "https://other.example.test/device"
        with self.assertRaisesRegex(ConnectorError, "remote_grant_invalid"):
            self.account.authorize()
        self.assertIsNone(self.account.status()["account"])
        self.account._stop.set()
        self.account._poll(self.peer.grant)
        self.assertIsNone(self.store.read("account-oauth.json", protected=True))


class LocalAccountBoundaryTests(unittest.TestCase):
    def handler(self, **overrides):
        from email.message import Message
        headers = Message()
        for key, value in {"Host": "127.0.0.1:12345", "Origin": "http://127.0.0.1:12345",
                           "X-Session-Client": "panel", "X-Session-CSRF": "synthetic-csrf", **overrides}.items():
            headers[key] = value
        return SimpleNamespace(headers=headers, client_address=("127.0.0.1", 1),
            server=SimpleNamespace(local_origin="http://127.0.0.1:12345", csrf_token="synthetic-csrf", desktop_account=Mock()),
            path="/api/desktop/account/members?limit=25&offset=0", reply=Mock(), reject=Mock(), read_json_body=Mock(return_value={}))

    def test_host_origin_proxy_and_client_cannot_bypass_local_account_boundary(self):
        from control_everything.http.workbench_remote import handle_account
        for headers in ({"Host":"attacker.test"}, {"Origin":"https://other.test"},
                        {"X-CE-Proxy-Token":"proxy"}, {"X-Session-Client":"stdio"}):
            handler = self.handler(**headers)
            self.assertTrue(handle_account(handler, "/api/desktop/account/members"))
            handler.reject.assert_called_once_with(403, "local_control_required")
            handler.server.desktop_account.members.assert_not_called()

    def test_write_csrf_and_strict_pagination_precede_remote_requests(self):
        from control_everything.http.workbench_remote import handle_account
        handler = self.handler(**{"X-Session-CSRF":"wrong"})
        handle_account(handler, "/api/desktop/account/logout", write=True)
        handler.server.desktop_account.logout.assert_not_called()
        for query in ("limit=0", "limit=25&limit=1", "offset=-1", "limit=25&extra=1"):
            handler = self.handler()
            handler.path = "/api/desktop/account/members?" + query
            handle_account(handler, "/api/desktop/account/members")
            handler.reject.assert_called_once_with(400, "invalid_request")
            handler.server.desktop_account.members.assert_not_called()
