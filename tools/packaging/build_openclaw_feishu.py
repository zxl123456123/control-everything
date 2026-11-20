"""Verify and build the pinned Feishu source patch in an owned checkout."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
from pathlib import PurePosixPath


def pack_policy():
    return json.loads((RECIPE / 'source.json').read_text(encoding='utf-8'))['packPolicy']


def has_bundled_license(location, dependency, files, policy):
    root = f'package/{location}/'
    if any(name.startswith(root) and '/' not in name[len(root):]
           and name.rsplit('/', 1)[-1].lower().startswith(('license', 'licence', 'copying'))
           for name in files):
        return True
    name = dependency.get('name')
    version = dependency.get('version')
    if location.rsplit('/node_modules/', 1)[-1].removeprefix('node_modules/') != name:
        return False
    readme = policy['licenseReadmes'].get(name)
    if readme and version == readme['version']:
        return files.get(root + 'README.md', {}).get('sha256') == readme['sha256']
    # The published platform packages contain binary bindings for this exact fs-safe release.
    fs_safe = policy['fsSafeNativeLicense']
    binding = fs_safe['bindingSha256'].get(name)
    return (binding and version == fs_safe['version']
            and files.get(root + 'fs-safe-native.node', {}).get('sha256') == binding
            and files.get('package/node_modules/@openclaw/fs-safe/LICENSE', {}).get('sha256')
            == fs_safe['licenseSha256'])


def inspect_package(archive):
    """Read an npm archive without extracting untrusted paths or links."""
    files = {}
    contents = {}
    with tarfile.open(archive, 'r:gz') as package:
        for member in package:
            path = PurePosixPath(member.name)
            if (path.is_absolute() or '..' in path.parts or '\\' in member.name
                    or not path.parts or path.parts[0] != 'package'):
                raise ValueError('Unsafe package path')
            if member.isdir():
                continue
            if not member.isfile() or member.name in files:
                raise ValueError('Unsafe package member')
            data = package.extractfile(member).read()
            name = path.relative_to('package').as_posix()
            files[member.name] = {'size': len(data), 'sha256': digest(data)}
            contents[name] = data
    for required in ('package.json', 'openclaw.plugin.json', 'README.md', 'LICENSE'):
        if required not in contents:
            raise ValueError(f'Package missing {required}')
    manifest = json.loads(contents['package.json'])
    policy = pack_policy()
    for name, expected in policy['assets'].items():
        if files.get(f'package/{name}', {}).get('sha256') != expected:
            raise ValueError(f'Missing or changed plugin asset: {name}')
    for name in contents:
        if name.startswith('node_modules/') or name in policy['assets']:
            continue
        if not (name.startswith(('dist/', 'skills/', 'icons/')) or name in
                ('package.json', 'openclaw.plugin.json', 'README.md', 'LICENSE', 'SKILL.md')):
            raise ValueError(f'Unexpected plugin file: {name}')
    # Resolve installed dependency locations using Node's ancestor lookup order.
    manifests = {name[:-len('/package.json')]: json.loads(data)
                 for name, data in contents.items()
                 if name.startswith('node_modules/') and name.endswith('/package.json')}
    pending = [('node_modules/' + name) for name in manifest.get('bundledDependencies', [])]
    visited = set()
    while pending:
        location = pending.pop()
        if location in visited:
            continue
        if location not in manifests:
            raise ValueError(f'Missing bundled dependency: {location}')
        visited.add(location)
        dependency = manifests[location]
        if not has_bundled_license(location, dependency, files, policy):
            raise ValueError(f'Missing dependency license: {location}')
        optional = dependency.get('optionalDependencies', {})
        for name in dependency.get('dependencies', {}).keys() | optional.keys():
            ancestors = [location, *PurePosixPath(location).parents]
            candidates = [str(parent).rstrip('/') + '/node_modules/' + name
                          for parent in ancestors if str(parent) != '.'
                          and PurePosixPath(parent).name != 'node_modules']
            candidates.append('node_modules/' + name)
            resolved = next((item for item in candidates if item in manifests), None)
            if resolved:
                pending.append(resolved)
            elif name not in optional:
                raise ValueError(f'Missing bundled dependency: {candidates[-1]}')
    for name in contents:
        if name.startswith('node_modules/') and not any(
                name.startswith(location + '/') and '/node_modules/' not in name[len(location):]
                for location in visited):
            raise ValueError(f'Unexpected bundled file: {name}')
    entries = manifest.get('openclaw', {})
    for entry in [*entries.get('runtimeExtensions', []), *([entries['runtimeSetupEntry']] if entries.get('runtimeSetupEntry') else [])]:
        name = entry.removeprefix('./')
        if not name.endswith('.js') or name not in contents:
            raise ValueError(f'Package missing runtime entry: {entry}')
    return {'files': files, 'packageJson': manifest,
            'pluginJson': json.loads(contents['openclaw.plugin.json'])}

RECIPE = Path(__file__).resolve().parent / 'openclaw-feishu'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_digest(path):
    return digest(path.read_bytes().replace(b'\r\n', b'\n')) if path.is_file() else None


def pack_candidate(source, node, output, environment, receipt):
    npm = next((path.resolve() for path in (
        node.parent / '../lib/node_modules/npm/bin/npm-cli.js',
        node.parent / 'node_modules/npm/bin/npm-cli.js') if path.is_file()), None)
    if npm is None:
        raise ValueError('Selected Node toolchain has no adjacent npm CLI')
    isolated = {key: value for key, value in environment.items()
                if not key.upper().startswith(('NPM_', 'NODE_', 'PNPM_', 'COREPACK_'))}
    home = output / 'home'
    home.mkdir()
    for name in ('userconfig', 'globalconfig'):
        (output / name).write_text('', encoding='utf-8')
    isolated.update(HOME=str(home), USERPROFILE=str(home),
                    NPM_CONFIG_USERCONFIG=str(output / 'userconfig'),
                    NPM_CONFIG_GLOBALCONFIG=str(output / 'globalconfig'),
                    NPM_CONFIG_CACHE=str(output / 'npm-cache'),
                    NPM_CONFIG_REGISTRY='https://registry.npmjs.org/',
                    NPM_CONFIG_IGNORE_SCRIPTS='true',
                    OPENCLAW_NPM_PACKAGE_LOCK_REPO_ROOT=str(source),
                    OPENCLAW_PLUGIN_NPM_BUNDLE_DEPENDENCIES='1')
    receipt['npmVersion'] = subprocess.check_output(
        [str(node), str(npm), '--version'], env=isolated, text=True).strip()
    tar_dir = output / 'tar'
    tar_dir.mkdir()
    # Official overlay invokes this callback from its temporary bundled package.
    shim = output / 'pack-with-license.mjs'
    shim.write_text("import fs from 'node:fs'; import path from 'node:path'; "
                    "import {spawnSync} from 'node:child_process';\n"
                    f"const root=fs.realpathSync({json.dumps(str(output / 'tmp'))});\n"
                    "const cwd=fs.realpathSync(process.cwd()); "
                    "const relative=path.relative(root,cwd); "
                    "if(!relative || relative.startsWith('..') || path.isAbsolute(relative)) "
                    "throw new Error('Pack callback outside owned temporary staging');\n"
                    f"fs.copyFileSync({json.dumps(str(RECIPE / 'LICENSE'))},path.join(cwd,'LICENSE'));\n"
                    f"const result=spawnSync(process.execPath,[{json.dumps(str(npm))},'pack','--json',"
                    f"'--ignore-scripts','--pack-destination',{json.dumps(str(tar_dir))}],"
                    "{cwd,env:process.env,stdio:'inherit'}); "
                    "if(result.error) throw result.error; process.exitCode=result.status ?? 1;\n",
                    encoding='utf-8')
    command = [str(node), 'scripts/lib/plugin-npm-package-manifest.mjs', '--run',
               'extensions/feishu', '--', str(node), str(shim)]
    plugin = source / 'extensions/feishu'
    before = {name: (plugin / name).read_bytes() for name in ('package.json', 'openclaw.plugin.json')}
    log = output / 'pack.log'
    try:
        with log.open('wb') as stream, (output / 'pack.stdout.json').open('wb') as stdout:
            result = subprocess.run(command, cwd=source, env=isolated,
                                    stdout=stdout, stderr=stream)
        receipt['commands'].append({'argv': command, 'exitCode': result.returncode, 'log': log.name})
        if result.returncode:
            raise subprocess.CalledProcessError(result.returncode, command)
    finally:
        if any((plugin / name).read_bytes() != data for name, data in before.items()):
            raise ValueError('Official pack changed source manifests')
    archives = list(tar_dir.iterdir())
    if len(archives) != 1 or archives[0].suffix != '.tgz':
        raise ValueError('Expected exactly one npm tarball')
    pack_json = json.loads((output / 'pack.stdout.json').read_text(encoding='utf-8'))
    if len(pack_json) != 1 or pack_json[0]['filename'] != archives[0].name:
        raise ValueError('npm pack JSON does not identify the candidate')
    receipt['npmIntegrity'] = pack_json[0]['integrity']
    inspection = inspect_package(archives[0])
    runtime = source / 'extensions/feishu/dist'
    for path in runtime.rglob('*'):
        if path.is_file():
            name = 'package/dist/' + path.relative_to(runtime).as_posix()
            if inspection['files'].get(name, {}).get('sha256') != digest(path.read_bytes()):
                raise ValueError(f'Packed runtime differs: {name}')
    (output / 'package-manifest.json').write_text(json.dumps(inspection, indent=2) + '\n', encoding='utf-8')
    receipt['packageSha256'] = digest(archives[0].read_bytes())
    receipt['packageBuilt'] = True


def verify_patch_roundtrip(source, manifest, patch, output):
    checkout = output / 'patch-check'
    checkout.mkdir()
    subprocess.run(['git', 'init', '-q', str(checkout)], check=True)
    for name, hashes in manifest['files'].items():
        if hashes['originalSha256'] is None:
            continue
        target = checkout / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(subprocess.check_output(['git', 'show', f'HEAD:{name}'], cwd=source))
    apply = ['git', '-c', 'core.autocrlf=false', 'apply', '--unidiff-zero']
    subprocess.run([*apply, '--check', str(patch)], cwd=checkout, check=True)
    subprocess.run([*apply, str(patch)], cwd=checkout, check=True)
    if any(digest((checkout / name).read_bytes()) != hashes['patchedSha256'] for name, hashes in manifest['files'].items()):
        raise ValueError('Reconstructed source hash mismatch')
    subprocess.run([*apply, '--reverse', '--check', str(patch)], cwd=checkout, check=True)
    subprocess.run([*apply, '--reverse', str(patch)], cwd=checkout, check=True)
    reversed_hashes = {name: digest((checkout / name).read_bytes()) if (checkout / name).is_file() else None
                       for name in manifest['files']}
    if any(reversed_hashes[name] != hashes['originalSha256'] for name, hashes in manifest['files'].items()):
        raise ValueError('Reversed source hash mismatch')


def verify_source(source, manifest, patch):
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip()
    if head != manifest['commit']:
        raise ValueError('OpenClaw source commit mismatch')
    package = json.loads((source / 'package.json').read_text(encoding='utf-8'))
    if package['version'] != manifest['version'] or package['packageManager'] != manifest['packageManager']:
        raise ValueError('OpenClaw package/toolchain mismatch')
    if digest(patch.read_bytes()) != manifest['patchSha256']:
        raise ValueError('Feishu patch hash mismatch')
    if digest((RECIPE / 'LICENSE').read_bytes()) != manifest['licenseSha256']:
        raise ValueError('OpenClaw license hash mismatch')
    for name, hashes in manifest['files'].items():
        if hashes['originalSha256'] is not None:
            original = subprocess.check_output(['git', 'show', f'HEAD:{name}'], cwd=source)
            if digest(original) != hashes['originalSha256']:
                raise ValueError(f'Original source hash mismatch: {name}')
    status = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=all'], cwd=source, text=True)
    if any(line[3:] not in manifest['files'] for line in status.splitlines()):
        raise ValueError('Source checkout contains changes outside the registered patch')
    current = {name: source_digest(source / name) for name in manifest['files']}
    if all(current[name] == hashes['patchedSha256'] for name, hashes in manifest['files'].items()):
        subprocess.run(['git', 'apply', '--unidiff-zero', '--reverse', '--check', str(patch)], cwd=source, check=True)
        return 'patched'
    if not all(current[name] == hashes['originalSha256'] for name, hashes in manifest['files'].items()):
        raise ValueError('Source checkout is neither pristine nor the exact registered patch')
    subprocess.run(['git', 'apply', '--unidiff-zero', '--check', str(patch)], cwd=source, check=True)
    return 'pristine'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True, help='Owned checkout with independently installed dependencies')
    parser.add_argument('--node', type=Path, required=True, help='Explicit Node 24.16+ or 26.1+ executable')
    parser.add_argument('--pnpm', type=Path, required=True, help='Pinned pnpm package bin/pnpm.mjs entry point')
    parser.add_argument('--output', type=Path, required=True, help='New directory under this repository work/')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true', help='Verify source and patch without applying, testing or building')
    mode.add_argument('--pack', action='store_true', help='Build a local npm candidate after fresh tests and runtime build')
    args = parser.parse_args()
    source, node, output = args.source.resolve(), args.node.resolve(), args.output.resolve()
    root = RECIPE.parents[2]
    if not output.is_relative_to(root / 'work') or output.exists():
        raise ValueError('Output must be a new directory under repository work/')
    manifest = json.loads((RECIPE / 'source.json').read_text(encoding='utf-8'))
    patch = RECIPE / 'automation-ingress.patch'
    output.mkdir(parents=True)
    receipt = {'sourceCommit': manifest['commit'], 'patchSha256': manifest['patchSha256'],
               'status': 'failed', 'commands': [],
               'runtimeBuilt': False, 'packageBuilt': False, 'installValidated': False,
               'installablePackage': False, 'deployed': False}
    environment = os.environ.copy()
    environment['PATH'] = str(node.parent) + os.pathsep + environment['PATH']
    environment['npm_execpath'] = str(args.pnpm.resolve())
    environment['OPENCLAW_VITEST_FS_MODULE_CACHE_PATH'] = str(output / 'module-cache')
    temporary = output / 'tmp'
    temporary.mkdir()
    environment.update(TEMP=str(temporary), TMP=str(temporary), TMPDIR=str(temporary))
    try:
        state = verify_source(source, manifest, patch)
        receipt['initialSourceState'] = state
        version = subprocess.check_output([str(node), '--version'], text=True, env=environment).strip()
        receipt['nodeVersion'] = version
        major, minor, *_ = map(int, version.lstrip('v').split('.'))
        if not ((major == 24 and minor >= 16) or (major >= 26 and (major > 26 or minor >= 1))):
            raise ValueError('Unsupported Node version')
        pnpm_version = subprocess.check_output([str(node), environment['npm_execpath'], '--version'], text=True, env=environment).strip()
        receipt['pnpmVersion'] = pnpm_version
        receipt['pnpmEntry'] = environment['npm_execpath']
        if pnpm_version != manifest['packageManager'].split('@', 1)[1].split('+', 1)[0]:
            raise ValueError('Pinned pnpm version mismatch')
        verify_patch_roundtrip(source, manifest, patch, output)
        receipt['patchRoundtripVerified'] = True
        if args.check:
            receipt['status'] = 'verified'
            return
        if state == 'pristine':
            subprocess.run(['git', 'apply', '--unidiff-zero', str(patch)], cwd=source, check=True)
            if any(source_digest(source / name) != hashes['patchedSha256'] for name, hashes in manifest['files'].items()):
                raise ValueError('Applied source hash mismatch')
        commands = [[str(node), 'scripts/test-projects.mts', *manifest['tests'], '--', '--maxWorkers=1'],
                    [str(node), *manifest['runtimeBuild']]]
        for index, command in enumerate(commands, 1):
            log = output / f'command-{index}.log'
            with log.open('wb') as stream:
                result = subprocess.run(command, cwd=source, env=environment, stdout=stream, stderr=subprocess.STDOUT)
            receipt['commands'].append({'argv': command, 'exitCode': result.returncode, 'log': log.name})
            if result.returncode:
                raise subprocess.CalledProcessError(result.returncode, command)
        runtime = source / manifest['runtimeOutput']
        if not (runtime / 'index.js').is_file():
            raise ValueError('Upstream runtime build did not produce dist/index.js')
        shutil.copytree(runtime, output / 'runtime')
        receipt['runtimeFiles'] = {path.relative_to(runtime).as_posix(): digest(path.read_bytes())
                                   for path in sorted(runtime.rglob('*')) if path.is_file()}
        receipt['runtimeBuilt'] = True
        if args.pack:
            pack_candidate(source, node, output, environment, receipt)
        receipt['status'] = 'built'
    except Exception as error:
        receipt['error'] = str(error)
        raise
    finally:
        (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
