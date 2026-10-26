"""Fixed owner calls for project progress; no arbitrary browser-selected RPC."""

from pathlib import Path
import uuid

from control_everything.integrations.workbench_runtime import WorkbenchUnavailable, read_json, safe_path


class WorkbenchProgressAdapter:
    def __init__(self, runtime):
        self.runtime = runtime

    @property
    def available(self):
        return self.runtime.ready

    def prepare_scope(self, directory, worktree_id):
        path = safe_path(directory)
        roots = tuple(safe_path(root) for root in self.runtime.config.allowed_workspace_roots)
        if not path.is_dir() or not any(path == root or path.is_relative_to(root) for root in roots):
            raise WorkbenchUnavailable('project_directory_not_allowed')
        repos = self.runtime._rpc('repo.list', {})['repos']
        matches = [row for row in repos if row.get('path') and Path(row['path']).resolve() == path]
        if len(matches) != 1:
            raise WorkbenchUnavailable('project_directory_mismatch')
        repo = matches[0]
        worktrees = self.runtime._rpc('worktree.list', {'repo': 'id:' + repo['id']})['worktrees']
        selected = [row for row in worktrees if row['id'] == worktree_id]
        if len(selected) != 1:
            raise WorkbenchUnavailable('project_directory_mismatch')
        installation = read_json(self.runtime.config.data_root / 'state/host-installation.json', 4096)['installationId']
        environment = str(uuid.uuid5(uuid.NAMESPACE_URL, 'control-everything:workbench:' + str(uuid.UUID(installation))))
        return {'runtimeId': self.runtime.status()['runtimeId'], 'environmentId': environment,
                'repoId': repo['id'], 'worktreeId': worktree_id, 'cwd': str(safe_path(selected[0]['path']))}

    def create(self, params):
        return self.runtime._rpc('platform.taskProgress.create', params, timeout=25)

    def resume(self, params):
        return self.runtime._rpc('platform.taskProgress.resume', params, timeout=25)

    def observe(self, binding, *, timeout=.75, cancel_event=None):
        return self.runtime._rpc('platform.taskProgress.observe', {'contractVersion': 1, 'expectedBinding': binding},
                                 timeout=min(.75, timeout), cancel_event=cancel_event)

    def discover_binding(self, query):
        return self.runtime._rpc('platform.taskProgress.observe', {'contractVersion': 1, 'bindingQuery': query}, timeout=.75)

    def send(self, params, request_id):
        return self.runtime._rpc('platform.taskProgress.send', params, timeout=25,
                                 orchestration_request_id=request_id)

    def read_receipt(self, request_id, params, binding, *, timeout=.75, cancel_event=None):
        return self.runtime._rpc('platform.taskProgress.receipt', {'contractVersion': 1, 'requestId': request_id,
                                 'expectedSendParams': params, 'expectedBinding': binding},
                                 timeout=min(.75, timeout), cancel_event=cancel_event)
