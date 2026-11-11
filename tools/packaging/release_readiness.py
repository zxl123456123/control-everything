"""Bind local check and acceptance evidence to one candidate; never publish it."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

from control_everything.installation.manifest import no_links, sha256, strict_json, verify_payload

ROOT = Path(__file__).resolve().parents[2]


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def read(path):
    return strict_json(no_links(Path(path)).read_text(encoding='utf-8-sig'))


def reference(path):
    path = no_links(Path(path)).resolve()
    return {'path': str(path), 'sha256': sha256(path)}


def checked_reference(item):
    actual = reference(item['path'])
    require(actual['sha256'] == item['sha256'], 'evidence_hash_mismatch')
    return actual


def source_commit(root):
    def git(*args):
        return subprocess.run(['git', *args], cwd=root, capture_output=True, check=True).stdout.strip()
    require(not git('status', '--porcelain', '--untracked-files=normal'), 'dirty_source')
    return git('rev-parse', 'HEAD').decode('ascii')


def record_check(output, command, *, root=ROOT):
    root, output = no_links(Path(root)).resolve(), no_links(Path(output)).resolve()
    require(output.is_relative_to(root / 'work'), 'check_output_must_be_under_work')
    require(command and all(isinstance(value, str) and value for value in command), 'command_required')
    commit = source_commit(root)
    output.mkdir(parents=True, exist_ok=False)
    result = {'schema': 1, 'status': 'failed', 'commit': commit, 'command': command,
              'exit_code': None, 'logs': {}}
    environment = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
    for name in ('PYTHONPATH', 'PYTHONHOME'):
        environment.pop(name, None)
    try:
        with (output / 'stdout.log').open('xb') as stdout, (output / 'stderr.log').open('xb') as stderr:
            process = subprocess.run(command, cwd=root, env=environment, stdin=subprocess.DEVNULL,
                                     stdout=stdout, stderr=stderr, shell=False)
        result['exit_code'] = process.returncode
        require(source_commit(root) == commit, 'source_changed_during_check')
        if process.returncode == 0:
            result['status'] = 'passed'
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        result['error'] = type(error).__name__ + ':' + str(error)
    finally:
        result['logs'] = {name: reference(output / (name + '.log')) for name in ('stdout', 'stderr')}
        with (output / 'receipt.json').open('x', encoding='utf-8') as stream:
            json.dump(result, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
    return result


def verify(candidate, acceptance_path, review_path, output):
    candidate, output = no_links(Path(candidate)).resolve(), no_links(Path(output)).resolve()
    require(not output.is_relative_to(candidate / 'payload'), 'output_inside_payload')
    result = {'schema': 1, 'status': 'blocked', 'errors': []}
    # Reserve the destination before checking inputs; reruns never replace evidence.
    with output.open('x', encoding='utf-8') as stream:
        try:
            build_path = candidate / 'build-receipt.json'
            build, acceptance, review = read(build_path), read(acceptance_path), read(review_path)
            require(all(type(value['schema']) is int and value['schema'] == 1
                        for value in (build, acceptance, review)), 'evidence_schema')
            require(build['status'] == 'candidate-built-awaiting-acceptance', 'candidate_not_built')
            require(build['steps'] and all(type(step['exit_code']) is int and step['exit_code'] == 0
                                          for step in build['steps']), 'build_steps_failed')
            product = verify_payload(candidate / 'payload', strict_native=True)
            identity = {key: product[key] for key in ('version', 'closure')}
            require(all(build[key] == value for key, value in identity.items())
                    and build['commit'] == product['source']['commit']
                    and product['source']['dirty'] is False, 'candidate_identity_mismatch')
            installer = checked_reference(build['installer'])
            sources = checked_reference(build['source_bundle'])
            source_info = read(candidate / 'payload/SOURCE-AVAILABILITY.json')
            require(Path(sources['path']).name == source_info['archive']
                    == f"session-panel-{product['version']}-sources.zip"
                    and sources['sha256'] == source_info['sha256']
                    and Path(sources['path']).stat().st_size == source_info['bytes'], 'source_attachment_mismatch')
            require(acceptance['status'] == 'passed' and acceptance['errors'] == [], 'acceptance_failed')
            # The acceptance driver checks expected exits, including intentional nonzero exits.
            require(acceptance['product'] == identity and acceptance['source'] == product['source']
                    and acceptance['installer_sha256'] == installer['sha256'], 'acceptance_identity_mismatch')
            require(type(acceptance['two_versions']) is bool, 'two_versions_required')
            second = acceptance['second_product']
            if acceptance['two_versions']:
                require(isinstance(second, dict) and second['version'] != product['version']
                        and all(second.get(key) for key in ('closure', 'source', 'installer_sha256')),
                        'distinct_second_version_required')
            else:
                require(second is None, 'unexpected_second_product')
            uncovered = acceptance['not_covered']
            require(isinstance(uncovered, list) and all(isinstance(item, str) and item for item in uncovered),
                    'coverage_required')
            require(review['decision'] == 'accepted' and isinstance(review['reviewer'], str)
                    and review['reviewer'].strip(), 'review_required')
            require(review['commit'] == build['commit'] and review['installer_sha256'] == installer['sha256'],
                    'review_identity_mismatch')
            require(sorted(review['accepted_not_covered']) == sorted(uncovered), 'unacknowledged_coverage')
            manual = checked_reference(review['manual_evidence'])
            require(Path(manual['path']).stat().st_size > 0, 'manual_evidence_empty')
            require(isinstance(review['checks'], list) and review['checks'], 'source_checks_required')
            checks = []
            for item in review['checks']:
                item = checked_reference(item)
                check = read(item['path'])
                require(type(check['schema']) is int and check['schema'] == 1
                        and check['status'] == 'passed' and check['commit'] == build['commit']
                        and type(check['exit_code']) is int and check['exit_code'] == 0
                        and isinstance(check['command'], list) and check['command'], 'source_check_failed')
                for name in ('stdout', 'stderr'):
                    checked_reference(check['logs'][name])
                checks.append(item)
            result.update(status='ready-for-publication-review', commit=build['commit'], product=identity,
                          installer=installer, source_bundle=sources, build=reference(build_path),
                          acceptance=reference(acceptance_path), review=reference(review_path),
                          manual_evidence=manual, checks=checks, reviewer=review['reviewer'],
                          not_covered=uncovered, two_versions=acceptance['two_versions'], second_product=second)
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            result['errors'].append(type(error).__name__ + ':' + str(error))
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    record = commands.add_parser('record-check', help='Run one source check in this clean checkout.')
    record.add_argument('--output', required=True, type=Path)
    record.add_argument('command', nargs=argparse.REMAINDER)
    verify_parser = commands.add_parser('verify', help='Check a candidate and create a local review record.')
    for name in ('candidate', 'acceptance', 'review', 'output'):
        verify_parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        if args.action == 'record-check':
            command = args.command[1:] if args.command[:1] == ['--'] else args.command
            result = record_check(args.output, command)
            for name, target in (('stdout', sys.stdout), ('stderr', sys.stderr)):
                target.write((args.output / (name + '.log')).read_text(encoding='utf-8', errors='replace'))
            code = 0 if result['status'] == 'passed' else (result['exit_code'] or 1)
        else:
            result = verify(args.candidate, args.acceptance, args.review, args.output)
            code = 0 if result['status'] == 'ready-for-publication-review' else 1
        print(json.dumps({'status': result['status'], 'output': str(args.output)}, ensure_ascii=False))
        return code
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print('release_readiness: ' + type(error).__name__ + ':' + str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
