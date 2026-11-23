"""Real PanelServer lifecycle assembly over disposable planning SQLite."""
import threading
import time
from unittest.mock import Mock, patch

from control_everything.http.gateway import HOST, PanelHandler, PanelServer
from tests.backend.test_automation_queue import AutomationQueueFixture
from tests.backend.test_automation_consumer import PlanningHost


class ConsumerAssemblyTests(AutomationQueueFixture):
    def setUp(self):
        super().setUp()
        self.server = PanelServer((HOST, 0), PanelHandler)
        self.server.workspace, self.server.profile = self.service, self.profile
        self.host = PlanningHost()
        self.runtime = Mock(ready=True)
        self.adapter_patch = patch('control_everything.integrations.workbench_progress.WorkbenchProgressAdapter',
                                   return_value=self.host)
        self.adapter_patch.start()
        self.addCleanup(self.adapter_patch.stop)
        self.addCleanup(self.server.server_close)

    def test_attach_consumes_authorized_event_and_replacement_keeps_wait(self):
        self.server.attach_workbench_runtime(self.runtime)
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            with self.profile.store.connection() as connection:
                flow = connection.execute('SELECT status FROM automation_flows').fetchone()
            if flow is not None and flow['status'] == 'waiting_external':
                break
            self.server.automation_consumer_service.wake()
            threading.Event().wait(.02)
        else:
            self.fail('Planning did not reach durable waiting')
        self.assertEqual(len(self.host.calls), 3)
        self.assertEqual(flow['status'], 'waiting_external')
        with self.profile.store.connection() as connection:
            attention = connection.execute('SELECT attention_json FROM automation_flows').fetchone()[0]
        self.assertIn('verification_not_configured', attention)
        previous = self.server.automation_consumer_service
        self.server.attach_workbench_runtime(self.runtime)
        self.assertFalse(previous.thread.is_alive())
        self.server.automation_consumer_service.close()
        self.assertEqual(len(self.host.calls), 3)

    def test_failed_old_close_preserves_adapter_and_does_not_replace(self):
        old = Mock()
        old.close.side_effect = RuntimeError('automation_consumer_close_timeout')
        self.server.automation_consumer_service = old
        self.server.workbench_runtime = 'old-runtime'
        self.service.native_progress.adapter = 'old-adapter'
        try:
            with self.assertRaisesRegex(RuntimeError, 'automation_consumer_close_timeout'):
                self.server.attach_workbench_runtime(self.runtime)
            self.assertIs(self.server.automation_consumer_service, old)
            self.assertEqual(self.server.workbench_runtime, 'old-runtime')
            self.assertEqual(self.service.native_progress.adapter, 'old-adapter')
        finally:
            old.close.side_effect = None

    def test_close_failure_still_closes_socket_without_closing_live_runtime_users(self):
        old, observer = Mock(), Mock()
        old.close.side_effect = RuntimeError('automation_consumer_close_timeout')
        self.server.automation_consumer_service = old
        self.server.native_progress_observer = observer
        try:
            with self.assertRaisesRegex(RuntimeError, 'automation_consumer_close_timeout'):
                self.server.server_close()
            self.assertEqual(self.server.socket.fileno(), -1)
            observer.close.assert_not_called()
            self.assertIs(self.server.automation_consumer_service, old)
        finally:
            old.close.side_effect = None

    def test_new_start_failure_closes_partial_services(self):
        with patch('control_everything.workspace.automation_consumer.AutomationConsumerService') as factory, \
             patch('control_everything.workspace.native_progress_observer.NativeProgressObserver') as observer:
            factory.return_value.start.side_effect = RuntimeError('synthetic_start_failure')
            with self.assertRaisesRegex(RuntimeError, 'synthetic_start_failure'):
                self.server.attach_workbench_runtime(self.runtime)
            factory.return_value.close.assert_called_once()
            observer.return_value.close.assert_called_once()

    def test_original_consumer_error_survives_secondary_reader_failure(self):
        old, reader = Mock(), Mock()
        original = RuntimeError('automation_consumer_close_timeout')
        old.close.side_effect = original
        reader.close.side_effect = ValueError('secondary_reader_failure')
        self.server.automation_consumer_service = old
        self.server.news_reader = reader
        try:
            with self.assertRaises(RuntimeError) as caught:
                self.server.server_close()
            self.assertIs(caught.exception, original)
            self.assertEqual(self.server.socket.fileno(), -1)
        finally:
            old.close.side_effect = None

    def test_attach_does_not_invent_authorization_from_ordinary_task(self):
        with self.profile.store.connection() as connection:
            connection.execute('DELETE FROM automation_events')
        self.server.attach_workbench_runtime(self.runtime)
        service = self.server.automation_consumer_service
        service.wake()
        service.close()
        self.assertEqual(self.host.calls, [])
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM automation_flows').fetchone()[0], 0)

    def test_start_error_survives_consumer_cleanup_failure_and_cleans_observer(self):
        with patch('control_everything.workspace.automation_consumer.AutomationConsumerService') as factory, \
             patch('control_everything.workspace.native_progress_observer.NativeProgressObserver') as observer:
            original = RuntimeError('synthetic_start_failure')
            factory.return_value.start.side_effect = original
            factory.return_value.close.side_effect = RuntimeError('synthetic_cleanup_failure')
            try:
                with self.assertRaises(RuntimeError) as caught:
                    self.server.attach_workbench_runtime(self.runtime)
                self.assertIs(caught.exception, original)
                observer.return_value.close.assert_called_once()
                self.assertIs(self.server.automation_consumer_service, factory.return_value)
                self.assertIsNone(self.server.native_progress_observer)
            finally:
                factory.return_value.close.side_effect = None

    def test_gateway_injects_real_verifier_and_owns_evidence_path(self):
        import sys
        import json
        repo = self.root / 'repo'
        repo.mkdir()
        (repo / 'input.txt').write_text('fixed input', encoding='utf-8')
        with self.profile.store.connection() as connection:
            connection.execute('DELETE FROM automation_events WHERE id=?', (self.event['id'],))
        self.service.enable_task_automation(self.item['id'], {**self.body, 'verification': {
            'argv': [sys.executable, '-B', '-c', "print('real gateway verification')"],
            'source_files': ['input.txt'], 'timeout': 3}})
        self.server.attach_workbench_runtime(self.runtime)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            with self.profile.store.connection() as connection:
                row = connection.execute("SELECT * FROM automation_steps WHERE kind='verify'").fetchone()
                flow = connection.execute('SELECT status FROM automation_flows').fetchone()
            if row and flow['status'] == 'awaiting_acceptance':
                break
            self.server.automation_consumer_service.wake()
            threading.Event().wait(.02)
        else:
            self.fail('Gateway verification did not reach waiting')
        result = json.loads(row['result_json'])
        output = self.profile.data_dir / 'automation-verification' / row['flow_id'] / row['id']
        self.assertEqual(result['output_dir'], str(output))
        self.assertEqual(result['receipt']['task_id'], self.item['id'])
        self.assertEqual(result['receipt']['step_id'], row['id'])
        self.assertEqual((output / 'stdout.log').read_bytes().strip(), b'real gateway verification')
        self.assertEqual(row['status'], 'completed')
        with self.profile.store.connection() as connection:
            delivery = connection.execute('SELECT * FROM task_deliveries').fetchone()
            item = connection.execute('SELECT * FROM task_items WHERE id=?',(self.item['id'],)).fetchone()
            self.assertEqual(delivery['source'], 'automation_verify')
            self.assertEqual(delivery['source_key'], row['id'])
            self.assertEqual(item['state'], 'review')
            self.assertIsNone(item['accepted_delivery_id'])
            self.assertEqual(connection.execute('SELECT COUNT(*) FROM task_reviews').fetchone()[0], 0)
