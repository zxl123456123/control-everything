"""Synthetic IdP registration pages and private administrator projections."""

from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from control_everything.integrations.remote_hub.admin import build_service
from control_everything.integrations.remote_hub.directory import KeycloakUserDirectory, _NoRedirect
from control_everything.integrations.remote_hub.identity import HubError
from .test_remote_hub_support import A, B, INSTALL, bind, service


def account(subject, name="Synthetic member", **extra):
    return {"id": subject, "username": name, "enabled": True, "createdTimestamp": 1700000000123, **extra}


class DirectoryTests(unittest.TestCase):
    def directory(self):
        return KeycloakUserDirectory(A.issuer, "synthetic-directory", "synthetic-private-secret")

    def test_page_uses_fixed_issuer_and_private_credentials_without_returning_them(self):
        directory = KeycloakUserDirectory("https://identity.example.test/auth/realms/team", "synthetic", "synthetic-secret")
        requests = []
        def respond(request, maximum=262144):
            requests.append((request, maximum))
            return [{"access_token": "synthetic-access-token"}, 11, [account("new-member", credentials=["never-return"])]][len(requests) - 1]
        directory._json = respond
        rows, total = directory.page(25, 2)
        self.assertEqual(total, 11)
        self.assertEqual(rows, [{"sub": "new-member", "name": "Synthetic member", "registered_at": 1700000000.123, "enabled": True}])
        self.assertEqual(requests[0][0].full_url, "https://identity.example.test/auth/realms/team/protocol/openid-connect/token")
        self.assertEqual(requests[0][0].data, b"grant_type=client_credentials")
        self.assertEqual(requests[0][1], 16384)
        self.assertTrue(requests[0][0].get_header("Authorization").startswith("Basic "))
        self.assertEqual(requests[1][0].full_url, "https://identity.example.test/auth/admin/realms/team/users/count")
        self.assertTrue(requests[2][0].full_url.endswith("/users?first=2&max=25&briefRepresentation=true"))
        self.assertEqual(requests[2][0].get_header("Authorization"), "Bearer synthetic-access-token")
        self.assertNotIn("synthetic-secret", json.dumps(rows))
        self.assertNotIn("never-return", json.dumps(rows))

    def test_missing_optional_profile_fields_are_unknown_and_never_sub_as_name(self):
        directory = self.directory()
        directory._json = Mock(side_effect=[{"access_token": "synthetic"}, 1, [{"id": "private-subject"}]])
        rows, _ = directory.page(25, 0)
        self.assertEqual(rows[0], {"sub": "private-subject", "name": "未命名账号", "registered_at": None, "enabled": None})

    def test_invalid_directory_results_fail_instead_of_falling_back_to_hub_members(self):
        cases = [(True, []), (1, {}), (1, [account("duplicate"), account("duplicate")]),
                 (1, [{"id": "member", "firstName": {"bad": "name"}}]),
                 (1, [account("member", enabled="true")]), (1, [account("member", createdTimestamp=True)]),
                 (1, [account("member", createdTimestamp=-1)]), (1, [account("member", name="bad\nname")]),
                 (1, [account("\ud800")]), (1, [account("member", name="bad\udc00name")]),
                 (1, [{"id": "member", "firstName": "bad\ud800name"}])]
        for total, users in cases:
            with self.subTest(total=total, users=users):
                directory = self.directory()
                directory._json = Mock(side_effect=[{"access_token": "synthetic"}, total, users])
                with self.assertRaises(HubError) as caught:
                    directory.page(25, 0)
                self.assertEqual((caught.exception.code, caught.exception.status), ("member_directory_unavailable", 503))
        directory = self.directory()
        directory._json = Mock(return_value={"access_token": "bad\nheader"})
        with self.assertRaises(HubError):
            directory.page(25, 0)
        self.assertEqual(directory._json.call_count, 1)

    def test_transport_is_bounded_and_does_not_forward_redirects_or_error_details(self):
        directory = self.directory()
        response = Mock(status=200)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b"{" + b"x" * 16384
        opener = Mock()
        opener.open.return_value = response
        with patch("urllib.request.build_opener", return_value=opener):
            with self.assertRaises(HubError) as caught:
                directory.page(25, 0)
            self.assertEqual(caught.exception.code, "member_directory_unavailable")
            self.assertEqual(opener.open.call_args.kwargs["timeout"], 3)
            response.read.assert_called_once_with(16385)
            opener.open.assert_called_once()
        with self.assertRaises(HubError):
            _NoRedirect().redirect_request(None, None, 302, "redirect", {}, "https://elsewhere.example.test")
        opener.open.side_effect = OSError("do not leak synthetic-private-secret")
        with patch("urllib.request.build_opener", return_value=opener):
            with self.assertRaises(HubError) as caught:
                directory.page(25, 0)
            self.assertNotIn("synthetic-private-secret", str(caught.exception))

    def test_private_optional_config_assembles_only_explicit_directory(self):
        config = json.loads(Path("docs/examples/integrations/workbench-identity.hub.example.json").read_text())
        with tempfile.TemporaryDirectory() as directory:
            config["database"] = str(Path(directory) / "hub.db")
            path = Path(directory) / "config.json"
            for settings in [None, {"client_id": "synthetic", "client_secret": "synthetic-secret"}]:
                current = deepcopy(config)
                if settings is not None:
                    current["user_directory"] = settings
                path.write_text(json.dumps(current))
                path.chmod(0o600)
                with patch("control_everything.integrations.remote_hub.admin.SSHSignatureVerifier"):
                    hub = build_service(path)
                self.assertEqual(hub.user_directory is None, settings is None)
            for settings in [{"client_id": "synthetic"}, {"client_id": "synthetic", "client_secret": ""}, {"client_id": "synthetic", "client_secret": "s", "endpoint": "https://elsewhere.example.test"}]:
                current["user_directory"] = settings
                path.write_text(json.dumps(current))
                with self.assertRaises(ValueError):
                    build_service(path)


class AdminMembersTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.hub = service(Path(temporary.name) / "hub.db", admin_subjects=[(A.issuer, A.sub)])
        self.directory = self.hub.user_directory = Mock(issuer=A.issuer)
        self.directory.page.return_value = ([{"sub": identity, "name": name, "registered_at": None, "enabled": True}
                                           for identity, name in [(A.sub, "Admin"), (B.sub, "Member"), ("unactivated", "Registered only")]], 3)

    def test_registered_unactivated_users_and_disabled_members_remain_distinct(self):
        bound = bind(self.hub)
        self.hub.heartbeat(bound["control_token"], INSTALL, True)
        self.hub.store.set_member(B, "disabled")
        with self.hub.store.transaction() as db:
            before = list(db.iterdump())
        page = self.hub.admin_members(A)
        self.assertEqual((page["total"], page["limit"], page["offset"]), (3, 25, 0))
        self.assertEqual([row["membership"] for row in page["items"]], ["active", "disabled", "inactive"])
        self.assertEqual([row["admin"] for row in page["items"]], [True, False, False])
        self.assertEqual(page["items"][0]["device"], {"device_id": bound["device_id"], "name": "Synthetic computer", "state": "online"})
        self.assertIsNone(page["items"][2]["device"])
        for secret in [bound["control_token"], bound["config"]["proxy_token"], INSTALL, "key_fingerprint", "credential_revision", "public_key", "http_port"]:
            self.assertNotIn(secret, json.dumps(page))
        with self.hub.store.transaction() as db:
            self.assertEqual(before, list(db.iterdump()))

    def test_non_admin_is_rejected_before_directory_and_missing_directory_lists_hub_members_only(self):
        with self.assertRaises(HubError) as caught:
            self.hub.admin_members(B)
        self.assertEqual(caught.exception.code, "admin_required")
        self.directory.page.assert_not_called()
        self.hub.user_directory = None
        self.hub.store.set_member(B, "disabled")
        result = self.hub.admin_members(A)
        self.assertEqual((result["source"], result["total"]), ("hub_members", 2))
        self.assertEqual([(i["account"]["sub"], i["membership"], i["admin"]) for i in result["items"]],
                         [(A.sub, "active", True), (B.sub, "disabled", False)])
        page = self.hub.admin_members(A, limit=1, offset=1)
        self.assertEqual(([i["account"]["sub"] for i in page["items"]], page["total"]), ([B.sub], 2))

    def test_stale_device_is_offline_without_a_write_or_probe_and_revoked_is_not_current(self):
        bound = bind(self.hub)
        self.hub.heartbeat(bound["control_token"], INSTALL, True)
        self.hub.channel_probe = Mock(side_effect=AssertionError("read must not probe"))
        self.hub.store.clock = lambda: 1046
        self.assertEqual(self.hub.admin_members(A)["items"][0]["device"]["state"], "offline")
        self.assertEqual(self.hub.store.device(bound["device_id"])["state"], "online")
        self.hub.revoke(A, bound["device_id"])
        self.assertIsNone(self.hub.admin_members(A)["items"][0]["device"])
        self.hub.channel_probe.assert_not_called()

    def test_invalid_pagination_never_calls_idp(self):
        for limit, offset in [(0, 0), (101, 0), (True, 0), (25, -1), (25, 2147483648)]:
            with self.assertRaises(HubError) as caught:
                self.hub.admin_members(A, limit, offset)
            self.assertEqual(caught.exception.code, "invalid_pagination")
        self.directory.page.assert_not_called()
