"""Persisted native launch/reconciliation behavior with synthetic owner facts."""

import copy

from control_everything.input_validation import ProfileError
from control_everything.workspace.automation_flow import AutomationQueue
from tests.backend.test_automation_queue import AutomationQueueFixture
from tests.backend.test_native_progress import FakeHost


class AutomationLaunchTests(AutomationQueueFixture):
    def setUp(self):
        super().setUp()
        from control_everything.workspace.automation_launch import AutomationLaunch
        self.now = 1000.0
        self.queue = AutomationQueue(self.profile.store, clock=lambda: self.now)
        self.lease = self.queue.acquire()
        self.claimed = self.queue.claim(self.lease, self.event['id'])
        self.host = FakeHost()
        self.launch = AutomationLaunch(self.queue, self.host)

    def reserve_plan(self):
        prepared = self.launch.prepare(self.lease, self.claimed['step'])
        self.assertEqual(prepared['status'], 'completed')
        params = {**prepared['result']['scope'], 'contractVersion': 1, 'agent': 'codex', 'prompt': 'Read and plan.'}
        return self.queue.reserve_next(self.lease, prepared, 'plan', {'params': params}, writes_project=False)

    def test_offline_does_not_consume_dispatch_or_start_an_agent(self):
        self.host.available = False
        result = self.launch.prepare(self.lease, self.claimed['step'])
        self.assertEqual(result['status'], 'reserved')
        self.assertEqual(self.host.create_calls, 0)

    def test_lost_launch_response_reuses_original_operation_and_parameters(self):
        step = self.reserve_plan()
        sessions, calls = {}, []
        create = self.host.create
        def once(params, *, cancel_event=None):
            calls.append(copy.deepcopy(params))
            if params['operationId'] not in sessions:
                sessions[params['operationId']] = create(params)
                raise TimeoutError('Reply lost after creating the agent')
            return sessions[params['operationId']]
        self.host.create = once
        result = self.launch.run(self.lease, step)
        self.assertEqual(result['status'], 'unknown')
        recovered = self.queue.claim(self.lease, self.event['id'])['step']
        result = self.launch.run(self.lease, recovered)
        self.assertEqual(result['status'], 'running')
        self.assertEqual(self.host.create_calls, 1)
        self.assertEqual(calls[0], calls[1])
        self.assertEqual(calls[0]['operationId'], step['operation_id'])

    def test_crash_after_intent_does_not_create_another_step(self):
        step = self.reserve_plan()
        dispatched = self.queue.record(self.lease, step, 'dispatching')
        self.now += 61
        lease = self.queue.acquire()
        recovered = self.queue.claim(lease, self.event['id'])['step']
        self.assertEqual(recovered['operation_id'], dispatched['operation_id'])
        self.launch.run(lease, recovered)
        self.assertEqual(self.host.create_calls, 1)

    def test_owner_expiry_during_launch_cannot_publish_reply(self):
        step = self.reserve_plan()
        create = self.host.create
        def delayed(params, *, cancel_event=None):
            self.now += 61
            return create(params)
        self.host.create = delayed
        with self.assertRaisesRegex(ProfileError, 'automation_owner_lost'):
            self.launch.run(self.lease, step)
        lease = self.queue.acquire()
        current = self.queue.claim(lease, self.event['id'])['step']
        self.assertEqual(current['status'], 'dispatching')
        self.assertEqual(current['binding'], {})

    def test_wrong_binding_cannot_be_used_as_started_work(self):
        step = self.reserve_plan()
        self.host.binding['worktreeId'] = 'different'
        result = self.launch.run(self.lease, step)
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(result['binding'], {})

    def test_only_identified_normal_turn_completes_and_does_not_create_delivery(self):
        step = self.launch.run(self.lease, self.reserve_plan())
        self.host.reply['status'].update(state='done', turnEndedAt=120, turnEndDisposition='identified',
                                         lastAssistantMessage='Plan result')
        for key in ('interrupted', 'isReplay', 'sessionBoundary', 'restoredUnconfirmed', 'lastAssistantMessageIsToolOutput'):
            with self.subTest(flag=key):
                self.host.reply['status'][key] = True
                self.assertEqual(self.launch.run(self.lease, step)['status'], 'running')
                self.host.reply['status'][key] = False
        finished = self.launch.run(self.lease, step)
        self.assertEqual(finished['status'], 'completed')
        self.assertEqual(finished['result']['text'], 'Plan result')
        self.assertEqual(finished['result']['facts']['binding'], self.host.binding)
        self.launch.run(self.lease, finished)
        self.assertEqual(self.host.create_calls, 1)
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM task_deliveries').fetchone()[0], 0)

    def test_next_step_reservation_is_replayed_and_content_cannot_change(self):
        prepared = self.launch.prepare(self.lease, self.claimed['step'])
        first = self.queue.reserve_next(self.lease, prepared, 'plan', {'prompt': 'original'}, writes_project=False)
        replay = self.queue.reserve_next(self.lease, prepared, 'plan', {'prompt': 'original'}, writes_project=False)
        self.assertEqual(first, replay)
        with self.assertRaisesRegex(ProfileError, 'automation_step_conflict'):
            self.queue.reserve_next(self.lease, prepared, 'plan', {'prompt': 'changed'}, writes_project=False)

    def test_untrusted_observation_cannot_complete_a_step(self):
        step = self.launch.run(self.lease, self.reserve_plan())
        self.host.reply['binding']['generation'] += 1
        self.host.reply['status'].update(state='done', turnEndedAt=120, turnEndDisposition='identified',
                                         lastAssistantMessage='Wrong generation')
        self.assertEqual(self.launch.run(self.lease, step)['status'], 'running')

    def test_prepare_pre_cancelled_does_not_dispatch(self):
        import threading
        stop = threading.Event()
        stop.set()
        original = self.claimed['step']
        self.assertEqual(self.launch.prepare(self.lease, original, cancel_event=stop), original)

    def test_create_cancellation_keeps_unknown_operation_for_replay(self):
        import threading
        stop = threading.Event()
        step = self.reserve_plan()
        calls = []
        create = self.host.create
        def cancelled(params, *, cancel_event=None):
            calls.append((copy.deepcopy(params), cancel_event))
            create(params)
            cancel_event.set()
            raise TimeoutError('cancelled RPC wait after dispatch')
        self.host.create = cancelled
        result = self.launch.run(self.lease, step, cancel_event=stop)
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(result['operation_id'], step['operation_id'])
        self.assertEqual(result['binding'], {})
        self.assertIs(calls[0][1], stop)
        stop.clear()
        def replay(params, *, cancel_event=None):
            calls.append((copy.deepcopy(params), cancel_event))
            return {'contractVersion': 1, 'binding': copy.deepcopy(self.host.binding)}
        self.host.create = replay
        self.assertEqual(self.launch.run(self.lease, result, cancel_event=stop)['status'], 'running')
        self.assertEqual(calls[0][0], calls[1][0])
        self.assertEqual(self.host.create_calls, 1)

    def test_successful_reply_is_retained_when_stop_arrives_with_reply(self):
        import threading
        stop = threading.Event()
        create = self.host.create
        def completed(params, *, cancel_event=None):
            reply = create(params)
            stop.set()
            return reply
        self.host.create = completed
        result = self.launch.run(self.lease, self.reserve_plan(), cancel_event=stop)
        self.assertEqual(result['status'], 'running')
        self.assertEqual(result['binding'], self.host.binding)

    def test_cancelled_prepare_keeps_unknown_and_same_operation(self):
        import threading
        stop = threading.Event()
        calls = []
        def cancelled(directory, worktree, *, cancel_event=None):
            calls.append(cancel_event)
            stop.set()
            raise TimeoutError('prepare wait cancelled')
        self.host.prepare_scope = cancelled
        result = self.launch.prepare(self.lease, self.claimed['step'], cancel_event=stop)
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(result['operation_id'], self.claimed['step']['operation_id'])
        self.assertEqual(calls, [stop])

    def test_run_pre_cancelled_does_not_create(self):
        import threading
        step = self.reserve_plan()
        stop = threading.Event()
        stop.set()
        self.assertEqual(self.launch.run(self.lease, step, cancel_event=stop), step)
        self.assertEqual(self.host.create_calls, 0)

    def test_only_exact_read_only_refusal_is_definitive(self):
        for read_only, reason, expected in [(True, 'read_only_launch_args_unsupported', 'failed'),
                (True, 'read_only_command_override_unsupported', 'failed'),
                (False, 'read_only_launch_args_unsupported', 'unknown'),
                (True, 'other_error', 'unknown')]:
            with self.subTest(read_only=read_only, reason=reason):
                # Each response is recorded against its own isolated fixture state.
                step = self.reserve_plan() if not hasattr(self, 'refusal_step') else self.refusal_step
                with self.profile.store.connection() as connection:
                    request = copy.deepcopy(step['request'])
                    request['params']['readOnly'] = read_only
                    import json
                    connection.execute("UPDATE automation_steps SET status='reserved',request_json=?,result_json='{}' WHERE id=?",
                                       (json.dumps(request), step['id']))
                step = self.queue.get_step(step['id'])
                self.refusal_step = step
                self.host.create = lambda params, **kwargs: {'contractVersion': 1, 'refused': True, 'reason': reason}
                result = self.launch.run(self.lease, step)
                self.assertEqual(result['status'], expected)
                self.assertEqual(result['operation_id'], step['operation_id'])
