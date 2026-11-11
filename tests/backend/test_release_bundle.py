"""Prepare public bytes from real synthetic readiness evidence; never publish."""
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

from tests.backend import test_release_readiness as readiness_tests
from tests.backend.test_windows_bundle import BUILD, SOURCE
from tools.packaging import release_bundle as bundle


class BundleTests(unittest.TestCase):
    def setUp(self):
        self.fixture = readiness_tests.ReadinessTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        self.output = self.root / 'publication'
        self.notes = self.root / 'notes.md'
        self.notes.write_text('# Release notes\n\nSynthetic installation evidence only.\n', encoding='utf-8')
        for name in ('LICENSE', 'DESKTOP-NOTICES.json'):
            (self.root / 'payload' / name).write_text('fixture notice\n', encoding='utf-8')
        self.set_version('0.1.0a1')

    def set_version(self, version):
        f = self.fixture
        archive = self.root / f'session-panel-{version}-sources.zip'
        archive.write_bytes(b'source fixture')
        f.save('payload/SOURCE-AVAILABILITY.json', {'archive': archive.name,
               'sha256': bundle.sha256(archive), 'bytes': archive.stat().st_size})
        product = BUILD.write_product_manifest(self.root / 'payload', version, SOURCE)
        f.identity = {key: product[key] for key in ('version', 'closure')}
        f.build.update(**f.identity, source_bundle=f.reference(archive))
        f.save('build-receipt.json', f.build)
        f.acceptance['product'] = f.identity
        f.save('acceptance.json', f.acceptance)
        self.readiness = self.root / ('ready-' + version + '.json')
        result = f.verify(self.readiness.name)
        self.assertEqual(result['status'], 'ready-for-publication-review')

    def prepare(self):
        return bundle.prepare(self.readiness, self.notes, self.output, 'example/project')

    def test_prepares_exact_public_files_and_verifiable_checksums(self):
        result = self.prepare()
        self.assertEqual(result['status'], 'prepared-awaiting-content-review')
        self.assertEqual(result['repository'], 'example/project')
        self.assertEqual(result['tag'], 'v0.1.0a1')
        self.assertIs(result['prerelease'], True)
        self.assertEqual(len(result['assets']), 11)
        public = self.output / 'public'
        self.assertEqual(set(p.name for p in public.iterdir()), {row['name'] for row in result['assets']})
        self.assertFalse((public / 'publication.json').exists())
        self.assertFalse((public / 'readiness-recheck.json').exists())
        self.assertEqual((public / 'release-notes.md').read_bytes(), self.notes.read_bytes())
        self.assertEqual(bundle.validate_bundle(self.output / 'publication.json'), result)
        checksums = (public / 'SHA256SUMS.txt').read_text().splitlines()
        self.assertEqual(len(checksums), 10)
        self.assertFalse(any(line.endswith('SHA256SUMS.txt') for line in checksums))

    def test_stable_product_keeps_pep440_tag_and_channel(self):
        self.set_version('0.1.0')
        result = self.prepare()
        self.assertEqual(result['tag'], 'v0.1.0')
        self.assertIs(result['prerelease'], False)
        self.assertEqual(bundle.validate_bundle(self.output / 'publication.json'), result)

    def test_old_ready_status_cannot_hide_changed_checks_or_payload(self):
        for index, path in enumerate([self.root / 'stdout.log', self.root / 'payload/runtime/python.exe']):
            with self.subTest(path=path.name):
                before = path.read_bytes()
                path.write_bytes(before + b'changed')
                result = bundle.prepare(self.readiness, self.notes, self.root / f'changed-{index}', 'example/project')
                self.assertEqual(result['status'], 'blocked')
                self.assertTrue(result['errors'])
                self.assertEqual(list((self.root / f'changed-{index}' / 'public').glob('*')), [])
                path.write_bytes(before)

    def test_blank_or_invalid_utf8_notes_never_produce_ready_bundle(self):
        for index, content in enumerate([b' \n', b'\xff']):
            self.notes.write_bytes(content)
            result = bundle.prepare(self.readiness, self.notes, self.root / f'notes-{index}', 'example/project')
            self.assertEqual(result['status'], 'blocked')

    def test_changed_file_after_recheck_is_not_rehashed_into_a_new_candidate(self):
        real_verify = bundle.readiness.verify
        for index, file in enumerate([self.fixture.installer, self.root / 'payload/THIRD-PARTY-NOTICES.txt']):
            before = file.read_bytes()
            def change_after_verify(*args):
                result = real_verify(*args)
                file.write_bytes(before + b'changed after acceptance')
                return result
            with patch.object(bundle.readiness, 'verify', side_effect=change_after_verify):
                result = bundle.prepare(self.readiness, self.notes, self.root / f'race-{index}', 'example/project')
            self.assertEqual(result['status'], 'blocked')
            file.write_bytes(before)

    def test_output_is_never_overwritten_or_created_inside_payload(self):
        self.prepare()
        original = (self.output / 'publication.json').read_bytes()
        with self.assertRaises(FileExistsError):
            self.prepare()
        self.assertEqual((self.output / 'publication.json').read_bytes(), original)
        with self.assertRaisesRegex(ValueError, 'output_inside_payload'):
            bundle.prepare(self.readiness, self.notes, self.root / 'payload/publication', 'example/project')
        self.assertFalse((self.root / 'payload/publication').exists())

    def test_partial_copy_is_retained_but_never_validated_as_ready(self):
        real_copy = bundle.shutil.copyfileobj
        calls = 0
        def fail_second(source, target):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError('fixture copy stopped')
            real_copy(source, target)
        with patch.object(bundle.shutil, 'copyfileobj', side_effect=fail_second):
            result = self.prepare()
        self.assertEqual(result['status'], 'blocked')
        self.assertTrue((self.output / 'public').is_dir())
        self.assertGreater(len(list((self.output / 'public').iterdir())), 0)
        with self.assertRaises(ValueError):
            bundle.validate_bundle(self.output / 'publication.json')

    def test_validation_rejects_extra_or_changed_files_and_wrong_tag(self):
        self.prepare()
        plan = self.output / 'publication.json'
        public = self.output / 'public'
        extra = public / 'private.json'
        extra.write_text('private')
        with self.assertRaises(ValueError):
            bundle.validate_bundle(plan)
        extra.unlink()
        notes = public / 'release-notes.md'
        before = notes.read_bytes()
        notes.write_bytes(before + b'changed')
        with self.assertRaises(ValueError):
            bundle.validate_bundle(plan)
        notes.write_bytes(before)
        data = json.loads(plan.read_text())
        data['tag'] = 'v9.0.0'
        plan.write_text(json.dumps(data))
        with self.assertRaises(ValueError):
            bundle.validate_bundle(plan)

    def test_direct_cli_checks_prepared_bundle(self):
        self.prepare()
        script = Path(__file__).resolve().parents[2] / 'tools/packaging/release_bundle.py'
        result = subprocess.run([sys.executable, str(script), 'check', '--plan', str(self.output / 'publication.json')],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['status'], 'prepared-awaiting-content-review')

    def test_validation_requires_both_matching_readiness_references(self):
        original = self.prepare()
        plan_path = self.output / 'publication.json'
        for field in ('readiness', 'readiness_recheck'):
            with self.subTest(missing=field):
                changed = dict(original)
                del changed[field]
                plan_path.write_text(json.dumps(changed))
                with self.assertRaises(ValueError):
                    bundle.validate_bundle(plan_path)
        alternate = json.loads(self.readiness.read_text())
        alternate['commit'] = 'f' * 40
        alternate_path = self.fixture.save('alternate-ready.json', alternate)
        changed = {**original, 'readiness': self.fixture.reference(alternate_path)}
        plan_path.write_text(json.dumps(changed))
        with self.assertRaises(ValueError):
            bundle.validate_bundle(plan_path)

    def test_self_consistent_replacement_exe_is_not_the_accepted_installer(self):
        plan = self.prepare()
        public = self.output / 'public'
        installer = public / 'session-panel-0.1.0a1-windows-x64.exe'
        installer.write_bytes(b'different installer with fresh checksums')
        assets = [bundle.asset(public / row['name']) for row in plan['assets']]
        (public / 'SHA256SUMS.txt').write_bytes(bundle.checksums(assets))
        plan['assets'] = [bundle.asset(public / row['name']) for row in plan['assets']]
        plan_path = self.output / 'publication.json'
        plan_path.write_text(json.dumps(plan))
        with self.assertRaises(ValueError):
            bundle.validate_bundle(plan_path)

    def test_validation_rechecks_indirect_evidence_and_log_pins(self):
        self.prepare()
        for name in ('build-receipt.json', 'acceptance.json', 'review.json', 'manual.md', 'check.json', 'stdout.log'):
            with self.subTest(evidence=name):
                file = self.root / name
                before = file.read_bytes()
                file.write_bytes(before + b'changed')
                with self.assertRaises(ValueError):
                    bundle.validate_bundle(self.output / 'publication.json')
                file.write_bytes(before)
