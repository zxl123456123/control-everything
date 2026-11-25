"""Collect candidate notices without claiming an unchecked Darwin binary closure."""

import copy
import hashlib
import importlib.metadata
import json
from pathlib import Path
import base64
import re
import tarfile
import urllib.request

import workbench_distribution as distribution

def product_distributions():
    """Follow production requirements, including extras requested by dependencies."""
    from packaging.requirements import Requirement
    pending, found, visited = [('control-everything', frozenset())], {}, set()
    while pending:
        name, extras = pending.pop()
        installed = importlib.metadata.distribution(name)
        key = installed.metadata['Name'].lower().replace('_', '-')
        if (key, extras) in visited:
            continue
        visited.add((key, extras))
        found[key] = installed
        for text in installed.requires or ():
            requirement = Requirement(text)
            if requirement.marker is None or any(requirement.marker.evaluate({'extra': extra})
                                                  for extra in ('', *extras)):
                pending.append((requirement.name, frozenset(requirement.extras)))
    return list(found.values())


def public_notices(index, output):
    """Preserve the byte-exact published attachment; never project registry data."""
    source = index['attachment']
    path = output / 'published-DESKTOP-NOTICES.json'
    raw = path.read_bytes() if path.exists() else urllib.request.urlopen(source['url'], timeout=60).read()
    if hashlib.sha256(raw).hexdigest() != source['sha256']:
        raise ValueError('macos_published_notices_hash_mismatch')
    if not path.exists():
        path.write_bytes(raw)
    return json.loads(raw)


def reuse_notice(package, index, document):
    matches = [row for row in index['packages'] if (row['name'], row['version'], row['metadataSha256']) ==
               (package['name'], package['version'], package.get('metadataSha256'))]
    if len(matches) != 1:
        raise distribution.DistributionError('macos_notice_index_identity_missing')
    selected = matches[0]
    components = [row for row in document['components'] if row.get('group') == 'engine' and
                  (row['name'], row['version']) == (package['name'], package['version']) and
                  set(row['notices']) == {notice['sha256'] for notice in selected['notices']}]
    if not components:
        raise distribution.DistributionError('macos_published_notice_component_missing')
    notices = []
    for notice in selected['notices']:
        body = document['notices'][notice['sha256']]
        if notice['source'] not in body['sources']:
            raise distribution.DistributionError('macos_published_notice_source_mismatch')
        notices.append({**notice, 'text': body['text']})
    distribution.check_notices(notices)
    package['notices'] = notices


def collect(output, unit, *, package_inputs=None, python_distributions=None, runtime_license=None, native_notices=()):
    """Reuse reviewed package evidence only for identities in the actual build graph.

    The report separates candidate notice readiness from the unperformed native
    closure review. Python requirements identify production distributions, not
    proof that every frozen binary's embedded dependencies have been reviewed.
    """
    output, unit = Path(output), Path(unit)
    output.mkdir(parents=True, exist_ok=True)
    inputs = json.loads(Path(package_inputs).read_text(encoding='utf-8')) if package_inputs else []
    index = inputs if isinstance(inputs, dict) else None
    prepared = inputs if isinstance(inputs, list) else []
    published = None
    entries, missing, packages = [], [], {}

    def add(name, version, source, text):
        if not text.strip():
            raise ValueError('macos_empty_notice:' + name)
        entries.append({'name': name, 'version': version, 'source': source, 'text': text,
                        'sha256': hashlib.sha256(text.encode('utf-8')).hexdigest()})

    def visit(value):
        if isinstance(value, dict):
            package = value.get('package')
            if isinstance(package, dict) and package.get('name') and package.get('version'):
                key = (package['name'], package['version'], package.get('metadataSha256'))
                packages[key] = copy.deepcopy(package)
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    records = sorted((unit / '.build/distribution').glob('*.json'))
    if not records:
        raise ValueError('macos_distribution_records_missing')
    for path in records:
        visit(json.loads(path.read_text(encoding='utf-8')))
    for package in packages.values():
        try:
            if not package.get('notices') and index:
                if published is None:
                    published = public_notices(index, output)
                reuse_notice(package, index, published)
            else:
                distribution.resolve_notices(package, prepared)
        except distribution.DistributionError as error:
            missing.append({'component': package['name'] + '@' + package['version'], 'reason': str(error)})
            continue
        for notice in package['notices']:
            add(package['name'], package['version'], notice['source'], notice['text'])

    selected = product_distributions() if python_distributions is None else python_distributions
    for installed in selected:
        name, version = installed.metadata['Name'], installed.version
        if name.lower().replace('_', '-') == 'control-everything':
            continue
        files = [path for path in installed.files or () if any(
            part.endswith('.dist-info') for part in path.parts) and path.name.upper().startswith(
                ('LICENSE', 'LICENCE', 'COPYING', 'NOTICE'))]
        if not files:
            missing.append({'component': name + '@' + version, 'reason': 'installed_python_license_missing'})
        for path in files:
            add(name, version, str(path), Path(installed.locate_file(path)).read_text(encoding='utf-8-sig'))
    if runtime_license is None:
        missing.append({'component': 'CPython', 'reason': 'runtime_license_not_supplied'})
    else:
        add('CPython', '', Path(runtime_license).name, Path(runtime_license).read_text(encoding='utf-8-sig'))
    native_names = set()
    for notice in native_notices:
        raw = Path(notice['path']).read_bytes()
        if hashlib.sha256(raw).hexdigest() != notice['sha256']:
            raise ValueError('macos_native_notice_changed:' + notice['name'])
        add(notice['name'], notice['version'], notice['source'], raw.decode('utf-8-sig'))
        native_names.add(notice['name'])
    pty = unit / 'node_modules/node-pty'
    if not (pty / 'LICENSE').is_file():
        providers = list((unit / 'node_modules/.pnpm').glob('node-pty@*/node_modules/node-pty'))
        if len(providers) == 1:
            pty = providers[0]
    if (pty / 'LICENSE').is_file():
        metadata = json.loads((pty / 'package.json').read_text(encoding='utf-8'))
        add('node-pty', metadata['version'], (pty / 'LICENSE').relative_to(unit).as_posix(),
            (pty / 'LICENSE').read_text(encoding='utf-8-sig'))
        native_names.add('node-pty')
    watcher = unit / 'out/orcad/node_modules/@parcel/watcher/watcher.node'
    if watcher.is_file():
        matched = False
        target = (unit / 'out/orcad/.server-target').read_text(encoding='utf-8').strip()
        for archive in (unit / 'out/.orcad-watchers').glob(f'*/{target}/package.tgz'):
            raw = archive.read_bytes()
            version = archive.parent.parent.name
            name = '@parcel/watcher-' + target
            lock = (unit / 'pnpm-lock.yaml').read_text(encoding='utf-8')
            record = re.search(r"^  '" + re.escape(name + '@' + version) + r"':\n    resolution: \{integrity: (sha512-[^}]+)\}", lock, re.M)
            if not record or record[1] != 'sha512-' + base64.b64encode(hashlib.sha512(raw).digest()).decode():
                raise ValueError('macos_watcher_archive_integrity')
            with tarfile.open(archive, 'r:gz') as source:
                binary = source.extractfile('package/watcher.node').read()
                metadata = json.load(source.extractfile('package/package.json'))
                license_text = source.extractfile('package/LICENSE').read().decode('utf-8-sig')
            if binary != watcher.read_bytes() or (metadata['name'], metadata['version']) != (name, version):
                raise ValueError('macos_watcher_provider_mismatch')
            add(name, version, archive.relative_to(unit).as_posix() + '!package/LICENSE', license_text)
            matched = True
        if not matched:
            missing.append({'component': '@parcel/watcher-native', 'reason': 'native_notice_provider_missing'})
    ripgrep = unit / 'resources/licenses/ripgrep'
    if (ripgrep / 'LICENSE-MIT').is_file() and (ripgrep / 'RUST-CRATE-NOTICES.txt').is_file():
        for path in sorted(ripgrep.iterdir()):
            if path.is_file():
                add('ripgrep', '', path.relative_to(unit).as_posix(), path.read_text(encoding='utf-8-sig'))
        native_names.add('ripgrep')
    for name in ('Node.js', 'node-pty', 'ripgrep'):
        if name not in native_names:
            missing.append({'component': name, 'reason': 'native_notice_missing'})
    report = {'schema': 1, 'distribution': 'not_verified', 'native_closure': 'not_checked',
              'candidate_notices_ready': not missing,
              'python_inventory': 'production_requires_with_requested_dependency_extras', 'missing': missing,
              'notices': entries}
    (output / 'macos-notices.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    text = '\n\n'.join(f"{row['name']} {row['version']}\n{row['source']}\n\n{row['text']}" for row in entries)
    (output / 'THIRD-PARTY-NOTICES.txt').write_text(text + '\n', encoding='utf-8')
    return report
