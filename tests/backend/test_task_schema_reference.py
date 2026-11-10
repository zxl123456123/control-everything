"""Reference reuse never replaces validation of a live management database."""

import sqlite3
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from control_everything.profiles.profile import Profile
from control_everything.workspace import task_schema as schema
from control_everything.workspace.store import WorkspaceError


class TaskSchemaReferenceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        reference = getattr(schema, '_expected_schema_signature', None)
        if reference is not None:
            reference.cache_clear()
            self.addCleanup(reference.cache_clear)

    def database(self, version):
        connection = sqlite3.connect(':memory:')
        self.addCleanup(connection.close)
        if version == 1:
            for statement in schema.OLD_STATEMENTS:
                connection.execute(statement)
            connection.execute('PRAGMA user_version=1')
        else:
            getattr(schema, f'install_schema{version}')(connection, fresh=True)
        return connection

    def test_warm_validation_creates_no_reference_ddl_and_rechecks_live_state(self):
        databases = {version: self.database(version) for version in range(1, schema.SCHEMA_VERSION + 1)}
        connect = sqlite3.connect
        references, reference_sql, live_sql = [], [], {version: [] for version in databases}
        for version, connection in databases.items():
            connection.set_trace_callback(live_sql[version].append)

        def traced_connect(*args, **kwargs):
            connection = connect(*args, **kwargs)
            references.append(connection)
            connection.set_trace_callback(reference_sql.append)
            return connection

        with patch.object(schema.sqlite3, 'connect', side_effect=traced_connect):
            for version, connection in databases.items():
                schema.validate_schema(connection, version)
            self.assertEqual(len(references), len(databases))
            self.assertTrue(any(sql.startswith('CREATE ') for sql in reference_sql))
            reference_sql.clear()
            for sql in live_sql.values():
                sql.clear()
            for _ in range(3):
                for version, connection in databases.items():
                    schema.validate_schema(connection, version)
        self.assertEqual(len(references), len(databases))
        self.assertEqual(reference_sql, [])
        for version, sql in live_sql.items():
            self.assertEqual(sql.count('PRAGMA user_version'), 3)
            self.assertEqual(sum('FROM sqlite_master' in statement for statement in sql), 3)
            self.assertEqual(sql.count('SELECT * FROM task_center_meta'), 3 if version >= 2 else 0)
        for connection in references:
            with self.assertRaises(sqlite3.ProgrammingError):
                connection.execute('SELECT 1')

    def test_cached_reference_is_immutable_and_separated_by_version(self):
        references = [schema._expected_schema_signature(version) for version in range(1, schema.SCHEMA_VERSION + 1)]
        for reference in references:
            self.assertIsInstance(reference, tuple)
            self.assertTrue(all(isinstance(row, tuple) for row in reference))
            self.assertTrue(all(value is None or isinstance(value, str) for row in reference for value in row))
            with self.assertRaises(TypeError):
                reference[0][0] = 'changed'
        self.assertEqual(len(set(references)), schema.SCHEMA_VERSION)

    def test_warm_reference_rejects_live_schema_changes_for_every_version(self):
        for version in range(1, schema.SCHEMA_VERSION + 1):
            with self.subTest(version=version):
                connection = self.database(version)
                schema.validate_schema(connection, version)
                connection.execute('ALTER TABLE projects ADD COLUMN unexpected TEXT')
                with self.assertRaisesRegex(WorkspaceError, 'schema_error'):
                    schema.validate_schema(connection, version)

    def test_warm_reference_rechecks_meta_and_receipts_for_every_item_schema(self):
        for version in range(2, schema.SCHEMA_VERSION + 1):
            for statement in ('DELETE FROM task_center_meta',
                              "UPDATE task_center_meta SET migration_json='{}'"):
                with self.subTest(version=version, statement=statement):
                    connection = self.database(version)
                    schema.validate_schema(connection, version)
                    connection.execute(statement)
                    with self.assertRaisesRegex(WorkspaceError, 'schema_error'):
                        schema.validate_schema(connection, version)

    def test_warm_reference_still_rejects_tampering_on_next_connection(self):
        changes = {
            'trigger': ('DROP TRIGGER guard_projects_update',),
            'view': ('DROP VIEW tasks', 'CREATE VIEW tasks AS SELECT id FROM task_items'),
            'table': ('ALTER TABLE projects ADD COLUMN unexpected TEXT',),
            'version': ('PRAGMA user_version=3',),
            'receipt_shape': ("UPDATE task_center_meta SET migration_json='{}'",),
            'receipt_json': ("UPDATE task_center_meta SET migration_json='{'",),
        }
        for name, statements in changes.items():
            with self.subTest(change=name):
                store = Profile.open(str(self.root / name)).store
                self.assertEqual(store.list_items()['total'], 0)
                with closing(sqlite3.connect(store.path)) as connection:
                    schema.register_writer(connection)
                    for statement in statements:
                        connection.execute(statement)
                    connection.commit()
                with self.assertRaisesRegex(WorkspaceError, 'schema_error'):
                    store.list_items()

    def test_shared_reference_does_not_share_profile_data_or_validity(self):
        first = Profile.open(str(self.root / 'first')).store
        second = Profile.open(str(self.root / 'second')).store
        item = second.save_item(dict(title='Second profile only', project_id=None,
                                     provider_id=None, state='todo', session_key=None))
        self.assertEqual(first.list_items()['total'], 0)
        self.assertEqual(second.list_items()['items'][0]['id'], item['id'])
        with closing(sqlite3.connect(first.path)) as connection:
            connection.execute('DROP TRIGGER guard_projects_update')
            connection.commit()
        with self.assertRaisesRegex(WorkspaceError, 'schema_error'):
            first.list_items()
        self.assertEqual(second.list_items()['items'][0]['id'], item['id'])

    def test_concurrent_cold_profiles_allow_duplicate_builds_then_reuse(self):
        stores = [Profile.open(str(self.root / str(index))).store for index in range(4)]
        for index, store in enumerate(stores):
            for _ in range(index):
                store.save_item(dict(title='Synthetic item', project_id=None,
                                     provider_id=None, state='todo', session_key=None))
        schema._expected_schema_signature.cache_clear()
        barrier = threading.Barrier(len(stores), timeout=10)
        connect = sqlite3.connect
        references = []

        def concurrent_connect(database, *args, **kwargs):
            connection = connect(database, *args, **kwargs)
            if database == ':memory:':
                references.append(connection)
                # Hold all cold builds before any can publish a cache result.
                barrier.wait()
            return connection

        with patch.object(schema.sqlite3, 'connect', side_effect=concurrent_connect):
            with ThreadPoolExecutor(max_workers=len(stores)) as executor:
                results = list(executor.map(lambda store: store.list_items()['total'], stores))
            self.assertEqual(results, [0, 1, 2, 3])
            self.assertEqual(len(references), len(stores))
            self.assertEqual([store.list_items()['total'] for store in stores], results)
            self.assertEqual(len(references), len(stores))

    def test_failed_reference_build_closes_connection_and_can_retry(self):
        connection = self.database(2)
        connect, install = sqlite3.connect, schema.install_schema2
        references = []
        attempts = 0

        def tracked_connect(*args, **kwargs):
            reference = connect(*args, **kwargs)
            references.append(reference)
            return reference

        def interrupted_install(reference, **kwargs):
            nonlocal attempts
            attempts += 1
            install(reference, **kwargs)
            if attempts == 1:
                raise sqlite3.OperationalError('fixture_reference_failure')

        with patch.object(schema.sqlite3, 'connect', side_effect=tracked_connect), \
                patch.object(schema, 'install_schema2', side_effect=interrupted_install):
            with self.assertRaisesRegex(sqlite3.OperationalError, 'fixture_reference_failure'):
                schema.validate_schema(connection, 2)
            with self.assertRaises(sqlite3.ProgrammingError):
                references[0].execute('SELECT 1')
            schema.validate_schema(connection, 2)
            schema.validate_schema(connection, 2)
        self.assertEqual(attempts, 2)
        self.assertEqual(len(references), 2)
        with self.assertRaises(sqlite3.ProgrammingError):
            references[1].execute('SELECT 1')
