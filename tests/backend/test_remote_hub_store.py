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
