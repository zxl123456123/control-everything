"""Profile-owned public-browser jobs, with one bounded process tree at a time."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import signal
import selectors
import subprocess
import sys
import threading
import time
import uuid
import ctypes as c
from ctypes import wintypes as w

from control_everything.paths import web_root
from control_everything.workspace.news_worker import OwnedBatch, NewsWindowsAPI
from control_everything.platform.windows_jobs import ExtendedLimits, SecurityAttributes

TOPICS = {'coding', 'agents', 'claude', 'models', 'tibo'}


class BrowserFrames:
    def __init__(self, on_event):
        self.pending, self.total, self.frames, self.done = bytearray(), 0, [], True
        self.on_event = on_event

    def feed(self, data):
        self.total += len(data)
        if self.total > 8 * 1024 * 1024:
            raise ValueError('oversize')
        self.pending.extend(data)
        while b'\n' in self.pending:
            line, _, self.pending = self.pending.partition(b'\n')
            if len(line) > 65536 or len(self.frames) >= 1000:
                raise ValueError('oversize')
            event = json.loads(line)
            if not isinstance(event, dict) or not isinstance(event.get('message'), str) or not isinstance(event.get('stage'), str):
                raise ValueError('invalid_event')
            self.frames.append(event)
            self.on_event(event)
        if len(self.pending) > 65536:
            raise ValueError('oversize')


class BrowserAPI(NewsWindowsAPI):
    def __init__(self, node, config):
        super().__init__()
        self.node, self.config, self.stderr, self.error_bytes = node, config, None, 0

    def limits(self, job):
        limits = ExtendedLimits()
        limits.basic.flags = 0x2000 | 0x8 | 0x200
        limits.basic.active_limit = 32
        limits.job_memory = 1024 * 1024 * 1024
        self.base.checked(self.kernel.SetInformationJobObject(job, 9, c.byref(limits), c.sizeof(limits)))

    def pipes(self, owned):
        super().pipes(owned)
        attrs = SecurityAttributes(c.sizeof(SecurityAttributes), None, True)
        read, write = w.HANDLE(), w.HANDLE()
        self.base.checked(self.kernel.CreatePipe(c.byref(read), c.byref(write), c.byref(attrs), 0))
        owned.handles.extend((read.value, write.value))
        self.stderr = read.value
        self.base.checked(self.kernel.SetHandleInformation(read.value, 1, 0))
        old = owned.child_handles[2]
        self.close(old)
        owned.handles.remove(old)
        owned.child_handles = (*owned.child_handles[:2], write.value)

    def spawn(self, owned, stream, token):
        owned.process, owned.thread, owned.pid = self.base.spawn(self.node,
            [str(web_root() / 'workspace/news-browser.js'), str(self.config)], self.config.parent, owned.child_handles)

    def read(self, pipe):
        errors = self.base.read_available(self.stderr)
        if errors:
            self.error_bytes += len(errors)
            if self.error_bytes > 256 * 1024:
                raise ValueError('oversize')
        output = super().read(pipe)
        # Drain stderr through EOF too; a separate full pipe must not deadlock exit.
        return None if output == b'' and errors != b'' else output


class BrowserBatch(OwnedBatch):
    def __init__(self, node, config, stop, on_event, *, api=None):
        super().__init__('browser', config.parent.name, time.monotonic() + 150, stop,
                         api=api or BrowserAPI(node, config))
        self.frames = BrowserFrames(on_event)


class ResearchJobs:
    def __init__(self, root, on_result):
        self.root = Path(root) / 'research-captures'
        self.on_result = on_result
        self.lock = threading.RLock()
        self.jobs = {}
        self.process = None
        self.thread = None
        self.closed = False
        self.blocked = False
        self.stop = threading.Event()
        self.batch = None

    def begin(self, query, topic):
        if (not isinstance(query, str) or not 1 <= len(query.strip()) <= 240
                or not isinstance(topic, str) or topic not in TOPICS):
            raise ValueError('invalid_research_request')
        node = os.environ.get('CONTROL_EVERYTHING_NEWS_NODE') or shutil.which('node')
        if not node or not Path(node).is_file():
            raise OSError('news_browser_unavailable')
        with self.lock:
            if self.closed or self.blocked:
                raise OSError('news_browser_closed')
            if any(job['state'] == 'running' for job in self.jobs.values()):
                raise RuntimeError('research_running')
            identity = uuid.uuid4().hex
            folder = self.root / identity
            folder.mkdir(parents=True)
            job = {'job_id': identity, 'state': 'running', 'query': query.strip(), 'topic': topic, 'events': []}
            self.jobs[identity] = job
            config = folder / 'request.json'
            config.write_text(json.dumps(job, ensure_ascii=False), encoding='utf-8')
            self.thread = threading.Thread(target=self._run, args=(job, config, node), daemon=True)
            try:
                self.thread.start()
            except RuntimeError:
                self.thread = None
                job.update(state='failed', reason='worker_start_failed', finished_at=datetime.now(timezone.utc).isoformat())
                (folder / 'job.json').write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding='utf-8')
                raise OSError('news_browser_start_failed') from None
            return self.snapshot(identity)

    def snapshot(self, identity):
        if not isinstance(identity, str) or not re.fullmatch('[a-f0-9]{32}', identity):
            return None
        with self.lock:
            job = self.jobs.get(identity)
            if job is None:
                try:
                    saved = json.loads((self.root / identity / 'job.json').read_text(encoding='utf-8'))
                    if (saved.get('job_id') == identity and saved.get('state') in ('complete', 'partial', 'failed')
                            and isinstance(saved.get('events'), list) and saved.get('topic') in TOPICS):
                        job = self.jobs[identity] = saved
                except (OSError, ValueError, AttributeError, TypeError):
                    pass
            return json.loads(json.dumps(job)) if job else None

    def latest(self):
        with self.lock:
            for job in self.jobs.values():
                if job['state'] == 'running':
                    return self.snapshot(job['job_id'])
        files = sorted(self.root.glob('*/job.json'), key=lambda file: file.stat().st_mtime, reverse=True)
        return next((job for file in files if (job := self.snapshot(file.parent.name))), None)

    def frame_path(self, identity, name):
        if not self.snapshot(identity) or not isinstance(name, str) or not re.fullmatch(r'frame-\d{3}\.jpg', name):
            return None
        file = self.root / identity / name
        return file if file.is_file() else None

    @staticmethod
    def _stop(process):
        if process is None or process.poll() is not None:
            return
        if sys.platform == 'win32':
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True,
                           creationflags=subprocess.CREATE_NO_WINDOW, timeout=10, check=True)
        else:
            os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=3)

    def _run(self, job, config, node):
        if sys.platform == 'win32':
            return self._run_owned(job, config, node)
        process = None
        try:
            with self.lock:
                if self.closed:
                    raise OSError('news_browser_closed')
                process = self.process = subprocess.Popen(
                    [node, str(web_root() / 'workspace/news-browser.js'), str(config)],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0,
                    start_new_session=sys.platform != 'win32')
            def event(value):
                with self.lock:
                    job['events'].append(value)
            frames = BrowserFrames(event)
            error_bytes, deadline = 0, time.monotonic() + 150
            with selectors.DefaultSelector() as selector:
                for pipe, kind in ((process.stdout, 'out'), (process.stderr, 'error')):
                    os.set_blocking(pipe.fileno(), False)
                    selector.register(pipe, selectors.EVENT_READ, kind)
                while selector.get_map():
                    if self.stop.is_set() or time.monotonic() >= deadline:
                        raise TimeoutError()
                    for key, _ in selector.select(.1):
                        data = os.read(key.fd, 65536)
                        if not data:
                            selector.unregister(key.fileobj)
                        elif key.data == 'out':
                            frames.feed(data)
                        else:
                            error_bytes += len(data)
                            if error_bytes > 256 * 1024:
                                raise ValueError('oversize')
            if frames.pending:
                raise ValueError('invalid_event')
            code = process.wait(timeout=max(.001, deadline - time.monotonic()))
            result_path = config.parent / 'result.json'
            if result_path.is_file() and result_path.stat().st_size > 8 * 1024 * 1024:
                raise ValueError('oversize')
            result = json.loads(result_path.read_bytes()) if result_path.is_file() else {'items': []}
            merged = self.on_result(result['items']) if result['items'] and not self.stop.is_set() else None
            with self.lock:
                failed = code != 0 or any(event['stage'] in ('blocked', 'error') for event in job['events'])
                job['state'] = 'failed' if self.stop.is_set() else 'partial' if result['items'] and failed else 'complete' if result['items'] else 'failed'
                if self.stop.is_set():
                    job['reason'] = 'cancelled'
                if merged:
                    job['result'] = merged
                if not result['items']:
                    job['error'] = '本次未取得正文，请查看来源状态或检查浏览器采集依赖。已有内容已保留。'
        except (OSError, ValueError, KeyError, subprocess.SubprocessError):
            with self.lock:
                job['state'] = 'failed'
                job['error'] = '采集未能完成，已有信息已保留。'
        finally:
            try:
                self._stop(process)
            finally:
                with self.lock:
                    if process is not None and process.poll() is None:
                        self.blocked = True
                        job['state'] = 'failed'
                        job['error'] = '无法核验采集进程回收，已停止新采集。'
                    else:
                        self.process = None
                    job['finished_at'] = datetime.now(timezone.utc).isoformat()
                    (config.parent / 'job.json').write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding='utf-8')

    def close(self):
        with self.lock:
            self.closed = True
        if not self.cancel_current():
            raise OSError('cleanup_unverified')

    def cancel_current(self):
        """Stop/join the current job without closing admission after proven cleanup."""
        with self.lock:
            process, thread = self.process, self.thread
            self.stop.set()
        try:
            self._stop(process)
            if thread and thread is not threading.current_thread():
                thread.join(timeout=5)
            with self.lock:
                if thread and thread.is_alive() or self.blocked:
                    self.blocked = True
                    return False
                self.thread = self.process = None
                if not self.closed:
                    self.stop.clear()
                return True
        except (OSError, RuntimeError, subprocess.SubprocessError):
            with self.lock:
                self.blocked = True
            return False

    def _run_owned(self, job, config, node):
        cleaned = False
        try:
            def event(value):
                with self.lock:
                    job['events'].append(value)
            self.batch = BrowserBatch(node, config, self.stop, event)
            _, reason, cleaned = self.batch.run()
            if not cleaned:
                raise OSError('cleanup_unverified')
            path = config.parent / 'result.json'
            if path.is_file() and path.stat().st_size <= 8 * 1024 * 1024:
                with path.open('rb') as stream:
                    raw = stream.read(8 * 1024 * 1024 + 1)
                if len(raw) > 8 * 1024 * 1024:
                    raise ValueError('oversize')
                result = json.loads(raw)
            elif path.is_file():
                raise ValueError('oversize')
            else:
                result = {'items': []}
            if not isinstance(result, dict) or not isinstance(result.get('items'), list):
                raise ValueError('invalid_result')
            merged = self.on_result(result['items']) if result['items'] and not self.closed and not self.stop.is_set() else None
            with self.lock:
                failed = bool(reason) or any(e['stage'] in ('blocked', 'error') for e in job['events'])
                job['state'] = 'failed' if self.stop.is_set() else 'partial' if result['items'] and failed else 'complete' if result['items'] else 'failed'
                job['reason'] = 'cancelled' if self.stop.is_set() else reason or ('source_blocked' if failed else None)
                if merged:
                    job['result'] = merged
        except (OSError, ValueError, KeyError, TypeError):
            with self.lock:
                job.update(state='failed', reason='worker_failed', error='采集未能完成，已有信息已保留。')
        finally:
            with self.lock:
                if not cleaned:
                    self.blocked = True
                    job.update(state='failed', reason='cleanup_unverified')
                else:
                    self.batch = None
                job['finished_at'] = datetime.now(timezone.utc).isoformat()
                (config.parent / 'job.json').write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding='utf-8')
