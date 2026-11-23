"""Local identity facts. Trusted methods are internal adapter boundaries, not HTTP APIs."""
import hashlib
import json
import re
import secrets
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from control_everything.workspace import dispatch
from control_everything.workspace.store import now_utc


def confirmed_identity(db, project_id, binding_id, device):
    return db.execute('''SELECT c.open_id,h.app_id,h.producer_id,h.account_id,h.chat_id
        FROM automation_identity_bindings b JOIN automation_identity_candidates c ON c.id=b.candidate_id
        JOIN automation_identity_challenges h ON h.id=b.challenge_id
        WHERE b.id=? AND b.project_id=? AND b.state='active' AND h.state='confirmed' AND h.project_id=?
        AND h.hub_origin=? AND h.device_id=? AND h.generation=? AND c.app_id=h.app_id''',
        (binding_id, project_id, project_id, device['hub_origin'], device['device_id'], device['generation'])).fetchone()


class IdentityService:
    def __init__(self, store, current_binding):
        self.store = store
        # The callback reads local credentials only: no network or nested connector lock.
        self.current_binding = current_binding

    @contextmanager
    def _transaction(self, project_id):
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            project = db.execute('SELECT archived FROM projects WHERE id=?', (project_id,)).fetchone()
            if not project or project['archived']:
                raise ValueError('identity_project_unavailable')
            binding = dict(self.current_binding() or {})
            if not all(binding.get(k) for k in ('hub_origin', 'device_id', 'generation')):
                raise ValueError('identity_device_unavailable')
            yield db, binding
            if binding != dict(self.current_binding() or {}):
                raise ValueError('identity_device_changed')

    @staticmethod
    def _current(challenge, binding):
        if any(challenge[k] != binding[k] for k in ('hub_origin', 'device_id', 'generation')):
            raise ValueError('identity_device_changed')

    def _challenge(self, db, project_id, challenge_id, binding, *, pending=False):
        row = db.execute('SELECT * FROM automation_identity_challenges WHERE id=? AND project_id=?',
                         (challenge_id, project_id)).fetchone()
        if not row:
            raise ValueError('identity_challenge_missing')
        self._current(row, binding)
        if pending and (row['state'] != 'pending' or row['expires_at'] <= now_utc()):
            raise ValueError('identity_challenge_unavailable')
        return row

    def create_challenge(self, project_id, trusted_context, *, lifetime_seconds=600):
        """Context must come from the authenticated producer configuration adapter."""
        keys = ('hub_origin', 'device_id', 'generation', 'producer_id', 'channel_account_id', 'app_id', 'chat_id', 'project_id')
        if (set(trusted_context) != set(keys) or trusted_context.get('project_id') != project_id or type(lifetime_seconds) is not int
                or not 1 <= lifetime_seconds <= 600
                or any(type(trusted_context[k]) is not str or not trusted_context[k] for k in keys if k != 'generation')
                or type(trusted_context['generation']) is not int or trusted_context['generation'] < 1):
            raise ValueError('identity_context_invalid')
        with self._transaction(project_id) as (db, binding):
            self._current(trusted_context, binding)
            challenge_id, nonce = uuid4().hex, secrets.token_urlsafe(32)
            expires = (datetime.now(timezone.utc) + timedelta(seconds=lifetime_seconds)).isoformat()
            db.execute('INSERT INTO automation_identity_challenges VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                       (challenge_id, project_id, *(trusted_context[k] for k in ('hub_origin','producer_id','channel_account_id','app_id','chat_id','device_id','generation')),
                        hashlib.sha256(nonce.encode()).hexdigest(), None, expires, 'awaiting_message', now_utc()))
            return {'challenge_id': challenge_id, 'nonce': nonce, 'expires_at': expires}

    def attach_message(self, project_id, challenge_id, trusted_message_id):
        """Only the trusted sender may attach its actual message receipt."""
        if type(trusted_message_id) is not str or not trusted_message_id:
            raise ValueError('identity_message_invalid')
        with self._transaction(project_id) as (db, binding):
            row = self._challenge(db, project_id, challenge_id, binding)
            if row['expires_at'] <= now_utc() or row['state'] not in ('awaiting_message', 'pending'):
                raise ValueError('identity_challenge_unavailable')
            if row['message_id'] and row['message_id'] != trusted_message_id:
                raise ValueError('identity_message_conflict')
            db.execute("UPDATE automation_identity_challenges SET message_id=?,state='pending' WHERE id=?",
                       (trusted_message_id, challenge_id))

    def receive_candidate(self, project_id, challenge_id, trusted_envelope):
        """Future binding adapter supplies SDK identity and authenticated producer provenance.

        No current decision envelope is accepted as an identity binding envelope.
        """
        expected = {'producer_id','channel_account_id','app_id','chat_id','message_id','nonce','actor_open_id','event_id','inbox_message_id'}
        if set(trusted_envelope) != expected or any(type(v) is not str or not v for v in trusted_envelope.values()):
            raise ValueError('identity_candidate_invalid')
        e = trusted_envelope
        with self._transaction(project_id) as (db, binding):
            row = self._challenge(db, project_id, challenge_id, binding, pending=True)
            if (any(row[k] != e['channel_account_id' if k == 'account_id' else k] for k in ('producer_id','account_id','app_id','chat_id','message_id'))
                    or not secrets.compare_digest(row['nonce_hash'], hashlib.sha256(e['nonce'].encode()).hexdigest())):
                raise ValueError('identity_candidate_mismatch')
            inbox = db.execute('SELECT * FROM automation_remote_inbox WHERE hub_origin=? AND device_id=? AND generation=? AND message_id=?',
                               (row['hub_origin'], row['device_id'], row['generation'], e['inbox_message_id'])).fetchone()
            payload = {'kind': 'feishu_identity_binding', 'project_id': project_id,
                       **{k: e[k] for k in ('producer_id','channel_account_id','app_id','chat_id','message_id','actor_open_id')},
                       'binding': {'namespace':'control-everything.identity.v1','challenge_id':challenge_id,'nonce':e['nonce']}}
            if (not inbox or inbox['source'] != 'feishu:' + hashlib.sha256(json.dumps([e['channel_account_id'],e['app_id']], ensure_ascii=True, separators=(',', ':')).encode()).hexdigest() or inbox['event_id'] != e['event_id']
                    or json.loads(inbox['payload_json']) != payload):
                raise ValueError('identity_provenance_mismatch')
            prior = db.execute('SELECT c.* FROM automation_identity_candidates c JOIN automation_identity_challenges h ON h.id=c.challenge_id WHERE h.hub_origin=? AND h.account_id=? AND h.app_id=? AND c.source_event_id=?', (row['hub_origin'],row['account_id'],row['app_id'],e['event_id'])).fetchone()
            if prior:
                if any(prior[k] != value for k, value in {'challenge_id':challenge_id,'app_id':e['app_id'],'open_id':e['actor_open_id'],'inbox_message_id':e['inbox_message_id']}.items()):
                    raise ValueError('identity_event_conflict')
                return dict(prior)
            prior = db.execute('SELECT * FROM automation_identity_candidates WHERE challenge_id=? AND app_id=? AND open_id=?',
                               (challenge_id,e['app_id'],e['actor_open_id'])).fetchone()
            if prior:
                raise ValueError('identity_candidate_conflict')
            candidate = uuid4().hex
            db.execute('INSERT INTO automation_identity_candidates VALUES(?,?,?,?,?,?,?)',
                       (candidate,challenge_id,e['app_id'],e['actor_open_id'],e['event_id'],e['inbox_message_id'],now_utc()))
            return dict(db.execute('SELECT * FROM automation_identity_candidates WHERE id=?',(candidate,)).fetchone())

    def list(self, project_id):
        with self._transaction(project_id) as (db, binding):
            rows = db.execute('SELECT * FROM automation_identity_challenges WHERE project_id=? ORDER BY created_at,id',(project_id,)).fetchall()
            result = []
            for row in rows:
                if any(row[k] != binding[k] for k in ('hub_origin','device_id','generation')):
                    continue
                fact = dict(row)
                fact.pop('nonce_hash')
                fact['candidates'] = [dict(c) for c in db.execute('SELECT * FROM automation_identity_candidates WHERE challenge_id=? ORDER BY created_at,id',(row['id'],))]
                fact['bindings'] = [dict(b) for b in db.execute('SELECT * FROM automation_identity_bindings WHERE challenge_id=?',(row['id'],))]
                result.append(fact)
            return result

    def confirm(self, project_id, candidate_id):
        """Call only after local-control authorization and explicit candidate selection."""
        with self._transaction(project_id) as (db, binding):
            candidate = db.execute('SELECT * FROM automation_identity_candidates WHERE id=?',(candidate_id,)).fetchone()
            if not candidate:
                raise ValueError('identity_candidate_missing')
            row = self._challenge(db,project_id,candidate['challenge_id'],binding,pending=True)
            identity = uuid4().hex
            db.execute('INSERT INTO automation_identity_bindings VALUES(?,?,?,?,?,?,?)',
                       (identity,row['id'],candidate_id,project_id,'active',now_utc(),None))
            db.execute("UPDATE automation_identity_challenges SET state='confirmed' WHERE id=?",(row['id'],))
            return dict(db.execute('SELECT * FROM automation_identity_bindings WHERE id=?',(identity,)).fetchone())

    def revoke(self, project_id, binding_id):
        with self._transaction(project_id) as (db, binding):
            fact = db.execute('SELECT * FROM automation_identity_bindings WHERE id=? AND project_id=?',(binding_id,project_id)).fetchone()
            if not fact:
                raise ValueError('identity_binding_missing')
            self._challenge(db,project_id,fact['challenge_id'],binding)
            db.execute("UPDATE automation_identity_bindings SET state='revoked',revoked_at=COALESCE(revoked_at,?) WHERE id=?",(now_utc(),binding_id))
            db.execute("UPDATE automation_identity_challenges SET state='revoked' WHERE id=?",(fact['challenge_id'],))
            return dict(db.execute('SELECT * FROM automation_identity_bindings WHERE id=?',(binding_id,)).fetchone())

    def designate(self, project_id, task_id, binding_id):
        """A local manager names one active binding as this task's acceptor. Chat cannot do this."""
        if (not isinstance(task_id, str) or not task_id or len(task_id) > 256
                or not isinstance(binding_id, str) or not re.fullmatch(r'[0-9a-f]{32}', binding_id)):
            raise ValueError('acceptor_invalid')
        with self._transaction(project_id) as (db, binding):
            fact = db.execute('''SELECT c.open_id, c.app_id FROM automation_identity_bindings b
                JOIN automation_identity_candidates c ON c.id=b.candidate_id
                JOIN automation_identity_challenges h ON h.id=b.challenge_id
                WHERE b.id=? AND b.project_id=? AND b.state='active' AND h.project_id=?
                AND h.hub_origin=? AND h.device_id=? AND h.generation=?''',
                (binding_id, project_id, project_id, binding['hub_origin'], binding['device_id'], binding['generation'])).fetchone()
            if not fact:
                raise ValueError('acceptor_binding_missing')
            task = db.execute('SELECT project_id FROM task_items WHERE id=?', (task_id,)).fetchone()
            if not task or task['project_id'] != project_id:
                raise ValueError('acceptor_task_missing')
            db.execute('''INSERT INTO automation_task_acceptors(task_id, app_id, open_id, set_at) VALUES(?,?,?,?)
                ON CONFLICT(task_id) DO UPDATE SET app_id=excluded.app_id, open_id=excluded.open_id, set_at=excluded.set_at''',
                (task_id, fact['app_id'], fact['open_id'], now_utc()))
            return {'task_id': task_id, 'app_id': fact['app_id'], 'open_id': fact['open_id']}

    def set_assignment_grant(self, project_id, binding_id, reviewer_binding_id, directory_id, enabled):
        """The local owner independently chooses who initiates and reviews new project tasks."""
        with self._transaction(project_id) as (db, device):
            if enabled:
                initiator = confirmed_identity(db, project_id, binding_id, device)
                reviewer = confirmed_identity(db, project_id, reviewer_binding_id, device)
                if not initiator or not reviewer or tuple(initiator)[1:] != tuple(reviewer)[1:]:
                    raise ValueError('assignment_binding_unavailable')
                directory = dispatch._directory(db, project_id, directory_id)
                db.execute('''INSERT INTO automation_assignment_grants
                    (binding_id,reviewer_binding_id,project_id,directory_id,directory_path,set_at) VALUES(?,?,?,?,?,?)
                    ON CONFLICT(binding_id) DO UPDATE SET reviewer_binding_id=excluded.reviewer_binding_id,
                    directory_id=excluded.directory_id,directory_path=excluded.directory_path,set_at=excluded.set_at
                    WHERE automation_assignment_grants.reviewer_binding_id<>excluded.reviewer_binding_id
                       OR automation_assignment_grants.directory_id<>excluded.directory_id
                       OR automation_assignment_grants.directory_path<>excluded.directory_path''',
                    (binding_id, reviewer_binding_id, project_id, directory_id, directory['path'], now_utc()))
            else:
                db.execute('DELETE FROM automation_assignment_grants WHERE binding_id=? AND project_id=?',
                           (binding_id, project_id))
        return {'binding_id': binding_id, 'reviewer_binding_id': reviewer_binding_id,
                'directory_id': directory_id, 'enabled': enabled}


def trusted_context(payload):
    """Project and app come from the authenticated producer stamp, not the card button."""
    if not isinstance(payload, dict):
        return None
    project_id, app_id = payload.get('project_id'), payload.get('app_id')
    if not isinstance(project_id, str) or not project_id or not isinstance(app_id, str) or not app_id:
        return None
    return {'project_id': project_id, 'app_id': app_id}


def actor_authorized(store, project_id, actor_id, *, app_id, device):
    """An open_id decides only with an active binding for this project, app, and device generation."""
    if (not isinstance(project_id, str) or not project_id or not isinstance(actor_id, str) or not actor_id
            or not isinstance(app_id, str) or not app_id or not isinstance(device, dict)):
        return False
    origin, device_id, generation = device.get('hub_origin'), device.get('device_id'), device.get('generation')
    if (not isinstance(origin, str) or not origin or not isinstance(device_id, str) or not device_id
            or type(generation) is not int or generation < 1):
        return False
    with store.connection() as db:
        row = db.execute('''SELECT 1 FROM automation_identity_bindings b
            JOIN automation_identity_candidates c ON c.id=b.candidate_id
            JOIN automation_identity_challenges h ON h.id=b.challenge_id
            WHERE b.project_id=? AND b.state='active' AND c.open_id=? AND c.app_id=?
            AND h.project_id=? AND h.app_id=? AND h.hub_origin=? AND h.device_id=? AND h.generation=?''',
            (project_id, actor_id, app_id, project_id, app_id, origin, device_id, generation)).fetchone()
    return row is not None


def decision_authorized(store, actor_id, *, task_id=None, flow_id=None, trusted, device):
    """The task or flow project must be the trusted message project. A named task cannot cross projects."""
    if (task_id is None) == (flow_id is None) or not isinstance(trusted, dict):
        return False
    project_id, app_id = trusted.get('project_id'), trusted.get('app_id')
    row_id = task_id if task_id is not None else flow_id
    sql = ('SELECT project_id FROM task_items WHERE id=?' if task_id is not None
           else 'SELECT project_id FROM automation_flows WHERE id=?')
    if not isinstance(row_id, str) or not row_id or not isinstance(project_id, str) or not project_id:
        return False
    with store.connection() as db:
        row = db.execute(sql, (row_id,)).fetchone()
    if row is None or row['project_id'] != project_id or not actor_authorized(
            store, project_id, actor_id, app_id=app_id, device=device):
        return False
    named_task = task_id if task_id is not None else None
    if named_task is None:
        with store.connection() as db:
            flow = db.execute('SELECT task_id FROM automation_flows WHERE id=?', (flow_id,)).fetchone()
        named_task = flow['task_id'] if flow else None
    if not isinstance(named_task, str) or not named_task:
        return False
    with store.connection() as db:
        designated = db.execute(
            'SELECT 1 FROM automation_task_acceptors WHERE task_id=? AND open_id=? AND app_id=?',
            (named_task, actor_id, app_id)).fetchone()
    return designated is not None
