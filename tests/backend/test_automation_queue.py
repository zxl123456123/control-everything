"""Automation flow and step facts remain separate, durable, and version guarded."""

import json
import sqlite3
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from uuid import uuid4

from control_everything.profiles.profile import DEFAULT_CONFIG, Profile
from control_everything.profiles import profile_import as backups, task_migration
from control_everything.input_validation import ProfileError
from control_everything.workspace import task_schema
from control_everything.workspace.service import WorkspaceService
from control_everything.workspace.store import WorkspaceStore
from tests.backend.test_project_management import project_body


class AutomationQueueFixture(unittest.TestCase):
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


class AutomationQueueStorageTests(AutomationQueueFixture):
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
        self.assertEqual(result['schema_version'], 13)
        self.assertEqual(backups.validate_backup(result['backup'])['schema_version'], 11)
        with Profile.open(str(root)).store.connection() as connection:
            event = dict(connection.execute('SELECT * FROM automation_events').fetchone())
            self.assertIsNone(event.pop('flow_id'))
            self.assertEqual(event, original)
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_owner').fetchone()[0], 0)


class AutomationClaimTests(AutomationQueueFixture):
    def setUp(self):
        super().setUp()
        from control_everything.workspace.automation_flow import AutomationQueue
        self.queue_type = AutomationQueue
        self.now = 1000.0
        self.queue = AutomationQueue(self.profile.store, owner_id='first', clock=lambda: self.now)
        self.lease = self.queue.acquire()

    def other_event(self, project=None):
        item = self.profile.store.save_item({'title': 'Another task', 'project_id': (project or self.project)['id'],
            'provider_id': None, 'state': 'todo', 'session_key': None})
        return self.service.enable_task_automation(item['id'], {**self.body, 'client_token': str(uuid4())})

    def test_single_owner_and_replacement_fence_captured_lease(self):
        competitor = self.queue_type(Profile.open(str(self.root / 'profile')).store,
                                     owner_id='second', clock=lambda: self.now)
        self.assertIsNone(competitor.acquire())
        claimed = self.queue.claim(self.lease, self.event['id'])
        dispatched = self.queue.record(self.lease, claimed['step'], 'dispatching')
        self.now += 61
        with self.assertRaisesRegex(ProfileError, 'automation_owner_lost'):
            self.queue.record(self.lease, dispatched, 'completed', result={'expired': True})
        replacement = competitor.acquire()
        self.assertGreater(replacement.generation, self.lease.generation)
        for action in (lambda: self.queue.renew(self.lease),
                       lambda: self.queue.claim(self.lease, self.event['id']),
                       lambda: self.queue.record(self.lease, dispatched, 'completed', result={'old': True})):
            with self.assertRaisesRegex(ProfileError, 'automation_owner_lost'):
                action()
        recovered = competitor.claim(replacement, self.event['id'])
        self.assertEqual(recovered['step']['operation_id'], dispatched['operation_id'])
        self.assertEqual(recovered['step']['status'], 'dispatching')
        self.assertEqual(recovered['step']['owner_generation'], replacement.generation)

    def test_same_owner_expiry_and_release_invalidate_old_calls(self):
        self.assertEqual(self.queue.renew(self.lease), self.lease)
        self.now += 61
        renewed = self.queue.acquire()
        self.assertGreater(renewed.generation, self.lease.generation)
        with self.assertRaisesRegex(ProfileError, 'automation_owner_lost'):
            self.queue.claim(self.lease, self.event['id'])
        self.queue.release(renewed)
        with self.assertRaisesRegex(ProfileError, 'automation_owner_lost'):
            self.queue.claim(renewed, self.event['id'])

    def test_concurrent_replay_returns_one_original_intent_and_snapshot(self):
        def claim(_):
            queue = self.queue_type(WorkspaceStore(self.profile.store.path, profile=True),
                                    owner_id='first', clock=lambda: self.now)
            return queue.claim(self.lease, self.event['id'])
        with ThreadPoolExecutor(max_workers=8) as workers:
            results = list(workers.map(claim, range(8)))
        self.assertEqual(len({row['step']['id'] for row in results}), 1)
        self.assertEqual(len({row['step']['operation_id'] for row in results}), 1)
        self.assertEqual(results[0]['step']['request']['input'], self.event['payload'])
        self.assertEqual(results[0]['flow']['context']['requirement_revision'], 1)
        self.assertEqual(results[0]['flow']['context']['policy_version'], 1)
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_steps').fetchone()[0], 1)
            event = connection.execute('SELECT * FROM automation_events').fetchone()
            self.assertEqual(event['flow_id'], results[0]['flow']['id'])
            self.assertIsNotNone(event['consumed_at'])

    def test_project_slot_remains_held_when_result_unknown(self):
        claimed = self.queue.claim(self.lease, self.event['id'])
        step = self.queue.record(self.lease, claimed['step'], 'dispatching')
        step = self.queue.record(self.lease, step, 'unknown', result={'reason': 'reply_lost'})
        another = self.other_event()
        self.assertIsNone(self.queue.claim(self.lease, another['id']))
        second_project = self.profile.store.save_project(project_body(self.root / 'another-repo', name='Other'))
        other_project_event = self.other_event(second_project)
        self.assertIsNotNone(self.queue.claim(self.lease, other_project_event['id']))
        self.queue.record(self.lease, step, 'completed', result={'verified': True})
        self.assertIsNotNone(self.queue.claim(self.lease, another['id']))

    def test_conflicting_request_is_not_consumed_or_overwritten(self):
        original = self.queue.claim(self.lease, self.event['id'])
        repeated = self.service.enable_task_automation(self.item['id'], {**self.body, 'client_token': 'another-command'})
        self.assertIsNone(self.queue.claim(self.lease, repeated['id']))
        with self.profile.store.connection() as connection:
            receipt = connection.execute('SELECT * FROM automation_events WHERE id=?', (repeated['id'],)).fetchone()
            self.assertIsNone(receipt['consumed_at'])
            self.assertIsNone(receipt['flow_id'])
        self.assertEqual(self.queue.claim(self.lease, self.event['id']), original)

    def test_new_intent_rechecks_request_before_consumption(self):
        with self.profile.store.connection() as connection:
            connection.execute('UPDATE task_items SET revision=revision+1 WHERE id=?', (self.item['id'],))
        with self.assertRaisesRegex(ProfileError, 'item_changed'):
            self.queue.claim(self.lease, self.event['id'])
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_flows').fetchone()[0], 0)
            self.assertIsNone(connection.execute('SELECT consumed_at FROM automation_events').fetchone()[0])

    def test_directory_change_during_queueing_is_not_silently_used(self):
        with self.profile.store.connection() as connection:
            connection.execute('UPDATE project_directories SET path=? WHERE project_id=?',
                               (str(self.root / 'changed-repo'), self.project['id']))
        with self.assertRaisesRegex(ProfileError, 'project_directory_changed'):
            self.queue.claim(self.lease, self.event['id'])
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_steps').fetchone()[0], 0)
            self.assertIsNone(connection.execute('SELECT consumed_at FROM automation_events').fetchone()[0])

    def test_racing_owners_acquire_only_one_live_generation(self):
        self.queue.release(self.lease)
        def acquire(index):
            queue = self.queue_type(WorkspaceStore(self.profile.store.path, profile=True),
                                    owner_id=str(index), clock=lambda: self.now)
            return queue.acquire()
        with ThreadPoolExecutor(max_workers=8) as workers:
            leases = list(workers.map(acquire, range(8)))
        self.assertEqual(len([lease for lease in leases if lease is not None]), 1)

    def test_stale_step_result_cannot_overwrite_later_transition(self):
        original = self.queue.claim(self.lease, self.event['id'])['step']
        dispatched = self.queue.record(self.lease, original, 'dispatching')
        running = self.queue.record(self.lease, dispatched, 'running', binding={'terminal': 'one'})
        with self.assertRaisesRegex(ProfileError, 'automation_step_changed'):
            self.queue.record(self.lease, dispatched, 'failed', result={'late': True})
        completed = self.queue.record(self.lease, running, 'completed', result={'exit_code': 0})
        self.assertEqual(completed['binding'], {'terminal': 'one'})
        self.assertEqual(completed['result'], {'exit_code': 0})

    def test_old_unknown_reply_is_rejected_after_state_returns_to_unknown(self):
        step = self.queue.claim(self.lease, self.event['id'])['step']
        step = self.queue.record(self.lease, step, 'dispatching')
        old_unknown = self.queue.record(self.lease, step, 'unknown', result={'reason': 'first_timeout'})
        running = self.queue.record(self.lease, old_unknown, 'running', binding={'terminal': 'original'})
        self.queue.record(self.lease, running, 'unknown', result={'reason': 'later_timeout'})
        with self.assertRaisesRegex(ProfileError, 'automation_step_changed'):
            self.queue.record(self.lease, old_unknown, 'completed', result={'late_reply': True})
