"""Automation intake storage and migration preserve project-owned facts."""

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from control_everything.profiles.profile import DEFAULT_CONFIG, Profile, ProfileError
from control_everything.profiles import profile_import as backups, task_migration
from control_everything.workspace import task_schema
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
        self.assertEqual(result['schema_version'], 11)
        self.assertEqual(backups.validate_backup(result['backup'])['schema_version'], 10)
        with Profile.open(str(root)).store.connection() as connection:
            self.assertEqual(task_schema.table_facts(connection, 10), before)
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_events').fetchone()[0], 0)
