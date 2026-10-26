"""Project-progress HTTP parsing and local execution authority."""

import re

from control_everything.http.workbench_remote import local_control_allowed
from control_everything.input_validation import ProfileError
from control_everything.sessions.source import canonical_uuid
from control_everything.workspace.store import WorkspaceError

ROUTE = re.compile(r'/api/workspace/tasks/([^/]+)/(progress|native-start|native-resume|native-release|native-adopt|native-feedback|delivery-review|native-messages/([^/]+)/send)\Z')


def handle(handler, path, *, write=False):
    match = ROUTE.fullmatch(path.path)
    if not match:
        return False
    workspace = handler.server.workspace
    if workspace is None or handler.profile() is None:
        handler.reject(503, 'workspace_unavailable')
        return True
    action = match[2]
    if write and not local_control_allowed(handler, write=True):
        handler.reject(403, 'local_control_required')
        return True
    if write == (action == 'progress'):
        handler.reject(405, 'method_not_allowed')
        return True
    try:
        if path.query:
            raise ValueError('invalid_query')
        task_id = canonical_uuid(match[1])
        service = workspace.native_progress
        if not write:
            result = service.get(task_id, execution_allowed=local_control_allowed(handler))
        else:
            body = handler.read_json_body(max_bytes=65536, strict=True)
            if action == 'native-start':
                result = service.start(task_id, body)
            elif action == 'native-resume':
                result = service.resume(task_id, body)
            elif action == 'native-release':
                result = service.release(task_id, body)
            elif action == 'native-adopt':
                result = service.adopt(task_id, body)
            elif action == 'native-feedback':
                result = service.save_feedback(task_id, body)
            elif action == 'delivery-review':
                result = service.review_delivery(task_id, body)
            else:
                if body != {}:
                    raise ValueError('invalid_body')
                result = service.send_feedback(task_id, canonical_uuid(match[3]))
        pending = action == 'native-start' and (result.get('native_run') or {}).get('launch_state') in ('reserved', 'unknown')
        handler.reply(202 if pending else 200, result)
    except (ProfileError, WorkspaceError) as error:
        handler.profile_error(error)
    except (ValueError, TypeError, UnicodeError):
        handler.reject(400, 'invalid_request')
    return True
