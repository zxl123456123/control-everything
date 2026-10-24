"""Fail closed on the actual bundled and copied distribution, independently of dev gaps."""

import base64
import binascii
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile
import zipfile


class DistributionError(ValueError):
    pass


def validate(unit, rows, records, external, package_notices=()):
    outputs = {row['path']: row for row in rows}
    covered, packages, imports = set(), {}, set()
    def output_path(record, name):
        name = record.get('outputMap', {}).get(name, name).replace('\\', '/')
        return Path(name).relative_to(unit).as_posix() if Path(name).is_absolute() else name
    # A Vite main bundle may refer to an independently built worker asset.
    # Only a complete graph for the same final file/hash can supply its ownership.
    providers = {(output_path(record, name), output.get('sha256'))
                 for record in records for bundle in record['bundles']
                 for name, output in bundle['outputs'].items() if output.get('inputs')}
    for record in records:
        if record.get('schema') != 1:
            raise DistributionError('distribution_record_schema')
        for bundle in record['bundles']:
            owners = {row['input']: row for row in bundle['owners']}
            for name, output in bundle['outputs'].items():
                name = output_path(record, name)
                if name not in outputs:
                    raise DistributionError('distribution_output_unlisted:' + name)
                if output.get('sha256') != outputs[name]['sha256']:
                    raise DistributionError('distribution_output_hash:' + name)
                if not output.get('inputs'):
                    if output.get('generated'):
                        generated = output['generated']
                        if output.get('imports'):
                            raise DistributionError('distribution_generated_imports:' + name)
                        if generated.get('kind') != 'mobile-esbuild-helper' or not name.startswith('out/mobile-web/assets/') or not name.endswith('.js'):
                            raise DistributionError('distribution_generated_identity:' + name)
                        anchors = [('producer', 'config/scripts/build-mobile-web-app-bundle.mjs', 'package.json'),
                                   ('tool', 'node_modules/esbuild/lib/main.js', 'node_modules/esbuild/package.json')]
                        for role, source, metadata in anchors:
                            owner = generated.get(role, {})
                            source_path, metadata_path = unit / source, unit / metadata
                            if (owner.get('input') != source or not source_path.is_file() or not metadata_path.is_file()
                                    or owner.get('sha256') != hashlib.sha256(source_path.read_bytes()).hexdigest()):
                                raise DistributionError('distribution_generated_source:' + role)
                            package = owner.get('package', {})
                            identity = json.loads(metadata_path.read_text(encoding='utf-8'))
                            if (package.get('name'), package.get('version'), package.get('metadataSha256')) != (
                                    identity.get('name'), identity.get('version'), hashlib.sha256(metadata_path.read_bytes()).hexdigest()):
                                raise DistributionError('distribution_generated_identity:' + role)
                            if role == 'tool' and (package.get('name') != 'esbuild' or package.get('version') != generated.get('toolVersion')):
                                raise DistributionError('distribution_generated_identity:tool')
                            resolve_notices(package, package_notices)
                            for notice in package['notices']:
                                notice_path = unit / notice['source']
                                if (Path(notice['source']).is_absolute() or '..' in Path(notice['source']).parts
                                        or not notice_path.is_file() or notice_path.resolve().parent != metadata_path.resolve().parent
                                        or notice_path.read_bytes().decode('utf-8') != notice['text']):
                                    raise DistributionError('distribution_generated_notice_source:' + role)
                            packages[package['name'] + '@' + package['version']] = package
                        covered.add(name)
                        continue
                    if output.get('sharedOutput') is True:
                        if (name, output['sha256']) not in providers:
                            raise DistributionError('distribution_shared_output_unresolved:' + name)
                        continue
                    raise DistributionError('distribution_output_without_inputs:' + name)
                for source in output['inputs']:
                    owner = owners.get(source)
                    info = bundle['inputs'].get(source, {})
                    if source == '__vite-browser-external' or info.get('generated'):
                        check_vite_browser_input(unit, source, owner, info, packages, package_notices)
                        continue
                    if not owner or owner.get('unresolved') and not owner.get('virtual'):
                        raise DistributionError('distribution_input_unresolved:' + source)
                    # Virtual wrappers are generated by a recorded build, with no borrowed notice.
                    if owner.get('virtual'):
                        continue
                    package = owner.get('package')
                    if not package or not package.get('name') or not package.get('version'):
                        raise DistributionError('distribution_package_unresolved:' + source)
                    key = package['name'] + '@' + package['version']
                    resolve_notices(package, package_notices)
                    check_registry_input(package, owner)
                    packages[key] = package
                covered.add(name)
                imports.update(entry['path'] for entry in output.get('imports', []) if entry.get('external'))
        for copied in record.get('copies', []):
            name = copied['output'].replace('\\', '/')
            path = Path(name)
            if path.is_absolute():
                name = path.relative_to(unit).as_posix()
            if name not in outputs:
                raise DistributionError('distribution_copy_unlisted:' + name)
            if copied.get('sha256') != outputs[name]['sha256']:
                raise DistributionError('distribution_copy_hash:' + name)
            package = copied['owner'].get('package')
            if package:
                resolve_notices(package, package_notices)
                check_registry_input(package, copied['owner'])
                packages[package['name'] + '@' + package['version']] = package
                covered.add(name)
    specifiers = set()
    for component in external:
        if not all(component.get(key) for key in ('name', 'version', 'integrity', 'output_paths', 'notices')):
            raise DistributionError('external_dependency_notice_invalid')
        check_notices(component['notices'])
        if not set(component['output_paths']).issubset(outputs):
            raise DistributionError('external_dependency_output_unlisted')
        if any(Path(name).suffix in {'.js', '.mjs', '.cjs'} and name not in covered
               for name in component['output_paths']):
            raise DistributionError('external_bundle_without_record')
        hashes = component.get('output_hashes', {})
        if (set(hashes) != set(component['output_paths'])
                or any(outputs[name]['sha256'] != digest for name, digest in hashes.items())):
            raise DistributionError('external_dependency_output_hash')
        covered.update(component['output_paths'])
        specifiers.update(component.get('specifiers', []))
    # Builtin modules have no separate copied npm runtime dependency.
    # Node's complete builtin list is recorded by the probe rather than guessed here.
    builtin = set(records[0].get('builtinModules', [])) if records else set()
    unknown_imports = imports - builtin - specifiers
    missing = set(outputs) - covered
    if unknown_imports or missing:
        raise DistributionError('distribution_unattributed:outputs=' + repr(sorted(missing)) + ':imports=' + repr(sorted(unknown_imports)))
    return {'schema': 1, 'coverage': 'actual-output-module-and-copy-closure',
            'outputs': rows, 'packages': packages, 'external': external, 'records': records}


def check_notices(notices):
    if not notices:
        raise DistributionError('distribution_notice_missing')
    for notice in notices:
        text = notice.get('text', '')
        if (not notice.get('source') or not text.strip()
                or hashlib.sha256(text.encode('utf-8')).hexdigest() != notice.get('sha256')):
            raise DistributionError('distribution_notice_hash_or_source')


def check_vite_browser_input(unit, source, owner, info, packages, prepared):
    generated = info.get('generated', {})
    code = 'module.exports = {}'
    if (source != '__vite-browser-external' or not owner or owner.get('input') != source
            or generated.get('kind') != 'vite-browser-external' or generated.get('code') != code
            or generated.get('sha256') != hashlib.sha256(code.encode()).hexdigest() or info.get('imports')):
        raise DistributionError('distribution_vite_browser_identity')
    for role, path, metadata in [('producer', 'vite.web.config.ts', 'package.json'),
                                 ('tool', 'node_modules/vite/dist/node/chunks/node.js', 'node_modules/vite/package.json')]:
        anchor = generated.get(role, {})
        file, package_file = unit / path, unit / metadata
        if (anchor.get('input') != path or not file.is_file() or not package_file.is_file()
                or hashlib.sha256(file.read_bytes()).hexdigest() != anchor.get('sha256')):
            raise DistributionError('distribution_vite_browser_source:' + role)
        package = anchor.get('package', {})
        identity = json.loads(package_file.read_text(encoding='utf-8'))
        if ((package.get('name'), package.get('version'), package.get('metadataSha256')) !=
                (identity.get('name'), identity.get('version'), hashlib.sha256(package_file.read_bytes()).hexdigest())
                or role == 'tool' and (package.get('name'), package.get('version')) != ('vite', '8.3.4')):
            raise DistributionError('distribution_vite_browser_package:' + role)
        resolve_notices(package, prepared)
        for notice in package['notices']:
            notice_file = unit / notice['source']
            if (not notice_file.is_file() or notice_file.resolve().parent != package_file.resolve().parent
                    or notice_file.read_bytes().decode('utf-8') != notice['text']):
                raise DistributionError('distribution_vite_browser_notice:' + role)
        packages[package['name'] + '@' + package['version']] = package


def registry_tarball_files(evidence, registry):
    """Read fixed registry members in memory; never extract a prepared archive."""
    try:
        archive = base64.b64decode(evidence['base64'], validate=True)
        integrity = 'sha512-' + base64.b64encode(hashlib.sha512(archive).digest()).decode('ascii')
        if integrity != registry['dist']['integrity']:
            raise DistributionError('distribution_notice_archive_integrity')
        expected_url = ('https://registry.npmjs.org/' + registry['name'] + '/-/'
                        + registry['name'].rsplit('/', 1)[-1] + '-' + registry['version'] + '.tgz')
        if registry['dist']['tarball'] != expected_url:
            raise DistributionError('distribution_notice_archive_source')
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as package:
            files, names = {}, set()
            for member in package.getmembers():
                if member.name in names:
                    raise DistributionError('distribution_notice_archive_duplicate')
                names.add(member.name)
                if member.isfile():
                    files[member.name] = package.extractfile(member).read()
        metadata = json.loads(files['package/package.json'])
        if (metadata.get('name'), metadata.get('version')) != (registry['name'], registry['version']):
            raise DistributionError('distribution_notice_archive_identity')
        return files
    except (KeyError, ValueError, binascii.Error, tarfile.TarError, OSError) as error:
        if isinstance(error, DistributionError):
            raise
        raise DistributionError('distribution_notice_archive_invalid') from error


def format_linked_notices(entry, files, registry):
    """The format release explicitly links this author's MIT license site."""
    prefix = 'https://raw.githubusercontent.com/remy/mit-license/73ebb8ca1e2280883e92498e18fcdb1c633c226c/'
    approved = {
        prefix + 'licenses/MIT.ejs': '75bd0d442091ebfb2ab8f7e3a1d507686fc7c9e87a1579558e2537e7b2b447a4',
        prefix + 'users/sjs.json': 'a7ebf86c82df7f2c28c1ef515d5a2b8e93713b33d04e93fe2e571c0d3e67982e',
        prefix + 'routes/get.js': '51c43c1fde55cdcd7714c4674bc12a1d25102820d87676eeff57d84bd032c4c2',
        prefix + 'lib/load-user.js': '44ee42b9750a1f9352b94ecc29c13799fd153170b7613c0497c9bf42b5d3192f'}
    readme = files.get('package/Readme.md', b'')
    if ((registry['name'], registry['version']) != ('format', '0.2.2')
            or b'[MIT license](http://sjs.mit-license.org)' not in readme
            or b'Copyright 2010 - 2014 Sami Samhuri sami@samhuri.net' not in readme):
        raise DistributionError('distribution_notice_linked_identity')
    materials = entry['linked_license'].get('materials', [])
    if len(materials) != len(approved) or {row.get('source'): row.get('sha256') for row in materials} != approved:
        raise DistributionError('distribution_notice_linked_materials')
    check_notices(materials)
    expected = {row['source']: row['text'] for row in materials}
    expected[registry['dist']['tarball'] + '!package/Readme.md'] = readme.decode('utf-8')
    if {row.get('source'): row.get('text') for row in entry['notices']} != expected:
        raise DistributionError('distribution_notice_linked_body')
    return expected


def react_identical_source_notices(entry, files, registry):
    """Verify this release's unchanged published code and its exact upstream license addition."""
    proof = entry['same_content_license']
    if not {'registry_metadata', 'registry_metadata_sha256', 'registry_tarball', 'original_source_zip', 'licensed_source_zip'}.issubset(proof):
        raise DistributionError('distribution_notice_same_content_missing')
    previous_raw = proof['registry_metadata']
    if hashlib.sha256(previous_raw.encode()).hexdigest() != proof['registry_metadata_sha256']:
        raise DistributionError('distribution_notice_same_content_registry')
    previous = json.loads(previous_raw)
    prior_integrity = 'sha512-UzA0npskGFA2bUqwWsSRJscuQEt7zyfVtMpCtBl/lk+k/ky6lzYImEks9jwgxTDe/B0tb5hyrYgbQv/JQaHjDw=='
    if ((registry['name'], registry['version'], previous.get('name'), previous.get('version')) !=
            ('react-remove-scroll-bar', '2.3.8', 'react-remove-scroll-bar', '2.3.7')
            or previous.get('gitHead') != '29e9fcd1eecf7d3b77a767941c4a57fe461fc1e4'
            or previous.get('dist', {}).get('integrity') != prior_integrity):
        raise DistributionError('distribution_notice_same_content_identity')
    old_files = registry_tarball_files(proof['registry_tarball'], previous)
    if set(files) != set(old_files) or any(files[name] != old_files[name] for name in files if name != 'package/package.json'):
        raise DistributionError('distribution_notice_same_content_files')
    old, current = (json.loads(package['package/package.json']) for package in (old_files, files))
    old['version'] = '2.3.8'
    if old.get('dependencies', {}).get('react-style-singleton') != '^2.2.1':
        raise DistributionError('distribution_notice_same_content_metadata')
    old['dependencies']['react-style-singleton'] = '^2.2.2'
    if current != old:
        raise DistributionError('distribution_notice_same_content_metadata')
    sources = []
    for key, digest in [('original_source_zip', 'e1962767152b429503199546c1077d0945ebe6409d19494a9e28c864f3c175ba'),
                        ('licensed_source_zip', 'e63823031f69e2aad619fb007e323cf71c8a67e86bac6aaf339c8f758514bf65')]:
        raw = base64.b64decode(proof[key], validate=True)
        if hashlib.sha256(raw).hexdigest() != digest:
            raise DistributionError('distribution_notice_same_content_source')
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            names = [name for name in archive.namelist() if not name.endswith('/')]
            sources.append({name.split('/', 1)[1]: archive.read(name) for name in names})
    original, licensed = sources
    if (set(licensed) != set(original) | {'LICENSE'} or any(licensed[name] != body for name, body in original.items())):
        raise DistributionError('distribution_notice_same_content_license_addition')
    source = 'https://raw.githubusercontent.com/theKashey/react-remove-scroll-bar/8ca9ba5ea52de03308fe8ced94f7b159a44d28ff/LICENSE'
    expected = {source: licensed['LICENSE'].decode('utf-8'),
                registry['dist']['tarball'] + '!package/README.md': files['package/README.md'].decode('utf-8')}
    if {row.get('source'): row.get('text') for row in entry['notices']} != expected:
        raise DistributionError('distribution_notice_same_content_body')
    return expected


def check_registry_input(package, owner):
    entry = package.get('noticeEvidence', {})
    if not entry.get('registry_tarball'):
        return
    marker = '/node_modules/' + package['name'] + '/'
    source = '/' + owner.get('input', '').removeprefix('\0').split('?', 1)[0].replace('\\', '/')
    files = registry_tarball_files(entry['registry_tarball'], json.loads(entry['registry_metadata']))
    member = 'package/' + source.rsplit(marker, 1)[-1]
    if marker not in source or member not in files or hashlib.sha256(files[member]).hexdigest() != owner.get('sha256'):
        raise DistributionError('distribution_notice_archive_input')


def resolve_notices(package, prepared):
    if not package.get('notices'):
        matches = [entry for entry in prepared if (entry.get('name'), entry.get('version')) ==
                   (package['name'], package['version'])]
        if len(matches) != 1:
            raise DistributionError('distribution_notice_missing:' + package['name'] + '@' + package['version'])
        entry = matches[0]
        metadata = entry.get('registry_metadata', '')
        if (entry.get('metadata_sha256') != package.get('metadataSha256')
                or hashlib.sha256(metadata.encode('utf-8')).hexdigest() != entry.get('registry_metadata_sha256')):
            raise DistributionError('distribution_notice_identity_hash')
        registry = json.loads(metadata)
        if (registry.get('name'), registry.get('version')) != (package['name'], package['version']):
            raise DistributionError('distribution_notice_registry_version')
        if entry.get('registry_tarball'):
            files = registry_tarball_files(entry['registry_tarball'], registry)
            if hashlib.sha256(files['package/package.json']).hexdigest() != package['metadataSha256']:
                raise DistributionError('distribution_notice_archive_metadata')
            additional = {}
            if entry.get('linked_license'):
                additional = format_linked_notices(entry, files, registry)
            elif entry.get('same_content_license'):
                additional = react_identical_source_notices(entry, files, registry)
            prefix = registry['dist']['tarball'] + '!'
            for notice in entry.get('notices', []):
                source = notice.get('source', '')
                if source in additional:
                    if notice.get('text') != additional[source]:
                        raise DistributionError('distribution_notice_archive_member')
                    continue
                member = source.removeprefix(prefix)
                if (not source.startswith(prefix) or not member.startswith('package/')
                        or '..' in member.split('/') or '\\' in member
                        or not re.fullmatch(r'(?:licen[cs]e|copying|notice|readme)(?:\.[^/]+)?', member.rsplit('/', 1)[-1], re.I)
                        or member not in files
                        or files[member].decode('utf-8') != notice.get('text')):
                    raise DistributionError('distribution_notice_archive_member')
        else:
            commit = registry.get('gitHead', '')
            repository = registry.get('repository', {})
            repository = repository.get('url', '') if isinstance(repository, dict) else repository
            # Registry metadata may name a transport or a moving ref; gitHead remains the fixed identity.
            repository = repository.split('#', 1)[0]
            match = re.fullmatch(r'(?:git\+)?(?:https|git)://github.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+?)(?:\.git)?', repository)
            if not match or not re.fullmatch(r'[a-f0-9]{40}', commit):
                raise DistributionError('distribution_notice_fixed_source_missing')
            prefix = 'https://raw.githubusercontent.com/' + match[1] + '/' + commit + '/'
            names = ('LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING', 'license', 'license.md', 'license.txt')
            if any(notice.get('source') not in {prefix + name for name in names}
                   for notice in entry.get('notices', [])):
                raise DistributionError('distribution_notice_source_mismatch')
        package['notices'] = entry.get('notices', [])
        package['noticeEvidence'] = entry
    check_notices(package['notices'])


def collect(unit, rows, run_dir):
    unit, run_dir = Path(unit), Path(run_dir)
    directory = unit / '.build/distribution'
    for label in ('runtime', 'web', 'mobile'):
        if not (directory / (label + '.json')).is_file():
            raise DistributionError('distribution_record_missing:' + label)
    records = [json.loads(path.read_text(encoding='utf-8')) for path in sorted(directory.glob('*.json'))]
    external_file = run_dir / 'external-dependency-notices.json'
    external = json.loads(external_file.read_text(encoding='utf-8')) if external_file.exists() else []
    required = {'pinned-node', 'windows-security', 'windows-cli-launcher', 'node-pty-conpty', 'ripgrep'}
    if not required.issubset({entry.get('name') for entry in external}):
        raise DistributionError('distribution_external_components_missing')
    prepared_file = run_dir / 'package-license-inputs.json'
    prepared = json.loads(prepared_file.read_text(encoding='utf-8')) if prepared_file.exists() else []
    result = validate(unit, rows, records, external, prepared)
    dependencies = json.loads((run_dir / 'dependency-manifest.json').read_text(encoding='utf-8'))['packages']
    locked = {row['name'] + '@' + row['version']: row for row in dependencies}
    for key, package in result['packages'].items():
        if package.get('local'):
            continue
        if key not in locked or not locked[key].get('integrity'):
            raise DistributionError('distribution_package_integrity_missing:' + key)
        if package.get('noticeEvidence') and json.loads(package['noticeEvidence']['registry_metadata']).get('dist', {}).get('integrity') != locked[key]['integrity']:
            raise DistributionError('distribution_notice_registry_integrity:' + key)
        package['integrity'] = locked[key]['integrity']
    (run_dir / 'distribution-notices.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return result
