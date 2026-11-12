"""Select an immutable Actions event range for the existing repository scanner."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys

SPEC = importlib.util.spec_from_file_location('ci_repository_checks', Path(__file__).with_name('check_repository.py'))
CHECKS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKS)


def sha(value):
    if not isinstance(value, str) or not re.fullmatch('[0-9a-fA-F]{40}', value) or set(value) == {'0'}:
        raise ValueError('invalid-event-sha')
    return value.lower()


def git(root, *arguments):
    result = subprocess.run(['git', *arguments], cwd=root, capture_output=True, text=True, encoding='utf-8')
    if result.returncode:
        raise ValueError('required-git-history-unavailable')
    return result.stdout.strip()


def scan_arguments(root, event_name, event, github_sha):
    if event_name not in {'push', 'pull_request', 'workflow_dispatch'}:
        raise ValueError('unsupported-event')
    if not isinstance(event, dict):
        raise ValueError('event-object-required')
    head = sha(github_sha)
    if git(root, 'rev-parse', 'HEAD') != head:
        raise ValueError('checkout-identity-mismatch')
    if event_name == 'push':
        if sha(event.get('after')) != head:
            raise ValueError('event-head-identity-mismatch')
        if event.get('before') == '0' * 40:
            if event.get('created') is not True:
                raise ValueError('initial-push-created-required')
            return ['changes', '--from-root', '--head', head]
        base = sha(event.get('before'))
    elif event_name == 'pull_request':
        try:
            base = sha(event['pull_request']['base']['sha'])
            branch_head = sha(event['pull_request']['head']['sha'])
        except (KeyError, TypeError) as error:
            raise ValueError('pull-request-identities-required') from error
        parents = git(root, 'rev-list', '--parents', '-n', '1', head).split()[1:]
        if parents != [base, branch_head]:
            raise ValueError('pr-merge-identity-mismatch')
    else:
        parents = git(root, 'rev-list', '--parents', '-n', '1', head).split()[1:]
        if not parents:
            return ['changes', '--from-root', '--head', head]
        base = sha(parents[0])
    git(root, 'rev-parse', '--verify', base + '^{commit}')
    return ['changes', '--base', base, '--head', head]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    parser.add_argument('--event-name', default=os.environ.get('GITHUB_EVENT_NAME'))
    parser.add_argument('--event-path', type=Path, default=os.environ.get('GITHUB_EVENT_PATH'))
    parser.add_argument('--sha', default=os.environ.get('GITHUB_SHA'))
    parser.add_argument('--report', default='work/checks/changes.json')
    parser.add_argument('--gitleaks', type=Path)
    args = parser.parse_args(argv)
    try:
        if args.event_path is None:
            raise ValueError('event-file-required')
        event = json.loads(args.event_path.read_text(encoding='utf-8'))
        root = args.root.resolve()
        arguments = scan_arguments(root, args.event_name, event, args.sha)
        arguments.extend(['--root', str(root), '--report', args.report])
        if args.gitleaks is not None:
            arguments.extend(['--gitleaks', str(args.gitleaks)])
        return CHECKS.main(arguments)
    except (OSError, ValueError) as error:
        print('ci_changes_failed:' + (str(error) if isinstance(error, ValueError) else type(error).__name__),
              file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
