"""Record one trusted fixed command against an explicitly declared input set."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
from datetime import datetime, timezone


def _file_identity(path):
    with path.open('rb') as stream:
        checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
        size = os.fstat(stream.fileno()).st_size
    return {'bytes': size, 'sha256': checksum}


def _write_json(path, value):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')


def run_verification(*, argv, cwd, output_dir, task_id, flow_id, step_id, source_files, timeout):
    """Run a caller-authorized command; no process-tree or whole-repository claim is made."""
    if (type(argv) is not list or not argv or any(type(arg) is not str for arg in argv)
            or not Path(argv[0]).is_absolute()):
        raise ValueError('verification_absolute_executable_required')
    argv = list(argv)
    cwd, output_dir = Path(cwd), Path(output_dir)
    if not cwd.is_absolute() or not cwd.is_dir() or not output_dir.is_absolute() or timeout <= 0:
        raise ValueError('verification_paths_or_timeout_invalid')
    if output_dir.exists() or output_dir.is_symlink():
        raise FileExistsError(output_dir)
    cwd, output_dir = cwd.resolve(), output_dir.resolve()
    inputs = {}
    for value in source_files:
        relative = Path(value)
        path = (cwd / relative).resolve()
        if relative.is_absolute() or not path.is_relative_to(cwd):
            raise ValueError('verification_input_outside_cwd')
        name = path.relative_to(cwd).as_posix()
        if name in inputs:
            raise ValueError('verification_duplicate_input')
        inputs[name] = path
    before = {name: _file_identity(path) for name, path in inputs.items()}
    output_dir.mkdir(parents=True, exist_ok=False)
    started = {'schema': 1, 'status': 'started', 'argv': list(argv), 'cwd': str(cwd),
        'task_id': task_id, 'flow_id': flow_id, 'step_id': step_id,
        'started_at': datetime.now(timezone.utc).isoformat(), 'identity_scope': 'declared_inputs',
        'source_before': before, 'process_tree_verified': False}
    _write_json(output_dir / 'started.json', started)
    exit_code, status, reason, error = None, 'failed', None, None
    with (output_dir / 'stdout.log').open('xb') as stdout, (output_dir / 'stderr.log').open('xb') as stderr:
        try:
            result = subprocess.run(argv, cwd=cwd, shell=False, stdin=subprocess.DEVNULL,
                stdout=stdout, stderr=stderr, timeout=timeout, check=False,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            exit_code = result.returncode
        except subprocess.TimeoutExpired:
            status, reason = 'unknown', 'timeout'
        except OSError as failure:
            reason = 'spawn_failed'
            error = {'type': type(failure).__name__, 'errno': failure.errno, 'message': str(failure)}
    after = {name: _file_identity(path) for name, path in inputs.items()}
    changed = before != after
    if reason is None:
        status = 'passed' if exit_code == 0 and not changed else 'failed'
        reason = 'source_changed' if changed else ('nonzero_exit' if exit_code else None)
    receipt = {**started, 'status': status, 'reason': reason, 'exit_code': exit_code,
        'ended_at': datetime.now(timezone.utc).isoformat(), 'source_after': after, 'source_changed': changed,
        'stdout': {'path': 'stdout.log', **_file_identity(output_dir / 'stdout.log')},
        'stderr': {'path': 'stderr.log', **_file_identity(output_dir / 'stderr.log')}}
    if error is not None:
        receipt['error'] = error
    temporary = output_dir / 'receipt.json.tmp'
    _write_json(temporary, receipt)
    temporary.replace(output_dir / 'receipt.json')
    return receipt


def read_verification_receipt(*, output_dir, argv, cwd, task_id, flow_id, step_id, source_files=None):
    """Recheck the published identity and complete logs before consuming a result."""
    output = Path(output_dir)
    receipt = json.loads((output / 'receipt.json').read_text(encoding='utf-8'))
    expected = {'argv': argv, 'cwd': str(Path(cwd).resolve()), 'task_id': task_id,
                'flow_id': flow_id, 'step_id': step_id, 'identity_scope': 'declared_inputs'}
    if (any(receipt.get(key) != value for key, value in expected.items()) or not receipt.get('ended_at')
            or receipt['source_changed'] != (receipt['source_before'] != receipt['source_after'])):
        raise ValueError('verification_receipt_invalid')
    for key in ('stdout', 'stderr'):
        name = key + '.log'
        if receipt[key] != {'path': name, **_file_identity(output / name)}:
            raise ValueError('verification_log_changed')
    if source_files is not None:
        root, current = Path(cwd).resolve(), {}
        for value in source_files:
            relative = Path(value)
            path = (root / relative).resolve()
            if relative.is_absolute() or not path.is_relative_to(root):
                raise ValueError('verification_input_outside_cwd')
            name = path.relative_to(root).as_posix()
            if name in current:
                raise ValueError('verification_duplicate_input')
            current[name] = _file_identity(path)
        if (set(current) != set(receipt['source_before']) or current != receipt['source_after']):
            raise ValueError('verification_source_changed')
    return receipt
