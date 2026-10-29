"""Encode an installed desktop data directory in its versioned launcher."""

import base64
import binascii
from pathlib import Path

from . import registry


def validate_data_directory(install_root, value):
    root = registry.checked_path(str(Path(install_root).absolute()))
    path = registry.checked_path(value)
    if path == root or path.is_relative_to(root) or root.is_relative_to(path):
        raise registry.RegistryError('data_directory_overlaps_installation')
    return path


def encode_data_directory(install_root, value):
    path = validate_data_directory(install_root, value)
    token = base64.urlsafe_b64encode(str(path).encode('utf-8')).decode('ascii').rstrip('=')
    if len(token) > 4096:
        raise registry.RegistryError('data_directory_too_long')
    return token


def decode_data_directory(install_root, token):
    if not isinstance(token, str) or not token or len(token) > 4096:
        raise registry.RegistryError('data_directory_token_invalid')
    try:
        raw = base64.b64decode(token + '=' * (-len(token) % 4), altchars=b'-_', validate=True)
        value = raw.decode('utf-8')
    except (ValueError, UnicodeError, binascii.Error):
        raise registry.RegistryError('data_directory_token_invalid') from None
    if encode_data_directory(install_root, value) != token:
        raise registry.RegistryError('data_directory_token_invalid')
    return validate_data_directory(install_root, value)
