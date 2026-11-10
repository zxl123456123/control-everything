"""Run a registered one-off development task with owned outputs and temporary files.

Declared outputs are checked before launch. This is not an OS filesystem sandbox;
drivers must derive all artifact paths from CE_TASK_WORK_DIR themselves.
"""

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[2]


def unlinked(path):
    for item in (path, *path.parents):
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise ValueError('linked_task_path')
    return path


def owned_output(value, task_dir):
    raw = str(value).replace('\\', '/')
    if (not raw or raw.startswith('//') or any(ord(char) < 32 for char in raw)
            or any(part in {'.', '..'} or part.endswith((' ', '.')) for part in raw.split('/') if part)):
        raise ValueError('invalid_output_path')
    path = Path(value)
    if path.anchor and not path.is_absolute():
        raise ValueError('absolute_or_task_relative_output_required')
    if any(':' in part for part in path.parts[1 if path.anchor else 0:]):
        raise ValueError('invalid_output_path')
    candidate = unlinked(path if path.is_absolute() else task_dir / path).resolve()
    if candidate == task_dir or not candidate.is_relative_to(task_dir):
        raise ValueError('output_outside_task')
    return candidate


def replay(path, target):
    binary = getattr(target, 'buffer', None)
    if binary is not None:
        with path.open('rb') as source:
            shutil.copyfileobj(source, binary, length=65536)
        binary.flush()
    else:
        with path.open(encoding='utf-8', errors='replace') as source:
            for chunk in iter(lambda: source.read(65536), ''):
                target.write(chunk)
        target.flush()


def run_task(task, command, outputs, root=ROOT):
    if not re.fullmatch('[a-z0-9][a-z0-9-]*', task):
        raise ValueError('single_task_slug_required')
    root = unlinked(Path(root).absolute()).resolve()
    entry = unlinked(root / 'docs/current' / task / 'README.md')
    if not entry.is_file():
        raise ValueError('current_task_readme_required')
    task_dir = unlinked(root / 'work' / task).resolve()
    for value in outputs:
        if owned_output(value, task_dir).exists():
            raise ValueError('output_already_exists')
    runs = owned_output('runs', task_dir)
    runs.mkdir(parents=True, exist_ok=True)
    run_dir = owned_output(runs / uuid.uuid4().hex, task_dir)
    run_dir.mkdir()
    stdout_path = owned_output(run_dir / 'stdout.log', task_dir)
    stderr_path = owned_output(run_dir / 'stderr.log', task_dir)
    result_path = owned_output(run_dir / 'result.json', task_dir)
    temporary = tempfile.TemporaryDirectory(prefix='tmp-', dir=run_dir, delete=False)
    environment = dict(os.environ)
    environment.update(TEMP=temporary.name, TMP=temporary.name, TMPDIR=temporary.name,
                       CE_TASK_WORK_DIR=str(task_dir), CE_REPO_ROOT=str(root))
    result = {'task': task, 'command': command, 'childExitCode': None, 'exitCode': 1,
              'stdout': stdout_path.name, 'stderr': stderr_path.name,
              'temporaryDirectory': temporary.name, 'temporaryCleaned': False}
    process = None
    try:
        with stdout_path.open('wb') as stdout, stderr_path.open('wb') as stderr:
            process = subprocess.Popen(command, cwd=task_dir, env=environment,
                                       stdout=stdout, stderr=stderr, shell=False)
            result['childExitCode'] = process.wait()
            result['exitCode'] = result['childExitCode']
    except KeyboardInterrupt:
        if process is not None:
            if process.poll() is None:
                process.kill()
            result['childExitCode'] = process.wait()
        result['exitCode'] = 130
        result['error'] = 'KeyboardInterrupt'
    except OSError as error:
        result['error'] = type(error).__name__
    finally:
        try:
            owned_output(temporary.name, task_dir)
            temporary.cleanup()
            result['temporaryCleaned'] = True
        except (OSError, ValueError) as error:
            result['cleanupError'] = type(error).__name__
            if result['exitCode'] == 0:
                result['exitCode'] = 1
        owned_output(result_path, task_dir).write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for path, target in ((stdout_path, sys.stdout), (stderr_path, sys.stderr)):
        if path.is_file():
            replay(path, target)
    return result['exitCode']


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('task', help='Existing docs/current/<task>/README.md task slug.')
    parser.add_argument('--output', action='append', default=[],
                        help='Declared output; task-relative or an absolute path inside the task. Repeatable.')
    arguments = list(sys.argv[1:] if argv is None else argv)
    separator = arguments.index('--') if '--' in arguments else len(arguments)
    args = parser.parse_args(arguments[:separator])
    command = arguments[separator + 1:]
    if not command:
        parser.error('Use -- followed by a foreground command argv.')
    try:
        return run_task(args.task, command, args.output)
    except (OSError, ValueError) as error:
        print('run_task: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__),
              file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
