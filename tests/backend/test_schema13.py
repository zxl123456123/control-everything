"""Schema13 rebuild preserves deliveries and all existing references."""
import json
import sqlite3
import unittest
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from control_everything.profiles.profile import DEFAULT_CONFIG, Profile, ProfileError
from control_everything.profiles import task_migration as migration, profile_import as backups
from control_everything.workspace import task_schema as schema


class Schema13Tests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def legacy(self, name='old'):
        root = self.root / name
        root.mkdir()
        (root / 'profile.json').write_text(json.dumps(DEFAULT_CONFIG), encoding='utf-8')
        profile = Profile(root)
        with closing(migration.raw_connection(profile.store.path)) as c:
            c.execute('BEGIN')
            schema.install_schema12(c, fresh=True)
            c.execute("INSERT INTO task_items(id,origin,origin_id,title,state,sort_index,resume_state,revision) "
                      "VALUES('task','task','old','Retention correction','review',0,'doing',4)")
            c.execute("INSERT INTO task_native_runs(id,task_id,project_id,directory_id,agent,client_token,"
                      "launch_operation_id,request_hash,brief_snapshot_json,launch_state,active_slot,created_at,updated_at) "
                      "VALUES('native','task','project','directory','codex','token','operation','hash','{}','created',0,'a','b')")
            c.executemany('INSERT INTO task_deliveries VALUES(?,?,?,?,?,?,?,?,?)', [
                ('native-delivery','task','native','native_turn','turn','Native 😀','{"file":"x"}','unverified','one'),
                ('legacy-delivery','task',None,'legacy_review','review','Legacy\r\n','[]','unverified','two')])
            c.execute("UPDATE task_items SET current_delivery_id='native-delivery',accepted_delivery_id='legacy-delivery'")
            c.execute("INSERT INTO task_reviews(id,task_id,verdict,reason,created_at,delivery_id,native_run_id) "
                      "VALUES('review','task','approved','Checked','three','legacy-delivery','native')")
            c.execute("INSERT INTO task_messages(id,task_id,direction,kind,body_text,delivery_mode,delivery_state,created_at,updated_at) "
                      "VALUES('message','task','human_to_agent','note','Keep receipt','manual','sent','four','five')")
            c.execute("INSERT INTO task_native_message_delivery(message_id,native_run_id,source_delivery_id,request_id,"
                      "payload_hash,payload_text,binding_revision,send_params_json,expected_binding_json,state,created_at,updated_at) "
                      "VALUES('message','native','native-delivery','request','hash','payload',1,'{}','{}','input_accepted','six','seven')")
            c.execute('COMMIT')
        return profile

    def facts(self, profile, version):
        with closing(migration.raw_connection(profile.store.path, readonly=True)) as c:
            schema.validate_schema(c, version)
            self.assertIsNone(c.execute('PRAGMA foreign_key_check').fetchone())
            return schema.table_facts(c, version)

    def test_fresh13_allows_only_three_sources_and_keeps_foreign_keys(self):
        profile = Profile.open(str(self.root / 'fresh'))
        with profile.store.connection() as c:
            self.assertEqual(c.execute('PRAGMA user_version').fetchone()[0], 13)
            self.assertEqual(c.execute('PRAGMA foreign_keys').fetchone()[0], 1)
            schema.validate_schema(c, 13)
            c.execute("INSERT INTO task_items(id,origin,origin_id,title,state,sort_index,resume_state,revision) "
                      "VALUES('task','task','old','Task','todo',0,'todo',1)")
            for source in ('native_turn', 'legacy_review', 'automation_verify'):
                values = (source,'task',None,source,'verify-step','Summary','{}','tested','now')
                c.execute('INSERT INTO task_deliveries VALUES(?,?,?,?,?,?,?,?,?)', values)
                with self.assertRaises(sqlite3.IntegrityError):
                    c.execute('INSERT INTO task_deliveries VALUES(?,?,?,?,?,?,?,?,?)', ('duplicate',*values[1:]))
            with self.assertRaises(sqlite3.IntegrityError):
                c.execute("UPDATE task_deliveries SET source='invented'")
            with self.assertRaises(sqlite3.IntegrityError):
                c.execute("UPDATE task_deliveries SET native_run_id='missing'")

    def test_real12_upgrade_preserves_every_field_and_references(self):
        profile = self.legacy()
        before = self.facts(profile, 12)
        result = migration.migrate_tasks(str(profile.data_dir))
        self.assertEqual(result['schema_version'], 13)
        self.assertEqual(self.facts(profile, 13), before)
        self.assertEqual(backups.validate_backup(result['backup'])['schema_version'], 12)
        with profile.store.connection() as c:
            foreign_keys = c.execute('PRAGMA foreign_key_list(task_native_message_delivery)').fetchall()
            self.assertIn(('task_deliveries','source_delivery_id','id'), [(r[2],r[3],r[4]) for r in foreign_keys])
            c.execute("INSERT INTO task_deliveries VALUES('verify','task',NULL,'automation_verify','step','Verified','{}','tested','now')")
            self.assertEqual(c.execute('PRAGMA foreign_keys').fetchone()[0], 1)

    def test_rebuild_faults_rollback_original12_and_keep_restorable_backup(self):
        real = migration.raw_connection
        for index, needle in enumerate(('INSERT INTO new_task_deliveries', 'DROP TABLE task_deliveries',
                                        'ALTER TABLE new_task_deliveries RENAME', 'COMMIT')):
            with self.subTest(sql=needle):
                profile = self.legacy(str(index))
                before = self.facts(profile, 12)
                class Fault:
                    def __init__(self, connection): self.connection = connection
                    def __getattr__(self, name): return getattr(self.connection, name)
                    def execute(self, sql, *args):
                        if needle == 'COMMIT' and sql == 'COMMIT':
                            raise sqlite3.OperationalError('fixture_before_commit')
                        result = self.connection.execute(sql, *args)
                        if sql.startswith(needle):
                            raise sqlite3.OperationalError('fixture_after_rebuild_statement')
                        return result
                def connect(path, *, readonly=False):
                    c = real(path, readonly=readonly)
                    return c if readonly else Fault(c)
                with patch.object(migration, 'raw_connection', side_effect=connect):
                    with self.assertRaises(ProfileError) as error:
                        migration.migrate_tasks(str(profile.data_dir))
                self.assertFalse(error.exception.committed)
                self.assertEqual(self.facts(profile, 12), before)
                backup = profile.data_dir / 'backups' / error.exception.backup
                self.assertEqual(backups.validate_backup(backup)['schema_version'], 12)
                restored = backups.restore_backup(str(backup), str(self.root / f'restored-{index}'))
                self.assertEqual(self.facts(Profile(restored), 12), before)

    def test_migration_changes_foreign_keys_only_outside_transaction(self):
        profile = self.legacy()
        real = migration.raw_connection
        observed = []
        class Checked:
            def __init__(self, connection): self.connection = connection
            def __getattr__(self, name): return getattr(self.connection, name)
            def execute(self, sql, *args):
                if sql in ('BEGIN EXCLUSIVE', 'COMMIT'):
                    observed.append((sql, self.connection.execute('PRAGMA foreign_keys').fetchone()[0]))
                return self.connection.execute(sql, *args)
            def close(self):
                observed.append(('close', self.connection.execute('PRAGMA foreign_keys').fetchone()[0]))
                self.connection.close()
        def connect(path, *, readonly=False):
            c = real(path, readonly=readonly)
            return c if readonly else Checked(c)
        with patch.object(migration, 'raw_connection', side_effect=connect):
            migration.migrate_tasks(str(profile.data_dir))
        self.assertEqual(observed, [('BEGIN EXCLUSIVE',0), ('COMMIT',0), ('close',1)])

    def test_13_and_12_backups_restore_and_old_writers_cannot_write(self):
        profile = self.legacy()
        old = backups.create_backup(profile)
        migration.migrate_tasks(str(profile.data_dir))
        migrated = self.facts(profile, 13)
        with profile.store.connection() as c:
            c.execute("INSERT INTO task_deliveries VALUES('verify','task',NULL,'automation_verify','step','Verified','{}','tested','now')")
        current = backups.create_backup(profile)
        before = self.facts(profile, 13)
        for version, backup in ((12,old),(13,current)):
            self.assertEqual(backups.validate_backup(backup)['schema_version'], version)
            restored = backups.restore_backup(str(backup), str(self.root / f'restore-{version}'))
            if version == 12:
                migration.migrate_tasks(str(restored))
            self.assertEqual(self.facts(Profile(restored), 13), migrated if version == 12 else before)
        self.assertEqual(migration.preserve_tasks(str(profile.data_dir))['schema_version'], 13)
        for writer in (None,12):
            with closing(sqlite3.connect(profile.store.path)) as c:
                if writer is not None:
                    schema.register_writer(c, writer)
                for table in schema.tables_for(13):
                    with self.subTest(writer=writer,table=table):
                        with self.assertRaisesRegex(sqlite3.Error, 'writer_version_mismatch|no such function'):
                            c.execute(f'DELETE FROM {table}') if c.execute(f'SELECT 1 FROM {table} LIMIT 1').fetchone() else c.execute(
                                f'INSERT INTO {table} DEFAULT VALUES')
