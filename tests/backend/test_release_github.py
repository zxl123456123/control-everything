"""Release promotion contracts with a simulated GitHub and real local asset bytes."""
import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from tools.packaging import release_github as publish


class GitHubCliTests(unittest.TestCase):
    def test_api_uses_canonical_endpoint_and_passes_json_as_stdin(self):
        with patch.dict(os.environ, {'GH_TOKEN': 'fixture-token', 'GH_DEBUG': 'api'}):
            client = publish.GitHub('example/project')
        result = subprocess.CompletedProcess([], 0, b'{}', b'')
        with patch.object(subprocess, 'run', return_value=result) as run:
            client.api('GET', '')
            self.assertEqual(run.call_args.args[0][-1], 'repos/example/project')
            body = {'body': 'Literal $(value) and `quotes`'}
            client.api('POST', 'releases', body)
            self.assertEqual(json.loads(run.call_args.kwargs['input']), body)
            self.assertNotIn('GH_DEBUG', run.call_args.kwargs['env'])
            self.assertNotIn('fixture-token', json.dumps(client.events))

    def test_only_not_found_is_treated_as_missing(self):
        with patch.dict(os.environ, {'GH_TOKEN': 'fixture-token'}):
            client = publish.GitHub('example/project')
        with patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, b'', b'HTTP 404')):
            self.assertIsNone(client.api('GET', 'git/ref/tags/v1', missing=True))
        with patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, b'', b'HTTP 403')):
            with self.assertRaisesRegex(ValueError, 'github_command_failed'):
                client.api('GET', 'git/ref/tags/v1', missing=True)


class GitHubFixture:
    def __init__(self, plan, public):
        self.plan, self.public = plan, public
        self.release = None
        self.tag_commit = None
        self.main_status = 'ahead'
        self.assets = []
        self.mutations = []
        self.events = []
        self.fail_upload = False
        self.bad_download = False
        self.fail_download = None
        self.downloads = []
        self.before_download = lambda: None

    def api(self, method, path, body=None, missing=False):
        if path.startswith('compare/'):
            return {'status': self.main_status, 'merge_base_commit': {'sha': self.plan['commit']}}
        if path.startswith('git/ref/tags/'):
            return {'object': {'type': 'commit', 'sha': self.tag_commit}} if self.tag_commit else None
        if method == 'POST' and path == 'git/refs':
            self.mutations.append('tag')
            self.tag_commit = body['sha']
            return {'object': {'type': 'commit', 'sha': self.tag_commit}}
        if method == 'POST' and path == 'releases':
            self.mutations.append('draft')
            self.release = {'id': 42, 'html_url': 'https://github.com/example/project/releases/tag/untagged-fixture', **body}
            return copy.deepcopy(self.release)
        if method == 'PATCH' and path == 'releases/42':
            self.mutations.append('publish')
            self.release.update(body)
            self.release['html_url'] = 'https://github.com/example/project/releases/tag/' + self.plan['tag']
            return copy.deepcopy(self.release)
        if method == 'GET' and path == 'releases/42':
            return copy.deepcopy(self.release)
        raise AssertionError((method, path))

    def listing(self, path):
        return copy.deepcopy(self.assets if '/assets?' in path else ([self.release] if self.release else []))

    def upload(self, tag, path):
        if self.fail_upload:
            raise ValueError('fixture_upload_interrupted')
        self.mutations.append('upload:' + path.name)
        self.assets.append({'id': len(self.assets) + 1, 'name': path.name, 'state': 'uploaded',
                            'size': path.stat().st_size, 'digest': 'sha256:' + publish.sha256(path)})

    def download(self, tag, name, directory):
        self.downloads.append((directory.name, name))
        event = {'operation': 'download:' + name, 'exit_code': None}
        self.events.append(event)
        self.on_event()
        self.before_download()
        if self.fail_download == (directory.name, name):
            (directory / name).write_bytes(b'partial')
            event['exit_code'] = 1
            self.on_event()
            raise ValueError('github_command_failed:download:' + name)
        data = (self.public / name).read_bytes()
        (directory / name).write_bytes(data + b'bad' if self.bad_download else data)
        event['exit_code'] = 0
        self.on_event()
        for asset in self.assets:
            if asset['name'] == name:
                asset['download_count'] = asset.get('download_count', 0) + 1


class PublishingTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.public = self.root / 'public'
        self.public.mkdir()
        for name, data in [('installer.exe', b'installer'), ('release-notes.md', b'Reviewed release notes\n')]:
            (self.public / name).write_bytes(data)
        self.plan = {'schema': 1, 'repository': 'example/project', 'version': '0.1.0a2', 'tag': 'v0.1.0a2',
                     'commit': 'a' * 40, 'prerelease': True,
                     'assets': [{'name': p.name, 'size': p.stat().st_size, 'sha256': publish.sha256(p)}
                                for p in sorted(self.public.iterdir())]}
        self.plan_path = self.root / 'publication.json'
        self.plan_path.write_text(json.dumps(self.plan))
        evidence = self.root / 'content-review.md'
        evidence.write_text('Fixture content review; no real release.')
        self.review = {'schema': 1, 'decision': 'accepted', 'reviewer': 'fixture reviewer',
                       'plan_sha256': publish.sha256(self.plan_path),
                       'evidence': {'path': str(evidence), 'sha256': publish.sha256(evidence)}}
        self.review_path = self.root / 'review.json'
        self.review_path.write_text(json.dumps(self.review))
        self.client = GitHubFixture(self.plan, self.public)
        self.validation = patch.object(publish, 'validate_bundle', return_value=self.plan)
        self.validation.start()
        self.addCleanup(self.validation.stop)

    def run_stage(self, stage, name, **options):
        self.client.events = []
        return publish.promote(self.plan_path, self.review_path, stage, self.root / name, self.client, **options)

    def failed_download_run(self, stage='downloads-public'):
        self.assertEqual(self.run_stage('draft', 'draft')['status'], 'draft-verified')
        self.client.fail_download = (stage, self.plan['assets'][-1]['name'])
        self.assertEqual(self.run_stage('publish', 'failed')['status'], 'failed')
        self.client.fail_download = None
        self.client.downloads.clear()
        return self.root / 'failed'

    def test_recovery_reuses_each_stage_and_redownloads_only_partial(self):
        previous = self.failed_download_run()
        original = {str(p.relative_to(previous)): p.read_bytes() for p in previous.rglob('*') if p.is_file()}
        mutations = list(self.client.mutations)
        result = self.run_stage('publish', 'resume', reuse_downloads_from=previous)
        self.assertEqual(result['status'], 'published-verified')
        self.assertEqual(self.client.downloads, [('downloads-public', self.plan['assets'][-1]['name'])])
        self.assertEqual(self.client.mutations, mutations)
        self.assertEqual(result['reuse_downloads']['receipt']['sha256'], publish.sha256(previous / 'result.json'))
        reused = [row for row in result['operations'] if row['operation'].startswith('reuse-download:')]
        self.assertEqual([row['stage'] for row in reused], ['downloads-before'] * 2 + ['downloads-public'])
        self.assertEqual(original, {str(p.relative_to(previous)): p.read_bytes() for p in previous.rglob('*') if p.is_file()})

    def test_recovery_never_uses_before_bytes_as_public_downloads(self):
        previous = self.failed_download_run('downloads-before')
        result = self.run_stage('publish', 'resume', reuse_downloads_from=previous)
        self.assertEqual(result['status'], 'published-verified')
        self.assertEqual(self.client.downloads, [('downloads-before', self.plan['assets'][-1]['name']),
                         *[('downloads-public', item['name']) for item in self.plan['assets']]])

    def test_recovery_rejects_mismatched_identity_or_successful_source(self):
        previous = self.failed_download_run()
        path = previous / 'result.json'
        original = json.loads(path.read_bytes())
        for field, value in [('plan', {'path': str(self.plan_path), 'sha256': 'f' * 64}),
                             ('review', {'path': str(self.review_path), 'sha256': 'f' * 64}),
                             ('commit', 'b' * 40), ('release_id', 99), ('status', 'published-verified')]:
            with self.subTest(field=field):
                changed = {**original, field: value}
                path.write_text(json.dumps(changed))
                result = self.run_stage('publish', 'bad-' + field, reuse_downloads_from=previous)
                self.assertEqual(result['status'], 'failed')
                self.assertEqual(self.client.downloads, [])

    def test_recovery_rejects_changed_or_missing_completed_files(self):
        previous = self.failed_download_run()
        path = previous / 'downloads-before' / self.plan['assets'][0]['name']
        path.write_bytes(b'changed')
        self.assertEqual(self.run_stage('publish', 'changed', reuse_downloads_from=previous)['status'], 'failed')
        path.unlink()
        self.assertEqual(self.run_stage('publish', 'missing', reuse_downloads_from=previous)['status'], 'failed')
        self.assertEqual(self.client.downloads, [])

    def test_recovery_requires_current_remote_digest_for_reused_bytes(self):
        previous = self.failed_download_run()
        for index, digest in enumerate((None, 'sha256:' + 'f' * 64)):
            with self.subTest(digest=digest):
                self.client.assets[0]['digest'] = digest
                self.assertEqual(self.run_stage('publish', 'digest-' + str(index), reuse_downloads_from=previous)['status'], 'failed')
                self.assertEqual(self.client.downloads, [])

    def test_recovery_rejects_wrong_download_order_and_non_download_failure(self):
        previous = self.failed_download_run()
        path = previous / 'result.json'
        original = json.loads(path.read_bytes())
        changed = copy.deepcopy(original)
        changed['operations'][0], changed['operations'][1] = changed['operations'][1], changed['operations'][0]
        path.write_text(json.dumps(changed))
        self.assertEqual(self.run_stage('publish', 'order', reuse_downloads_from=previous)['status'], 'failed')
        original['errors'] = ['download_mismatch:' + self.plan['assets'][-1]['name']]
        path.write_text(json.dumps(original))
        self.assertEqual(self.run_stage('publish', 'other-failure', reuse_downloads_from=previous)['status'], 'failed')

    def test_recovery_rejects_old_receipt_changes_during_download(self):
        previous = self.failed_download_run()
        self.client.before_download = lambda: (previous / 'result.json').write_bytes(b'changed')
        result = self.run_stage('publish', 'changed-old', reuse_downloads_from=previous)
        self.assertEqual(result['status'], 'failed')

    def test_recovery_rejects_outside_same_nested_or_public_source_runs(self):
        previous = self.failed_download_run()
        for index, path in enumerate((previous / 'downloads-before', self.public, self.root.parent, self.root / 'same')):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, 'reuse_run_scope'):
                self.run_stage('publish', 'same' if path.name == 'same' else 'scope-' + str(index), reuse_downloads_from=path)

    def test_recovery_rejects_new_run_inside_old_before_writing(self):
        previous = self.failed_download_run()
        try:
            self.run_stage('publish', 'failed/nested', reuse_downloads_from=previous)
        except ValueError:
            pass
        self.assertFalse((previous / 'nested').exists())

    def test_recovery_requires_integer_success_and_allows_only_tail_timeout(self):
        previous = self.failed_download_run()
        path = previous / 'result.json'
        original = json.loads(path.read_bytes())
        for index, invalid in enumerate((False, None)):
            changed = copy.deepcopy(original)
            changed['operations'][0]['exit_code'] = invalid
            path.write_text(json.dumps(changed))
            self.assertEqual(self.run_stage('publish', 'invalid-exit-' + str(index), reuse_downloads_from=previous)['status'], 'failed')
        original['operations'][-1]['exit_code'] = None
        original['errors'] = ['TimeoutExpired']
        missing = copy.deepcopy(original)
        missing['operations'][-1].pop('exit_code')
        path.write_text(json.dumps(missing))
        self.assertEqual(self.run_stage('publish', 'missing-exit', reuse_downloads_from=previous)['status'], 'failed')
        path.write_text(json.dumps(original))
        self.assertEqual(self.run_stage('publish', 'timeout-resume', reuse_downloads_from=previous)['status'], 'published-verified')

    def test_recovery_redownloads_failed_operation_even_when_bytes_are_complete(self):
        previous = self.failed_download_run()
        name = self.plan['assets'][-1]['name']
        partial = previous / 'downloads-public' / name
        partial.write_bytes((self.public / name).read_bytes())
        result = self.run_stage('publish', 'resume', reuse_downloads_from=previous)
        self.assertEqual(result['status'], 'published-verified')
        self.assertEqual(self.client.downloads, [('downloads-public', name)])
        self.assertEqual(partial.read_bytes(), (self.public / name).read_bytes())

    def test_draft_then_publish_verifies_assets_and_records_same_release(self):
        first = self.run_stage('draft', 'draft')
        self.assertEqual(first['status'], 'draft-verified')
        self.assertTrue(self.client.release['draft'])
        second = self.run_stage('publish', 'publish')
        self.assertEqual(second['status'], 'published-verified')
        self.assertEqual(second['release_url'], 'https://github.com/example/project/releases/tag/v0.1.0a2')
        self.assertEqual(second['release_id'], first['release_id'])
        self.assertEqual(self.client.mutations.count('draft'), 1)
        self.assertEqual(self.client.mutations.count('publish'), 1)
        mutations = list(self.client.mutations)
        self.assertEqual(self.run_stage('publish', 'repeat')['status'], 'published-verified')
        self.assertEqual(self.client.mutations, mutations)

    def test_interrupted_upload_resumes_without_recreating_or_overwriting(self):
        self.client.fail_upload = True
        self.assertEqual(self.run_stage('draft', 'failed')['status'], 'failed')
        self.client.fail_upload = False
        self.client.upload(self.plan['tag'], self.public / 'installer.exe')
        self.assertEqual(self.run_stage('draft', 'resume')['status'], 'draft-verified')
        self.assertEqual(self.client.mutations.count('upload:installer.exe'), 1)
        self.assertEqual(self.client.mutations.count('tag'), 1)

    def test_tag_mismatch_or_source_outside_main_stops_before_mutations(self):
        self.client.tag_commit = 'b' * 40
        self.assertEqual(self.run_stage('draft', 'wrong-tag')['status'], 'failed')
        self.client.tag_commit = None
        self.client.main_status = 'behind'
        self.assertEqual(self.run_stage('draft', 'not-main')['status'], 'failed')
        self.assertEqual(self.client.mutations, [])

    def test_remote_asset_mismatch_or_unknown_asset_never_overwrites(self):
        self.run_stage('draft', 'first')
        before = list(self.client.mutations)
        self.client.assets[0]['digest'] = 'sha256:' + 'f' * 64
        self.assertEqual(self.run_stage('publish', 'wrong-hash')['status'], 'failed')
        self.assertEqual(self.client.mutations, before)


    def test_bad_download_blocks_publication_and_keeps_draft(self):
        self.client.bad_download = True
        self.assertEqual(self.run_stage('draft', 'bad')['status'], 'failed')
        self.assertTrue(self.client.release['draft'])
        self.assertNotIn('publish', self.client.mutations)

    def test_unreviewed_plan_and_missing_draft_cannot_publish(self):
        self.assertEqual(self.run_stage('publish', 'no-draft')['status'], 'failed')
        self.assertEqual(self.client.mutations, [])
        self.review['plan_sha256'] = '0' * 64
        self.review_path.write_text(json.dumps(self.review))
        self.assertEqual(self.run_stage('draft', 'review-mismatch')['status'], 'failed')
        self.assertEqual(self.client.mutations, [])

    def test_published_release_with_missing_assets_is_never_modified(self):
        self.run_stage('draft', 'first')
        self.client.release['draft'] = False
        self.client.assets.pop()
        before = list(self.client.mutations)
        self.assertEqual(self.run_stage('publish', 'missing')['status'], 'failed')
        self.assertEqual(self.client.mutations, before)

    def test_existing_run_directory_and_changed_notes_are_rejected(self):
        self.run_stage('draft', 'first')
        with self.assertRaises(FileExistsError):
            self.run_stage('draft', 'first')
        self.client.release['body'] = 'different release'
        before = list(self.client.mutations)
        self.assertEqual(self.run_stage('publish', 'changed')['status'], 'failed')
        self.assertEqual(self.client.mutations, before)


class DeliveryIntegrationTests(unittest.TestCase):
    def test_accepted_bundle_reaches_one_notification_without_mocking_local_validation(self):
        from tests.backend import test_release_bundle
        from tools.packaging import release_notify
        fixture = test_release_bundle.BundleTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        plan = fixture.prepare()
        plan_path = fixture.output / 'publication.json'
        evidence = fixture.root / 'content-review.md'
        evidence.write_text('Synthetic reviewed public fixture.')
        review_path = fixture.root / 'publication-review.json'
        review_path.write_text(json.dumps({'schema': 1, 'decision': 'accepted', 'reviewer': 'fixture reviewer',
            'plan_sha256': publish.sha256(plan_path), 'evidence': {'path': str(evidence), 'sha256': publish.sha256(evidence)}}))
        client = GitHubFixture(plan, fixture.output / 'public')
        draft = publish.promote(plan_path, review_path, 'draft', fixture.root / 'draft', client)
        self.assertEqual(draft['status'], 'draft-verified')
        event = publish.promote(plan_path, review_path, 'publish', fixture.root / 'published', client)
        self.assertEqual(event['status'], 'published-verified')
        config = {'repository': 'example/project', 'target': 'oc_fixture', 'account': 'fixture',
                  'state_dir': str(fixture.root / 'notifications'), 'openclaw_command': ['fixture-cli']}
        message = 'Verified fixture release\n' + event['release_url']
        calls = []
        def get(repository, path):
            return client.listing(path) if '/assets?' in path else client.api('GET', path)
        def run(argv, **kwargs):
            calls.append(argv)
            response = {'action': 'send', 'channel': 'feishu', 'dryRun': False, 'handledBy': 'plugin',
                        'messageId': 'om_fixture', 'payload': {'ok': True, 'chatId': 'oc_fixture', 'messageId': 'om_fixture'}}
            return subprocess.CompletedProcess(argv, 0, json.dumps(response), '')
        for _ in range(2):
            result = release_notify.execute('send', config, event, message, get=get, run=run)
            self.assertEqual(result['status'], 'sent')
        self.assertEqual(len(calls), 1)
