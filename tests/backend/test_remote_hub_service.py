"""Synthetic state and HTTP contracts; no real identity provider or tunnel."""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from http.cookies import SimpleCookie
from pathlib import Path
import tempfile
import unittest

from control_everything.http.remote_hub import dispatch
from control_everything.integrations.remote_hub.identity import HubError, Identity
from .test_remote_hub_support import A, B, INSTALL, KEY, KEY_B, bind, complete, recovery, service


class RemoteHubServiceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.hub = service(Path(self.temporary.name) / "hub.db")

    def error(self, code, function, *args, **kwargs):
        with self.assertRaises(HubError) as caught:
            function(*args, **kwargs)
        self.assertEqual(caught.exception.code, code)
        return caught.exception

    def test_two_accounts_have_distinct_ports_and_no_cross_owner_revoke(self):
        a = bind(self.hub)
        b = bind(self.hub, B, "synthetic-installation-0002", KEY_B)
        self.assertNotEqual(a["config"]["remote_http_port"], b["config"]["remote_http_port"])
        self.assertNotEqual(a["config"]["proxy_token"], b["config"]["proxy_token"])
        self.error("device_not_found", self.hub.revoke, B, a["device_id"])
        self.error("device_already_bound", self.hub.begin_enrollment, A, INSTALL, KEY, "Again")

    def test_browser_display_name_does_not_change_device_owner(self):
        device = bind(self.hub)
        shown, _ = self.hub.session(replace(A, name="Friendly name"), "")
        renamed, _ = self.hub.session(replace(A, name="Renamed"), "")
        fallback, _ = self.hub.session(A, "")
        self.assertEqual(shown["account"], {"sub":A.sub, "name":"Friendly name"})
        self.assertEqual(renamed["account"]["name"], "Renamed")
        self.assertEqual(fallback["account"]["name"], A.sub)
        self.assertEqual(shown["device"]["device_id"], device["device_id"])
        self.assertEqual(renamed["device"]["device_id"], device["device_id"])
        self.error("device_not_found", self.hub.revoke, B, device["device_id"])

    def test_lost_bind_response_recovery_and_second_lost_response(self):
        challenge = self.hub.begin_enrollment(A, INSTALL, KEY, "Computer")
        first = complete(self.hub, A, challenge)
        self.error("enrollment_consumed", complete, self.hub, A, challenge)
        status = self.hub.enrollment_status(A, INSTALL, KEY)
        self.assertEqual(set(status), {"device_id", "generation", "state", "credential_revision", "recoverable"})
        second = complete(self.hub, A, recovery(self.hub, first))
        self.error("invalid_control_token", self.hub.config, first["control_token"])
        third = complete(self.hub, A, recovery(self.hub, second))
        self.error("invalid_control_token", self.hub.config, second["control_token"])
        for result in (second, third):
            self.assertEqual(result["device_id"], first["device_id"])
            self.assertEqual(result["generation"], first["generation"])
            self.assertEqual(result["config"]["remote_http_port"], first["config"]["remote_http_port"])
            self.assertEqual(result["config"]["remote_ws_port"], first["config"]["remote_ws_port"])
        self.assertEqual(third["credential_revision"], 3)
        self.assertEqual(self.hub.config(third["control_token"])["credential_revision"], 3)

    def test_concurrent_recoveries_have_one_winner_and_conflict_is_consumed(self):
        first = bind(self.hub)
        challenges = [recovery(self.hub, first), recovery(self.hub, first)]
        def run(challenge):
            try:
                return complete(self.hub, A, challenge)
            except HubError as error:
                return error.code
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(run, challenges))
        self.assertEqual(sum(isinstance(value, dict) for value in results), 1)
        self.assertIn("credential_revision_conflict", results)
        loser = challenges[results.index("credential_revision_conflict")]
        self.error("enrollment_consumed", complete, self.hub, A, loser)
        winner = next(value for value in results if isinstance(value, dict))
        self.assertEqual(self.hub.config(winner["control_token"])["credential_revision"], 2)

    def test_pending_ensure_failure_recovery_keeps_identity_and_ports(self):
        self.hub.provisioner.fail_ensure = True
        challenge = self.hub.begin_enrollment(A, INSTALL, KEY, "Computer")
        self.error("provisioning_unavailable", complete, self.hub, A, challenge)
        original = self.hub.store.own_device(A)
        self.assertEqual(original["state"], "pending")
        self.assertEqual(original["credential_revision"], 0)
        status = self.hub.enrollment_status(A, INSTALL, KEY)
        recover = recovery(self.hub, status)
        self.error("provisioning_unavailable", complete, self.hub, A, recover)
        self.hub.provisioner.fail_ensure = False
        result = complete(self.hub, A, recover)
        self.assertEqual(result["device_id"], original["device_id"])
        self.assertEqual(result["credential_revision"], 1)
        self.assertEqual(result["config"]["remote_http_port"], original["http_port"])
        self.error("credential_revision_conflict", self.hub.store.issue_initial_credential_unless_revoked, A, result["device_id"])
        self.hub.config(result["control_token"])

    def test_wrong_owner_installation_key_generation_and_membership_rejected(self):
        result = bind(self.hub)
        for owner, installation, key in ((B, INSTALL, KEY), (A, INSTALL + "wrong", KEY), (A, INSTALL, KEY_B)):
            self.error("device_not_found", self.hub.enrollment_status, owner, installation, key)
        self.error("device_not_found", self.hub.begin_recovery, A, INSTALL, KEY, result["device_id"], 999, 1)
        recover = recovery(self.hub, result)
        self.hub.store.set_member(A, "disabled")
        self.error("membership_required", complete, self.hub, A, recover)
        self.error("membership_required", self.hub.config, result["control_token"])

    def test_signature_binds_server_payload_and_cross_owner_completion(self):
        challenge = self.hub.begin_enrollment(A, INSTALL, KEY, "Computer")
        self.error("enrollment_not_found", complete, self.hub, B, challenge)
        self.error("invalid_signature", self.hub.complete_enrollment, A, challenge["challenge_id"], "signature:mutated")
        self.assertIsNone(self.hub.store.own_device(A))
        complete(self.hub, A, challenge)

    def test_revoking_denies_credentials_and_reconcile_cleans(self):
        result = bind(self.hub)
        recover = recovery(self.hub, result)
        self.hub.provisioner.fail_cleanup = True
        revoked = self.hub.revoke(A, result["device_id"])
        self.assertEqual(revoked["state"], "revoking")
        self.error("invalid_control_token", self.hub.config, result["control_token"])
        self.error("device_not_recoverable", complete, self.hub, A, recover)
        self.assertIsNotNone(self.hub.store.device(result["device_id"])["http_port"])
        self.hub.provisioner.fail_cleanup = False
        self.assertEqual(self.hub.reconcile()[0]["state"], "revoked")
        self.assertIsNone(self.hub.store.device(result["device_id"])["http_port"])

    def test_heartbeat_claim_cannot_grant_online(self):
        result = bind(self.hub)
        self.hub.channel_probe = None
        self.assertEqual(self.hub.heartbeat(result["control_token"], INSTALL, True)["state"], "offline")
        self.hub.channel_probe = lambda device: True
        self.assertEqual(self.hub.heartbeat(result["control_token"], INSTALL, True)["state"], "online")

    def test_immutable_context_sessions_logout_and_missing_context(self):
        result = bind(self.hub)
        self.hub.heartbeat(result["control_token"], INSTALL, True)
        info, header = self.hub.session(A, "")
        parsed = SimpleCookie(); parsed.load(header)
        cookie = parsed["__Host-ce_remote"].value
        document = self.hub.authorize(A, cookie, method="GET", uri="/studio")
        management = self.hub.authorize(A, cookie, method="GET", uri="/workspace-admin")
        self.assertNotEqual(management["X-CE-Page-Context"], document["X-CE-Page-Context"])
        self.hub.authorize(A, cookie, method="GET", uri="/workspace-admin", context=document["X-CE-Page-Context"])
        for path in ("/workspace-admin/extra", "/workbench/web-index.html?project_id=example"):
            self.error("context_required", self.hub.authorize, A, cookie, method="GET", uri=path)
        self.assertNotIn("proxy_token", info)
        self.error("context_required", self.hub.authorize, A, cookie, method="GET", uri="/api/bootstrap")
        self.hub.authorize(A, cookie, method="GET", uri="/api/bootstrap", context=document["X-CE-Page-Context"])
        self.error("session_required", self.hub.authorize, B, cookie, method="GET", uri="/studio")
        self.hub.session(B, cookie)
        self.error("session_required", self.hub.authorize, A, cookie, method="GET", uri="/studio")

    def test_logout_invalidates_context_and_csrf_requires_exact_origin(self):
        info, header = self.hub.session(A, "")
        parsed = SimpleCookie(); parsed.load(header)
        cookie = parsed["__Host-ce_remote"].value
        self.error("csrf_rejected", self.hub.sessions.validate, A, cookie, csrf=info["csrf"], origin="null")
        self.hub.sessions.logout(A, cookie, info["csrf"], self.hub.public_origin)
        self.error("session_required", self.hub.sessions.validate, A, cookie)

    def test_desktop_http_rejects_extra_owner_fields(self):
        class Identities:
            def authenticate(self, token, kind):
                return A
        self.hub.identities = Identities()
        self.error("invalid_request_fields", dispatch, self.hub, "POST", "/remote/desktop/enrollment",
                   {"Authorization": "Bearer synthetic-token"}, {"installation_id": INSTALL, "public_key": KEY,
                                                            "name": "Computer", "owner": "other"})

    def test_expired_challenge_cannot_reserve_a_device(self):
        challenge = self.hub.begin_enrollment(A, INSTALL, KEY, "Computer")
        self.hub.store.clock = lambda: 1120
        self.error("enrollment_expired", complete, self.hub, A, challenge)
        self.assertIsNone(self.hub.store.own_device(A))

    def test_internal_proof_and_exact_trusted_identity_are_required(self):
        class Identities:
            def authenticate(self, token, kind, trusted_sub):
                if trusted_sub != A.sub:
                    raise HubError("identity_mismatch", 403)
                return A
        self.hub.identities = Identities()
        self.error("untrusted_proxy", self.hub.browser_identity, "token", A.sub, "forged-proof")
        self.error("identity_mismatch", self.hub.browser_identity, "token", B.sub, self.hub.route_proof)
        self.assertEqual(self.hub.browser_identity("token", A.sub, self.hub.route_proof), A)

    def test_websocket_context_query_is_strict_and_revoke_does_not_affect_b(self):
        a, b = bind(self.hub), bind(self.hub, B, "synthetic-installation-0002", KEY_B)
        self.hub.heartbeat(a["control_token"], INSTALL, True)
        self.hub.heartbeat(b["control_token"], "synthetic-installation-0002", True)
        parsed = SimpleCookie(); parsed.load(self.hub.session(A, "")[1])
        cookie = parsed["__Host-ce_remote"].value
        context = self.hub.authorize(A, cookie, method="GET", uri="/studio")["X-CE-Page-Context"]
        uri = "/workbench-runtime?orca-client=web&ce_context=" + context
        route = self.hub.authorize(A, cookie, method="GET", uri=uri, origin=self.hub.public_origin)
        self.assertEqual(route["X-CE-Upstream"], "127.0.0.1:" + str(a["config"]["remote_ws_port"]))
        for wrong in (uri + "&ce_context=other", uri + "&unknown=yes", uri.replace("web&", "desktop&")):
            self.error("websocket_rejected", self.hub.authorize, A, cookie, method="GET", uri=wrong,
                       origin=self.hub.public_origin)
        self.hub.revoke(A, a["device_id"])
        self.error("device_offline", self.hub.authorize, A, cookie, method="GET", uri=uri, origin=self.hub.public_origin)
        self.assertEqual(self.hub.config(b["control_token"])["device_id"], b["device_id"])

    def test_public_session_does_not_expose_ssh_proxy_or_control_secrets(self):
        result = bind(self.hub)
        info, _ = self.hub.session(A, "")
        serialized = str(info)
        for secret in (result["control_token"], result["config"]["proxy_token"], result["config"]["ssh"]["host_key"]):
            self.assertNotIn(secret, serialized)
        self.error("admin_required", self.hub.create_invitation, A)

    def test_unactivated_identity_is_display_only_and_name_is_not_owner(self):
        identity = Identity(A.issuer, "new-account", A.azp, 10000, name="Friendly name")
        displayed = self.hub.desktop_identity(identity)
        self.assertEqual(displayed, {"account": {"issuer": A.issuer, "sub": "new-account", "name": "Friendly name"}, "member_active": False})
        self.error("membership_required", self.hub.begin_enrollment, identity, INSTALL, KEY, "Computer")
        self.assertEqual(self.hub.desktop_identity(A)["account"]["name"], A.sub)
        self.assertEqual(self.hub.desktop_identity(A)["member_active"], True)

    def test_late_probe_success_and_failure_cannot_revive_revocation(self):
        for online in (True, False):
            with self.subTest(online=online):
                # A fresh independent owner prevents sharing state across outcomes.
                owner = Identity(A.issuer, "late-" + str(online), A.azp, 10000)
                self.hub.store.set_member(owner)
                result = bind(self.hub, owner, INSTALL + str(online))
                def probe(device):
                    self.hub.store.mark_revoking(device["device_id"])
                    return online
                self.hub.channel_probe = probe
                self.error("invalid_control_token", self.hub.heartbeat, result["control_token"], INSTALL + str(online), True)
                self.assertEqual(self.hub.store.device(result["device_id"])["state"], "revoking")

    def test_late_probe_cannot_write_after_generation_or_ports_change(self):
        for column in ("generation", "http_port", "ws_port"):
            with self.subTest(column=column):
                owner = Identity(A.issuer, "changed-" + column, A.azp, 10000)
                self.hub.store.set_member(owner)
                result = bind(self.hub, owner, INSTALL + column)
                def probe(device):
                    with self.hub.store.transaction() as db:
                        db.execute("UPDATE devices SET " + column + "=" + column + "+100 WHERE device_id=?", (device["device_id"],))
                    return True
                self.hub.channel_probe = probe
                self.error("invalid_control_token", self.hub.heartbeat, result["control_token"], INSTALL + column, True)
                self.assertEqual(self.hub.store.device(result["device_id"])["state"], "provisioned")

    def test_session_change_flag_tracks_first_same_account_and_switch_without_changing_owner(self):
        first, header = self.hub.session(A, "")
        self.assertTrue(first["session_changed"])
        cookie = SimpleCookie(); cookie.load(header)
        value = cookie["__Host-ce_remote"].value
        same, header = self.hub.session(A, value)
        self.assertFalse(same["session_changed"])
        self.assertIsNone(header)
        changed, header = self.hub.session(B, value)
        self.assertTrue(changed["session_changed"])
        self.assertEqual(changed["account"]["sub"], B.sub)
        self.assertIsNotNone(header)
        self.error("session_required", self.hub.sessions.validate, A, value)
