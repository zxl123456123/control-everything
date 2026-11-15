"""Schema14 inbox storage upgrades and backups preserve prior business facts."""
from contextlib import closing
import json
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
import unittest

from control_everything.profiles.profile import DEFAULT_CONFIG, Profile
from control_everything.profiles import task_migration as migration, profile_import as backups
from control_everything.workspace import task_schema as schema
from control_everything.workspace.store import WorkspaceError


class RemoteInboxSchemaTests(unittest.TestCase):
    def setUp(self):
        temporary=TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root=Path(temporary.name)

    def legacy13(self):
        root=self.root/'old13'
        root.mkdir()
        (root/'profile.json').write_text(json.dumps(DEFAULT_CONFIG),encoding='utf-8')
        profile=Profile(root)
        with closing(migration.raw_connection(profile.store.path)) as c:
            c.execute('BEGIN')
            schema.install_schema13(c,fresh=True)
            c.execute("INSERT INTO task_items(id,origin,origin_id,title,state,sort_index,resume_state,revision) VALUES('task','task','original','Keep original','todo',0,'todo',4)")
            c.execute('COMMIT')
        return profile

    def insert(self,c):
        c.execute("INSERT INTO automation_remote_inbox VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ('https://hub.example.test','device',1,'message','feishu','event','{\"kind\":\"note\"}','a'*64,
             'now','pending_validation',1,'lease',100.,'pending',None))

    def test_fresh14_has_inbox_and_current_signature(self):
        profile=Profile.open(str(self.root/'fresh'))
        with profile.store.connection() as c:
            self.assertEqual(c.execute('PRAGMA user_version').fetchone()[0],14)
            schema.validate_schema(c,14)
            self.insert(c)
            self.assertEqual(c.execute('SELECT state FROM automation_remote_inbox').fetchone()[0],'pending_validation')

    def test_actual13_migration_preserves_all_old_tables_and_backup(self):
        profile=self.legacy13()
        with closing(migration.raw_connection(profile.store.path,readonly=True)) as c:
            before=schema.table_facts(c,13)
        with self.assertRaisesRegex(WorkspaceError,'migration_required'):
            with profile.store.connection():
                pass
        result=migration.migrate_tasks(str(profile.data_dir))
        self.assertEqual(result['schema_version'],14)
        self.assertEqual(backups.validate_backup(result['backup'])['schema_version'],13)
        restored=backups.restore_backup(result['backup'],str(self.root/'restored13'))
        with closing(migration.raw_connection(Profile(restored).store.path,readonly=True)) as c:
            schema.validate_schema(c,13)
            self.assertEqual(schema.table_facts(c,13),before)
        with profile.store.connection() as c:
            after=schema.table_facts(c,14)
            self.assertEqual({key:after[key] for key in before},before)
            self.assertEqual(after['automation_remote_inbox']['count'],0)
        self.assertEqual(migration.migrate_tasks(str(profile.data_dir))['status'],'already_current')

    def test_backup_restore_includes_inbox_without_business_changes(self):
        profile=Profile.open(str(self.root/'current'))
        with profile.store.connection() as c:
            before=schema.table_facts(c,schema.SCHEMA_VERSION)
            self.insert(c)
            row=tuple(c.execute('SELECT * FROM automation_remote_inbox').fetchone())
        backup=backups.create_backup(profile)
        self.assertEqual(backups.validate_backup(backup)['counts']['automation_remote_inbox'],1)
        restored=Profile.open(str(backups.restore_backup(str(backup),str(self.root/'restored'))))
        with restored.store.connection() as c:
            self.assertEqual(tuple(c.execute('SELECT * FROM automation_remote_inbox').fetchone()),row)
            after=schema.table_facts(c,14)
            self.assertEqual({k:v for k,v in after.items() if k!='automation_remote_inbox'},
                             {k:v for k,v in before.items() if k!='automation_remote_inbox'})
        self.assertEqual(migration.preserve_tasks(str(restored.data_dir))['schema_version'],14)

    def test_legacy_writer_cannot_write_inbox_or_business_tables(self):
        profile=Profile.open(str(self.root/'guarded'))
        with closing(sqlite3.connect(profile.store.path)) as c:
            schema.register_writer(c,13)
            for table in schema.tables_for(14):
                with self.subTest(table=table),self.assertRaisesRegex(sqlite3.Error,'writer_version_mismatch'):
                    c.execute(f'INSERT INTO {table} DEFAULT VALUES')

    def test_inbox_constraints_keep_transport_identity_and_business_state(self):
        profile=Profile.open(str(self.root/'constraints'))
        with closing(sqlite3.connect(profile.store.path)) as c:
            schema.register_writer(c,14)
            self.insert(c)
            for statement in (
                    "UPDATE automation_remote_inbox SET generation=0",
                    "UPDATE automation_remote_inbox SET generation=1.5",
                    "UPDATE automation_remote_inbox SET ack_credential_revision=0",
                    "UPDATE automation_remote_inbox SET state='approved'",
                    "UPDATE automation_remote_inbox SET ack_state='executed'",
                    "INSERT INTO automation_remote_inbox SELECT hub_origin,device_id,generation+1,message_id,source,event_id,payload_json,payload_hash,received_at,state,ack_credential_revision,lease_id,lease_expires_at,ack_state,acknowledged_at FROM automation_remote_inbox"):
                with self.subTest(sql=statement),self.assertRaises(sqlite3.IntegrityError):
                    c.execute(statement)
            with self.assertRaises(sqlite3.IntegrityError):
                self.insert(c)

    def test_schema_signature_rejects_inbox_index_or_guard_tampering(self):
        for index,statement in enumerate(('DROP INDEX automation_remote_inbox_ack',
                                          'DROP TRIGGER guard_automation_remote_inbox_update')):
            profile=Profile.open(str(self.root/f'tampered-{index}'))
            with closing(sqlite3.connect(profile.store.path)) as c:
                c.execute(statement)
                c.commit()
            with self.assertRaisesRegex(WorkspaceError,'schema_error'):
                with profile.store.connection():
                    pass

    def test_13_upgrade_failure_rolls_back_and_retains_restorable_backup(self):
        from unittest.mock import patch
        profile=self.legacy13()
        with closing(migration.raw_connection(profile.store.path,readonly=True)) as c:
            before=schema.table_facts(c,13)
        original=schema.add_schema14
        def fail_after_table(connection):
            original(connection)
            raise WorkspaceError('fixture_after_inbox_ddl')
        from control_everything.profiles.profile import ProfileError
        with patch.object(schema,'add_schema14',side_effect=fail_after_table):
            with self.assertRaises(ProfileError) as error:
                migration.migrate_tasks(str(profile.data_dir))
        self.assertFalse(error.exception.committed)
        with closing(migration.raw_connection(profile.store.path,readonly=True)) as c:
            schema.validate_schema(c,13)
            self.assertEqual(schema.table_facts(c,13),before)
        backup=profile.data_dir/'backups'/error.exception.backup
        restored=backups.restore_backup(str(backup),str(self.root/'restored-failed13'))
        with closing(migration.raw_connection(Profile(restored).store.path,readonly=True)) as c:
            schema.validate_schema(c,13)
            self.assertEqual(schema.table_facts(c,13),before)
