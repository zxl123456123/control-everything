"""Synthetic tests for the installed desktop data directory launcher token."""

import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from control_everything.http import desktop
from control_everything.installation import desktop_settings, registry


class DesktopDataDirectoryTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory(dir=os.environ.get('CE_INSTALL_TEST_DIR'))
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.install = self.root / 'install'
        self.product = self.install / 'versions' / 'version'
        self.product.mkdir(parents=True)
        self.data = self.root / '资料 % 空格'

    def test_unicode_directory_roundtrips_without_touching_data(self):
        token = desktop_settings.encode_data_directory(self.install, str(self.data))
        self.assertEqual(desktop_settings.decode_data_directory(self.install, token), self.data)
        self.assertFalse(self.data.exists())

    def test_invalid_tokens_and_overlapping_or_relative_path_fail(self):
        for value in ('relative', str(self.install), str(self.install / 'child'), str(self.root)):
            with self.subTest(value=value), self.assertRaises(registry.RegistryError):
                desktop_settings.encode_data_directory(self.install, value)
        for token in ('', '!', 'a' * 4097, 'YQ'):
            with self.subTest(token=token), self.assertRaises(registry.RegistryError):
                desktop_settings.decode_data_directory(self.install, token)

    def test_desktop_uses_token_and_explicit_argument_takes_precedence(self):
        token = desktop_settings.encode_data_directory(self.install, str(self.data))
        with patch.object(desktop, 'build_desktop') as build, patch.object(desktop.webbrowser, 'open'):
            desktop.main(['--product-root', str(self.product), '--installed-data-dir', token])
            self.assertEqual(build.call_args.args[1], self.data)
            desktop.main(['--product-root', str(self.product), '--installed-data-dir', token,
                          '--data-dir', str(self.root / 'explicit')])
            self.assertEqual(build.call_args.args[1], self.root / 'explicit')

    def test_corrupt_token_rejects_even_with_explicit_data_directory(self):
        with patch.object(desktop, 'build_desktop') as build:
            with self.assertRaises(registry.RegistryError):
                desktop.main(['--product-root', str(self.product), '--installed-data-dir', '!',
                              '--data-dir', str(self.data)])
        build.assert_not_called()


if __name__ == '__main__':
    unittest.main()
