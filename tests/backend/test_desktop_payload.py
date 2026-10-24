"""Prepared desktop inputs are verified before copying any distributable bytes."""

import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

from control_everything.installation import manifest

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools/packaging' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


D = load('desktop_payload')


class DesktopPayloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.output = self.root / 'product'
        self.output.mkdir()
        self.engine = self.root / 'source/web/workbench-engine'
        self.engine.mkdir(parents=True)
        self.run = self.root / 'build'
        self.run.mkdir()
        self.git = self.root / 'git'
        self.git.mkdir()
        self.receipt = self.root / 'git.json'
        self.endpoints = self.root / 'endpoints.json'
        self.endpoints.write_text(json.dumps({'issuer': '', 'hub_origin': ''}))
        self.rows = []
        for name in ['out/web/web-index.html', 'out/orcad/orcad.js']:
            path = self.engine / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'fixture')
            self.rows.append({'path': name, 'bytes': 7, 'sha256': manifest.sha256(path)})
        (self.run / 'build-provenance.json').write_text(json.dumps({'status': 'build_only_verified',
              'distribution': 'closure_verified', 'sourceTreeSha256': 'fixture'}))
        (self.run / 'output-manifest.json').write_text(json.dumps({'files': self.rows}))
        (self.run / 'distribution-notices.json').write_text('{}')
        git_rows = []
        for name in sorted(D.GIT_REQUIRED):
            path = self.git / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'fixture')
            git_rows.append({'path': name, 'bytes': 7, 'sha256': manifest.sha256(path)})
        self.git_data = {'archive_sha256': D.GIT_SHA256, 'version': '2.56.0.windows.3', 'files': git_rows,
             'components': [{'name': 'fixture', 'version': '1', 'source': 'https://example.invalid/fixed/1',
               'notices': [{'source': 'LICENSE.txt', 'text': 'fixture', 'sha256': manifest.sha256(self.git / 'LICENSE.txt')}],
               'license': 'MIT', 'fulfillment': {'method': 'notice-only'}, 'output_paths': sorted(D.GIT_REQUIRED)}]}
        self.save()

    def save(self):
        self.receipt.write_text(json.dumps(self.git_data))

    def helpers(self, name):
        if name == 'workbench_engine':
            return SimpleNamespace(check_source=lambda root: {'sourceTreeSha256': 'fixture'})
        if name == 'workbench_distribution':
            return SimpleNamespace(collect=lambda *args: {'packages': {}, 'external': []}, check_notices=load(name).check_notices)
        return load(name)

    def stage(self):
        return D.stage(self.output, self.engine, self.run, self.git, self.receipt, self.endpoints, manifest, self.helpers)

    def test_verified_inputs_have_relative_runtime_contract(self):
        self.stage()
        config = json.loads((self.output / 'desktop-runtime.json').read_text())
        self.assertEqual(config['ssh'], 'portable-git/usr/bin/ssh.exe')
        self.assertEqual(set(config), {'engine_root', 'build_run', 'git', 'ssh', 'keygen', 'issuer', 'hub_origin'})
        self.assertTrue((self.output / 'workbench-build/web-assets.json').is_file())

    def test_full_git_inventory_rejects_missing_dll(self):
        (self.git / 'usr/bin/msys-2.0.dll').unlink()
        with self.assertRaises(OSError):
            self.stage()
        self.assertFalse((self.output / 'desktop-runtime.json').exists())

    def test_license_inventory_is_not_fulfillment(self):
        self.git_data['components'] = []
        self.save()
        with self.assertRaisesRegex(ValueError, 'portable_git_license_closure_missing'):
            self.stage()

    def test_unrecorded_dll_rejected(self):
        (self.git / 'extra.dll').write_bytes(b'fixture')
        with self.assertRaisesRegex(ValueError, 'portable_git_file_set'):
            self.stage()

    def test_mixed_self_host_identity_is_rejected(self):
        self.endpoints.write_text(json.dumps({'issuer': 'https://example.invalid/realm', 'hub_origin': ''}))
        with self.assertRaisesRegex(ValueError, 'desktop_identity_fields'):
            self.stage()

    def test_changed_bundle_bytes_rejected(self):
        (self.engine / 'out/orcad/orcad.js').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'desktop_input_changed'):
            self.stage()


if __name__ == '__main__':
    unittest.main()
