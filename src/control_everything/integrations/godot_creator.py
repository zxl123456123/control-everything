"""Managed blank Godot projects and fixed native editor/import commands."""

from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
import threading
import unicodedata
from uuid import uuid4

from control_everything.paths import source_root


PROJECT_ID = re.compile(r"[0-9a-f]{32}\Z")
MAX_TEXT_BYTES = 16 * 1024
MAX_LOG_BYTES = 1024 * 1024
MAX_FILES = 200
MAX_SCAN_ENTRIES = 2000


def strict_json(data):
    def pairs(rows):
        value = {}
        for key, item in rows:
            if key in value:
                raise ValueError("duplicate_json_key")
            value[key] = item
        return value

    def invalid_constant(_value):
        raise ValueError("invalid_json_number")

    def finite_number(value):
        number = float(value)
        if not math.isfinite(number):
            raise ValueError("invalid_json_number")
        return number

    return json.loads(data, object_pairs_hook=pairs, parse_constant=invalid_constant, parse_float=finite_number)


def atomic_json(path, value):
    atomic_text(path, json.dumps(value, ensure_ascii=False, allow_nan=False) + "\n")


def atomic_text(path, text):
    temporary = owned_path(path.parent, path.name + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as stream:
        stream.write(text)
    os.replace(temporary, path)


def owned_path(root, *parts):
    path = root.joinpath(*parts)
    current = root
    for part in parts:
        current = current / part
        if current.is_symlink() or current.is_junction():
            raise ValueError("project_path_invalid")
    if not path.resolve().is_relative_to(root):
        raise ValueError("project_path_invalid")
    return path


def read_text(path, limit):
    with path.open("rb") as stream:
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise ValueError("file_too_large")
    return data.decode("utf-8", errors="strict")


def valid_name(value):
    return (type(value) is str and 1 <= len(value) <= 80 and bool(value.strip())
            and not any(unicodedata.category(char) in {"Cc", "Cs"} for char in value))


class GodotLibrary:
    def __init__(self, engine, library):
        checkout = source_root()
        if checkout is None:
            raise ValueError("source_checkout_required")
        checkout = checkout.resolve(strict=True)
        self.engine = Path(engine).resolve(strict=True)
        self.root = Path(library).resolve(strict=True)
        work = (checkout / "work").resolve()
        if not self.engine.is_file() or self.engine.suffix.lower() != ".exe":
            raise ValueError("invalid_engine")
        if (not self.root.is_dir() or checkout.is_relative_to(self.root) or self.engine.is_relative_to(self.root)
                or (self.root.is_relative_to(checkout) and (self.root == work or not self.root.is_relative_to(work)))):
            raise ValueError("invalid_library")
        self._lock = threading.RLock()

    def project(self, project_id):
        if type(project_id) is not str or not PROJECT_ID.fullmatch(project_id):
            raise ValueError("invalid_project_id")
        base = owned_path(self.root, project_id)
        if not base.exists():
            raise ValueError("project_not_found")
        if not base.is_dir():
            raise ValueError("project_metadata_invalid")
        try:
            metadata = strict_json(read_text(owned_path(base, "project.json"), MAX_TEXT_BYTES))
        except (OSError, ValueError, UnicodeError, RecursionError):
            raise ValueError("project_metadata_invalid") from None
        if (type(metadata) is not dict or set(metadata) != {"version", "id", "name", "kind"}
                or type(metadata["version"]) is not int or metadata["version"] != 1
                or metadata["id"] != project_id or not valid_name(metadata["name"])
                or type(metadata["kind"]) is not str or metadata["kind"] not in {"2d", "3d"}):
            raise ValueError("project_metadata_invalid")
        source = owned_path(base, "project")
        if not source.is_dir() or not owned_path(source, "project.godot").is_file():
            raise ValueError("project_source_missing")
        return {"id": project_id, "name": metadata["name"], "kind": metadata["kind"],
                "project_path": str(source), "user_data_key": "ControlEverythingCreator/" + project_id}

    def projects(self):
        with self._lock:
            try:
                with os.scandir(self.root) as entries:
                    ids = sorted(entry.name for entry in entries if PROJECT_ID.fullmatch(entry.name))
                return [self.project(project_id) for project_id in ids]
            except (OSError, ValueError, UnicodeError):
                raise ValueError("library_scan_failed") from None

    def create(self, name, kind):
        if not valid_name(name) or type(kind) is not str or kind not in {"2d", "3d"}:
            raise ValueError("invalid_project")
        with self._lock:
            project_id = uuid4().hex
            base = owned_path(self.root, project_id)
            base.mkdir()
            source = base / "project"
            source.mkdir()
            renderer = "gl_compatibility" if kind == "2d" else "forward_plus"
            config = ('; Blank project created by the local creator.\nconfig_version=5\n\n[application]\n'
                      + 'config/name=' + json.dumps(name, ensure_ascii=False) + '\n'
                      + 'run/main_scene="res://main.tscn"\nconfig/use_custom_user_dir=true\n'
                      + 'config/custom_user_dir_name="ControlEverythingCreator/' + project_id + '"\n'
                      + '\n[rendering]\nrenderer/rendering_method="' + renderer + '"\n')
            (source / "project.godot").write_text(config, encoding="utf-8", newline="\n")
            (source / "main.tscn").write_text('[gd_scene format=3]\n\n[node name="Main" type="'
                                             + ("Node2D" if kind == "2d" else "Node3D") + '"]\n',
                                             encoding="utf-8", newline="\n")
            (base / "brief.md").write_text("", encoding="utf-8")
            # The final marker makes a fully written project visible to the library.
            atomic_json(base / "project.json", {"version": 1, "id": project_id, "name": name, "kind": kind})
            return self.project(project_id)

    def detail(self, project_id):
        with self._lock:
            project = self.project(project_id)
            base = owned_path(self.root, project_id)
            brief = read_text(owned_path(base, "brief.md"), MAX_TEXT_BYTES)
            files, truncated = self._files(Path(project["project_path"]))
            return {"project": project, "files": files, "files_truncated": truncated, "brief": brief}

    @staticmethod
    def _files(source):
        files, pending, visited = [], [source], 0
        while pending:
            directory = pending.pop()
            if directory.is_symlink() or directory.is_junction() or not directory.resolve().is_relative_to(source):
                raise ValueError("project_path_invalid")
            with os.scandir(directory) as entries:
                for entry in entries:
                    visited += 1
                    if visited > MAX_SCAN_ENTRIES:
                        return sorted(files, key=lambda item: item["path"]), True
                    path = Path(entry.path)
                    if entry.is_symlink() or path.is_junction():
                        if not path.resolve().is_relative_to(source):
                            raise ValueError("project_path_invalid")
                        continue
                    if not path.resolve().is_relative_to(source):
                        raise ValueError("project_path_invalid")
                    if entry.is_dir(follow_symlinks=False):
                        if not entry.name.startswith("."):
                            pending.append(path)
                    elif entry.is_file(follow_symlinks=False):
                        if len(files) >= MAX_FILES:
                            return sorted(files, key=lambda item: item["path"]), True
                        suffix = path.suffix.lower()
                        kind = ("scene" if suffix in {".tscn", ".scn"} else "script" if suffix in {".gd", ".cs"}
                                else "material" if suffix in {".material", ".gdshader"} else "resource")
                        files.append({"path": path.relative_to(source).as_posix(), "kind": kind})
        return sorted(files, key=lambda item: item["path"]), False

    def save_brief(self, project_id, text):
        if type(text) is not str or len(text) > 4000:
            raise ValueError("invalid_brief")
        try:
            if len(text.encode("utf-8")) > MAX_TEXT_BYTES:
                raise ValueError("invalid_brief")
        except UnicodeError:
            raise ValueError("invalid_brief") from None
        with self._lock:
            self.project(project_id)
            base = owned_path(self.root, project_id)
            atomic_text(owned_path(base, "brief.md"), text)
        return {"project_id": project_id, "saved": True}

    def prepare(self, action, project_id, run_id):
        if action not in {"edit", "play", "check"} or not PROJECT_ID.fullmatch(run_id):
            raise ValueError("invalid_action")
        with self._lock:
            project = self.project(project_id)
            base = owned_path(self.root, project_id)
            runs = owned_path(base, "runs")
            runs.mkdir(exist_ok=True)
            run_dir = owned_path(runs, run_id)
            run_dir.mkdir()
        return {"action": action, "project_id": project_id, "run_id": run_id,
                "run_dir": run_dir, "project_path": project["project_path"]}

    def command(self, job):
        argv = [str(self.engine)]
        if job["action"] == "edit":
            argv.append("--editor")
        elif job["action"] == "check":
            argv += ["--headless", "--editor", "--import"]
        argv += ["--path", job["project_path"], "--log-file", str(job["run_dir"] / "engine.log")]
        spec = {"argv": argv, "cwd": job["project_path"], "run_dir": job["run_dir"], "run_id": job["run_id"],
                "project_id": job["project_id"], "headless": job["action"] == "check",
                "timeout": 180 if job["action"] == "check" else None}
        atomic_json(job["run_dir"] / "launch.json", {"version": 2, "run_id": job["run_id"],
                    "project_id": job["project_id"], "action": job["action"], "argv": argv, "cwd": spec["cwd"]})
        return spec

    def run(self, job, launch):
        spec = self.command(job)
        process = launch(spec)
        reason = process["reason"] or ("process_failed" if process["exit_code"] != 0 else "")
        result, verified = None, None
        if job["action"] == "check":
            path = owned_path(job["run_dir"], "engine.log")
            try:
                log = read_text(path, MAX_LOG_BYTES)
                readable, log_reason = True, ""
            except (OSError, ValueError, UnicodeError):
                log, readable, log_reason = "", False, "import_log_unavailable"
            errors = bool(re.search(r"\b(?:SCRIPT ERROR|ERROR)\s*:", log)) if readable else False
            checks = [{"name": "process_exit", "passed": not reason, "detail": reason or "exit_code=0"},
                      {"name": "log_readable", "passed": readable, "detail": log_reason},
                      {"name": "no_engine_errors", "passed": readable and not errors,
                       "detail": "import_errors_found" if errors else log_reason}]
            verified = all(check["passed"] for check in checks)
            reason = reason or log_reason or ("import_errors_found" if errors else "")
            result = {"scope": "godot_import", "passed": verified, "checks": checks,
                      "log_path": str(path), "checked_at": datetime.now(timezone.utc).isoformat()}
        outcome = {"state": "failed" if reason else "exited", "reason": reason,
                   "verified": verified, "result": result}
        atomic_json(job["run_dir"] / "result.json", {"version": 2, "run_id": job["run_id"],
                    "project_id": job["project_id"], "action": job["action"], "exit_code": process["exit_code"], **outcome})
        return outcome
