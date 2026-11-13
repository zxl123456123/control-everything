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
        self.kind, self.verdict, self.model = 'small', 'approve', 'gpt-6-astra'
        self.questions = []

    def create(self, params):
        self.calls.append(copy.deepcopy(params))
        self.binding['providerSession']['id'] = str(len(self.calls))
        return super().create(params)

    def observe(self, binding, **kwargs):
        value = ({'kind': self.kind, 'plan': 'Read code and verify.', 'needs_human': False, 'questions': self.questions}
                 if 'PLAN_REVIEW' not in self.calls[-1]['prompt'] else
                 {'kind': self.kind, 'verdict': self.verdict, 'rationale': 'Scope checked.', 'questions': self.questions})
        reply = copy.deepcopy(self.reply)
        reply['binding'] = copy.deepcopy(binding)
        reply['status'].update(providerSession=binding['providerSession'], state='done', turnEndedAt=120,
                               turnEndDisposition='identified', lastAssistantMessage=json.dumps(value))
        if self.model is not None:
            reply['status']['model'] = self.model
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

    def test_small_stops_before_implementation_and_restart_does_not_call(self):
        result = self.pump()
        self.assertEqual(result['flow']['status'], 'waiting_external')
        self.assertEqual(result['flow']['attention']['reason'], 'implementation_not_connected')
        self.assertEqual(len(self.host.calls), 2)
        self.assertTrue(all(p['model'] == 'gpt-6-astra' for p in self.host.calls))
        self.consumer = self.consumer_type(self.queue, self.host)
        self.pump()
        self.assertEqual(len(self.host.calls), 2)
        with self.profile.store.connection() as connection:
            steps = [dict(row) for row in connection.execute('SELECT * FROM automation_steps ORDER BY ordinal')]
        self.assertEqual([s['kind'] for s in steps], ['prepare', 'plan', 'plan_review'])
        review = json.loads(steps[-1]['request_json'])
        self.assertEqual(review['review_of']['step_id'], steps[-2]['id'])
        self.assertNotEqual(json.loads(steps[-1]['binding_json'])['providerSession'], json.loads(steps[-2]['binding_json'])['providerSession'])

    def test_feature_waits_for_user(self):
        self.host.kind = 'feature'
        self.assertEqual(self.pump()['flow']['status'], 'waiting_user')

    def test_questions_wait_for_user(self):
        self.host.questions = ['Which scope?']
        self.assertEqual(self.pump()['flow']['attention']['questions'], ['Which scope?'])

    def test_revisions_preserve_two_round_budget(self):
        self.host.verdict = 'revise'
        result = self.pump(60)
        self.assertEqual(result['flow']['attention']['reason'], 'plan_revision_limit')
        self.assertEqual(len(self.host.calls), 6)
        with self.profile.store.connection() as connection:
            attempts = [json.loads(r[0])['plan_attempt'] for r in connection.execute("SELECT request_json FROM automation_steps WHERE kind='plan' ORDER BY ordinal")]
        self.assertEqual(attempts, [0, 1, 2])

    def test_missing_or_wrong_model_stops_without_review(self):
        self.host.model = None
        self.assertEqual(self.pump()['flow']['attention']['reason'], 'model_unobserved')
        self.assertEqual(len(self.host.calls), 1)

    def test_wrong_model_stops(self):
        self.host.model = 'gpt-6.1-sol'
        self.assertEqual(self.pump()['flow']['attention']['reason'], 'model_mismatch')

    def test_requirement_change_before_dispatch_waits(self):
        self.consumer.run_once()
        with self.profile.store.connection() as connection:
            connection.execute('UPDATE task_items SET revision=revision+1 WHERE id=?', (self.item['id'],))
        self.assertEqual(self.pump()['flow']['attention']['reason'], 'requirement_changed')
        self.assertEqual(len(self.host.calls), 0)

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
        self.assertEqual(len(self.host.calls), 2)

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

    def test_invalid_completed_output_waits_without_relaunch(self):
        observe = self.host.observe
        def invalid(binding, **kwargs):
            reply = observe(binding, **kwargs)
            reply['status']['lastAssistantMessage'] = 'not JSON'
            return reply
        self.host.observe = invalid
        self.assertEqual(self.pump()['flow']['attention']['reason'], 'invalid_planning_result')
        self.assertEqual(len(self.host.calls), 1)

    def test_unknown_operation_replays_exact_request(self):
        calls = []
        create = self.host.create
        def lost(params):
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
        for _ in range(6):
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
        self.consumer.run_once()
        self.change_project(archived=True)
        result = self.pump()
        self.assertEqual(result['flow']['status'], 'waiting_external')
        self.assertEqual(result['flow']['attention']['reason'], 'project_unavailable')
        self.assertEqual(result['step']['kind'], 'prepare')
        self.assertIn('scope', result['step']['result'])
        self.assertEqual(len(self.host.calls), 0)

    def test_directory_change_after_plan_reserved_prevents_create(self):
        self.consumer.run_once()
        self.consumer.run_once()
        self.change_project()
        result = self.pump()
        self.assertEqual(result['flow']['attention']['reason'], 'project_directory_changed')
        self.assertEqual(result['step']['kind'], 'plan')
        self.assertEqual(len(self.host.calls), 0)

    def test_prompts_include_classification_and_review_contract(self):
        self.pump()
        for call in self.host.calls:
            for rule in ('not new features', 'public interfaces', 'classification reasons',
                         'requirements coverage', 'implementation evidence', 'overengineering',
                         'risks', 'acceptance methods', 'two automatic revision rounds',
                         'AI approval is not human approval', 'untrusted data'):
                self.assertIn(rule, call['prompt'])

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
