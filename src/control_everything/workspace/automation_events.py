"""Durable intake for explicit local-owner automation requests; never starts an agent."""

import hashlib
import json
import math
import os
from pathlib import Path
import re
from uuid import uuid4

from control_everything.input_validation import ProfileError
from control_everything.workspace import dispatch, task_messages
from control_everything.workspace.automation_integration_targets import validate_project_target
from control_everything.workspace.automation_identities import confirmed_identity, decision_authorized, trusted_context
from control_everything.workspace.native_progress import body_fields, check_versions, digest, packed, task_access
from control_everything.workspace.store import WorkspaceError, now_utc


def event_view(row):
    event = dict(row)
    event['payload'] = json.loads(event.pop('payload_json'))
    return event


ASSIGNMENT = '请做这个任务'


def apply_feishu_assignments(store, binding):
    """Apply stored assignments. A stored row is not permission to choose a directory."""
    if any(not binding.get(key) for key in ('hub_origin', 'device_id', 'generation')):
        return []
    with store.connection() as db:
        rows = db.execute('''SELECT source,event_id,received_at,payload_json FROM automation_remote_inbox
            WHERE hub_origin=? AND device_id=? AND generation=? AND ack_state IN ('pending','acknowledged')
            ORDER BY received_at,message_id''',
            (binding['hub_origin'], binding['device_id'], binding['generation'])).fetchall()
    applied = []
    for row in rows:
        try:
            payload = json.loads(row['payload_json'])
        except (TypeError, ValueError):
            continue
        assignment = payload.get('assignment') if type(payload) is dict else None
        if type(payload) is not dict or type(assignment) is not dict:
            continue
        if payload.get('kind') == 'feishu_new_task':
            try:
                result = _accept_new_feishu_task(store, binding, row, payload)
            except (ProfileError, WorkspaceError, UnicodeError):
                continue
            if result is not None:
                applied.append(result)
            continue
        if (payload.get('kind') != 'feishu_assignment' or assignment.get('text') != ASSIGNMENT
                or not isinstance(payload.get('actor_open_id'), str)):
            continue
        if not decision_authorized(store, payload['actor_open_id'], task_id=assignment.get('task_id'),
                                   trusted=trusted_context(payload), device=binding):
            continue
        try:
            result = accept_feishu_assignment(store, assignment.get('task_id'), {
                'source': 'human', 'quoted': False, 'actor_id': payload['actor_open_id'],
                'event_id': row['event_id'], 'text': ASSIGNMENT})
        except ProfileError:
            continue
        if result['action'] == 'execute':
            applied.append(result)
    return applied


def _project_verification(connection, project_id, directory):
    saved = connection.execute(
        'SELECT spec_json FROM automation_project_verification WHERE project_id=? AND binding_id=? AND directory_path=?',
        (project_id, directory['binding_id'], directory['path'])).fetchone()
    if not saved:
        return None
    spec = json.loads(saved['spec_json'])
    spec.pop('integration', None)
    return spec


def _accept_new_feishu_task(store, device, inbox, payload):
    assignment = payload['assignment']
    context_fields = ('app_id', 'producer_id', 'channel_account_id', 'chat_id')
    if (set(assignment) != {'namespace', 'text'}
            or assignment['namespace'] != 'control-everything.automation.v1'
            or not all(type(payload.get(key)) is str and payload[key]
                       for key in (*context_fields, 'actor_open_id', 'project_id', 'message_id'))):
        return None
    text = task_messages._text(assignment['text'], 'assignment', 4000, required=True).strip()
    account_app = json.dumps([payload['channel_account_id'], payload['app_id']], ensure_ascii=True, separators=(',', ':'))
    if inbox['source'] != 'feishu:' + hashlib.sha256(account_app.encode('utf-8')).hexdigest():
        return None
    actor, project = payload['actor_open_id'], payload['project_id']
    origin = 'feishu-new:' + digest([device['hub_origin'], inbox['source']])
    event_id = inbox['event_id']
    request_hash = digest(payload)
    with store.connection() as connection:
        connection.execute('BEGIN IMMEDIATE')
        existing = connection.execute('SELECT * FROM automation_events WHERE source_instance=? AND source_event_id=?',
                                      (origin, event_id)).fetchone()
        if existing is not None:
            if existing['request_hash'] != request_hash:
                raise ProfileError('automation_event_conflict', status=409)
            return {'action': 'execute', 'event': event_view(existing), 'replayed': True}
        grants = connection.execute('''SELECT g.* FROM automation_assignment_grants g
            JOIN projects p ON p.id=g.project_id JOIN automation_identity_bindings b ON b.id=g.binding_id
            JOIN automation_identity_candidates c ON c.id=b.candidate_id
            WHERE g.project_id=? AND p.archived=0 AND c.open_id=? AND c.app_id=? AND g.set_at<=?''',
            (project, actor, payload['app_id'], inbox['received_at'])).fetchall()
        expected_context = tuple(payload[key] for key in context_fields)
        choices = []
        for grant in grants:
            initiator = confirmed_identity(connection, project, grant['binding_id'], device)
            reviewer = confirmed_identity(connection, project, grant['reviewer_binding_id'], device)
            if (initiator and reviewer and tuple(initiator)[1:] == tuple(reviewer)[1:] == expected_context):
                choices.append((grant, reviewer))
        if len(choices) != 1:
            return None
        grant, reviewer = choices[0]
        directory = dispatch._directory(connection, project, grant['directory_id'])
        if directory['path'] != grant['directory_path']:
            return None
        stamp = now_utc()
        item = store._create_item(connection, {
            'title': text.splitlines()[0], 'project_id': project, 'provider_id': None,
            'state': 'todo', 'session_key': None
        }, source='feishu', created_at=stamp, updated_at=stamp)
        task_id = item['id']
        connection.execute('''INSERT INTO task_briefs
            (task_id,request_text,acceptance_text,constraints_text,references_json,execution_directory_id,revision,updated_at)
            VALUES(?,?,?,?,?,?,1,?)''', (task_id, text, '', '', '[]', directory['binding_id'], stamp))
        connection.execute('INSERT INTO automation_task_acceptors(task_id,app_id,open_id,set_at) VALUES(?,?,?,?)',
                           (task_id, reviewer['app_id'], reviewer['open_id'], stamp))
        request = {'agent': 'codex', 'worktree_id': directory['binding_id']}
        verification = _project_verification(connection, project, directory)
        if verification is not None:
            request['verification'] = verification
        queued = {'request': request, 'title': item['title'], 'brief': dispatch._brief(connection, task_id),
                  'directory': directory, 'assignment_text': text}
        identity = str(uuid4())
        connection.execute('''INSERT INTO automation_events
            (id,source_instance,source_event_id,task_id,project_id,actor_id,authorization,
             requirement_revision,brief_revision,request_hash,payload_json,received_at)
            VALUES(?,?,?,?,?,?,'explicit_assignment',?,?,?,?,?)''',
            (identity, origin, event_id, task_id, project, actor, item['revision'], 1, request_hash, packed(queued), stamp))
        return {'action': 'execute', 'event': event_view(connection.execute(
            'SELECT * FROM automation_events WHERE id=?', (identity,)).fetchone()), 'replayed': False}


def accept_feishu_assignment(store, task_id, message):
    """An explicit human assignment enters the queue. It cannot choose the command or directory."""
    if (not isinstance(message, dict) or message.get('source') != 'human' or message.get('quoted') is True
            or any(key in message for key in ('argv', 'cwd', 'agent', 'worktree_id', 'verification'))):
        return {'action': 'reject', 'reason': 'not_an_assignment'}
    text, actor, event_id = message.get('text'), message.get('actor_id'), message.get('event_id')
    if (text != ASSIGNMENT or not isinstance(actor, str) or not actor or not isinstance(event_id, str)
            or not event_id or len(event_id) > 256):
        return {'action': 'reject', 'reason': 'not_an_assignment'}
    with store.connection() as connection:
        connection.execute('BEGIN IMMEDIATE')
        existing = connection.execute("SELECT * FROM automation_events WHERE source_instance='feishu' AND source_event_id=?",
                                      (event_id,)).fetchone()
        item = task_access(connection, task_id, writable=True)
        brief = dispatch._brief(connection, task_id)
        if not brief['request_text'].strip():
            brief['request_text'] = item['title']
        if not brief['request_text'].strip() or item['revision'] < 1:
            raise ProfileError('brief_required', status=409)
        if connection.execute("SELECT 1 FROM automation_flows WHERE task_id=? AND status NOT IN ('completed','failed','cancelled')",
                              (task_id,)).fetchone():
            return {'action': 'reject', 'reason': 'task_already_active'}
        directory = dispatch._directory(connection, item['project_id'], brief['execution_directory_id'])
        payload = {'request': {'agent': 'codex', 'worktree_id': directory['binding_id']}, 'title': item['title'],
                   'brief': brief, 'directory': directory, 'assignment_text': text}
        if existing:
            verification = event_view(existing)['payload']['request'].get('verification')
        else:
            verification = _project_verification(connection, item['project_id'], directory)
        if verification is not None:
            payload['request']['verification'] = verification
        request_hash = digest({'task_id': task_id, 'event_id': event_id, 'actor_id': actor, 'payload': payload})
        if existing is not None:
            if existing['request_hash'] != request_hash or existing['task_id'] != task_id:
                raise ProfileError('automation_event_conflict', status=409)
            return {'action': 'execute', 'event': event_view(existing), 'replayed': True}
        identity = str(uuid4())
        connection.execute(
            'INSERT INTO automation_events(id,source_instance,source_event_id,task_id,project_id,actor_id,'
            'authorization,requirement_revision,brief_revision,request_hash,payload_json,received_at) '
            'VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
            (identity, 'feishu', event_id, task_id, item['project_id'], actor, 'explicit_assignment',
             item['revision'], brief['revision'], request_hash, packed(payload), now_utc()))
        return {'action': 'execute', 'event': event_view(connection.execute(
            'SELECT * FROM automation_events WHERE id=?', (identity,)).fetchone()), 'replayed': False}


def _validate_verification(spec):
    if type(spec) is not dict or set(spec) != {'argv', 'source_files', 'timeout'}:
        raise ProfileError('invalid_progress_request', 'verification')
    argv, sources, timeout = spec['argv'], spec['source_files'], spec['timeout']
    if (type(argv) is not list or not argv or any(type(arg) is not str or not arg.strip() or '\0' in arg for arg in argv)
            or not Path(argv[0]).is_absolute() or type(sources) is not list or not sources
            or any(type(name) is not str or not name.strip() or '\0' in name or Path(name).anchor
                   or not Path(name).parts or '..' in Path(name).parts for name in sources)
            or len({os.path.normcase(str(Path(name))) for name in sources}) != len(sources)
            or type(timeout) not in (int, float) or not 0 < timeout <= 20 or not math.isfinite(timeout)):
        raise ProfileError('invalid_progress_request', 'verification')


def set_project_verification(store, project_id, body):
    """The local owner authorizes a verifier for one registered directory."""
    body_fields(body, ('directory_id', 'verification'), ('integration', 'confirmed'))
    task_messages._text(body['directory_id'], 'directory_id', 256, required=True)
    spec = body['verification']
    if spec is not None:
        _validate_verification(spec)
    target = body.get('integration')
    if 'integration' in body and body.get('confirmed') is not True:
        raise ProfileError('invalid_integration_target')
    if target is not None:
        if spec is None:
            raise ProfileError('invalid_integration_target')
        validate_project_target(target)
    with store.connection() as connection:
        connection.execute('BEGIN IMMEDIATE')
        project = connection.execute('SELECT archived FROM projects WHERE id=?', (project_id,)).fetchone()
        if not project or project['archived']:
            raise ProfileError('project_unavailable', status=409)
        directory = dispatch._directory(connection, project_id, body['directory_id'])
        key = (project_id, directory['binding_id'])
        if spec is None:
            connection.execute('DELETE FROM automation_project_verification WHERE project_id=? AND binding_id=?', key)
        else:
            saved = connection.execute(
                'SELECT spec_json FROM automation_project_verification WHERE project_id=? AND binding_id=? AND directory_path=?',
                (*key, directory['path'])).fetchone()
            previous = json.loads(saved['spec_json']) if saved else {}
            configured = previous.pop('integration', None)
            if 'integration' not in body and configured and previous == spec:
                target = configured['target']
            if target is not None:
                generation = (configured['generation'] if configured and configured['target'] == target and previous == spec
                              else uuid4().hex)
                spec = {**spec, 'integration': {'generation': generation, 'target': target}}
            connection.execute('INSERT INTO automation_project_verification VALUES(?,?,?,?) '
                'ON CONFLICT(project_id,binding_id) DO UPDATE SET directory_path=excluded.directory_path, '
                'spec_json=excluded.spec_json', (*key, directory['path'], packed(spec)))
    return {'project_id': project_id, 'directory_id': body['directory_id'], 'configured': spec is not None}


def enable_local(store, task_id, body):
    """The HTTP caller must establish local control; source/actor are never body fields."""
    body_fields(body, ('expected_revision', 'brief_revision', 'client_token', 'agent', 'worktree_id'), ('verification',))
    if 'verification' in body:
        _validate_verification(body['verification'])
    if type(body['agent']) is not str or not re.fullmatch(r'[a-z][a-z0-9-]{0,31}', body['agent']):
        raise ProfileError('invalid_progress_request', 'agent')
    task_messages._text(body['worktree_id'], 'worktree_id', 256, required=True)
    body = dict(body)
    request_hash = digest({'task_id': task_id, **body})
    with store.connection() as connection:
        connection.execute('BEGIN IMMEDIATE')
        existing = connection.execute("SELECT * FROM automation_events WHERE source_instance='local' AND source_event_id=?",
                                      (body['client_token'],)).fetchone()
        if existing is not None:
            if existing['request_hash'] != request_hash:
                raise ProfileError('automation_event_conflict', status=409)
            return event_view(existing)
        item = task_access(connection, task_id, writable=True)
        check_versions(item, body)
        if item['state'] in ('review', 'done'):
            raise ProfileError('session_conflict', status=409)
        brief = dispatch._brief(connection, task_id)
        if brief['revision'] != body['brief_revision']:
            raise ProfileError('brief_changed', status=409)
        if brief['revision'] == 0 and connection.execute('SELECT 1 FROM task_briefs WHERE task_id=?', (task_id,)).fetchone() is None:
            brief['request_text'] = item['title']
        if not brief['request_text'].strip():
            raise ProfileError('brief_required', status=409)
        directory = dispatch._directory(connection, item['project_id'], brief['execution_directory_id'])
        payload = {'request': body, 'title': item['title'], 'brief': brief, 'directory': directory}
        identity = str(uuid4())
        connection.execute(
            'INSERT INTO automation_events(id,source_instance,source_event_id,task_id,project_id,actor_id,'
            'authorization,requirement_revision,brief_revision,request_hash,payload_json,received_at) '
            'VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
            (identity, 'local', body['client_token'], task_id, item['project_id'], 'local-owner', 'auto_enabled',
             item['revision'], brief['revision'], request_hash, packed(payload), now_utc()))
        return event_view(connection.execute('SELECT * FROM automation_events WHERE id=?', (identity,)).fetchone())
