"""In-memory ownership of explicitly launched native creator processes."""

import copy
from pathlib import Path
import subprocess
import threading
import time
from uuid import uuid4


class CreatorProcesses:
    def __init__(self, *, spawn=None, wait=None):
        self._spawn = spawn or subprocess.Popen
        self._wait = wait or (lambda process, timeout: process.wait(timeout=timeout))
        self._lock = threading.RLock()
        self._operations = {action: None for action in ("edit", "play", "check")}
        self._closed = False

    @staticmethod
    def _active(record):
        return bool(record and (record["working"] or any(child["process"].poll() is None for child in record["children"])))

    def start(self, action, project_id, prepare, execute):
        if action not in self._operations:
            raise ValueError("invalid_action")
        with self._lock:
            if self._closed:
                raise ValueError("service_closed")
            if self._active(self._operations[action]):
                raise ValueError("action_busy")
            if any(self._active(record) and record["public"]["project_id"] == project_id
                   for record in self._operations.values()):
                raise ValueError("project_busy")
            run_id = uuid4().hex
            job = prepare(action, project_id, run_id)
            public = {"run_id": run_id, "project_id": project_id, "action": action, "state": "starting", "pid": None,
                      "exit_code": None, "verified": None, "reason": "", "result": None}
            record = {"public": public, "job": job, "children": [], "working": True,
                      "spec": None}
            self._operations[action] = record
            thread = threading.Thread(target=self._run, args=(record, execute),
                                      name="creator-" + action, daemon=True)
            record["thread"] = thread
            thread.start()
        return {"run_id": run_id, "state": "starting"}

    def _run(self, record, execute):
        try:
            outcome = execute(record["job"], lambda spec: self._launch(record, spec))
            with self._lock:
                record["public"].update(outcome)
        except Exception:
            with self._lock:
                record["public"].update(state="failed", reason="operation_failed",
                                        verified=False if record["public"]["action"] == "check" else None)
        finally:
            with self._lock:
                record["working"] = False

    def _launch(self, record, spec):
        with self._lock:
            record["spec"] = spec
            record["public"].update(state="starting", pid=None, exit_code=None)
            if self._closed:
                return {"exit_code": None, "reason": "service_closed"}
            try:
                # Keep stdio separate from Godot's own --log-file handle.
                with (Path(spec["run_dir"]) / "process.log").open("ab") as log:
                    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if spec["headless"] else 0
                    process = self._spawn(list(spec["argv"]), cwd=spec["cwd"], shell=False,
                                          stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                          creationflags=flags, close_fds=True)
            except OSError:
                return {"exit_code": None, "reason": "spawn_failed"}
            child = {"process": process, "started_at": time.time(), "exited_at": None,
                     "exit_code": None, "run_id": spec["run_id"], "run_dir": str(spec["run_dir"])}
            record["children"].append(child)
            record["public"].update(state="running", pid=process.pid)
        try:
            code = self._wait(process, spec["timeout"])
        except subprocess.TimeoutExpired:
            # Keep the handle and block reuse; timeout never means cleanup or save.
            return {"exit_code": None, "reason": "process_timeout"}
        except OSError:
            return {"exit_code": None, "reason": "process_wait_failed"}
        with self._lock:
            child["exited_at"] = time.time()
            child["exit_code"] = code
            record["public"]["exit_code"] = code
        return {"exit_code": code, "reason": ""}

    def snapshot(self):
        with self._lock:
            operations = {}
            capabilities = {"create": not self._closed}
            busy = []
            for action, record in self._operations.items():
                active = self._active(record)
                if active:
                    busy.append(record["public"]["project_id"])
                capabilities[action] = not self._closed and not active
                if record and not record["working"] and record["children"]:
                    child = record["children"][-1]
                    code = child["process"].poll()
                    if code is not None and child["exited_at"] is None:
                        child.update(exit_code=code, exited_at=time.time())
                        record["public"]["exit_code"] = code
                value = copy.deepcopy(record["public"]) if record else None
                if record and record["working"]:
                    value["exit_code"] = None
                operations[action] = value
            return {"operations": operations, "capabilities": capabilities, "busy_project_ids": sorted(set(busy))}

    def close(self):
        with self._lock:
            self._closed = True
            return [{"run_id": record["public"]["run_id"], "action": action,
                     "project_id": record["public"]["project_id"],
                     "pid": child["process"].pid, "evidence_path": child["run_dir"]}
                    for action, record in self._operations.items() if record
                    for child in record["children"] if child["process"].poll() is None]
