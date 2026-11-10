"""Dedicated temporary SQLite tests including atomic invitation use."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import unittest

from control_everything.integrations.remote_hub.identity import HubError
from control_everything.integrations.remote_hub.store import RemoteHubStore
from .test_remote_hub_support import A, B, bind, service


class RemoteHubStoreTests(unittest.TestCase):
    def test_expired_invite_does_not_create_membership(self):
        with tempfile.TemporaryDirectory() as directory:
            now = [1000]
            store = RemoteHubStore(Path(directory) / "hub.db", clock=lambda: now[0])
            invitation = store.create_invitation()
            now[0] += 86400
            with self.assertRaises(HubError) as caught:
                store.activate(A, invitation)
            self.assertEqual(caught.exception.code, "invalid_invitation")
            with store.transaction() as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM members").fetchone()[0], 0)

    def test_invitation_is_consumed_once_under_concurrency(self):
        with tempfile.TemporaryDirectory() as directory:
            store = RemoteHubStore(Path(directory) / "hub.db")
            invitation = store.create_invitation()
            def run(identity):
                try:
                    store.activate(identity, invitation)
                    return "active"
                except HubError as error:
                    return error.code
            with ThreadPoolExecutor(2) as pool:
                results = list(pool.map(run, (A, B)))
            self.assertCountEqual(results, ["active", "invalid_invitation"])

    def test_revoking_survives_restart_without_releasing_ports(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "hub.db"
            hub = service(path)
            result = bind(hub)
            hub.store.mark_revoking(result["device_id"])
            reopened = RemoteHubStore(path)
            device = reopened.revoking_devices()[0]
            self.assertEqual(device["device_id"], result["device_id"])
            self.assertEqual(device["http_port"], result["config"]["remote_http_port"])
            self.assertIsNone(device["control_token_hash"])

    def test_disabled_member_cannot_reactivate_and_invite_is_not_consumed(self):
        with tempfile.TemporaryDirectory() as directory:
            store = RemoteHubStore(Path(directory) / "hub.db")
            store.set_member(A, "disabled")
            invitation = store.create_invitation()
            with self.assertRaises(HubError) as caught:
                store.activate(A, invitation)
            self.assertEqual((caught.exception.code, caught.exception.status), ("member_disabled", 403))
            self.assertEqual(store.member_status(A), "disabled")
            store.activate(B, invitation)  # the rolled-back invite is still usable by someone else
            self.assertEqual(store.member_status(B), "active")

    def test_activate_still_creates_and_keeps_active_members(self):
        with tempfile.TemporaryDirectory() as directory:
            store = RemoteHubStore(Path(directory) / "hub.db")
            self.assertEqual(store.member_status(A), "inactive")
            store.activate(A, store.create_invitation())
            self.assertEqual(store.member_status(A), "active")

    def open_session(self, store, identity, name):
        with store.transaction() as db:
            account = store.ensure_account_row(db, identity.issuer, identity.sub)
            db.execute("INSERT INTO browser_sessions(session_hash,account_id,sid,csrf,expires,invalidated) VALUES(?,?,?,?,?,0)",
                       (name, account, "sid", "csrf", store.clock() + 1800))

    def invalidated(self, store):
        with store.transaction() as db:
            return {row[0]: row[1] for row in db.execute("SELECT session_hash,invalidated FROM browser_sessions")}

    def test_batch_invalidation_touches_only_that_member_and_disable_triggers_it(self):
        with tempfile.TemporaryDirectory() as directory:
            store = RemoteHubStore(Path(directory) / "hub.db")
            store.set_member(A)
            store.set_member(B)
            for name, who in (("a1", A), ("a2", A), ("b1", B)):
                self.open_session(store, who, name)
            self.assertEqual(store.invalidate_sessions(A.issuer, A.sub), 2)
            self.assertEqual(self.invalidated(store), {"a1": 1, "a2": 1, "b1": 0})
            self.assertEqual(store.invalidate_sessions(A.issuer, A.sub), 0)
            store.set_member(B, "disabled")
            self.assertEqual(self.invalidated(store)["b1"], 1)

    def test_mark_logout_stamps_member_without_creating_one(self):
        with tempfile.TemporaryDirectory() as directory:
            now = [1000]
            store = RemoteHubStore(Path(directory) / "hub.db", clock=lambda: now[0])
            store.set_member(A)
            self.open_session(store, A, "a1")
            now[0] = 1500
            self.assertEqual(store.mark_logout(A), 1)
            self.assertEqual(store.mark_logout(B), 0)
            with store.transaction() as db:
                rows = {row[0]: row[1] for row in db.execute(
                    "SELECT i.sub,m.last_logout_at FROM members m JOIN identities i ON i.account_id=m.account_id")}
            self.assertEqual(rows, {A.sub: 1500})

    def test_newer_schema_is_refused_and_fresh_database_is_latest(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "hub.db"
            store = RemoteHubStore(path)
            with store.transaction() as db:
                self.assertEqual(db.execute("SELECT version FROM schema_version").fetchone()[0], 3)
                db.execute("UPDATE schema_version SET version=4")
            with self.assertRaises(ValueError):
                RemoteHubStore(path)
            self.assertFalse(Path(str(path) + ".pre-account-id").exists())
