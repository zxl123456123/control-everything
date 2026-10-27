"""Exercise the managed task entry with real isolated child processes."""

import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[2] / 'tools/scripts/run_task.py'
SPEC = importlib.util.spec_from_file_location('run_task', SOURCE)
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class RunTaskTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.task = 'synthetic-task'
        self.task_dir = self.root / 'work' / self.task
        self.task_dir.mkdir(parents=True)
        self.entry = self.root / 'docs/current' / self.task / 'README.md'
        self.entry.parent.mkdir(parents=True)
        self.entry.write_text('Synthetic current task\n', encoding='utf-8')
        self.script = self.root / 'tools/scripts/run_task.py'
        self.script.parent.mkdir(parents=True)
        shutil.copyfile(SOURCE, self.script)

    def invoke(self, source, outputs=(), task=None):
        command = [sys.executable, str(self.script), task or self.task]
        for output in outputs:
            command.extend(['--output', str(output)])
        return subprocess.run([*command, '--', sys.executable, '-X', 'utf8', '-c', source],
                              cwd=self.root, capture_output=True, text=True, encoding='utf-8')

    def receipts(self):
        return [json.loads(path.read_text(encoding='utf-8'))
                for path in sorted((self.task_dir / 'runs').glob('*/result.json'))]

    def test_child_environment_outputs_and_temporary_lifecycle(self):
        before = dict(os.environ)
        source = """import json, os, tempfile
from pathlib import Path
data = {key: os.environ[key] for key in ('TEMP', 'TMP', 'TMPDIR', 'CE_TASK_WORK_DIR', 'CE_REPO_ROOT')}
data.update(cwd=os.getcwd(), scratch=tempfile.mkdtemp())
Path('report.json').write_text(json.dumps(data), encoding='utf-8')
print('start-' + 'x' * 150000 + '-完整输出')
print('error-stream', file=__import__('sys').stderr)
"""
        process = self.invoke(source, ['report.json', self.task_dir / 'report.json'])
        self.assertEqual(process.returncode, 0, process.stderr)
        data = json.loads((self.task_dir / 'report.json').read_text(encoding='utf-8'))
        self.assertEqual(Path(data['cwd']), self.task_dir)
        self.assertEqual(Path(data['CE_TASK_WORK_DIR']), self.task_dir)
        self.assertEqual(Path(data['CE_REPO_ROOT']), self.root)
        receipt = self.receipts()[0]
        for key in ('TEMP', 'TMP', 'TMPDIR'):
            self.assertEqual(data[key], receipt['temporaryDirectory'])
        self.assertTrue(Path(data['scratch']).is_relative_to(Path(data['TEMP'])))
        self.assertFalse(Path(data['TEMP']).exists())
        self.assertTrue(receipt['temporaryCleaned'])
        run_dir = next((self.task_dir / 'runs').iterdir())
        self.assertEqual((run_dir / 'stdout.log').read_text(encoding='utf-8'), process.stdout)
        self.assertTrue(process.stdout.endswith('-完整输出\n'))
        self.assertEqual(process.stderr, 'error-stream\n')
        self.assertEqual(dict(os.environ), before)

    def test_child_failure_keeps_exit_code_logs_and_previous_run(self):
        for code in (0, 7):
            process = self.invoke(f"print('child-{code}'); raise SystemExit({code})")
            self.assertEqual(process.returncode, code, process.stderr)
            self.assertEqual(process.stdout, f'child-{code}\n')
        receipts = self.receipts()
        self.assertEqual({row['childExitCode'] for row in receipts}, {0, 7})
        self.assertTrue(all(row['temporaryCleaned'] for row in receipts))
        self.assertEqual(len(list((self.task_dir / 'runs').glob('*/stdout.log'))), 2)

    def test_outside_outputs_are_rejected_before_child_launch(self):
        source = "from pathlib import Path; Path('child-started').touch()"
        for output in (self.root / 'outside.json', self.root / 'work/other/report.json',
                       self.root / 'work', self.task_dir, '../outside.json', 'C:outside.json'):
            with self.subTest(output=str(output)):
                process = self.invoke(source, [output])
                self.assertNotEqual(process.returncode, 0)
                self.assertFalse((self.task_dir / 'child-started').exists())
                self.assertFalse((self.task_dir / 'runs').exists())

    def test_task_must_be_registered_in_current(self):
        self.entry.unlink()
        archived = self.root / 'docs/archive' / self.task / 'README.md'
        archived.parent.mkdir(parents=True)
        archived.write_text('Archived task\n', encoding='utf-8')
        for task in (self.task, '../synthetic-task'):
            with self.subTest(task=task):
                process = self.invoke("from pathlib import Path; Path('child-started').touch()", task=task)
                self.assertNotEqual(process.returncode, 0)
                self.assertFalse((self.task_dir / 'child-started').exists())
                self.assertFalse((self.task_dir / 'runs').exists())

    def test_linked_output_parent_is_rejected_before_launch(self):
        outside = self.root / 'outside'
        outside.mkdir()
        sentinel = outside / 'keep.txt'
        sentinel.write_text('keep', encoding='utf-8')
        link = self.task_dir / 'linked'
        if os.name == 'nt':
            process = subprocess.run(['cmd', '/d', '/c', 'mklink', '/J', str(link), str(outside)],
                                     capture_output=True)
            if process.returncode:
                self.skipTest('Windows directory junction creation unavailable')
            self.addCleanup(os.rmdir, link)
        else:
            link.symlink_to(outside, target_is_directory=True)
            self.addCleanup(link.unlink)
        process = self.invoke("from pathlib import Path; Path('child-started').touch()", ['linked/report.json'])
        self.assertNotEqual(process.returncode, 0)
        self.assertFalse((self.task_dir / 'child-started').exists())
        self.assertFalse((outside / 'report.json').exists())
        self.assertEqual(sentinel.read_text(encoding='utf-8'), 'keep')

    def test_interrupt_reaps_the_real_child(self):
        children = []
        popen = subprocess.Popen

        def interrupt_wait(*args, **kwargs):
            child = popen(*args, **kwargs)
            wait = child.wait
            calls = iter((True, False))

            def wait_once(*wait_args, **wait_kwargs):
                if next(calls, False):
                    raise KeyboardInterrupt
                return wait(*wait_args, **wait_kwargs)

            child.wait = wait_once
            children.append(child)
            return child

        with patch.object(RUNNER.subprocess, 'Popen', side_effect=interrupt_wait):
            code = RUNNER.run_task(self.task, [sys.executable, '-c', 'import time; time.sleep(60)'], [], self.root)
        self.assertEqual(code, 130)
        self.assertIsNotNone(children[0].poll())
        receipt = self.receipts()[0]
        self.assertEqual(receipt['error'], 'KeyboardInterrupt')
        self.assertTrue(receipt['temporaryCleaned'])


if __name__ == '__main__':
    unittest.main()
