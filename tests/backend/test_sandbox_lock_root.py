"""Desktop lock roots preserve cross-profile Windows sandbox leases."""

import os
import hashlib
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from control_everything.http import desktop
from control_everything.platform import windows_acl


CHILD = r'''
import sys
sys.path.insert(0, sys.argv[1])
from control_everything.platform import windows_acl
windows_acl.configure_desktop_lock_root(sys.argv[2])
try:
    with windows_acl.directory_lock(sys.argv[3]):
        pass
except OSError:
    sys.exit(23)
'''


class DesktopSandboxLockRootTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory(dir=os.environ.get('CE_SANDBOX_TEST_DIR'))
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.lock_root = self.root / 'common-locks'
        self.lock_root.mkdir()
        self.project = self.root / 'projects' / 'project'
        self.project.mkdir(parents=True)
        self.sibling = self.project.parent / 'sibling'
        self.sibling.mkdir()
        self.enterContext(patch.object(windows_acl, '_DESKTOP_LOCK_ROOT', None))
        self.enterContext(patch.dict(os.environ, {'LOCALAPPDATA': str(self.root / 'legacy')}))
        windows_acl.configure_desktop_lock_root(self.lock_root)

    def child(self, target):
        source = Path(__file__).resolve().parents[2] / 'src'
        return subprocess.run([sys.executable, '-B', '-c', CHILD, str(source), str(self.lock_root), str(target)],
                              capture_output=True, text=True, timeout=15)

    def test_independent_profiles_contend_for_same_or_ancestor_directory(self):
        with windows_acl.directory_lock(self.project):
            for target in (self.project, self.project.parent):
                child = self.child(target)
                self.assertEqual(child.returncode, 23, child.stderr)
            sibling = self.child(self.sibling)
            self.assertEqual(sibling.returncode, 0, sibling.stderr)
        self.assertFalse((self.root / 'legacy').exists())

    def test_profile_state_lock_is_scoped_to_profile(self):
        profile_a, profile_b = self.root / 'a', self.root / 'b'
        with windows_acl.state_lock(profile_a), windows_acl.state_lock(profile_b):
            with self.assertRaises(OSError):
                with windows_acl.state_lock(profile_a):
                    self.fail('the same profile state must remain locked')

    def test_invalid_missing_file_and_relative_roots_are_rejected(self):
        file = self.root / 'not-a-directory'
        file.write_text('fixture', encoding='utf-8')
        for target in (Path('relative'), self.root / 'missing', file, Path(self.root.anchor), self.root / '..'):
            with self.subTest(target=target), self.assertRaises((ValueError, OSError)):
                windows_acl.configure_desktop_lock_root(target)

    def test_removed_or_replaced_root_fails_without_fallback(self):
        self.lock_root.rename(self.root / 'original-locks')
        self.lock_root.mkdir()
        with self.assertRaises((OSError, ValueError)):
            with windows_acl.directory_lock(self.project):
                self.fail('a missing root must not admit a worker')
        self.assertFalse((self.root / 'legacy').exists())

    def test_desktop_passes_explicit_root_before_building_server(self):
        with patch('control_everything.platform.windows_acl.configure_desktop_lock_root') as configure, \
             patch.object(desktop, 'build_desktop') as build, \
             patch.object(desktop.webbrowser, 'open'):
            desktop.main(['--product-root', str(self.root), '--sandbox-lock-root', str(self.lock_root)])
        configure.assert_called_once_with(self.lock_root)
        build.assert_called_once()

    def test_desktop_never_uses_an_environment_override(self):
        with patch.dict(os.environ, {'SESSION_PANEL_SANDBOX_LOCK_ROOT': str(self.lock_root)}), \
             patch('control_everything.platform.windows_acl.configure_desktop_lock_root') as configure, \
             patch.object(desktop, 'build_desktop'), patch.object(desktop.webbrowser, 'open'):
            desktop.main(['--product-root', str(self.root)])
        configure.assert_not_called()

    def test_installed_data_directory_and_shared_lock_root_work_together(self):
        from control_everything.installation.desktop_settings import encode_data_directory
        install = self.root / 'installation'
        product = install / 'versions' / 'current'
        product.mkdir(parents=True)
        data = self.root / 'application-data'
        token = encode_data_directory(install, str(data))
        with patch('control_everything.platform.windows_acl.configure_desktop_lock_root') as configure, \
             patch.object(desktop, 'build_desktop') as build, patch.object(desktop.webbrowser, 'open'):
            desktop.main(['--product-root', str(product), '--installed-data-dir', token,
                          '--sandbox-lock-root', str(self.lock_root)])
        configure.assert_called_once_with(self.lock_root)
        self.assertEqual(build.call_args.args[:2], (product, data))

    def test_desktop_rejects_invalid_root_before_building(self):
        with patch.object(desktop, 'build_desktop') as build:
            with self.assertRaises((ValueError, OSError)):
                desktop.main(['--product-root', str(self.root), '--sandbox-lock-root', 'relative'])
        build.assert_not_called()

    @unittest.skipUnless(os.name == 'nt', 'Windows junction contract')
    def test_root_cannot_be_a_junction_or_descendant_of_one(self):
        junction = self.root / 'junction'
        result = subprocess.run([os.environ['COMSPEC'], '/d', '/c', 'mklink', '/J',
                                 str(junction), str(self.lock_root)], capture_output=True)
        if result.returncode:
            self.skipTest('Host cannot create an NTFS junction')
        try:
            child = self.lock_root / 'child'
            child.mkdir()
            for target in (junction, junction / 'child'):
                with self.subTest(target=target), self.assertRaises(ValueError):
                    windows_acl.configure_desktop_lock_root(target)
        finally:
            os.rmdir(junction)

    @unittest.skipUnless(os.name == 'nt', 'Windows junction contract')
    def test_lock_file_cannot_be_a_junction(self):
        profile = self.root / 'profile'
        key = 'sandbox-state:' + os.path.normcase(str(profile.resolve()))
        path = self.lock_root / (hashlib.sha256(key.encode('utf-8')).hexdigest() + '.lock')
        result = subprocess.run([os.environ['COMSPEC'], '/d', '/c', 'mklink', '/J',
                                 str(path), str(self.project)], capture_output=True)
        if result.returncode:
            self.skipTest('Host cannot create an NTFS junction')
        try:
            with self.assertRaisesRegex(OSError, 'sandbox_lock_file_invalid'):
                with windows_acl.state_lock(profile):
                    self.fail('a redirected lock file must not be opened')
        finally:
            os.rmdir(path)

    def test_default_root_remains_unchanged(self):
        with patch.object(windows_acl, '_DESKTOP_LOCK_ROOT', None):
            with windows_acl.state_lock(self.root / 'profile'):
                self.assertTrue((self.root / 'legacy' / 'control-everything' / 'sandbox-locks').is_dir())


if __name__ == '__main__':
    unittest.main()
