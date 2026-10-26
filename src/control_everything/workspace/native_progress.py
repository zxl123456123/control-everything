"""Persist native work and project only identity-checked host facts."""

import hashlib
import json
import re
import time
from uuid import uuid4

from control_everything.input_validation import ProfileError
from control_everything.workspace import dispatch, task_messages, task_sessions
from control_everything.workspace.store import now_utc
from control_everything.workspace.task_schema import bump_list_revision, MAX_REVISION


def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(packed(value).encode('utf-8')).hexdigest()


def fail(reason, field=None):
    raise ProfileError(reason, field, status=409)


def body_fields(body, required, optional=()):
    if type(body) is not dict or not set(required) <= body.keys() or body.keys() - set(required) - set(optional):
        raise ProfileError('invalid_progress_request', 'body')
    for key in ('expected_revision', 'brief_revision', 'progress_revision', 'expected_binding_revision'):
        if key in body and (type(body[key]) is not int or not 0 <= body[key] < 2 ** 53):
            raise ProfileError('invalid_progress_request', key)
    if 'client_token' in body:
        task_messages._text(body['client_token'], 'client_token', 128, required=True)


def row_view(row):
    if row is None:
        return None
    value = dict(row)
    for key in tuple(value):
        if key.endswith('_json'):
            value[key[:-5]] = json.loads(value.pop(key))
    return value


def active_run(connection, task_id):
    return connection.execute('SELECT * FROM task_native_runs WHERE task_id=? AND active_slot=1', (task_id,)).fetchone()


def latest_run(connection, task_id):
    return connection.execute('SELECT * FROM task_native_runs WHERE task_id=? ORDER BY active_slot DESC,created_at DESC,id DESC LIMIT 1', (task_id,)).fetchone()


def task_access(connection, task_id, *, writable=False):
    item = dispatch._task(connection, task_id)
    if writable:
        project = connection.execute('SELECT archived FROM projects WHERE id=?', (item['project_id'],)).fetchone()
        if project is None or project['archived']:
            fail('project_unavailable')
    return item


def check_versions(item, body):
    if item['revision'] != body['expected_revision']:
        fail('item_changed')
    if 'progress_revision' in body and item['progress_revision'] != body['progress_revision']:
        fail('delivery_changed')


def touch(connection, item, state=None, *, delivery_id=None, accepted=False):
    if item['revision'] >= MAX_REVISION or item['progress_revision'] >= MAX_REVISION:
        fail('revision_exhausted')
    state = state or item['state']
    connection.execute('UPDATE task_items SET revision=revision+1,progress_revision=progress_revision+1,'
                       'state=?,resume_state=?,updated_at=?,current_delivery_id=COALESCE(?,current_delivery_id),'
                       'accepted_delivery_id=? WHERE id=?',
                       (state, state if state != 'done' else item['resume_state'], now_utc(), delivery_id,
                        delivery_id if accepted else None, item['id']))
    bump_list_revision(connection)


def exact_binding(expected, actual, *, allow_provider_discovery=False):
    keys = ('runtimeId', 'environmentId', 'terminalHandle', 'paneKey', 'worktreeId', 'agent',
            'ptyId', 'processIncarnation', 'statusProcessIncarnation', 'generation')
    if any(expected.get(key) is None or expected.get(key) != actual.get(key) for key in keys):
        return False
    provider = expected.get('providerSession')
    return (allow_provider_discovery and provider is None) or provider == actual.get('providerSession')


def valid_provider(provider):
    if (type(provider) is not dict or not {'key', 'id'} <= provider.keys()
            or provider.keys() - {'key', 'id', 'transcriptPath'}
            or provider['key'] not in ('session_id', 'conversation_id')):
        return False
    for key, maximum in (('id', 512), ('transcriptPath', 16384)):
        value = provider.get(key)
        if key == 'transcriptPath' and key not in provider:
            continue
        if (type(value) is not str or not value or value != value.strip() or len(value) > maximum
                or any(ord(char) < 32 or ord(char) == 127 for char in value)):
            return False
        try:
            if len(value.encode('utf-8')) > maximum:
                return False
        except UnicodeEncodeError:
            return False
    return not provider['id'].startswith('-')


def resume_provider(run):
    binding = run.get('terminal_binding') or json.loads(run.get('terminal_binding_json') or '{}')
    provider = binding.get('providerSession')
    # Only legacy providers had an unambiguous id-only resume contract.
    if provider is None and run['agent'] in ('codex', 'claude') and run['provider_session_id']:
        provider = {'key': 'session_id', 'id': run['provider_session_id']}
    return provider if valid_provider(provider) and provider['id'] == run['provider_session_id'] else None


def trusted_snapshot(run, facts):
    binding = json.loads(run['terminal_binding_json'])
    return (type(facts) is dict and facts.get('contractVersion') == 1 and facts.get('available') is True
            and exact_binding(binding, facts.get('binding') or {}, allow_provider_discovery=True)
            and type(facts.get('status')) is dict and type(facts.get('evidenceTime')) is dict
            and facts['evidenceTime'].get('kind') in ('observed', 'delivery')
            and facts['evidenceTime'].get('at') is not None)


def delivery_matches_current_turn(delivery, run):
    if not delivery or not run or not run['active_slot'] or delivery['native_run_id'] != run['id']:
        return False
    status = run['observation'].get('status') or {}
    text = status.get('lastAssistantMessage')
    binding = run['terminal_binding']
    if (run['observation_state'] != 'idle' or status.get('state') != 'done'
            or status.get('turnEndDisposition') != 'identified'
            or any(status.get(key) for key in ('interrupted', 'sessionBoundary', 'restoredUnconfirmed', 'isReplay', 'lastAssistantMessageIsToolOutput'))
            or not isinstance(text, str) or not text.strip()
            or status.get('turnStartedAt') is None or status.get('turnEndedAt') is None
            or not exact_binding(binding, run['observation'].get('binding') or {})
            or not exact_binding(binding, delivery['material'].get('source_binding') or {})):
        return False
    provider = binding.get('providerSession') or {}
    return delivery['source_key'] == digest([run['id'], provider.get('id'), status['turnStartedAt'], status['turnEndedAt'], text])


def has_unresolved_delivery(connection, run_id, delivery_id):
    return bool(connection.execute("SELECT 1 FROM task_native_message_delivery WHERE native_run_id=? AND "
                "(state IN ('saved','sending','unknown') OR (state='input_accepted' AND source_delivery_id IS ?))",
                (run_id, delivery_id)).fetchone())


class NativeProgress:
    def __init__(self, store, adapter=None):
        self.store, self.adapter = store, adapter

    def _run(self, connection, task_id, run_id=None):
        row = connection.execute('SELECT * FROM task_native_runs WHERE task_id=? ' +
                                 ('AND id=?' if run_id else 'AND active_slot=1'),
                                 (task_id, run_id) if run_id else (task_id,)).fetchone()
        if row is None:
            fail('native_run_not_found')
        return dict(row)

    def _available(self):
        return bool(self.adapter and self.adapter.available)

    def reserve_start(self, task_id, body):
        body_fields(body, ('expected_revision', 'brief_revision', 'client_token', 'agent', 'worktree_id'))
        if type(body['agent']) is not str or not re.fullmatch(r'[a-z][a-z0-9-]{0,31}', body['agent']):
            raise ProfileError('invalid_progress_request', 'agent')
        task_messages._text(body['worktree_id'], 'worktree_id', 256, required=True)
        request_hash = digest(body)
        with self.store.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            item = task_access(c, task_id, writable=True)
            old = c.execute('SELECT * FROM task_native_runs WHERE task_id=? AND client_token=?',
                            (task_id, body['client_token'])).fetchone()
            if old:
                if old['request_hash'] != request_hash:
                    fail('item_changed')
                return dict(old)
            check_versions(item, body)
            if item['state'] in ('review', 'done'):
                fail('session_conflict')
            brief = dispatch._brief(c, task_id)
            if brief['revision'] != body['brief_revision']:
                fail('brief_changed')
            if brief['revision'] == 0 and c.execute('SELECT 1 FROM task_briefs WHERE task_id=?', (task_id,)).fetchone() is None:
                # Quick-create already persisted the user's request as its title.
                # Freeze it once without replacing any existing authored brief.
                brief = {**brief, 'request_text': item['title']}
            if not brief['request_text'].strip():
                fail('brief_required')
            if (active_run(c, task_id) or c.execute("SELECT 1 FROM agent_runs WHERE task_id=? AND "
                    "status IN ('claimed','running','waiting_review')", (task_id,)).fetchone()
                    or c.execute("SELECT 1 FROM task_dispatches WHERE task_id=? AND delivery_mode='auto' AND "
                                 "delivery_state IN ('previewed','sent','delivered')", (task_id,)).fetchone()):
                fail('session_conflict')
            directory = dispatch._directory(c, item['project_id'], brief['execution_directory_id'])
            identity, stamp = str(uuid4()), now_utc()
            operation = f'{int(time.time() * 1000)}-{uuid4().hex}'
            snapshot = {'request': body, 'brief': brief, 'title': item['title'], 'directory': directory}
            c.execute('INSERT INTO task_native_runs(id,task_id,project_id,directory_id,worktree_id,agent,client_token,'
                      'launch_operation_id,request_hash,brief_snapshot_json,launch_state,created_at,updated_at) '
                      "VALUES(?,?,?,?,?,?,?,?,?,?,'reserved',?,?)",
                      (identity, task_id, item['project_id'], directory['binding_id'], body['worktree_id'], body['agent'],
                       body['client_token'], operation, request_hash, packed(snapshot), stamp, stamp))
            return self._run(c, task_id, identity)

    def start(self, task_id, body):
        run = self.reserve_start(task_id, body)
        if run['launch_state'] == 'created':
            return self.get(task_id)
        if not self._available():
            fail('runtime_unavailable')
        snapshot = json.loads(run['brief_snapshot_json'])
        try:
            if 'scope' not in snapshot:
                scope = self.adapter.prepare_scope(snapshot['directory']['path'], run['worktree_id'])
                snapshot['scope'] = scope
                with self.store.connection() as c:
                    c.execute('BEGIN IMMEDIATE')
                    task_access(c, task_id, writable=True)
                    current = self._run(c, task_id, run['id'])
                    frozen = json.loads(current['brief_snapshot_json'])
                    if 'scope' in frozen:
                        snapshot = frozen
                    else:
                        c.execute('UPDATE task_native_runs SET brief_snapshot_json=?,runtime_id=?,environment_id=? WHERE id=?',
                                  (packed(snapshot), scope['runtimeId'], scope['environmentId'], run['id']))
            brief = snapshot['brief']
            prompt = '\n\n'.join(value for value in (snapshot['title'], brief['request_text'],
                              brief['acceptance_text'], brief['constraints_text'], '\n'.join(brief['references'])) if value)
            reply = self.adapter.create({**snapshot['scope'], 'contractVersion': 1, 'agent': run['agent'],
                                         'prompt': prompt, 'operationId': run['launch_operation_id']})
            self.bind(task_id, run['id'], reply)
        except ProfileError:
            raise
        except Exception:
            with self.store.connection() as c:
                c.execute("UPDATE task_native_runs SET launch_state='unknown',updated_at=? WHERE id=? AND launch_state!='created'",
                          (now_utc(), run['id']))
        return self.get(task_id)

    def bind(self, task_id, run_id, reply, *, resume_attempt=None):
        binding = reply.get('binding') or {}
        with self.store.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            item = task_access(c, task_id, writable=True)
            run = self._run(c, task_id, run_id)
            if resume_attempt:
                if run['binding_revision'] != resume_attempt['expected_binding_revision']:
                    fail('binding_changed')
                run['runtime_id'] = resume_attempt['runtime_id']
            if (not run['active_slot'] or item['project_id'] != run['project_id'] or reply.get('contractVersion') != 1
                    or any(binding.get(key) != run[column] for key, column in
                           (('runtimeId', 'runtime_id'), ('environmentId', 'environment_id'), ('worktreeId', 'worktree_id'), ('agent', 'agent')))
                    or any(binding.get(key) is None for key in ('terminalHandle', 'paneKey', 'ptyId', 'processIncarnation', 'statusProcessIncarnation', 'generation'))):
                fail('binding_changed')
            provider = binding.get('providerSession')
            if run['provider_session_id'] and not provider:
                fail('binding_changed')
            if provider:
                self._link(c, item, run, provider)
            old = json.loads(run['terminal_binding_json'])
            if old != binding or run['launch_state'] != 'created':
                c.execute("UPDATE task_native_runs SET terminal_binding_json=?,provider_session_id=?,launch_state='created',observation_state='unknown',"
                          'runtime_id=?,binding_revision=binding_revision+1,updated_at=? WHERE id=?',
                          (packed(binding), provider['id'] if provider else None, run['runtime_id'], now_utc(), run_id))
                touch(c, item, 'doing')
            if resume_attempt:
                snapshot = json.loads(run['brief_snapshot_json'])
                snapshot['resume_attempts'][resume_attempt['client_token']]['completed'] = True
                c.execute('UPDATE task_native_runs SET brief_snapshot_json=? WHERE id=?', (packed(snapshot), run_id))

    def _link(self, c, item, run, provider):
        old_provider = json.loads(run['terminal_binding_json']).get('providerSession')
        if (not valid_provider(provider) or old_provider is not None and old_provider != provider
                or run['provider_session_id'] not in (None, provider['id'])):
            fail('binding_changed')
        task_sessions.link_session_in_connection(c, item['id'], {
            'source': run['agent'], 'source_instance': run['environment_id'], 'external_id': provider['id'],
            'agent_id': run['agent'], 'title': item['title'][:200]})

    def resume(self, task_id, body):
        body_fields(body, ('native_run_id', 'expected_binding_revision', 'client_token'))
        with self.store.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            task_access(c, task_id, writable=True)
            run = self._run(c, task_id, body['native_run_id'])
            snapshot = json.loads(run['brief_snapshot_json'])
            attempts = snapshot.setdefault('resume_attempts', {})
            old = attempts.get(body['client_token'])
            if old:
                if old['request_hash'] != digest(body):
                    fail('binding_changed')
                if old.get('completed'):
                    return self.get(task_id)
            if run['binding_revision'] != body['expected_binding_revision']:
                fail('binding_changed')
            provider = resume_provider(run)
            if (not provider or not run['active_slot']
                    or json.loads(run['observation_json']).get('can_resume') is False):
                fail('source_only')
            if not old:
                if len(attempts) >= 20:
                    fail('source_only')
                attempts[body['client_token']] = {'request_hash': digest(body), 'completed': False}
                c.execute('UPDATE task_native_runs SET brief_snapshot_json=? WHERE id=?', (packed(snapshot), run['id']))
        if not self._available():
            fail('runtime_unavailable')
        try:
            scope = self.adapter.prepare_scope(snapshot['directory']['path'], run['worktree_id'])
        except Exception:
            fail('runtime_unavailable')
        if scope['environmentId'] != run['environment_id']:
            fail('binding_changed')
        params = {key: value for key, value in scope.items() if key != 'cwd'}
        try:
            reply = self.adapter.resume({**params, 'contractVersion': 1, 'agent': run['agent'],
                                         'providerSession': provider})
        except Exception:
            fail('runtime_unavailable')
        self.bind(task_id, run['id'], reply, resume_attempt={**body, 'runtime_id': scope['runtimeId']})
        return self.get(task_id)

    def adopt(self, task_id, body):
        body_fields(body, ('session_id', 'worktree_id', 'expected_revision', 'client_token'))
        task_messages._text(body['worktree_id'], 'worktree_id', 256, required=True)
        task_messages._text(body['session_id'], 'session_id', 64, required=True)
        request_hash = digest(body)
        with self.store.connection() as c:
            item = task_access(c, task_id, writable=True)
            old = c.execute('SELECT request_hash FROM task_native_runs WHERE task_id=? AND client_token=?', (task_id, body['client_token'])).fetchone()
            if old:
                if old['request_hash'] != request_hash:
                    fail('item_changed')
                return self.get(task_id)
            check_versions(item, body)
            session = c.execute('SELECT * FROM task_sessions WHERE id=? AND task_id=?', (body['session_id'], task_id)).fetchone()
            if item['state'] in ('review', 'done'):
                fail('session_conflict')
            if session is None or session['source'] not in ('codex', 'claude') or not session['source_instance']:
                fail('source_only')
            session = dict(session)
            brief = dispatch._brief(c, task_id)
            directory = dispatch._directory(c, item['project_id'], brief['execution_directory_id'])
        if not self._available():
            fail('runtime_unavailable')
        try:
            scope = self.adapter.prepare_scope(directory['path'], body['worktree_id'])
            if scope['environmentId'] != session['source_instance']:
                fail('binding_changed')
            query = {key: value for key, value in scope.items() if key != 'cwd'}
            query.update(contractVersion=1, agent=session['source'], providerSession={'key': 'session_id', 'id': session['external_id']})
            facts = self.adapter.discover_binding(query)
        except ProfileError:
            raise
        except Exception:
            fail('runtime_unavailable')
        binding = facts.get('binding') or {}
        if (facts.get('available') is not True or facts.get('contractVersion') != 1
                or any(binding.get(key) != query[key] for key in ('runtimeId', 'environmentId', 'worktreeId', 'agent', 'providerSession'))
                or any(binding.get(key) is None for key in ('terminalHandle', 'paneKey', 'ptyId', 'processIncarnation', 'statusProcessIncarnation', 'generation'))):
            fail('binding_changed')
        with self.store.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            item = task_access(c, task_id, writable=True)
            old = c.execute('SELECT request_hash FROM task_native_runs WHERE task_id=? AND client_token=?', (task_id, body['client_token'])).fetchone()
            if old:
                if old['request_hash'] != request_hash:
                    fail('item_changed')
                return self.get(task_id)
            check_versions(item, body)
            current_session = c.execute('SELECT * FROM task_sessions WHERE id=? AND task_id=?', (body['session_id'], task_id)).fetchone()
            if (current_session is None or current_session['source'] != session['source']
                    or current_session['source_instance'] != session['source_instance'] or current_session['external_id'] != session['external_id']
                    or dispatch._directory(c, item['project_id'], brief['execution_directory_id']) != directory):
                fail('binding_changed')
            if (active_run(c, task_id) or c.execute("SELECT 1 FROM agent_runs WHERE task_id=? AND status IN ('claimed','running','waiting_review')", (task_id,)).fetchone()
                    or c.execute("SELECT 1 FROM task_dispatches WHERE task_id=? AND delivery_mode='auto' AND delivery_state IN ('previewed','sent','delivered')", (task_id,)).fetchone()):
                fail('session_conflict')
            identity, stamp = str(uuid4()), now_utc()
            snapshot = {'request': body, 'brief': brief, 'title': item['title'], 'directory': directory, 'scope': scope, 'adopted': True}
            c.execute('INSERT INTO task_native_runs(id,task_id,project_id,directory_id,worktree_id,environment_id,runtime_id,agent,'
                      'client_token,launch_operation_id,request_hash,brief_snapshot_json,provider_session_id,terminal_binding_json,'
                      'launch_state,binding_revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)',
                      (identity, task_id, item['project_id'], directory['binding_id'], body['worktree_id'], scope['environmentId'], scope['runtimeId'],
                       session['source'], body['client_token'], f'{int(time.time() * 1000)}-{uuid4().hex}', request_hash, packed(snapshot),
                       session['external_id'], packed(binding), 'created', stamp, stamp))
            touch(c, item, 'doing')
        self.project_observation(identity, facts)
        return self.get(task_id)

    def project_observation(self, run_id, facts, *, timeout=None, cancel_event=None):
        with self.store.connection(timeout=timeout, cancel_event=cancel_event) as c:
            c.execute('BEGIN IMMEDIATE')
            raw = c.execute('SELECT * FROM task_native_runs WHERE id=? AND active_slot=1', (run_id,)).fetchone()
            if raw is None:
                return
            run = dict(raw)
            item = task_access(c, run['task_id'])
            previous = json.loads(run['observation_json'])
            if not trusted_snapshot(run, facts):
                # Keep the last trusted body, time, and unresolved attention on disconnect.
                c.execute("UPDATE task_native_runs SET observation_state='unknown' WHERE id=?", (run_id,))
                return
            status = facts['status']
            if any(status.get(key) for key in ('restoredUnconfirmed', 'isReplay', 'sessionBoundary')):
                c.execute("UPDATE task_native_runs SET observation_state='unknown' WHERE id=?", (run_id,))
                return
            provider = status.get('providerSession')
            if not provider or provider != facts['binding'].get('providerSession'):
                c.execute("UPDATE task_native_runs SET observation_state='unknown' WHERE id=?", (run_id,))
                return
            self._link(c, item, run, provider)
            binding = json.loads(run['terminal_binding_json'])
            if binding.get('providerSession') is None:
                binding['providerSession'] = provider
                c.execute('UPDATE task_native_runs SET provider_session_id=?,terminal_binding_json=?,binding_revision=binding_revision+1 WHERE id=?',
                          (provider['id'], packed(binding), run_id))
            stamp = facts['evidenceTime']['at']
            old_stamp = previous.get('evidenceTime', {}).get('at')
            if old_stamp is not None and stamp < old_stamp:
                return
            state = status.get('state')
            interrupted = status.get('interrupted')
            attention = status.get('interactivePrompt') or ('请返回会话处理阻塞' if state == 'blocked' else None)
            observation_state = ('interrupted' if interrupted else 'blocked' if attention else
                                 'working' if state == 'working' else 'waiting' if state in ('waiting', 'waiting_for_input') else
                                 'idle' if state in ('done', 'idle') else 'unknown')
            normalized = {key: facts[key] for key in ('binding', 'status', 'evidenceTime')}
            normalized['can_send_feedback'] = facts.get('canSendFeedback') is True
            normalized['can_resume'] = (facts.get('canResume') is True if 'canResume' in facts
                                        else run['agent'] in ('codex', 'claude'))
            normalized['attention'] = ({'kind': 'source_only', 'text': (attention if isinstance(attention, str)
                                        else '请返回会话处理请求'), 'source_time': stamp,
                                        'fingerprint': digest([binding['terminalHandle'], binding['generation'], attention])} if attention else None)
            changed = packed(normalized) != packed(previous)
            if not changed:
                c.execute('UPDATE task_native_runs SET observation_state=? WHERE id=?', (observation_state, run_id))
                return
            c.execute('UPDATE task_native_runs SET observation_state=?,observation_json=?,observed_at=?,updated_at=? WHERE id=?',
                      (observation_state, packed(normalized), str(stamp), now_utc(), run_id))
            old_status = previous.get('status', {})
            new_turn = bool(status.get('turnStartedAt') and status.get('turnStartedAt') != old_status.get('turnStartedAt'))
            working_transition = state == 'working' and old_status.get('state') != 'working'
            important = (new_turn or working_transition or
                         (normalized['attention'] or {}).get('fingerprint') != (previous.get('attention') or {}).get('fingerprint'))
            text = status.get('lastAssistantMessage')
            normal_end = (state == 'done' and status.get('turnStartedAt') is not None and status.get('turnEndedAt') is not None
                          and status['turnEndedAt'] >= status['turnStartedAt']
                          and status.get('turnEndDisposition') == 'identified' and not interrupted
                          and not status.get('lastAssistantMessageIsToolOutput') and isinstance(text, str) and text.strip())
            delivery_id = None
            if normal_end:
                source_key = digest([run_id, provider['id'], status['turnStartedAt'], status['turnEndedAt'], text])
                old_delivery = c.execute('SELECT id FROM task_deliveries WHERE task_id=? AND source=? AND source_key=?',
                                        (item['id'], 'native_turn', source_key)).fetchone()
                if old_delivery is None:
                    delivery_id = str(uuid4())
                    material = {'source_label': 'Agent 返回内容', 'tests': {'status': 'missing'},
                                'verification': 'unverified', 'turn_started_at': status['turnStartedAt'],
                                'turn_ended_at': status['turnEndedAt'], 'evidence_time': facts['evidenceTime'],
                                'source_binding': binding}
                    c.execute('INSERT INTO task_deliveries(id,task_id,native_run_id,source,source_key,summary,material_json,created_at) '
                              "VALUES(?,?,?,'native_turn',?,?,?,?)", (delivery_id, item['id'], run_id, source_key, text[:30000], packed(material), now_utc()))
            if important or delivery_id:
                touch(c, item, 'blocked' if attention else 'doing', delivery_id=delivery_id)

    def get(self, task_id, *, execution_allowed=True):
        with self.store.connection() as c:
            c.execute('BEGIN')
            item = task_access(c, task_id)
            run = row_view(latest_run(c, task_id))
            delivery = row_view(c.execute('SELECT * FROM task_deliveries WHERE id=?', (item['current_delivery_id'],)).fetchone())
            messages = []
            for row in c.execute('SELECT * FROM task_messages WHERE task_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100', (task_id,)):
                value = dict(row)
                value['native_delivery'] = row_view(c.execute('SELECT * FROM task_native_message_delivery WHERE message_id=?', (row['id'],)).fetchone())
                messages.append(value)
            attention = run['observation'].get('attention') if run else None
            available = self._available() and execution_allowed
            project = c.execute('SELECT archived FROM projects WHERE id=?', (item['project_id'],)).fetchone()
            writable = execution_allowed and project is not None and not project['archived']
            tracked = bool(run and run['active_slot'])
            legacy_busy = c.execute("SELECT 1 FROM agent_runs WHERE task_id=? AND status IN ('claimed','running','waiting_review')", (task_id,)).fetchone()
            legacy_busy = legacy_busy or c.execute("SELECT 1 FROM task_dispatches WHERE task_id=? AND delivery_mode='auto' AND delivery_state IN ('previewed','sent','delivered')", (task_id,)).fetchone()
            can_start = bool(available and writable and not tracked and not legacy_busy and item['state'] not in ('review', 'done'))
            can_adopt = can_start and bool(c.execute("SELECT 1 FROM task_sessions WHERE task_id=? AND source IN ('codex','claude') AND source_instance!=''", (task_id,)).fetchone())
            unresolved = bool(run and has_unresolved_delivery(c, run['id'], item['current_delivery_id']))
            return {'item': item, 'brief': dispatch._brief(c, task_id), 'native_run': run,
                    'current_delivery': delivery, 'attention': attention, 'messages': messages,
                    'source_time': run['observed_at'] if run else None,
                    'source': ({'project_id': run['project_id'], 'worktree_id': run['worktree_id'],
                                'environment_id': run['environment_id'], 'provider_session_id': run['provider_session_id'],
                                'terminal_binding': run['terminal_binding']} if run else None),
                    'capabilities': {'execution_available': available, 'can_start': can_start, 'can_adopt': can_adopt,
                                     'can_feedback': tracked and writable,
                                     'can_release': tracked and writable,
                                     'can_reconcile_start': bool(available and writable and tracked and run['launch_state'] in ('reserved', 'unknown')),
                                     'can_resume': bool(available and writable and tracked and resume_provider(run)
                                                        and run['observation'].get('can_resume', run['agent'] in ('codex', 'claude'))
                                                        and run['observation_state'] in ('unknown', 'interrupted')),
                                     'can_send_feedback': bool(available and writable and tracked and run['provider_session_id'] and not attention
                                                               and run['observation_state'] != 'unknown'
                                                               and run['observation'].get('can_send_feedback')),
                                     'can_review': bool(available and writable and delivery_matches_current_turn(delivery, run) and not unresolved),
                                     'source_only': True}}

    def projections(self, item_ids):
        result = {}
        with self.store.connection() as c:
            for task_id in item_ids:
                run = row_view(latest_run(c, task_id))
                if not run:
                    continue
                item = task_access(c, task_id)
                delivery = c.execute('SELECT summary FROM task_deliveries WHERE id=?', (item['current_delivery_id'],)).fetchone()
                result[task_id] = {'native_run_id': run['id'], 'launch_state': run['launch_state'],
                    'active_slot': run['active_slot'],
                    'observation_state': run['observation_state'], 'source_time': run['observed_at'],
                    'attention': run['observation'].get('attention'), 'current_delivery_id': item['current_delivery_id'],
                    'has_delivery': bool(item['current_delivery_id']), 'verification': 'unverified',
                    'can_resume': bool(run['active_slot'] and run['provider_session_id'] and run['observation_state'] in ('unknown', 'interrupted')),
                    'summary': delivery['summary'][:160] if delivery else None}
        return result

    def release(self, task_id, body):
        body_fields(body, ('native_run_id', 'expected_revision', 'expected_binding_revision', 'client_token', 'confirmed'))
        if body['confirmed'] is not True:
            raise ProfileError('confirmation_required')
        with self.store.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            item = task_access(c, task_id, writable=True)
            run = self._run(c, task_id, body['native_run_id'])
            snapshot = json.loads(run['brief_snapshot_json'])
            old = snapshot.get('release_request')
            if old and old['client_token'] == body['client_token']:
                if old['request_hash'] != digest(body):
                    fail('item_changed')
                return self.get(task_id)
            check_versions(item, body)
            if run['binding_revision'] != body['expected_binding_revision'] or not run['active_slot']:
                fail('binding_changed')
            snapshot['release_request'] = {'client_token': body['client_token'], 'request_hash': digest(body)}
            c.execute('UPDATE task_native_runs SET active_slot=0,brief_snapshot_json=?,updated_at=? WHERE id=?',
                      (packed(snapshot), now_utc(), run['id']))
            c.execute('UPDATE task_items SET revision=revision+1,progress_revision=progress_revision+1,updated_at=? WHERE id=?', (now_utc(), task_id))
            bump_list_revision(c)
        return self.get(task_id)

    def save_feedback(self, task_id, body):
        body_fields(body, ('expected_revision', 'progress_revision', 'body_text', 'client_token', 'send'), ('source_delivery_id',))
        text = task_messages._text(body['body_text'], 'body_text', 10000, required=True)
        if type(body['send']) is not bool:
            raise ProfileError('invalid_progress_request', 'send')
        request_hash = digest(body)
        with self.store.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            item = task_access(c, task_id, writable=True)
            old = c.execute('SELECT m.id,d.payload_hash FROM task_messages m JOIN task_native_message_delivery d '
                            'ON m.id=d.message_id WHERE m.task_id=? AND m.client_token=?', (task_id, body['client_token'])).fetchone()
            if old:
                if old['payload_hash'] != request_hash:
                    fail('item_changed')
                message_id, fresh = old['id'], False
            else:
                check_versions(item, body)
                if c.execute('SELECT 1 FROM task_messages WHERE task_id=? AND client_token=?', (task_id, body['client_token'])).fetchone():
                    fail('item_changed')
                run = self._run(c, task_id)
                source = body.get('source_delivery_id')
                if source is not None and source != item['current_delivery_id']:
                    fail('delivery_changed')
                if source:
                    c.execute('INSERT INTO task_reviews(id,task_id,verdict,reason,created_at,delivery_id,native_run_id) '
                              "VALUES(?,?,'changes_requested',?,?,?,?)", (str(uuid4()), task_id, text, now_utc(), source, run['id']))
                msg = task_messages.create_message_in_connection(c, task_id, {'kind': 'return', 'body_text': text,
                                                 'client_token': body['client_token'], 'agent_id': run['agent']})['message']
                message_id, fresh = msg['id'], True
                request_id = str(uuid4())
                binding = json.loads(run['terminal_binding_json'])
                payload = f"Goal: {item['title']}\n\n{json.loads(run['brief_snapshot_json'])['brief']['request_text']}\n"
                if source:
                    delivery = c.execute('SELECT summary FROM task_deliveries WHERE id=?', (source,)).fetchone()
                    payload += f"\nResult under review:\n{delivery['summary']}\n"
                payload += f'\nRequested changes:\n{text}'
                params = {'contractVersion': 1, 'terminal': binding.get('terminalHandle'), 'text': payload,
                          'expectedBinding': binding, 'origin': {'taskId': task_id, 'nativeRunId': run['id'],
                                                               'messageId': message_id, 'requestId': request_id}}
                stamp = now_utc()
                c.execute('INSERT INTO task_native_message_delivery(message_id,native_run_id,source_delivery_id,request_id,'
                          'payload_hash,payload_text,binding_revision,send_params_json,expected_binding_json,state,created_at,updated_at) '
                          "VALUES(?,?,?,?,?,?,?,?,?,'saved',?,?)", (message_id, run['id'], source, request_id, request_hash,
                           payload, run['binding_revision'], packed(params), packed(binding), stamp, stamp))
                touch(c, item, 'doing')
        if fresh and body['send']:
            return self.send_feedback(task_id, message_id)
        return self.get(task_id)

    def send_feedback(self, task_id, message_id):
        with self.store.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            task_access(c, task_id, writable=True)
            row = c.execute('SELECT d.* FROM task_native_message_delivery d JOIN task_messages m ON m.id=d.message_id '
                            'WHERE m.task_id=? AND d.message_id=?', (task_id, message_id)).fetchone()
            if row is None:
                fail('message_not_found')
            value = dict(row)
            run = self._run(c, task_id, value['native_run_id'])
            if not run['active_slot']:
                fail('source_only')
            # Every attempt starts once. Uncertain writes are resolved only by read_receipt.
            if value['state'] == 'refused':
                receipt = json.loads(value['receipt_json'])
                send = (receipt.get('receipt') or {}).get('send') or {}
                attempts = json.loads(value['attempts_json'])
                if send.get('accepted') is not False or send.get('bytesWritten') != 0 or not send.get('refusedReason') or len(attempts) >= 20:
                    fail('delivery_unknown')
                attempts.append({key: value[key] for key in ('request_id', 'send_params_json', 'expected_binding_json', 'receipt_json')})
                params = json.loads(value['send_params_json'])
                value['request_id'] = str(uuid4())
                params['origin']['requestId'] = value['request_id']
                value['send_params_json'] = packed(params)
                c.execute("UPDATE task_native_message_delivery SET request_id=?,send_params_json=?,attempts_json=?,state='saved' WHERE message_id=?",
                          (value['request_id'], value['send_params_json'], packed(attempts), message_id))
            elif value['state'] != 'saved':
                return self.get(task_id)
            if c.execute("SELECT 1 FROM task_native_message_delivery WHERE native_run_id=? AND message_id<>? AND state IN ('sending','unknown')",
                         (run['id'], message_id)).fetchone():
                fail('delivery_unknown')
            binding = json.loads(run['terminal_binding_json'])
            frozen = json.loads(value['expected_binding_json'])
            if not run['provider_session_id']:
                fail('binding_changed')
            if run['binding_revision'] != value['binding_revision'] or not exact_binding(frozen, binding):
                if frozen.get('providerSession') not in (None, binding.get('providerSession')):
                    fail('binding_changed')
                # A saved message has never entered the host ledger; explicitly send it
                # to the verified resumed binding of the same provider, keeping its text.
                params = json.loads(value['send_params_json'])
                params.update(terminal=binding['terminalHandle'], expectedBinding=binding)
                value.update(send_params_json=packed(params), expected_binding_json=packed(binding), binding_revision=run['binding_revision'])
                c.execute('UPDATE task_native_message_delivery SET send_params_json=?,expected_binding_json=?,binding_revision=? WHERE message_id=?',
                          (value['send_params_json'], value['expected_binding_json'], value['binding_revision'], message_id))
            if json.loads(run['observation_json']).get('attention'):
                fail('source_only')
            if not self._available():
                fail('runtime_unavailable')
            c.execute("UPDATE task_native_message_delivery SET state='sending',updated_at=? WHERE message_id=?", (now_utc(), message_id))
        try:
            receipt = self.adapter.send(json.loads(value['send_params_json']), value['request_id'])
            self.record_receipt(message_id, {'receiptState': 'completed', 'bindingState': 'current', 'receipt': receipt})
        except Exception:
            self.record_receipt(message_id, {'receiptState': 'pending', 'bindingState': 'unavailable'})
        return self.get(task_id)

    def record_receipt(self, message_id, response, *, timeout=None, cancel_event=None):
        with self.store.connection(timeout=timeout, cancel_event=cancel_event) as c:
            c.execute('BEGIN IMMEDIATE')
            row = c.execute('SELECT * FROM task_native_message_delivery WHERE message_id=?', (message_id,)).fetchone()
            if not row or row['state'] == 'saved':
                return
            value = dict(row)
            binding = json.loads(value['expected_binding_json'])
            send = (response.get('receipt') or {}).get('send') or {}
            prompt = send.get('prompt') or {}
            valid = (response.get('receiptState') == 'completed' and prompt.get('requestId') == value['request_id']
                     and send.get('handle') == binding.get('terminalHandle')
                     and prompt.get('processIncarnation') == binding.get('processIncarnation')
                     and prompt.get('generation') == binding.get('generation'))
            state = 'unknown'
            if valid:
                if send.get('accepted') and 'input_accepted' in prompt.get('stages', []):
                    state = 'turn_started' if 'turn_started' in prompt['stages'] else 'input_accepted'
                elif send.get('accepted') is False and send.get('bytesWritten') == 0 and send.get('refusedReason'):
                    state = 'refused'
            previous = json.loads(value['receipt_json'])
            if value['state'] in ('input_accepted', 'turn_started') and not valid:
                response = {**response, 'historical_receipt': previous.get('historical_receipt', previous)}
                state = value['state']
            c.execute('UPDATE task_native_message_delivery SET state=?,receipt_json=?,updated_at=? WHERE message_id=?',
                      (state, packed(response), now_utc(), message_id))

    def review_delivery(self, task_id, body):
        body_fields(body, ('expected_revision', 'progress_revision', 'delivery_id', 'verdict', 'reason', 'confirmed', 'client_token'))
        if body['confirmed'] is not True or body['verdict'] not in ('approved', 'changes_requested', 'rejected'):
            raise ProfileError('invalid_review')
        if not isinstance(body['reason'], str):
            raise ProfileError('invalid_review', 'reason')
        task_messages._text(body['reason'], 'reason', 10000, required=body['verdict'] != 'approved')
        request_hash = digest(body)
        def replay(c):
            task_access(c, task_id, writable=True)
            row = c.execute('SELECT * FROM task_reviews WHERE task_id=? AND client_token=?', (task_id, body['client_token'])).fetchone()
            if row and row['request_hash'] != request_hash:
                fail('item_changed')
            return row is not None
        with self.store.connection() as c:
            if replay(c):
                return self.get(task_id)
            run = self._run(c, task_id)
        if not self._available():
            fail('runtime_unavailable')
        try:
            facts = self.adapter.observe(json.loads(run['terminal_binding_json']), timeout=.75)
        except Exception:
            fail('delivery_unknown')
        self.project_observation(run['id'], facts)
        with self.store.connection() as c:
            c.execute('BEGIN IMMEDIATE')
            if replay(c):
                return self.get(task_id)
            item = task_access(c, task_id, writable=True)
            run = self._run(c, task_id, run['id'])
            if not trusted_snapshot(run, facts) or run['observation_state'] != 'idle':
                fail('delivery_unknown')
            check_versions(item, body)
            if item['current_delivery_id'] != body['delivery_id'] or not body['delivery_id']:
                fail('delivery_changed')
            delivery = row_view(c.execute('SELECT * FROM task_deliveries WHERE id=?', (body['delivery_id'],)).fetchone())
            if not delivery_matches_current_turn(delivery, row_view(run)):
                fail('delivery_unknown')
            if has_unresolved_delivery(c, run['id'], item['current_delivery_id']):
                fail('delivery_unknown')
            c.execute('INSERT INTO task_reviews(id,task_id,verdict,reason,created_at,delivery_id,native_run_id,client_token,request_hash) '
                      'VALUES(?,?,?,?,?,?,?,?,?)', (str(uuid4()), task_id, body['verdict'], body['reason'], now_utc(),
                       body['delivery_id'], run['id'], body['client_token'], request_hash))
            touch(c, item, 'done' if body['verdict'] == 'approved' else 'doing',
                  delivery_id=body['delivery_id'], accepted=body['verdict'] == 'approved')
        return self.get(task_id)

    def observe_jobs(self, *, timeout=None, cancel_event=None):
        with self.store.connection(timeout=timeout, cancel_event=cancel_event) as c:
            runs = [dict(row) for row in c.execute("SELECT * FROM task_native_runs WHERE active_slot=1 AND launch_state='created' ORDER BY id")]
            receipts = [dict(row) for row in c.execute("SELECT * FROM task_native_message_delivery WHERE state IN ('sending','unknown','input_accepted') ORDER BY message_id")]
        return [('observe', row) for row in runs] + [('receipt', row) for row in receipts]

    def observe_job(self, job, *, timeout, cancel_event):
        kind, row = job
        deadline = time.monotonic() + timeout
        def remaining():
            return max(0, deadline - time.monotonic())
        if not self._available():
            if kind == 'observe':
                self.project_observation(row['id'], {'available': False}, timeout=remaining(), cancel_event=cancel_event)
            return
        try:
            if kind == 'observe':
                facts = self.adapter.observe(json.loads(row['terminal_binding_json']), timeout=timeout, cancel_event=cancel_event)
                self.project_observation(row['id'], facts, timeout=remaining(), cancel_event=cancel_event)
            else:
                response = self.adapter.read_receipt(row['request_id'], json.loads(row['send_params_json']),
                            json.loads(row['expected_binding_json']), timeout=timeout, cancel_event=cancel_event)
                self.record_receipt(row['message_id'], response, timeout=remaining(), cancel_event=cancel_event)
        except Exception:
            if kind == 'observe' and remaining() > 0 and not cancel_event.is_set():
                self.project_observation(row['id'], {'available': False}, timeout=remaining(), cancel_event=cancel_event)
