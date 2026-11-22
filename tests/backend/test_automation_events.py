"""Automation intake storage and migration preserve project-owned facts."""

import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
import sys
from unittest.mock import Mock, patch
from concurrent.futures import ThreadPoolExecutor

from control_everything.integrations.workbench_progress import WorkbenchProgressAdapter
from control_everything.profiles.profile import DEFAULT_CONFIG, Profile, ProfileError
from control_everything.profiles import profile_import as backups, task_migration
from control_everything.workspace import dispatch, task_schema
from control_everything.workspace.automation_events import apply_feishu_assignments
from control_everything.workspace.automation_identities import IdentityService, decision_authorized
from control_everything.workspace.automation_launch import AutomationLaunch
from control_everything.workspace.automation_remote_inbox import RemoteAutomationInbox
from control_everything.workspace.service import WorkspaceService
from tests.backend.test_automation_queue import bind_actor
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

    def test_local_launch_freezes_the_registered_verification_for_its_directory(self):
        service = self.service()
        project_id = self.project['id']
        spec = {'argv': [sys.executable, 'verify.py'], 'source_files': ['verify.py'], 'timeout': 10}
        service.set_project_automation_verification(project_id, {'directory_id': 'main', 'verification': spec})

        request = self.request()
        first = service.enable_task_automation(self.item['id'], request)
        self.assertEqual(first['payload']['request']['verification'], spec)
        changed = {**spec, 'timeout': 11}
        service.set_project_automation_verification(project_id, {'directory_id': 'main', 'verification': changed})
        self.assertEqual(service.enable_task_automation(self.item['id'], request), first)
        second = service.enable_task_automation(self.item['id'], {**request, 'client_token': 'another-request'})
        self.assertEqual(second['payload']['request']['verification'], changed)
        explicit = service.enable_task_automation(self.item['id'], {**request, 'client_token': 'explicit',
                                                                   'verification': spec})
        self.assertEqual(explicit['payload']['request']['verification'], spec)

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

    def assignment_context(self):
        project = self.project['id']
        device = {'hub_origin': 'https://hub.example.test', 'device_id': 'device',
                  'generation': 1, 'credential_revision': 1}
        ids = bind_actor(self.profile.store, project, 'initiator'), bind_actor(self.profile.store, project, 'reviewer')
        identity = IdentityService(self.profile.store, lambda: device)
        return device, ids, identity

    def receive_assignment(self, device, event_id, **changes):
        payload = {'kind': 'feishu_new_task', 'project_id': self.project['id'], 'app_id': 'app',
                   'producer_id': 'father', 'channel_account_id': 'account', 'chat_id': 'chat',
                   'actor_open_id': 'initiator', 'message_id': 'om-' + event_id,
                   'assignment': {'namespace': 'control-everything.automation.v1', 'text': 'New title\nFull scope.'}}
        payload.update(changes)
        source = 'feishu:' + hashlib.sha256(b'["account","app"]').hexdigest()
        RemoteAutomationInbox(self.profile.store).receive(device, {
            'id': event_id, 'event_id': event_id, 'source': source, 'lease_id': 'fixture', 'lease_expires_at': 10,
            'payload': payload})

    def test_granted_new_assignment_creates_one_task_brief_acceptor_and_frozen_event(self):
        device, ids, identity = self.assignment_context()
        project = self.project['id']
        store = self.profile.store
        spec = {'argv': [sys.executable, 'verify.py'], 'source_files': ['verify.py'], 'timeout': 10}
        self.service().set_project_automation_verification(project, {'directory_id': 'main', 'verification': spec,
            'confirmed': True, 'integration': {'repository_path': str(self.root/'target'),
                'target_worktree_path': str(self.root/'target'), 'candidate_worktree_path': str(self.root/'candidate'),
                'remote_name': 'origin', 'remote_url': str(self.root/'fixture.git')}})
        identity.set_assignment_grant(project, *ids, 'main', True)
        self.receive_assignment(device, 'new')
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: apply_feishu_assignments(store, device)[0], range(6)))
        event = results[0]['event']
        task_id = event['task_id']
        self.assertEqual(sum(not row['replayed'] for row in results), 1)
        self.assertEqual({row['event']['id'] for row in results}, {event['id']})
        self.assertEqual(self.profile.store.get_item(task_id)['title'], 'New title')
        self.assertEqual(event['payload']['brief']['request_text'], 'New title\nFull scope.')
        self.assertEqual(event['payload']['brief']['execution_directory_id'], 'main')
        self.assertEqual(event['payload']['request'], {'agent': 'codex', 'worktree_id': 'main', 'verification': spec})
        self.assertEqual(event['brief_revision'], 1)
        self.assertEqual(event['actor_id'], 'initiator')
        self.assertTrue(decision_authorized(store, 'reviewer', task_id=task_id,
                        trusted={'project_id': project, 'app_id': 'app'}, device=device))
        self.assertFalse(decision_authorized(store, 'initiator', task_id=task_id,
                         trusted={'project_id': project, 'app_id': 'app'}, device=device))
        self.service().set_project_automation_verification(project, {'directory_id': 'main', 'verification': None})
        self.assertEqual(apply_feishu_assignments(store, device)[0]['event'], event)
        from control_everything.workspace.automation_flow import AutomationQueue
        queue = AutomationQueue(store)
        lease = queue.acquire()
        claimed = queue.claim(lease, event['id'])
        self.assertEqual(claimed['flow']['context']['input']['request']['verification'], spec)
        directory = Path(event['payload']['directory']['path'])
        directory.mkdir(exist_ok=True)
        runtime = Mock(ready=True)
        runtime.config.allowed_workspace_roots = [self.root]
        runtime.config.data_root = self.root
        runtime.status.return_value = {'runtimeId': 'test-runtime'}
        runtime._rpc.side_effect = [{'repos': [{'id': 'repo', 'path': str(directory)}]},
                                    {'worktrees': [{'id': 'native-id', 'path': str(directory)}]}]
        with patch('control_everything.integrations.workbench_progress.read_json',
                   return_value={'installationId': '11111111-1111-4111-8111-111111111111'}):
            prepared = AutomationLaunch(queue, WorkbenchProgressAdapter(runtime)).prepare(lease, claimed['step'])
        self.assertEqual(prepared['status'], 'completed')
        self.assertEqual(prepared['result']['scope']['worktreeId'], 'native-id')
        with store.connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM task_items').fetchone()[0], 2)
            self.assertEqual(db.execute('SELECT count(*) FROM task_briefs').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT count(*) FROM automation_task_acceptors').fetchone()[0], 1)

    def test_binding_alone_old_messages_and_wrong_producer_cannot_initiate(self):
        device, ids, identity = self.assignment_context()
        store = self.profile.store
        self.receive_assignment(device, 'before-grant')
        self.assertEqual(apply_feishu_assignments(store, device), [])
        identity.set_assignment_grant(self.project['id'], *ids, 'main', True)
        self.receive_assignment(device, 'wrong-producer', producer_id='other')
        self.receive_assignment(device, 'wrong-chat', chat_id='other')
        self.receive_assignment(device, 'reviewer-only', actor_open_id='reviewer')
        self.assertEqual(apply_feishu_assignments(store, device), [])
        identity.set_assignment_grant(self.project['id'], *ids, 'main', False)
        self.receive_assignment(device, 'after-revoke')
        self.assertEqual(apply_feishu_assignments(store, device), [])
        with store.connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM task_items').fetchone()[0], 1)

    def test_missing_reviewer_or_changed_directory_blocks_new_assignment(self):
        device, ids, identity = self.assignment_context()
        store = self.profile.store
        project = self.project['id']
        with self.assertRaisesRegex(ValueError, 'assignment_binding_unavailable'):
            identity.set_assignment_grant(project, ids[0], '0' * 32, 'main', True)
        identity.set_assignment_grant(project, *ids, 'main', True)
        with store.connection() as db:
            db.execute('UPDATE project_directories SET path=? WHERE project_id=?', (str(self.root / 'changed'), project))
        self.receive_assignment(device, 'changed-directory')
        self.assertEqual(apply_feishu_assignments(store, device), [])
        identity.set_assignment_grant(project, *ids, 'main', True)
        with store.connection() as db:
            db.execute("UPDATE automation_identity_bindings SET state='revoked' WHERE id=?", (ids[1],))
        self.receive_assignment(device, 'revoked-reviewer')
        self.assertEqual(apply_feishu_assignments(store, device), [])

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
        self.assertEqual(result['schema_version'], 18)
        self.assertEqual(backups.validate_backup(result['backup'])['schema_version'], 10)
        with Profile.open(str(root)).store.connection() as connection:
            self.assertEqual(task_schema.table_facts(connection, 10), before)
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_events').fetchone()[0], 0)

    def test_schema17_upgrade_preserves_configured_verifier(self):
        root = self.root / 'schema17'
        root.mkdir()
        (root / 'profile.json').write_text(json.dumps(DEFAULT_CONFIG), encoding='utf-8')
        with closing(sqlite3.connect(root / 'workspace-state.sqlite3')) as db:
            task_schema.install_schema16(db, fresh=True)
            task_schema.install_schema17(db)
            db.execute("INSERT INTO projects VALUES('project','Project',0,'then','then',0)")
            db.execute("INSERT INTO project_directories VALUES('project','main','fixture','fixture',1)")
            db.execute("INSERT INTO automation_project_verification VALUES('project','main','fixture','{}')")
            db.commit()
        result = task_migration.migrate_tasks(str(root))
        self.assertEqual(result['schema_version'], 18)
        self.assertEqual(backups.validate_backup(result['backup'])['schema_version'], 17)
        with Profile.open(str(root)).store.connection() as db:
            self.assertEqual(tuple(db.execute('SELECT * FROM automation_project_verification').fetchone()),
                             ('project', 'main', 'fixture', '{}'))
            self.assertEqual(db.execute('SELECT count(*) FROM automation_assignment_grants').fetchone()[0], 0)
