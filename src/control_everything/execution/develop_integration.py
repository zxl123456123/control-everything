"""Integrate one accepted byte set using a fixed Git develop operation."""
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import time

from control_everything.execution.owned_process import ExecutionOwner, query_old_job
from control_everything.execution.verification import _file_identity, read_verification_receipt
from control_everything.platform.windows_jobs import WindowsAPI
from control_everything.workspace.automation_integration_targets import is_github_https_remote


def _digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',', ':'),allow_nan=False).encode('utf-8')).hexdigest()


def _require(condition, reason):
    if not condition:
        raise ValueError(reason)


def _write_json(path, value):
    temporary = path.with_suffix('.tmp')
    with temporary.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    _require(not path.exists(), 'integration_evidence_exists')
    temporary.replace(path)


def _inside(root, name):
    path=root/name
    _require(path.resolve().is_relative_to(root), 'integration_path_outside_root')
    for part in (path, *path.parents):
        if part == root.parent:
            break
        _require(not part.is_symlink() and not part.is_junction(), 'integration_link_not_supported')
    return path


def _clean(root, expected, git_run, text):
    _require(text(root,'rev-parse','HEAD')==expected,'integration_head_changed')
    _require(not git_run(root,'status','--porcelain=v1','--untracked-files=all'), 'integration_worktree_dirty')
    _require(not git_run(root,'ls-files','--others','-z'), 'integration_untracked_files')
    _no_git_operation(root, text)


def _no_git_operation(root, text):
    for marker in ('MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer'):
        _require(not Path(text(root,'rev-parse','--path-format=absolute','--git-path',marker)).exists(),
                 'integration_unfinished_git_operation')


def _check_remote_urls(develop, target, git_run):
    for option in ((),('--push',)):
        urls = git_run(develop,'remote','get-url',*option,'--all',target['remote_name'],private_stdout=True)
        _require(urls.decode('utf-8').splitlines()==[target['remote_url']], 'integration_remote_url_changed')


def _github_options(url):
    return ['-c', 'core.askPass=', '-c', 'credential.interactive=false',
            '-c', f'http.{url}.followRedirects=false', '-c', f'http.{url}.sslVerify=true']


def _github_environment(environment):
    return {**environment, 'GIT_ALLOW_PROTOCOL': 'https', 'SSH_ASKPASS': '',
            'GCM_INTERACTIVE': 'false', 'GCM_TRACE': '0', 'GCM_TRACE_SECRETS': '0'}


def _remote_head(develop, target, git_run):
    github = is_github_https_remote(target['remote_url'])
    if github:
        _check_remote_urls(develop, target, git_run)
    output = git_run(develop, 'ls-remote', '--refs', target['remote_name'], 'refs/heads/develop',
                     stage='remote-readback', github=github)
    match = re.fullmatch(rb'([0-9a-f]{40}|[0-9a-f]{64})\trefs/heads/develop\r?\n', output)
    _require(match is not None, 'integration_remote_ref_missing')
    return match.group(1).decode('ascii')


def _write_push_guard(hooks, url, base, sha):
    hooks.mkdir()
    guard = hooks/'pre-push'
    # Git supplies the remote OID from this push's negotiation, including zeroes for a missing ref.
    guard.write_text(
        '#!/bin/sh\n'
        f'test "$2" = {shlex.quote(url)} || exit 1\n'
        'IFS= read -r update || exit 1\n'
        f'test "$update" = "{sha} {sha} refs/heads/develop {base}" || exit 1\n'
        'if IFS= read -r update; then exit 1; fi\n',
        encoding='utf-8', newline='\n')
    guard.chmod(0o700)


def _target_roots(source_root, target, git_run, text):
    source=Path(source_root).resolve()
    candidate=Path(target['candidate_worktree_path']).resolve()
    develop=Path(target['target_worktree_path']).resolve()
    repository=Path(target['repository_path']).resolve()
    for root in (source,candidate,develop,repository):
        _require(root.is_dir(),'integration_root_missing')
    for left,right in ((source,candidate),(source,develop),(candidate,develop)):
        _require(not left.is_relative_to(right) and not right.is_relative_to(left),'integration_roots_overlap')
    github = is_github_https_remote(target['remote_url'])
    if not github:
        remote=Path(target['remote_url'])
        _require(remote.is_absolute() and remote.is_dir(),'integration_local_remote_required')
        remote=remote.resolve()
        for root in (source,candidate,develop):
            _require(not remote.is_relative_to(root) and not root.is_relative_to(remote),'integration_remote_overlaps_worktree')
        _require(text(remote,'rev-parse','--is-bare-repository')=='true','integration_remote_not_bare')
    common=[Path(text(root,'rev-parse','--path-format=absolute','--git-common-dir')).resolve()
            for root in (repository,develop,candidate)]
    _require(common[0]==common[1]==common[2],'integration_repository_mismatch')
    for root in (repository,develop,candidate):
        _require(Path(text(root,'rev-parse','--show-toplevel')).resolve()==root,'integration_worktree_root_mismatch')
    _require(text(develop,'symbolic-ref','HEAD')=='refs/heads/develop','integration_branch_mismatch')
    _require(text(candidate,'symbolic-ref','HEAD') not in ('refs/heads/develop','refs/heads/main','refs/heads/master','refs/heads/publicrelease'),
             'integration_candidate_branch_mismatch')
    _require(text(develop,'rev-parse','--symbolic-full-name','@{upstream}')==
             'refs/remotes/'+target['remote_name']+'/develop','integration_upstream_mismatch')
    if not github:
        _check_remote_urls(develop,target,git_run)
    for pair in target['files']:
        _inside(source,pair['source_path'])
        _inside(candidate,pair['target_path'])
        _inside(develop,pair['target_path'])
    _require(not git_run(candidate,'check-attr','-z','--all','--',*(pair['target_path'] for pair in target['files'])),
             'integration_attributes_not_supported')


def _target_base(source_root, target, git_run, text):
    _target_roots(source_root, target, git_run, text)
    candidate=Path(target['candidate_worktree_path']).resolve()
    develop=Path(target['target_worktree_path']).resolve()
    base = text(develop,'rev-parse','HEAD')
    _require(base == target.get('expected_base', base),'integration_head_changed')
    _clean(candidate,base,git_run,text)
    _clean(develop,base,git_run,text)
    remote_sha = (_remote_head(develop,target,git_run) if is_github_https_remote(target['remote_url'])
                  else text(Path(target['remote_url']).resolve(),'rev-parse','--verify','refs/heads/develop'))
    _require(remote_sha==base,'integration_remote_advanced')
    return base


def preflight_develop_target(source_root, target, *, git_executable):
    git = Path(git_executable)
    _require(git.is_absolute() and git.is_file(), 'integration_git_unavailable')
    environment = {key: value for key, value in os.environ.items() if not key.upper().startswith('GIT_')}
    environment.update(GIT_OPTIONAL_LOCKS='0', GIT_TERMINAL_PROMPT='0')
    deadline = time.monotonic() + (30 if is_github_https_remote(target['remote_url']) else 5)

    def git_run(root, *args, stage='git', github=False, private_stdout=False):
        options = _github_options(target['remote_url']) if github else []
        return subprocess.run([str(git), '--literal-pathspecs', '-c', 'core.fsmonitor=false',
                               '-c', 'core.hooksPath=' + os.devnull, *options, *args],
                              cwd=root, stdin=subprocess.DEVNULL, capture_output=True, check=True,
                              env=_github_environment(environment) if github else environment,
                              timeout=max(.01, deadline - time.monotonic()),
                              creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0).stdout

    def text(root, *args, **options):
        return git_run(root,*args,**options).decode('utf-8').strip()

    return _target_base(source_root, target, git_run, text)


_WRITE_STAGES = ('candidate-test', 'stage-approved-files', 'commit-approved-files',
                 'fast-forward-develop', 'develop-test', 'push-develop')
_READ_STAGES = {'git', 'remote-readback', 'verify-index-blob', 'approved-staged-diff',
                'authorized-push-range'}


def _read_evidence(path):
    return json.loads(_inside(path.parent, path.name).read_text(encoding='utf-8'))


def _job_name(operation_id, directory):
    return 'Local\\ce-integrate-'+_digest([operation_id, str(directory)])


def _windows_command(intent, directory, stdout, stderr, environment, checkpoint, receipt):
    import msvcrt

    api = WindowsAPI()
    job = api.create_job(intent['job_name'])
    process = thread = None
    assigned = False
    try:
        with open(os.devnull, 'rb') as stdin, open(os.devnull, 'wb') as discard:
            handles = tuple(msvcrt.get_osfhandle(stream.fileno()) for stream in (stdin, stdout, stderr or discard))
            try:
                for handle in handles:
                    os.set_handle_inheritable(handle, True)
                executable, *args = intent['argv']
                process, thread, _ = api.spawn(executable, args, intent['cwd'], handles, env=environment)
            finally:
                for handle in handles:
                    os.set_handle_inheritable(handle, False)
        api.assign(job, process)
        assigned = True
        _write_json(directory/'launch.json', {'job_name': intent['job_name']})
        checkpoint()
        api.resume(thread)
        deadline = time.monotonic()+intent['timeout']
        while not api.wait_process(process, .05) or api.active(job):
            if time.monotonic() >= deadline:
                raise TimeoutError('integration_command_timeout')
            checkpoint()
            time.sleep(.02)
        receipt.update(status='exited', exit_code=api.exit_code(process),
                       direct_process_reaped=True, process_tree_verified=True)
    except BaseException:
        if assigned:
            api.terminate_job(job)
        elif process:
            api.terminate_process(process)
        if process:
            receipt['direct_process_reaped'] = api.wait_process(process, 2)
        raise
    finally:
        for handle in (thread, process, job):
            api.close(handle)


def _recovery_history(root, operation, copy_intent):
    """Read the original receipts and any later recovery attempts without rewriting them."""
    attempts = [root, *sorted(root.glob('r[0-9][0-9][0-9]*'))]
    writes = {}
    copied = False
    copy_attempts = []
    input_hash = _digest(copy_intent['approved'])
    for attempt in attempts:
        _inside(root, attempt.relative_to(root))
        record_path = attempt/'operation.json'
        directories = sorted(path for path in attempt.iterdir() if path.name.isdecimal())
        if record_path.exists():
            record = _read_evidence(record_path)
            _require(all(record.get(key) == value for key, value in operation.items()),
                     'integration_operation_evidence_changed')
        else:
            _require(not directories and not (attempt/'copy-intent.json').exists(),
                     'integration_operation_evidence_missing')
        if (attempt/'copy-intent.json').exists():
            _require(_read_evidence(attempt/'copy-intent.json') == copy_intent,
                     'integration_copy_evidence_changed')
            copy_attempts.append(attempt)
        if (attempt/'copy-complete.json').exists():
            _require(attempt in copy_attempts and _read_evidence(attempt/'copy-complete.json') == copy_intent,
                     'integration_copy_evidence_changed')
            copied = True
        for directory in directories:
            _inside(attempt, directory.name)
            if not (directory/'intent.json').exists():
                continue
            intent = _read_evidence(directory/'intent.json')
            stage = intent.get('stage')
            _require(intent.get('operation_id') == operation['operation_id']
                     and intent.get('request_hash') == operation['request_hash']
                     and intent.get('input_hash') == input_hash
                     and (stage in _WRITE_STAGES or stage in _READ_STAGES), 'integration_command_intent_changed')
            if stage in _READ_STAGES:
                continue
            receipt_path = directory/'receipt.json'
            receipt = _read_evidence(receipt_path) if receipt_path.exists() else {}
            if receipt:
                _require(all(receipt.get(key) == value for key, value in intent.items()),
                         'integration_command_receipt_changed')
                for channel in ('stdout', 'stderr'):
                    _require(receipt[channel] == _file_identity(_inside(directory, channel+'.log')),
                             'integration_command_log_changed')
            job_name = intent.get('job_name')
            if job_name:
                _require(job_name == _job_name(operation['operation_id'], directory), 'integration_command_intent_changed')
                launch_path = directory/'launch.json'
                if not launch_path.exists():
                    continue
                _require(_read_evidence(launch_path) == {'job_name': job_name}, 'integration_command_intent_changed')
            passed = (receipt.get('status') == 'exited' and receipt.get('exit_code') == 0
                      and receipt.get('direct_process_reaped') is True)
            tree_stopped = receipt.get('process_tree_verified') is True or bool(job_name and query_old_job(job_name))
            retryable = tree_stopped and receipt.get('status') != 'exited' and stage != 'push-develop'
            duplicate = stage in writes and list(writes)[-1] == stage and writes[stage]['retryable']
            _require(duplicate or (len(writes) < len(_WRITE_STAGES) and _WRITE_STAGES[len(writes)] == stage),
                     'integration_write_intent_out_of_order')
            _require(passed or retryable or stage == 'push-develop', 'integration_previous_command_unconfirmed:'+stage)
            writes[stage] = {**intent, 'directory': str(directory), 'passed': passed,
                             'process_tree_verified': tree_stopped, 'retryable': retryable}
    # A candidate test could only start after the entire legacy copy loop returned.
    copied = copied or 'candidate-test' in writes
    pending_copy = bool(copy_attempts and not copied)
    if pending_copy:
        for attempt in copy_attempts:
            guard = ExecutionOwner(attempt/'copy')
            _require(_inside(attempt, guard.path.name).is_file() and guard.acquire(),
                     'integration_previous_copy_unconfirmed')
            guard.close()
    return writes, copied, pending_copy, root/f'r{len(attempts):03d}'


def run_develop_integration(step, flow, *, git_executable, output_dir, source_output_dir,
                            cancel_event=None, checkpoint, recover=False, own_process_tree=False):
    """Integrate to a local bare or GitHub remote and reap direct child processes."""
    output=Path(output_dir)
    _require(output.is_absolute() and not output.is_symlink() and not output.is_junction(),
             'integration_output_invalid')
    snapshot=step['request']['integration_target']
    target=snapshot['target']
    github = is_github_https_remote(target['remote_url'])
    spec=snapshot['verification']
    source=Path(snapshot['source_root']).resolve()
    candidate=Path(target['candidate_worktree_path']).resolve()
    develop=Path(target['target_worktree_path']).resolve()
    git=Path(git_executable)
    _require(git.is_absolute() and git.is_file(), 'integration_git_unavailable')
    git_environment={key:value for key,value in os.environ.items() if not key.upper().startswith('GIT_')}
    git_environment.update(GIT_OPTIONAL_LOCKS='0', GIT_TERMINAL_PROMPT='0', GIT_NO_REPLACE_OBJECTS='1')
    sequence=0
    commands=[]
    operation = {'operation_id':step['operation_id'],'request_hash':_digest(step['request']),
                 'request':step['request'],'task_id':flow['task_id'],'flow_id':flow['id'],'step_id':step['id']}
    copy_intent = {'operation_id':step['operation_id'],'approved':snapshot['source_hash'],'files':target['files']}
    previous, copied, pending_copy = {}, False, False
    if recover and output.exists():
        previous, copied, pending_copy, output = _recovery_history(output, operation, copy_intent)
    _require(not output.exists(), 'integration_output_exists')
    output.mkdir(parents=True,exist_ok=False)
    (output/'empty-hooks').mkdir()
    _write_json(output/'operation.json', {**operation, 'process_tree_verified':False,
                                         'cleanup_scope':'direct_processes'})

    def command(stage, argv, cwd, *, timeout=30, github=False, private_stdout=False):
        nonlocal sequence
        sequence+=1
        directory=output/f'{sequence:03d}'
        directory.mkdir()
        intent={'stage':stage,'operation_id':step['operation_id'],'argv':argv,'cwd':str(cwd),
                'request_hash':_digest(step['request']),'input_hash':_digest(snapshot['source_hash']),'timeout':timeout}
        if own_process_tree and os.name == 'nt' and stage in _WRITE_STAGES:
            intent['job_name'] = _job_name(step['operation_id'], directory)
        _write_json(directory/'intent.json',intent)
        checkpoint()
        if cancel_event is not None and cancel_event.is_set():
            raise RuntimeError('integration_cancelled')
        started=time.monotonic()
        process=None
        receipt={**intent,'status':'unknown','exit_code':None,'direct_process_reaped':False,'process_tree_verified':False}
        with (directory/'stdout.log').open('xb') as stdout, (directory/'stderr.log').open('xb') as stderr:
            try:
                environment = git_environment if argv[0]==str(git) else None
                if github:
                    environment = _github_environment(git_environment)
                # Credential helpers and remote error messages can write to stderr.
                private_output = None
                if 'job_name' in intent:
                    _windows_command(intent, directory, stdout, None if github else stderr, environment, checkpoint, receipt)
                else:
                    process=subprocess.Popen(argv,cwd=cwd,stdin=subprocess.DEVNULL,
                        stdout=subprocess.PIPE if private_stdout else stdout,
                        stderr=subprocess.DEVNULL if github else stderr,shell=False,env=environment,
                        creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
                    while process.poll() is None:
                        if time.monotonic()-started >= timeout:
                            raise TimeoutError('integration_command_timeout')
                        checkpoint()
                        if cancel_event is not None and cancel_event.is_set():
                            raise RuntimeError('integration_cancelled')
                        time.sleep(.05)
                    receipt.update(status='exited',exit_code=process.returncode,direct_process_reaped=True)
                    private_output = process.stdout.read() if private_stdout else None
            except BaseException as error:
                receipt['error_type']=type(error).__name__
                if process is not None:
                    if process.poll() is None:
                        process.kill()
                    process.wait()
                    receipt['exit_code']=process.returncode
                    receipt['direct_process_reaped']=True
                raise
            finally:
                if process is not None and process.stdout is not None:
                    process.stdout.close()
                receipt['stdout']=_file_identity(directory/'stdout.log')
                receipt['stderr']=_file_identity(directory/'stderr.log')
                receipt['elapsed_seconds']=time.monotonic()-started
                _write_json(directory/'receipt.json',receipt)
                commands.append({'directory':str(directory),**receipt})
        _require(receipt['exit_code']==0,'integration_command_failed:'+stage)
        return private_output if private_stdout else (directory/'stdout.log').read_bytes()

    def git_run(root, *args, stage='git', github=False, hooks=None, private_stdout=False):
        options = _github_options(target['remote_url']) if github else []
        return command(stage,[str(git),'--literal-pathspecs','-c','core.hooksPath='+str(hooks or output/'empty-hooks'),
            '-c','core.fsmonitor=false',
            '-c','commit.gpgSign=false',*options,*args],root,github=github,private_stdout=private_stdout)

    def text(root,*args,**options):
        return git_run(root,*args,**options).decode('utf-8').strip()

    def source_check():
        checkpoint()
        receipt=read_verification_receipt(output_dir=source_output_dir,argv=spec['argv'],cwd=source,
            task_id=flow['task_id'],flow_id=flow['id'],step_id=snapshot['verify_step_id'],source_files=spec['source_files'])
        _require(receipt==step['request']['verify_result']['receipt'],'integration_source_receipt_changed')
        return {name:_file_identity(_inside(source,name)) for name in spec['source_files']}

    def test(root, stage):
        before={name:_file_identity(_inside(root,name)) for name in spec['source_files']}
        _require(before==snapshot['source_hash'],'integration_test_input_changed')
        argv=list(spec['argv'])
        mapping=target['script_arg_map'][0]
        argv[mapping['index']]=str(_inside(root,mapping['source_path']))
        saved = previous.get(stage)
        if saved and not saved['passed']:
            saved = None
        if saved:
            _require(saved['argv'] == argv and saved['cwd'] == str(root) and saved['timeout'] == spec['timeout'],
                     'integration_test_evidence_changed')
        else:
            command(stage,argv,root,timeout=spec['timeout'])
        after={name:_file_identity(_inside(root,name)) for name in spec['source_files']}
        _require(before==after,'integration_test_changed_inputs')
        return {'argv':argv,'cwd':str(root),'source_before':before,'source_after':after,
                'exit_code':0,'command_directory':(saved or commands[-1])['directory']}

    def copy_files():
        guard = ExecutionOwner(output/'copy') if own_process_tree and os.name == 'nt' else None
        if guard:
            _require(guard.acquire(), 'integration_copy_lock_unavailable')
        try:
            _write_json(output/'copy-intent.json',copy_intent)
            checkpoint()
            for pair in target['files']:
                source_check()
                incoming=_inside(source,pair['source_path']).read_bytes()
                identity={'bytes':len(incoming),'sha256':hashlib.sha256(incoming).hexdigest()}
                _require(identity==approved[pair['source_path']],'integration_source_changed')
                destination=_inside(candidate,pair['target_path'])
                checkpoint()
                destination.parent.mkdir(parents=True,exist_ok=True)
                destination.write_bytes(incoming)
            _write_json(output/'copy-complete.json',copy_intent)
        finally:
            if guard:
                guard.close()

    try:
        base = target['expected_base']
        staged = previous.get('stage-approved-files', {}).get('passed', False)
        committed = False
        merged = False
        if pending_copy:
            paths = {name: _inside(candidate,name) for name in spec['source_files']}
            copied = {name: _file_identity(path) for name, path in paths.items() if path.is_file()} == snapshot['source_hash']
        if copied:
            _target_roots(source,target,git_run,text)
            remote_sha = _remote_head(develop,target,git_run)
        else:
            _target_base(source,target,git_run,text)
            if not github:
                _require(_remote_head(develop,target,git_run)==base,'integration_remote_advanced')
            remote_sha = base
        approved=source_check()
        _require(approved==snapshot['source_hash'],'integration_source_changed')
        names=[pair['target_path'] for pair in target['files']]
        for name in names:
            _inside(candidate,name)
            _inside(develop,name)
        _require(not git_run(candidate,'check-attr','-z','--all','--',*names),'integration_attributes_not_supported')
        if not copied:
            copy_files()
        else:
            _no_git_operation(candidate, text)
            _no_git_operation(develop, text)
            candidate_head = text(candidate,'rev-parse','HEAD')
            develop_head = text(develop,'rev-parse','HEAD')
            if 'commit-approved-files' in previous:
                committed = previous['commit-approved-files']['passed'] or candidate_head != base
            if 'fast-forward-develop' in previous:
                merged = previous['fast-forward-develop']['passed'] or develop_head != base
            _clean(develop,candidate_head if merged else base,git_run,text)
            if 'push-develop' in previous:
                push = previous['push-develop']
                _require(push['cwd'] == str(develop) and push['argv'][-2:] == [target['remote_name'], candidate_head+':refs/heads/develop'],
                         'integration_push_intent_changed')
                _require(remote_sha != base, 'integration_previous_push_unconfirmed')
                _require(remote_sha == candidate_head, 'integration_remote_advanced')
                _require(committed and merged and previous['candidate-test']['passed']
                         and previous['develop-test']['passed'], 'integration_previous_push_evidence_missing')
            else:
                _require(remote_sha == base, 'integration_remote_advanced')
                _require(all(record['process_tree_verified'] for record in previous.values()),
                         'integration_previous_process_tree_unconfirmed')
            if committed:
                _clean(candidate,candidate_head,git_run,text)
            else:
                _require(candidate_head == base, 'integration_head_changed')
                paths = git_run(candidate,'diff','--name-only','-z',base).split(b'\0')[:-1]
                paths += git_run(candidate,'ls-files','--others','-z').split(b'\0')[:-1]
                _require(set(paths) <= {name.encode('utf-8') for name in names}, 'integration_worktree_dirty')
                if 'stage-approved-files' not in previous:
                    _require(not git_run(candidate,'diff','--cached','--name-only','-z'), 'integration_worktree_dirty')
        candidate_test=test(candidate,'candidate-test')
        source_check()
        _require(not git_run(candidate,'check-attr','-z','--all','--',*names),'integration_attributes_not_supported')
        if committed:
            sha = candidate_head
            commit = previous['commit-approved-files']
            if commit['passed']:
                stdout = _inside(Path(commit['directory']), 'stdout.log').read_bytes()
                match = re.match(rb'\[[^\r\n]+ ([0-9a-f]{4,64})\] ', stdout)
                _require(match is not None, 'integration_candidate_commit_unconfirmed')
                observed_sha = match.group(1).decode('ascii')
                matches_sha = sha == observed_sha if 'core.abbrev=no' in commit['argv'] else sha.startswith(observed_sha)
                _require(matches_sha, 'integration_candidate_commit_changed')
            diff = [base,sha]
        else:
            if not staged:
                git_run(candidate,'-c','core.autocrlf=false','-c','core.safecrlf=false','add','--',*names,stage='stage-approved-files')
            diff = ['--cached']
        changed=git_run(candidate,'diff',*diff,'--name-only','-z').decode('utf-8').split('\0')[:-1]
        _require(bool(changed) and set(changed)<=set(names),'integration_staged_paths_mismatch')
        _require(not git_run(candidate,'diff','--name-only','-z'),'integration_unstaged_changes')
        _require(not git_run(candidate,'ls-files','--others','-z'),'integration_untracked_files')
        raw=git_run(candidate,'diff',*diff,'--raw','-z').split(b'\0')
        for record in raw[::2]:
            if record:
                modes=record.split(b' ')[:2]
                _require(modes[1] in (b'100644',b'100755') and modes[0][1:] in (b'000000',modes[1]),
                         'integration_unapproved_file_mode')
        for name in names:
            blob=git_run(candidate,'show',(sha if committed else '')+':'+name,stage='verify-index-blob')
            _require({'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()}==approved[name],
                     'integration_index_bytes_mismatch')
        git_run(candidate,'diff',*diff,'--binary','--no-ext-diff',stage='approved-staged-diff')
        source_check()
        if not committed:
            git_run(candidate,'-c','core.abbrev=no','commit','-m',target['commit_message'],stage='commit-approved-files')
        sha=text(candidate,'rev-parse','HEAD')
        _require(text(candidate,'rev-list','--count',base+'..'+sha)=='1','integration_commit_range_changed')
        _require(text(candidate,'rev-list','--parents','-n','1',sha)==f'{sha} {base}','integration_parent_changed')
        _clean(candidate,sha,git_run,text)
        if not merged:
            _clean(develop,base,git_run,text)
            source_check()
            git_run(develop,'merge','--ff-only',sha,stage='fast-forward-develop')
        target_test=test(develop,'develop-test')
        _clean(develop,sha,git_run,text)
        source_check()
        _require(text(develop,'rev-list','--count',base+'..HEAD')=='1','integration_push_range_changed')
        history=text(develop,'log','--format=%H %P %s',base+'..'+sha,stage='authorized-push-range')
        _require(history == f"{sha} {base} {target['commit_message']}", 'integration_push_range_changed')
        if 'push-develop' not in previous:
            _require(_remote_head(develop,target,git_run)==base,'integration_remote_advanced')
            _check_remote_urls(develop,target,git_run)
            hooks = output/'push-guard'
            _write_push_guard(hooks,target['remote_url'],base,sha)
            push_options = ['-c', f"remote.{target['remote_name']}.mirror=false"]
            git_run(develop,*push_options,'push','--porcelain','--no-follow-tags','--no-signed',
                    '--recurse-submodules=no',target['remote_name'],sha+':refs/heads/develop',
                    stage='push-develop',github=github,hooks=hooks)
        remote_sha=_remote_head(develop,target,git_run)
        _require(remote_sha==sha,'integration_remote_readback_mismatch')
        source_after=source_check()
        _require(source_after==approved,'integration_source_changed')
        target_sha=text(develop,'rev-parse','HEAD')
        candidate_sha=text(candidate,'rev-parse','HEAD')
        _require(candidate_sha==target_sha==remote_sha,'integration_heads_changed')
        for record in commands:
            directory=Path(record['directory'])
            for channel in ('stdout','stderr'):
                _require(_file_identity(directory/(channel+'.log'))==record[channel],'integration_command_log_changed')
        result={'operation_id':step['operation_id'],'request_hash':_digest(step['request']),
            'integration_target':snapshot,'candidate_sha':candidate_sha,'target_sha':target_sha,'remote_sha':remote_sha,
            'candidate_test_passed':candidate_test['exit_code']==0,'target_test_passed':target_test['exit_code']==0,
            'source_unchanged':source_after==approved,'cleanup_verified':all(c['direct_process_reaped'] and c['status']=='exited' for c in commands),
            'candidate_test':candidate_test,'target_test':target_test,'commands':commands,
            'output_dir':str(output),'process_tree_verified':False,'cleanup_scope':'direct_processes'}
        if recover:
            result['recovered'] = True
            result['prior_command_directories'] = {stage: record['directory'] for stage, record in previous.items()}
        _write_json(output/'result.json',result)
        return result
    except BaseException as error:
        _write_json(output/'incomplete.json',{'operation_id':step['operation_id'],'status':'unknown',
            'error_type':type(error).__name__,'reason':str(error),'commands':commands,'process_tree_verified':False})
        raise
