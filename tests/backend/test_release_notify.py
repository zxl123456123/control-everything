"""Notification contracts using a fake CLI/API; never send to an external service."""
import copy
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest

from tools.packaging import release_notify as notify


class NotificationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.config = {'repository': 'example/project', 'account': 'father', 'target': 'oc_fixture',
                       'sender_app_id': 'cli_fixture', 'state_dir': str(self.root / 'state'),
                       'openclaw_command': ['fixture-cli']}
        self.event = {'schema': 1, 'status': 'published-verified', 'repository': 'example/project',
                      'release_id': 42, 'tag': 'v0.1.0a2', 'commit': 'a' * 40,
                      'release_url': 'https://github.com/example/project/releases/tag/v0.1.0a2',
                      'assets': [{'name': 'installer.exe', 'size': 12, 'sha256': 'b' * 64}]}
        self.body = 'Session Panel 0.1.0a2\nFixes and limitations\n' + self.event['release_url']
        self.remote = {'id': 42, 'tag_name': self.event['tag'], 'html_url': self.event['release_url'],
                       'draft': False, 'prerelease': True}
        self.assets = [{'name': 'installer.exe', 'size': 12, 'digest': 'sha256:' + 'b' * 64, 'state': 'uploaded'}]
        self.ref = {'object': {'type': 'commit', 'sha': self.event['commit']}}
        self.calls = []
        self.cli = {'action': 'send', 'channel': 'feishu', 'dryRun': False, 'handledBy': 'plugin',
                    'messageId': 'om_fixture', 'payload': {'ok': True, 'messageId': 'om_fixture', 'chatId': 'oc_fixture'}}
        self.read_cli = {'action': 'read', 'channel': 'feishu', 'dryRun': False,
                         'payload': {'ok': True, 'message': {'messageId': 'om_fixture', 'chatId': 'oc_fixture',
                         'senderType': 'app', 'senderId': 'cli_fixture', 'content': self.body}}}
        self.exit_code = 0
        self.raise_cli = None

    def get(self, repository, path):
        self.assertEqual(repository, 'example/project')
        if path == 'releases/42':
            return copy.deepcopy(self.remote)
        if path == 'git/ref/tags/v0.1.0a2':
            return copy.deepcopy(self.ref)
        if path == 'git/tags/' + 'c' * 40:
            return {'object': {'type': 'commit', 'sha': self.event['commit']}}
        if path == 'releases/42/assets?per_page=100&page=1':
            return copy.deepcopy(self.assets)
        raise AssertionError(path)

    def run_cli(self, argv, **kwargs):
        self.calls.append(argv)
        self.assertFalse(kwargs['shell'])
        if self.raise_cli:
            raise self.raise_cli
        value = self.read_cli if 'read' in argv else self.cli
        return subprocess.CompletedProcess(argv, self.exit_code, json.dumps(value), '')

    def execute(self, action='send', **kwargs):
        return notify.execute(action, self.config, self.event, self.body, get=self.get, run=self.run_cli, **kwargs)

    def test_preview_verifies_but_does_not_send_or_create_state(self):
        self.ref['object'] = {'type': 'tag', 'sha': 'c' * 40}
        result = self.execute('preview')
        self.assertEqual(result['status'], 'preview')
        self.assertEqual(result['message'], self.body)
        self.assertFalse(self.calls)
        self.assertFalse((self.root / 'state').exists())

    def test_send_is_fixed_and_a_second_invocation_does_not_send_again(self):
        self.assertEqual(self.execute()['status'], 'sent')
        self.assertEqual(self.execute()['status'], 'sent')
        self.assertEqual(len(self.calls), 1)
        argv = self.calls[0]
        self.assertEqual(argv[argv.index('--account') + 1], 'father')
        self.assertEqual(argv[argv.index('--target') + 1], 'chat:oc_fixture')
        self.assertEqual(argv[argv.index('--message') + 1], self.body)

    def test_core_delivery_shape_is_accepted_with_exact_target(self):
        self.cli.update(handledBy='core', payload={'deliveryStatus': 'sent', 'to': 'chat:oc_fixture',
                                                 'result': {'messageId': 'om_fixture'}})
        self.assertEqual(self.execute()['message_id'], 'om_fixture')

    def test_published_draft_wrong_tag_commit_asset_or_repository_never_sends(self):
        changes = [('remote', 'draft', True), ('ref', 'object', {'type': 'commit', 'sha': 'd' * 40}),
                   ('event', 'repository', 'other/project'), ('event', 'release_url', 'https://example.invalid'),
                   ('remote', 'tag_name', 'other')]
        for obj, key, value in changes:
            with self.subTest(obj=obj, key=key):
                document = getattr(self, obj)
                old = document[key]
                document[key] = value
                with self.assertRaises(ValueError):
                    self.execute()
                document[key] = old
        self.assets[0]['digest'] = None
        with self.assertRaises(ValueError):
            self.execute()
        self.assertFalse(self.calls)

    def test_unknown_result_is_persisted_and_never_automatically_retried(self):
        self.raise_cli = subprocess.TimeoutExpired(['fixture-cli'], 60)
        self.assertEqual(self.execute()['status'], 'unknown')
        self.raise_cli = None
        self.assertEqual(self.execute()['status'], 'unknown')
        self.assertEqual(len(self.calls), 1)

    def test_other_oserror_does_not_get_the_not_started_retry_exception(self):
        self.raise_cli = OSError('unspecified operating system failure')
        self.assertEqual(self.execute()['status'], 'unknown')
        self.raise_cli = None
        self.assertEqual(self.execute()['status'], 'unknown')
        self.assertEqual(len(self.calls), 1)

    def test_cli_not_started_can_retry_after_missing_or_denied_executable_is_fixed(self):
        for index, error in enumerate((FileNotFoundError('missing fixture'), PermissionError('denied fixture'))):
            with self.subTest(error=type(error).__name__):
                self.config['state_dir'] = str(self.root / f'not-started-{index}')
                self.calls.clear()
                self.raise_cli = error
                self.assertEqual(self.execute()['status'], 'not-sent')
                self.raise_cli = None
                sent = self.execute()
                self.assertEqual(sent['status'], 'sent')
                self.assertEqual(sent['not_sent_attempts'][0]['error'], type(error).__name__)
                self.assertEqual(self.execute()['status'], 'sent')
                self.assertEqual(len(self.calls), 2)

    def test_concurrent_retry_of_not_started_command_claims_only_once(self):
        self.raise_cli = FileNotFoundError('missing fixture')
        self.assertEqual(self.execute()['status'], 'not-sent')
        self.raise_cli = None
        entered, release = threading.Event(), threading.Event()
        def waiting_cli(argv, **kwargs):
            entered.set()
            self.assertTrue(release.wait(5))
            return self.run_cli(argv, **kwargs)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(notify.execute, 'send', self.config, self.event, self.body,
                                get=self.get, run=waiting_cli)
            self.assertTrue(entered.wait(5))
            try:
                self.assertEqual(self.execute()['status'], 'attempt')
            finally:
                release.set()
            self.assertEqual(first.result()['status'], 'sent')
        self.assertEqual(len(self.calls), 2)

    def test_nonzero_partial_delivery_keeps_id_but_is_unknown(self):
        self.exit_code = 1
        self.cli.update(ok=False, sentBeforeError=True)
        result = self.execute()
        self.assertEqual(result['status'], 'unknown')
        self.assertEqual(result['message_id'], 'om_fixture')

    def test_wrong_target_dry_run_or_malformed_json_cannot_be_marked_sent(self):
        original = copy.deepcopy(self.cli)
        for index, change in enumerate([{'payload': {'ok': True, 'messageId': 'om_fixture', 'chatId': 'oc_other'}},
                                        {'dryRun': True}, {'messageId': 'unknown'}]):
            with self.subTest(change=change):
                self.config['state_dir'] = str(self.root / f'state-{index}')
                self.cli = {**original, **change}
                self.assertEqual(self.execute()['status'], 'unknown')
        self.config['state_dir'] = str(self.root / 'malformed')
        result = notify.execute('send', self.config, self.event, self.body, get=self.get,
                                run=lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, 'invalid json', ''))
        self.assertEqual(result['status'], 'unknown')

    def test_changed_body_for_same_delivery_is_rejected(self):
        self.execute()
        self.body += '\nChanged announcement'
        with self.assertRaisesRegex(ValueError, 'body_changed'):
            self.execute()
        self.assertEqual(len(self.calls), 1)

    def test_changed_release_assets_do_not_reuse_an_old_delivery_receipt(self):
        self.execute()
        self.event['assets'][0]['sha256'] = 'd' * 64
        self.assets[0]['digest'] = 'sha256:' + 'd' * 64
        with self.assertRaisesRegex(ValueError, 'release_changed'):
            self.execute()
        self.assertEqual(len(self.calls), 1)

    def test_reconcile_reads_real_cli_message_and_checks_sender_body_and_group(self):
        self.raise_cli = OSError('fixture failure')
        self.execute()
        self.raise_cli = None
        self.read_cli['payload']['message']['senderId'] = 'cli_other'
        self.assertEqual(self.execute('reconcile', message_id='om_fixture')['status'], 'unknown')
        self.read_cli['payload']['message']['senderId'] = 'cli_fixture'
        self.assertEqual(self.execute('reconcile', message_id='om_fixture')['status'], 'sent')
        self.assertEqual(sum('send' in call for call in self.calls), 1)

    def test_interrupted_sender_leaves_attempt_and_is_not_retried(self):
        def interrupted(argv, **kwargs):
            raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            notify.execute('send', self.config, self.event, self.body, get=self.get, run=interrupted)
        self.assertEqual(self.execute()['status'], 'attempt')
        self.assertFalse(self.calls)

    def test_concurrent_sends_only_claim_once(self):
        entered, release = threading.Event(), threading.Event()
        def waiting_cli(argv, **kwargs):
            entered.set()
            self.assertTrue(release.wait(5))
            return self.run_cli(argv, **kwargs)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(notify.execute, 'send', self.config, self.event, self.body,
                                get=self.get, run=waiting_cli)
            self.assertTrue(entered.wait(5))
            try:
                self.assertEqual(self.execute()['status'], 'attempt')
            finally:
                release.set()
            self.assertEqual(first.result()['status'], 'sent')
        self.assertEqual(len(self.calls), 1)

    def test_process_exit_after_persisted_claim_survives_new_process(self):
        script = self.root / 'crash.py'
        source_root = Path(__file__).resolve().parents[2]
        code = ('import os,sys\n' + f'sys.path.insert(0,{str(source_root)!r})\n'
                'from tools.packaging import release_notify as n\n'
                + f'config={self.config!r}\nevent={self.event!r}\nbody={self.body!r}\n'
                + f'data={{"releases/42":{self.remote!r},"git/ref/tags/v0.1.0a2":{self.ref!r},'
                + f'"releases/42/assets?per_page=100&page=1":{self.assets!r}}}\n'
                'n.execute("send",config,event,body,get=lambda repo,path:data[path],run=lambda *a,**k:os._exit(23))\n')
        script.write_text(code, encoding='utf-8')
        process = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
        self.assertEqual(process.returncode, 23, process.stderr)
        self.assertEqual(self.execute()['status'], 'attempt')
        self.assertFalse(self.calls)

    def test_real_fake_cli_process_receives_fixed_arguments(self):
        script = self.root / 'fake_cli.py'
        self.body += '\nLiteral "quotes" and $(not-a-command)'
        arguments = ['message', 'send', '--channel', 'feishu', '--account', 'father',
                     '--target', 'chat:oc_fixture', '--json', '--message', self.body]
        script.write_text('import sys\nassert sys.argv[1:] == ' + repr(arguments)
                          + '\nprint(' + repr(json.dumps(self.cli)) + ')\n', encoding='utf-8')
        self.config['openclaw_command'] = [sys.executable, str(script)]
        result = notify.execute('send', self.config, self.event, self.body, get=self.get)
        self.assertEqual(result['status'], 'sent')
