"""Prepare the fixed public attachment set from locally verified candidate evidence."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys

from control_everything.installation.manifest import no_links, sha256, validate_manifest

if __package__:
    from . import release_readiness as readiness
    from .build_windows import version_info
else:
    import release_readiness as readiness
    from build_windows import version_info

METADATA = ('SOURCE-AVAILABILITY.json', 'product.json', 'BUILD-INPUTS.json', 'LICENSE',
            'THIRD-PARTY-NOTICES.txt', 'THIRD-PARTY-NOTICES.json', 'DESKTOP-NOTICES.json')


def path(value):
    value = Path(value)
    readiness.require(value.is_absolute() and '..' not in value.parts, 'absolute_canonical_path_required')
    return no_links(value).resolve()


def names(version):
    version_info(version)
    return {f'session-panel-{version}-windows-x64.exe', f'session-panel-{version}-sources.zip',
            *METADATA, 'release-notes.md', 'SHA256SUMS.txt'}


def prerelease(version):
    version_info(version)
    return bool(re.search(r'(a|b|rc)[0-9]+$', version))


def checksums(assets):
    return ''.join(row['sha256'] + '  ' + row['name'] + '\n'
                   for row in sorted(assets, key=lambda row: row['name'])
                   if row['name'] != 'SHA256SUMS.txt').encode('utf-8')


def asset(file):
    file = path(file)
    return {'name': file.name, 'size': file.stat().st_size, 'sha256': sha256(file)}


def prepare(readiness_path, notes_path, output, repository):
    readiness_path, notes_path, output = map(path, (readiness_path, notes_path, output))
    original = readiness.read(readiness_path)
    candidate = path(original['build']['path']).parent
    readiness.require(not output.is_relative_to(candidate / 'payload'), 'output_inside_payload')
    output.mkdir(parents=True, exist_ok=False)
    result = {'schema': 1, 'status': 'blocked', 'errors': [], 'assets': []}
    try:
        readiness.require(isinstance(repository, str)
                          and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*', repository),
                          'repository_required')
        readiness.require(original['status'] == 'ready-for-publication-review', 'readiness_required')
        initial_reference = readiness.reference(readiness_path)
        for name in ('build', 'acceptance', 'review', 'manual_evidence'):
            readiness.checked_reference(original[name])
        recheck = output / 'readiness-recheck.json'
        current = readiness.verify(candidate, path(original['acceptance']['path']),
                                   path(original['review']['path']), recheck)
        readiness.require(current['status'] == 'ready-for-publication-review' and current == original,
                          'readiness_recheck_failed')
        notes_bytes = notes_path.read_bytes()
        readiness.require(notes_bytes.decode('utf-8').strip(), 'notes_required')
        notes_hash = hashlib.sha256(notes_bytes).hexdigest()
        version = current['product']['version']
        product_bytes = path(candidate / 'payload/product.json').read_bytes()
        product = validate_manifest(readiness.strict_json(product_bytes.decode('utf-8')))
        readiness.require({key: product[key] for key in ('version', 'closure')} == current['product'],
                          'candidate_product_changed')
        payload_rows = {row['path']: row for row in product['files']}
        result.update(repository=repository, version=version, tag='v' + version, commit=current['commit'],
                      prerelease=prerelease(version), notes_sha256=notes_hash,
                      readiness=initial_reference, readiness_recheck=readiness.reference(recheck))
        sources = {f'session-panel-{version}-windows-x64.exe': path(current['installer']['path']),
                   f'session-panel-{version}-sources.zip': path(current['source_bundle']['path']),
                   **{name: path(candidate / 'payload' / name) for name in METADATA},
                   'release-notes.md': notes_path}
        # Keep the approved hashes instead of endorsing bytes changed after recheck.
        expected = {name: {'name': name, 'size': source.stat().st_size, 'sha256': sha256(source)}
                    for name, source in sources.items()}
        for name in METADATA:
            expected[name].update({'size': len(product_bytes), 'sha256': hashlib.sha256(product_bytes).hexdigest()}
                                  if name == 'product.json' else
                                  {key: payload_rows[name][key] for key in ('size', 'sha256')})
        expected[f'session-panel-{version}-windows-x64.exe']['sha256'] = current['installer']['sha256']
        expected[f'session-panel-{version}-sources.zip']['sha256'] = current['source_bundle']['sha256']
        expected['release-notes.md'].update(size=len(notes_bytes), sha256=notes_hash)
        for name, source in sources.items():
            readiness.require(source.stat().st_size == expected[name]['size']
                              and sha256(source) == expected[name]['sha256'], 'source_asset_changed')
        public = output / 'public'
        public.mkdir()
        for name, source in sources.items():
            with path(source).open('rb') as incoming, path(public / name).open('xb') as outgoing:
                shutil.copyfileobj(incoming, outgoing)
            readiness.require(asset(public / name) == expected[name], 'copied_asset_mismatch')
        with (public / 'SHA256SUMS.txt').open('xb') as stream:
            stream.write(checksums(expected.values()))
        result['assets'] = [asset(public / name) for name in sorted(names(version))]
        readiness.require(result['notes_sha256'] == sha256(public / 'release-notes.md'), 'notes_changed')
        readiness.checked_reference(initial_reference)
        result['status'] = 'prepared-awaiting-content-review'
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        result['errors'].append(type(error).__name__ + ':' + str(error))
    with (output / 'publication.json').open('x', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    return result


def validate_bundle(plan_path):
    plan_path = path(plan_path)
    plan = readiness.read(plan_path)
    try:
        readiness.require(type(plan['schema']) is int and plan['schema'] == 1
                          and plan['status'] == 'prepared-awaiting-content-review' and plan['errors'] == [],
                          'prepared_publication_required')
        readiness.require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*', plan['repository'])
                          and plan['tag'] == 'v' + plan['version']
                          and type(plan['prerelease']) is bool and plan['prerelease'] == prerelease(plan['version'])
                          and re.fullmatch(r'[0-9a-f]{40}', plan['commit']), 'publication_identity')
        approved = readiness.read(readiness.checked_reference(plan['readiness'])['path'])
        rechecked = readiness.read(readiness.checked_reference(plan['readiness_recheck'])['path'])
        readiness.require(type(approved['schema']) is int and approved['schema'] == 1
                          and approved['status'] == 'ready-for-publication-review' and approved['errors'] == []
                          and approved == rechecked and approved['commit'] == plan['commit'], 'readiness_binding')
        for name in ('build', 'acceptance', 'review', 'manual_evidence'):
            readiness.checked_reference(approved[name])
        readiness.require(isinstance(approved['checks'], list) and approved['checks'], 'source_checks_required')
        for item in approved['checks']:
            check = readiness.read(readiness.checked_reference(item)['path'])
            for name in ('stdout', 'stderr'):
                readiness.checked_reference(check['logs'][name])
        public = path(plan_path.parent / 'public')
        expected_names = names(plan['version'])
        readiness.require(isinstance(plan['assets'], list) and len(plan['assets']) == len(expected_names)
                          and {row['name'] for row in plan['assets']} == expected_names, 'publication_assets')
        readiness.require({file.name for file in public.iterdir()} == expected_names, 'public_inventory_mismatch')
        for row in plan['assets']:
            readiness.require(set(row) == {'name', 'size', 'sha256'} and type(row['size']) is int
                              and asset(public / row['name']) == row, 'public_asset_mismatch')
        readiness.require((public / 'SHA256SUMS.txt').read_bytes() == checksums(plan['assets']), 'checksums_mismatch')
        readiness.require(sha256(public / 'release-notes.md') == plan['notes_sha256']
                          and (public / 'release-notes.md').read_text(encoding='utf-8').strip(), 'notes_mismatch')
        product = validate_manifest(readiness.read(public / 'product.json'))
        readiness.require(product['version'] == plan['version'] and product['source']['commit'] == plan['commit']
                          and product['source']['dirty'] is False
                          and {key: product[key] for key in ('version', 'closure')} == approved['product'],
                          'public_product_identity')
        sources = readiness.read(public / 'SOURCE-AVAILABILITY.json')
        installer_asset = next(row for row in plan['assets'] if row['name'] == f"session-panel-{plan['version']}-windows-x64.exe")
        source_asset = next(row for row in plan['assets'] if row['name'] == f"session-panel-{plan['version']}-sources.zip")
        readiness.require(installer_asset['sha256'] == approved['installer']['sha256']
                          and source_asset['sha256'] == approved['source_bundle']['sha256'], 'accepted_asset_mismatch')
        readiness.require(sources['archive'] == source_asset['name'] and sources['bytes'] == source_asset['size']
                          and sources['sha256'] == source_asset['sha256'], 'public_sources_identity')
    except (KeyError, TypeError, AttributeError) as error:
        raise ValueError('invalid_publication_plan') from error
    return plan


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    create = commands.add_parser('prepare')
    for name in ('readiness', 'notes', 'output'):
        create.add_argument('--' + name, required=True, type=Path)
    create.add_argument('--repository', required=True)
    check = commands.add_parser('check')
    check.add_argument('--plan', required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        result = (prepare(args.readiness, args.notes, args.output, args.repository)
                  if args.action == 'prepare' else validate_bundle(args.plan))
        print(json.dumps({'status': result['status']}, ensure_ascii=False))
        return 0 if result['status'] == 'prepared-awaiting-content-review' else 1
    except (OSError, ValueError, KeyError, TypeError) as error:
        print('release_bundle: ' + type(error).__name__, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
