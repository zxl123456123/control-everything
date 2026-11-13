"""Durable intake for explicit local-owner automation requests; never starts an agent."""

import json
import math
import os
from pathlib import Path
import re
from uuid import uuid4

from control_everything.input_validation import ProfileError
from control_everything.workspace import dispatch, task_messages
from control_everything.workspace.native_progress import body_fields, check_versions, digest, packed, task_access
from control_everything.workspace.store import now_utc


def event_view(row):
    event = dict(row)
    event['payload'] = json.loads(event.pop('payload_json'))
    return event


def enable_local(store, task_id, body):
    """The HTTP caller must establish local control; source/actor are never body fields."""
    body_fields(body, ('expected_revision', 'brief_revision', 'client_token', 'agent', 'worktree_id'), ('verification',))
    if 'verification' in body:
        spec = body['verification']
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
