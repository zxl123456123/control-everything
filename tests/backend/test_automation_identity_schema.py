"""Identity schema installation retains historical schema contracts."""

import sqlite3
import unittest
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
import json
from unittest.mock import patch

from control_everything.workspace import task_schema as schema
from control_everything.workspace.store import WorkspaceError
from control_everything.profiles.profile import DEFAULT_CONFIG, Profile, ProfileError
from control_everything.profiles import task_migration as migration, profile_import as backups


class IdentitySchemaTests(unittest.TestCase):
    def test_real14_migration_and_failure_backup(self):
        for fail in (False, True):
            with self.subTest(fail=fail), TemporaryDirectory() as temporary:
                root = Path(temporary)
                (root/'profile.json').write_text(json.dumps(DEFAULT_CONFIG), encoding='utf-8')
                profile = Profile(root)
                with closing(migration.raw_connection(profile.store.path)) as connection:
                    connection.execute('BEGIN')
                    schema.install_schema14(connection, fresh=True)
                    connection.execute("INSERT INTO automation_remote_inbox VALUES('https://hub.example.test','device',1,'message','feishu','event','{}','hash','now','pending_validation',1,'lease',100,'pending',NULL)")
                    before = schema.table_facts(connection, 14)
                    connection.commit()
                with self.assertRaisesRegex(WorkspaceError, 'migration_required'):
                    with profile.store.connection():
                        pass
                if fail:
                    original = schema.add_schema15
                    def fail_after_ddl(connection):
                        original(connection)
                        raise WorkspaceError('fixture_identity_ddl')
                    with patch.object(schema, 'add_schema15', side_effect=fail_after_ddl):
                        with self.assertRaises(ProfileError) as error:
                            migration.migrate_tasks(str(root))
                    self.assertFalse(error.exception.committed)
                    backup = root/'backups'/error.exception.backup
                    with closing(migration.raw_connection(profile.store.path)) as connection:
                        schema.validate_schema(connection, 14)
                        self.assertEqual(schema.table_facts(connection, 14), before)
                else:
                    result = migration.migrate_tasks(str(root))
                    self.assertEqual(result['schema_version'], 15)
                    backup = result['backup']
                    with profile.store.connection() as connection:
                        after = schema.table_facts(connection, 15)
                        self.assertEqual({key: after[key] for key in before}, before)
                        connection.execute("INSERT INTO projects VALUES('project','Project',0,'now','now',0)")
                        connection.execute("INSERT INTO automation_identity_challenges VALUES('challenge','project','https://hub.example.test','producer','account','app','chat','device',1,'hash','message','later','confirmed','now')")
                        connection.execute("INSERT INTO automation_identity_candidates VALUES('candidate','challenge','app','openid','event','message','now')")
                        connection.execute("INSERT INTO automation_identity_bindings VALUES('binding','challenge','candidate','project','active','now',NULL)")
                        after = schema.table_facts(connection, 15)
                    current_backup = backups.create_backup(profile)
                    restored = backups.restore_backup(str(current_backup), str(root/'restored15'))
                    with Profile.open(str(restored)).store.connection() as connection:
                        self.assertEqual(schema.table_facts(connection, 15), after)
                restored = backups.restore_backup(str(backup), str(root/'restored14'))
                with closing(migration.raw_connection(Profile(restored).store.path)) as connection:
                    schema.validate_schema(connection, 14)
                    self.assertEqual(schema.table_facts(connection, 14), before)

    def test_fresh15_and_old14_signature(self):
        with closing(sqlite3.connect(':memory:')) as connection:
            schema.install_schema14(connection, fresh=True)
            schema.validate_schema(connection, 14)
            before = schema.table_facts(connection, 14)
            schema.add_schema15(connection)
            schema.finish_schema15(connection)
            schema.validate_schema(connection, 15)
            after = schema.table_facts(connection, 15)
            for table, facts in before.items():
                self.assertEqual(after[table], facts)

    def test_identity_signature_detects_guard_and_unique_index_tampering(self):
        for statement in (
                'DROP TRIGGER guard_automation_identity_candidates_insert',
                'CREATE INDEX unexpected_identity_index ON automation_identity_bindings(project_id)'):
            with self.subTest(statement=statement), closing(sqlite3.connect(':memory:')) as connection:
                schema.install_schema15(connection, fresh=True)
                connection.execute(statement)
                with self.assertRaisesRegex(WorkspaceError, 'schema_error'):
                    schema.validate_schema(connection, 15)

    def test_old_writer_cannot_write_any_table(self):
        with closing(sqlite3.connect(':memory:')) as connection:
            schema.install_schema15(connection, fresh=True)
            schema.register_writer(connection, 14)
            for table in schema.tables_for(15):
                with self.subTest(table=table):
                    with self.assertRaisesRegex(sqlite3.DatabaseError, 'writer_version_mismatch'):
                        connection.execute(f'INSERT INTO {table} DEFAULT VALUES')
