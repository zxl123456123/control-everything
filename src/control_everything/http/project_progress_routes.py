"""Project-progress HTTP parsing and local execution authority."""

import re

from control_everything.http.workbench_remote import local_control_allowed
from control_everything.input_validation import ProfileError
from control_everything.integrations.remote_connector import ConnectorError
from control_everything.sessions.source import canonical_uuid
from control_everything.workspace.store import WorkspaceError
from control_everything.workspace.validation import project_id_valid

ROUTE = re.compile(r'/api/workspace/tasks/([^/]+)/(progress|automation-integration-target|automation-integration-card|automation-enable|automation-resume|native-start|native-resume|native-release|native-adopt|native-feedback|delivery-review|native-messages/([^/]+)/send)\Z')
VERIFICATION_ROUTE = re.compile(r'/api/workspace/projects/([^/]+)/automation-verification\Z')


def handle(handler, path, *, write=False):
    match = ROUTE.fullmatch(path.path)
    verification = VERIFICATION_ROUTE.fullmatch(path.path)
    if not match and not verification:
        return False
    workspace = handler.server.workspace
    if workspace is None or handler.profile() is None:
        handler.reject(503, 'workspace_unavailable')
        return True
    action = match[2] if match else 'automation-verification'
    if write and not local_control_allowed(handler, write=True):
        handler.reject(403, 'local_control_required')
        return True
    if write == (action == 'progress'):
        handler.reject(405, 'method_not_allowed')
        return True
    try:
        if path.query:
            raise ValueError('invalid_query')
        if verification:
            project_id = verification[1]
            if not project_id_valid(project_id):
                raise ValueError('invalid_request')
            body = handler.read_json_body(max_bytes=16384, strict=True)
            handler.reply(200, workspace.set_project_automation_verification(project_id, body))
            return True
        task_id = canonical_uuid(match[1])
        service = workspace.native_progress
        if not write:
            result = service.get(task_id, execution_allowed=local_control_allowed(handler))
        else:
            body = handler.read_json_body(max_bytes=65536, strict=True)
            if action == 'automation-enable':
                result = workspace.enable_task_automation(task_id, body)
            elif action == 'automation-integration-target':
                result = workspace.register_task_integration_target(task_id, body)
            elif action == 'automation-integration-card':
                connector = getattr(handler.server, 'remote_connector', None)
                if connector is None:
                    raise ConnectorError('remote_not_configured', 409)
                project_id, card = workspace.prepare_task_integration_card(task_id, body)
                contexts = connector.list_identity_contexts()
                if len(contexts) != 1 or contexts[0]['project_id'] != project_id:
                    raise ConnectorError('remote_identity_context_unavailable', 409)
                result = connector.publish_waiting_card(card)
                if result is None:
                    raise ConnectorError('remote_not_configured', 409)
            elif action == 'automation-resume':
                result = workspace.resume_task_automation(task_id, body)
            elif action == 'native-start':
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
                result = workspace.review_task_delivery(task_id, body)
            else:
                if body != {}:
                    raise ValueError('invalid_body')
                result = service.send_feedback(task_id, canonical_uuid(match[3]))
        pending = action in ('automation-enable','automation-resume') or action == 'native-start' and (result.get('native_run') or {}).get('launch_state') in ('reserved', 'unknown')
        handler.reply(202 if pending else 200, result)
    except (ProfileError, WorkspaceError) as error:
        handler.profile_error(error)
    except ConnectorError as error:
        handler.reject(error.status or 503, error.code)
    except (ValueError, TypeError, UnicodeError):
        handler.reject(400, 'invalid_request')
    return True
