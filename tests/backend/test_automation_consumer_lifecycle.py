"""Lifecycle checks use disposable SQLite and the actual consumer service."""
import threading
from unittest.mock import patch

from control_everything.workspace.automation_flow import AutomationQueue
from tests.backend.test_automation_consumer import PlanningHost
from tests.backend.test_automation_queue import AutomationQueueFixture


class ConsumerLifecycleTests(AutomationQueueFixture):
    def setUp(self):
        super().setUp()
        from control_everything.workspace.automation_consumer import AutomationConsumer, AutomationConsumerService
        self.queue = AutomationQueue(self.profile.store)
        self.host = PlanningHost()
        self.consumer = AutomationConsumer(self.queue, self.host)
        self.service = AutomationConsumerService(self.consumer)
        self.addCleanup(self.service.close)

    def test_pre_stopped_does_not_claim_and_cannot_start(self):
        self.service.close()
        self.service.start()
        self.assertIsNone(self.service.thread)
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_flows').fetchone()[0], 0)

    def test_close_cancels_prepare_and_releases_owner(self):
        entered = threading.Event()
        def prepare(directory, worktree, *, cancel_event=None):
            entered.set()
            cancel_event.wait(2)
            raise TimeoutError('cancelled local wait')
        self.host.prepare_scope = prepare
        self.service.start()
        thread = self.service.thread
        self.service.start()
        self.assertIs(self.service.thread, thread)
        self.assertTrue(entered.wait(1))
        self.service.close()
        self.assertFalse(thread.is_alive())
        self.assertIsNotNone(AutomationQueue(self.profile.store).acquire())
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT status FROM automation_steps').fetchone()[0], 'unknown')

    def test_unexpected_error_stops_and_is_observable(self):
        self.consumer.run_once = lambda **kwargs: (_ for _ in ()).throw(RuntimeError('synthetic'))
        with self.assertLogs('control_everything.workspace.automation_consumer', level='ERROR'):
            self.service.start()
            self.service.thread.join(1)
        self.assertFalse(self.service.thread.is_alive())
        self.assertEqual(self.service.last_error, 'RuntimeError')

    def test_lost_owner_close_does_not_release_replacement(self):
        lease = self.queue.acquire()
        self.consumer.lease = lease
        self.queue.release(lease)
        replacement = AutomationQueue(self.profile.store)
        acquired = replacement.acquire()
        self.service.close()
        replacement.renew(acquired)

    def test_timeout_keeps_owner_until_thread_really_exits(self):
        entered, unblock = threading.Event(), threading.Event()
        def prepare(directory, worktree, *, cancel_event=None):
            entered.set()
            unblock.wait(5)
            raise TimeoutError('uncooperative synthetic helper')
        self.host.prepare_scope = prepare
        self.service.start()
        self.assertTrue(entered.wait(1))
        try:
            with self.assertRaisesRegex(RuntimeError, 'automation_consumer_close_timeout'):
                self.service.close()
            self.assertTrue(self.service.thread.is_alive())
            self.assertIsNone(AutomationQueue(self.profile.store).acquire())
        finally:
            unblock.set()
            self.service.close()

    def test_pre_stopped_run_once_does_not_claim(self):
        stop = threading.Event()
        stop.set()
        self.consumer.run_once(cancel_event=stop)
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_flows').fetchone()[0], 0)

    def test_close_cancels_create_and_preserves_operation(self):
        self.consumer.run_once()
        self.consumer.run_once()
        entered = threading.Event()
        calls = []
        def create(params, *, cancel_event=None):
            calls.append(params)
            entered.set()
            cancel_event.wait(2)
            raise TimeoutError('unknown create')
        self.host.create = create
        self.service.start()
        self.assertTrue(entered.wait(1))
        self.service.close()
        with self.profile.store.connection() as connection:
            row = connection.execute('SELECT status,operation_id FROM automation_steps ORDER BY ordinal DESC').fetchone()
        self.assertEqual(row['status'], 'unknown')
        self.assertEqual(row['operation_id'], calls[0]['operationId'])

    def test_wake_promotes_next_stage_without_starting_another_thread(self):
        calls, first, second = [], threading.Event(), threading.Event()
        run_once = self.consumer.run_once
        def observed(**kwargs):
            result = run_once(**kwargs)
            calls.append(result)
            (first if len(calls) == 1 else second).set()
            return result
        self.consumer.run_once = observed
        self.service.start()
        self.assertTrue(first.wait(1))
        self.service.wake()
        self.assertTrue(second.wait(.75))
        self.service.close()
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_steps').fetchone()[0], 2)
