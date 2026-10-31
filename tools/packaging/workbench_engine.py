"""Build the fixed workspace source unit; this entry never starts its runtime."""

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
UNIT = 'web/workbench-engine'
SOURCE_MANIFEST = 'tools/packaging/workbench-engine-source.json'
UPSTREAM = '32370a5e05a22935adb79f6cbf83a3228fe879ac'
REPOSITORY = 'https://github.com/stablyai/orca'
GENERATED_TREES = {'out', '.build', '.cache', 'mobile/.cache', 'mobile/.expo',
                   'src/packages/process-host/dist', 'native/windows-cli-launcher/target',
                   'native/windows-agent-hook/target', 'native/windows-agent-hook/.build'}
MOBILE_GENERATED = {
    'mobile/src/terminal/terminal-webview-engine.generated.ts',
    'mobile/src/terminal/terminal-webview-engine-css.generated.ts',
    'mobile/src/terminal/terminal-webview-document-script.generated.ts',
    'mobile/src/components/pr-sidebar/mermaid-page-engine.generated.ts',
}


class BuildError(ValueError):
    pass


def sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def relative_path(value):
    if (not isinstance(value, str) or not value or '\\' in value or ':' in value
            or any(ord(char) < 32 for char in value)):
        raise BuildError('invalid_relative_path')
    path = PurePosixPath(value)
    if (path.is_absolute() or path.as_posix() != value
            or any(part in {'.', '..'} or part.rstrip(' .') != part for part in path.parts)):
        raise BuildError('invalid_relative_path')
    return value


def unlinked(path):
    path = Path(path).absolute()
    for item in (path, *path.parents):
        if not item.exists() and not item.is_symlink():
            continue
        info = item.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise BuildError('linked_path')
    return path


def owned_directory(path, parent, *, fresh=False):
    if not Path(path).is_absolute():
        raise BuildError('absolute_directory_required')
    path, parent = unlinked(path), unlinked(parent)
    if not path.is_absolute() or path == parent or not path.resolve().is_relative_to(parent.resolve()):
        raise BuildError('directory_outside_owned_root')
    if fresh and path.exists():
        raise BuildError('run_directory_exists')
    return path


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def checked(command, *, cwd, env=None, input=None):
    result = subprocess.run(list(map(str, command)), cwd=cwd, env=env, input=input,
                            capture_output=True, text=True, encoding='utf-8', errors='strict')
    if result.returncode:
        raise BuildError('command_failed:' + str(command[0]) + ':' + str(result.returncode))
    return result.stdout.strip()


def tree_files(directory):
    files = []
    for current, directories, names in os.walk(directory, followlinks=False):
        for name in (*directories, *names):
            unlinked(Path(current) / name)
        files.extend((Path(current) / name).relative_to(directory).as_posix() for name in names)
    return sorted(files)


def source_files(directory):
    files = []
    for current, directories, names in os.walk(directory, followlinks=False):
        relative = Path(current).relative_to(directory)
        directories[:] = [name for name in directories if name != 'node_modules'
                          and (relative / name).as_posix() not in GENERATED_TREES]
        for name in (*directories, *names):
            unlinked(Path(current) / name)
        files.extend((relative / name).as_posix() for name in names
                     if (relative / name).as_posix() not in MOBILE_GENERATED)
    return set(files)


def check_source(root=ROOT):
    unit = unlinked(root / UNIT)
    manifest = read_json(unlinked(root / SOURCE_MANIFEST))
    if (manifest.get('schema') != 1 or manifest.get('unit') != UNIT
            or manifest.get('scope') != 'source-and-build-only'
            or manifest.get('upstream') != {'repository': REPOSITORY, 'commit': UPSTREAM}):
        raise BuildError('source_manifest_identity')
    rows = manifest['files']
    paths = [relative_path(row['path']) for row in rows]
    local = {relative_path(path) for path in manifest['local_files']}
    adapted = {relative_path(row['path']): row for row in manifest['adapted_files']}
    if not paths or len(paths) != len(set(paths)) or not set(adapted).issubset(paths):
        raise BuildError('source_manifest_paths')
    expected = set(paths) | local
    observed = source_files(unit)
    if observed != expected:
        raise BuildError('source_file_set_mismatch:missing=' + repr(sorted(expected - observed)[:20])
                         + ':unexpected=' + repr(sorted(observed - expected)[:20]))
    # Git applies this path's actual attributes, including -text patches and binaries.
    blobs = checked(['git', 'hash-object', '--stdin-paths'], cwd=root,
                    input=''.join(f'{UNIT}/{path}\n' for path in paths)).splitlines()
    if len(blobs) != len(paths):
        raise BuildError('source_blob_count')
    actual = {}
    for row, blob in zip(rows, blobs):
        path = row['path']
        digest = sha256(unit / path)
        actual[path] = digest
        if path in adapted:
            change = adapted[path]
            if change['upstream_sha256'] != row['sha256'] or change['current_sha256'] != digest or not change['reason']:
                raise BuildError('adapted_source_mismatch:' + path)
        elif blob != row['git_blob']:
            raise BuildError('source_blob_mismatch:' + path)
    for path in sorted(local - set(paths)):
        raw = (unit / path).read_bytes()
        raw.decode('utf-8')
        actual[path] = hashlib.sha256(raw).hexdigest()
    for resource in manifest['resources']:
        path = relative_path(resource['path'])
        if path not in actual or actual[path] != resource['sha256']:
            raise BuildError('resource_hash_mismatch:' + path)
        if not resource['license_paths'] or any(relative_path(p) not in expected for p in resource['license_paths']):
            raise BuildError('resource_license_missing:' + path)
    origin = read_json(unit / 'build-origin.json')
    if origin != {'repository': REPOSITORY, 'upstreamCommit': UPSTREAM}:
        raise BuildError('build_origin_mismatch')
    # Provider artwork remains the upstream UI contract, not a replacement fallback.
    for map_path in ('src/renderer/src/lib/agent-favicon-assets.ts', 'mobile/src/components/mobile-agent-icon-assets.ts'):
        text = (unit / map_path).read_text(encoding='utf-8')
        for icon in re.findall(r'agent-icons/([^\s\'"/]+\.png)', text):
            if 'src/shared/agent-icons/' + icon not in actual:
                raise BuildError('provider_icon_missing:' + icon)
    if 'resources/build/icon.ico' not in {row['path'] for row in manifest['resources']}:
        raise BuildError('launcher_icon_missing')
    canonical = ''.join(f'{path}\0{actual[path]}\n' for path in sorted(actual))
    return {'upstreamCommit': UPSTREAM, 'sourceTreeSha256': hashlib.sha256(canonical.encode()).hexdigest(),
            'fileCount': len(actual), 'manifestSha256': sha256(root / SOURCE_MANIFEST)}


def build_commands(node, pnpm, unit, run_dir, scratch, store_dir=None):
    install = ['install', '--frozen-lockfile', '--ignore-scripts', '--store-dir', str(store_dir or run_dir / 'store')]
    return [
        ('install-root', unit, [pnpm, *install]),
        ('install-mobile', unit / 'mobile', [pnpm, *install]),
        ('packages', unit, [pnpm, 'run', 'build:packages']),
        ('mobile-generated', unit / 'mobile', [pnpm, 'run', 'postinstall']),
        ('runtime-pin', unit, [node, 'config/scripts/check-node-runtime-pin.mjs']),
        ('mobile-web', unit, [pnpm, 'run', 'build:mobile-web']),
        ('process-tree', unit, [node, 'config/scripts/build-windows-process-tree-addon.mjs', '--arch=x64', '--scratch-root=' + str(scratch)]),
        ('web', unit, [pnpm, 'run', 'build:web']),
        ('runtime', unit, [pnpm, 'run', 'build:orcad']),
    ]


def build_environment(node, pnpm):
    env = dict(os.environ)
    for key in ('ORCA_PNPM_FORCE_GLOBAL_VIRTUAL_STORE_IN_CI', 'NODE_OPTIONS', 'ORCAD_OUT_DIR',
                'ORCAD_BUILD_TARGET', 'ORCAD_NODE_RUNTIME_PATH', 'ORCAD_PREBUILDS_DIR'):
        env.pop(key, None)
    env['ORCA_PNPM_GLOBAL_VIRTUAL_STORE'] = '0'
    env['PATH'] = os.pathsep.join((str(node.parent), str(pnpm.parent), env.get('PATH', '')))
    return env


def run_steps(steps, run_dir, env):
    receipt_file = run_dir / 'steps.json'
    receipts = read_json(receipt_file) if receipt_file.exists() else []
    for name, cwd, command in steps:
        log_name = name + '.log'
        with (run_dir / log_name).open('wb') as log:
            result = subprocess.run(list(map(str, command)), cwd=cwd, env=env,
                                    stdout=log, stderr=subprocess.STDOUT, shell=False)
        receipts.append({'step': name, 'exitCode': result.returncode, 'log': log_name})
        write_json(run_dir / 'steps.json', receipts)
        if result.returncode:
            raise BuildError('build_step_failed:' + name + ':' + str(result.returncode))
    return receipts


# PNPM 12 stores package-manager dependencies and workspace dependencies in separate documents.
LOCK_PACKAGES_READER = r"""
function readLockPackages(source, yaml) {
 const documents=yaml.parseAllDocuments(source, {uniqueKeys:true});
 const errors=documents.flatMap(document=>document.errors);
 if(errors.length) throw new AggregateError(errors, 'lock_yaml_errors');
 if(!documents.length) throw Error('lock_documents_missing');
 const packages=Object.create(null);
 for(const document of documents) {
  for(const warning of document.warnings) console.warn(warning);
  const value=document.toJS();
  if(!value || Array.isArray(value) || value.lockfileVersion!=='9.0' ||
     !value.packages || typeof value.packages!=='object' || Array.isArray(value.packages)) {
   throw Error('lock_packages_document_invalid');
  }
  for(const [key, entry] of Object.entries(value.packages)) {
   if(Object.hasOwn(packages,key)) throw Error('duplicate_lock_package:'+key);
   if(!entry || typeof entry!=='object' || Array.isArray(entry)) throw Error('lock_package_invalid:'+key);
   packages[key]=entry;
  }
 }
 return packages;
}
"""


# Executes only readers and existing artifact guards, never the runtime entry.
OUTPUT_PROBE = LOCK_PACKAGES_READER + r"""
import {createRequire} from 'node:module';
import {readFileSync, readdirSync, existsSync, realpathSync} from 'node:fs';
import {join, dirname, relative} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.cwd(), req=createRequire(join(root,'package.json'));
const load=p=>import(pathToFileURL(join(root,p)).href);
const {assertMobileWebBundleBuilt}=req('./config/scripts/verify-packaged-mobile-web-bundle.cjs');
const mobile=assertMobileWebBundleBuilt(join(root,'out/mobile-web'));
const {orcadArtifactFilenames,orcadNodeRuntimeRelativePath}=await load('src/shared/orcad-artifacts.ts');
const {NODE_RUNTIME_PIN,NODE_RUNTIME_ASSETS}=await load('src/shared/node-runtime-pin.ts');
const {readOrcadMobileWebAssetFilenames}=await load('config/scripts/orcad-mobile-web-bundle.mjs');
const {computeOrcadFullVersion}=await load('config/scripts/orcad-artifact-version.mjs');
const {orcadAgentBrowserNativeName}=await load('src/shared/orcad-agent-browser-name.ts');
const slot=join(root,'out/orcad'), target=readFileSync(join(slot,'.server-target'),'utf8').trim();
if(target!=='win32-x64') throw Error('unexpected_runtime_target');
const browser=orcadAgentBrowserNativeName('win32','x64');
const optional=existsSync(join(slot,browser))?[browser]:[];
const runtime=[...orcadArtifactFilenames(target,readOrcadMobileWebAssetFilenames(slot)),...optional,'.version'];
const version=computeOrcadFullVersion(slot,{target,agentBrowserFilename:optional[0]});
if(readFileSync(join(slot,'.version'),'utf8').trim()!==version) throw Error('runtime_version_mismatch');
const nodeAsset=NODE_RUNTIME_ASSETS[target];
const node=relative(root,join(slot,...orcadNodeRuntimeRelativePath(target,nodeAsset.executableSha256))).replaceAll('\\','/');
const vite=JSON.parse(readFileSync(join(root,'out/web/.vite/manifest.json'),'utf8'));
const web=new Set(['web-index.html','.vite/manifest.json']);
for(const row of Object.values(vite)) for(const path of [row.file,...(row.css??[]),...(row.assets??[])]) web.add(path);
const pdf=dirname(req.resolve('pdfjs-dist/package.json'));
const walk=(dir,prefix='')=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]);
const newsCore=join(root,'out/node_modules/playwright-core');
const newsCorePackage=JSON.parse(readFileSync(join(newsCore,'package.json'),'utf8'));
if(newsCorePackage.name!=='playwright-core'||newsCorePackage.version!=='1.64.0'||
 JSON.parse(readFileSync(join(root,'package.json'),'utf8')).devDependencies?.['playwright-core']!==newsCorePackage.version)
 throw Error('news_playwright_core_identity');
const newsRuntime={version:newsCorePackage.version,files:walk(newsCore).sort()};
for(const dir of ['cmaps','standard_fonts','wasm']) for(const path of walk(join(pdf,dir))) web.add(dir+'/'+path);
const yaml=req('yaml'), dependencies=[];
for(const base of ['', 'mobile']) {
 const packages=readLockPackages(readFileSync(join(root,base,'pnpm-lock.yaml'),'utf8'),yaml);
 const virtual=join(root,base,'node_modules/.pnpm');
 for(const entry of readdirSync(virtual,{withFileTypes:true}).filter(e=>e.isDirectory())) {
  const modules=join(virtual,entry.name,'node_modules'); if(!existsSync(modules)) continue;
  for(const item of readdirSync(modules,{withFileTypes:true})) {
   const names=item.name.startsWith('@')?readdirSync(join(modules,item.name)).map(n=>item.name+'/'+n):[item.name];
   for(const name of names) {
    const dir=join(modules,name); if(!existsSync(join(dir,'package.json'))) continue;
    const physical=realpathSync(dir); if(!physical.startsWith(realpathSync(join(virtual,entry.name)))) continue;
    const pkg=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
    const key=pkg.name+'@'+pkg.version, locked=packages[key];
    if(!locked) continue;
    const licenses=readdirSync(dir).filter(n=>/^(licen[sc]e|copying|notice)(\.|$|-)/i.test(n)).filter(n=>!readdirSync(dir,{withFileTypes:true}).find(e=>e.name===n)?.isDirectory());
    dependencies.push({workspace:base||'.',name:pkg.name,version:pkg.version,integrity:locked.resolution?.integrity??null,license:pkg.license??null,
      notices:licenses.map(n=>({path:relative(root,join(dir,n)).replaceAll('\\','/'),text:readFileSync(join(dir,n),'utf8')}))});
   }
  }
 }
}
console.log(JSON.stringify({target,artifactVersion:version,node:{...NODE_RUNTIME_PIN,...nodeAsset,path:node},
 web:[...web].sort(),mobile,runtime,newsRuntime,dependencies}));
"""


def output_rows(unit, expected):
    rows = []
    for base, names in expected.items():
        observed = tree_files(unit / base)
        if len(names) != len(set(names)) or observed != sorted(names):
            raise BuildError('output_file_set_mismatch:' + base + ':missing=' + repr(sorted(set(names) - set(observed)))
                             + ':unexpected=' + repr(sorted(set(observed) - set(names))))
        for name in sorted(names):
            path = relative_path(base + '/' + name)
            file = unlinked(unit / path)
            rows.append({'path': path, 'bytes': file.stat().st_size, 'sha256': sha256(file)})
    return rows


def material_api():
    spec = importlib.util.spec_from_file_location('workbench_materials', Path(__file__).with_name('workbench_materials.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_output(run_dir, root=ROOT, materials=None):
    run_dir = owned_directory(run_dir, root / 'work/workbench-engine-build')
    provenance = read_json(run_dir / 'build-provenance.json')
    node = unlinked(provenance['tools']['node']['path'])
    if sha256(node) != provenance['tools']['node']['sha256']:
        raise BuildError('node_tool_changed')
    unit = root / UNIT
    run_steps([('verify-web', unit, [node, 'config/scripts/verify-web-build.mjs'])], run_dir, build_environment(node, Path(provenance['tools']['pnpm']['path'])))
    probe = subprocess.run([str(node), '--input-type=module', '-e', OUTPUT_PROBE], cwd=unit,
                           capture_output=True, text=True, encoding='utf-8')
    (run_dir / 'verify-output.log').write_text(probe.stdout + probe.stderr, encoding='utf-8')
    if probe.returncode:
        raise BuildError('output_probe_failed:' + str(probe.returncode))
    data = json.loads(probe.stdout.splitlines()[-1])
    write_json(run_dir / 'output-contract.json', data)
    rows = output_rows(unit, {'out/web': data['web'],
                             'out/mobile-web': ['manifest.json', *[a['path'] for a in data['mobile']['assets']]],
                             'out/orcad': data['runtime'],
                             'out/node_modules/playwright-core': data['newsRuntime']['files']})
    node_file = unlinked(unit / relative_path(data['node']['path']))
    if sha256(node_file) != data['node']['executableSha256']:
        raise BuildError('packaged_node_hash_mismatch')
    rows.append({'path': data['node']['path'], 'bytes': node_file.stat().st_size, 'sha256': sha256(node_file)})
    write_json(run_dir / 'output-manifest.json', {'schema': 1, 'files': rows})
    dependencies = data.pop('dependencies')
    write_json(run_dir / 'dependency-manifest.json', {'schema': 1, 'coverage': 'materialized-root-and-mobile-lock-packages', 'packages': dependencies})
    if materials is not None:
        provenance['distribution'] = 'not_verified'
        write_json(run_dir / 'build-provenance.json', provenance)
        try:
            provenance['materials'] = material_api().prepare(unit, rows, run_dir, materials)
        except ValueError as error:
            raise BuildError('distribution_materials_invalid:' + str(error)) from error
    missing = sorted({row['name'] + '@' + row['version'] for row in dependencies
                      if not row['integrity'] or not row['notices']})
    external = run_dir / 'external-dependency-notices.json'
    required = {'pinned-node', 'windows-security', 'windows-cli-launcher', 'node-pty-conpty', 'ripgrep'}
    entries = read_json(external) if external.exists() else []
    covered = set()
    for entry in entries:
        if (not entry.get('version') or not entry.get('integrity') or not entry.get('notices')
                or not entry.get('output_paths') or not set(entry['output_paths']).issubset({row['path'] for row in rows})):
            raise BuildError('external_dependency_notice_invalid')
        for notice in entry['notices']:
            if (not notice.get('source') or not notice.get('text', '').strip()
                    or hashlib.sha256(notice['text'].encode('utf-8')).hexdigest() != notice.get('sha256')):
                raise BuildError('external_dependency_notice_invalid')
        covered.add(entry['name'])
    gaps = sorted(required - covered)
    write_json(run_dir / 'dependency-gaps.json', {'missingNoticesOrIntegrity': missing, 'missingExternalComponents': gaps})
    provenance.update({'status': 'build_only_verified', 'artifactVersion': data['artifactVersion'], 'packagedNode': data['node'],
                       'outputs': rows, 'targets': {'web': 'build_only_verified', 'mobile_web': 'build_only_verified',
                       'win32_x64_runtime': 'build_only_verified', 'desktop_installer': 'not_built',
                       'android_apk': 'not_built', 'native_branding': 'pending_M3'},
                       'distribution': 'not_verified'})
    write_json(run_dir / 'build-provenance.json', provenance)
    # Materialized dependency gaps remain diagnostic; only the actual distribution gates release.
    spec = importlib.util.spec_from_file_location('workbench_distribution', Path(__file__).with_name('workbench_distribution.py'))
    distribution = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(distribution)
    try:
        distribution.collect(unit, rows, run_dir)
    except (ValueError, OSError) as error:
        raise BuildError('distribution_notices_incomplete:' + str(error)) from error
    provenance['distribution'] = 'closure_verified'
    write_json(run_dir / 'build-provenance.json', provenance)
    return provenance


def build(node, pnpm, scratch_root, run_dir, root=ROOT, store_dir=None, materials=None):
    for relative in ('node_modules', 'mobile/node_modules'):
        path = root / UNIT / relative
        try:
            info = path.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise BuildError('linked_dependency_root: ' + relative)
    source = check_source(root)
    if not Path(node).is_absolute() or not Path(pnpm).is_absolute():
        raise BuildError('explicit_tools_required')
    node, pnpm = unlinked(node), unlinked(pnpm)
    if not Path(node).is_file() or not Path(pnpm).is_file() or pnpm.suffix.lower() != '.exe':
        raise BuildError('explicit_tools_required')
    run_dir = owned_directory(run_dir, root / 'work/workbench-engine-build', fresh=True)
    if store_dir is not None:
        if not Path(store_dir).is_absolute():
            raise BuildError('absolute_store_directory_required')
        store_dir = unlinked(store_dir)
        if str(store_dir) == store_dir.anchor or (store_dir.exists() and not store_dir.is_dir()):
            raise BuildError('invalid_store_directory')
    scratch = owned_directory(scratch_root, root / 'work')
    if scratch != root / 'work/ce-native':
        raise BuildError('fixed_scratch_root_required')
    if any((root / UNIT / path).exists() for path in ('out', '.build')):
        raise BuildError('existing_build_outputs: use a clean owned source checkout')
    if materials is not None:
        try:
            material_api().read_inputs(materials)
        except ValueError as error:
            raise BuildError('distribution_materials_invalid:' + str(error)) from error
    env = build_environment(node, pnpm)
    node_version = checked([node, '--version'], cwd=root, env=env)
    pnpm_version = checked([pnpm, '--version'], cwd=root, env=env)
    if not re.fullmatch(r'v24\.\d+\.\d+', node_version) or pnpm_version != '12.14.0':
        raise BuildError('tool_version_mismatch')
    host = checked(['git', 'rev-parse', 'HEAD'], cwd=root)
    if not re.fullmatch('[0-9a-f]{40}', host):
        raise BuildError('invalid_host_commit')
    dirty = bool(checked(['git', 'status', '--porcelain', '--untracked-files=normal'], cwd=root))
    run_dir.mkdir(parents=True)
    scratch.mkdir(parents=True, exist_ok=True)
    provenance = {'schema': 1, **source, 'hostCommit': host, 'dirty': dirty, 'status': 'building',
                  'downloadStore': str(store_dir or run_dir / 'store'),
                  'tools': {name: {'path': str(path), 'version': version, 'sha256': sha256(path)}
                            for name, path, version in (('node', node, node_version), ('pnpm', pnpm, pnpm_version))}}
    write_json(run_dir / 'build-provenance.json', provenance)
    run_steps(build_commands(node, pnpm, root / UNIT, run_dir, scratch, store_dir), run_dir, env)
    return check_output(run_dir, root, materials=materials)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('check-source')
    check = sub.add_parser('check-output')
    check.add_argument('--run-dir', type=Path, required=True)
    check.add_argument('--materials', type=Path, help='Reviewed material directory for binding this output.')
    compile_parser = sub.add_parser('build')
    for option in ('node', 'pnpm', 'scratch-root', 'run-dir'):
        compile_parser.add_argument('--' + option, type=Path, required=True)
    compile_parser.add_argument('--store-dir', type=Path)
    compile_parser.add_argument('--materials', type=Path, required=True, help='Reviewed external and package license inputs.')
    args = parser.parse_args(argv)
    try:
        if args.command == 'check-source':
            result = check_source()
        elif args.command == 'check-output':
            result = check_output(args.run_dir, materials=args.materials)
        else:
            result = build(args.node, args.pnpm, args.scratch_root, args.run_dir, store_dir=args.store_dir, materials=args.materials)
        print(json.dumps({key: value for key, value in result.items() if key not in {'outputs', 'tools'}}, ensure_ascii=False))
    except (BuildError, OSError, KeyError, json.JSONDecodeError) as error:
        print('workbench_engine: ' + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
