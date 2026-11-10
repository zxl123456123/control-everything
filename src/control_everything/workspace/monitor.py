"""Bounded project monitoring snapshots from existing management facts."""

from control_everything.input_validation import ProfileError
from control_everything.workspace.agent_runs import STAGES, WAIT_KINDS
from control_everything.workspace.store import now_utc
from control_everything.workspace.validation import project_id_valid

SESSION_LIMIT = 10
EVENT_LIMIT = 200


def project_monitor(store, *, project_id=None, offset=0, limit=20, agents=None):
    if not project_id_valid(project_id):
        raise ProfileError("invalid_query", "project_id")
    if type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 100:
        raise ProfileError("invalid_query")
    agents = agents or {}
    with store.connection() as connection:
        connection.execute("BEGIN")
        project = connection.execute("SELECT id,name,archived FROM projects WHERE id=?", (project_id,)).fetchone()
        if project is None:
            raise ProfileError("project_not_found", "project_id", status=404)
        total = connection.execute("SELECT COUNT(*) FROM task_items WHERE project_id=?", (project_id,)).fetchone()[0]
        tasks = connection.execute(
            "SELECT id,origin,title,state,revision,assigned_agent_id,session_key FROM task_items "
            "WHERE project_id=? ORDER BY id LIMIT ? OFFSET ?", (project_id, limit, offset)).fetchall()
        items = []
        for row in tasks:
            task = dict(row)
            session_key = task.pop("session_key")
            claim, execution, binding_state = None, None, "none"
            if task["origin"] == "task":
                current = connection.execute(
                    "SELECT id,agent_id,status,started_at,heartbeat_at,ended_at,dispatch_id FROM agent_runs "
                    "WHERE task_id=? ORDER BY started_at DESC,id DESC LIMIT 1", (task["id"],)).fetchone()
                if current is not None:
                    claim = dict(current)
                    agent = agents.get(claim["agent_id"], {})
                    claim.update(agent_name=agent.get("name"), agent_kind=agent.get("kind"))
                    if claim["dispatch_id"]:
                        dispatch = connection.execute(
                            "SELECT task_id,agent_id,run_id,project_id,delivery_mode,external_ref FROM task_dispatches WHERE id=?",
                            (claim["dispatch_id"],)).fetchone()
                        if (dispatch is None or dispatch["task_id"] != task["id"]
                                or dispatch["agent_id"] != claim["agent_id"] or dispatch["run_id"] != claim["id"]):
                            binding_state = "conflict"
                        elif dispatch["delivery_mode"] == "auto" and dispatch["external_ref"]:
                            linked = connection.execute(
                                "SELECT id,project_id,state,reason,cleanup_state,thread_id,turn_id,updated_at "
                                "FROM execution_runs WHERE id=? AND request_id=? AND task_id=? AND project_id=?",
                                (dispatch["external_ref"], claim["dispatch_id"], task["id"], dispatch["project_id"])).fetchone()
                            binding_state = "linked" if linked is not None else "conflict"
                            execution = dict(linked) if linked is not None else None
            review = connection.execute(
                "SELECT id,run_id,verdict,created_at FROM task_reviews WHERE task_id=? "
                "ORDER BY created_at DESC,id DESC LIMIT 1", (task["id"],)).fetchone()
            session_total = connection.execute(
                "SELECT COUNT(*) FROM task_sessions WHERE task_id=?", (task["id"],)).fetchone()[0]
            sessions = [dict(session, legacy=False) for session in connection.execute(
                "SELECT id,source,source_instance,external_id,agent_id,last_seen_at FROM task_sessions "
                "WHERE task_id=? ORDER BY updated_at DESC,id DESC LIMIT ?", (task["id"], SESSION_LIMIT))]
            if session_key and connection.execute(
                    "SELECT 1 FROM task_sessions WHERE task_id=? AND source='codex' "
                    "AND source_instance='' AND external_id=?", (task["id"], session_key)).fetchone() is None:
                session_total += 1
                if len(sessions) < SESSION_LIMIT:
                    sessions.append({"id": None, "source": "codex", "source_instance": "",
                                     "external_id": session_key, "agent_id": None, "last_seen_at": None, "legacy": True})
            items.append({"task": task, "claim": claim, "execution": execution,
                          "latest_review": dict(review) if review is not None else None,
                          "binding_state": binding_state,
                          "sessions": {"items": sessions, "total": session_total, "limit": SESSION_LIMIT,
                                       "has_more": session_total > len(sessions)}})

        events, event_total = [], 0
        if tasks:
            task_ids = [task["id"] for task in tasks]
            placeholders = ",".join("?" for _ in task_ids)
            event_total = connection.execute(
                f"SELECT COUNT(*) FROM task_events WHERE task_id IN ({placeholders})", task_ids).fetchone()[0]
            rows = connection.execute(
                "SELECT ev.id,ev.task_id,ev.run_id,ev.kind,ev.created_at,"
                "json_extract(ev.payload_json,'$.source') AS source,"
                "json_extract(ev.payload_json,'$.stage') AS stage,"
                "json_extract(ev.payload_json,'$.wait_kind') AS wait_kind,"
                "EXISTS(SELECT 1 FROM agent_runs ar JOIN task_dispatches d ON d.id=ar.dispatch_id "
                "JOIN execution_runs ex ON ex.id=d.external_ref AND ex.request_id=d.id "
                "WHERE ar.id=ev.run_id AND ar.task_id=ev.task_id AND d.task_id=ev.task_id "
                "AND d.run_id=ar.id AND d.agent_id=ar.agent_id AND d.delivery_mode='auto' "
                "AND ex.task_id=ev.task_id AND ex.project_id=d.project_id) AS controlled "
                f"FROM task_events ev WHERE ev.task_id IN ({placeholders}) "
                "ORDER BY ev.created_at DESC,ev.id DESC LIMIT ?", (*task_ids, EVENT_LIMIT)).fetchall()
            for row in reversed(rows):
                event = {key: row[key] for key in ("id", "task_id", "run_id", "kind", "created_at")}
                event["source"] = ("human_review" if row["kind"] in ("completed", "changes_requested")
                                   else "execution_bridge" if row["source"] == "execution_bridge" and row["controlled"]
                                   else "agent_reported" if row["run_id"] else "workspace")
                if row["stage"] in STAGES:
                    event["stage"] = row["stage"]
                if row["wait_kind"] in WAIT_KINDS:
                    event["wait_kind"] = row["wait_kind"]
                events.append(event)
        return {"project": {"id": project["id"], "name": project["name"], "archived": bool(project["archived"])},
                "sampled_at": now_utc(), "items": items,
                "pagination": {"offset": offset, "limit": limit, "total": total, "has_more": offset + len(items) < total},
                "events": events,
                "events_page": {"total": event_total, "limit": EVENT_LIMIT,
                                "has_more": event_total > len(events), "scope": "page_tasks"},
                "coverage": {"business": "available", "structured_runtime": "unavailable"}}
