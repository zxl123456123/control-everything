"""Native progress contracts using only disposable SQLite and synthetic host facts."""

import copy
from contextlib import closing
import json
import sqlite3
import threading
import time
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock

from control_everything.profiles.profile import Profile
from control_everything.profiles.profile import DEFAULT_CONFIG
from control_everything.input_validation import ProfileError
from control_everything.workspace.native_progress import NativeProgress, valid_provider
from control_everything.workspace import dispatch, task_sessions, task_messages, task_schema
from control_everything.workspace.store import WorkspaceStore
from tests.backend.test_project_management import project_body


class FakeHost:
    available = True

    def __init__(self):
        self.binding = {'runtimeId': 'runtime', 'environmentId': 'environment', 'terminalHandle': 'terminal',
                        'paneKey': 'pane', 'worktreeId': 'worktree', 'agent': 'codex', 'ptyId': 'pty',
                        'processIncarnation': 'incarnation', 'generation': 1,
                        'statusProcessIncarnation': 'pty:incarnation',
                        'providerSession': {'key': 'session_id', 'id': 'provider'}}
        self.create_calls = 0
        self.send_calls = 0
        self.receipt_calls = 0
        self.reply = {'contractVersion': 1, 'available': True, 'binding': copy.deepcopy(self.binding),
                      'evidenceTime': {'kind': 'observed', 'at': 100}, 'deliveredAt': 101, 'readAt': 102,
                      'status': {'state': 'working', 'providerSession': self.binding['providerSession'], 'turnStartedAt': 90}}
        self.receipts = {}

    def prepare_scope(self, directory, worktree):
        return {'runtimeId': 'runtime', 'environmentId': 'environment', 'repoId': 'repo',
                'worktreeId': worktree, 'cwd': directory}

    def create(self, params):
        self.create_calls += 1
        return {'contractVersion': 1, 'binding': copy.deepcopy(self.binding), 'disposition': 'created'}

    def resume(self, params):
        return self.create(params)

    def observe(self, binding, **kwargs):
        return copy.deepcopy(self.reply)

    def discover_binding(self, query):
        return copy.deepcopy(self.reply)

    def send(self, params, request_id):
        self.send_calls += 1
        result = {'send': {'handle': 'terminal', 'accepted': True, 'bytesWritten': len(params['text']),
                          'prompt': {'requestId': request_id, 'processIncarnation': 'incarnation', 'generation': 1,
                                     'stages': ['input_accepted'], 'provider': 'codex', 'observation': 'supported'}}}
        self.receipts[request_id] = {'receiptState': 'completed', 'bindingState': 'current', 'receipt': result}
        return result

    def read_receipt(self, request_id, params, binding, **kwargs):
        self.receipt_calls += 1
        return copy.deepcopy(self.receipts.get(request_id, {'receiptState': 'absent', 'bindingState': 'unavailable'}))


class NativeFixture(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.profile = Profile.open(str(self.root / 'profile'))
        self.store = self.profile.store
        self.project = self.store.save_project(project_body(self.root / 'repo'))
        self.item = self.store.save_item({'title': 'One goal', 'project_id': self.project['id'],
                                        'provider_id': None, 'state': 'todo', 'session_key': None})
        dispatch.save_brief(self.profile, self.item['id'], {'expected_revision': 0, 'request_text': 'Build it once',
                            'acceptance_text': '', 'constraints_text': '', 'references': [], 'execution_directory_id': None})
        self.host = FakeHost()
        self.progress = NativeProgress(self.store, self.host)
        self.start_body = {'expected_revision': 1, 'brief_revision': 1, 'client_token': 'start-one',
                           'agent': 'codex', 'worktree_id': 'worktree'}

    def start(self):
        return self.progress.start(self.item['id'], self.start_body)

    def publish(self, **changes):
        self.host.reply['status'].update(changes)
        self.host.reply['evidenceTime']['at'] += 10
        run = self.progress.get(self.item['id'])['native_run']
        self.progress.project_observation(run['id'], self.host.reply)
        return self.progress.get(self.item['id'])

    def done(self, text='First result', start=90, end=120):
        return self.publish(state='done', turnStartedAt=start, turnEndedAt=end,
                            turnEndDisposition='identified', lastAssistantMessage=text)


class NativeProgressTests(NativeFixture):
    def test_provider_metadata_matches_bounded_owner_shape(self):
        for provider in ({'key': 'session_id', 'id': 'x', 'transcriptPath': None},
                         {'key': 'session_id', 'id': '\ud800'},
                         {'key': 'session_id', 'id': 'x', 'extra': True},
                         {'key': 'session_id', 'id': ' x'},
                         {'key': 'unknown', 'id': 'x'}):
            with self.subTest(provider=repr(provider)):
                self.assertFalse(valid_provider(provider))

    def provider(self, agent, metadata):
        self.start_body['agent'] = agent
        self.host.binding.update(agent=agent, providerSession=copy.deepcopy(metadata))
        self.host.reply['binding'] = copy.deepcopy(self.host.binding)
        self.host.reply['status']['providerSession'] = copy.deepcopy(metadata)

    def test_grok_uses_owner_launch_without_platform_agent_registration(self):
        self.provider('grok', {'key': 'session_id', 'id': 'grok-session'})
        value = self.start()
        self.assertEqual(value['native_run']['agent'], 'grok')
        self.assertEqual(self.profile.agent_settings()['items'], [])
        self.assertEqual(task_sessions.task_sessions(self.store, self.item['id'])['items'][0]['source'], 'grok')
        self.host.reply['canResume'] = True
        self.host.reply['canSendFeedback'] = False
        value = self.publish(interrupted=True)
        self.assertTrue(value['capabilities']['can_resume'])
        self.assertFalse(value['capabilities']['can_send_feedback'])

    def test_cursor_resume_preserves_conversation_key(self):
        metadata = {'key': 'conversation_id', 'id': 'cursor-session'}
        self.provider('cursor', metadata)
        value = self.start()
        self.host.resume = Mock(wraps=self.host.resume)
        self.progress.resume(self.item['id'], {'native_run_id': value['native_run']['id'],
            'expected_binding_revision': value['native_run']['binding_revision'], 'client_token': 'resume-cursor'})
        self.assertEqual(self.host.resume.call_args.args[0]['providerSession'], metadata)

    def test_pi_resume_preserves_authoritative_path(self):
        metadata = {'key': 'session_id', 'id': 'pi-session', 'transcriptPath': '/example/pi-session.jsonl'}
        self.provider('pi', metadata)
        value = self.start()
        self.host.resume = Mock(wraps=self.host.resume)
        self.progress.resume(self.item['id'], {'native_run_id': value['native_run']['id'],
            'expected_binding_revision': value['native_run']['binding_revision'], 'client_token': 'resume-pi'})
        self.assertEqual(self.host.resume.call_args.args[0]['providerSession'], metadata)

    def test_missing_new_provider_metadata_never_reconstructs_from_index(self):
        self.provider('grok', {'key': 'session_id', 'id': 'grok-session'})
        value = self.start()
        with self.store.connection() as c:
            binding = copy.deepcopy(self.host.binding)
            binding['providerSession'] = None
            c.execute('UPDATE task_native_runs SET terminal_binding_json=? WHERE id=?',
                      (json.dumps(binding), value['native_run']['id']))
        self.host.resume = Mock(wraps=self.host.resume)
        with self.assertRaisesRegex(ProfileError, 'source_only'):
            self.progress.resume(self.item['id'], {'native_run_id': value['native_run']['id'],
                'expected_binding_revision': value['native_run']['binding_revision'], 'client_token': 'missing'})
        self.host.resume.assert_not_called()
        self.assertFalse(self.progress.get(self.item['id'])['capabilities']['can_resume'])

    def test_legacy_codex_index_can_still_supply_known_session_key(self):
        value = self.start()
        with self.store.connection() as c:
            binding = copy.deepcopy(self.host.binding)
            binding['providerSession'] = None
            c.execute('UPDATE task_native_runs SET terminal_binding_json=? WHERE id=?',
                      (json.dumps(binding), value['native_run']['id']))
        self.host.resume = Mock(wraps=self.host.resume)
        self.progress.resume(self.item['id'], {'native_run_id': value['native_run']['id'],
            'expected_binding_revision': value['native_run']['binding_revision'], 'client_token': 'legacy'})
        self.assertEqual(self.host.resume.call_args.args[0]['providerSession'], {'key': 'session_id', 'id': 'provider'})

    def test_changed_provider_key_or_path_cannot_rebind_same_id(self):
        self.provider('pi', {'key': 'session_id', 'id': 'pi-session', 'transcriptPath': '/example/original.jsonl'})
        value = self.start()
        for change in ({'key': 'conversation_id'}, {'transcriptPath': '/example/replaced.jsonl'}):
            binding = copy.deepcopy(self.host.binding)
            binding['providerSession'].update(change)
            with self.subTest(change=change), self.assertRaisesRegex(ProfileError, 'binding_changed'):
                self.progress.bind(self.item['id'], value['native_run']['id'], {'contractVersion': 1, 'binding': binding})
        binding['providerSession'] = None
        with self.assertRaisesRegex(ProfileError, 'binding_changed'):
            self.progress.bind(self.item['id'], value['native_run']['id'], {'contractVersion': 1, 'binding': binding})

    def test_owner_refused_resume_capability_is_not_bypassed_by_api(self):
        self.provider('pi', {'key': 'session_id', 'id': 'pi-session'})
        self.start()
        self.host.reply['canResume'] = False
        value = self.publish(interrupted=True)
        self.host.resume = Mock(wraps=self.host.resume)
        self.assertFalse(value['capabilities']['can_resume'])
        with self.assertRaisesRegex(ProfileError, 'source_only'):
            self.progress.resume(self.item['id'], {'native_run_id': value['native_run']['id'],
                'expected_binding_revision': value['native_run']['binding_revision'], 'client_token': 'missing-path'})
        self.host.resume.assert_not_called()

    def test_unknown_agent_is_delegated_to_owner_without_brand_list(self):
        self.host.create = Mock(side_effect=RuntimeError('Unknown agent preset'))
        value = self.progress.start(self.item['id'], {**self.start_body, 'agent': 'custom-tool'})
        self.assertEqual(value['native_run']['launch_state'], 'unknown')
        self.assertEqual(self.host.create.call_args.args[0]['agent'], 'custom-tool')

    def test_start_persists_once_and_replays_before_changed_revision(self):
        first = self.start()
        self.assertEqual(first['item']['state'], 'doing')
        second = self.start()
        self.assertEqual(first['native_run']['id'], second['native_run']['id'])
        self.assertEqual(self.host.create_calls, 1)
        with self.assertRaisesRegex(ProfileError, 'item_changed'):
            self.progress.start(self.item['id'], {**self.start_body, 'agent': 'claude'})
        with self.assertRaisesRegex(ProfileError, 'session_conflict'):
            self.progress.start(self.item['id'], {**self.start_body, 'client_token': 'another', 'expected_revision': 2})

    def test_reserved_restart_and_reads_never_create(self):
        run = self.progress.reserve_start(self.item['id'], self.start_body)
        service = NativeProgress(self.store, self.host)
        self.assertEqual(service.get(self.item['id'])['native_run']['launch_state'], 'reserved')
        self.assertEqual(service.observe_jobs(), [])
        self.assertEqual(self.host.create_calls, 0)
        self.assertEqual(service.start(self.item['id'], self.start_body)['native_run']['id'], run['id'])

    def test_same_provider_cannot_be_stolen_by_another_task(self):
        self.start()
        other = self.store.save_item({'title': 'Other', 'project_id': self.project['id'], 'provider_id': None,
                                     'state': 'todo', 'session_key': None})
        with self.assertRaisesRegex(ProfileError, 'session_conflict'):
            task_sessions.link_session(self.store, other['id'], {'source': 'codex', 'source_instance': 'environment', 'external_id': 'provider'})

    def test_native_protects_manual_state_project_directory_and_session_unlink(self):
        self.start()
        with self.assertRaisesRegex(ProfileError, 'native_managed_item'):
            self.store.save_item({'state': 'done'}, item_id=self.item['id'], expected_revision=2)
        with self.assertRaisesRegex(ProfileError, 'native_managed_project'):
            self.store.save_project(project_body(self.root / 'repo', id=self.project['id'], archived=True))
        session = task_sessions.task_sessions(self.store, self.item['id'])['items'][0]
        with self.assertRaisesRegex(ProfileError, 'native_managed_item'):
            task_sessions.unlink_session(self.store, session['id'], {'expected_task_id': self.item['id'], 'expected_updated_at': session['updated_at']})

    def test_identity_fence_and_normal_result_dedupe(self):
        self.start()
        value = self.done()
        self.assertEqual(value['current_delivery']['verification'], 'unverified')
        self.assertNotEqual(value['item']['state'], 'done')
        original = value['item']['progress_revision']
        same = self.done()
        self.assertEqual(same['item']['progress_revision'], original)
        for reason in ('identity_unobserved', 'stale_incarnation', 'expected_binding_missing'):
            self.progress.project_observation(value['native_run']['id'], {'available': False, 'reason': reason})
            current = self.progress.get(self.item['id'])
            self.assertEqual(current['native_run']['observation_state'], 'unknown')
            self.assertEqual(current['item']['progress_revision'], original)
            self.assertEqual(current['current_delivery']['id'], value['current_delivery']['id'])
        self.host.reply['binding']['processIncarnation'] = 'replacement'
        self.done('Old cached text')
        self.assertEqual(self.progress.get(self.item['id'])['item']['progress_revision'], original)

    def test_incomplete_or_tool_or_interrupted_results_are_not_deliveries(self):
        for patch in ({'turnEndDisposition': 'ambiguous'}, {'interrupted': True}, {'sessionBoundary': True},
                      {'lastAssistantMessageIsToolOutput': True}, {'lastAssistantMessage': ''}):
            with self.subTest(patch=patch):
                self.setUp()
                self.start()
                result = self.publish(state='done', turnStartedAt=90, turnEndedAt=120,
                                      turnEndDisposition=patch.get('turnEndDisposition', 'identified'),
                                      lastAssistantMessage=patch.get('lastAssistantMessage', 'Result'),
                                      **{k: v for k, v in patch.items() if k not in ('turnEndDisposition', 'lastAssistantMessage')})
                self.assertIsNone(result['current_delivery'])

    def test_unknown_keeps_attention_until_trusted_source_clears(self):
        self.start()
        waiting = self.publish(state='waiting', interactivePrompt='Allow command?')
        self.progress.project_observation(waiting['native_run']['id'], {'available': False})
        self.assertEqual(self.progress.get(self.item['id'])['attention']['text'], 'Allow command?')
        cleared = self.publish(state='working', interactivePrompt=None)
        self.assertIsNone(cleared['attention'])

    def test_fresh_schema_and_old_writer_rejected(self):
        with self.store.connection() as c:
            self.assertEqual(c.execute('PRAGMA user_version').fetchone()[0], 10)
            task_schema.validate_schema(c, 10)
            task_schema.register_writer(c, 9)
            with self.assertRaisesRegex(Exception, 'writer_version_mismatch'):
                c.execute("UPDATE task_items SET title='stale'")

    def test_release_preserves_history_without_stopping_or_restarting_session(self):
        value = self.start()
        body = {'native_run_id': value['native_run']['id'], 'expected_revision': value['item']['revision'],
                'expected_binding_revision': value['native_run']['binding_revision'], 'client_token': 'release-one', 'confirmed': True}
        released = self.progress.release(self.item['id'], body)
        self.assertEqual(released['native_run']['active_slot'], 0)
        self.assertFalse(released['capabilities']['can_feedback'])
        self.assertFalse(released['capabilities']['can_release'])
        self.assertEqual(self.progress.projections([self.item['id']])[self.item['id']]['active_slot'], 0)
        self.assertEqual(self.host.create_calls, 1)
        self.assertEqual(self.host.send_calls, 0)
        self.assertEqual(self.progress.release(self.item['id'], body)['item']['revision'], released['item']['revision'])

    def test_adopt_checks_existing_stable_session_without_creating_or_resuming(self):
        session = task_sessions.link_session(self.store, self.item['id'], {'source': 'codex', 'source_instance': 'environment', 'external_id': 'provider'})
        self.assertTrue(self.progress.get(self.item['id'])['capabilities']['can_adopt'])
        body = {'session_id': session['id'], 'worktree_id': 'worktree', 'expected_revision': 1, 'client_token': 'adopt-one'}
        adopted = self.progress.adopt(self.item['id'], body)
        self.assertTrue(adopted['native_run']['brief_snapshot']['adopted'])
        self.assertEqual(adopted['native_run']['provider_session_id'], 'provider')
        self.assertEqual(self.host.create_calls, 0)
        self.assertEqual(self.progress.adopt(self.item['id'], body)['native_run']['id'], adopted['native_run']['id'])

    def test_adopt_rejects_unknown_or_replaced_identity(self):
        session = task_sessions.link_session(self.store, self.item['id'], {'source': 'codex', 'source_instance': 'environment', 'external_id': 'provider'})
        self.host.reply = {'available': False, 'reason': 'identity_unobserved'}
        with self.assertRaisesRegex(ProfileError, 'binding_changed'):
            self.progress.adopt(self.item['id'], {'session_id': session['id'], 'worktree_id': 'worktree', 'expected_revision': 1, 'client_token': 'adopt-one'})
        self.assertIsNone(self.progress.get(self.item['id'])['native_run'])

    def test_resume_replay_does_not_create_again_and_same_provider_binding_changes_once(self):
        value = self.start()
        self.host.binding.update(terminalHandle='resumed', ptyId='resumed-pty', processIncarnation='resumed-incarnation',
                                 statusProcessIncarnation='resumed-pty:resumed-incarnation')
        body = {'native_run_id': value['native_run']['id'], 'expected_binding_revision': value['native_run']['binding_revision'], 'client_token': 'resume-one'}
        resumed = self.progress.resume(self.item['id'], body)
        self.assertEqual(resumed['native_run']['terminal_binding']['terminalHandle'], 'resumed')
        replay = self.progress.resume(self.item['id'], body)
        self.assertEqual(replay['native_run']['binding_revision'], resumed['native_run']['binding_revision'])
        self.assertEqual(self.host.create_calls, 2)

    def test_status_incarnation_is_checked_separately_from_prompt_receipt_identity(self):
        self.start()
        self.host.reply['binding']['statusProcessIncarnation'] = 'pty:old-status-incarnation'
        result = self.done('Stale status text')
        self.assertIsNone(result['current_delivery'])
        self.assertEqual(result['native_run']['observation_state'], 'unknown')

    def test_schema_two_through_nine_upgrade_with_preserved_rows(self):
        from control_everything.profiles.task_migration import migrate_tasks
        for version in range(2, 10):
            with self.subTest(version=version):
                root = self.root / f'schema-{version}'
                root.mkdir()
                (root / 'profile.json').write_text(json.dumps(DEFAULT_CONFIG), encoding='utf-8')
                db = root / 'workspace-state.sqlite3'
                with closing(sqlite3.connect(db)) as c:
                    getattr(task_schema, f'install_schema{version}')(c, fresh=True)
                    c.execute("INSERT INTO projects VALUES('project','Keep history',0,'then','then',0)")
                    c.commit()
                result = migrate_tasks(str(root))
                self.assertEqual(result['schema_version'], 10)
                with closing(sqlite3.connect(db)) as c:
                    task_schema.validate_schema(c, 10)
                    self.assertEqual(c.execute("SELECT name FROM projects WHERE id='project'").fetchone()[0], 'Keep history')

    def test_observer_database_lock_budget_and_close_are_bounded(self):
        from control_everything.workspace.native_progress_observer import NativeProgressObserver
        held, release = threading.Event(), threading.Event()
        def hold_lock():
            with self.store.write_lock:
                held.set()
                release.wait(3)
        thread = threading.Thread(target=hold_lock)
        thread.start()
        self.assertTrue(held.wait(1))
        observer = NativeProgressObserver(self.progress)
        try:
            observer.start()
            start = time.monotonic()
            observer.close()
            self.assertLess(time.monotonic() - start, 2)
            self.assertFalse(observer.thread.is_alive())
        finally:
            release.set()
            thread.join(1)


if __name__ == '__main__':
    unittest.main()
