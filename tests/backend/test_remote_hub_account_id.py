"""Internal account_id: v1/v2 -> v3 migration of live-shaped data, idempotency, rollback and IdP swap."""

import argparse
import io
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import unittest
from unittest import mock

from control_everything.http.remote_hub import identity_admin
from control_everything.integrations.remote_hub.identity import HubError, Identity
from control_everything.integrations.remote_hub.service import RemoteHubService
from control_everything.integrations.remote_hub.store import BACKUP_SUFFIX, RemoteHubStore, token_hash
from .test_remote_hub_support import A, INSTALL, KEY, Provisioner, Verifier

ISSUER = A.issuer
NEW_ISSUER = "https://new-idp.example.test/realms/next"
NEW_A = Identity(NEW_ISSUER, "new-sub-a", "workbench-browser", 10000)
NEW_C = Identity(NEW_ISSUER, "new-sub-c", "workbench-browser", 10000)
ORIGIN = "https://app.example.test"

V1 = """
CREATE TABLE schema_version(version INTEGER NOT NULL);
CREATE TABLE members(issuer TEXT, sub TEXT, status TEXT NOT NULL, PRIMARY KEY(issuer,sub));
CREATE TABLE invites(token_hash TEXT PRIMARY KEY, expires REAL NOT NULL, consumed_by TEXT);
CREATE TABLE devices(device_id TEXT PRIMARY KEY, issuer TEXT NOT NULL,
    sub TEXT NOT NULL, installation_id TEXT NOT NULL, key_fingerprint TEXT NOT NULL,
    public_key TEXT NOT NULL, name TEXT NOT NULL, generation INTEGER NOT NULL,
    state TEXT NOT NULL, http_port INTEGER UNIQUE, ws_port INTEGER UNIQUE,
    control_token_hash TEXT, credential_revision INTEGER NOT NULL DEFAULT 0,
    proxy_secret TEXT NOT NULL, last_heartbeat REAL, cleanup_error TEXT);
CREATE UNIQUE INDEX owner_active ON devices(issuer,sub) WHERE state!='revoked';
CREATE TABLE enrollments(challenge_id TEXT PRIMARY KEY, issuer TEXT NOT NULL,
    sub TEXT NOT NULL, installation_id TEXT NOT NULL, public_key TEXT NOT NULL,
    key_fingerprint TEXT NOT NULL, name TEXT NOT NULL, payload BLOB NOT NULL,
    expires REAL NOT NULL, operation TEXT NOT NULL, expected_credential_revision INTEGER,
    device_id TEXT, generation INTEGER, consumed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE browser_sessions(session_hash TEXT PRIMARY KEY,
    issuer TEXT NOT NULL, sub TEXT NOT NULL, sid TEXT NOT NULL, csrf TEXT NOT NULL,
    expires REAL NOT NULL, invalidated INTEGER NOT NULL DEFAULT 0);
CREATE TABLE contexts(context_id TEXT PRIMARY KEY, session_hash TEXT NOT NULL,
    device_id TEXT NOT NULL, generation INTEGER NOT NULL, scope TEXT NOT NULL);
"""
V2_ALTERS = ("ALTER TABLE devices ADD COLUMN created_at REAL", "ALTER TABLE devices ADD COLUMN os_name TEXT",
             "ALTER TABLE devices ADD COLUMN os_version TEXT", "ALTER TABLE devices ADD COLUMN app_version TEXT",
             "ALTER TABLE members ADD COLUMN last_logout_at REAL")


def legacy_database(path, version=2):
    """Build a database exactly as an older hub left it, with rows for two members and history."""
    db = sqlite3.connect(path)
    db.executescript(V1)
    db.execute("INSERT INTO schema_version VALUES(1)")
    db.executemany("INSERT INTO members VALUES(?,?,?)", [(ISSUER, "account-a", "active"), (ISSUER, "account-b", "disabled")])
    # A: old revoked generation 1 and live generation 2; B: one revoked device.
    device = "(?,?,?,'inst','fp','pk',?,?,?,?,?,NULL,?,'secret',?,NULL)"
    db.executemany("INSERT INTO devices VALUES" + device, [
        ("d" * 24, ISSUER, "account-a", "Old PC", 1, "revoked", None, None, 1, 5),
        ("e" * 24, ISSUER, "account-a", "My PC", 2, "online", 20000, 20001, 3, 900),
        ("f" * 24, ISSUER, "account-b", "B PC", 1, "revoked", None, None, 1, 5)])
    db.execute("INSERT INTO enrollments VALUES('chal1',?,'account-a','inst','pk','fp','My PC',x'7b7d',2000,'recover',3,?,2,0)",
               (ISSUER, "e" * 24))
    db.executemany("INSERT INTO browser_sessions VALUES(?,?,?,?,?,?,?)", [
        (token_hash("cookie-a"), ISSUER, "account-a", "sid-a", "csrf-a", 5000, 0),
        (token_hash("cookie-b"), ISSUER, "account-b", "sid-b", "csrf-b", 5000, 1)])
    db.execute("INSERT INTO contexts VALUES('ctx1',?,?,2,'old-scope')", (token_hash("cookie-a"), "e" * 24))
    db.executemany("INSERT INTO invites VALUES(?,?,?)", [
        ("i1", 9999, json.dumps([ISSUER, "account-a"])), ("i2", 9999, None),
        ("i3", 9999, json.dumps([ISSUER, "gone-user"])), ("i4", 9999, "not-json")])
    if version >= 2:
        for statement in V2_ALTERS:
            db.execute(statement)
        db.execute("UPDATE devices SET created_at=77,os_name='Windows',os_version='11',app_version='1.2' WHERE device_id=?", ("e" * 24,))
        db.execute("UPDATE members SET last_logout_at=123 WHERE sub='account-a'")
        db.execute("UPDATE schema_version SET version=2")
    db.commit()
    db.close()


def rows(path, sql, args=()):
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    try:
        return [dict(row) for row in db.execute(sql, args)]
    finally:
        db.close()


def hub_for(path, admins=((ISSUER, "account-a"),), clock=lambda: 1000):
    store = RemoteHubStore(path, clock=clock)
    return RemoteHubService(store, None, Verifier(), Provisioner(), public_origin=ORIGIN, route_proof="synthetic-internal-proof",
                            ssh_host="ssh.example.test", ssh_host_key=KEY, admin_subjects=admins, channel_probe=lambda device: True)


class MigrationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.path = Path(temporary.name) / "control.sqlite3"
        self.backup = Path(str(self.path) + BACKUP_SUFFIX)

    def test_backup_suffix_is_documented_name(self):
        self.assertEqual(self.backup.name, "control.sqlite3.pre-account-id")

    def test_v2_database_migrates_every_table_and_keeps_data(self):
        legacy_database(self.path, 2)
        store = RemoteHubStore(self.path, clock=lambda: 1000)
        self.assertEqual(rows(self.path, "SELECT version FROM schema_version"), [{"version": 3}])
        identities = {(r["issuer"], r["sub"]): r["account_id"] for r in rows(self.path, "SELECT * FROM identities")}
        self.assertEqual(set(identities), {(ISSUER, "account-a"), (ISSUER, "account-b"), (ISSUER, "gone-user")})
        self.assertEqual(len(set(identities.values())), 3)
        self.assertTrue(all(re.fullmatch(r"[0-9a-f]{32}", value) for value in identities.values()))
        account_a, account_b = identities[(ISSUER, "account-a")], identities[(ISSUER, "account-b")]
        self.assertEqual({r["account_id"]: (r["status"], r["last_logout_at"]) for r in rows(self.path, "SELECT * FROM members")},
                         {account_a: ("active", 123), account_b: ("disabled", None)})
        devices = {r["device_id"]: r for r in rows(self.path, "SELECT * FROM devices")}
        self.assertEqual({key: value["account_id"] for key, value in devices.items()},
                         {"d" * 24: account_a, "e" * 24: account_a, "f" * 24: account_b})
        live = devices["e" * 24]
        self.assertEqual((live["http_port"], live["ws_port"], live["state"], live["credential_revision"], live["created_at"],
                          live["os_name"], live["app_version"], live["last_heartbeat"]), (20000, 20001, "online", 3, 77, "Windows", "1.2", 900))
        self.assertEqual(rows(self.path, "SELECT account_id,consumed,device_id FROM enrollments"),
                         [{"account_id": account_a, "consumed": 0, "device_id": "e" * 24}])
        self.assertEqual({r["session_hash"]: (r["account_id"], r["invalidated"]) for r in rows(self.path, "SELECT * FROM browser_sessions")},
                         {token_hash("cookie-a"): (account_a, 0), token_hash("cookie-b"): (account_b, 1)})
        self.assertEqual(rows(self.path, "SELECT scope FROM contexts"), [{"scope": "old-scope"}])
        self.assertEqual({r["token_hash"]: r["consumed_by"] for r in rows(self.path, "SELECT * FROM invites")},
                         {"i1": account_a, "i2": None, "i3": identities[(ISSUER, "gone-user")], "i4": "not-json"})
        self.assertFalse({"issuer", "sub"} & {c["name"] for table in ("members", "devices", "enrollments", "browser_sessions")
                                              for c in rows(self.path, f"PRAGMA table_info({table})")})
        # The partial unique index moved to account_id: one live device per account, revoked history allowed.
        with self.assertRaises(sqlite3.IntegrityError):
            with store.transaction() as db:
                db.execute("UPDATE devices SET state='offline' WHERE device_id=?", ("d" * 24,))
        self.assertEqual(store.member_status(Identity(ISSUER, "account-a", "", 0)), "active")
        self.assertEqual([d["name"] for d in store.devices_of(Identity(ISSUER, "account-a", "", 0))], ["My PC", "Old PC"])

    def test_v1_database_migrates_through_v2_in_one_step(self):
        legacy_database(self.path, 1)
        store = RemoteHubStore(self.path, clock=lambda: 1000)
        self.assertEqual(rows(self.path, "SELECT version FROM schema_version"), [{"version": 3}])
        device = store.own_device(Identity(ISSUER, "account-a", "", 0))
        self.assertEqual((device["name"], device["os_name"], device["created_at"]), ("My PC", None, None))
        self.assertEqual(rows(self.path, "SELECT COUNT(*) AS n FROM members")[0]["n"], 2)

    def test_existing_session_still_works_after_migration(self):
        legacy_database(self.path, 2)
        hub = hub_for(self.path)
        identity = Identity(ISSUER, "account-a", "workbench-browser", 10000, sid="sid-a")
        row = hub.sessions.validate(identity, "cookie-a", csrf="csrf-a", origin=ORIGIN)
        self.assertEqual(row["sid"], "sid-a")
        with self.assertRaises(HubError):
            hub.sessions.validate(Identity(ISSUER, "account-b", "x", 1, sid="sid-b"), "cookie-a")

    def test_backup_is_created_before_migration_and_matches_old_data(self):
        legacy_database(self.path, 2)
        RemoteHubStore(self.path)
        self.assertTrue(self.backup.is_file())
        self.assertEqual(rows(self.backup, "SELECT version FROM schema_version"), [{"version": 2}])
        self.assertEqual(len(rows(self.backup, "SELECT issuer,sub FROM members")), 2)
        self.assertEqual(rows(self.backup, "SELECT name FROM sqlite_master WHERE name='identities'"), [])
        if self.backup.stat().st_mode & 0o777 != 0o600 and __import__("os").name != "nt":
            self.fail("backup must be private")

    def test_migration_is_idempotent_and_backup_is_not_overwritten_afterwards(self):
        legacy_database(self.path, 2)
        RemoteHubStore(self.path)
        first = rows(self.path, "SELECT * FROM identities ORDER BY sub")
        backup_before = self.backup.read_bytes()
        store = RemoteHubStore(self.path)
        store.set_member(Identity(ISSUER, "account-new", "", 0))
        RemoteHubStore(self.path)
        self.assertEqual(rows(self.path, "SELECT * FROM identities WHERE sub!='account-new' ORDER BY sub"), first)
        self.assertEqual(self.backup.read_bytes(), backup_before)
        self.assertEqual(rows(self.path, "SELECT COUNT(*) AS n FROM members")[0]["n"], 3)

    def test_failed_migration_rolls_back_completely_and_can_be_retried(self):
        legacy_database(self.path, 2)
        calls = []

        def flaky():
            calls.append(1)
            if len(calls) == 3:
                raise RuntimeError("synthetic crash mid-migration")
            return "%032x" % len(calls)
        with mock.patch("control_everything.integrations.remote_hub.store.new_account_id", flaky):
            with self.assertRaises(RuntimeError):
                RemoteHubStore(self.path)
        self.assertEqual(rows(self.path, "SELECT version FROM schema_version"), [{"version": 2}])
        self.assertEqual(rows(self.path, "SELECT name FROM sqlite_master WHERE name='identities'"), [])
        self.assertEqual(len(rows(self.path, "SELECT issuer FROM members")), 2)
        self.assertTrue(self.backup.is_file())
        RemoteHubStore(self.path)
        self.assertEqual(rows(self.path, "SELECT version FROM schema_version"), [{"version": 3}])

    def test_row_count_mismatch_aborts_instead_of_losing_rows(self):
        legacy_database(self.path, 2)
        original = RemoteHubStore._migrate_account_ids

        class LossyConnection:
            """Delegates to the real transaction but silently skips one device row on copy."""

            def __init__(self, db):
                self.db = db

            def execute(self, sql, *args):
                if sql.startswith("INSERT INTO devices("):
                    sql = sql.replace("JOIN identities AS i ON", "JOIN identities AS i ON t.device_id!='" + "d" * 24 + "' AND")
                return self.db.execute(sql, *args)

        with mock.patch.object(RemoteHubStore, "_migrate_account_ids", staticmethod(lambda db: original(LossyConnection(db)))):
            with self.assertRaises(ValueError):
                RemoteHubStore(self.path)
        self.assertEqual(rows(self.path, "SELECT version FROM schema_version"), [{"version": 2}])
        self.assertEqual(len(rows(self.path, "SELECT * FROM devices")), 3)
        self.assertEqual(rows(self.path, "SELECT name FROM sqlite_master WHERE name='identities'"), [])

    def test_fresh_database_is_latest_and_has_no_backup(self):
        RemoteHubStore(self.path)
        self.assertEqual(rows(self.path, "SELECT version FROM schema_version"), [{"version": 3}])
        self.assertFalse(self.backup.exists())
        RemoteHubStore(self.path)
        self.assertFalse(self.backup.exists())


class IdentityProviderSwapTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.path = Path(temporary.name) / "control.sqlite3"
        legacy_database(self.path, 2)
        self.hub = hub_for(self.path)
        self.store = self.hub.store
        self.old_a = Identity(ISSUER, "account-a", "workbench-browser", 10000, sid="old-sid")
        self.account = self.store.account_id(self.old_a)

    def test_new_idp_login_has_no_access_until_linked_then_inherits_everything(self):
        self.assertEqual(self.store.member_status(NEW_A), "inactive")
        self.assertEqual(self.hub.mobile_devices(NEW_A)["items"], [])
        with self.assertRaises(HubError) as caught:
            self.hub.begin_enrollment(NEW_A, INSTALL, KEY, "x")
        self.assertEqual(caught.exception.code, "membership_required")
        result = self.store.link_identity(self.account, NEW_ISSUER, NEW_A.sub)
        self.assertEqual((result["linked"], result["absorbed"]), (True, False))
        self.assertEqual(self.store.member_status(NEW_A), "active")
        self.assertEqual([d["name"] for d in self.hub.mobile_devices(NEW_A)["items"]], ["My PC", "Old PC"])
        self.assertEqual(self.store.own_device(NEW_A)["device_id"], "e" * 24)
        self.assertEqual(self.store.account_id(NEW_A), self.account)

    def test_link_is_idempotent_and_both_identities_stay_valid(self):
        self.store.link_identity(self.account, NEW_ISSUER, NEW_A.sub)
        again = self.store.link_identity(self.account, NEW_ISSUER, NEW_A.sub)
        self.assertEqual((again["linked"], again["absorbed"]), (False, False))
        self.assertEqual(len(self.store.identities_of(self.account)), 2)
        self.assertEqual(self.store.member_status(self.old_a), "active")

    def test_disabling_after_swap_applies_through_the_new_identity(self):
        self.store.link_identity(self.account, NEW_ISSUER, NEW_A.sub)
        self.store.set_member(NEW_A, "disabled")
        self.assertEqual(self.store.member_status(self.old_a), "disabled")
        with self.assertRaises(HubError):
            self.hub.sessions.validate(self.old_a, "cookie-a")

    def test_admin_and_device_ownership_follow_the_account(self):
        self.assertTrue(self.hub.is_admin(self.old_a))
        self.assertFalse(self.hub.is_admin(NEW_A))
        self.store.link_identity(self.account, NEW_ISSUER, NEW_A.sub)
        self.assertTrue(self.hub.is_admin(NEW_A))
        self.assertTrue(self.hub.mobile_me(NEW_A)["admin"])
        self.assertFalse(self.hub.is_admin(NEW_C))
        # The linked identity may revoke the device it now owns; an unrelated identity may not.
        with self.assertRaises(HubError) as caught:
            self.hub.revoke(NEW_C, "e" * 24)
        self.assertEqual(caught.exception.code, "device_not_found")

    def test_context_scope_is_the_same_for_both_identities(self):
        self.store.link_identity(self.account, NEW_ISSUER, NEW_A.sub)
        scopes = []
        for identity in (self.old_a, NEW_A):
            _, header = self.hub.session(identity, "")
            cookie = re.search(r"__Host-ce_remote=([^;]+)", header).group(1)
            with self.store.transaction() as db:
                db.execute("UPDATE devices SET state='online',last_heartbeat=1000 WHERE device_id=?", ("e" * 24,))
            scopes.append(self.hub.authorize(identity, cookie, method="GET", uri="/studio")["X-CE-Storage-Scope"])
        self.assertEqual(scopes[0], scopes[1])

    def test_link_refuses_merging_two_real_accounts_but_absorbs_a_login_only_one(self):
        self.store.set_member(NEW_C)
        with self.assertRaises(HubError) as caught:
            self.store.link_identity(self.account, NEW_ISSUER, NEW_C.sub)
        self.assertEqual((caught.exception.code, caught.exception.status), ("identity_already_linked", 409))
        # A user who logged in on the new IdP first only has a session row: it is absorbed and signed out.
        self.hub.session(NEW_A, "")
        stray = self.store.account_id(NEW_A)
        self.assertNotEqual(stray, self.account)
        result = self.store.link_identity(self.account, NEW_ISSUER, NEW_A.sub)
        self.assertTrue(result["absorbed"])
        self.assertEqual(self.store.account_id(NEW_A), self.account)
        self.assertEqual(rows(self.path, "SELECT invalidated FROM browser_sessions WHERE account_id=?", (stray,)),
                         [{"invalidated": 1}])

    def test_link_validation(self):
        for args in (("short", NEW_ISSUER, "s"), (self.account, "", "s"), (self.account, NEW_ISSUER, ""), (None, NEW_ISSUER, "s")):
            with self.assertRaises(HubError) as caught:
                self.store.link_identity(*args)
            self.assertEqual(caught.exception.code, "invalid_identity_link")
        with self.assertRaises(HubError) as caught:
            self.store.link_identity("0" * 32, NEW_ISSUER, "s")
        self.assertEqual((caught.exception.code, caught.exception.status), ("account_not_found", 404))

    def test_admin_cli_links_and_lists_without_exposing_ids_in_api_responses(self):
        def run(**values):
            out = io.StringIO()
            fields = dict(action="link-identity", account_id=None, from_issuer=None, from_sub=None, issuer=None, sub=None)
            args = argparse.Namespace(**{**fields, **values})
            self.hub.identities = mock.Mock(issuer=NEW_ISSUER)
            identity_admin(self.hub, args, out)
            return json.loads(out.getvalue())
        linked = run(from_issuer=ISSUER, from_sub="account-a", sub="new-sub-a")
        self.assertEqual((linked["account_id"], linked["issuer"], linked["sub"], linked["linked"]),
                         (self.account, NEW_ISSUER, "new-sub-a", True))
        self.assertFalse(run(account_id=self.account, sub="new-sub-a")["linked"])
        listing = io.StringIO()
        identity_admin(self.hub, argparse.Namespace(action="list-identities"), listing)
        items = json.loads(listing.getvalue())["identities"]
        self.assertIn({"account_id": self.account, "issuer": NEW_ISSUER, "sub": "new-sub-a", "membership": "active"}, items)
        with self.assertRaises(SystemExit):
            run(sub="x")  # neither --account-id nor --from-sub
        with self.assertRaises(SystemExit):
            run(account_id="f" * 32, sub="x")  # unknown account
        # API-visible shapes never carry the internal id.
        self.assertNotIn(self.account, json.dumps(self.hub.mobile_me(NEW_A)))
        self.assertNotIn(self.account, json.dumps(self.hub.session(self.old_a, "")[0]))
        self.assertNotIn(self.account, json.dumps(self.hub.mobile_devices(NEW_A)))


if __name__ == "__main__":
    unittest.main()
