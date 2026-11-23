"""Actual fixed subprocess verification receipts on disposable declared inputs."""
import hashlib
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest


class VerificationTests(unittest.TestCase):
    def setUp(self):
        from control_everything.execution.verification import run_verification
        self.verify = run_verification
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        (self.root / 'input.txt').write_bytes(b'original input\n')

    def execute(self, program, **changes):
        values = dict(argv=[sys.executable, '-B', '-c', program], cwd=self.root,
            output_dir=self.root / 'evidence', task_id='task', flow_id='flow', step_id='verify',
            source_files=['input.txt'], timeout=3)
        values.update(changes)
        return self.verify(**values)

    def test_full_binary_logs_and_real_zero_or_seven(self):
        for code in (0, 7):
            with self.subTest(code=code):
                output = self.root / ('run-' + str(code))
                receipt = self.execute("import sys; sys.stdout.buffer.write(b'O'*90000+b'\\x00'); "
                    "sys.stderr.buffer.write(b'E'*100000+b'\\xff'); sys.exit(" + str(code) + ')', output_dir=output)
                self.assertEqual(receipt['exit_code'], code)
                self.assertEqual(receipt['status'], 'passed' if code == 0 else 'failed')
                for key, raw in [('stdout', b'O' * 90000 + b'\x00'), ('stderr', b'E' * 100000 + b'\xff')]:
                    self.assertEqual((output / (key + '.log')).read_bytes(), raw)
                    self.assertEqual(receipt[key]['bytes'], len(raw))
                    self.assertEqual(receipt[key]['sha256'], hashlib.sha256(raw).hexdigest())
                final = json.loads((output / 'receipt.json').read_text(encoding='utf-8'))
                self.assertEqual(final, receipt)
                started = json.loads((output / 'started.json').read_text(encoding='utf-8'))
                for key in ('argv', 'cwd', 'task_id', 'flow_id', 'step_id', 'started_at', 'source_before'):
                    self.assertEqual(started[key], receipt[key])
                self.assertEqual(receipt['identity_scope'], 'declared_inputs')
                self.assertFalse(receipt['process_tree_verified'])

    def test_modified_input_is_not_passed(self):
        receipt = self.execute("from pathlib import Path; Path('input.txt').write_bytes(b'changed')")
        self.assertEqual(receipt['exit_code'], 0)
        self.assertTrue(receipt['source_changed'])
        self.assertEqual(receipt['status'], 'failed')
        self.assertNotEqual(receipt['source_before'], receipt['source_after'])

    def test_timeout_retains_output_and_unknown_exit(self):
        receipt = self.execute("import os,time; os.write(1,b'before timeout'); time.sleep(5)", timeout=.15)
        self.assertEqual(receipt['status'], 'unknown')
        self.assertIsNone(receipt['exit_code'])
        self.assertEqual((self.root / 'evidence/stdout.log').read_bytes(), b'before timeout')
        self.assertFalse(receipt['process_tree_verified'])

    def test_spawn_failure_has_no_invented_exit(self):
        receipt = self.execute('', argv=[str(self.root / 'missing.exe')])
        self.assertEqual(receipt['status'], 'failed')
        self.assertIsNone(receipt['exit_code'])
        self.assertEqual(receipt['reason'], 'spawn_failed')

    def test_existing_output_is_preserved(self):
        output = self.root / 'evidence'
        output.mkdir()
        (output / 'receipt.json').write_bytes(b'prior evidence')
        with self.assertRaises(FileExistsError):
            self.execute("raise RuntimeError('must not run')")
        self.assertEqual((output / 'receipt.json').read_bytes(), b'prior evidence')

    def test_final_receipt_write_failure_preserves_started_and_logs(self):
        temporary = self.root / 'evidence/receipt.json.tmp'
        with self.assertRaises(OSError):
            self.execute("from pathlib import Path; print('command exited zero'); Path(" + repr(str(temporary)) + ').mkdir()')
        output = self.root / 'evidence'
        self.assertTrue((output / 'started.json').is_file())
        self.assertEqual((output / 'stdout.log').read_bytes().strip(), b'command exited zero')
        self.assertFalse((output / 'receipt.json').exists())

    def test_missing_escape_duplicate_and_relative_exe_are_rejected_before_start(self):
        for changes in ({'source_files': ['missing.txt']}, {'source_files': ['../outside.txt']},
                        {'source_files': ['input.txt', './input.txt']}, {'argv': ['python', '-c', 'pass']}):
            with self.subTest(changes=changes):
                with self.assertRaises((ValueError, FileNotFoundError)):
                    self.execute("raise RuntimeError('must not run')", **changes)
                self.assertFalse((self.root / 'evidence').exists())
