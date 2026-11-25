"""macOS candidate payload copying must preserve verified bytes and executable modes."""

from pathlib import Path
import importlib.util
import subprocess
import sys
import tempfile
import traceback
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/packaging'))
import build_macos


class MacOSPackagingTests(unittest.TestCase):
    def test_terminal_timeout_redacts_pairing_and_revokes_device(self):
        spec = importlib.util.spec_from_file_location('macos_smoke', ROOT / 'src/control_everything/http/macos_smoke.py')
        macos_smoke = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(macos_smoke)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            runtime = SimpleNamespace(config=SimpleNamespace(data_root=root, git_executable=Path('/usr/bin/git'),
                engine_root=root), _env={}, _node=Path('/fixture/node'), revoke_device=Mock(),
                bootstrap_runtime=Mock(return_value={'runtime': {'offer': {
                    'pairedDeviceId': 'fixture-device', 'deviceToken': 'fixture-token'}}}))
            timeout = subprocess.TimeoutExpired(['node', '--pairing-code', 'fixture-pairing-material'], 40)
            with patch.object(macos_smoke.subprocess, 'run', side_effect=[
                    SimpleNamespace(returncode=0), SimpleNamespace(returncode=0), timeout]):
                with self.assertRaisesRegex(RuntimeError, 'smoke_cli_timeout:repo:add') as caught:
                    macos_smoke.smoke_terminal(SimpleNamespace(runtime=runtime))
            self.assertNotIn('fixture-pairing-material', ''.join(traceback.format_exception(caught.exception)))
            runtime.revoke_device.assert_called_once_with('fixture-device')

    def test_native_architectures(self):
        self.assertEqual(build_macos.target_arch('arm64'), 'arm64')
        self.assertEqual(build_macos.target_arch('x86_64'), 'x64')
        with self.assertRaises(KeyError):
            build_macos.target_arch('i386')

    def test_payload_preserves_verified_executable_and_build_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            unit = root / 'web/workbench-engine'
            source = unit / 'out/runtimes/node-fixture/node'
            source.parent.mkdir(parents=True)
            source.write_bytes(b'fixture runtime')
            source.chmod(0o755)
            (unit / 'licenses').mkdir()
            (unit / 'licenses/NOTICE').write_text('fixture notice')
            (unit / 'LICENSE').write_text('fixture license')
            (root / 'LICENSE').write_text('fixture license')
            manifest = root / build_macos.engine.SOURCE_MANIFEST
            manifest.parent.mkdir(parents=True)
            manifest.write_text('{}')
            run = root / 'build'
            run.mkdir()
            for name in ('build-provenance.json', 'output-manifest.json', 'web-assets.json', 'dependency-manifest.json'):
                (run / name).write_text('{}')
            rows = [{'path': source.relative_to(unit).as_posix(), 'bytes': source.stat().st_size,
                     'sha256': build_macos.engine.sha256(source)}]
            destination = root / 'payload'
            destination.mkdir()
            with patch.object(build_macos, 'ROOT', root):
                build_macos.stage_payload(destination, run, rows)
                copied = destination / 'workbench-engine' / rows[0]['path']
                self.assertEqual(copied.read_bytes(), source.read_bytes())
                self.assertEqual(copied.stat().st_mode & 0o777, source.stat().st_mode & 0o777)
                self.assertTrue((destination / 'build/web-assets.json').is_file())
                source.write_bytes(b'tampered runtime')
                with self.assertRaisesRegex(ValueError, 'packaged_output_changed'):
                    build_macos.stage_payload(root / 'tampered', run, rows)


if __name__ == '__main__':
    unittest.main()
