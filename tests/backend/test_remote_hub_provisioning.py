"""Fixed-account provisioning has one create attempt and never modifies an existing user."""

import io
import json
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError
from urllib.request import Request

from control_everything.integrations.remote_hub.identity import HubError
from control_everything.integrations.remote_hub.provisioning import (
    KeycloakUserProvisioning, _NoRedirect, validate_new_account,
)


ISSUER = "https://identity.example.test/identity/realms/team"
USERS = "https://identity.example.test/identity/admin/realms/team/users"
PASSWORD = "Synthetic-password-123"
SUBJECT = "8f4458bc-6904-4979-a361-f0b584826e71"


def response(status, body=None, location=None):
    result = Mock(status=status, headers={"Location": location} if location is not None else {})
    result.__enter__ = Mock(return_value=result)
    result.__exit__ = Mock(return_value=False)
    result.read.return_value = json.dumps(body).encode() if body is not None else b""
    return result


class ProvisioningTests(unittest.TestCase):
    def setUp(self):
        self.factory = patch("urllib.request.build_opener")
        self.opener = self.factory.start().return_value
        self.addCleanup(self.factory.stop)
        self.provisioning = KeycloakUserProvisioning(ISSUER, "synthetic-client", "synthetic-client-secret")
        self.token = response(200, {"access_token": "synthetic-access"})

    def failure(self, code, operation, *args):
        with self.assertRaises(HubError) as caught:
            operation(*args)
        self.assertEqual(caught.exception.code, code)
        for secret in (PASSWORD, "synthetic-client-secret", "private-upstream-body"):
            self.assertNotIn(secret, str(caught.exception))
            self.assertNotIn(secret, json.dumps(caught.exception.details))
        return caught.exception

    def test_create_posts_only_fixed_fields_and_uses_the_created_location(self):
        created = response(201, location=USERS + "/" + SUBJECT)
        self.opener.open.side_effect = [self.token, created]
        result = self.provisioning.create("Member.One", PASSWORD)
        self.assertEqual(result, {"sub": SUBJECT, "name": "Member.One", "enabled": True})
        requests = [call.args[0] for call in self.opener.open.call_args_list]
        self.assertEqual(len(requests), 2)
        self.assertEqual(requests[0].full_url, ISSUER + "/protocol/openid-connect/token")
        self.assertEqual(requests[0].data, b"grant_type=client_credentials")
        self.assertTrue(requests[0].get_header("Authorization").startswith("Basic "))
        self.assertEqual((requests[1].get_method(), requests[1].full_url), ("POST", USERS))
        self.assertEqual(requests[1].get_header("Authorization"), "Bearer synthetic-access")
        self.assertEqual(json.loads(requests[1].data), {
            "username": "Member.One", "enabled": True, "requiredActions": [],
            "credentials": [{"type": "password", "value": PASSWORD, "temporary": False}],
        })
        self.assertNotIn(PASSWORD, json.dumps(result))
        created.read.assert_not_called()
        self.assertTrue(all(0 < call.kwargs["timeout"] <= 10 for call in self.opener.open.call_args_list))

    def test_validation_accepts_boundaries_and_preserves_the_password(self):
        for username in ("a12", "A._-", "a" * 64):
            for password in ("x" * 12, "x" * 1024, "秘密密码" * 3, " xxxxxxxxxx "):
                validate_new_account(username, password)

    def test_invalid_account_input_is_rejected_before_token_or_create(self):
        for username in (None, True, "ab", "a" * 65, "-abc", " a12", "a12 ", "a/b", "a%2fb", "用户甲", "a\n3"):
            with self.subTest(username=username):
                self.failure("account_input_rejected", self.provisioning.create, username, PASSWORD)
        for password in (None, True, "x" * 11, "x" * 1025, "x" * 12 + "\0", "x" * 12 + "\n",
                         "x" * 12 + "\x7f", "x" * 12 + "\x85", "x" * 12 + "\ud800"):
            with self.subTest(password_type=type(password).__name__):
                self.failure("account_input_rejected", self.provisioning.create, "member", password)
        self.opener.open.assert_not_called()

    def test_create_failure_classes_never_retry_lookup_reset_or_delete(self):
        for status, code in ((400, "account_input_rejected"), (409, "username_exists"),
                             (401, "account_creation_unavailable"), (403, "account_creation_unavailable"),
                             (302, "account_creation_unknown"), (500, "account_creation_unknown")):
            with self.subTest(status=status):
                self.opener.open.reset_mock()
                self.opener.open.side_effect = [self.token, HTTPError(USERS, status, "private-upstream-body", {}, io.BytesIO(b"private-upstream-body"))]
                self.failure(code, self.provisioning.create, "member", PASSWORD)
                self.assertEqual([call.args[0].get_method() for call in self.opener.open.call_args_list], ["POST", "POST"])
        for error in (TimeoutError("private-upstream-body"), URLError("private-upstream-body")):
            self.opener.open.reset_mock()
            self.opener.open.side_effect = [self.token, error]
            self.failure("account_creation_unknown", self.provisioning.create, "member", PASSWORD)
            self.assertEqual(self.opener.open.call_count, 2)

    def test_create_requires_a_same_origin_exact_subject_location(self):
        for location in (None, "/identity/admin/realms/team/users/" + SUBJECT,
                         "https://elsewhere.example.test/users/" + SUBJECT,
                         USERS + "/", USERS + "/../owner", USERS + "/a%2Fb", USERS + "/a%2e%2e",
                         USERS + "/" + SUBJECT + "?x=1", USERS + "/" + SUBJECT + "#x",
                         USERS + "/" + SUBJECT + "/extra"):
            with self.subTest(location=location):
                self.opener.open.reset_mock()
                self.opener.open.side_effect = [self.token, response(201, location=location)]
                self.failure("account_creation_unknown", self.provisioning.create, "member", PASSWORD)
                self.assertEqual(self.opener.open.call_count, 2)

    def test_token_failure_never_reaches_the_mutating_endpoint(self):
        cases = [response(200, {}), response(200, {"access_token": "bad\nheader"}),
                 response(200, {"access_token": "a" * 16385}), response(500),
                 HTTPError(ISSUER, 403, "private-upstream-body", {}, None),
                 HTTPError(ISSUER, 404, "private-upstream-body", {}, None), OSError("private-upstream-body")]
        oversized = response(200)
        oversized.read.return_value = b"x" * 16385
        cases.append(oversized)
        invalid_json = response(200)
        invalid_json.read.return_value = b"{"
        cases.append(invalid_json)
        for value in cases:
            self.opener.open.reset_mock()
            self.opener.open.side_effect = [value]
            self.failure("account_creation_unavailable", self.provisioning.create, "member", PASSWORD)
            self.assertEqual(self.opener.open.call_count, 1)

    def test_get_user_is_fixed_subject_read_only_and_projects_no_credentials_or_roles(self):
        self.opener.open.side_effect = [self.token, response(200, {
            "id": SUBJECT, "username": "member", "enabled": True,
            "credentials": ["private-upstream-body"], "realmRoles": ["do-not-return"],
        })]
        self.assertEqual(self.provisioning.get_user(SUBJECT), {"sub": SUBJECT, "name": "member", "enabled": True})
        request = self.opener.open.call_args.args[0]
        self.assertEqual((request.get_method(), request.full_url, request.data), ("GET", USERS + "/" + SUBJECT, None))

    def test_get_user_rejects_path_injection_before_network(self):
        for subject in (None, "", ".", "..", "a/b", "a\\b", "a%2fb", "a?b", "a#b", "a b", "a\n", "x" * 256):
            with self.subTest(subject=subject):
                self.failure("account_input_rejected", self.provisioning.get_user, subject)
        self.opener.open.assert_not_called()

    def test_get_user_requires_matching_enabled_minimal_identity(self):
        for body in ({}, [], {"id": "other", "username": "member", "enabled": True},
                     {"id": SUBJECT, "username": "member", "enabled": False},
                     {"id": SUBJECT, "username": "member", "enabled": 1},
                     {"id": SUBJECT, "username": "bad\nname", "enabled": True}):
            self.opener.open.side_effect = [self.token, response(200, body)]
            self.failure("account_lookup_unavailable", self.provisioning.get_user, SUBJECT)
        self.opener.open.side_effect = [self.token, HTTPError(USERS, 404, "missing", {}, None)]
        self.failure("account_not_found", self.provisioning.get_user, SUBJECT)

    def test_configuration_and_redirects_cannot_change_the_authority(self):
        for issuer in ("http://id.example.test/realms/team", "https://user@id.example.test/realms/team",
                       ISSUER + "?x=1", ISSUER + "#fragment", "https://id.example.test/realms/..",
                       "https://id.example.test/realms/a/b", "https://id.example.test:bad/realms/team"):
            with self.subTest(issuer=issuer), self.assertRaises(ValueError):
                KeycloakUserProvisioning(issuer, "synthetic", "synthetic-secret")
        self.assertIsNone(_NoRedirect().redirect_request(Request(USERS), None, 302, "Found", {}, "https://elsewhere.example.test"))


if __name__ == "__main__":
    unittest.main()
