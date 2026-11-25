"""macOS candidate payload copying must preserve verified bytes and executable modes."""

from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/packaging'))
import build_macos


class MacOSPackagingTests(unittest.TestCase):
    def test_native_architectures(self):
        self.assertEqual(build_macos.target_arch('arm64'), 'arm64')
        self.assertEqual(build_macos.target_arch('x86_64'), 'x64')
        with self.assertRaises(KeyError):
            build_macos.target_arch('i386')

    def test_payload_preserves_verified_executable_and_build_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
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
