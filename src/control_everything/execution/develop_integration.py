"""Integrate one accepted byte set using a fixed local Git develop operation."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

from control_everything.execution.verification import _file_identity, _write_json, read_verification_receipt


def _digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',', ':'),allow_nan=False).encode('utf-8')).hexdigest()


def _require(condition, reason):
    if not condition:
        raise ValueError(reason)


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
    for marker in ('MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer'):
        _require(not Path(text(root,'rev-parse','--path-format=absolute','--git-path',marker)).exists(),
                 'integration_unfinished_git_operation')


def _target_base(source_root, target, git_run, text):
    source=Path(source_root).resolve()
    candidate=Path(target['candidate_worktree_path']).resolve()
    develop=Path(target['target_worktree_path']).resolve()
    repository=Path(target['repository_path']).resolve()
    for root in (source,candidate,develop,repository):
        _require(root.is_dir(),'integration_root_missing')
    for left,right in ((source,candidate),(source,develop),(candidate,develop)):
        _require(not left.is_relative_to(right) and not right.is_relative_to(left),'integration_roots_overlap')
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
    for option in ((),('--push',)):
        _require(text(develop,'remote','get-url',*option,'--all',target['remote_name'])==target['remote_url'],
                 'integration_remote_url_changed')
    base = text(develop,'rev-parse','HEAD')
    _require(base == target.get('expected_base', base),'integration_head_changed')
    _clean(candidate,base,git_run,text)
    _clean(develop,base,git_run,text)
    _require(text(remote,'rev-parse','--verify','refs/heads/develop')==base,'integration_remote_advanced')
    for pair in target['files']:
        _inside(source,pair['source_path'])
        _inside(candidate,pair['target_path'])
        _inside(develop,pair['target_path'])
    _require(not git_run(candidate,'check-attr','-z','--all','--',*(pair['target_path'] for pair in target['files'])),
             'integration_attributes_not_supported')
    return base


def preflight_develop_target(source_root, target, *, git_executable):
    git = Path(git_executable)
    _require(git.is_absolute() and git.is_file(), 'integration_git_unavailable')
    environment = {key: value for key, value in os.environ.items() if not key.upper().startswith('GIT_')}
    environment.update(GIT_OPTIONAL_LOCKS='0', GIT_TERMINAL_PROMPT='0')
    deadline = time.monotonic() + 5

    def git_run(root, *args):
        return subprocess.run([str(git), '--literal-pathspecs', '-c', 'core.fsmonitor=false',
                               '-c', 'core.hooksPath=' + os.devnull, *args],
                              cwd=root, stdin=subprocess.DEVNULL, capture_output=True, check=True,
                              env=environment, timeout=max(.01, deadline - time.monotonic()),
                              creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0).stdout

    def text(root, *args):
        return git_run(root,*args).decode('utf-8').strip()

    return _target_base(source_root, target, git_run, text)


def run_develop_integration(step, flow, *, git_executable, output_dir, source_output_dir,
                            cancel_event=None, checkpoint):
    """Local remotes and reaped direct processes only; no process-tree guarantee."""
    output=Path(output_dir)
    _require(output.is_absolute() and not output.exists() and not output.is_symlink(), 'integration_output_exists')
    output.mkdir(parents=True,exist_ok=False)
    (output/'empty-hooks').mkdir()
    snapshot=step['request']['integration_target']
    target=snapshot['target']
    spec=snapshot['verification']
    source=Path(snapshot['source_root']).resolve()
    candidate=Path(target['candidate_worktree_path']).resolve()
    develop=Path(target['target_worktree_path']).resolve()
    git=Path(git_executable)
    _require(git.is_absolute() and git.is_file(), 'integration_git_unavailable')
    git_environment={key:value for key,value in os.environ.items() if not key.upper().startswith('GIT_')}
    git_environment['GIT_TERMINAL_PROMPT']='0'
    sequence=0
    commands=[]
    _write_json(output/'operation.json',{'operation_id':step['operation_id'],'request_hash':_digest(step['request']),
        'request':step['request'],'task_id':flow['task_id'],'flow_id':flow['id'],'step_id':step['id'],
        'process_tree_verified':False,'cleanup_scope':'direct_processes'})

    def command(stage, argv, cwd, *, timeout=30):
        nonlocal sequence
        sequence+=1
        directory=output/f'{sequence:03d}'
        directory.mkdir()
        intent={'stage':stage,'operation_id':step['operation_id'],'argv':argv,'cwd':str(cwd),
                'request_hash':_digest(step['request']),'input_hash':_digest(snapshot['source_hash']),'timeout':timeout}
        _write_json(directory/'intent.json',intent)
        checkpoint()
        if cancel_event is not None and cancel_event.is_set():
            raise RuntimeError('integration_cancelled')
        started=time.monotonic()
        process=None
        receipt={**intent,'status':'unknown','exit_code':None,'direct_process_reaped':False,'process_tree_verified':False}
        with (directory/'stdout.log').open('xb') as stdout, (directory/'stderr.log').open('xb') as stderr:
            try:
                process=subprocess.Popen(argv,cwd=cwd,stdin=subprocess.DEVNULL,stdout=stdout,stderr=stderr,
                    shell=False,env=git_environment if argv[0]==str(git) else None,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
                while process.poll() is None:
                    if time.monotonic()-started >= timeout:
                        raise TimeoutError('integration_command_timeout')
                    checkpoint()
                    if cancel_event is not None and cancel_event.is_set():
                        raise RuntimeError('integration_cancelled')
                    time.sleep(.05)
                receipt.update(status='exited',exit_code=process.returncode,direct_process_reaped=True)
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
                receipt['stdout']=_file_identity(directory/'stdout.log')
                receipt['stderr']=_file_identity(directory/'stderr.log')
                receipt['elapsed_seconds']=time.monotonic()-started
                _write_json(directory/'receipt.json',receipt)
                commands.append({'directory':str(directory),**receipt})
        _require(receipt['exit_code']==0,'integration_command_failed:'+stage)
        return (directory/'stdout.log').read_bytes()

    def git_run(root, *args, stage='git'):
        return command(stage,[str(git),'--literal-pathspecs','-c','core.hooksPath='+str(output/'empty-hooks'),
            '-c','core.fsmonitor=false',
            '-c','commit.gpgSign=false',*args],root)

    def text(root,*args,stage='git'):
        return git_run(root,*args,stage=stage).decode('utf-8').strip()

    def source_check():
        checkpoint()
        receipt=read_verification_receipt(output_dir=source_output_dir,argv=spec['argv'],cwd=source,
            task_id=flow['task_id'],flow_id=flow['id'],step_id=snapshot['verify_step_id'],source_files=spec['source_files'])
        _require(receipt==step['request']['verify_result']['receipt'],'integration_source_receipt_changed')
        return {name:_file_identity(_inside(source,name)) for name in spec['source_files']}

    def remote_head():
        lines=text(develop,'ls-remote','--refs',target['remote_name'],'refs/heads/develop',stage='remote-readback').splitlines()
        _require(len(lines)==1 and lines[0].split()[1]=='refs/heads/develop','integration_remote_ref_missing')
        return lines[0].split()[0]

    def test(root, stage):
        before={name:_file_identity(_inside(root,name)) for name in spec['source_files']}
        _require(before==snapshot['source_hash'],'integration_test_input_changed')
        argv=list(spec['argv'])
        mapping=target['script_arg_map'][0]
        argv[mapping['index']]=str(_inside(root,mapping['source_path']))
        command(stage,argv,root,timeout=spec['timeout'])
        after={name:_file_identity(_inside(root,name)) for name in spec['source_files']}
        _require(before==after,'integration_test_changed_inputs')
        return {'argv':argv,'cwd':str(root),'source_before':before,'source_after':after,
                'exit_code':commands[-1]['exit_code'],'command_directory':commands[-1]['directory']}

    try:
        _target_base(source,target,git_run,text)
        _require(remote_head()==target['expected_base'],'integration_remote_advanced')
        approved=source_check()
        _require(approved==snapshot['source_hash'],'integration_source_changed')
        names=[pair['target_path'] for pair in target['files']]
        for name in names:
            _inside(candidate,name)
            _inside(develop,name)
        _require(not git_run(candidate,'check-attr','-z','--all','--',*names),'integration_attributes_not_supported')
        _write_json(output/'copy-intent.json',{'operation_id':step['operation_id'],'approved':approved,'files':target['files']})
        checkpoint()
        for pair in target['files']:
            source_check()
            incoming=_inside(source,pair['source_path']).read_bytes()
            identity={'bytes':len(incoming),'sha256':hashlib.sha256(incoming).hexdigest()}
            _require(identity==approved[pair['source_path']],'integration_source_changed')
            destination=_inside(candidate,pair['target_path'])
            destination.parent.mkdir(parents=True,exist_ok=True)
            checkpoint()
            destination.write_bytes(incoming)
        candidate_test=test(candidate,'candidate-test')
        source_check()
        _require(not git_run(candidate,'check-attr','-z','--all','--',*names),'integration_attributes_not_supported')
        git_run(candidate,'-c','core.autocrlf=false','-c','core.safecrlf=false','add','--',*names,stage='stage-approved-files')
        changed=git_run(candidate,'diff','--cached','--name-only','-z').decode('utf-8').split('\0')[:-1]
        _require(bool(changed) and set(changed)<=set(names),'integration_staged_paths_mismatch')
        _require(not git_run(candidate,'diff','--name-only','-z'),'integration_unstaged_changes')
        _require(not git_run(candidate,'ls-files','--others','-z'),'integration_untracked_files')
        raw=git_run(candidate,'diff','--cached','--raw','-z').split(b'\0')
        for record in raw[::2]:
            if record:
                modes=record.split(b' ')[:2]
                _require(modes[1] in (b'100644',b'100755') and modes[0][1:] in (b'000000',modes[1]),
                         'integration_unapproved_file_mode')
        for name in names:
            blob=git_run(candidate,'show',':'+name,stage='verify-index-blob')
            _require({'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()}==approved[name],
                     'integration_index_bytes_mismatch')
        git_run(candidate,'diff','--cached','--binary','--no-ext-diff',stage='approved-staged-diff')
        source_check()
        git_run(candidate,'commit','-m',target['commit_message'],stage='commit-approved-files')
        sha=text(candidate,'rev-parse','HEAD')
        _require(text(candidate,'rev-list','--count',target['expected_base']+'..'+sha)=='1','integration_commit_range_changed')
        _require(text(candidate,'rev-parse',sha+'^')==target['expected_base'],'integration_parent_changed')
        _clean(candidate,sha,git_run,text)
        _clean(develop,target['expected_base'],git_run,text)
        source_check()
        git_run(develop,'merge','--ff-only',sha,stage='fast-forward-develop')
        target_test=test(develop,'develop-test')
        _clean(develop,sha,git_run,text)
        source_check()
        _require(remote_head()==target['expected_base'],'integration_remote_advanced')
        _require(text(develop,'rev-list','--count',target['expected_base']+'..HEAD')=='1','integration_push_range_changed')
        history=text(develop,'log','--format=%H %P %s',target['expected_base']+'..'+sha,stage='authorized-push-range').splitlines()
        _require(len(history)==1 and history[0].split()[:2]==[sha,target['expected_base']], 'integration_push_range_changed')
        git_run(develop,'push','--porcelain','--no-follow-tags',target['remote_name'],sha+':refs/heads/develop',stage='push-develop')
        remote_sha=remote_head()
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
        _write_json(output/'result.json',result)
        return result
    except BaseException as error:
        _write_json(output/'incomplete.json',{'operation_id':step['operation_id'],'status':'unknown',
            'error_type':type(error).__name__,'reason':str(error),'commands':commands,'process_tree_verified':False})
        raise
