"""Bounded owner transport and observer tests; no native runtime is launched."""

import threading
import time
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from control_everything.integrations.workbench_progress import WorkbenchProgressAdapter
from control_everything.integrations.workbench_runtime import WorkbenchRuntime, WorkbenchUnavailable
from control_everything.workspace.native_progress_observer import NativeProgressObserver
from control_everything.http.gateway import PanelServer


class WorkbenchProgressTests(unittest.TestCase):
    def test_receipt_and_observe_have_no_mutation_envelope_and_share_deadline(self):
        runtime = Mock(ready=True)
        adapter = WorkbenchProgressAdapter(runtime)
        stop = threading.Event()
        adapter.read_receipt('request', {'text': 'frozen'}, {'terminalHandle': 'original'}, timeout=.2, cancel_event=stop)
        args, kwargs = runtime._rpc.call_args
        self.assertEqual(args[0], 'platform.taskProgress.receipt')
        self.assertEqual(args[1]['expectedSendParams'], {'text': 'frozen'})
        self.assertEqual(kwargs, {'timeout': .2, 'cancel_event': stop})
        adapter.send({'text': 'frozen'}, 'request')
        self.assertEqual(runtime._rpc.call_args.kwargs['orchestration_request_id'], 'request')
        adapter.observe({'terminalHandle': 'original'}, timeout=20)
        self.assertEqual(runtime._rpc.call_args.kwargs['timeout'], .75)

    def test_observer_round_budget_cursor_and_close(self):
        now = [0]
        progress = Mock()
        progress.observe_jobs.return_value = [('observe', {'id': index}) for index in range(25)]
        observed = []
        def sample(job, *, timeout, cancel_event):
            observed.append((job[1]['id'], timeout))
            now[0] += timeout
        progress.observe_job.side_effect = sample
        observer = NativeProgressObserver(progress, clock=lambda: now[0])
        self.assertEqual(observer.run_once(), 3)
        self.assertEqual(now[0], 2)
        self.assertEqual([value[1] for value in observed], [.75, .75, .5])
        observer.run_once()
        self.assertEqual(observed[3][0], 3)
        observer.close()
        self.assertEqual(observer.run_once(), 0)

    def test_close_cancels_blocking_reader_and_does_not_terminate_agent(self):
        entered = threading.Event()
        progress = Mock()
        progress.observe_jobs.return_value = [('observe', {})]
        def read(job, *, timeout, cancel_event):
            entered.set()
            cancel_event.wait(timeout)
        progress.observe_job.side_effect = read
        observer = NativeProgressObserver(progress)
        observer.start()
        self.assertTrue(entered.wait(1))
        started = time.monotonic()
        observer.close()
        self.assertLess(time.monotonic() - started, 2)
        self.assertFalse(observer.thread.is_alive())

    def test_transport_timeout_reaps_only_helper_and_closes_pipe(self):
        runtime = WorkbenchRuntime(SimpleNamespace())
        runtime.api = Mock()
        runtime.api.read_available.return_value = None
        runtime.api.exit_code.return_value = 259
        runtime._spawn = Mock(return_value=('helper', 'stdin', 'stdout', 1, 1))
        started = time.monotonic()
        with self.assertRaisesRegex(WorkbenchUnavailable, 'runtime_request_timeout'):
            runtime._capture([], timeout=.03)
        self.assertLess(time.monotonic() - started, .75)
        runtime.api.terminate_process.assert_called_once_with('helper')
        runtime.api.terminate_job.assert_not_called()
        runtime.api.close.assert_any_call('stdout')
        runtime.api.close.assert_any_call('helper')

    def test_post_bind_assembly_uses_single_observer_and_replacement_closes_old(self):
        progress = SimpleNamespace(adapter=None)
        server = SimpleNamespace(workspace=SimpleNamespace(native_progress=progress), profile=object())
        runtime = Mock(ready=True)
        with patch('control_everything.workspace.native_progress_observer.NativeProgressObserver') as factory:
            first, second = Mock(), Mock()
            factory.side_effect = [first, second]
            PanelServer.attach_workbench_runtime(server, runtime)
            first.start.assert_called_once()
            PanelServer.attach_workbench_runtime(server, runtime)
            first.close.assert_called_once()
            second.start.assert_called_once()
            self.assertIs(progress.adapter.runtime, runtime)

    def test_blocked_stdin_write_is_released_by_owned_helper_termination(self):
        for cancel in (False, True):
            with self.subTest(cancel=cancel):
                runtime = WorkbenchRuntime(SimpleNamespace())
                runtime.api = Mock()
                stopped, entered, write_returned = threading.Event(), threading.Event(), threading.Event()
                def blocked_write(pipe, raw):
                    entered.set()
                    stopped.wait(2)
                    write_returned.set()
                    raise OSError('synthetic broken pipe')
                runtime.api.write.side_effect = blocked_write
                runtime.api.terminate_process.side_effect = lambda process: stopped.set()
                runtime.api.exit_code.return_value = 259
                runtime._spawn = Mock(return_value=('owned-helper', 'stdin', 'stdout', 1, 1))
                cancelled = threading.Event()
                timer = threading.Timer(.03, cancelled.set) if cancel else None
                if timer:
                    timer.start()
                start = time.monotonic()
                try:
                    with self.assertRaisesRegex(WorkbenchUnavailable, 'runtime_request_cancelled|runtime_request_timeout'):
                        runtime._capture([], {'payload': 'x' * 16000}, timeout=.15, cancel_event=cancelled)
                finally:
                    if timer:
                        timer.join(1)
                self.assertLess(time.monotonic() - start, .75)
                self.assertTrue(entered.is_set())
                self.assertTrue(write_returned.is_set())
                runtime.api.terminate_process.assert_called_once_with('owned-helper')
                runtime.api.terminate_job.assert_not_called()
                self.assertFalse(any(thread.name == 'workbench-request-input' for thread in threading.enumerate()))
