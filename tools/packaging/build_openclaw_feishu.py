"""Verify and build the pinned Feishu source patch in an owned checkout."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

RECIPE = Path(__file__).resolve().parent / 'openclaw-feishu'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_digest(path):
    return digest(path.read_bytes().replace(b'\r\n', b'\n')) if path.is_file() else None


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
    parser.add_argument('--check', action='store_true', help='Verify source and patch without applying, testing or building')
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
               'runtimeBuilt': False, 'installablePackage': False, 'deployed': False}
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
        receipt['status'] = 'built'
    except Exception as error:
        receipt['error'] = str(error)
        raise
    finally:
        (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
