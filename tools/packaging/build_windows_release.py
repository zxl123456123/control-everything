"""Build one local Windows candidate from reviewed inputs; never install or publish it."""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[2]
INPUTS = {'node', 'pnpm', 'engine_materials', 'wheelhouse', 'runtime_zip',
          'portable_git', 'git_receipt', 'endpoints', 'inno_dir'}
DIRECTORIES = {'engine_materials', 'wheelhouse', 'portable_git', 'inno_dir'}


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
    return module.read_inputs(directory)['input_hashes']


def build(inputs_file, run_name, *, root=ROOT, runner=subprocess.run):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', run_name):
        raise ValueError('invalid_release_run_name')
    paths = prepared_inputs(inputs_file, root)
    materials = material_inputs(root, paths['engine_materials'])
    output = unlinked(root / 'work/windows-release' / run_name)
    engine_run = unlinked(root / 'work/workbench-engine-build' / run_name)
    engine_root = root / 'web/workbench-engine'
    for path in (output, engine_run, engine_root / 'out', engine_root / '.build',
                 root / 'work/native-observer/release-install'):
        if unlinked(path).exists():
            raise ValueError('new_release_outputs_required:' + str(path))
    environment = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', PYTHONNOUSERSITE='1')
    for name in ('PYTHONPATH', 'PYTHONHOME', 'NODE_OPTIONS', 'NODE_PATH'):
        environment.pop(name, None)
    output.mkdir(parents=True)
    receipt = {'schema': 1, 'status': 'building', 'input_file_sha256': sha(inputs_file),
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
        native_env, native_tools = observer_environment(root)
        # Keep the same private toolchain for observer compilation and its license metadata.
        for name in ('PYTHONPATH', 'PYTHONHOME', 'NODE_OPTIONS', 'NODE_PATH'):
            native_env.pop(name, None)
        native_env.update({key: value for key, value in environment.items() if key.startswith('PYTHON')})
        step('engine-source', [*python, 'tools/packaging/workbench_engine.py', 'check-source'])
        step('python-package', [*python, '-m', 'build', '--outdir', output / 'dist'])
        wheels = list((output / 'dist').glob('*.whl'))
        if len(wheels) != 1 or len(list((output / 'dist').glob('*.tar.gz'))) != 1:
            raise ValueError('single_sdist_and_wheel_required')
        for command in ('fmt', 'test', 'clippy', 'build'):
            args = [*python, 'tools/scripts/build_observer.py', command]
            step('observer-' + command, args + (['--release'] if command == 'build' else []), env=native_env)
        metadata_file = step('cargo-metadata', [native_tools['cargo'], 'metadata', '--manifest-path',
                             'native/observer/Cargo.toml', '--locked', '--format-version', '1'], env=native_env)
        packages = read(metadata_file)['packages']
        if not isinstance(packages, list) or not packages:
            raise ValueError('cargo_packages_required')
        write(output / 'cargo-packages.json', packages)
        step('engine-build', [*python, 'tools/packaging/workbench_engine.py', 'build',
             '--node', paths['node'], '--pnpm', paths['pnpm'], '--scratch-root', root / 'work/ce-native',
             '--run-dir', engine_run, '--materials', paths['engine_materials']])
        engine = read(engine_run / 'build-provenance.json')
        if (engine.get('hostCommit') != commit or engine.get('distribution') != 'closure_verified'
                or engine.get('materials', {}).get('input_hashes') != materials):
            raise ValueError('engine_release_identity')
        step('product', [*python, 'tools/packaging/build_windows.py', '--release',
             '--wheel', wheels[0], '--wheelhouse', paths['wheelhouse'], '--runtime-zip', paths['runtime_zip'],
             '--observer-release', root / 'work/native-observer/release-install', '--output', output / 'payload',
             '--cargo-packages', output / 'cargo-packages.json', '--inno-license', paths['inno_dir'] / 'license.txt',
             '--engine-root', engine_root, '--engine-run', engine_run, '--portable-git', paths['portable_git'],
             '--git-receipt', paths['git_receipt'], '--endpoints', paths['endpoints']])
        product = read(output / 'payload/product.json')
        version = tomllib.loads((root / 'pyproject.toml').read_text(encoding='utf-8'))['project']['version']
        if product['source']['commit'] != commit or product['source']['dirty'] or product['version'] != version:
            raise ValueError('product_release_identity')
        step('inno-includes', [*python, 'tools/packaging/inno_include.py', '--payload', output / 'payload',
                              '--output', output / 'inno-includes'])
        step('installer', [paths['inno_dir'] / 'ISCC.exe', '/DPayloadIncludeDir=' + str(output / 'inno-includes'),
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
        receipt.update(status='candidate-built-awaiting-acceptance', version=version,
                       closure=product['closure'], engine_run=str(engine_run),
                       installer={'path': str(installer), 'sha256': sha(installer)},
                       source_bundle={'path': str(source_bundle), 'sha256': sources['sha256']})
        write(output / 'build-receipt.json', receipt)
        return receipt
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        receipt.update(status='failed', error=str(error))
        write(output / 'build-receipt.json', receipt)
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inputs', type=Path, required=True, help='Reviewed local input JSON (schema 1).')
    parser.add_argument('--run-name', required=True, help='New run name below this checkout work/windows-release.')
    args = parser.parse_args(argv)
    try:
        result = build(args.inputs, args.run_name)
        print(json.dumps({key: value for key, value in result.items() if key != 'steps'}, ensure_ascii=False))
        return 0
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        print('windows_release_failed:' + str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
