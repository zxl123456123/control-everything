"""Local identity HTTP parsing; trusted network context is fetched before SQLite writes."""
import re

from control_everything.http.workbench_remote import local_control_allowed
from control_everything.integrations.remote_connector import ConnectorError
from control_everything.input_validation import ProfileError
from control_everything.workspace.store import WorkspaceError
from control_everything.workspace.validation import project_id_valid

ROUTE = re.compile(r'/api/workspace/projects/([^/]+)/automation-identities(?:/(contexts|challenges|confirm|revoke))?\Z')


def handle(handler, path, *, write=False):
    match = ROUTE.fullmatch(path.path)
    if not match:
        return False
    if not local_control_allowed(handler, write=write):
        handler.reject(403, 'local_control_required')
        return True
    workspace = handler.server.workspace
    connector = getattr(handler.server, 'remote_connector', None)
    if workspace is None or handler.profile() is None or connector is None:
        handler.reject(503, 'workspace_unavailable')
        return True
    project_id, action = match.groups()
    if write == (action in (None, 'contexts')):
        handler.reject(405, 'method_not_allowed')
        return True
    try:
        if '?' in handler.path or not project_id_valid(project_id):
            raise ValueError('invalid_request')
        body = {}
        if write:
            # Keep body-budget exceptions outside the ValueError handler below.
            body = handler.read_json_body(max_bytes=16384, strict=True)
    except ValueError as error:
        if str(error) == 'body_too_large':
            raise
        handler.reject(400, 'invalid_request')
        return True
    try:
        if getattr(getattr(handler.server, 'desktop', None), 'configuration_changed', False):
            raise ConnectorError('remote_restart_required', 409)
        service = workspace.identity_service(connector.current_binding)
        if action == 'contexts':
            result = {'contexts':[context for context in connector.list_identity_contexts() if context['project_id'] == project_id]}
        elif not write:
            result = {'identities':service.list(project_id)}
        else:
            key = {'challenges':'producer_id','confirm':'candidate_id','revoke':'binding_id'}[action]
            if (type(body) is not dict or set(body) != {key} or type(body[key]) is not str or not body[key]
                    or len(body[key]) > 256 or (action != 'challenges' and not re.fullmatch('[0-9a-f]{32}',body[key]))):
                raise ValueError('invalid_request')
            if action == 'challenges':
                context = connector.identity_context(body[key],project_id)
                result = service.create_challenge(project_id,context)
            elif action == 'confirm':
                result = service.confirm(project_id,body[key])
            else:
                result = service.revoke(project_id,body[key])
        handler.reply(201 if action == 'challenges' else 200,result)
    except ConnectorError as error:
        handler.reject(error.status or 503,error.code)
    except (ProfileError,WorkspaceError) as error:
        handler.profile_error(error)
    except (ValueError,TypeError,UnicodeError):
        handler.reject(400,'invalid_request')
    return True
