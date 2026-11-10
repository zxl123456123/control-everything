"""Local member activation against real SQLite and the administrator CLI."""

from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from control_everything.http.remote_hub import main
from control_everything.integrations.remote_hub import admin
from control_everything.integrations.remote_hub.identity import HubError, Identity
from .test_remote_hub_support import A, B, KEY, Provisioner, Verifier, bind


class MemberAdminTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.config_path = root / "hub.json"
        self.config = dict(issuer=A.issuer, database=str(root / "hub.db"),
                           public_origin="https://app.example.test", route_proof="synthetic-proof",
                           ssh_host="ssh.example.test", ssh_host_key=KEY, ssh_keygen=shutil.which("ssh-keygen"),
                           provisioner_socket=str(root / "unused.sock"), admin_subjects=["local-admin"], static_paths=[],
                           introspection_client_id="synthetic-client", introspection_client_secret="synthetic-secret")
        self.config_path.write_text(json.dumps(self.config), encoding="utf-8")
        self.config_path.chmod(0o600)
        self.hub = admin.build_service(self.config_path)
        self.hub.verifier, self.hub.provisioner = Verifier(), Provisioner()
        self.store = self.hub.store

    def snapshot(self):
        with self.store.transaction() as db:
            return {table: [tuple(row) for row in db.execute(f"SELECT * FROM {table} ORDER BY rowid")]
                    for table in ("identities", "members", "devices", "enrollments", "browser_sessions", "invites")}

    def cli(self, *arguments):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = main(["--config", str(self.config_path), "activate-member", *arguments])
        return code, json.loads(out.getvalue())

    def test_precreated_identity_becomes_an_ordinary_member_without_invite(self):
        with self.assertRaises(HubError) as caught:
            self.hub.require_member(A)
        self.assertEqual(caught.exception.code, "membership_required")
        result = admin.activate_member(self.hub, A.sub)
        self.hub.require_member(A)
        account = self.store.account_id(A)
        self.assertRegex(account, r"^[0-9a-f]{32}$")
        self.assertEqual(result, {"issuer": A.issuer, "sub": A.sub, "account_id": account, "membership": "active"})
        self.assertFalse(self.hub.is_admin(A))
        self.assertEqual(self.hub.admin_subjects, frozenset([(A.issuer, "local-admin")]))
        self.assertEqual(self.snapshot()["invites"], [])
        self.assertEqual(self.store.devices_of(A), [])

    def test_repeated_activation_preserves_account_device_sessions_and_other_members(self):
        self.store.set_member(A)
        self.store.set_member(B)
        own = bind(self.hub, A)
        other = bind(self.hub, B, installation="synthetic-installation-0002")
        self.hub.session(A, "")
        self.store.mark_logout(A)
        self.store.set_member(B, "disabled")
        before = self.snapshot()
        first = admin.activate_member(self.hub, A.sub)
        self.assertEqual(first, admin.activate_member(self.hub, A.sub))
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.store.own_device(A)["device_id"], own["device_id"])
        self.assertEqual(self.store.own_device(B)["device_id"], other["device_id"])
        self.assertEqual(self.store.member_status(B), "disabled")
        self.assertNotEqual(self.store.account_id(A), self.store.account_id(B))

    def test_linked_identity_keeps_existing_account_and_disabled_alias_is_refused(self):
        original = Identity("https://old.example.test/realms/team", "old-a", "", 0)
        account = self.store.ensure_account(original)
        self.store.link_identity(account, A.issuer, A.sub)
        admin.activate_member(self.hub, A.sub)
        self.hub.require_member(original)
        self.assertEqual(self.store.account_id(A), account)
        self.store.set_member(original, "disabled")
        before = self.snapshot()
        with self.assertRaises(HubError) as caught:
            admin.activate_member(self.hub, A.sub)
        self.assertEqual(caught.exception.code, "member_disabled")
        self.assertEqual(self.snapshot(), before)

    def test_configured_admin_and_its_account_alias_are_refused(self):
        configured = Identity(A.issuer, "local-admin", "", 0)
        account = self.store.ensure_account(configured)
        self.store.link_identity(account, A.issuer, "admin-alias")
        before = self.snapshot()
        for subject in (configured.sub, "admin-alias"):
            with self.subTest(subject=subject), self.assertRaises(HubError) as caught:
                admin.activate_member(self.hub, subject)
            self.assertEqual(caught.exception.code, "ordinary_member_required")
        self.assertEqual(self.snapshot(), before)

    def test_invalid_subjects_do_not_create_accounts_or_members(self):
        before = self.snapshot()
        for subject in (None, 1, True, [], "", " ", "a b", " a", "a ", "a\t", "a\n", "a\x00", "a\x7f",
                        "a\u0085", "a\u00a0", "\ud800", "a" * 256):
            with self.subTest(subject=subject), self.assertRaises(HubError) as caught:
                admin.activate_member(self.hub, subject)
            self.assertEqual(caught.exception.code, "invalid_member_subject")
        self.assertEqual(self.snapshot(), before)

    def test_subject_is_case_sensitive_and_accepts_255_characters(self):
        for subject in ("a" * 255, "Member", "member"):
            admin.activate_member(self.hub, subject)
        with self.store.transaction() as db:
            accounts = db.execute("SELECT sub,account_id FROM identities").fetchall()
        self.assertEqual(len({row[1] for row in accounts}), 3)

    def test_cli_dispatch_uses_configured_issuer_and_prints_one_json_document(self):
        code, result = self.cli("--sub", A.sub)
        self.assertEqual(code, 0)
        self.assertEqual(result, {"issuer": A.issuer, "sub": A.sub, "account_id": self.store.account_id(A),
                                  "membership": "active"})
        self.hub.require_member(A)
        self.assertFalse(self.hub.is_admin(A))

    def test_cli_rejects_missing_invalid_or_unrelated_identity_flags_without_writes(self):
        before = self.snapshot()
        invalid = [[], ["--sub", ""], ["--sub", "a b"], ["--sub", "a\n"], ["--sub", "a" * 256]]
        for flag in ("--issuer", "--account-id", "--from-issuer", "--from-sub"):
            for value in ("", "other"):
                invalid.append(["--sub", A.sub, flag, value])
        for arguments in invalid:
            with self.subTest(arguments=arguments), self.assertRaises(SystemExit):
                self.cli(*arguments)
            self.assertEqual(self.snapshot(), before)

    def test_cli_disabled_and_admin_refusals_print_no_success_json(self):
        self.store.set_member(A, "disabled")
        before = self.snapshot()
        for subject, error in ((A.sub, "member_disabled"), ("local-admin", "ordinary_member_required")):
            out = io.StringIO()
            with self.subTest(subject=subject), redirect_stdout(out), self.assertRaisesRegex(SystemExit, error):
                main(["--config", str(self.config_path), "activate-member", "--sub", subject])
            self.assertEqual(out.getvalue(), "")
            self.assertEqual(self.snapshot(), before)

    def test_cli_argument_errors_are_rejected_before_opening_config(self):
        missing = self.config_path.with_name("not-created.json")
        invalid = [[], ["--sub", "a b"]]
        invalid.extend(["--sub", A.sub, flag, ""]
                       for flag in ("--issuer", "--account-id", "--from-issuer", "--from-sub"))
        for arguments in invalid:
            with self.subTest(arguments=arguments), redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as caught:
                main(["--config", str(missing), "activate-member", *arguments])
            self.assertEqual(caught.exception.code, 2)
        self.assertFalse(missing.exists())

    def test_repository_entry_point_executes_real_dispatch(self):
        result = subprocess.run([sys.executable, "tools/scripts/remote_hub_admin.py", "--config",
                                 str(self.config_path), "activate-member", "--sub", A.sub],
                                capture_output=True, text=True, check=False, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["account_id"], self.store.account_id(A))
        self.hub.require_member(A)
