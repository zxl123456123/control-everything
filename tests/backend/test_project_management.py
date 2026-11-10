"""Management behavior over disposable SQLite and explicit metadata fixtures."""
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch
from concurrent.futures import ThreadPoolExecutor
import threading
from uuid import uuid4

from control_everything.profiles.profile import Profile, ProfileError
from control_everything.workspace.service import WorkspaceService, observation_owner
from control_everything.workspace.store import WorkspaceStore


def project_body(root, **values):
    return {"id": None, "name": "Sample", "archived": False, "directories": [{"id": "main", "path": str(root)}],
            "source": {"kind": "none", "directory_id": None, "relative_path": None}, **values}


def project_expected(project):
    return {key: project[key] for key in ('name', 'archived', 'directories', 'source')}


class ProjectManagementTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.profile = Profile.open(str(self.root / "profile"))
        self.store = self.profile.store
        self.workspace = WorkspaceService(profile=self.profile, quota_source=Mock(), news_source=Mock())

    def create(self, **values):
        return self.store.save_project(project_body(self.root / "project", **values))

    def task(self, identity, **values):
        return {"title": "Task", "project_id": identity, "provider_id": None, "state": "todo", "session_key": None, **values}

    def test_native_adopt_is_idempotent_across_connections_and_preserves_authoritative_project(self):
        other = WorkspaceStore(self.store.path, profile=True)
        before = self.store.list_revision()
        barrier = threading.Barrier(2)
        def adopt(store):
            barrier.wait(timeout=2)
            return store.adopt_project('Native project', str(self.root / 'project'))
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(adopt, store) for store in (self.store, other)]
            first, second = [future.result(timeout=10) for future in futures]
        self.assertEqual(first, second)
        self.assertEqual(len(self.store.list_projects()), 1)
        self.assertEqual(self.store.list_revision(), before + 1)
        original = self.store.list_projects()[0]
        with patch.object(self.store, 'save_project', side_effect=AssertionError('no nested write connection')):
            self.assertEqual(self.store.adopt_project('Different native name', str(self.root / 'project')), first)
        self.assertEqual(self.store.list_projects()[0], original)
        self.assertEqual(self.store.list_revision(), before + 1)

    def test_native_adopt_rejects_archived_secondary_and_codex_without_writes(self):
        first = self.create()
        secondary = self.root / 'secondary'
        extra = {'id': 'd-' + uuid4().hex, 'path': str(secondary)}
        first = self.store.save_project({**project_body(self.root / 'project', id=first['id']),
                                         'directories': [*first['directories'], extra]})
        revision = self.store.list_revision()
        with self.assertRaises(ProfileError) as error:
            self.store.adopt_project('Native', str(secondary))
        self.assertEqual((error.exception.reason, error.exception.status), ('directory_conflict', 409))
        with self.store.connection() as connection:
            connection.execute("UPDATE project_sources SET kind='codex' WHERE project_id=?", (first['id'],))
        with self.assertRaises(ProfileError) as error:
            self.store.adopt_project('Native', str(self.root / 'project'))
        self.assertEqual(error.exception.message, 'read_only_project')
        with self.store.connection() as connection:
            connection.execute('UPDATE projects SET archived=1 WHERE id=?', (first['id'],))
        with self.assertRaises(ProfileError) as error:
            self.store.adopt_project('Native', str(self.root / 'project'))
        self.assertEqual((error.exception.reason, error.exception.status), ('project_archived', 409))
        self.assertEqual(self.store.list_revision(), revision)
        self.assertEqual(len(self.store.list_projects()), 1)

    def test_native_adopt_keeps_validation_budget_and_rolls_back_partial_registration(self):
        for name, directory in (('x' * 81, str(self.root / 'new')), ('Name', 'relative')):
            with self.subTest(name=name, directory=directory), self.assertRaises(ProfileError):
                self.store.adopt_project(name, directory)
        self.assertEqual(self.store.list_projects(), [])
        with self.store.connection() as connection:
            connection.executemany('INSERT INTO projects VALUES(?,?,?,?,?,?)',
                                   [('p-budget-' + str(index), 'Fixture', 0, None, None, index) for index in range(1000)])
        with self.assertRaises(ProfileError) as error:
            self.store.adopt_project('Native', str(self.root / 'new'))
        self.assertEqual(error.exception.message, 'project_budget_exceeded')
        with self.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM projects').fetchone()[0], 1000)
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM project_directories').fetchone()[0], 0)

    def test_project_expected_rejects_stale_fields_across_store_connections_without_writes(self):
        other = WorkspaceStore(self.store.path, profile=True)
        changes = {
            'name': {'name': 'Other window name'},
            'archived': {'archived': True},
            'directories': {'directories': [{'id': 'main', 'path': str(self.root / 'rebound')}]},
            'source': {'source': {'kind': 'text', 'directory_id': 'main', 'relative_path': 'progress.md'}},
        }
        for field, change in changes.items():
            with self.subTest(field=field):
                original = self.store.save_project(project_body(self.root / field))
                old = {'id': original['id'], **project_expected(original)}
                other.save_project({**old, **change})
                current, revision = self.store.list_projects(), self.store.list_revision()
                action = {'archived': True} if field == 'name' else {'name': 'Native rename'}
                with self.assertRaises(ProfileError) as error:
                    self.store.save_project({**old, **action, 'expected': project_expected(original)})
                self.assertEqual((error.exception.reason, error.exception.status), ('project_changed', 409))
                self.assertEqual(self.store.list_projects(), current)
                self.assertEqual(self.store.list_revision(), revision)

    def test_project_expected_matches_normalized_bindings_and_keeps_legacy_save(self):
        extra = {'id': 'd-' + uuid4().hex, 'path': str(self.root / 'assets')}
        original = self.create(directories=[{'id': 'main', 'path': str(self.root / 'project')}, extra])
        expected = {**project_expected(original), 'name': ' Sample ', 'directories': [
            {'id': row['id'], 'path': row['path'].replace('\\', '/').upper()}
            for row in reversed(original['directories'])]}
        revision = self.store.list_revision()
        changed = self.store.save_project({'id': original['id'], **project_expected(original),
                                         'name': 'Native rename', 'expected': expected})
        self.assertEqual(changed['name'], 'Native rename')
        self.assertEqual(changed['directories'], original['directories'])
        self.assertEqual(changed['created_at'], original['created_at'])
        self.assertEqual(self.store.list_revision(), revision + 1)
        legacy = self.store.save_project({'id': changed['id'], **project_expected(changed), 'archived': True})
        self.assertTrue(legacy['archived'])
        self.assertEqual(legacy['name'], 'Native rename')

    def test_project_expected_compare_and_write_are_atomic_across_connections(self):
        original = self.create()
        body = {'id': original['id'], **project_expected(original), 'expected': project_expected(original)}
        other = WorkspaceStore(self.store.path, profile=True)
        revision, barrier = self.store.list_revision(), threading.Barrier(2)
        def save(store, name):
            barrier.wait(timeout=2)
            try:
                store.save_project({**body, 'name': name})
                return 'saved'
            except ProfileError as error:
                return error.reason
        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(save, self.store, 'First window')
            second = executor.submit(save, other, 'Second window')
            self.assertEqual(sorted([first.result(timeout=10), second.result(timeout=10)]),
                             ['project_changed', 'saved'])
        saved = self.store.list_projects()[0]
        self.assertIn(saved['name'], ('First window', 'Second window'))
        self.assertFalse(saved['archived'])
        self.assertEqual(self.store.list_revision(), revision + 1)

    def test_project_expected_contract_is_strict_and_existing_only(self):
        original = self.create()
        body = {'id': original['id'], **project_expected(original)}
        expected = project_expected(original)
        invalid = [None, [], {}, {**expected, 'id': original['id']},
                   {key: value for key, value in expected.items() if key != 'source'},
                   {**expected, 'archived': 0}, {**expected, 'name': ''},
                   {**expected, 'directories': [{'id': 'main', 'path': 'relative'}]},
                   {**expected, 'source': {**expected['source'], 'extra': True}}]
        before, revision = self.store.list_projects(), self.store.list_revision()
        for value in invalid:
            with self.subTest(expected=value), self.assertRaises(ProfileError):
                self.store.save_project({**body, 'name': 'Must not save', 'expected': value})
        with self.assertRaises(ProfileError):
            self.store.save_project({**body, 'id': None, 'expected': expected})
        with self.assertRaises(ProfileError):
            self.store.save_project({'project_id': original['id'], 'name': 'Restore',
                                     'directories': original['directories'], 'source': original['source'],
                                     'expected': expected}, restore=True)
        with self.assertRaises(ProfileError) as error:
            self.store.save_project({**body, 'id': 'p-missing', 'expected': expected})
        self.assertEqual((error.exception.reason, error.exception.status), ('not_found', 404))
        self.assertEqual(self.store.list_projects(), before)
        self.assertEqual(self.store.list_revision(), revision)

    def test_matching_project_expected_keeps_readonly_managed_and_directory_guards(self):
        original = self.create()
        body = {'id': original['id'], **project_expected(original), 'expected': project_expected(original)}
        with self.store.connection() as connection:
            connection.execute("UPDATE project_sources SET kind='codex' WHERE project_id=?", (original['id'],))
        before, revision = self.store.list_projects(), self.store.list_revision()
        with self.assertRaises(ProfileError) as error:
            self.store.save_project({**body, 'name': 'Blocked'})
        self.assertEqual(error.exception.message, 'read_only_project')
        self.assertEqual(self.store.list_projects(), before)
        self.assertEqual(self.store.list_revision(), revision)
        with self.store.connection() as connection:
            connection.execute("UPDATE project_sources SET kind='none' WHERE project_id=?", (original['id'],))
        item = self.store.save_item(self.task(original['id']))
        with self.store.connection() as connection:
            connection.execute('''INSERT INTO task_native_runs(id,task_id,project_id,directory_id,agent,client_token,
                launch_operation_id,request_hash,brief_snapshot_json,launch_state,created_at,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,'reserved',?,?)''',
                ('fixture-run', item['id'], original['id'], 'main', 'codex', 'fixture-token',
                 'fixture-operation', 'fixture-hash', '{}', 'fixture-time', 'fixture-time'))
        before, revision = self.store.list_projects(), self.store.list_revision()
        with self.assertRaises(ProfileError) as error:
            self.store.save_project({**body, 'archived': True})
        self.assertEqual((error.exception.reason, error.exception.status), ('native_managed_project', 409))
        self.assertEqual(self.store.list_projects(), before)
        self.assertEqual(self.store.list_revision(), revision)
        with self.store.connection() as connection:
            connection.execute("UPDATE task_native_runs SET active_slot=0 WHERE id='fixture-run'")
        other = self.store.save_project(project_body(self.root / 'another'))
        before, revision = self.store.list_projects(), self.store.list_revision()
        with self.assertRaises(ProfileError) as error:
            self.store.save_project({**body, 'directories': other['directories']})
        self.assertEqual((error.exception.reason, error.exception.status), ('directory_conflict', 409))
        self.assertEqual(self.store.list_projects(), before)
        self.assertEqual(self.store.list_revision(), revision)

    def test_stable_id_multiple_directories_rebind_archive_and_conflicts(self):
        item = self.create()
        extra_id = "d-" + uuid4().hex
        body = project_body(self.root / "moved", id=item["id"], directories=[{"id": "main", "path": str(self.root / "moved")}, {"id": extra_id, "path": str(self.root / "worktree")}], source={"kind": "text", "directory_id": extra_id, "relative_path": "progress.md"})
        updated = self.store.save_project(body)
        self.assertEqual((updated["id"], updated["created_at"]), (item["id"], item["created_at"]))
        with self.assertRaises(ProfileError) as error:
            self.store.save_project(project_body(self.root / "worktree"))
        self.assertEqual(error.exception.reason, "directory_conflict")
        with self.assertRaises(ProfileError) as error:
            self.store.save_project({**body, "directories": body["directories"][:1]})
        self.assertEqual(error.exception.reason, "source_binding_missing")
        archived = self.store.save_project({**body, "archived": True})
        self.assertTrue(archived["archived"])
        self.store.save_project(project_body(self.root / "worktree"))
        with self.assertRaises(ProfileError):
            self.store.save_project(body)
        many = [{"id": "main" if index == 0 else "d-" + uuid4().hex, "path": str(self.root / str(index))} for index in range(8)]
        self.assertEqual(len(self.store.save_project(project_body(self.root, directories=many))["directories"]), 8)
        with self.assertRaises(ProfileError):
            self.store.save_project(project_body(self.root, directories=many + [{"id": "d-" + uuid4().hex, "path": str(self.root / "nine")}]))

    def test_unknown_zero_clear_and_history_only_actual_changes(self):
        item = self.create()
        self.assertIsNone(self.workspace.profile_projects()[0]["percent"])
        body = {"project_id": item["id"], "state": "在做", "percent": None, "note": "note"}
        self.assertTrue(self.store.save_manual(body)["history_added"])
        self.assertFalse(self.store.save_manual(body)["history_added"])
        self.assertTrue(self.workspace.profile_projects()[0]["manual_recorded"])
        self.store.save_manual({**body, "percent": 0})
        self.assertEqual(self.workspace.profile_projects()[0]["percent"], 0)
        self.store.save_manual(body)
        self.assertEqual(self.store.manual_history(item["id"])["total"], 3)
        for value in (True, float("nan"), 101, -1):
            with self.assertRaises(ProfileError):
                self.store.save_manual({**body, "percent": value})

    def test_null_session_skips_reader_and_archived_orphan_edits_preserve_id(self):
        item = self.create()
        with patch.object(self.workspace, "sessions", side_effect=AssertionError("NULL must skip sample")):
            task = self.workspace.save_task(self.task(item["id"]))["task"]
        self.store.save_project(project_body(self.root / "project", id=item["id"], archived=True))
        changed = self.workspace.save_task({**self.task(item["id"], state="done"), "id": task["id"]}, update=True)["task"]
        self.assertEqual(changed["state"], "done")
        with self.assertRaises(ValueError):
            self.workspace.save_task(self.task(item["id"]))
        self.store.save_task(self.task('orphan', provider_id='codex', session_key='codex:' + str(uuid4())), task['id'])
        with patch.object(self.workspace, "sessions", side_effect=AssertionError("NULL must skip sample")):
            edited = self.workspace.save_task({**self.task("orphan"), "id": task["id"]}, update=True)["task"]
        self.assertEqual(edited["project_id"], "orphan")
        self.assertEqual(self.store.compatibility()["items"][0]["project_id"], "orphan")
        restored = self.store.save_project({"project_id": "orphan", "name": "Restored", "directories": [{"id": "main", "path": str(self.root / "restored")}], "source": {"kind": "none", "directory_id": None, "relative_path": None}}, restore=True)
        self.assertEqual(restored["id"], "orphan")
        self.assertEqual(self.store.compatibility()["total"], 0)

    def test_session_owner_longest_and_changed_association_needs_current_sample(self):
        first = self.create()
        second = self.store.save_project(project_body(self.root / "project" / "nested"))
        registry = self.store.list_projects()
        self.assertEqual(observation_owner(str(self.root / "project" / "nested" / "file"), registry), second["id"])
        self.assertEqual(observation_owner(str(self.root / "project" / "file"), registry), first["id"])
        duplicate = {**registry[1], "id": "duplicate"}
        self.assertIsNone(observation_owner(str(self.root / "project" / "nested"), registry + [duplicate]))
        key = "codex:" + str(uuid4())
        sample = {"available": True, "items": [{"session_key": key, "cwd": str(self.root / "project" / "nested")}]}
        with patch.object(self.workspace, "sessions", return_value=sample):
            from control_everything.workspace.store import WorkspaceError
            with self.assertRaises(WorkspaceError):
                self.workspace.save_task(self.task(first["id"], provider_id="codex", session_key=key))
            task = self.workspace.save_task(self.task(second["id"], provider_id="codex", session_key=key))["task"]
        with patch.object(self.workspace, "sessions", return_value={"available": False, "items": []}):
            kept = self.workspace.save_task({**self.task(second["id"], provider_id="codex", session_key=key), "id": task["id"]}, update=True)
        self.assertEqual(kept["task"]["session_link_state"], "not_in_current_sample")

    def test_all_task_statistics_and_pagination_exceed_display_limit(self):
        item = self.create()
        stamp = "2026-01-01T00:00:00Z"
        with self.store.connection() as connection:
            connection.execute('BEGIN IMMEDIATE')
            for index in range(501):
                self.store._create_item(connection, self.task(item['id'], state='done' if index == 500 else 'todo'),
                                        created_at=stamp, updated_at=stamp)
        self.assertEqual(self.store.task_counts()[item["id"]]["total"], 501)
        self.assertEqual(self.store.task_counts()[item["id"]]["done"], 1)
        page = self.workspace.page_tasks(offset=500, limit=100)
        self.assertEqual((page["total"], len(page["items"])), (501, 1))
        self.assertEqual(self.workspace.snapshot()["tasks"]["limit"], 50)

    def test_orphan_manual_can_edit_and_source_observation_never_changes_management(self):
        with self.store.connection() as connection:
            connection.execute("INSERT INTO project_manual VALUES('orphan','等我',NULL,'imported',NULL)")
        result = self.store.save_manual({"project_id": "orphan", "state": "在做", "percent": None, "note": "edited"})
        self.assertTrue(result["history_added"])
        self.assertEqual(self.store.compatibility(kind="manual")["items"][0]["note"], "edited")
        with self.assertRaises(ProfileError):
            self.store.save_manual({"project_id": "unknown", "state": "在做", "percent": None, "note": "x"})
        project_root = self.root / "observed"
        project_root.mkdir()
        (project_root / "progress.json").write_text('{"version":1,"state":"completed","percent":100}', encoding="utf-8")
        item = self.store.save_project(project_body(project_root, source={"kind": "json", "directory_id": "main", "relative_path": "progress.json"}))
        projected = self.workspace.profile_projects()[0]
        self.assertEqual(projected["observation"]["reported"]["percent"], 100)
        self.assertFalse(projected["manual_recorded"])
        self.assertIsNone(projected["percent"])
        self.assertEqual(self.store.manual_history(item["id"])["total"], 0)
        self.assertEqual(projected["task_counts"]["total"], 0)
