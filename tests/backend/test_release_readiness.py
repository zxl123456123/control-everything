"""Local release evidence contracts; no installer, publishing or network calls."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from tests.backend.test_windows_bundle import BUILD, PayloadFixture, SOURCE
from tools.packaging import release_readiness as readiness


class ReadinessTests(PayloadFixture):
    def save(self, name, value):
        path = self.root / name
        path.write_text(json.dumps(value), encoding='utf-8')
        return path

    def reference(self, path):
        return {'path': str(path), 'sha256': readiness.sha256(path)}

    def setUp(self):
        super().setUp()
        payload, _ = self.payload()
        self.installer = self.root / 'installer.exe'
        self.installer.write_bytes(b'installer fixture')
        sources = self.root / 'session-panel-0.1.0a1-sources.zip'
        sources.write_bytes(b'source fixture')
        self.save('payload/SOURCE-AVAILABILITY.json', {
            'archive': sources.name, 'sha256': readiness.sha256(sources), 'bytes': sources.stat().st_size})
        product = BUILD.write_product_manifest(payload, '0.1.0a1', SOURCE)
        self.identity = {key: product[key] for key in ('version', 'closure')}
        self.build = {'schema': 1, 'status': 'candidate-built-awaiting-acceptance',
                      'commit': SOURCE['commit'], **self.identity,
                      'installer': self.reference(self.installer), 'source_bundle': self.reference(sources),
                      'steps': [{'step': 'fixture', 'exit_code': 0}]}
        self.save('build-receipt.json', self.build)
        self.acceptance = {'schema': 1, 'status': 'passed', 'errors': [], 'source': SOURCE,
                           'installer_sha256': readiness.sha256(self.installer), 'product': self.identity,
                           'two_versions': False, 'second_product': None,
                           'not_covered': ['clean Windows matrix'], 'commands': [{'exit': 2}]}
        self.save('acceptance.json', self.acceptance)
        stdout, stderr = self.root / 'stdout.log', self.root / 'stderr.log'
        stdout.write_bytes(b'check stdout')
        stderr.write_bytes(b'')
        self.check = {'schema': 1, 'status': 'passed', 'commit': SOURCE['commit'],
                      'command': ['python', '-m', 'unittest'], 'exit_code': 0,
                      'logs': {'stdout': self.reference(stdout), 'stderr': self.reference(stderr)}}
        check = self.save('check.json', self.check)
        manual = self.root / 'manual.md'
        manual.write_text('Synthetic reviewer evidence, not a real installation.', encoding='utf-8')
        self.review = {'schema': 1, 'decision': 'accepted', 'reviewer': 'fixture reviewer',
                       'commit': SOURCE['commit'], 'installer_sha256': readiness.sha256(self.installer),
                       'manual_evidence': self.reference(manual), 'checks': [self.reference(check)],
                       'accepted_not_covered': ['clean Windows matrix']}
        self.save('review.json', self.review)

    def verify(self, name='readiness.json'):
        return readiness.verify(self.root, self.root / 'acceptance.json', self.root / 'review.json', self.root / name)

    def test_binds_real_payload_and_evidence_without_claiming_publication(self):
        result = self.verify()
        self.assertEqual(result['status'], 'ready-for-publication-review')
        self.assertEqual(result['product'], self.identity)
        self.assertEqual(result['not_covered'], self.acceptance['not_covered'])
        self.assertEqual(result['acceptance']['sha256'], readiness.sha256(self.root / 'acceptance.json'))
        self.assertEqual(json.loads((self.root / 'readiness.json').read_text()), result)

    def test_rejects_wrong_commit_failed_or_missing_acceptance(self):
        for field, value in [('source', {**SOURCE, 'commit': 'c' * 40}), ('status', 'failed'),
                             ('errors', ['cleanup failed']), ('product', {'version': 'different', 'closure': 'd' * 64})]:
            with self.subTest(field=field):
                self.save('acceptance.json', {**self.acceptance, field: value})
                self.assertEqual(self.verify(field + '.json')['status'], 'blocked')
        (self.root / 'acceptance.json').unlink()
        self.assertEqual(self.verify('missing.json')['status'], 'blocked')

    def test_rejects_changed_installer_sources_payload_and_log(self):
        for index, path in enumerate([self.installer, self.root / 'session-panel-0.1.0a1-sources.zip',
                                      self.root / 'payload/runtime/python.exe', self.root / 'stdout.log']):
            with self.subTest(path=path.name):
                old = path.read_bytes()
                path.write_bytes(old + b'changed')
                self.assertEqual(self.verify(f'changed-{index}.json')['status'], 'blocked')
                path.write_bytes(old)

    def test_rejects_unacknowledged_coverage_empty_checks_or_unbound_manual_evidence(self):
        for field, value in [('accepted_not_covered', []), ('checks', []), ('reviewer', ''),
                             ('decision', 'pending'), ('installer_sha256', '0' * 64),
                             ('manual_evidence', {'path': str(self.root / 'missing.md'), 'sha256': '0' * 64})]:
            with self.subTest(field=field):
                self.save('review.json', {**self.review, field: value})
                self.assertEqual(self.verify(field + '.json')['status'], 'blocked')

    def test_rejects_failed_wrong_commit_or_replaced_check_receipt(self):
        for index, change in enumerate([{'exit_code': 1}, {'commit': 'f' * 40}, {'status': 'failed'}]):
            check = self.save('check.json', {**self.check, **change})
            self.save('review.json', {**self.review, 'checks': [self.reference(check)]})
            self.assertEqual(self.verify(f'check-{index}.json')['status'], 'blocked')
        self.save('review.json', self.review)
        self.assertEqual(self.verify('replaced.json')['status'], 'blocked')

    def test_two_versions_requires_distinct_recorded_versions(self):
        second = {**self.identity, 'closure': 'e' * 64, 'source': SOURCE, 'installer_sha256': 'f' * 64}
        self.save('acceptance.json', {**self.acceptance, 'two_versions': True, 'second_product': second})
        self.assertEqual(self.verify()['status'], 'blocked')

    def test_distinct_versions_keep_complete_second_product_evidence(self):
        second = {'version': '0.1.0a2', 'closure': 'e' * 64, 'source': SOURCE, 'installer_sha256': 'f' * 64}
        self.save('acceptance.json', {**self.acceptance, 'two_versions': True, 'second_product': second})
        result = self.verify()
        self.assertEqual(result['status'], 'ready-for-publication-review')
        self.assertTrue(result['two_versions'])
        self.assertEqual(result['second_product'], second)

    def test_failed_build_steps_and_missing_sources_are_blocked(self):
        self.save('build-receipt.json', {**self.build, 'steps': [{'step': 'installer', 'exit_code': 1}]})
        self.assertEqual(self.verify()['status'], 'blocked')
        self.save('build-receipt.json', self.build)
        (self.root / 'session-panel-0.1.0a1-sources.zip').unlink()
        self.assertEqual(self.verify('missing-sources.json')['status'], 'blocked')

    def test_refuses_overwrite_and_output_inside_payload(self):
        self.verify()
        before = (self.root / 'readiness.json').read_bytes()
        with self.assertRaises(FileExistsError):
            self.verify()
        self.assertEqual((self.root / 'readiness.json').read_bytes(), before)
        with self.assertRaisesRegex(ValueError, 'output_inside_payload'):
            self.verify('payload/readiness.json')


class CheckRecordingTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        (self.root / '.gitignore').write_text('work/\n')
        (self.root / 'source.txt').write_text('source')
        self.git('init', '-q')
        self.git('add', '.')
        self.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture')

    def git(self, *args):
        return subprocess.run(['git', *args], cwd=self.root, capture_output=True, check=True).stdout.decode().strip()

    def test_runs_actual_command_and_preserves_nonzero_evidence(self):
        for code in (0, 7):
            output = self.root / 'work' / str(code)
            result = readiness.record_check(output, [sys.executable, '-c', f'print("evidence"); raise SystemExit({code})'], root=self.root)
            self.assertEqual(result['exit_code'], code)
            self.assertEqual(result['commit'], self.git('rev-parse', 'HEAD'))
            self.assertEqual(result['status'], 'passed' if code == 0 else 'failed')
            self.assertIn('evidence', (output / 'stdout.log').read_text())
            self.assertEqual(json.loads((output / 'receipt.json').read_text()), result)

    def test_dirty_source_stops_before_command_and_changed_source_cannot_pass(self):
        (self.root / 'source.txt').write_text('dirty')
        output = self.root / 'work' / 'dirty'
        with self.assertRaisesRegex(ValueError, 'dirty_source'):
            readiness.record_check(output, [sys.executable, '-c', 'raise SystemExit(99)'], root=self.root)
        self.assertFalse(output.exists())
        (self.root / 'source.txt').write_text('source')
        result = readiness.record_check(output, [sys.executable, '-c', 'from pathlib import Path; Path("source.txt").write_text("changed")'], root=self.root)
        self.assertEqual(result['status'], 'failed')
        self.assertIn('dirty_source', result['error'])

    def test_rejects_existing_output_and_keeps_spawn_failure(self):
        output = self.root / 'work' / 'spawn'
        result = readiness.record_check(output, [str(self.root / 'missing.exe')], root=self.root)
        self.assertEqual(result['status'], 'failed')
        self.assertIsNone(result['exit_code'])
        with self.assertRaises(FileExistsError):
            readiness.record_check(output, [sys.executable, '-c', 'pass'], root=self.root)

    def test_check_output_cannot_escape_work_with_parent_segments(self):
        output = self.root / 'work' / '..' / 'outside'
        with self.assertRaisesRegex(ValueError, 'check_output_must_be_under_work'):
            readiness.record_check(output, [sys.executable, '-c', 'pass'], root=self.root)
        self.assertFalse((self.root / 'outside').exists())
