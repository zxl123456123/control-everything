"""Promote reviewed local assets through a GitHub draft without replacing assets."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from urllib.parse import quote

from control_everything.installation.manifest import no_links, sha256
if __package__:
    from .release_bundle import validate_bundle
    from .release_readiness import checked_reference, read, reference, require
else:
    from release_bundle import validate_bundle
    from release_readiness import checked_reference, read, reference, require


class GitHub:
    """Use the installed CLI and existing Git credential helper, only in memory."""
    def __init__(self, repository):
        self.repository, self.events = repository, []
        self.on_event = lambda: None
        self.env = dict(os.environ, GH_HOST='github.com', GH_REPO=repository,
                        GH_PROMPT_DISABLED='1', GH_NO_UPDATE_NOTIFIER='1',
                        GIT_TERMINAL_PROMPT='0', GCM_INTERACTIVE='Never')
        self.env.pop('GH_DEBUG', None)
        if not (self.env.get('GH_TOKEN') or self.env.get('GITHUB_TOKEN')):
            result = subprocess.run(['git', 'credential', 'fill'], input=b'protocol=https\nhost=github.com\n\n',
                                    env=self.env, capture_output=True, timeout=30)
            values = dict(line.split('=', 1) for line in result.stdout.decode().splitlines() if '=' in line)
            require(result.returncode == 0 and values.get('password'), 'github_credential_unavailable')
            self.env['GH_TOKEN'] = values['password']

    def command(self, label, argv, payload=None, missing=False):
        event = {'operation': label, 'exit_code': None}
        self.events.append(event)
        self.on_event()
        result = subprocess.run(['gh', *argv], input=payload, env=self.env, capture_output=True, timeout=900)
        event['exit_code'] = result.returncode
        self.on_event()
        if missing and result.returncode and b'HTTP 404' in result.stderr:
            return None
        # Do not persist CLI stderr: credential helpers and debug output may contain secrets.
        require(result.returncode == 0, 'github_command_failed:' + label)
        return result.stdout

    def api(self, method, path, body=None, missing=False):
        endpoint = ('repos/' + self.repository + '/' + path).rstrip('/')
        args = ['api', '--hostname', 'github.com', '--method', method, endpoint]
        payload = None
        if body is not None:
            args += ['--input', '-']
            payload = json.dumps(body).encode('utf-8')
        raw = self.command(method + ':' + path, args, payload, missing)
        return json.loads(raw) if raw is not None else None

    def listing(self, path):
        raw = self.command('GET:' + path, ['api', '--hostname', 'github.com', '--method', 'GET',
                           'repos/' + self.repository + '/' + path, '--paginate', '--slurp'])
        return [item for page in json.loads(raw) for item in page]

    def upload(self, tag, path):
        self.command('upload:' + path.name, ['release', 'upload', tag, str(path), '--repo', self.repository])

    def download(self, tag, name, directory):
        self.command('download:' + name, ['release', 'download', tag, '--repo', self.repository,
                                        '--pattern', name, '--dir', str(directory)])


def tag_commit(client, tag):
    ref = client.api('GET', 'git/ref/tags/' + quote(tag, safe=''), missing=True)
    if ref is None:
        return None
    obj = ref['object']
    for _ in range(4):
        if obj['type'] == 'commit':
            return obj['sha']
        require(obj['type'] == 'tag', 'invalid_tag_object')
        obj = client.api('GET', 'git/tags/' + obj['sha'])['object']
    raise ValueError('tag_chain_too_deep')


def remote_assets(client, release_id, expected):
    rows = client.listing(f'releases/{release_id}/assets?per_page=100')
    names = [row['name'] for row in rows]
    require(len(names) == len(set(names)) and set(names).issubset(expected), 'unexpected_remote_assets')
    for row in rows:
        item = expected[row['name']]
        require(row['state'] == 'uploaded' and row['size'] == item['size'], 'remote_asset_size_or_state')
        require(row.get('digest') in (None, 'sha256:' + item['sha256']), 'remote_asset_digest')
    return sorted(({key: row.get(key) for key in ('id', 'name', 'state', 'size', 'digest')}
                   for row in rows), key=lambda row: row['name'])


def reuse_download_directory(source, run_dir, public):
    source = Path(source)
    require(source.is_absolute() and '..' not in source.parts, 'reuse_absolute_path_required')
    source = no_links(source).resolve()
    require(source.parent == run_dir.parent and source != run_dir
            and not source.is_relative_to(public.resolve()), 'reuse_run_scope')
    return source


def prepare_download_reuse(source, current):
    receipt = reference(source / 'result.json')
    previous = read(checked_reference(receipt)['path'])
    require(isinstance(previous, dict) and type(previous.get('schema')) is int and previous['schema'] == 1
            and previous.get('status') == 'failed' and 'reuse_downloads' not in previous,
            'failed_download_source_required')
    require(all(previous.get(key) == current[key] for key in
                ('action', 'repository', 'tag', 'commit', 'plan', 'review', 'content_review', 'assets')),
            'reuse_identity_mismatch')
    require(type(previous.get('release_id')) is int and previous['release_id'] > 0, 'reuse_release_required')
    operations = previous['operations']
    require(isinstance(operations, list) and operations
            and all(isinstance(row, dict) and isinstance(row.get('operation'), str) for row in operations)
            and not any(row['operation'].startswith('reuse-download:') for row in operations), 'reuse_operations')
    downloads = [row for row in operations if row['operation'].startswith('download:')]
    names = [row['name'] for row in current['assets']]
    require(downloads and len(downloads) <= 2 * len(names) and operations[-1] is downloads[-1]
            and [row['operation'] for row in downloads] == ['download:' + name for name in (names * 2)[:len(downloads)]],
            'reuse_download_order')
    last = downloads[-1]
    require('exit_code' in last and all(type(row.get('exit_code')) is int and row['exit_code'] == 0 for row in downloads[:-1])
            and ((type(last.get('exit_code')) is int and last['exit_code'] != 0
                  and previous['errors'] == ['github_command_failed:' + last['operation']])
                 or (last.get('exit_code') is None and previous['errors'] == ['TimeoutExpired'])),
            'download_transport_failure_required')
    files = []
    for index, stage in enumerate(('downloads-before', 'downloads-public')):
        attempted = downloads[index * len(names):(index + 1) * len(names)]
        directory = no_links(source / stage)
        if not attempted:
            require(not directory.exists(), 'reuse_unexpected_stage')
            continue
        children = {file.name: no_links(file) for file in directory.iterdir()}
        require(set(children).issubset(set(names[:len(attempted)]))
                and all(file.is_file() for file in children.values()), 'reuse_download_inventory')
        for offset, event in enumerate(attempted):
            item, completed = current['assets'][offset], event is not last
            if item['name'] not in children:
                require(not completed, 'reuse_completed_download_missing')
                continue
            file = children[item['name']]
            pin, size = reference(file), file.stat().st_size
            require(not completed or (size == item['size'] and pin['sha256'] == item['sha256']),
                    'reuse_completed_download_changed')
            files.append({'stage': stage, 'name': item['name'], 'source': pin, 'size': size, 'reusable': completed})
    checked_reference(receipt)
    return {'receipt': receipt, 'release_id': previous['release_id'], 'files': files,
            'public_stage_attempted': len(downloads) > len(names)}


def check_download_reuse(reuse):
    checked_reference(reuse['receipt'])
    for row in reuse['files']:
        source = checked_reference(row['source'])
        require(Path(source['path']).stat().st_size == row['size'], 'reuse_source_changed')


def verify_downloads(client, plan, expected, directory, reuse=None, remote=()):
    directory.mkdir()
    reusable = {row['name']: row for row in reuse['files']
                if row['reusable'] and row['stage'] == directory.name} if reuse else {}
    digests = {row['name']: row.get('digest') for row in remote}
    require(all(digests.get(name) == 'sha256:' + expected[name]['sha256'] for name in reusable),
            'reuse_remote_digest_required')
    for name, item in expected.items():
        if name in reusable:
            checked_reference(reuse['receipt'])
            source = reusable[name]['source']
            with no_links(Path(source['path'])).open('rb') as incoming, (directory / name).open('xb') as outgoing:
                shutil.copyfileobj(incoming, outgoing)
            client.events.append({'operation': 'reuse-download:' + name, 'stage': directory.name,
                                  'exit_code': 0, 'source': source})
            client.on_event()
        else:
            client.download(plan['tag'], name, directory)
        path = no_links(directory / name)
        require(path.stat().st_size == item['size'] and sha256(path) == item['sha256'], 'download_mismatch:' + name)
    if reuse:
        check_download_reuse(reuse)


def promote(plan_path, review_path, action, run_dir, client=None, reuse_downloads_from=None):
    plan_path, run_dir = no_links(Path(plan_path)), no_links(Path(run_dir)).resolve()
    require(action in ('draft', 'publish'), 'unknown_release_action')
    require(not run_dir.is_relative_to(plan_path.parent / 'public'), 'run_inside_public')
    reuse_source = reuse_download_directory(reuse_downloads_from, run_dir, plan_path.parent / 'public') if reuse_downloads_from else None
    run_dir.mkdir(parents=True, exist_ok=False)
    result = {'schema': 1, 'status': 'failed', 'action': action, 'operations': [], 'errors': []}

    def save():
        (run_dir / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    save()
    try:
        plan = validate_bundle(plan_path)
        review = read(review_path)
        require(review['schema'] == 1 and review['decision'] == 'accepted'
                and isinstance(review['reviewer'], str) and review['reviewer'].strip()
                and review['plan_sha256'] == sha256(plan_path), 'content_review_required')
        evidence = checked_reference(review['evidence'])
        require(Path(evidence['path']).stat().st_size > 0, 'content_review_empty')
        result.update(repository=plan['repository'], tag=plan['tag'], commit=plan['commit'],
                      plan=reference(plan_path), review=reference(review_path), content_review=evidence,
                      assets=plan['assets'])
        public = plan_path.parent / 'public'
        notes = (public / 'release-notes.md').read_text(encoding='utf-8')
        reuse = prepare_download_reuse(reuse_source, result) if reuse_source else None
        if reuse:
            result['reuse_downloads'] = reuse
        client = client or GitHub(plan['repository'])
        result['operations'] = client.events
        client.on_event = save
        comparison = client.api('GET', 'compare/' + plan['commit'] + '...main')
        require(comparison['status'] in ('ahead', 'identical')
                and comparison['merge_base_commit']['sha'] == plan['commit'], 'candidate_not_in_main')
        releases = [row for row in client.listing('releases?per_page=100') if row['tag_name'] == plan['tag']]
        require(len(releases) <= 1, 'ambiguous_release')
        release = releases[0] if releases else None
        require(action == 'draft' or release is not None, 'verified_draft_required')
        target = tag_commit(client, plan['tag'])
        require(target in (None, plan['commit']), 'tag_commit_mismatch')
        if reuse:
            require(release and release['id'] == reuse['release_id'] and target == plan['commit']
                    and (not reuse['public_stage_attempted'] or release['draft'] is False), 'reuse_release_identity')
        if target is None:
            require(action == 'draft' and (release is None or release['draft']), 'existing_tag_required')
            client.api('POST', 'git/refs', {'ref': 'refs/tags/' + plan['tag'], 'sha': plan['commit']})
            require(tag_commit(client, plan['tag']) == plan['commit'], 'created_tag_mismatch')
        if release is None:
            release = client.api('POST', 'releases', {'tag_name': plan['tag'], 'target_commitish': plan['commit'],
                'name': 'Session Panel ' + plan['version'], 'body': notes, 'draft': True,
                'prerelease': plan['prerelease'], 'make_latest': 'false'})
        require(release['tag_name'] == plan['tag'] and release['body'] == notes
                and release['prerelease'] == plan['prerelease'], 'remote_release_identity')
        result.update(release_id=release['id'], release_url=release['html_url'])
        save()
        expected = {item['name']: item for item in plan['assets']}
        rows = remote_assets(client, release['id'], expected)
        present = {row['name'] for row in rows}
        require(not reuse or present == set(expected), 'reuse_remote_assets_incomplete')
        if present != set(expected):
            require(action == 'draft' and release['draft'], 'remote_assets_incomplete')
            for name in sorted(set(expected) - present):
                validate_bundle(plan_path)
                client.upload(plan['tag'], public / name)
        rows = remote_assets(client, release['id'], expected)
        require({row['name'] for row in rows} == set(expected), 'remote_assets_incomplete')
        verify_downloads(client, plan, expected, run_dir / 'downloads-before', reuse, rows)
        if action == 'publish' and release['draft']:
            validate_bundle(plan_path)
            require(tag_commit(client, plan['tag']) == plan['commit'], 'tag_commit_mismatch')
            release = client.api('PATCH', f"releases/{release['id']}", {'draft': False, 'make_latest': 'false'})
        final = client.api('GET', f"releases/{release['id']}")
        require(final['id'] == release['id'] and final['tag_name'] == plan['tag'] and final['body'] == notes
                and final['prerelease'] == plan['prerelease'], 'final_release_identity')
        final_rows = remote_assets(client, release['id'], expected)
        require(final_rows == rows, 'remote_assets_changed')
        require(tag_commit(client, plan['tag']) == plan['commit'], 'final_tag_mismatch')
        result['release_url'] = final['html_url']
        if not final['draft']:
            verify_downloads(client, plan, expected, run_dir / 'downloads-public', reuse, final_rows)
            result['status'] = 'published-verified'
        else:
            require(action == 'draft', 'release_still_draft')
            result['status'] = 'draft-verified'
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        # Retain only categorized errors; subprocess errors can include private arguments.
        result['errors'].append(str(error) if isinstance(error, ValueError) else type(error).__name__)
    finally:
        save()
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('draft', 'publish'))
    for name in ('plan', 'review', 'run-dir'):
        parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--reuse-downloads-from', type=Path, help='Reuse verified downloads from an original failed sibling run.')
    args = parser.parse_args(argv)
    try:
        result = promote(args.plan, args.review, args.action, args.run_dir, reuse_downloads_from=args.reuse_downloads_from)
        print(json.dumps({key: result.get(key) for key in ('status', 'release_id', 'release_url', 'errors')}))
        return 0 if result['status'] in ('draft-verified', 'published-verified') else 1
    except (OSError, ValueError) as error:
        print('release_github: ' + type(error).__name__, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
