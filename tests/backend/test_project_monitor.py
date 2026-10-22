"""Project monitor contracts over temporary profiles and socket-free handlers."""

import json
import sqlite3
import unittest
from contextlib import contextmanager
from unittest.mock import patch
from uuid import uuid4

from control_everything.input_validation import ProfileError
from control_everything.workspace import monitor
from tests.backend import test_profile_http as fixtures
from tests.backend.test_project_management import project_body


class ProjectMonitorTests(unittest.TestCase):
    request = fixtures.ProfileHTTPTests.request

    def setUp(self):
        fixtures.ProfileHTTPTests.setUp(self)
        self.store = self.profile.store
        self.project = self.store.save_project(project_body(self.root / "one"))
        self.other = self.store.save_project(project_body(self.root / "two"))
        self.agent_id = str(uuid4())

    def item(self, project=None, **fields):
        return self.store.save_item({"title": "Fixture", "project_id": project or self.project["id"],
                                     "provider_id": None, "state": "doing", "session_key": None,
                                     "assigned_agent_id": self.agent_id, **fields})

    def controlled(self, item, *, agent_id=None, stamp="2026-10-23T01:00:00+00:00", state="running"):
        run_id, dispatch_id, execution_id = (str(uuid4()) for _ in range(3))
        agent_id = agent_id or self.agent_id
        with self.store.connection() as connection:
            connection.execute(
                "INSERT INTO agent_runs(id,task_id,agent_id,status,started_at,heartbeat_at,summary,evidence_json,dispatch_id) "
                "VALUES(?,?,?,'running',?,?,'private-result','[\"private-evidence\"]',?)",
                (run_id, item["id"], agent_id, stamp, stamp, dispatch_id))
            connection.execute(
                "INSERT INTO task_dispatches(id,task_id,agent_id,project_id,directory_path,brief_json,brief_sha256,"
                "content_text,delivery_mode,delivery_state,external_ref,run_id,created_at,updated_at) "
                "VALUES(?,?,?,?,'private-path','{}','fixture','private-brief','auto','delivered',?,?,?,?)",
                (dispatch_id, item["id"], agent_id, item["project_id"], execution_id, run_id, stamp, stamp))
            connection.execute(
                "INSERT INTO execution_runs(id,request_id,request_hash,owner_id,task_id,task_title,project_id,project_name,"
                "cwd,root_identity,mode,prompt,state,cleanup_state,created_at,updated_at) "
                "VALUES(?,?,'fixture','fixture',?,'Fixture',?,'Fixture','private-path','fixture','workspace-write',"
                "'private-prompt',?,'verified',?,?)",
                (execution_id, dispatch_id, item["id"], item["project_id"], state, stamp, stamp))
        return run_id, dispatch_id, execution_id

    def snapshot(self, **params):
        return self.workspace.project_monitor(project_id=self.project["id"], **params)

    def test_project_filter_precedes_count_and_stable_pagination(self):
        first, second = self.item(), self.item()
        self.item(self.other["id"])
        self.store.save_item({"title": "Global", "project_id": None, "provider_id": None,
                              "state": "todo", "session_key": None})
        page = self.snapshot(limit=1)
        next_page = self.snapshot(offset=1, limit=1)
        expected = sorted([first["id"], second["id"]])
        self.assertEqual([page["items"][0]["task"]["id"], next_page["items"][0]["task"]["id"]], expected)
        self.assertEqual(page["pagination"], {"offset": 0, "limit": 1, "total": 2, "has_more": True})
        self.assertFalse(next_page["pagination"]["has_more"])
        self.assertEqual(self.snapshot(offset=10)["items"], [])
        self.assertEqual(self.snapshot(offset=10)["events_page"]["total"], 0)
        self.assertEqual(page["coverage"], {"business": "available", "structured_runtime": "unavailable"})

    def test_latest_claim_identity_public_names_and_todo(self):
        self.profile.save_agents({"expected_revision": 0, "items": [
            {"id": None, "name": "Same name", "kind": "codex", "command": "fixture", "enabled": True},
            {"id": None, "name": "Same name", "kind": "codex", "command": "fixture", "enabled": True}]})
        agents = self.profile.agent_settings()["items"]
        first, second = self.item(), self.item()
        old, _, _ = self.controlled(first, agent_id=agents[0]["id"])
        with self.store.connection() as connection:
            connection.execute("UPDATE agent_runs SET status='completed' WHERE id=?", (old,))
        latest, _, execution = self.controlled(first, agent_id=agents[0]["id"], stamp="2026-10-23T02:00:00+00:00")
        other_claim, _, _ = self.controlled(second, agent_id=agents[1]["id"])
        with self.store.connection() as connection:
            todo = self.store._create_item(connection, {"title": "Todo", "project_id": self.project["id"],
                "provider_id": None, "state": "todo", "session_key": None}, origin="todo")
        items = {row["task"]["id"]: row for row in self.snapshot()["items"]}
        self.assertEqual(items[first["id"]]["claim"]["id"], latest)
        self.assertEqual(items[first["id"]]["execution"]["id"], execution)
        self.assertEqual(items[second["id"]]["claim"]["id"], other_claim)
        self.assertEqual(items[first["id"]]["claim"]["agent_name"], "Same name")
        self.assertEqual(items[second["id"]]["claim"]["agent_kind"], "codex")
        self.assertIsNone(items[todo["id"]]["claim"])
        self.assertIsNone(items[todo["id"]]["execution"])

    def test_binding_mismatches_never_attach_an_execution(self):
        item, other = self.item(), self.item()
        run_id, dispatch_id, execution_id = self.controlled(item)
        other_run, _, _ = self.controlled(other)
        cases = [("task_dispatches", "task_id", other["id"], item["id"], dispatch_id),
                 ("task_dispatches", "agent_id", "wrong", self.agent_id, dispatch_id),
                 ("task_dispatches", "run_id", other_run, run_id, dispatch_id),
                 ("task_dispatches", "external_ref", "missing", execution_id, dispatch_id),
                 ("task_dispatches", "project_id", self.other["id"], self.project["id"], dispatch_id),
                 ("execution_runs", "request_id", str(uuid4()), dispatch_id, execution_id),
                 ("execution_runs", "task_id", other["id"], item["id"], execution_id),
                 ("execution_runs", "project_id", self.other["id"], self.project["id"], execution_id),
                 ("agent_runs", "dispatch_id", "missing", dispatch_id, run_id)]
        for table, field, bad, good, identity in cases:
            with self.subTest(table=table, field=field):
                with self.store.connection() as connection:
                    connection.execute(f"UPDATE {table} SET {field}=? WHERE id=?", (bad, identity))
                result = next(row for row in self.snapshot()["items"] if row["task"]["id"] == item["id"])
                self.assertEqual(result["binding_state"], "conflict")
                self.assertEqual(result["claim"]["id"], run_id)
                self.assertIsNone(result["execution"])
                with self.store.connection() as connection:
                    connection.execute(f"UPDATE {table} SET {field}=? WHERE id=?", (good, identity))
        result = next(row for row in self.snapshot()["items"] if row["task"]["id"] == item["id"])
        self.assertEqual(result["binding_state"], "linked")

    def test_old_execution_is_readable_and_keeps_original_project_after_task_move(self):
        item = self.item(state="review")
        run_id, _, execution_id = self.controlled(item, state="completed")
        with self.store.connection() as connection:
            connection.execute("UPDATE agent_runs SET status='waiting_review' WHERE id=?", (run_id,))
            connection.execute("UPDATE task_items SET project_id=? WHERE id=?", (self.other["id"], item["id"]))
            for _ in range(55):
                connection.execute(
                    "INSERT INTO execution_runs(id,request_id,request_hash,owner_id,task_id,task_title,project_id,project_name,"
                    "cwd,root_identity,mode,prompt,state,cleanup_state,created_at,updated_at) "
                    "SELECT ?,?,'fixture',owner_id,task_id,task_title,project_id,project_name,cwd,root_identity,mode,prompt,"
                    "state,cleanup_state,'2026-10-23T03:00:00+00:00',updated_at FROM execution_runs WHERE id=?",
                    (str(uuid4()), str(uuid4()), execution_id))
        self.assertEqual(self.snapshot()["pagination"]["total"], 0)
        row = self.workspace.project_monitor(project_id=self.other["id"])["items"][0]
        self.assertEqual(row["execution"]["id"], execution_id)
        self.assertEqual(row["execution"]["project_id"], self.project["id"])
        self.assertEqual((row["task"]["state"], row["claim"]["status"], row["execution"]["state"]),
                         ("review", "waiting_review", "completed"))

    def test_sessions_are_bounded_instance_metadata_with_legacy_coverage(self):
        item = self.item()
        with self.store.connection() as connection:
            connection.execute("UPDATE task_items SET session_key='codex:legacy' WHERE id=?", (item["id"],))
            for index in range(13):
                connection.execute(
                    "INSERT INTO task_sessions(id,task_id,project_id,source,source_instance,external_id,title,url,created_at,updated_at) "
                    "VALUES(?,?,?,'codex',?,'same-external','private-title','https://fixture.invalid/','fixture',?)",
                    (str(uuid4()), item["id"], self.other["id"], str(index), f"{index:02}"))
        sessions = self.snapshot()["items"][0]["sessions"]
        self.assertEqual((len(sessions["items"]), sessions["total"], sessions["limit"], sessions["has_more"]), (10, 14, 10, True))
        self.assertEqual(len({row["source_instance"] for row in sessions["items"]}), 10)
        self.assertEqual(self.workspace.project_monitor(project_id=self.other["id"])["items"], [])
        with self.store.connection() as connection:
            connection.execute("DELETE FROM task_sessions WHERE task_id=?", (item["id"],))
        sessions = self.snapshot()["items"][0]["sessions"]
        self.assertTrue(sessions["items"][0]["legacy"])
        self.assertIsNone(sessions["items"][0]["id"])
        self.assertEqual((sessions["total"], sessions["has_more"]), (1, False))

    def test_recent_events_only_cover_current_page_and_strip_text(self):
        first, second = sorted([self.item(), self.item()], key=lambda row: row["id"])
        run_id, _, _ = self.controlled(first)
        with self.store.connection() as connection:
            for index in range(205):
                payload = {"source": "untrusted-marker", "stage": "testing", "wait_kind": "not-a-kind", "message": "private-message"}
                connection.execute("INSERT INTO task_events(id,task_id,run_id,kind,payload_json,created_at) VALUES(?,?,?,'progress',?,?)",
                                   (str(uuid4()), first["id"], run_id, json.dumps(payload), f"2026-10-23T01:{index:03}"))
            connection.execute("INSERT INTO task_events(id,task_id,kind,payload_json,created_at) VALUES(?,?,'assigned','{}','later')",
                               (str(uuid4()), second["id"]))
        page = self.snapshot(limit=1)
        self.assertEqual(page["events_page"], {"total": 205, "limit": 200, "has_more": True, "scope": "page_tasks"})
        self.assertEqual(len(page["events"]), 200)
        self.assertEqual({event["task_id"] for event in page["events"]}, {first["id"]})
        self.assertTrue(all(event["source"] == "agent_reported" and event["stage"] == "testing" for event in page["events"]))
        self.assertTrue(all("wait_kind" not in event for event in page["events"]))
        self.assertNotIn("private", json.dumps(page))
        self.assertEqual(self.snapshot(offset=1, limit=1)["events"][0]["source"], "workspace")

    def test_snapshot_has_no_business_writes_or_source_path_reads(self):
        item = self.item()
        run_id, _, _ = self.controlled(item)
        with self.store.connection() as connection:
            connection.execute("INSERT INTO task_reviews(id,task_id,run_id,verdict,reason,evidence_json,created_at) "
                               "VALUES(?,?,?,'approved','private-reason','[\"private-file\"]','fixture')",
                               (str(uuid4()), item["id"], run_id))
        original = self.store.connection
        writes = []

        @contextmanager
        def readonly_connection():
            with original() as connection:
                def authorize(action, table, column, _database, _source):
                    if action in (sqlite3.SQLITE_INSERT, sqlite3.SQLITE_UPDATE, sqlite3.SQLITE_DELETE):
                        writes.append((action, table))
                        return sqlite3.SQLITE_DENY
                    if action == sqlite3.SQLITE_READ and column in {"prompt", "summary", "evidence_json", "reason", "content_text", "directory_path"}:
                        if not (table == "execution_runs" and column == "reason"):
                            return sqlite3.SQLITE_DENY
                    return sqlite3.SQLITE_OK
                connection.set_authorizer(authorize)
                yield connection
                self.assertEqual(connection.total_changes, 0)

        with patch.object(self.store, "connection", readonly_connection), \
                patch.object(self.workspace, "sessions", side_effect=AssertionError("no source discovery")), \
                patch("pathlib.Path.is_file", side_effect=AssertionError("no evidence file reads")):
            snapshot = self.snapshot()
        self.assertEqual(writes, [])
        self.assertEqual(snapshot["items"][0]["latest_review"]["verdict"], "approved")
        self.assertNotIn("private", json.dumps(snapshot))

    def test_manual_claim_events_remain_self_reported_and_unbound(self):
        item = self.item()
        run_id, event_id = str(uuid4()), str(uuid4())
        with self.store.connection() as connection:
            connection.execute("INSERT INTO agent_runs(id,task_id,agent_id,status,started_at,heartbeat_at) "
                               "VALUES(?,?,?,'running','fixture','fixture')", (run_id, item["id"], self.agent_id))
            payload = json.dumps({"stage": "waiting_user", "wait_kind": "user_input", "source": "private-marker"})
            connection.execute("INSERT INTO task_events(id,task_id,run_id,kind,payload_json,created_at) "
                               "VALUES(?,?,?,'progress',?,'fixture')", (event_id, item["id"], run_id, payload))
        snapshot = self.snapshot()
        self.assertEqual(snapshot["items"][0]["binding_state"], "none")
        self.assertIsNone(snapshot["items"][0]["execution"])
        self.assertIsNone(snapshot["items"][0]["claim"]["agent_name"])
        self.assertEqual(snapshot["events"][0], {"id": event_id, "task_id": item["id"], "run_id": run_id,
            "kind": "progress", "created_at": "fixture", "source": "agent_reported",
            "stage": "waiting_user", "wait_kind": "user_input"})

    def test_bridge_marker_requires_valid_binding_and_human_reviews_keep_their_source(self):
        for verdict in ("approved", "changes_requested"):
            with self.subTest(verdict=verdict):
                item = self.item(state="review")
                run_id, dispatch_id, execution_id = self.controlled(item, state="completed")
                event_id = str(uuid4())
                payload = json.dumps({"source": "execution_bridge", "dispatch_id": dispatch_id,
                                      "execution_run_id": execution_id})
                with self.store.connection() as connection:
                    connection.execute("UPDATE agent_runs SET status='waiting_review' WHERE id=?", (run_id,))
                    connection.execute("INSERT INTO task_events(id,task_id,run_id,kind,payload_json,created_at) "
                                       "VALUES(?,?,?,'claimed',?,'2026-10-23T00:00:00+00:00')",
                                       (event_id, item["id"], run_id, payload))
                self.workspace.save_review({"task_id": item["id"], "expected_revision": item["revision"],
                    "verdict": verdict, "reason": "Fixture human review", "evidence": [], "confirmed": True})
                events = [event for event in self.snapshot()["events"] if event["task_id"] == item["id"]]
                claimed = next(event for event in events if event["id"] == event_id)
                reviewed = next(event for event in events if event["id"] != event_id)
                self.assertEqual(claimed["source"], "execution_bridge")
                self.assertEqual(reviewed["source"], "human_review")
                self.assertEqual(reviewed["kind"], "completed" if verdict == "approved" else "changes_requested")
                with self.store.connection() as connection:
                    connection.execute("UPDATE execution_runs SET project_id=? WHERE id=?", (self.other["id"], execution_id))
                events = [event for event in self.snapshot()["events"] if event["task_id"] == item["id"]]
                self.assertEqual(next(event for event in events if event["id"] == event_id)["source"], "agent_reported")
                self.assertEqual(next(event for event in events if event["id"] != event_id)["source"], "human_review")

    def test_http_exact_query_validation_security_and_profile_boundary(self):
        route = "/api/workspace/monitor"
        query = "?project_id=" + self.project["id"]
        self.assertEqual(self.request(route + query)[0], 200)
        for suffix in ("", "?project_id=", query + "&limit=0", query + "&limit=101", query + "&offset=-1",
                       query + "&limit=1&limit=2", query + "&unknown=x", query + "&project_id=other"):
            with self.subTest(suffix=suffix):
                self.assertEqual(self.request(route + suffix)[0], 422)
        self.assertEqual(self.request(route + "?project_id=missing")[0], 404)
        for headers in ({"Host": "bad"}, {"Origin": "https://bad.invalid"}, {"X-Session-Client": ""}):
            self.assertEqual(self.request(route + query, headers=headers)[0], 403)
        self.assertEqual(self.request(route + query, "POST", {})[0], 404)
        self.server.profile = None
        self.assertEqual(self.request(route + query)[0], 404)
        with self.assertRaises(ProfileError):
            monitor.project_monitor(self.store, project_id=self.project["id"], limit=True)


if __name__ == "__main__":
    unittest.main()
