"""Promote reviewed local assets through a GitHub draft without replacing assets."""
import argparse
import json
import os
from pathlib import Path
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


def verify_downloads(client, plan, expected, directory):
    directory.mkdir()
    for name, item in expected.items():
        client.download(plan['tag'], name, directory)
        path = no_links(directory / name)
        require(path.stat().st_size == item['size'] and sha256(path) == item['sha256'], 'download_mismatch:' + name)


def promote(plan_path, review_path, action, run_dir, client=None):
    plan_path, run_dir = no_links(Path(plan_path)), no_links(Path(run_dir)).resolve()
    require(action in ('draft', 'publish'), 'unknown_release_action')
    require(not run_dir.is_relative_to(plan_path.parent / 'public'), 'run_inside_public')
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
        if present != set(expected):
            require(action == 'draft' and release['draft'], 'remote_assets_incomplete')
            for name in sorted(set(expected) - present):
                validate_bundle(plan_path)
                client.upload(plan['tag'], public / name)
        rows = remote_assets(client, release['id'], expected)
        require({row['name'] for row in rows} == set(expected), 'remote_assets_incomplete')
        verify_downloads(client, plan, expected, run_dir / 'downloads-before')
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
            verify_downloads(client, plan, expected, run_dir / 'downloads-public')
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
    args = parser.parse_args(argv)
    try:
        result = promote(args.plan, args.review, args.action, args.run_dir)
        print(json.dumps({key: result.get(key) for key in ('status', 'release_id', 'release_url', 'errors')}))
        return 0 if result['status'] in ('draft-verified', 'published-verified') else 1
    except (OSError, ValueError) as error:
        print('release_github: ' + type(error).__name__, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
