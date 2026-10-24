"""Stage verified desktop runtime and PortableGit without consulting the developer PATH."""

import json
from pathlib import Path
import shutil
from urllib.parse import urlsplit

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


def stage(output, engine_root, build_run, portable_git, git_receipt, endpoints, api, helpers):
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
    for name in ('output-manifest.json', 'distribution-notices.json'):
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
    # Keep fulfillment materials with the shipped product rather than an ephemeral build directory.
    for component in components:
        for row in component.get('source_materials', []):
            relative = str(api.relative_path(row['path']))
            target = output / 'third-party-sources' / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(Path(git_receipt).parent / relative, target)
    runtime = {'engine_root': 'workbench-engine', 'build_run': 'workbench-build',
               'git': 'portable-git/cmd/git.exe', 'ssh': 'portable-git/usr/bin/ssh.exe',
               'keygen': 'portable-git/usr/bin/ssh-keygen.exe', **config}
    (output / 'desktop-runtime.json').write_bytes(api.canonical_json(runtime) + b'\n')
    notices = {'engine': distribution, 'portable_git': receipt}
    (output / 'DESKTOP-NOTICES.json').write_bytes(api.canonical_json(notices) + b'\n')
    text = []
    for component in [*distribution['packages'].values(), *distribution['external'], *components]:
        text.append('\n---\n' + component['name'] + ' ' + component['version'] + '\n')
        text.extend(notice['source'] + '\n' + notice['text'] + '\n' for notice in component['notices'])
    with (output / 'THIRD-PARTY-NOTICES.txt').open('a', encoding='utf-8') as stream:
        stream.write(''.join(text))
    return {'engine_source': source, 'portable_git_archive_sha256': GIT_SHA256}
