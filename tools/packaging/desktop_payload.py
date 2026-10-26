"""Stage verified desktop runtime and PortableGit without consulting the developer PATH."""

import hashlib
import json
from pathlib import Path
import shutil
from urllib.parse import urlsplit
import zipfile

GIT_SHA256 = '4fc27b779829a36df77911e3f4dea09c66c790dd6c5f7dfa3b6a5479f1fe354f'
GIT_REQUIRED = {'cmd/git.exe', 'usr/bin/ssh.exe', 'usr/bin/ssh-keygen.exe', 'usr/bin/bash.exe',
                'usr/bin/sh.exe', 'usr/bin/msys-2.0.dll', 'LICENSE.txt', 'etc/package-versions.txt',
                'usr/share/licenses/openssh/LICENCE'}


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def verify_files(root, rows, api, *, exact=False):
    names = set()
    for row in rows:
        name = str(api.relative_path(row['path']))
        if name.casefold() in names:
            raise ValueError('desktop_duplicate_input')
        names.add(name.casefold())
        file = api.no_links(root / name)
        if file.stat().st_size != row['bytes'] or api.sha256(file) != row['sha256']:
            raise ValueError('desktop_input_changed:' + name)
    if exact and names != {name.casefold() for name in api.inventory(root)[0]}:
        raise ValueError('portable_git_file_set')


def notice_document(distribution, components):
    notices, entries = {}, []
    for group, values in (('engine', distribution['packages'].values()),
                          ('external', distribution['external']), ('portable_git', components)):
        for component in values:
            refs = []
            for notice in component['notices']:
                digest = notice['sha256']
                source = notice['source'].replace('\\', '/')
                if ':' in source and not source.startswith(('https://', 'http://')):
                    source = source.rsplit('/', 1)[-1]
                entry = notices.setdefault(digest, {'text': notice['text'], 'sources': []})
                if entry['text'] != notice['text']:
                    raise ValueError('desktop_notice_hash_collision')
                if source not in entry['sources']:
                    entry['sources'].append(source)
                if digest not in refs:
                    refs.append(digest)
            entries.append({'group': group, **{key: component[key] for key in
                            ('name', 'version', 'license', 'integrity') if key in component}, 'notices': refs})
    return {'schema': 1, 'components': entries, 'notices': notices}


def source_archive(destination, receipt_root, components, api):
    destination = api.no_links(destination)
    if destination.exists():
        raise ValueError('desktop_source_archive_exists')
    materials = {}
    for component in components:
        for row in component.get('source_materials', []):
            relative = str(api.relative_path(row['path']))
            if relative.casefold() == 'source-index.json':
                raise ValueError('desktop_source_material_reserved')
            previous = materials.setdefault(relative.casefold(), (relative, row['sha256']))
            if previous != (relative, row['sha256']):
                raise ValueError('desktop_source_material_conflict')
    rows = []
    with zipfile.ZipFile(destination, 'x', compression=zipfile.ZIP_STORED, allowZip64=True) as archive:
        for relative, digest in sorted(materials.values()):
            source = api.no_links(receipt_root / relative)
            info = zipfile.ZipInfo(relative, (1980, 1, 1, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            observed, size = hashlib.sha256(), 0
            with source.open('rb') as incoming, archive.open(info, 'w', force_zip64=True) as outgoing:
                while chunk := incoming.read(1024 * 1024):
                    outgoing.write(chunk)
                    observed.update(chunk)
                    size += len(chunk)
            if observed.hexdigest() != digest:
                raise ValueError('portable_git_source_hash')
            rows.append({'path': relative, 'bytes': size, 'sha256': digest})
        index = {'schema': 1, 'files': rows, 'components': [
            {key: component[key] for key in ('name', 'version', 'license', 'source_materials', 'fulfillment')
             if key in component} for component in components]}
        info = zipfile.ZipInfo('SOURCE-INDEX.json', (1980, 1, 1, 0, 0, 0))
        archive.writestr(info, api.canonical_json(index) + b'\n', compress_type=zipfile.ZIP_DEFLATED)
    return {'schema': 1, 'archive': destination.name, 'bytes': destination.stat().st_size,
            'sha256': api.sha256(destination), 'files': rows,
            'distribution': 'Provide this exact source archive alongside the same-version installer. '
                            'Keep both downloads equally accessible; retain this index and all license notices.'}


def stage(output, engine_root, build_run, portable_git, git_receipt, endpoints, api, helpers, source_bundle=None):
    output, engine_root, build_run, portable_git = map(Path, (output, engine_root, build_run, portable_git))
    for path in (engine_root, build_run, portable_git, Path(git_receipt), Path(endpoints)):
        if not path.is_absolute():
            raise ValueError('absolute_desktop_inputs_required')
        api.no_links(path)
    config = read(endpoints)
    if set(config) != {'issuer', 'hub_origin'} or bool(config['issuer']) != bool(config['hub_origin']):
        raise ValueError('desktop_identity_fields')
    for value in config.values():
        if value:
            parsed = urlsplit(value)
            if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
                    or parsed.query or parsed.fragment):
                raise ValueError('desktop_identity_https')
    provenance = read(build_run / 'build-provenance.json')
    rows = read(build_run / 'output-manifest.json')['files']
    if provenance.get('status') != 'build_only_verified' or provenance.get('distribution') != 'closure_verified':
        raise ValueError('desktop_engine_unverified')
    source = helpers('workbench_engine').check_source(engine_root.parents[1])
    if source['sourceTreeSha256'] != provenance.get('sourceTreeSha256'):
        raise ValueError('desktop_engine_source_changed')
    verify_files(engine_root, rows, api)
    # Re-evaluate actual graph/notices instead of trusting a stale success string.
    distribution = helpers('workbench_distribution').collect(engine_root, rows, build_run)
    receipt = read(git_receipt)
    if receipt.get('archive_sha256') != GIT_SHA256 or receipt.get('version') != '2.56.0.windows.3':
        raise ValueError('portable_git_origin')
    git_rows = receipt['files']
    verify_files(portable_git, git_rows, api, exact=True)
    if not GIT_REQUIRED.issubset({row['path'] for row in git_rows}):
        raise ValueError('portable_git_runtime_missing')
    # Each component needs actual notice and corresponding source fulfillment evidence.
    components = receipt.get('components', [])
    if not components:
        raise ValueError('portable_git_license_closure_missing')
    coverage = set()
    for component in components:
        helpers('workbench_distribution').check_notices(component.get('notices', []))
        if not component.get('name') or not component.get('version') or not component.get('source'):
            raise ValueError('portable_git_component_identity')
        for row in component.get('source_materials', []):
            material = api.no_links(Path(git_receipt).parent / str(api.relative_path(row['path'])))
            if api.sha256(material) != row['sha256']:
                raise ValueError('portable_git_source_hash')
        fulfillment = component.get('fulfillment', {})
        if fulfillment.get('method') == 'notice-only':
            if component.get('license') not in {'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Zlib', 'Apache-2.0', '0BSD'}:
                raise ValueError('portable_git_fulfillment_expression')
        elif fulfillment.get('method') == 'corresponding-source':
            if not component.get('source_materials'):
                raise ValueError('portable_git_source_materials_missing')
        elif fulfillment.get('method') == 'written-offer':
            offer = fulfillment.get('offer', {})
            relative = str(api.relative_path(offer.get('path')))
            if relative not in {row['path'] for row in git_rows} or api.sha256(portable_git / relative) != offer.get('sha256'):
                raise ValueError('portable_git_source_offer_missing')
        else:
            raise ValueError('portable_git_fulfillment_missing')
        coverage.update(component.get('output_paths', []))
    if coverage != {row['path'] for row in git_rows}:
        raise ValueError('portable_git_component_coverage')
    for row in rows:
        target = output / 'workbench-engine' / row['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(engine_root / row['path'], target)
    run_target = output / 'workbench-build'
    run_target.mkdir()
    for name in ('output-manifest.json',):
        shutil.copyfile(build_run / name, run_target / name)
    runtime_provenance = {key: provenance[key] for key in
                          ('schema', 'status', 'distribution', 'sourceTreeSha256', 'hostCommit', 'artifactVersion')
                          if key in provenance}
    (run_target / 'build-provenance.json').write_bytes(api.canonical_json(runtime_provenance) + b'\n')
    helpers('build_assets').export_workbench_assets(output / 'workbench-engine', run_target)
    for row in git_rows:
        target = output / 'portable-git' / row['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(portable_git / row['path'], target)
    # Publish corresponding sources as a companion download, bound by exact bytes.
    source_bundle = Path(source_bundle) if source_bundle is not None else output.with_name(output.name + '-sources.zip')
    if not source_bundle.is_absolute() or source_bundle.resolve().is_relative_to(output.resolve()):
        raise ValueError('desktop_source_archive_location')
    availability = source_archive(source_bundle, Path(git_receipt).parent, components, api)
    (output / 'SOURCE-AVAILABILITY.json').write_bytes(api.canonical_json(availability) + b'\n')
    runtime = {'engine_root': 'workbench-engine', 'build_run': 'workbench-build',
               'git': 'portable-git/cmd/git.exe', 'ssh': 'portable-git/usr/bin/ssh.exe',
               'keygen': 'portable-git/usr/bin/ssh-keygen.exe', **config}
    (output / 'desktop-runtime.json').write_bytes(api.canonical_json(runtime) + b'\n')
    notices = notice_document(distribution, components)
    (output / 'DESKTOP-NOTICES.json').write_bytes(api.canonical_json(notices) + b'\n')
    text = []
    text.append('\nCorresponding source: ' + availability['archive'] + '\nSHA256: ' + availability['sha256']
                + '\n' + availability['distribution'] + '\n')
    for digest, notice in notices['notices'].items():
        owners = [component['name'] + ' ' + component['version'] for component in notices['components']
                  if digest in component['notices']]
        text.append('\n---\n' + ', '.join(owners) + '\n' + '\n'.join(notice['sources']) + '\n' + notice['text'] + '\n')
    with (output / 'THIRD-PARTY-NOTICES.txt').open('a', encoding='utf-8') as stream:
        stream.write(''.join(text))
    return {'engine_source': source, 'portable_git_archive_sha256': GIT_SHA256, 'source_bundle': availability}
