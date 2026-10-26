"""Profile-owned public-browser jobs, with one bounded process tree at a time."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import threading
import uuid

from control_everything.paths import web_root

TOPICS = {'coding', 'agents', 'claude', 'models', 'tibo'}


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

    def begin(self, query, topic, *, capture_frames=False):
        if (not isinstance(query, str) or not 1 <= len(query.strip()) <= 240
                or not isinstance(topic, str) or topic not in TOPICS or type(capture_frames) is not bool):
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
            job = {'job_id': identity, 'state': 'running', 'query': query.strip(), 'topic': topic,
                   'capture_frames': capture_frames, 'events': []}
            self.jobs[identity] = job
            config = folder / 'request.json'
            config.write_text(json.dumps(job, ensure_ascii=False), encoding='utf-8')
            self.thread = threading.Thread(target=self._run, args=(job, config, node), daemon=True)
            self.thread.start()
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
        process = timer = None
        try:
            with self.lock:
                if self.closed:
                    raise OSError('news_browser_closed')
                process = self.process = subprocess.Popen(
                    [node, str(web_root() / 'workspace/news-browser.js'), str(config)],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8',
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0,
                    start_new_session=sys.platform != 'win32')
            timer = threading.Timer(150, self._stop, args=(process,))
            timer.daemon = True
            timer.start()
            for line in process.stdout:
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                if isinstance(event, dict) and isinstance(event.get('message'), str):
                    with self.lock:
                        job['events'].append(event)
            errors = process.stderr.read()
            code = process.wait()
            (config.parent / 'worker-exit.json').write_text(json.dumps({'exit_code': code, 'stderr': errors}), encoding='utf-8')
            result_path = config.parent / 'result.json'
            result = json.loads(result_path.read_text(encoding='utf-8')) if result_path.is_file() else {'items': []}
            merged = self.on_result(result['items']) if result['items'] else None
            with self.lock:
                failed = code != 0 or any(event['stage'] in ('blocked', 'error') for event in job['events'])
                job['state'] = 'partial' if result['items'] and failed else 'complete' if result['items'] else 'failed'
                if merged:
                    job['result'] = merged
                if not result['items']:
                    job['error'] = '本次未取得正文，请查看来源状态或检查浏览器采集依赖。已有内容已保留。'
        except (OSError, ValueError, KeyError, subprocess.SubprocessError):
            with self.lock:
                job['state'] = 'failed'
                job['error'] = '采集未能完成，已有信息已保留。'
        finally:
            if timer:
                timer.cancel()
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
            process, thread = self.process, self.thread
        self._stop(process)
        if thread and thread is not threading.current_thread():
            thread.join(timeout=5)
