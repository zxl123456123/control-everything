"""Build a native-architecture macOS Session Panel installation candidate."""

import argparse
import json
import os
from pathlib import Path
import platform
import plistlib
import re
import shutil
import subprocess
import sys
import sysconfig
import tomllib

import workbench_engine as engine

ROOT = Path(__file__).resolve().parents[2]
NAME = 'Session Panel'


def product_version():
    version = tomllib.loads((ROOT / 'pyproject.toml').read_text(encoding='utf-8'))['project']['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:(?:a|b|rc)\d+)?', version):
        raise ValueError('unsupported_macos_product_version')
    return version


NODE_NOTICE_PROBE = r"""
import {join} from 'node:path';
import {NODE_RUNTIME_PIN,nodeRuntimeAsset,nodeRuntimeReleaseUrl} from './src/shared/node-runtime-pin.ts';
import {fetchPinnedFile,pinnedNodeCacheDir} from './config/scripts/pinned-node-downloads.mjs';
import {extract} from './config/scripts/update-node-runtime-pin.mjs';
const target=process.argv[1], output=process.argv[2], asset=nodeRuntimeAsset(target);
if(!target.startsWith('darwin-')||!asset) throw Error('darwin_notice_target_required');
const url=nodeRuntimeReleaseUrl(asset.source,asset.archive);
const archive=await fetchPinnedFile({url,destination:join(pinnedNodeCacheDir(),asset.archive),sha256:asset.archiveSha256});
const member=asset.archive.replace(/\.tar\.(gz|xz)$/,'')+'/LICENSE';
extract(archive,output,member);
console.log(JSON.stringify({name:'Node.js',version:NODE_RUNTIME_PIN.version,path:join(output,member),
 source:url+'!'+member,archiveSha256:asset.archiveSha256}));
"""


def checked(command, *, cwd=ROOT, env=None):
    subprocess.run(list(map(str, command)), cwd=cwd, env=env, check=True)


def target_arch(machine=None):
    machine = machine or platform.machine()
    return {'arm64': 'arm64', 'aarch64': 'arm64', 'x86_64': 'x64', 'AMD64': 'x64'}[machine]


def python_license():
    version = f'python{sys.version_info.major}.{sys.version_info.minor}'
    prefix = Path(sys.base_prefix)
    for path in (Path(sysconfig.get_path('stdlib')) / 'LICENSE.txt', prefix / 'LICENSE.txt',
                 prefix / 'share/doc' / version / 'LICENSE.txt', prefix / 'share/licenses' / version / 'LICENSE'):
        if path.is_file():
            return path.resolve()
    raise ValueError('cpython_runtime_license_missing')


def native_notices(node, run, arch):
    output = engine.checked([node, '--input-type=module', '-e', NODE_NOTICE_PROBE,
                             f'darwin-{arch}', run / 'native-notices'], cwd=ROOT / engine.UNIT,
                            env=engine.build_environment(node, node))
    notice = json.loads(output.splitlines()[-1])
    notice['sha256'] = engine.sha256(notice['path'])
    engine.write_json(run / 'native-notices.json', {'schema': 1, 'notices': [notice]})
    return [notice]


def build_engine(node, pnpm, run, arch):
    import build_assets
    source = engine.check_source()
    unit = ROOT / engine.UNIT
    if any((unit / name).exists() for name in ('out', '.build')):
        raise ValueError('existing_build_outputs: use a clean owned source checkout')
    env = engine.build_environment(node, pnpm)
    if not engine.checked([node, '--version'], cwd=ROOT, env=env).startswith('v24.'):
        raise ValueError('node_24_required')
    if engine.checked([pnpm, '--version'], cwd=ROOT, env=env) != '12.14.0':
        raise ValueError('pnpm_12_14_0_required')
    steps = [step for step in engine.build_commands(node, pnpm, unit, run, ROOT / 'work/ce-native')
             if step[0] != 'process-tree']
    engine.run_steps(steps, run, env)
    engine.run_steps([('verify-web', unit, [node, 'config/scripts/verify-web-build.mjs'])], run, env)
    result = subprocess.run([str(node), '--input-type=module', '-e', engine.OUTPUT_PROBE, f'darwin-{arch}'], cwd=unit,
                            env=env,
                            capture_output=True, text=True, encoding='utf-8')
    (run / 'verify-output.log').write_text(result.stdout + result.stderr, encoding='utf-8')
    if result.returncode:
        raise ValueError(f'output_probe_failed:{result.returncode}')
    data = json.loads(result.stdout.splitlines()[-1])
    rows = engine.output_rows(unit, {'out/web': data['web'],
        'out/mobile-web': ['manifest.json', *[item['path'] for item in data['mobile']['assets']]],
        'out/orcad': data['runtime'], 'out/node_modules/playwright-core': data['newsRuntime']['files']})
    node_file = unit / engine.relative_path(data['node']['path'])
    if engine.sha256(node_file) != data['node']['executableSha256']:
        raise ValueError('packaged_node_hash_mismatch')
    rows.append({'path': data['node']['path'], 'bytes': node_file.stat().st_size, 'sha256': engine.sha256(node_file)})
    engine.write_json(run / 'output-manifest.json', {'schema': 1, 'files': rows})
    engine.write_json(run / 'build-provenance.json', {'schema': 1, **source,
        'status': 'build_only_verified', 'distribution': 'not_verified', 'target': f'darwin-{arch}',
        'artifactVersion': data['artifactVersion'], 'packagedNode': data['node'],
        'hostCommit': engine.checked(['git', 'rev-parse', 'HEAD'], cwd=ROOT)})
    engine.write_json(run / 'dependency-manifest.json', {'schema': 1, 'packages': data['dependencies']})
    build_assets.export_workbench_assets(unit, run)
    return rows


def stage_payload(destination, run, rows):
    unit = ROOT / engine.UNIT
    for row in rows:
        relative = engine.relative_path(row['path'])
        source = engine.unlinked(unit / relative)
        if engine.sha256(source) != row['sha256'] or source.stat().st_size != row['bytes']:
            raise ValueError('packaged_output_changed:' + relative)
        target = destination / 'workbench-engine' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    for name in ('build-provenance.json', 'output-manifest.json', 'web-assets.json', 'dependency-manifest.json'):
        target = destination / 'build' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(run / name, target)
    # Preserve source attribution and all notices identified in the actual package inventory.
    notices = destination / 'licenses'
    notices.mkdir()
    shutil.copy2(ROOT / 'LICENSE', notices / 'Session-Panel-LICENSE')
    shutil.copytree(unit / 'licenses', notices / 'workbench-engine')
    shutil.copy2(ROOT / engine.SOURCE_MANIFEST, notices / 'workbench-engine-source.json')
    shutil.copy2(unit / 'LICENSE', notices / 'workbench-engine-LICENSE')


def verify_payload(destination, rows):
    for row in rows:
        path = engine.unlinked(destination / 'workbench-engine' / engine.relative_path(row['path']))
        if engine.sha256(path) != row['sha256'] or path.stat().st_size != row['bytes']:
            raise ValueError('frozen_workbench_changed:' + row['path'])


def build(node, pnpm, run, *, package_inputs=None):
    if sys.platform != 'darwin':
        raise ValueError('build_requires_macos_host')
    run = engine.owned_directory(run, ROOT / 'work/macos-installer', fresh=True)
    run.mkdir(parents=True)
    arch = target_arch()
    rows = build_engine(node, pnpm, run, arch)
    payload = run / 'payload'
    payload.mkdir()
    stage_payload(payload, run, rows)
    import macos_notices
    notices = macos_notices.collect(payload / 'licenses', ROOT / engine.UNIT,
        package_inputs=package_inputs, runtime_license=python_license(),
        native_notices=native_notices(node, run, arch))
    entry = run / 'session_panel.py'
    entry.write_text('from control_everything.http.macos_desktop import main\n'
                     'if __name__ == "__main__":\n    main()\n', encoding='utf-8')
    checked([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir', '--windowed',
        '--name', NAME, '--osx-bundle-identifier', 'com.sessionpanel.desktop',
        '--distpath', run / 'dist', '--workpath', run / 'pyinstaller', '--specpath', run,
        '--collect-all', 'control_everything', entry])
    app = run / 'dist' / f'{NAME}.app'
    info_file = app / 'Contents/Info.plist'
    info = plistlib.loads(info_file.read_bytes())
    version = product_version()
    info['CFBundleShortVersionString'] = re.match(r'\d+\.\d+\.\d+', version)[0]
    info['CFBundleVersion'] = version
    info['NSAppTransportSecurity'] = {'NSAllowsLocalNetworking': True}
    info_file.write_bytes(plistlib.dumps(info))
    shutil.copytree(payload, app / 'Contents/Resources/session-panel')
    host = app / 'Contents/MacOS/session-panel-window'
    checked(['swiftc', '-O', '-framework', 'Cocoa', '-framework', 'WebKit',
             ROOT / 'native/macos/main.swift', '-o', host])
    verify_payload((app / 'Contents/Resources/session-panel').resolve(), rows)
    checked(['codesign', '--force', '--sign', '-', host])
    checked(['codesign', '--force', '--sign', '-', app])
    checked(['codesign', '--verify', '--deep', '--strict', app])
    verify_payload((app / 'Contents/Resources/session-panel').resolve(), rows)
    image_root = run / 'image'
    image_root.mkdir()
    shutil.copytree(app, image_root / app.name, symlinks=True)
    (image_root / 'Applications').symlink_to('/Applications', target_is_directory=True)
    dmg = run / f'Session-Panel-{version}-{arch}.dmg'
    checked(['hdiutil', 'create', '-volname', NAME, '-srcfolder', image_root, '-ov', '-format', 'UDZO', dmg])
    checked(['hdiutil', 'verify', dmg])
    engine.write_json(run / 'candidate.json', {'schema': 1, 'app': str(app), 'dmg': str(dmg),
        'sha256': engine.sha256(dmg), 'arch': arch, 'signing': 'ad-hoc', 'notarized': False,
        'distribution': 'not_verified', 'candidate_notices_ready': notices['candidate_notices_ready'],
        'notice_missing': notices['missing']})
    print(dmg)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    compile_parser = sub.add_parser('build')
    for option in ('node', 'pnpm', 'run-dir'):
        compile_parser.add_argument('--' + option, type=Path, required=True)
    compile_parser.add_argument('--package-license-inputs', type=Path,
        default=ROOT / 'tools/packaging/macos-notice-index.json')
    smoke_parser = sub.add_parser('smoke')
    for option in ('app', 'data-dir', 'report'):
        smoke_parser.add_argument('--' + option, type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == 'build':
            build(args.node, args.pnpm, args.run_dir, package_inputs=args.package_license_inputs)
        else:
            if sys.platform != 'darwin':
                raise ValueError('smoke_requires_macos_host')
            info = plistlib.loads((args.app / 'Contents/Info.plist').read_bytes())
            version = product_version()
            if (info.get('CFBundleVersion') != version or
                    info.get('CFBundleShortVersionString') != re.match(r'\d+\.\d+\.\d+', version)[0]):
                raise ValueError('installed_app_version_mismatch')
            checked([args.app / 'Contents/MacOS' / NAME, '--data-dir', args.data_dir,
                     '--port', '0', '--headless', '--smoke', '--smoke-report', args.report])
            report = engine.read_json(args.report)
            if report.get('status') != 'passed':
                raise ValueError('installed_app_smoke_failed')
            report['bundleVersion'] = info['CFBundleVersion']
            report['bundleShortVersion'] = info['CFBundleShortVersionString']
            engine.write_json(args.report, report)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'build_macos: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
