"""One bounded, cancellable reader for already tracked native work."""

import threading
import time


class NativeProgressObserver:
    def __init__(self, progress, *, clock=time.monotonic):
        self.progress, self.clock = progress, clock
        self.stop_event, self.wake_event = threading.Event(), threading.Event()
        self.thread = None
        self.cursor = 0

    def start(self):
        if self.thread is not None:
            return
        self.thread = threading.Thread(target=self._run, name='native-progress-observer', daemon=True)
        self.thread.start()

    def wake(self):
        self.wake_event.set()

    def run_once(self):
        deadline = self.clock() + 2
        jobs = self.progress.observe_jobs(timeout=.75, cancel_event=self.stop_event)
        count = 0
        while jobs and count < min(20, len(jobs)) and not self.stop_event.is_set():
            remaining = deadline - self.clock()
            if remaining <= 0:
                break
            index = self.cursor % len(jobs)
            self.cursor = (index + 1) % len(jobs)
            count += 1
            self.progress.observe_job(jobs[index], timeout=min(.75, remaining), cancel_event=self.stop_event)
        return count

    def _run(self):
        while not self.stop_event.is_set():
            try:
                self.run_once()
            except Exception:
                # A storage or transport failure never schedules an execution.
                pass
            self.wake_event.wait(5)
            self.wake_event.clear()

    def close(self):
        self.stop_event.set()
        self.wake_event.set()
        if self.thread:
            self.thread.join(timeout=2)
            if self.thread.is_alive():
                raise RuntimeError('native_progress_close_timeout')

