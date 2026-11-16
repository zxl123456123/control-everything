"""Record the local owner's fixed integration intent without executing it."""
import ntpath
import re
from urllib.parse import urlsplit

from control_everything.input_validation import ProfileError
from control_everything.workspace.automation_flow import AutomationQueue, reviewer_may_integrate
from control_everything.workspace.automation_delivery_reviews import _evidence
from control_everything.workspace.native_progress import body_fields, check_versions, digest, fail, packed, row_view, task_access
from control_everything.workspace.store import now_utc


def _text(value):
    if not isinstance(value, str) or not value or len(value) > 4096 or any(ord(c) < 32 for c in value):
        raise ProfileError('invalid_integration_target')
    return value


def _path(value):
    value = _text(value)
    drive_absolute = re.match(r'^[A-Za-z]:[\\/]', value)
    posix_absolute = value.startswith('/') and not value.startswith('//') and '\\' not in value
    if not drive_absolute and not posix_absolute:
        raise ProfileError('invalid_integration_target')
    return ntpath.normcase(ntpath.normpath(value))


def _relative(value):
    value = _text(value)
    if ntpath.splitdrive(value)[0] or value.startswith('/') or '\\' in value or any(p in ('','.','..','.git') or ':' in p or p.endswith((' ','.')) for p in value.casefold().split('/')):
        raise ProfileError('invalid_integration_target')
    return value


def _target(target, verify):
    body_fields(target, ('branch','repository_path','target_worktree_path','candidate_worktree_path','expected_base',
                         'remote_name','remote_url','files','script_arg_map','commit_message'))
    if target['branch'] != 'develop' or not re.fullmatch(r'(?:[0-9a-f]{40}|[0-9a-f]{64})',_text(target['expected_base'])):
        raise ProfileError('invalid_integration_target')
    roots = [_path(target[k]) for k in ('repository_path','target_worktree_path','candidate_worktree_path')]
    source = _path(verify['request']['scope']['cwd'])
    candidate = roots[2]
    for other in (source,roots[1]):
        if candidate == other or candidate.startswith(other.rstrip('\\/')+'\\') or other.startswith(candidate.rstrip('\\/')+'\\'):
            raise ProfileError('invalid_integration_target')
    if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]*',_text(target['remote_name'])):
        raise ProfileError('invalid_integration_target')
    remote = _text(target['remote_url'])
    if remote.startswith('https://'):
        try:
            parsed = urlsplit(remote)
            valid = parsed.hostname and parsed.username is None and parsed.password is None
        except ValueError:
            valid = False
        if not valid or '?' in remote or '#' in remote:
            raise ProfileError('invalid_integration_target')
    else:
        _path(remote)
    if not re.fullmatch(r'[a-z]+(?:\([^\r\n)]+\))?!?: .+',_text(target['commit_message'])):
        raise ProfileError('invalid_integration_target')
    files = target['files']
    if not isinstance(files,list) or not files:
        raise ProfileError('invalid_integration_target')
    paths = []
    for pair in files:
        body_fields(pair,('source_path','target_path'))
        path = _relative(pair['source_path'])
        if _relative(pair['target_path']) != path:
            raise ProfileError('invalid_integration_target')
        paths.append(path)
    spec = verify['request']['verification']
    if len({p.casefold() for p in paths}) != len(paths) or set(paths) != set(spec['source_files']):
        raise ProfileError('invalid_integration_target')
    mapping = target['script_arg_map']
    if not isinstance(mapping,list) or len(mapping) != 1:
        raise ProfileError('invalid_integration_target')
    entry = mapping[0]
    body_fields(entry,('index','source_path'))
    index = entry['index']
    if (type(index) is not int or not 0 < index < len(spec['argv']) or entry['source_path'] not in paths
            or _path(spec['argv'][index]) != _path(ntpath.join(source,entry['source_path']))):
        raise ProfileError('invalid_integration_target')
    return target


def register_target(service, task_id, body):
    body_fields(body,('flow_id','expected_flow_revision','expected_revision','progress_revision','delivery_id','review_id','client_token','confirmed','target'))
    if body['confirmed'] is not True or any(type(body[k]) is not int or body[k] < 0 for k in ('expected_flow_revision','expected_revision','progress_revision')):
        raise ProfileError('invalid_integration_target')
    for key in ('flow_id','delivery_id','review_id','client_token'):
        _text(body[key])
    request_hash = digest({'task_id':task_id,'body':body})
    with service.store.connection() as connection:
        connection.execute('BEGIN IMMEDIATE')
        item = task_access(connection,task_id,writable=True)
        view = AutomationQueue._view(connection,body['flow_id'])
        flow, verify = view['flow'],view['step']
        if not flow or flow['task_id'] != task_id or flow['project_id'] != item['project_id']:
            fail('automation_step_changed')
        previous = flow['attention'].get('integration_target')
        if previous:
            if previous['client_token'] != body['client_token'] or previous['request_hash'] != request_hash:
                fail('item_changed')
            return {'flow':flow,'integration_target':previous,'recorded':True,'replayed':True}
        check_versions(item,body)
        delivery = row_view(connection.execute('SELECT * FROM task_deliveries WHERE id=? AND task_id=?',(body['delivery_id'],task_id)).fetchone())
        review = row_view(connection.execute('SELECT * FROM task_reviews WHERE id=? AND task_id=?',(body['review_id'],task_id)).fetchone())
        attention = flow['attention']
        if (flow['revision'] != body['expected_flow_revision'] or flow['status'] != 'waiting_external' or flow['phase'] != 'integration'
                or attention.get('reason') != 'integration_not_connected' or not delivery or not review
                or item['current_delivery_id'] != delivery['id'] or item['accepted_delivery_id'] != delivery['id']
                or review['delivery_id'] != delivery['id'] or review['verdict'] != 'approved'
                or not reviewer_may_integrate(connection, task_id, review['reviewer'])
                or attention.get('accepted_review_id') != review['id'] or attention.get('accepted_delivery_id') != delivery['id']
                or attention.get('expected_revision') != item['revision'] or attention.get('progress_revision') != item['progress_revision']
                or delivery['source'] != 'automation_verify' or not verify or verify['kind'] != 'verify' or verify['status'] != 'completed'
                or delivery['source_key'] != verify['id'] or delivery['material'].get('verify_step_id') != verify['id']
                or delivery['material'].get('flow_id') != flow['id']):
            fail('automation_step_changed')
        _evidence(connection,item,flow,verify,delivery['material'])
        target = _target(body['target'],verify)
        snapshot = {'client_token':body['client_token'],'request_hash':request_hash,'actor':'local_owner','recorded_at':now_utc(),
            'target':target,'delivery_id':delivery['id'],'review_id':review['id'],'verify_step_id':verify['id'],
            'verify_hash':digest(verify['result']),'source_root':verify['request']['scope']['cwd'],
            'verification':verify['request']['verification'],'source_hash':verify['result']['receipt']['source_before'],
            'accepted_control_revision':item['revision'],'accepted_progress_revision':item['progress_revision'],
            'accepted_flow_revision':flow['revision']}
        connection.execute('UPDATE automation_flows SET attention_json=?,revision=revision+1,updated_at=? WHERE id=?',
            (packed({**attention,'integration_target':snapshot}),now_utc(),flow['id']))
        return {'flow':AutomationQueue._view(connection,flow['id'])['flow'],'integration_target':snapshot,'recorded':True,'replayed':False}
