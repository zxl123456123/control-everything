"""Automation flow and step facts remain separate, durable, and version guarded."""

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from uuid import uuid4

from control_everything.profiles.profile import DEFAULT_CONFIG, Profile
from control_everything.profiles import profile_import as backups, task_migration
from control_everything.workspace import task_schema
from control_everything.workspace.service import WorkspaceService
from tests.backend.test_project_management import project_body


class AutomationQueueStorageTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.profile = Profile.open(str(self.root / 'profile'))
        self.project = self.profile.store.save_project(project_body(self.root / 'repo'))
        self.item = self.profile.store.save_item({'title': 'A clear task', 'project_id': self.project['id'],
            'provider_id': None, 'state': 'todo', 'session_key': None})
        self.body = {'expected_revision': 1, 'brief_revision': 0, 'client_token': 'queue-one',
                     'agent': 'codex', 'worktree_id': 'worktree'}
        self.service = WorkspaceService(profile=self.profile)
        self.event = self.service.enable_task_automation(self.item['id'], self.body)

    def insert_flow(self, connection, flow_id, event_id):
        connection.execute('INSERT INTO automation_flows(id,task_id,project_id,origin_event_id,status,phase,'
            'context_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
            (flow_id, self.item['id'], self.project['id'], event_id, 'running', 'prepare', '{}', 'now', 'now'))

    def test_owner_metadata_does_not_make_an_empty_profile_nonempty(self):
        empty = Profile.open(str(self.root / 'empty'))
        with empty.store.connection() as connection:
            connection.execute('INSERT INTO automation_owner VALUES(1,?,?,?)', ('owner', 1, 60))
        self.assertTrue(empty.store.is_empty())

    def test_one_active_flow_and_step_identity_survive_backup_restore(self):
        second = self.service.enable_task_automation(self.item['id'], {**self.body, 'client_token': 'queue-two'})
        with self.profile.store.connection() as connection:
            self.insert_flow(connection, 'flow', self.event['id'])
            with self.assertRaises(sqlite3.IntegrityError):
                self.insert_flow(connection, 'duplicate', second['id'])
            connection.execute('UPDATE automation_events SET flow_id=?,consumed_at=? WHERE id=?',
                               ('flow', 'now', self.event['id']))
            connection.execute('INSERT INTO automation_steps(id,flow_id,ordinal,kind,attempt,owner_generation,status,'
                'operation_id,request_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                ('step', 'flow', 1, 'prepare', 0, 1, 'reserved', 'operation', '{"version":1}', 'now', 'now'))
            step = dict(connection.execute('SELECT * FROM automation_steps').fetchone())
        backup = backups.create_backup(self.profile)
        restored = Profile.open(str(backups.restore_backup(str(backup), str(self.root / 'restored'))))
        with restored.store.connection() as connection:
            self.assertEqual(dict(connection.execute('SELECT * FROM automation_steps').fetchone()), step)
            self.assertEqual(connection.execute('SELECT flow_id FROM automation_events WHERE id=?',
                                               (self.event['id'],)).fetchone()[0], 'flow')
            task_schema.register_writer(connection, 11)
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'writer_version_mismatch'):
                connection.execute("UPDATE automation_steps SET status='completed'")

    def test_schema11_upgrade_keeps_the_original_unconsumed_event(self):
        root = self.root / 'schema11'
        root.mkdir()
        (root / 'profile.json').write_text(json.dumps(DEFAULT_CONFIG), encoding='utf-8')
        database = root / 'workspace-state.sqlite3'
        with closing(sqlite3.connect(database)) as connection:
            connection.row_factory = sqlite3.Row
            task_schema.install_schema11(connection, fresh=True)
            connection.execute("INSERT INTO projects VALUES('project','Old project',0,'then','then',0)")
            item = task_schema.mapped_item('task', {'id': 'old', 'title': 'Old task', 'project_id': 'project',
                'provider_id': None, 'state': 'todo', 'session_key': None, 'source': 'manual',
                'created_at': 'then', 'updated_at': 'then'}, 0)
            task_schema.insert_item(connection, item)
            connection.execute('INSERT INTO automation_events(id,source_instance,source_event_id,task_id,project_id,'
                'actor_id,authorization,requirement_revision,brief_revision,request_hash,payload_json,received_at) '
                'VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                (str(uuid4()), 'local', 'old-message', item['id'], 'project', 'local-owner', 'auto_enabled',
                 1, 0, 'old-hash', '{"original":"keep"}', 'then'))
            connection.commit()
            original = dict(connection.execute('SELECT * FROM automation_events').fetchone())
        result = task_migration.migrate_tasks(str(root))
        self.assertEqual(result['schema_version'], 12)
        self.assertEqual(backups.validate_backup(result['backup'])['schema_version'], 11)
        with Profile.open(str(root)).store.connection() as connection:
            event = dict(connection.execute('SELECT * FROM automation_events').fetchone())
            self.assertIsNone(event.pop('flow_id'))
            self.assertEqual(event, original)
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_owner').fetchone()[0], 0)
