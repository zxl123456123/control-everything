"""One profile owner, collection slot and service-owned schedule lifecycle."""
import copy
from datetime import datetime, timezone
import hashlib
import json
import os
import sys
import threading
import time
import uuid

from . import news_settings
from .news_schedule import next_due

# Failed cleanup must retain the OS owner handle even after server disposal/GC.
_RETAINED_OWNERS = []


class NewsUnavailable(OSError):
    pass


class NewsBusy(RuntimeError):
    pass


class RevisionConflict(ValueError):
    pass


class ProfileOwner:
    def __init__(self, root):
        self.root, self.handle = root, None

    def acquire(self):
        self.root.mkdir(parents=True, exist_ok=True)
        handle = (self.root / '.owner.lock').open('a+b')
        try:
            handle.seek(0)
            if sys.platform == 'win32':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            elif os.name == 'posix':
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            else:
                raise OSError('platform_unsupported')
        except OSError:
            handle.close()
            return False
        self.handle = handle
        return True

    def release(self):
        if self.handle:
            self.handle.close()
            self.handle = None


def _schedule_key(schedule):
    return hashlib.sha256(json.dumps(schedule, sort_keys=True).encode()).hexdigest()


class NewsRuntime:
    def __init__(self, reader, *, clock=None, owner=None, feed_runner=None):
        self.reader, self.lock = reader, reader.lock
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.owner_lock = owner or ProfileOwner(reader.root)
        self.feed_runner = feed_runner
        self.closed = self.blocked = self.started = False
        self.owner_generation = 0
        self.owner = 'owner_elsewhere'
        self.wake, self.stop = threading.Event(), threading.Event()
        self.thread = self.worker = self.batch = None
        self.slot = None
        self.settings = news_settings.default_settings()
        self.settings_error = None
        self.status = {'schema': 1, 'state': 'disabled', 'run_id': None, 'trigger': None, 'scheduled_for': None,
                       'settings_revision': 0, 'started_at': None, 'finished_at': None, 'last_attempt_at': None,
                       'last_success_at': None, 'next_run_at': None, 'pending_due': False, 'result': None, 'reason': None}
        try:
            self.settings = news_settings.load(reader.root)
        except (OSError, ValueError, TypeError, KeyError, AttributeError, RecursionError):
            self.settings_error = 'settings_invalid'
        if self.owner_lock.acquire():
            self.owner = 'owned'
            self.owner_generation += 1
        if self.settings_error:
            self.blocked = True
            self.status.update(state='blocked', reason=self.settings_error)

    def require_owner_open(self):
        if self.closed or self.blocked or self.owner != 'owned':
            raise NewsUnavailable(self.settings_error or ('reader_closed' if self.closed else 'cleanup_unverified' if self.blocked else 'owner_elsewhere'))

    def can_commit_article(self, generation):
        return self.owner == 'owned' and not self.closed and not self.blocked and generation == self.owner_generation

    def snapshot(self):
        with self.lock:
            value = copy.deepcopy(self.status)
            value.pop('schema', None)
            value.pop('schedule_key', None)
            value['owner'] = 'closed' if self.closed and not self.blocked else 'blocked' if self.blocked else self.owner
            if self.owner != 'owned':
                value.update(state='blocked', reason='owner_elsewhere')
            return value

    def envelope(self):
        with self.lock:
            if self.owner != 'owned' and not self.settings_error:
                try:
                    self.settings = news_settings.load(self.reader.root)
                except (OSError, ValueError, TypeError, KeyError, AttributeError):
                    self.settings_error = 'settings_invalid'
            return {'reader_id': self.reader.reader_id, 'settings': copy.deepcopy(self.settings), 'runtime': self.snapshot()}

    def _persist(self):
        self.require_owner_open()
        news_settings.atomic_bytes(self.reader.root / 'runtime.json', (json.dumps(self.status, ensure_ascii=False, indent=2) + '\n').encode())

    def save_settings(self, body):
        with self.lock:
            self.require_owner_open()
            candidate = news_settings.validate_settings(body, self.settings)
            if body['expected_revision'] != self.settings['revision']:
                raise RevisionConflict('revision_conflict')
            news_settings.save(self.reader.root, candidate)
            changed = candidate['schedule'] != self.settings['schedule']
            self.settings = candidate
            if changed:
                due = next_due(candidate['schedule'], self.clock())
                self.status.update(schedule_key=_schedule_key(candidate['schedule']), pending_due=False,
                                   next_run_at=due.isoformat() if due else None)
            self.status['settings_revision'] = candidate['revision']
            if self.slot is None:
                self.status['state'] = 'idle' if candidate['schedule']['enabled'] else 'disabled'
            try:
                self._persist()
            except OSError:
                self.blocked = True
                self.status.update(state='blocked', reason='runtime_write_failed')
                raise
            self.wake.set()
            return self.envelope()

    def start(self):
        with self.lock:
            if self.started or self.closed or self.owner != 'owned' or self.blocked:
                return
            self.started = True
            schedule = self.settings['schedule']
            prior = self.reader._read('runtime.json', {})
            if not isinstance(prior, dict):
                prior = {}
            key = _schedule_key(schedule)
            if prior.get('schema') == 1 and prior.get('schedule_key') == key:
                self.status.update({k: prior[k] for k in self.status if k in prior})
                if self.status['state'] == 'running':
                    self.status.update(result='interrupted', reason='service_interrupted', pending_due=schedule['enabled'])
            else:
                due = next_due(schedule, self.clock())
                self.status.update(next_run_at=due.isoformat() if due else None, pending_due=False)
            self.status.update(schedule_key=key, settings_revision=self.settings['revision'],
                               state='idle' if schedule['enabled'] else 'disabled')
            try:
                self._persist()
            except OSError:
                self.blocked = True
                self.status.update(state='blocked', reason='runtime_write_failed')
                return
            self.thread = threading.Thread(target=self._loop, name='news-schedule', daemon=True)
            self.thread.start()

    def _loop(self):
        while not self.stop.is_set():
            self.wake.clear()
            try:
                self.tick()
            except (OSError, ValueError):
                with self.lock:
                    self.blocked = True
                    self.status.update(state='blocked', reason='runtime_failed')
            self.wake.wait(30)

    def tick(self, now=None):
        with self.lock:
            if self.closed or self.blocked or self.owner != 'owned' or not self.settings['schedule']['enabled']:
                return
            now = now or self.clock()
            stamp = self.status['next_run_at']
            due = datetime.fromisoformat(stamp) if stamp else None
            if due and due <= now:
                future = next_due(self.settings['schedule'], now, anchor=due)
                self.status.update(pending_due=True, scheduled_for=stamp, next_run_at=future.isoformat())
                if self.slot:
                    self.status['state'] = 'pending'
                self._persist()
            if self.status['pending_due'] and self.slot is None:
                self._begin('scheduled', 'feed', None)

    def request_feed(self):
        with self.lock:
            self._begin('manual', 'feed', None)
        return self.reader.sample()

    def request_research(self, query, topic):
        from .news_schedule import TOPICS
        if not isinstance(query, str) or not 1 <= len(query.strip()) <= 240 or not isinstance(topic, str) or topic not in TOPICS:
            raise ValueError('invalid_research_request')
        try:
            with self.lock:
                return self._begin('manual', 'browser', {'query': query, 'topic': topic})
        except OSError:
            with self.lock:
                cleanup = self.status['reason'] == 'worker_start_failed' and self.slot is not None
            if cleanup:
                # Browser merge needs reader.lock, so never join under that gate.
                cleaned = self.reader.jobs.cancel_current()
                with self.lock:
                    if cleaned:
                        self.blocked = False
                        self.slot = None
                        self.status.update(state='idle' if self.settings['schedule']['enabled'] else 'disabled')
                        try:
                            self._persist()
                        except OSError:
                            self.blocked = True
                            self.status.update(state='blocked', reason='runtime_write_failed')
            raise

    def _begin(self, trigger, kind, payload):
        self.require_owner_open()
        if self.slot is not None:
            raise NewsBusy('worker_busy')
        run = {'id': uuid.uuid4().hex, 'trigger': trigger, 'kind': kind, 'payload': payload,
               'settings': copy.deepcopy(self.settings), 'schedule_key': _schedule_key(self.settings['schedule'])}
        self.slot = run
        now = self.clock().isoformat()
        self.status.update(state='running', run_id=run['id'], trigger=trigger, pending_due=False, started_at=now,
                           scheduled_for=self.status['scheduled_for'] if trigger == 'scheduled' else None,
                           finished_at=None, last_attempt_at=now, settings_revision=self.settings['revision'], result=None, reason=None)
        try:
            self._persist()
            job = self.reader.jobs.begin(**payload) if kind == 'browser' else None
        except Exception:
            self.slot = None
            self.status.update(state='idle', result='failed', reason='start_failed', finished_at=self.clock().isoformat())
            self._persist()
            raise
        self.worker = threading.Thread(target=self._run, args=(run, job), name='news-run', daemon=True)
        try:
            self.worker.start()
        except RuntimeError:
            self.worker = None
            self.status.update(state='blocked' if job else 'idle', result='failed', reason='worker_start_failed', finished_at=self.clock().isoformat())
            try:
                self._persist()
            finally:
                if job:
                    # Keep the slot until request_research drains this admitted browser.
                    self.blocked = True
                    self.reader.jobs.stop.set()
                else:
                    self.slot = None
            raise NewsUnavailable('worker_start_failed') from None
        return job

    def _run(self, run, job):
        results, reason, cleaned = [], None, True
        try:
            sources = [s for s in run['settings']['sources'] if s['enabled']]
            if run['kind'] == 'feed' and sources:
                from .news_feed import ProfileFeedBatch
                runner = self.feed_runner or ProfileFeedBatch
                self.batch = runner(self.reader.root, sources, run['id'], run['settings']['revision'], time.monotonic() + 120, self.stop)
                frames, reason, cleaned = self.batch.run()
                with self.lock:
                    if not self.closed and not self.blocked and cleaned:
                        self.reader.accept_feeds(sources, frames, reason)
                results.extend('success' if f['reason'] is None else 'failed' for f in frames)
                if len(frames) != len(sources) or reason:
                    results.append('failed')
            browser = run['settings']['schedule']['browser']
            with self.lock:
                run_browser = (run['trigger'] == 'scheduled' and browser['enabled'] and not self.closed and not self.blocked
                               and self.settings['schedule']['enabled'] and run['schedule_key'] == _schedule_key(self.settings['schedule']) and cleaned)
                if run_browser:
                    job = self.reader.jobs.begin(browser['query'], browser['topic'])
            if job:
                thread = self.reader.jobs.thread
                if thread:
                    thread.join(155)
                cleaned = cleaned and not (thread and thread.is_alive()) and not self.reader.jobs.blocked
                current = self.reader.jobs.snapshot(job['job_id'])
                results.append('success' if current and current['state'] == 'complete' else 'failed')
        except Exception:
            reason = 'worker_failed'
            results.append('failed')
            if self.batch:
                cleaned = self.batch.cleanup()
        finally:
            with self.lock:
                self.batch = None
                if not cleaned:
                    self.blocked = True
                    self.status.update(state='blocked', reason='cleanup_unverified', result='failed')
                    return
                self.slot = None
                if self.closed:
                    return
                result = 'skipped' if not results else 'success' if all(r == 'success' for r in results) else 'partial' if 'success' in results else 'failed'
                now = self.clock().isoformat()
                self.status.update(state='idle' if self.settings['schedule']['enabled'] else 'disabled', result=result,
                                   reason=reason or ('no_enabled_sources' if not results else None), finished_at=now)
                if result == 'success':
                    self.status['last_success_at'] = now
                try:
                    self._persist()
                except OSError:
                    self.blocked = True
                    self.status.update(state='blocked', reason='runtime_write_failed')
                self.wake.set()

    def close(self):
        with self.lock:
            if self.closed:
                return
            self.closed = True
            self.owner_generation += 1
            self.stop.set()
            self.wake.set()
        try:
            self.reader.jobs.close()
        except (OSError, RuntimeError):
            with self.lock:
                self.blocked = True
        for thread in (self.thread, self.worker):
            if thread and thread.ident is not None and thread is not threading.current_thread():
                thread.join(5)
        with self.lock:
            if self.blocked or self.reader.jobs.blocked or any(t and t.is_alive() for t in (self.thread, self.worker)):
                self.blocked = True
                if self.owner == 'owned' and self.owner_lock not in _RETAINED_OWNERS:
                    _RETAINED_OWNERS.append(self.owner_lock)
                self.status.update(state='blocked', reason='cleanup_unverified')
                raise NewsUnavailable('cleanup_unverified')
            if self.owner == 'owned':
                self.status.update(state='disabled', pending_due=False)
                try:
                    news_settings.atomic_bytes(self.reader.root / 'runtime.json', (json.dumps(self.status) + '\n').encode())
                except OSError:
                    self.blocked = True
                    _RETAINED_OWNERS.append(self.owner_lock)
                    raise
                self.owner_lock.release()
                self.owner = 'closed'
