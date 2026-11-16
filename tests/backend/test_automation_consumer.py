"""Synchronous planning consumption with durable waits and synthetic native facts."""
import copy
import json

from control_everything.workspace.automation_flow import AutomationQueue
from tests.backend.test_automation_queue import AutomationQueueFixture
from tests.backend.test_native_progress import FakeHost


class PlanningHost(FakeHost):
    def __init__(self):
        super().__init__()
        self.calls = []
        self.kind, self.verdict, self.code_verdict, self.model = 'small', 'approve', 'approve', 'requested'
        self.code_text = None
        self.questions = []

    def create(self, params, *, cancel_event=None):
        self.calls.append(copy.deepcopy(params))
        if not getattr(self, 'reuse_session', False):
            self.binding['providerSession']['id'] = str(len(self.calls))
        return super().create(params)

    def observe(self, binding, **kwargs):
        prompt = self.calls[-1]['prompt']
        value = ({'verdict': self.code_verdict, 'rationale': 'Implementation checked.'}
                 if prompt.startswith('CODE_REVIEW') else
                 {'kind': self.kind, 'plan': 'Read code and verify.', 'needs_human': False, 'questions': self.questions}
                 if 'PLAN_REVIEW' not in prompt else
                 {'kind': self.kind, 'verdict': self.verdict, 'rationale': 'Scope checked.', 'questions': self.questions})
        reply = copy.deepcopy(self.reply)
        reply['binding'] = copy.deepcopy(binding)
        message = self.code_text if prompt.startswith('CODE_REVIEW') and self.code_text else json.dumps(value)
        reply['status'].update(providerSession=binding['providerSession'], state='done', turnEndedAt=120,
                               turnEndDisposition='identified', lastAssistantMessage=message)
        if self.calls[-1]['model'] == 'gpt-6.1-sol':
            reply['status']['lastAssistantMessage'] = 'Implemented; model claims tests passed.'
        if self.model is not None:
            reply['status']['model'] = self.calls[-1]['model'] if self.model == 'requested' else self.model
        return reply


class ConsumerTests(AutomationQueueFixture):
    def setUp(self):
        super().setUp()
        from control_everything.workspace.automation_consumer import AutomationConsumer
        self.consumer_type = AutomationConsumer
        self.queue = AutomationQueue(self.profile.store)
        self.host = PlanningHost()
        self.consumer = AutomationConsumer(self.queue, self.host)

    def pump(self, count=30):
        for _ in range(count):
            self.consumer.run_once()
        with self.profile.store.connection() as connection:
            return self.queue._view(connection, connection.execute('SELECT id FROM automation_flows').fetchone()[0])

    def test_small_implementation_is_unverified_and_restart_does_not_call(self):
        cards = []
        self.consumer.on_wait = cards.append
        result = self.pump()
        self.assertEqual(result['flow']['status'], 'waiting_external')
        self.assertEqual(result['flow']['attention']['reason'], 'verification_not_configured')
        self.assertEqual(cards[0]['body']['elements'][1]['value']['reason'], 'verification_not_configured')
        self.assertNotIn('argv', cards[0]['body']['elements'][1]['value'])
        self.assertEqual(len(self.host.calls), 3)
        self.assertEqual([p['model'] for p in self.host.calls], ['gpt-6-astra', 'gpt-6-astra', 'gpt-6.1-sol'])
        self.consumer = self.consumer_type(self.queue, self.host)
        self.pump()
        self.assertEqual(len(self.host.calls), 3)
        with self.profile.store.connection() as connection:
            steps = [dict(row) for row in connection.execute('SELECT * FROM automation_steps ORDER BY ordinal')]
        self.assertEqual([s['kind'] for s in steps], ['prepare', 'plan', 'plan_review', 'implement'])
        review = json.loads(steps[2]['request_json'])
        self.assertEqual(review['review_of']['step_id'], steps[1]['id'])
        self.assertNotEqual(json.loads(steps[2]['binding_json'])['providerSession'], json.loads(steps[1]['binding_json'])['providerSession'])

    def test_feature_waits_for_user(self):
        self.host.kind = 'feature'
        self.assertEqual(self.pump()['flow']['status'], 'waiting_user')

    def test_questions_wait_for_user(self):
        self.host.questions = ['Which scope?']
        cards = []
        self.consumer.on_wait = cards.append
        waiting = self.pump()
        self.assertEqual(waiting['flow']['attention']['questions'], ['Which scope?'])
        value = cards[0]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'human_decision_required')
        self.assertEqual(value['flow_id'], waiting['flow']['id'])
        self.assertNotIn('choice', value)

    def test_revisions_preserve_two_round_budget(self):
        self.host.verdict = 'revise'
        cards = []
        self.consumer.on_wait = cards.append
        result = self.pump(60)
        self.assertEqual(result['flow']['attention']['reason'], 'plan_revision_limit')
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'plan_revision_limit')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('choice', value)
        self.assertEqual(len(self.host.calls), 6)
        with self.profile.store.connection() as connection:
            attempts = [json.loads(r[0])['plan_attempt'] for r in connection.execute("SELECT request_json FROM automation_steps WHERE kind='plan' ORDER BY ordinal")]
        self.assertEqual(attempts, [0, 1, 2])

    def test_missing_or_wrong_model_stops_without_review(self):
        cards = []
        self.consumer.on_wait = cards.append
        self.host.model = None
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'model_unobserved')
        self.assertEqual(len(self.host.calls), 1)
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'model_unobserved')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('choice', value)

    def test_wrong_model_stops(self):
        cards = []
        self.consumer.on_wait = cards.append
        self.host.model = 'gpt-6.1-sol'
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'model_mismatch')
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'model_mismatch')
        self.assertNotIn('choice', value)
        self.assertNotIn('gpt-6.1-sol', str(value))

    def test_archived_project_invalidates_a_release_wait(self):
        from tests.backend.test_automation_queue import bind_actor
        self.host.kind = 'feature'
        cards = []
        self.consumer.on_wait = cards.append
        waiting = self.pump()
        self.assertIs(waiting['flow']['attention'].get('release_ready'), True)
        revision = cards[0]['body']['elements'][1]['value']['requirement_revision']
        self.change_project(archived=True)
        bind_actor(self.profile.store, self.project['id'], 'ou-owner')
        self._store_release(waiting['flow']['id'], revision)
        calls = len(self.host.calls)
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'project_unavailable')
        self.assertIsNot(result['flow']['attention'].get('release_ready'), True)
        value = [card['body']['elements'][1]['value'] for card in cards
                 if card['body']['elements'][1]['value'].get('reason') == 'project_unavailable'][-1]
        self.assertEqual(value['flow_id'], waiting['flow']['id'])
        self.assertNotIn('choice', value)
        with self.profile.store.connection() as connection:
            implements = connection.execute("SELECT id FROM automation_steps WHERE kind='implement'").fetchall()
        self.assertEqual(implements, [])
        self.assertEqual(len(self.host.calls), calls)

    def test_changed_directory_invalidates_a_release_wait(self):
        from tests.backend.test_automation_queue import bind_actor
        self.host.kind = 'feature'
        cards = []
        self.consumer.on_wait = cards.append
        waiting = self.pump()
        self.assertIs(waiting['flow']['attention'].get('release_ready'), True)
        revision = cards[0]['body']['elements'][1]['value']['requirement_revision']
        self.change_project()
        bind_actor(self.profile.store, self.project['id'], 'ou-owner')
        self._store_release(waiting['flow']['id'], revision)
        calls = len(self.host.calls)
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'project_directory_changed')
        self.assertIsNot(result['flow']['attention'].get('release_ready'), True)
        value = [card['body']['elements'][1]['value'] for card in cards
                 if card['body']['elements'][1]['value'].get('reason') == 'project_directory_changed'][-1]
        self.assertEqual(value['flow_id'], waiting['flow']['id'])
        self.assertNotIn('choice', value)
        with self.profile.store.connection() as connection:
            implements = connection.execute("SELECT id FROM automation_steps WHERE kind='implement'").fetchall()
        self.assertEqual(implements, [])
        self.assertEqual(len(self.host.calls), calls)

    def test_changed_requirement_invalidates_a_release_wait(self):
        from tests.backend.test_automation_queue import bind_actor
        self.host.kind = 'feature'
        cards = []
        self.consumer.on_wait = cards.append
        waiting = self.pump()
        self.assertIs(waiting['flow']['attention'].get('release_ready'), True)
        revision = cards[0]['body']['elements'][1]['value']['requirement_revision']
        with self.profile.store.connection() as connection:
            connection.execute('UPDATE task_items SET revision=revision+1 WHERE id=?', (self.item['id'],))
        bind_actor(self.profile.store, self.project['id'], 'ou-owner')
        self._store_release(waiting['flow']['id'], revision)
        calls = len(self.host.calls)
        result = self.pump()
        self.assertEqual(result['flow']['status'], 'waiting_external')
        self.assertEqual(result['flow']['attention']['reason'], 'requirement_changed')
        self.assertIsNot(result['flow']['attention'].get('release_ready'), True)
        value = [card['body']['elements'][1]['value'] for card in cards
                 if card['body']['elements'][1]['value'].get('reason') == 'requirement_changed'][-1]
        self.assertEqual(value['flow_id'], waiting['flow']['id'])
        self.assertEqual(value['requirement_revision'], revision)
        self.assertNotIn('choice', value)
        with self.profile.store.connection() as connection:
            implements = connection.execute("SELECT id FROM automation_steps WHERE kind='implement'").fetchall()
        self.assertEqual(implements, [])
        self.assertEqual(len(self.host.calls), calls)

    def test_same_session_review_does_not_reach_acceptance(self):
        cards = []
        self.consumer.on_wait = cards.append
        self.host.reuse_session = True
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'independent_review_required')
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'independent_review_required')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('choice', value)
        self.assertNotIn('verdict', value)
        self.assertNotIn('awaiting_acceptance', [result['flow']['status']])

    def test_requirement_change_before_dispatch_waits(self):
        cards = []
        self.consumer.on_wait = cards.append
        self.consumer.run_once()
        with self.profile.store.connection() as connection:
            connection.execute('UPDATE task_items SET revision=revision+1 WHERE id=?', (self.item['id'],))
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'requirement_changed')
        self.assertEqual(len(self.host.calls), 0)
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'requirement_changed')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertEqual(value['requirement_revision'], result['flow']['context']['requirement_revision'])
        self.assertNotIn('choice', value)

    def test_offline_keeps_event_unclaimed(self):
        self.host.available = False
        self.consumer.run_once()
        with self.profile.store.connection() as connection:
            self.assertIsNone(connection.execute('SELECT flow_id FROM automation_events').fetchone()[0])

    def test_non_codex_does_not_block_supported_task_in_same_project(self):
        with self.profile.store.connection() as connection:
            payload = json.loads(connection.execute('SELECT payload_json FROM automation_events').fetchone()[0])
            payload['request']['agent'] = 'claude'
            connection.execute('UPDATE automation_events SET payload_json=?', (json.dumps(payload),))
        other = self.profile.store.save_item({'title': 'Second task', 'project_id': self.project['id'],
            'provider_id': None, 'state': 'todo', 'session_key': None})
        self.service.enable_task_automation(other['id'], {**self.body, 'client_token': 'supported'})
        self.pump(35)
        with self.profile.store.connection() as connection:
            unsupported = dict(connection.execute('SELECT * FROM automation_flows WHERE task_id=?', (self.item['id'],)).fetchone())
            self.assertEqual(json.loads(unsupported['attention_json'])['reason'], 'agent_not_supported')
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_steps WHERE flow_id=?', (unsupported['id'],)).fetchone()[0], 0)
        self.assertEqual(len(self.host.calls), 3)

    def test_stale_owner_and_revision_cannot_write_wait(self):
        from control_everything.input_validation import ProfileError
        now = [1000.0]
        queue = AutomationQueue(self.profile.store, clock=lambda: now[0])
        lease = queue.acquire()
        step = queue.claim(lease, self.event['id'])['step']
        now[0] += 61
        replacement = AutomationQueue(self.profile.store, clock=lambda: now[0])
        new_lease = replacement.acquire()
        with self.assertRaisesRegex(ProfileError, 'automation_owner_lost'):
            queue.wait(lease, step, 'waiting_external', 'prepare', {})
        current = replacement.claim(new_lease, self.event['id'])['step']
        from control_everything.workspace.automation_launch import AutomationLaunch
        AutomationLaunch(replacement, self.host).prepare(new_lease, current)
        with self.assertRaisesRegex(ProfileError, 'automation_step_changed'):
            replacement.wait(new_lease, current, 'waiting_external', 'prepare', {})

    def test_changed_plan_does_not_start_implementation(self):
        from unittest.mock import patch
        from control_everything.input_validation import ProfileError
        cards = []
        self.consumer.on_wait = cards.append
        with patch('control_everything.workspace.automation_consumer.planning_outcome',
                   side_effect=ProfileError('automation_plan_changed')):
            result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'automation_plan_changed')
        self.assertNotEqual(result['flow']['status'], 'waiting_user')
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'automation_plan_changed')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('choice', value)
        with self.profile.store.connection() as connection:
            implements = connection.execute("SELECT id FROM automation_steps WHERE kind='implement'").fetchall()
        self.assertEqual(implements, [])

    def test_invalid_completed_output_waits_without_relaunch(self):
        observe = self.host.observe
        def invalid(binding, **kwargs):
            reply = observe(binding, **kwargs)
            reply['status']['lastAssistantMessage'] = 'not JSON'
            return reply
        self.host.observe = invalid
        cards = []
        self.consumer.on_wait = cards.append
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'invalid_planning_result')
        self.assertEqual(len(self.host.calls), 1)
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'invalid_planning_result')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('choice', value)
        self.assertNotIn('verdict', value)

    def test_unknown_operation_replays_exact_request(self):
        calls = []
        create = self.host.create
        def lost(params, *, cancel_event=None):
            calls.append(copy.deepcopy(params))
            if len(calls) == 1:
                raise TimeoutError('unknown external result')
            return create(params)
        self.host.create = lost
        self.pump()
        self.assertEqual(calls[0], calls[1])

    def test_reservation_rechecks_versions_inside_transaction(self):
        from control_everything.input_validation import ProfileError
        from control_everything.workspace.automation_launch import AutomationLaunch
        lease = self.queue.acquire()
        step = self.queue.claim(lease, self.event['id'])['step']
        step = AutomationLaunch(self.queue, self.host).prepare(lease, step)
        with self.profile.store.connection() as connection:
            connection.execute('UPDATE task_items SET revision=revision+1 WHERE id=?', (self.item['id'],))
        with self.assertRaisesRegex(ProfileError, 'automation_requirement_changed'):
            self.queue.reserve_next(lease, step, 'plan', {'params': {}}, writes_project=False)

    def test_selector_rotates_between_running_flows(self):
        other = self.profile.store.save_item({'title': 'Second task', 'project_id': self.project['id'],
            'provider_id': None, 'state': 'todo', 'session_key': None})
        self.service.enable_task_automation(other['id'], {**self.body, 'client_token': 'second'})
        for _ in range(6):
            self.consumer.run_once()
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_flows').fetchone()[0], 2)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM automation_steps WHERE kind='plan'").fetchone()[0], 2)

    def test_completed_steps_resume_after_owner_replacement(self):
        now = [1000.0]
        self.queue.clock = lambda: now[0]
        for _ in range(10):
            self.consumer.run_once()
        calls = len(self.host.calls)
        now[0] += 61
        queue = AutomationQueue(self.profile.store, clock=lambda: now[0])
        self.consumer = self.consumer_type(queue, self.host)
        self.assertEqual(self.pump()['flow']['status'], 'waiting_external')
        self.assertEqual(len(self.host.calls), calls)

    def change_project(self, archived=False):
        from tests.backend.test_project_management import project_expected, project_body
        body = project_body(self.root / ('repo' if archived else 'moved'), id=self.project['id'],
                            archived=archived, expected=project_expected(self.project))
        self.profile.store.save_project(body)

    def test_project_archive_after_prepare_preserves_result_without_dispatch(self):
        cards = []
        self.consumer.on_wait = cards.append
        self.consumer.run_once()
        self.change_project(archived=True)
        result = self.pump()
        self.assertEqual(result['flow']['status'], 'waiting_external')
        self.assertEqual(result['flow']['attention']['reason'], 'project_unavailable')
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'project_unavailable')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('choice', value)
        self.assertEqual(result['step']['kind'], 'prepare')
        self.assertIn('scope', result['step']['result'])
        self.assertEqual(len(self.host.calls), 0)

    def test_directory_change_after_plan_reserved_prevents_create(self):
        cards = []
        self.consumer.on_wait = cards.append
        self.consumer.run_once()
        self.consumer.run_once()
        self.change_project()
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'project_directory_changed')
        self.assertEqual(result['step']['kind'], 'plan')
        self.assertEqual(len(self.host.calls), 0)
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'project_directory_changed')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('choice', value)

    def test_prompts_include_classification_and_review_contract(self):
        self.pump()
        for call in [call for call in self.host.calls if call.get('readOnly') is True]:
            for rule in ('not new features', 'public interfaces', 'classification reasons',
                         'requirements coverage', 'implementation evidence', 'overengineering',
                         'risks', 'acceptance methods', 'two automatic revision rounds',
                         'AI approval is not human approval', 'untrusted data'):
                self.assertIn(rule, call['prompt'])

    def test_native_roles_do_not_delegate_or_take_over_platform_stages(self):
        self.pump()
        plan, review, implement = [call['prompt'] for call in self.host.calls]
        for prompt in (plan, review, implement):
            for rule in ('The platform exclusively schedules stages, models and revision budgets',
                         'Do not spawn or delegate to other agents',
                         'If repository rules conflict or information is missing, report it honestly'):
                self.assertIn(rule, prompt)
        self.assertIn('Read necessary source files yourself and propose this plan only', plan)
        self.assertIn('Do not organize a review', plan)
        self.assertIn('Independently read necessary source files yourself and assess only the frozen plan', review)
        self.assertIn('Return one approve/revise/discuss decision; do not revise the plan or start implementation', review)
        self.assertIn('The platform may schedule at most two automatic revision rounds', review)
        self.assertIn('Implement the frozen scope yourself', implement)
        self.assertIn('Do not run other stages or approve your own work', implement)

    def test_reservation_rechecks_project_binding_in_transaction(self):
        from control_everything.input_validation import ProfileError
        self.consumer.run_once()
        lease = self.queue.acquire()
        step = self.queue.claim(lease, self.event['id'])['step']
        self.change_project()
        with self.assertRaisesRegex(ProfileError, 'project_directory_changed'):
            self.queue.reserve_next(lease, step, 'plan', {'params': {}}, writes_project=False)
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_steps').fetchone()[0], 1)
            self.assertEqual(self.queue.get_step(step['id'])['result'], step['result'])

    def test_project_change_during_renew_cannot_dispatch_reserved_plan(self):
        self.consumer.run_once()
        self.consumer.run_once()
        renew = self.queue.renew
        def revoke(lease):
            self.change_project(archived=True)
            return renew(lease)
        self.queue.renew = revoke
        self.consumer.run_once()
        with self.profile.store.connection() as connection:
            result = self.queue._view(connection, connection.execute('SELECT id FROM automation_flows').fetchone()[0])
        self.assertEqual(result['flow']['attention']['reason'], 'project_unavailable')
        self.assertEqual(result['step']['status'], 'reserved')
        self.assertEqual(len(self.host.calls), 0)

    def test_new_planning_requests_freeze_read_only(self):
        self.host.verdict = 'revise'
        self.pump(60)
        self.assertTrue(all(call.get('readOnly') is True for call in self.host.calls))

    def test_explicit_read_only_refusal_waits_without_retry(self):
        def refuse(params, *, cancel_event=None):
            self.host.calls.append(copy.deepcopy(params))
            return {'contractVersion': 1, 'refused': True, 'reason': 'read_only_launch_args_unsupported'}
        self.host.create = refuse
        cards = []
        self.consumer.on_wait = cards.append
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'read_only_launch_args_unsupported')
        self.assertEqual(result['step']['status'], 'failed')
        self.assertEqual(len(self.host.calls), 1)
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'read_only_launch_args_unsupported')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('choice', value)
        self.assertNotIn('verdict', value)
        self.consumer = self.consumer_type(self.queue, self.host)
        self.pump()
        self.assertEqual(len(self.host.calls), 1)

    def test_legacy_unbound_requests_are_not_reissued(self):
        for status, reason in [('reserved', 'read_only_request_missing'),
                               ('dispatching', 'legacy_launch_outcome_unknown'),
                               ('unknown', 'legacy_launch_outcome_unknown')]:
            with self.subTest(status=status):
                # Restore this fixture's flow to the planning dispatch boundary.
                if status == 'reserved':
                    self.consumer.run_once()
                    self.consumer.run_once()
                with self.profile.store.connection() as connection:
                    row = connection.execute("SELECT * FROM automation_steps WHERE kind='plan'").fetchone()
                    request = json.loads(row['request_json'])
                    request['params'].pop('readOnly', None)
                    connection.execute('UPDATE automation_steps SET request_json=?,status=? WHERE id=?',
                                       (json.dumps(request), status, row['id']))
                    connection.execute("UPDATE automation_flows SET status='running' WHERE id=?", (row['flow_id'],))
                result = self.pump(2)
                self.assertEqual(result['flow']['attention']['reason'], reason)
                self.assertEqual(result['step']['operation_id'], row['operation_id'])
                self.assertEqual(len(self.host.calls), 0)

    def test_legacy_bound_step_is_observed_then_waits_without_new_create(self):
        for _ in range(3):
            self.consumer.run_once()
        with self.profile.store.connection() as connection:
            step = connection.execute("SELECT * FROM automation_steps WHERE kind='plan'").fetchone()
            request = json.loads(step['request_json'])
            request['params'].pop('readOnly')
            connection.execute('UPDATE automation_steps SET request_json=? WHERE id=?', (json.dumps(request), step['id']))
        cards = []
        self.consumer.on_wait = cards.append
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'read_only_result_unverified')
        self.assertEqual(result['step']['status'], 'completed')
        self.assertIn('facts', result['step']['result'])
        self.assertEqual(len(self.host.calls), 1)
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'read_only_result_unverified')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('choice', value)
        self.assertNotIn('verdict', value)

    def test_failed_read_only_refusal_recovers_wait_after_interruption(self):
        self.consumer.run_once()
        self.consumer.run_once()
        def refuse(params, *, cancel_event=None):
            self.host.calls.append(params)
            return {'contractVersion': 1, 'refused': True, 'reason': 'read_only_command_override_unsupported'}
        self.host.create = refuse
        self.consumer.run_once()
        self.consumer = self.consumer_type(self.queue, self.host)
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'read_only_command_override_unsupported')
        self.assertEqual(len(self.host.calls), 1)

    def review_boundary(self):
        for _ in range(7):
            self.consumer.run_once()
        with self.profile.store.connection() as connection:
            view = self.queue._view(connection, connection.execute('SELECT id FROM automation_flows').fetchone()[0])
        self.assertEqual((view['step']['kind'], view['step']['status']), ('plan_review', 'completed'))
        return view

    def test_small_approval_reserves_one_sol_implementation_with_frozen_references(self):
        from control_everything.workspace.native_progress import digest
        view = self.review_boundary()
        step = self.consumer._advance(self.consumer.lease, view, view['step'])
        self.assertEqual(step['kind'], 'implement')
        self.assertEqual(step['writes_project'], 1)
        request = step['request']
        self.assertEqual(request['params']['model'], 'gpt-6.1-sol')
        self.assertIsNot(request['params'].get('readOnly'), True)
        review = view['step']
        plan = self.queue.get_step(review['request']['review_of']['step_id'])
        for name in ('runtimeId', 'environmentId', 'repoId', 'worktreeId', 'cwd'):
            self.assertEqual(request['params'][name], review['request']['params'][name])
        self.assertEqual(request['plan_step_id'], plan['id'])
        self.assertEqual(request['review_step_id'], review['id'])
        self.assertEqual(request['plan_hash'], digest(plan['result']['text']))
        self.assertEqual(request['review_hash'], digest(review['result']['text']))
        self.assertEqual(request['context'], view['flow']['context'])
        replay = self.consumer._advance(self.consumer.lease, view, review)
        self.assertEqual(replay['id'], step['id'])
        self.assertEqual(replay['operation_id'], step['operation_id'])

    def test_write_slot_defers_same_review_without_another_flow(self):
        view = self.review_boundary()
        other = self.profile.store.save_item({'title': 'Other task', 'project_id': self.project['id'],
            'provider_id': None, 'state': 'todo', 'session_key': None})
        event = self.service.enable_task_automation(other['id'], {**self.body, 'client_token': 'write-slot'})
        occupied = self.queue.claim(self.consumer.lease, event['id'])
        self.assertIsNone(self.consumer._advance(self.consumer.lease, view, view['step']))
        self.consumer.launch.prepare(self.consumer.lease, occupied['step'])
        self.assertEqual(self.consumer._advance(self.consumer.lease, view, view['step'])['kind'], 'implement')
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_flows').fetchone()[0], 2)

    def test_cancel_before_implementation_reservation_keeps_review(self):
        import threading
        view = self.review_boundary()
        stop = threading.Event()
        stop.set()
        self.assertIsNone(self.consumer._advance(self.consumer.lease, view, view['step'], cancel_event=stop))
        self.assertEqual(self.queue.get_step(view['step']['id'])['status'], 'completed')

    def test_wrong_actual_implementation_model_waits_without_success(self):
        self.review_boundary()
        self.consumer.run_once()
        self.host.model = 'gpt-6-astra'
        result = self.pump()
        self.assertEqual(result['step']['kind'], 'implement')
        self.assertEqual(result['flow']['attention']['reason'], 'model_mismatch')
        self.assertEqual(result['flow']['attention']['expected_model'], 'gpt-6.1-sol')

    def test_old_implementation_not_connected_wait_does_not_wake(self):
        view = self.review_boundary()
        self.queue.wait(self.consumer.lease, view['step'], 'waiting_external', 'implementation',
                        {'reason': 'implementation_not_connected'})
        self.consumer = self.consumer_type(self.queue, self.host)
        self.pump()
        self.assertEqual(len(self.host.calls), 2)

    def test_unknown_implementation_replays_original_request_and_keeps_write_slot(self):
        self.review_boundary()
        self.consumer.run_once()
        calls, created = [], []
        create = self.host.create
        def lost(params, *, cancel_event=None):
            calls.append(copy.deepcopy(params))
            if not created:
                created.append(create(params, cancel_event=cancel_event))
                raise TimeoutError('lost implementation create reply')
            return created[0]
        self.host.create = lost
        step = self.consumer.run_once()
        self.assertEqual((step['kind'], step['status'], step['writes_project']), ('implement', 'unknown', 1))
        result = self.pump()
        self.assertEqual(calls[0], calls[1])
        self.assertEqual(len(self.host.calls), 3)
        self.assertEqual(result['flow']['attention']['reason'], 'verification_not_configured')
        self.assertEqual(result['flow']['attention']['implement_step_id'], step['id'])

    def test_changed_requirement_after_review_does_not_dispatch_implementation(self):
        self.review_boundary()
        with self.profile.store.connection() as connection:
            connection.execute('UPDATE task_items SET revision=revision+1 WHERE id=?', (self.item['id'],))
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'requirement_changed')
        self.assertEqual(len(self.host.calls), 2)

    def test_feature_waits_for_a_person_then_needs_independent_code_review(self):
        self.host.kind = 'feature'
        self.configure_verification()
        cards = []
        def fail_after_capture(card):
            cards.append(card)
            raise RuntimeError('card transport down')
        self.consumer.on_wait = fail_after_capture
        waiting = self.pump()
        self.assertEqual(waiting['flow']['status'], 'waiting_user')
        self.assertTrue(waiting['flow']['attention']['requires_code_review'])
        self.assertEqual(cards[0]['body']['elements'][1]['value']['choice'], '按已审方案实现')
        self.assertEqual(cards[0]['body']['elements'][1]['value']['flow_id'], waiting['flow']['id'])
        from control_everything.workspace.automation_human_decisions import apply_waiting_reply
        apply_waiting_reply(self.consumer, waiting['flow'], cards[0]['body']['elements'][1]['value'], 'owner')
        result = self.pump()
        self.assertEqual(result['flow']['status'], 'awaiting_acceptance', result['flow'])
        accepted = [card for card in cards if card['body']['elements'][1]['value'].get('verdict') == 'approved']
        self.assertEqual(accepted[0]['body']['elements'][1]['value']['delivery_id'],
                         result['flow']['attention']['delivery_id'])
        self.assertEqual(accepted[0]['body']['elements'][1]['text']['content'], '这个版本通过，集成 develop')
        verdicts = [item['value']['verdict'] for item in accepted[0]['body']['elements'] if item.get('tag') == 'button']
        self.assertEqual(verdicts, ['approved', 'changes_requested', 'rejected'])
        self.assertEqual({item['value']['delivery_id'] for item in accepted[0]['body']['elements'] if item.get('tag') == 'button'},
                         {result['flow']['attention']['delivery_id']})
        with self.profile.store.connection() as connection:
            kinds = [row['kind'] for row in connection.execute(
                'SELECT kind FROM automation_steps ORDER BY ordinal')]
        self.assertIn('code_review', kinds)

    def test_invalid_code_review_does_not_reach_acceptance(self):
        from control_everything.workspace.automation_human_decisions import apply_waiting_reply
        self.host.kind = 'feature'
        self.host.code_text = 'not json'
        self.configure_verification()
        cards = []
        self.consumer.on_wait = cards.append
        waiting = self.pump()
        apply_waiting_reply(self.consumer, waiting['flow'], cards[0]['body']['elements'][1]['value'], 'owner')
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'invalid_code_review')
        self.assertNotEqual(result['flow']['status'], 'awaiting_acceptance')
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'invalid_code_review')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('verdict', value)
        self.assertNotIn('choice', value)

    def test_code_review_revise_shares_two_repair_rounds(self):
        self.host.kind = 'feature'
        self.host.code_verdict = 'revise'
        self.configure_verification()
        cards = []
        self.consumer.on_wait = cards.append
        waiting = self.pump()
        from control_everything.workspace.automation_human_decisions import apply_waiting_reply
        apply_waiting_reply(self.consumer, waiting['flow'], cards[0]['body']['elements'][1]['value'], 'owner')
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'repair_budget_exhausted')
        budget = [card for card in cards if card['body']['elements'][1]['value'].get('reason') == 'repair_budget_exhausted']
        self.assertEqual(budget[0]['body']['elements'][1]['value']['flow_id'], result['flow']['id'])
        self.assertNotIn('choice', budget[0]['body']['elements'][1]['value'])
        with self.profile.store.connection() as connection:
            repairs = [row for row in connection.execute("SELECT request_json FROM automation_steps WHERE kind='implement'")]
        self.assertEqual(sum(1 for row in repairs if json.loads(row['request_json']).get('repair_of')), 2)

    def _store_release(self, flow_id, revision, message_id='om-release'):
        from control_everything.workspace.automation_remote_inbox import RemoteAutomationInbox
        binding = {'hub_origin': 'https://hub.example.test', 'device_id': 'device', 'generation': 1,
                   'credential_revision': 1}
        RemoteAutomationInbox(self.profile.store).receive(binding, {
            'id': message_id, 'source': 'feishu:test', 'event_id': message_id, 'lease_id': 'lease',
            'lease_expires_at': 10, 'payload': {
                'kind': 'feishu_plan_release', 'project_id': self.project['id'], 'app_id': 'app',
                'actor_open_id': 'ou-owner',
                'plan_release': {'namespace': 'control-everything.automation.v1', 'flow_id': flow_id,
                                 'text': '按已审方案实现', 'requirement_revision': revision}}})
        self.consumer.current_binding = lambda: binding

    def test_stored_release_starts_the_named_wait_once(self):
        self.host.kind = 'feature'
        self.configure_verification()
        cards = []
        self.consumer.on_wait = cards.append
        waiting = self.pump()
        revision = cards[0]['body']['elements'][1]['value']['requirement_revision']
        self._store_release(waiting['flow']['id'], revision)
        from tests.backend.test_automation_queue import bind_actor, designate_actor
        bind_actor(self.profile.store, self.project['id'], 'ou-owner')
        designate_actor(self.profile.store, self.item['id'], 'ou-owner')
        with self.profile.store.connection() as connection:
            connection.execute("UPDATE automation_remote_inbox SET ack_state='acknowledged'")
        result = self.pump()
        self.assertEqual(result['flow']['status'], 'awaiting_acceptance', result['flow'])
        with self.profile.store.connection() as connection:
            implements = connection.execute("SELECT id FROM automation_steps WHERE kind='implement'").fetchall()
        self.assertEqual(len(implements), 1)

    def test_stale_stored_release_does_not_start_implementation(self):
        self.host.kind = 'feature'
        self.configure_verification()
        cards = []
        self.consumer.on_wait = cards.append
        waiting = self.pump()
        revision = cards[0]['body']['elements'][1]['value']['requirement_revision']
        calls = len(self.host.calls)
        self._store_release(waiting['flow']['id'], revision + 1)
        self.pump()
        with self.profile.store.connection() as connection:
            status = self.queue._view(connection, waiting['flow']['id'])['flow']['status']
            implements = connection.execute("SELECT id FROM automation_steps WHERE kind='implement'").fetchall()
        self.assertEqual(status, 'waiting_user')
        self.assertEqual(implements, [])
        self.assertEqual(len(self.host.calls), calls)

    def test_actor_bound_to_another_project_does_not_release(self):
        from tests.backend.test_project_management import project_body
        from tests.backend.test_automation_queue import bind_actor
        self.host.kind = 'feature'
        self.configure_verification()
        cards = []
        self.consumer.on_wait = cards.append
        waiting = self.pump()
        revision = cards[0]['body']['elements'][1]['value']['requirement_revision']
        other = self.profile.store.save_project(project_body(self.root / 'other'))
        bind_actor(self.profile.store, other['id'], 'ou-owner')
        calls = len(self.host.calls)
        self._store_release(waiting['flow']['id'], revision)
        self.pump()
        with self.profile.store.connection() as connection:
            status = self.queue._view(connection, waiting['flow']['id'])['flow']['status']
            implements = connection.execute("SELECT id FROM automation_steps WHERE kind='implement'").fetchall()
        self.assertEqual(status, 'waiting_user')
        self.assertEqual(implements, [])
        self.assertEqual(len(self.host.calls), calls)

    def test_discuss_does_not_dispatch_implementation(self):
        self.host.kind = 'feature'
        self.host.verdict = 'discuss'
        cards = []
        self.consumer.on_wait = cards.append
        waiting = self.pump()
        self.assertEqual(waiting['flow']['status'], 'waiting_user')
        self.assertEqual(len(self.host.calls), 2)
        self.assertNotEqual(waiting['flow']['attention'].get('release_ready'), True)
        self.assertEqual(cards[0]['body']['elements'][1]['value']['reason'], 'human_decision_required')
        self.assertNotIn('choice', cards[0]['body']['elements'][1]['value'])
        calls = len(self.host.calls)
        self._store_release(waiting['flow']['id'], cards[0]['body']['elements'][1]['value']['requirement_revision'])
        self.pump()
        self.assertEqual(len(self.host.calls), calls)

    def configure_verification(self, program="print('verified')", timeout=3):
        import sys
        repo = self.root / 'repo'
        repo.mkdir(exist_ok=True)
        (repo / 'input.txt').write_bytes(b'tested version one')
        spec = {'argv': [sys.executable, '-B', '-c', program], 'source_files': ['input.txt'], 'timeout': timeout}
        with self.profile.store.connection() as connection:
            connection.execute('DELETE FROM automation_events WHERE id=?', (self.event['id'],))
        self.event = self.service.enable_task_automation(self.item['id'], {**self.body, 'verification': spec})
        self.verification_calls = []
        def verify(step, flow):
            from control_everything.execution.verification import run_verification
            output = self.profile.data_dir / 'automation-verification' / flow['id'] / step['id']
            self.verification_calls.append(step['id'])
            receipt = run_verification(**step['request']['verification'], cwd=step['request']['scope']['cwd'],
                output_dir=output, task_id=flow['task_id'], flow_id=flow['id'], step_id=step['id'])
            return {'receipt': receipt, 'output_dir': str(output)}
        def check(step, flow):
            from control_everything.execution.verification import read_verification_receipt
            output = self.profile.data_dir / 'automation-verification' / flow['id'] / step['id']
            spec = step['request']['verification']
            return {'receipt': read_verification_receipt(output_dir=output, argv=spec['argv'],
                cwd=step['request']['scope']['cwd'], task_id=flow['task_id'], flow_id=flow['id'],
                step_id=step['id'], source_files=spec['source_files']), 'output_dir': str(output)}
        self.consumer = self.consumer_type(self.queue, self.host, verification=verify, check_verification=check)
        return verify

    def test_verification_real_command_passes_and_binary_logs_are_persisted(self):
        self.configure_verification("import sys; sys.stdout.buffer.write(b'x'*90000); sys.stderr.buffer.write(b'y'*70000)")
        result = self.pump()
        self.assertEqual(result['step']['kind'], 'verify')
        self.assertEqual(result['step']['status'], 'completed')
        self.assertEqual(result['flow']['status'], 'awaiting_acceptance')
        receipt = result['step']['result']['receipt']
        self.assertEqual(receipt['exit_code'], 0)
        from pathlib import Path
        output = Path(result['step']['result']['output_dir'])
        self.assertEqual((output / 'stdout.log').read_bytes(), b'x' * 90000)
        self.assertEqual((output / 'stderr.log').read_bytes(), b'y' * 70000)
        self.assertEqual(self.verification_calls, [result['step']['id']])
        self.pump()
        self.assertEqual(len(self.verification_calls), 1)

    def test_one_failed_verification_repairs_once_then_can_pass(self):
        import sys
        self.configure_verification("print('verified')")
        original = self.consumer.verification
        calls = []
        def verify(step, flow):
            calls.append(step['id'])
            if len(calls) == 1:
                step = {**step, 'request': {**step['request'], 'verification': {
                    **step['request']['verification'], 'argv': [sys.executable, '-B', '-c', 'import sys; sys.exit(7)']}}}
            return original(step, flow)
        self.consumer.verification = verify
        result = self.pump()
        self.assertEqual(result['flow']['status'], 'awaiting_acceptance', result['flow'])
        self.assertEqual(len(calls), 2)
        with self.profile.store.connection() as connection:
            repairs = [json.loads(row['request_json']).get('repair_of') for row in connection.execute(
                "SELECT request_json FROM automation_steps WHERE kind='implement'")]
        self.assertEqual([item['round'] for item in repairs if item], [1])

    def test_verification_real_nonzero_overrides_model_passed_claim(self):
        self.configure_verification("import sys; print('FAILED'); sys.exit(7)")
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'repair_budget_exhausted')
        self.assertEqual(result['step']['result']['receipt']['exit_code'], 7)
        self.assertEqual(result['step']['status'], 'failed')
        with self.profile.store.connection() as connection:
            repairs = [json.loads(row['request_json']).get('repair_of') for row in connection.execute(
                "SELECT request_json FROM automation_steps WHERE kind='implement'")]
        self.assertEqual([item['round'] for item in repairs if item], [1, 2])

    def test_verification_source_identity_is_actual_tested_gap_version(self):
        import hashlib
        self.configure_verification()
        for _ in range(10):
            self.consumer.run_once()
        (self.root / 'repo/input.txt').write_bytes(b'version changed after implementation')
        result = self.pump()
        identity = result['step']['result']['receipt']['source_before']['input.txt']
        self.assertEqual(identity['sha256'], hashlib.sha256(b'version changed after implementation').hexdigest())
        self.assertFalse(result['step']['result']['receipt']['source_changed'])

    def test_unknown_verification_is_not_reexecuted_after_restart(self):
        verify = self.configure_verification()
        for _ in range(11):
            self.consumer.run_once()
        view = self.queue.claim(self.consumer.lease, self.event['id'])
        step = self.queue.record(self.consumer.lease, view['step'], 'dispatching')
        self.consumer = self.consumer_type(self.queue, self.host, verification=verify)
        cards = []
        self.consumer.on_wait = cards.append
        result = self.pump()
        self.assertEqual(result['step']['id'], step['id'])
        self.assertEqual(result['step']['status'], 'unknown')
        self.assertEqual(result['flow']['attention']['reason'], 'verification_unknown')
        self.assertEqual(self.verification_calls, [])
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'verification_unknown')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('choice', value)
        self.assertNotIn('verdict', value)

    def test_verify_dispatch_rechecks_task_version(self):
        self.configure_verification()
        for _ in range(11):
            self.consumer.run_once()
        with self.profile.store.connection() as connection:
            connection.execute('UPDATE task_items SET revision=revision+1 WHERE id=?', (self.item['id'],))
        self.assertEqual(self.pump()['flow']['attention']['reason'], 'requirement_changed')
        self.assertEqual(self.verification_calls, [])

    def test_verify_renew_gap_change_waits_without_executing(self):
        self.configure_verification()
        for _ in range(11):
            self.consumer.run_once()
        renew = self.queue.renew
        def revoke(lease):
            self.change_project(archived=True)
            return renew(lease)
        self.queue.renew = revoke
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'project_unavailable')
        self.assertEqual(result['step']['status'], 'reserved')
        self.assertEqual(self.verification_calls, [])

    def test_verify_dispatch_rechecks_directory_binding(self):
        self.configure_verification()
        for _ in range(11):
            self.consumer.run_once()
        self.change_project()
        self.assertEqual(self.pump()['flow']['attention']['reason'], 'project_directory_changed')
        self.assertEqual(self.verification_calls, [])

    def test_actual_verification_timeout_remains_unknown_and_is_not_retried(self):
        self.configure_verification("import time; print('before timeout',flush=True); time.sleep(2)", timeout=.15)
        result = self.pump()
        self.assertEqual(result['step']['status'], 'unknown')
        self.assertEqual(result['flow']['attention']['reason'], 'verification_unknown')
        self.assertIsNone(result['step']['result']['receipt']['exit_code'])
        self.assertEqual(len(self.verification_calls), 1)
        self.assertEqual(result['step']['writes_project'], 1)

    def test_busy_project_does_not_reach_acceptance(self):
        from control_everything.input_validation import ProfileError
        self.configure_verification()
        for _ in range(12):
            self.consumer.run_once()
        def busy(*args, **kwargs):
            raise ProfileError('automation_project_busy')
        self.queue.publish_delivery = busy
        cards = []
        self.consumer.on_wait = cards.append
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'automation_project_busy')
        self.assertNotEqual(result['flow']['status'], 'awaiting_acceptance')
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'automation_project_busy')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('verdict', value)
        self.assertNotIn('choice', value)

    def test_unpublished_delivery_does_not_reach_acceptance(self):
        from control_everything.input_validation import ProfileError
        self.configure_verification()
        for _ in range(12):
            self.consumer.run_once()
        def refuse(*args, **kwargs):
            raise ProfileError('automation_delivery_unverified')
        self.queue.publish_delivery = refuse
        cards = []
        self.consumer.on_wait = cards.append
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'automation_delivery_unverified')
        self.assertNotEqual(result['flow']['status'], 'awaiting_acceptance')
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'automation_delivery_unverified')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('verdict', value)
        self.assertNotIn('choice', value)

    def test_missing_verification_callback_waits_without_execution(self):
        self.configure_verification()
        cards = []
        self.consumer.on_wait = cards.append
        self.consumer.verification = None
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'verification_callback_unavailable')
        self.assertEqual(self.verification_calls, [])
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'verification_callback_unavailable')
        self.assertEqual(value['flow_id'], result['flow']['id'])
        self.assertNotIn('argv', value)
        self.assertNotIn('choice', value)
        self.assertNotIn('verdict', value)

    def test_disk_receipt_recheck_rejects_wrong_identity_and_changed_log(self):
        from pathlib import Path
        from control_everything.execution.verification import read_verification_receipt
        self.configure_verification()
        result = self.pump()
        receipt = result['step']['result']['receipt']
        identity = {key: receipt[key] for key in ('argv', 'cwd', 'task_id', 'flow_id', 'step_id')}
        output = Path(result['step']['result']['output_dir'])
        self.assertEqual(read_verification_receipt(output_dir=output, **identity), receipt)
        with self.assertRaises(ValueError):
            read_verification_receipt(output_dir=output, **{**identity, 'task_id': 'other'})
        (output / 'stdout.log').write_bytes(b'changed evidence')
        with self.assertRaises(ValueError):
            read_verification_receipt(output_dir=output, **identity)

    def test_close_reports_timeout_while_sync_verifier_is_still_active(self):
        import threading
        from control_everything.workspace.automation_consumer import AutomationConsumerService
        verify = self.configure_verification()
        for _ in range(11):
            self.consumer.run_once()
        entered, unblock = threading.Event(), threading.Event()
        def blocked(step, flow):
            entered.set()
            unblock.wait(6)
            return verify(step, flow)
        self.consumer.verification = blocked
        service = AutomationConsumerService(self.consumer)
        service.start()
        try:
            self.assertTrue(entered.wait(1))
            with self.assertRaisesRegex(RuntimeError, 'automation_consumer_close_timeout'):
                service.close()
            self.assertTrue(service.thread.is_alive())
            self.assertIsNone(AutomationQueue(self.profile.store).acquire())
        finally:
            unblock.set()
            service.close()
        self.assertFalse(service.thread.is_alive())

    def test_verification_modifying_declared_input_is_failed(self):
        self.configure_verification("from pathlib import Path; p=Path('input.txt'); p.write_text(p.read_text()+'x')")
        result = self.pump()
        self.assertEqual(result['flow'].get('attention', {}).get('reason'), 'repair_budget_exhausted', result['flow'])
        self.assertTrue(result['step']['result']['receipt']['source_changed'])
