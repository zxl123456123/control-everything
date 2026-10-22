"""Managed creator library and process tests; no native executable is run."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

from control_everything.execution.creator_process import CreatorProcesses
from control_everything.integrations.godot_creator import GodotLibrary, MAX_LOG_BYTES, atomic_json, strict_json


class FakeProcess:
    def __init__(self, pid=7001):
        self.pid = pid
        self.returncode = None
        self.done = threading.Event()
        self.kill = Mock()
        self.terminate = Mock()

    def poll(self):
        return self.returncode

    def wait(self, timeout=None):
        if not self.done.wait(3):
            raise AssertionError("synthetic child was not released")
        return self.returncode

    def finish(self, code=0):
        self.returncode = code
        self.done.set()


class CreatorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.engine = root / "engine.exe"
        self.engine.write_bytes(b"synthetic executable; never run")
        self.root = root / "library"
        self.root.mkdir()
        self.library = GodotLibrary(self.engine, self.root)

    def create(self, name="测试工程", kind="2d"):
        return self.library.create(name, kind)

    def job(self, action="check", project=None):
        project = project or self.create()
        return self.library.prepare(action, project["id"], uuid4().hex)

    def test_source_checkout_and_library_location_boundaries(self):
        checkout = self.root.parent / "checkout"
        (checkout / "work" / "allowed").mkdir(parents=True)
        (checkout / "src").mkdir()
        with patch("control_everything.integrations.godot_creator.source_root", return_value=None):
            with self.assertRaisesRegex(ValueError, "source_checkout_required"):
                GodotLibrary(self.engine, self.root)
        with patch("control_everything.integrations.godot_creator.source_root", return_value=checkout):
            GodotLibrary(self.engine, checkout / "work" / "allowed")
            for path in (checkout, checkout / "work", checkout / "src", checkout.parent):
                with self.subTest(path=path), self.assertRaisesRegex(ValueError, "invalid_library"):
                    GodotLibrary(self.engine, path)
        inside = self.root / "engine.exe"
        inside.write_bytes(b"never run")
        with self.assertRaisesRegex(ValueError, "invalid_library"):
            GodotLibrary(inside, self.root)

    def test_two_same_name_projects_restore_with_independent_source_and_userdata(self):
        first, second = self.create(), self.create(kind="3d")
        restored = GodotLibrary(self.engine, self.root).projects()
        self.assertEqual({p["id"] for p in restored}, {first["id"], second["id"]})
        self.assertNotEqual(first["project_path"], second["project_path"])
        self.assertNotEqual(first["user_data_key"], second["user_data_key"])
        for project in restored:
            self.assertEqual(set(project), {"id", "name", "kind", "project_path", "user_data_key"})
            source = Path(project["project_path"])
            self.assertEqual(source, self.root / project["id"] / "project")
            self.assertEqual({path.name for path in source.iterdir()}, {"project.godot", "main.tscn"})
            self.assertIn(project["user_data_key"], (source / "project.godot").read_text(encoding="utf-8"))
            self.assertIn("Node2D" if project["kind"] == "2d" else "Node3D", (source / "main.tscn").read_text())
            self.assertFalse((source / ".git").exists())

    def test_names_are_escaped_and_never_used_as_paths(self):
        name = '含"引号"和\\反斜杠'
        project = self.create(name)
        source = Path(project["project_path"])
        line = next(line for line in (source / "project.godot").read_text(encoding="utf-8").splitlines()
                    if line.startswith("config/name="))
        self.assertEqual(json.loads(line.split("=", 1)[1]), name)
        marker = self.root / project["id"] / "project.json"
        metadata = json.loads(marker.read_text(encoding="utf-8"))
        metadata["name"] = "改名后"
        atomic_json(marker, metadata)
        renamed = self.library.project(project["id"])
        self.assertEqual(renamed["project_path"], project["project_path"])
        self.assertEqual(renamed["user_data_key"], project["user_data_key"])
        for value in ("", " ", "x" * 81, "line\nbreak", "\x00", "\x7f", True, "\ud800"):
            with self.subTest(value=repr(value)), self.assertRaises(ValueError):
                self.create(value)

    def test_partial_creation_and_bad_metadata_fail_whole_scan(self):
        project = self.create()
        other = self.root / ("a" * 32)
        other.mkdir()
        with self.assertRaisesRegex(ValueError, "library_scan_failed"):
            self.library.projects()
        atomic_json(other / "project.json", {"version": 1, "id": "a" * 32, "name": "partial", "kind": "2d"})
        with self.assertRaisesRegex(ValueError, "library_scan_failed"):
            self.library.projects()
        marker = self.root / project["id"] / "project.json"
        metadata = json.loads(marker.read_text(encoding="utf-8"))
        for changes in ({"version": True}, {"id": "b" * 32}, {"kind": []}, {"path": "../other"}, {"name": "\n"}):
            atomic_json(marker, {**metadata, **changes})
            with self.assertRaisesRegex(ValueError, "project_metadata_invalid"):
                self.library.project(project["id"])
        with patch("control_everything.integrations.godot_creator.os.scandir", side_effect=PermissionError("synthetic")):
            with self.assertRaisesRegex(ValueError, "library_scan_failed"):
                self.library.projects()

    def test_failed_creation_keeps_partial_files_without_a_success_marker(self):
        with patch("control_everything.integrations.godot_creator.atomic_json", side_effect=OSError("synthetic")):
            with self.assertRaises(OSError):
                self.create()
        candidates = list(self.root.iterdir())
        self.assertEqual(len(candidates), 1)
        self.assertTrue((candidates[0] / "project" / "main.tscn").is_file())
        self.assertFalse((candidates[0] / "project.json").exists())
        with self.assertRaisesRegex(ValueError, "library_scan_failed"):
            self.library.projects()

    def test_invalid_ids_and_owned_links_are_rejected(self):
        project = self.create()
        for value in ("../other", project["id"].upper(), "a" * 31, [], None):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "invalid_project_id"):
                self.library.project(value)
        with self.assertRaisesRegex(ValueError, "project_not_found"):
            self.library.project("f" * 32)
        base = self.root / project["id"]
        original = Path.is_junction
        with patch.object(Path, "is_junction", lambda path: path == base or original(path)):
            with self.assertRaisesRegex(ValueError, "project_path_invalid"):
                self.library.project(project["id"])
        marker = base / "project.json"
        original_link = Path.is_symlink
        with patch.object(Path, "is_symlink", lambda path: path == marker or original_link(path)):
            with self.assertRaisesRegex(ValueError, "project_metadata_invalid"):
                self.library.project(project["id"])

    def test_brief_roundtrip_is_separate_from_source_and_checks_limits(self):
        project = self.create()
        source_before = (Path(project["project_path"]) / "project.godot").read_bytes()
        text = "原样文本 <script>不会执行</script>\n第二行"
        self.assertEqual(self.library.save_brief(project["id"], text), {"project_id": project["id"], "saved": True})
        self.assertEqual(GodotLibrary(self.engine, self.root).detail(project["id"])["brief"], text)
        self.assertEqual((Path(project["project_path"]) / "project.godot").read_bytes(), source_before)
        self.library.save_brief(project["id"], "😀" * 4000)
        for value in ("x" * 4001, None, "\ud800"):
            with self.assertRaises(ValueError):
                self.library.save_brief(project["id"], value)
        brief = self.root / project["id"] / "brief.md"
        for raw in (b"x" * 16385, b"\xff"):
            brief.write_bytes(raw)
            with self.assertRaises((ValueError, UnicodeError)):
                self.library.detail(project["id"])

    def test_file_overview_is_relative_hidden_and_bounded(self):
        project = self.create()
        source = Path(project["project_path"])
        (source / ".godot").mkdir()
        (source / ".godot" / "private.cache").write_bytes(b"do not list")
        (source / "scene").mkdir()
        (source / "scene" / "script.gd").write_text("extends Node")
        detail = self.library.detail(project["id"])
        self.assertFalse(detail["files_truncated"])
        self.assertIn({"path": "scene/script.gd", "kind": "script"}, detail["files"])
        self.assertTrue(all(not item["path"].startswith(".") and not Path(item["path"]).is_absolute() for item in detail["files"]))
        for number in range(205):
            (source / f"resource-{number}.png").write_bytes(b"synthetic")
        detail = self.library.detail(project["id"])
        self.assertTrue(detail["files_truncated"])
        self.assertEqual(len(detail["files"]), 200)
        with patch("control_everything.integrations.godot_creator.MAX_SCAN_ENTRIES", 1):
            self.assertTrue(self.library.detail(project["id"])["files_truncated"])

    def test_file_overview_reports_io_and_link_escape(self):
        project = self.create()
        source = Path(project["project_path"])
        target = source / "outside"
        target.mkdir()
        original_link, original_resolve = Path.is_symlink, Path.resolve
        with patch.object(Path, "is_symlink", lambda path: path == target or original_link(path)), \
                patch.object(Path, "resolve", lambda path, **kwargs: self.root.parent if path == target else original_resolve(path, **kwargs)):
            with self.assertRaisesRegex(ValueError, "project_path_invalid"):
                self.library.detail(project["id"])
        with patch("control_everything.integrations.godot_creator.os.scandir", side_effect=PermissionError("synthetic")):
            with self.assertRaises(PermissionError):
                self.library.detail(project["id"])

    def test_fixed_argv_uses_each_project_main_scene_and_no_game_protocol(self):
        project = self.create(kind="3d")
        prefixes = {"edit": ["--editor"], "play": [], "check": ["--headless", "--editor", "--import"]}
        for action, prefix in prefixes.items():
            job = self.job(action, project)
            spec = self.library.command(job)
            self.assertEqual(spec["argv"], [str(self.engine), *prefix, "--path", project["project_path"],
                                           "--log-file", str(job["run_dir"] / "engine.log")])
            self.assertFalse(any("--ce-" in item for item in spec["argv"]))
            self.assertNotIn("--scene", spec["argv"])
            self.assertNotIn("--quit", spec["argv"])
            launch = json.loads((job["run_dir"] / "launch.json").read_text())
            self.assertEqual(launch["project_id"], project["id"])
        for action in ("verify", "save_exit"):
            with self.assertRaises(ValueError):
                self.job(action, project)

    def test_check_requires_exit_zero_readable_bounded_clean_log(self):
        cases = [(b"Godot import DONE\n", 0, True), (b"SCRIPT ERROR: Parse Error\n", 0, False),
                 (b"ERROR: scene failed\n", 0, False), (b"Godot import DONE\n", 1, False),
                 (None, 0, False), (b"\xff", 0, False), (b"x" * (MAX_LOG_BYTES + 1), 0, False)]
        for raw, code, passed in cases:
            with self.subTest(code=code, sample=None if raw is None else raw[:30]):
                job = self.job()
                def launch(spec):
                    if raw is not None:
                        (spec["run_dir"] / "engine.log").write_bytes(raw)
                    return {"exit_code": code, "reason": ""}
                result = self.library.run(job, launch)
                self.assertEqual(result["verified"], passed)
                self.assertEqual(result["result"]["passed"], passed)
                self.assertEqual(set(result["result"]), {"scope", "passed", "checks", "log_path", "checked_at"})
                self.assertEqual(result["result"]["scope"], "godot_import")
                self.assertEqual(json.loads((job["run_dir"] / "result.json").read_text())["project_id"], job["project_id"])

    def test_play_exit_does_not_claim_save_or_game_validation(self):
        result = self.library.run(self.job("play"), lambda spec: {"exit_code": 0, "reason": ""})
        self.assertEqual(result, {"state": "exited", "reason": "", "verified": None, "result": None})

    def start_fake(self, action="play", *, wait=None, project=None):
        child, spawned = FakeProcess(), threading.Event()
        def spawn(*args, **kwargs):
            spawned.set()
            return child
        spawner = Mock(side_effect=spawn)
        processes = CreatorProcesses(spawn=spawner, wait=wait)
        project = project or self.create()
        response = processes.start(action, project["id"], self.library.prepare, self.library.run)
        self.assertTrue(spawned.wait(2))
        record = processes._operations[action]
        self.addCleanup(record["thread"].join, 3)
        self.addCleanup(child.finish)
        return processes, child, spawner, response, record, project

    def test_global_action_and_same_project_admission_use_owned_identity(self):
        processes, child, spawn, response, record, project = self.start_fake("edit")
        second = self.create()
        with self.assertRaisesRegex(ValueError, "action_busy"):
            processes.start("edit", second["id"], self.library.prepare, self.library.run)
        with self.assertRaisesRegex(ValueError, "project_busy"):
            processes.start("play", project["id"], self.library.prepare, self.library.run)
        processes.start("play", second["id"], self.library.prepare, self.library.run)
        play_record = processes._operations["play"]
        self.addCleanup(play_record["thread"].join, 3)
        self.addCleanup(child.finish)
        state = processes.snapshot()
        self.assertEqual(set(state["busy_project_ids"]), {project["id"], second["id"]})
        self.assertEqual(state["capabilities"], {"create": True, "edit": False, "play": False, "check": True})
        op = state["operations"]["edit"]
        self.assertEqual(set(op), {"run_id", "project_id", "action", "state", "pid", "exit_code", "verified", "reason", "result"})
        self.assertEqual(op["state"], "running")
        self.assertIsNone(op["exit_code"])
        self.assertEqual(response, {"run_id": op["run_id"], "state": "starting"})
        self.assertFalse(spawn.call_args.kwargs["shell"])
        self.assertEqual(spawn.call_args.kwargs["creationflags"], 0)
        self.assertNotEqual(spawn.call_args.kwargs["stdout"], subprocess.PIPE)
        self.assertEqual(CreatorProcesses().snapshot()["busy_project_ids"], [])
        self.assertFalse(hasattr(processes, "save_exit"))

    def test_close_keeps_native_process_and_brief_writes_do_not_require_idle(self):
        processes, child, _, _, record, project = self.start_fake()
        self.library.save_brief(project["id"], "Can be edited while native process runs.")
        remaining = processes.close()
        self.assertEqual(remaining[0]["project_id"], project["id"])
        self.assertEqual(remaining[0]["pid"], child.pid)
        child.kill.assert_not_called()
        child.terminate.assert_not_called()
        with self.assertRaisesRegex(ValueError, "service_closed"):
            processes.start("check", project["id"], self.library.prepare, self.library.run)
        child.finish()
        record["thread"].join(3)
        self.assertEqual(processes.snapshot()["operations"]["play"]["state"], "exited")

    def test_timeout_keeps_busy_and_late_exit_preserves_failed_check(self):
        def wait(child, timeout):
            self.assertEqual(timeout, 180)
            raise subprocess.TimeoutExpired("synthetic", timeout)
        processes, child, _, _, record, project = self.start_fake("check", wait=wait)
        record["thread"].join(3)
        value = processes.snapshot()
        self.assertEqual(value["operations"]["check"]["reason"], "process_timeout")
        self.assertFalse(value["operations"]["check"]["verified"])
        self.assertEqual(value["busy_project_ids"], [project["id"]])
        child.finish(0)
        value = processes.snapshot()
        self.assertEqual(value["operations"]["check"]["exit_code"], 0)
        self.assertEqual(value["operations"]["check"]["reason"], "process_timeout")
        self.assertFalse(value["operations"]["check"]["verified"])
        self.assertEqual(value["busy_project_ids"], [])
        child.kill.assert_not_called()

    def test_spawn_failure_is_a_failed_operation_not_a_missing_check(self):
        processes = CreatorProcesses(spawn=Mock(side_effect=OSError("synthetic")))
        project = self.create()
        processes.start("check", project["id"], self.library.prepare, self.library.run)
        record = processes._operations["check"]
        record["thread"].join(3)
        value = processes.snapshot()["operations"]["check"]
        self.assertEqual((value["state"], value["reason"], value["verified"]), ("failed", "spawn_failed", False))
        self.assertTrue((record["job"]["run_dir"] / "result.json").is_file())

    def test_strict_json_rejects_duplicate_and_nonfinite_values(self):
        for raw in ('{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}', '{"x":1e999}'):
            with self.assertRaises(ValueError):
                strict_json(raw)


if __name__ == "__main__":
    unittest.main()
