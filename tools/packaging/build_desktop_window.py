"""Compile the Win32 desktop window against the pinned Microsoft WebView2 SDK."""

import argparse
import hashlib
import json
from math import hypot
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import zipfile
import zlib


ROOT = Path(__file__).resolve().parents[2]
SDK_VERSION = '1.0.4314.35'
SDK_SHA256 = '90778deb1b77e36292828b4b5833c9255c27533f40e0ddd55891ae718944edc4'
SOURCE = 'native/desktop/main.cpp'
MARK = 'web/product/index.html'
ICON = 'session-panel.ico'
BUILD_SOURCES = (SOURCE, MARK, 'tools/packaging/build_desktop_window.py')
EXECUTABLE = 'session-panel.exe'
LICENSES = ('WEBVIEW2-SDK-LICENSE.txt', 'WEBVIEW2-SDK-NOTICE.txt')


def sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def rounded_box(x, y, half, radius):
    dx, dy = abs(x) - half + radius, abs(y) - half + radius
    return hypot(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0) - radius


def mark_png(size):
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    pixels = bytearray()
    for row in range(size):
        pixels.append(0)
        y = (row + .5) / size - .5
        for column in range(size):
            x = (column + .5) / size - .5
            # The approved product-page mark is centered in a 78%-wide tile.
            scale = .78 / 24
            outer = rounded_box(x, y, 9 * scale, 3 * scale)
            vertical = hypot(x + 3 * scale, max(abs(y) - 9 * scale, 0))
            horizontal = hypot(max(abs(x - 3 * scale) - 6 * scale, 0), y + 3 * scale)
            stroke = min(abs(outer), vertical, horizontal) - .8 * scale
            ink = max(0, min(1, .5 - stroke * size))
            alpha = max(0, min(1, .5 - rounded_box(x, y, .5, .22) * size))
            pixels.extend(round(dark + (light - dark) * ink)
                          for dark, light in zip((48, 42, 37), (225, 184, 148)))
            pixels.append(round(255 * alpha))
    header = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header)
            + chunk(b'IDAT', zlib.compress(pixels, 9)) + chunk(b'IEND', b''))


def build_icon(path):
    product = (ROOT / MARK).read_text(encoding='utf-8')
    symbol = re.search(r'<symbol id="i-mark" viewBox="0 0 24 24">(.*?)</symbol>', product, re.S)
    geometry = '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M9 9h12"/>'
    if symbol is None or symbol.group(1) != geometry:
        raise ValueError('desktop_product_mark_changed')
    sizes = (16, 24, 32, 48, 64, 128, 256)
    directory, images = bytearray(struct.pack('<HHH', 0, 1, len(sizes))), bytearray()
    for size in sizes:
        png = mark_png(size)
        dimension = size % 256
        offset = 6 + 16 * len(sizes) + len(images)
        directory.extend(struct.pack('<BBBBHHII', dimension, dimension, 0, 0, 1, 32, len(png), offset))
        images.extend(png)
    path.write_bytes(directory + images)


def compiler_environment():
    vswhere = (Path(os.environ['ProgramFiles(x86)']) / 'Microsoft Visual Studio/Installer/vswhere.exe')
    install = subprocess.check_output([vswhere, '-latest', '-products', '*', '-requires',
                                        'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
                                        '-property', 'installationPath'], text=True).strip()
    setup = Path(install) / 'VC/Auxiliary/Build/vcvars64.bat'
    if not setup.is_file():
        raise ValueError('desktop_window_msvc_missing')
    cmd = Path(os.environ['SystemRoot']) / 'System32/cmd.exe'
    output = subprocess.check_output(f'"{cmd}" /d /c call "{setup}" >nul && set', executable=cmd,
                                     text=True, errors='replace')
    return dict(line.split('=', 1) for line in output.splitlines() if '=' in line and not line.startswith('='))


def build(sdk, output):
    sdk, output = Path(sdk).resolve(strict=True), Path(output).resolve()
    if not output.is_relative_to(ROOT / 'work') or output.exists():
        raise ValueError('new_desktop_window_output_required')
    if sha256(sdk) != SDK_SHA256:
        raise ValueError('desktop_window_sdk_hash')
    env = compiler_environment()
    cl = shutil.which('cl.exe', path=env.get('PATH', env.get('Path')))
    rc = shutil.which('rc.exe', path=env.get('PATH', env.get('Path')))
    if not cl or not rc:
        raise ValueError('desktop_window_msvc_missing')
    output.mkdir(parents=True)
    inputs = output / 'build-inputs'
    inputs.mkdir()
    with zipfile.ZipFile(sdk) as archive:
        for member, target in (('build/native/include/WebView2.h', inputs / 'WebView2.h'),
                               ('build/native/x64/WebView2LoaderStatic.lib', inputs / 'WebView2LoaderStatic.lib'),
                               ('LICENSE.txt', output / LICENSES[0]), ('NOTICE.txt', output / LICENSES[1])):
            target.write_bytes(archive.read(member))
    icon = output / ICON
    build_icon(icon)
    resource = inputs / 'icon.rc'
    resource.write_text(f'101 ICON "{icon.as_posix()}"\n', encoding='utf-8')
    subprocess.run([rc, '/nologo', '/fo', 'icon.res', resource], cwd=inputs, env=env, check=True)
    executable = output / EXECUTABLE
    subprocess.run([cl, '/nologo', '/std:c++17', '/W4', '/WX', '/O2', '/MT', '/EHsc', '/utf-8',
                    '/DUNICODE', '/D_UNICODE', '/I' + str(inputs), '/Fo:desktop.obj', '/Fe:' + str(executable),
                    ROOT / SOURCE, 'icon.res', '/link', '/SUBSYSTEM:WINDOWS', '/MACHINE:X64',
                    inputs / 'WebView2LoaderStatic.lib', 'User32.lib', 'Gdi32.lib', 'Shell32.lib', 'Ole32.lib',
                    'Shlwapi.lib', 'Version.lib', 'Advapi32.lib'], cwd=inputs, env=env, check=True)
    receipt = {'schema': 1, 'sdk_version': SDK_VERSION, 'sdk_sha256': SDK_SHA256,
               'source': {name: sha256(ROOT / name) for name in BUILD_SOURCES},
               'msvc': env.get('VCToolsVersion'),
               'files': {name: sha256(output / name) for name in (EXECUTABLE, ICON, *LICENSES)}}
    (output / 'window-build.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    return receipt


def stage(window_build, payload, api):
    window_build = api.no_links(Path(window_build))
    if not window_build.is_absolute():
        raise ValueError('absolute_desktop_window_input_required')
    receipt = api.strict_json(api.no_links(window_build / 'window-build.json').read_text(encoding='utf-8'))
    expected_files = {EXECUTABLE, ICON, *LICENSES}
    if (not isinstance(receipt, dict) or receipt.get('schema') != 1 or receipt.get('sdk_version') != SDK_VERSION
            or receipt.get('sdk_sha256') != SDK_SHA256 or not receipt.get('msvc')
            or receipt.get('source') != {name: sha256(ROOT / name) for name in BUILD_SOURCES}
            or not isinstance(receipt.get('files'), dict) or set(receipt['files']) != expected_files):
        raise ValueError('desktop_window_build_identity')
    icon = api.no_links(window_build / ICON)
    if sha256(icon) != receipt['files'][ICON]:
        raise ValueError('desktop_window_build_changed')
    target = Path(payload) / Path(api.DESKTOP_WINDOW_EXE).parent
    target.mkdir(parents=True)
    for name in (EXECUTABLE, *LICENSES):
        file = api.no_links(window_build / name)
        destination = target / name
        shutil.copyfile(file, destination)
        if sha256(destination) != receipt['files'][name]:
            raise ValueError('desktop_window_build_changed')
    notices = []
    for name in LICENSES:
        text = (target / name).read_text(encoding='utf-8-sig')
        notices.append({'source': 'Microsoft.Web.WebView2 ' + SDK_VERSION + '/' + name,
                        'text': text, 'sha256': hashlib.sha256(text.encode('utf-8')).hexdigest()})
    return receipt, {'name': 'Microsoft.Web.WebView2', 'version': SDK_VERSION, 'notices': notices}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.sdk, args.output)))
        return 0
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'desktop_window_build_failed: {error}')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
