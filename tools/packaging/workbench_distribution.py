"""Fail closed on the actual bundled and copied distribution, independently of dev gaps."""

import hashlib
import json
from pathlib import Path
import re


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
        commit = registry.get('gitHead', '')
        repository = registry.get('repository', {})
        repository = repository.get('url', '') if isinstance(repository, dict) else repository
        match = re.fullmatch(r'(?:git\+)?https://github.com/([^/]+/[^/]+?)(?:\.git)?', repository)
        if not match or not re.fullmatch(r'[a-f0-9]{40}', commit):
            raise DistributionError('distribution_notice_fixed_source_missing')
        prefix = 'https://raw.githubusercontent.com/' + match[1] + '/' + commit + '/'
        if any(notice.get('source') not in {prefix + name for name in ('LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING')}
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
