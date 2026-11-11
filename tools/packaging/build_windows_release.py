"""Build one local Windows candidate from reviewed inputs; never install or publish it."""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[2]
INPUTS = {'node', 'pnpm', 'engine_materials', 'wheelhouse', 'runtime_zip',
          'portable_git', 'git_receipt', 'endpoints', 'inno_dir', 'webview2_sdk'}
DIRECTORIES = {'engine_materials', 'wheelhouse', 'portable_git', 'inno_dir'}
# node-gyp/MSBuild writes this state file even when Windows long paths are enabled.
NATIVE_STATE_PATH = ('web/workbench-engine/out/orcad-prebuild-work/win32-x64/node-pty/node_modules/'
                     'node-addon-api/Release/obj/node_addon_api_except/node_add.XXXXXXXX.tlog/'
                     'node_addon_api_except.lastbuildstate')


def check_native_path(root):
    length = len(str(root / NATIVE_STATE_PATH).encode('utf-16-le')) // 2
    if length >= 260:
        raise ValueError(f'windows_native_path_budget:{length}: use a shorter checkout before building')


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def unlinked(path):
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts:
        raise ValueError('absolute_canonical_path_required')
    for item in (path, *path.parents):
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise ValueError('linked_release_path')
    return path


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def prepared_inputs(path, root):
    path = unlinked(path)
    value = read(path)
    if (not isinstance(value, dict) or set(value) != INPUTS | {'schema'}
            or type(value['schema']) is not int or value['schema'] != 1
            or any(not isinstance(value[name], str) for name in INPUTS)):
        raise ValueError('release_input_fields')
    paths = {name: unlinked(value[name]) for name in INPUTS}
    for name, item in paths.items():
        if not (item.is_dir() if name in DIRECTORIES else item.is_file()):
            raise ValueError('release_input_missing:' + name)
    for name in ('ISCC.exe', 'license.txt'):
        if not unlinked(paths['inno_dir'] / name).is_file():
            raise ValueError('inno_input_missing:' + name)
    pins = read(root / 'tools/packaging/downloads.json')
    if sha(paths['runtime_zip']) != pins['python']['sha256']:
        raise ValueError('runtime_archive_hash')
    return paths


def observer_environment(root):
    spec = importlib.util.spec_from_file_location('release_observer', root / 'tools/scripts/build_observer.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.prepared_environment()


def material_inputs(root, directory):
    spec = importlib.util.spec_from_file_location('release_materials', root / 'tools/packaging/workbench_materials.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.preflight(root / 'web/workbench-engine', directory)['input_hashes']


def payload_inputs(paths, root):
    """Reuse assembly validators before compiling anything; assembly checks again."""
    spec = importlib.util.spec_from_file_location('release_payload', root / 'tools/packaging/build_windows.py')
    payload = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(payload)
    desktop = payload.helper('desktop_payload')
    desktop.read_endpoints(paths['endpoints'])
    _, wheels = payload.verify_wheelhouse(paths['wheelhouse'],
                                         payload.locked_requirements(root / 'tools/packaging/windows-cp313.lock'))
    window = payload.helper('build_desktop_window')
    if sha(paths['webview2_sdk']) != window.SDK_SHA256:
        raise ValueError('desktop_window_sdk_hash')
    compiler = window.compiler_environment()
    compiler_tools = {name: shutil.which(name, path=compiler.get('PATH', compiler.get('Path')))
                      for name in ('cl.exe', 'rc.exe')}
    if not all(compiler_tools.values()):
        raise ValueError('desktop_window_msvc_missing')
    desktop.validate_git_receipt(paths['portable_git'], read(paths['git_receipt']), paths['git_receipt'].parent,
                                 payload.contract(), payload.helper('workbench_distribution').check_notices)
    return {'wheels': [{'filename': row['filename'], 'sha256': row['sha256']} for row in wheels],
            'webview2_sdk_sha256': sha(paths['webview2_sdk']),
            'compiler_tools': {name: {'path': path, 'sha256': sha(unlinked(path))}
                               for name, path in compiler_tools.items()}}


def observer_packages(metadata):
    """Select the root's normal/build closure from Cargo's platform-filtered graph."""
    resolve = metadata.get('resolve')
    if not isinstance(resolve, dict) or not resolve.get('root'):
        raise ValueError('cargo_dependency_graph_required')
    try:
        nodes = {node['id']: node for node in resolve['nodes']}
        packages = {package['id']: package for package in metadata['packages']}
        pending, selected = [resolve['root']], set()
        while pending:
            identity = pending.pop()
            if identity in selected:
                continue
            if identity not in nodes or identity not in packages:
                raise ValueError('cargo_dependency_package_missing:' + identity)
            selected.add(identity)
            for dependency in nodes[identity]['deps']:
                if any(kind['kind'] in (None, 'build') for kind in dependency['dep_kinds']):
                    pending.append(dependency['pkg'])
        return [package for package in metadata['packages'] if package['id'] in selected]
    except (KeyError, TypeError) as error:
        raise ValueError('cargo_dependency_graph_required') from error


def compilation_identity(root, receipt, native_tools):
    identity = {key: receipt[key] for key in ('commit', 'input_file_sha256', 'input_files',
                                             'materials', 'preflight', 'installer_compiler')}
    identity['checkout'] = str(root.resolve())
    identity['tools'] = {name: {'path': str(path), 'sha256': sha(unlinked(path))}
                         for name, path in {**native_tools, 'python': sys.executable}.items()}
    return identity


def compilation_files(root, output, engine_run):
    files = [output / 'cargo-packages.json']
    for directory in (output / 'dist', output / 'desktop-window',
                      root / 'work/native-observer/release-install', root / 'web/workbench-engine/out',
                      root / 'web/workbench-engine/.build/distribution'):
        if not unlinked(directory).is_dir():
            raise ValueError('compilation_output_missing')
        for current, directories, names in os.walk(directory):
            for name in directories:
                unlinked(Path(current) / name)
            files.extend(Path(current) / name for name in names)
    files.extend(path for path in unlinked(engine_run).iterdir() if path.is_file())
    required = [engine_run / 'build-provenance.json', engine_run / 'output-manifest.json',
                output / 'desktop-window/window-build.json',
                root / 'work/native-observer/release-install/manifest.json',
                root / 'work/native-observer/release-install/build-info.json']
    if any(not unlinked(path).is_file() for path in required):
        raise ValueError('compilation_output_missing')
    return {path.relative_to(root).as_posix(): {'bytes': unlinked(path).stat().st_size, 'sha256': sha(path)}
            for path in sorted(files)}


def copy_engine_receipts(root, source, destination, files):
    destination.mkdir(parents=True)
    for relative, info in files.items():
        path = root / relative
        if path.parent != source:
            continue
        target = destination / path.name
        shutil.copyfile(unlinked(path), target)
        if sha(target) != info['sha256']:
            raise ValueError('reuse_build_artifacts_changed')


def build(inputs_file, run_name, *, root=ROOT, runner=subprocess.run, check_only=False, store_dir=None,
          reuse_build=None):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', run_name):
        raise ValueError('invalid_release_run_name')
    if reuse_build is not None and (not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', reuse_build)
                                   or reuse_build == run_name or check_only):
        raise ValueError('invalid_reuse_build')
    paths = prepared_inputs(inputs_file, root)
    check_native_path(root)
    materials = material_inputs(root, paths['engine_materials'])
    store_dir = unlinked(store_dir if store_dir is not None else root / 'work/windows-release/pnpm-store')
    if store_dir == Path(store_dir.anchor) or (store_dir.exists() and not store_dir.is_dir()):
        raise ValueError('invalid_store_directory')
    output = unlinked(root / 'work/windows-release' / run_name)
    engine_run = unlinked(root / 'work/workbench-engine-build' / run_name)
    engine_root = root / 'web/workbench-engine'
    new_paths = (output, engine_run) if reuse_build else (
        output, engine_run, engine_root / 'out', engine_root / '.build', root / 'work/native-observer/release-install')
    for path in new_paths:
        if unlinked(path).exists():
            raise ValueError('new_release_outputs_required:' + str(path))
    environment = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', PYTHONNOUSERSITE='1')
    for name in ('PYTHONPATH', 'PYTHONHOME', 'NODE_OPTIONS', 'NODE_PATH'):
        environment.pop(name, None)
    output.mkdir(parents=True)
    receipt = {'schema': 1, 'status': 'building', 'input_file_sha256': sha(inputs_file),
               'download_store': str(store_dir),
               'materials': materials, 'input_files': {name: {'path': str(path), 'sha256': sha(path)}
                   for name, path in paths.items() if path.is_file()}, 'steps': []}

    def step(name, command, *, env=environment):
        command = list(map(str, command))
        stdout, stderr = output / (name + '.stdout.log'), output / (name + '.stderr.log')
        row = {'step': name, 'argv': command, 'exit_code': None,
               'stdout': stdout.name, 'stderr': stderr.name}
        receipt['steps'].append(row)
        write(output / 'build-receipt.json', receipt)
        with stdout.open('xb') as out, stderr.open('xb') as err:
            result = runner(command, cwd=root, env=env, stdin=subprocess.DEVNULL,
                            stdout=out, stderr=err, shell=False)
        row['exit_code'] = result.returncode
        write(output / 'build-receipt.json', receipt)
        if result.returncode:
            raise ValueError('release_step_failed:' + name + ':' + str(result.returncode))
        return stdout

    python = [sys.executable, '-B', '-X', 'utf8']
    try:
        commit = step('source-commit', ['git', 'rev-parse', 'HEAD']).read_text().strip()
        if not re.fullmatch('[0-9a-f]{40}', commit):
            raise ValueError('invalid_release_commit')
        if step('source-status', ['git', 'status', '--porcelain', '--untracked-files=normal']).read_text().strip():
            raise ValueError('dirty_release_source')
        receipt['commit'] = commit
        node_version = step('node-version', [paths['node'], '--version']).read_text().strip()
        pnpm_version = step('pnpm-version', [paths['pnpm'], '--version']).read_text().strip()
        if not re.fullmatch(r'v24\.\d+\.\d+', node_version) or pnpm_version != '12.14.0':
            raise ValueError('release_tool_version')
        inno = paths['inno_dir'] / 'ISCC.exe'
        inno_version = step('inno-version', [inno, '--version']).read_text().strip()
        expected = read(root / 'tools/packaging/downloads.json')['inno']['version']
        if not re.search(r'\b' + re.escape(expected) + r'\b', inno_version):
            raise ValueError('inno_tool_version')
        receipt['installer_compiler'] = {'path': str(inno), 'sha256': sha(inno), 'version_output': inno_version}
        receipt['input_files']['inno_license'] = {'path': str(paths['inno_dir'] / 'license.txt'),
                                                'sha256': sha(paths['inno_dir'] / 'license.txt')}
        # Check the prepared environment without changing its packages or global settings.
        pins = dict(line.split('==') for line in (root / 'tools/packaging/requirements.txt').read_text().splitlines()
                    if line.strip() and not line.startswith('#'))
        step('python-environment', [*python, '-c',
             "import importlib.metadata as m, json, sys; import control_everything.installation.manifest; "
             "assert all(m.version(k)==v for k,v in json.loads(sys.argv[1]).items()), 'build_tool_version'",
             json.dumps(pins)])
        step('python-dependencies', [*python, '-m', 'pip', 'check'])
        receipt['preflight'] = payload_inputs(paths, root)
        native_env, native_tools = observer_environment(root)
        # Keep the same private toolchain for observer compilation and its license metadata.
        for name in ('PYTHONPATH', 'PYTHONHOME', 'NODE_OPTIONS', 'NODE_PATH'):
            native_env.pop(name, None)
        native_env.update({key: value for key, value in environment.items() if key.startswith('PYTHON')})
        step('engine-source', [*python, 'tools/packaging/workbench_engine.py', 'check-source'])
        if check_only:
            receipt['status'] = 'preflight-verified'
            write(output / 'build-receipt.json', receipt)
            return receipt
        identity = compilation_identity(root, receipt, native_tools)
        build_output, compiled_engine = output, engine_run
        if reuse_build:
            build_output = unlinked(root / 'work/windows-release' / reuse_build)
            compiled_engine = unlinked(root / 'work/workbench-engine-build' / reuse_build)
            prior_file = unlinked(build_output / 'build-receipt.json')
            prior = read(prior_file)
            checkpoint = prior.get('compilation') if isinstance(prior, dict) else None
            if (not isinstance(checkpoint, dict) or type(checkpoint.get('schema')) is not int
                    or checkpoint.get('schema') != 1
                    or prior.get('status') != 'failed'
                    or not isinstance(prior.get('steps'), list)
                    or not any(row.get('step') == 'engine-build' and row.get('exit_code') == 0
                               for row in prior.get('steps', []) if isinstance(row, dict))):
                raise ValueError('reuse_build_checkpoint_required')
            if checkpoint.get('identity') != identity:
                raise ValueError('reuse_build_identity')
            try:
                unchanged = compilation_files(root, build_output, compiled_engine) == checkpoint.get('files')
            except (OSError, ValueError):
                unchanged = False
            if not unchanged:
                raise ValueError('reuse_build_artifacts_changed')
            receipt['reused_build'] = {'run': reuse_build, 'receipt_sha256': sha(prior_file)}
        else:
            step('desktop-window', [*python, 'tools/packaging/build_desktop_window.py',
                                    '--sdk', paths['webview2_sdk'], '--output', output / 'desktop-window'])
            step('python-package', [*python, '-m', 'build', '--outdir', output / 'dist'])
            if (len(list((output / 'dist').glob('*.whl'))) != 1
                    or len(list((output / 'dist').glob('*.tar.gz'))) != 1):
                raise ValueError('single_sdist_and_wheel_required')
            for command in ('fmt', 'test', 'clippy', 'build'):
                args = [*python, 'tools/scripts/build_observer.py', command]
                step('observer-' + command, args + (['--release'] if command == 'build' else []), env=native_env)
            metadata_file = step('cargo-metadata', [native_tools['cargo'], 'metadata', '--manifest-path',
                                 'native/observer/Cargo.toml', '--locked', '--format-version', '1',
                                 '--filter-platform', 'x86_64-pc-windows-msvc'], env=native_env)
            packages = observer_packages(read(metadata_file))
            write(output / 'cargo-packages.json', packages)
            step('engine-build', [*python, 'tools/packaging/workbench_engine.py', 'build',
                 '--node', paths['node'], '--pnpm', paths['pnpm'], '--scratch-root', root / 'work/ce-native',
                 '--run-dir', engine_run, '--materials', paths['engine_materials'], '--store-dir', store_dir])
        wheels = list((build_output / 'dist').glob('*.whl'))
        if len(wheels) != 1 or len(list((build_output / 'dist').glob('*.tar.gz'))) != 1:
            raise ValueError('single_sdist_and_wheel_required')
        engine = read(compiled_engine / 'build-provenance.json')
        if (engine.get('hostCommit') != commit or engine.get('distribution') != 'closure_verified'
                or engine.get('status') != 'build_only_verified'
                or engine.get('materials', {}).get('input_hashes') != materials):
            raise ValueError('engine_release_identity')
        if not reuse_build:
            checkpoint = {'schema': 1, 'identity': identity,
                          'files': compilation_files(root, build_output, compiled_engine)}
            receipt['compilation'] = checkpoint
        write(output / 'build-receipt.json', receipt)
        # The final collector writes notices; never let assembly alter compilation evidence.
        assembly_engine = engine_run if reuse_build else engine_run / 'assembly'
        copy_engine_receipts(root, compiled_engine, assembly_engine, checkpoint['files'])
        step('product', [*python, 'tools/packaging/build_windows.py', '--release',
             '--wheel', wheels[0], '--wheelhouse', paths['wheelhouse'], '--runtime-zip', paths['runtime_zip'],
             '--observer-release', root / 'work/native-observer/release-install', '--output', output / 'payload',
             '--cargo-packages', build_output / 'cargo-packages.json', '--inno-license', paths['inno_dir'] / 'license.txt',
             '--engine-root', engine_root, '--engine-run', assembly_engine, '--portable-git', paths['portable_git'],
             '--git-receipt', paths['git_receipt'], '--endpoints', paths['endpoints'],
             '--desktop-window', build_output / 'desktop-window'])
        product = read(output / 'payload/product.json')
        version = tomllib.loads((root / 'pyproject.toml').read_text(encoding='utf-8'))['project']['version']
        if product['source']['commit'] != commit or product['source']['dirty'] or product['version'] != version:
            raise ValueError('product_release_identity')
        step('inno-includes', [*python, 'tools/packaging/inno_include.py', '--payload', output / 'payload',
                              '--output', output / 'inno-includes'])
        step('installer', [paths['inno_dir'] / 'ISCC.exe', '/DPayloadIncludeDir=' + str(output / 'inno-includes'),
                           '/DDesktopIconFile=' + str(build_output / 'desktop-window/session-panel.ico'),
                           '/DInstallerOutputDir=' + str(output / 'installer'), 'tools/packaging/session-panel.iss'])
        installer = unlinked(output / 'installer' / f'session-panel-{version}-windows-x64.exe')
        sources = read(output / 'payload/SOURCE-AVAILABILITY.json')
        if sources['archive'] != f'session-panel-{version}-sources.zip':
            raise ValueError('source_archive_identity')
        source_bundle = unlinked(output / sources['archive'])
        if source_bundle.stat().st_size != sources['bytes'] or sha(source_bundle) != sources['sha256']:
            raise ValueError('source_archive_hash')
        if (sha(unlinked(inputs_file)) != receipt['input_file_sha256']
                or material_inputs(root, paths['engine_materials']) != materials
                or sha(unlinked(inno)) != receipt['installer_compiler']['sha256']
                or any(sha(unlinked(row['path'])) != row['sha256'] for row in receipt['input_files'].values())):
            raise ValueError('release_inputs_changed')
        if (compilation_files(root, build_output, compiled_engine) != checkpoint['files']
                or compilation_identity(root, receipt, native_tools) != identity
                or (reuse_build and sha(prior_file) != receipt['reused_build']['receipt_sha256'])):
            raise ValueError('compilation_inputs_changed')
        receipt.update(status='candidate-built-awaiting-acceptance', version=version,
                       closure=product['closure'], engine_run=str(assembly_engine),
                       installer={'path': str(installer), 'sha256': sha(installer)},
                       source_bundle={'path': str(source_bundle), 'sha256': sources['sha256']})
        write(output / 'build-receipt.json', receipt)
        return receipt
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
        receipt.update(status='failed', error=str(error))
        write(output / 'build-receipt.json', receipt)
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, required=True, help='Reviewed local input JSON (schema 1).')
    parser.add_argument('--run-name', required=True, help='New run name below this checkout work/windows-release.')
    parser.add_argument('--check-only', action='store_true', help='Validate inputs, tools and sources without compiling.')
    parser.add_argument('--store-dir', type=Path, help='Shared pnpm download cache; defaults to work/windows-release/pnpm-store.')
    parser.add_argument('--reuse-build', help='Reuse a failed run with a verified compilation checkpoint; assemble a new candidate.')
    args = parser.parse_args(argv)
    try:
        result = build(args.inputs, args.run_name, check_only=args.check_only, store_dir=args.store_dir,
                       reuse_build=args.reuse_build)
        print(json.dumps({key: value for key, value in result.items() if key not in {'steps', 'compilation'}},
                         ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.SubprocessError) as error:
        print('windows_release_failed:' + str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
