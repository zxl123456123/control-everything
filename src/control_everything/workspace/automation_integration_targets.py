"""Record the local owner's fixed integration intent without executing it."""
import json
import ntpath
import re
from pathlib import Path
from subprocess import SubprocessError

from control_everything.input_validation import ProfileError
from control_everything.workspace.native_progress import body_fields, digest


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


def is_github_https_remote(value):
    return bool(re.fullmatch(r'https://github\.com/[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+\.git', value))


def _remote(value):
    value = _text(value)
    if not is_github_https_remote(value):
        _path(value)
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
    _remote(target['remote_url'])
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


def validate_project_target(target):
    body_fields(target, ('repository_path', 'target_worktree_path', 'candidate_worktree_path', 'remote_name', 'remote_url'))
    remote = _remote(target['remote_url'])
    if not is_github_https_remote(remote) and not Path(remote).is_absolute():
        raise ProfileError('invalid_integration_target')
    for key in ('repository_path', 'target_worktree_path', 'candidate_worktree_path'):
        _path(target[key])
        if not Path(target[key]).is_absolute():
            raise ProfileError('invalid_integration_target')
    if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]*', _text(target['remote_name'])):
        raise ProfileError('invalid_integration_target')


def project_target(connection, flow, verify):
    directory = flow['context']['input']['directory']
    saved = connection.execute(
        'SELECT spec_json FROM automation_project_verification WHERE project_id=? AND binding_id=? AND directory_path=?',
        (flow['project_id'], directory['binding_id'], directory['path'])).fetchone()
    if saved:
        spec = json.loads(saved['spec_json'])
        configured = spec.pop('integration', None)
        if spec == verify['request']['verification']:
            return configured
    return None


def prepare_offer(service, configured, flow, verify):
    preflight = getattr(service, 'integration_preflight', None)
    if not configured or preflight is None:
        return None
    source = verify['request']['scope']['cwd']
    spec = verify['request']['verification']
    try:
        files = [{'source_path': _relative(name), 'target_path': name} for name in spec['source_files']]
        paths = {_path(ntpath.join(source, name)): name for name in spec['source_files']}
        mapping = [{'index': i, 'source_path': paths[_path(arg)]}
                   for i, arg in enumerate(spec['argv'][1:], 1)
                   if Path(arg).is_absolute() and _path(arg) in paths]
        if len(mapping) != 1:
            return None
        target = {**configured['target'], 'branch': 'develop', 'files': files, 'script_arg_map': mapping,
                  'commit_message': 'feat: integrate verified automation delivery'}
        target['expected_base'] = preflight(source, target)
        _target(target, verify)
    except (OSError, ValueError, SubprocessError, ProfileError):
        return None
    offer = {'config': configured, 'target': target, 'flow_id': flow['id'], 'flow_revision': flow['revision'],
             'delivery_id': flow['attention']['delivery_id'], 'verify_hash': digest(verify['result'])}
    return {**offer, 'decision_id': 'integrate-' + digest(offer)}
