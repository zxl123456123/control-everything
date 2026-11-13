"""Automation intake storage and migration preserve project-owned facts."""

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch
from concurrent.futures import ThreadPoolExecutor

from control_everything.profiles.profile import DEFAULT_CONFIG, Profile, ProfileError
from control_everything.profiles import profile_import as backups, task_migration
from control_everything.workspace import dispatch, task_schema
from control_everything.workspace.service import WorkspaceService
from tests.backend.test_project_management import project_body


class AutomationEventStorageTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.profile = Profile.open(str(self.root / 'profile'))
        self.project = self.profile.store.save_project(project_body(self.root / 'repo'))
        self.item = self.profile.store.save_item({'title': 'Explicit request', 'project_id': self.project['id'],
                                                'provider_id': None, 'state': 'todo', 'session_key': None})

    def service(self, profile=None):
        return WorkspaceService(profile=profile or self.profile, quota_source=Mock(), news_source=Mock(),
                                progress_adapter=Mock())

    def request(self):
        return {'expected_revision': 1, 'brief_revision': 0, 'client_token': 'request-one',
                'agent': 'codex', 'worktree_id': 'worktree'}

    def test_repeated_concurrent_assignment_is_persisted_once_without_starting_an_agent(self):
        service, body = self.service(), self.request()
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: service.enable_task_automation(self.item['id'], body), range(10)))
        self.assertEqual(len({row['id'] for row in results}), 1)
        first = results[0]
        self.assertEqual((first['source_instance'], first['actor_id'], first['authorization']),
                         ('local', 'local-owner', 'auto_enabled'))
        self.assertEqual(first['payload']['brief']['request_text'], 'Explicit request')
        self.assertEqual(first['project_id'], self.project['id'])
        self.assertIsNone(first['consumed_at'])
        self.assertEqual(service.native_progress.adapter.mock_calls, [])
        with self.profile.store.connection() as connection:
            connection.execute("UPDATE task_items SET title='Changed later',revision=2 WHERE id=?", (self.item['id'],))
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_events').fetchone()[0], 1)
        restarted = self.service(Profile.open(str(self.profile.data_dir)))
        self.assertEqual(restarted.enable_task_automation(self.item['id'], body), first)

    def test_same_source_id_cannot_be_reused_for_different_content_or_task(self):
        service, body = self.service(), self.request()
        original = service.enable_task_automation(self.item['id'], body)
        for task_id, changed in ((self.item['id'], {**body, 'agent': 'claude'}), ('another-task', body)):
            with self.subTest(task_id=task_id):
                with self.assertRaises(ProfileError) as error:
                    service.enable_task_automation(task_id, changed)
                self.assertEqual(error.exception.reason, 'automation_event_conflict')
        self.assertEqual(service.enable_task_automation(self.item['id'], body), original)

    def test_existing_authored_brief_is_not_replaced_by_quick_create_title(self):
        dispatch.save_brief(self.profile, self.item['id'], {'expected_revision': 0, 'request_text': 'Authored scope',
            'acceptance_text': 'All cases pass', 'constraints_text': 'Keep the public API', 'references': [],
            'execution_directory_id': None})
        with self.profile.store.connection() as connection:
            connection.execute('UPDATE task_briefs SET revision=0 WHERE task_id=?', (self.item['id'],))
        receipt = self.service().enable_task_automation(self.item['id'], self.request())
        self.assertEqual(receipt['payload']['brief']['request_text'], 'Authored scope')
        self.assertEqual(receipt['payload']['brief']['acceptance_text'], 'All cases pass')

    def test_request_cannot_supply_execution_paths_permissions_or_source_identity(self):
        service = self.service()
        for field in ('cwd', 'command', 'permissions', 'actor_id', 'source_instance', 'authorization'):
            with self.subTest(field=field), self.assertRaises(ProfileError):
                service.enable_task_automation(self.item['id'], {**self.request(), field: 'untrusted'})
        self.assertEqual(service.native_progress.adapter.mock_calls, [])
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_events').fetchone()[0], 0)

    def test_explicit_verification_is_frozen_and_changed_replay_conflicts(self):
        import sys
        body = {**self.request(), 'verification': {'argv': [sys.executable, '-B', 'test_case.py'],
                'source_files': ['source.py', 'test_case.py'], 'timeout': 10}}
        service = self.service()
        event = service.enable_task_automation(self.item['id'], body)
        self.assertEqual(event['payload']['request']['verification'], body['verification'])
        self.assertEqual(service.enable_task_automation(self.item['id'], body), event)
        changed = {**body, 'verification': {**body['verification'], 'timeout': 11}}
        with self.assertRaisesRegex(ProfileError, 'automation_event_conflict'):
            service.enable_task_automation(self.item['id'], changed)
        self.assertEqual(service.native_progress.adapter.mock_calls, [])

    def test_verification_rejects_invalid_paths_types_budgets_and_extra_fields(self):
        import sys
        valid = {'argv': [sys.executable, 'test.py'], 'source_files': ['test.py'], 'timeout': 10}
        cases = [{'argv': []}, {'argv': ['python', 'test.py']}, {'argv': [sys.executable, '']},
            {'source_files': []}, {'source_files': ['../outside.py']}, {'source_files': [str(self.root / 'outside.py')]},
            {'source_files': ['test.py', './test.py']}, {'timeout': True}, {'timeout': float('nan')},
            {'timeout': float('inf')}, {'timeout': 10 ** 400}, {'timeout': 0}, {'timeout': 21}, {'cwd': str(self.root)},
            {'output_dir': str(self.root / 'output')}]
        for changes in cases:
            with self.subTest(changes=changes), self.assertRaises(ProfileError):
                self.service().enable_task_automation(self.item['id'], {**self.request(), 'verification': {**valid, **changes}})
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_events').fetchone()[0], 0)

    def test_brief_command_text_does_not_create_verification_authorization(self):
        body = self.request()
        with self.profile.store.connection() as connection:
            connection.execute("UPDATE task_items SET title='run python test.py' WHERE id=?", (self.item['id'],))
        event = self.service().enable_task_automation(self.item['id'], body)
        self.assertNotIn('verification', event['payload']['request'])

    def test_changed_requirements_or_archived_project_are_not_queued(self):
        service, body = self.service(), self.request()
        for changed, reason in (({**body, 'expected_revision': 0}, 'item_changed'),
                                ({**body, 'brief_revision': 1}, 'brief_changed')):
            with self.assertRaises(ProfileError) as error:
                service.enable_task_automation(self.item['id'], changed)
            self.assertEqual(error.exception.reason, reason)
        with self.profile.store.connection() as connection:
            connection.execute('UPDATE projects SET archived=1 WHERE id=?', (self.project['id'],))
        with self.assertRaises(ProfileError) as error:
            service.enable_task_automation(self.item['id'], body)
        self.assertEqual(error.exception.reason, 'project_unavailable')
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_events').fetchone()[0], 0)

    def insert_event(self, connection, identity='event'):
        connection.execute(
            'INSERT INTO automation_events(id,source_instance,source_event_id,task_id,project_id,actor_id,'
            'authorization,requirement_revision,brief_revision,request_hash,payload_json,received_at) '
            'VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
            (identity, 'local', 'request-one', self.item['id'], self.project['id'], 'local-owner',
             'auto_enabled', 1, 0, 'frozen-hash', '{"request":"Explicit request"}', '2026-11-13T00:00:00Z'))

    def test_source_event_is_unique_and_old_writers_cannot_change_receipts(self):
        with self.profile.store.connection() as connection:
            self.insert_event(connection)
        with self.profile.store.connection() as connection:
            with self.assertRaises(sqlite3.IntegrityError):
                self.insert_event(connection, 'second')
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_events').fetchone()[0], 1)
            task_schema.register_writer(connection, 10)
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'writer_version_mismatch'):
                connection.execute("DELETE FROM automation_events WHERE id='event'")

    def test_backup_restore_preserves_unconsumed_receipt(self):
        with self.profile.store.connection() as connection:
            self.insert_event(connection)
            original = dict(connection.execute('SELECT * FROM automation_events').fetchone())
        backup = backups.create_backup(self.profile)
        self.assertEqual(backups.validate_backup(backup)['counts']['automation_events'], 1)
        restored = Profile.open(str(backups.restore_backup(str(backup), str(self.root / 'restored'))))
        with restored.store.connection() as connection:
            self.assertEqual(dict(connection.execute('SELECT * FROM automation_events').fetchone()), original)
            self.assertIsNone(original['consumed_at'])

    def test_schema10_upgrade_preserves_every_old_table_and_backup(self):
        root = self.root / 'schema10'
        root.mkdir()
        (root / 'profile.json').write_text(json.dumps(DEFAULT_CONFIG), encoding='utf-8')
        database = root / 'workspace-state.sqlite3'
        with closing(sqlite3.connect(database)) as connection:
            connection.row_factory = sqlite3.Row
            task_schema.install_schema10(connection, fresh=True)
            connection.execute("INSERT INTO projects VALUES('project','Keep me',0,'then','then',0)")
            item = task_schema.mapped_item('task', {'id': 'old', 'title': 'Keep my task', 'project_id': 'project',
                'provider_id': None, 'state': 'todo', 'session_key': None, 'source': 'manual',
                'created_at': 'then', 'updated_at': 'then'}, 0)
            task_schema.insert_item(connection, item)
            connection.commit()
            before = task_schema.table_facts(connection, 10)
        self.assertEqual(task_migration.migration_status(str(root))['status'], 'migration_required')
        with patch.object(task_schema, 'finish_schema11', side_effect=RuntimeError('fixture_failure')):
            with self.assertRaises(ProfileError) as failure:
                task_migration.migrate_tasks(str(root))
        self.assertEqual(failure.exception.phase, 'copy')
        self.assertFalse(failure.exception.committed)
        with closing(task_migration.raw_connection(database, readonly=True)) as connection:
            task_schema.validate_schema(connection, 10)
            self.assertEqual(task_schema.table_facts(connection, 10), before)
        result = task_migration.migrate_tasks(str(root))
        self.assertEqual(result['schema_version'], 12)
        self.assertEqual(backups.validate_backup(result['backup'])['schema_version'], 10)
        with Profile.open(str(root)).store.connection() as connection:
            self.assertEqual(task_schema.table_facts(connection, 10), before)
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_events').fetchone()[0], 0)
