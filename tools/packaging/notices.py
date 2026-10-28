"""Collect actual license texts from the selected, locally prepared build inputs."""

from email.parser import BytesParser
import hashlib
import json
from pathlib import Path
import stat
import zipfile

SUPPLEMENT_MANIFEST = Path(__file__).with_name('wheel-notices.json')


class NoticeError(ValueError):
    pass


def license_name(name):
    return Path(name).name.upper().startswith(('LICENSE', 'LICENCE', 'COPYING', 'NOTICE'))


def regular_bytes(path):
    path = Path(path)
    for item in (path, *path.parents):
        info = item.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise NoticeError('linked_license_input')
    if not path.is_file():
        raise NoticeError('license_file_missing')
    raw = path.read_bytes()
    raw.decode('utf-8-sig')
    return raw


def wheel_supplements(wheel, name, version):
    manifest = json.loads(regular_bytes(SUPPLEMENT_MANIFEST))
    if manifest.get('schema') != 1 or type(manifest.get('wheels')) is not list:
        raise NoticeError('invalid_wheel_notice_manifest')
    rows = [row for row in manifest['wheels'] if row['name'].lower().replace('_', '-') == name.lower().replace('_', '-')]
    if not rows:
        return []
    matches = [row for row in rows if row['filename'] == wheel.name and row['version'] == version]
    if len(matches) != 1:
        raise NoticeError('unreviewed_wheel_notice:' + name)
    selected = matches[0]
    with wheel.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != selected['sha256']:
            raise NoticeError('wheel_notice_hash_mismatch:' + name)
    if not selected['notices']:
        raise NoticeError('empty_wheel_notice_supplement:' + name)
    result = []
    for row in selected['notices']:
        filename = row['file']
        if Path(filename).name != filename or Path(filename).suffix != '.txt':
            raise NoticeError('invalid_supplement_license_path')
        raw = regular_bytes(SUPPLEMENT_MANIFEST.parent / 'wheel-notices' / filename)
        if hashlib.sha256(raw).hexdigest() != row['sha256']:
            raise NoticeError('supplement_license_hash_mismatch:' + row['component'])
        result.append((row, raw, selected['sha256']))
    return result


def collect_notices(output, wheels, runtime_license, cargo_packages, inno_license):
    """Write text plus a path-free inventory; never invent a project license."""
    output = Path(output)
    project_license = regular_bytes(Path(__file__).resolve().parents[2] / 'LICENSE')
    entries, sections = [], ['THIRD-PARTY NOTICES\n\nControl Everything project license: MIT (see LICENSE).\n'
                            'Third-party components retain the licenses and restrictions reproduced below.\n'
                            'This technical prerelease installer and observer are unsigned.\n'
                            'Upstream signatures do not sign this combined product.\n']

    def add(component, version, source, expression, relative, raw):
        text = raw.decode('utf-8-sig')
        if not text.strip():
            raise NoticeError('empty_license_text:' + component)
        digest = hashlib.sha256(raw).hexdigest()
        entries.append({'component': component, 'version': version, 'source': source,
                        'license': expression, 'file': relative, 'sha256': digest})
        sections.append(f'\n---\n{component} {version}\nSource: {source}\nLicense: {expression}\n'
                        f'File: {relative}\nSHA256: {digest}\n\n{text}\n')

    add('CPython', '3.13.16', 'https://www.python.org/downloads/release/python-31316/',
        'See included license', 'LICENSE.txt', regular_bytes(runtime_license))
    add('Inno Setup', '7.1.0', 'https://jrsoftware.org/isinfo.php',
        'See included license', 'license.txt', regular_bytes(inno_license))
    for wheel in sorted(map(Path, wheels), key=lambda value: value.name):
        with zipfile.ZipFile(wheel) as archive:
            names = archive.namelist()
            metadata_names = [name for name in names if name.endswith('.dist-info/METADATA')]
            if len(metadata_names) != 1:
                raise NoticeError('wheel_metadata:' + wheel.name)
            metadata = BytesParser().parsebytes(archive.read(metadata_names[0]))
            name, version = metadata['Name'], metadata['Version']
            if name.lower().replace('_', '-') == 'control-everything':
                continue
            supplements = wheel_supplements(wheel, name, version)
            info = metadata_names[0].rsplit('/', 1)[0]
            declared = metadata.get_all('License-File', [])
            candidates = {value for value in names if not value.endswith('/')
                          and value.startswith(info + '/') and license_name(value)}
            for value in declared:
                matches = [path for path in (info + '/' + value, info + '/licenses/' + value) if path in names]
                if not matches:
                    raise NoticeError('wheel_declared_license_missing:' + name)
                candidates.update(matches)
            if not candidates:
                # Older wheels can carry license material outside dist-info.
                candidates = {value for value in names if not value.endswith('/') and license_name(value)}
            if not candidates and not supplements:
                raise NoticeError('wheel_license_missing:' + name)
            expression = metadata['License-Expression'] or metadata['License'] or 'See included license'
            for value in sorted(candidates):
                add(name, version, f'https://pypi.org/project/{name}/{version}/', expression,
                    value, archive.read(value))
            for row, raw, wheel_hash in supplements:
                add(row['component'], row['version'], row['source'], row['license'],
                    'wheel-notices/' + row['file'], raw)
                entries[-1].update(wheel=wheel.name, wheel_sha256=wheel_hash)
                for key in ('source_sha256', 'source_archive_sha256', 'source_package',
                            'source_package_sha256', 'source_member', 'transform', 'review_note'):
                    if key in row:
                        entries[-1][key] = row[key]
    packages = json.loads(Path(cargo_packages).read_text(encoding='utf-8'))
    if type(packages) is not list or not packages:
        raise NoticeError('cargo_packages_required')
    for package in sorted(packages, key=lambda value: (value['name'], value['version'])):
        if package['name'] == 'session-panel-observer':
            if package.get('license') != 'MIT':
                raise NoticeError('observer_project_license_mismatch')
            add(package['name'], package['version'], 'First-party product source',
                'MIT', 'LICENSE', project_license)
            entries[-1]['first_party'] = True
            continue
        root = Path(package['manifest_path']).parent
        candidates = {path for path in root.rglob('*') if path.is_file() and license_name(path.name)}
        if package.get('license_file'):
            declared = root / package['license_file']
            if not declared.is_file() or not declared.resolve().is_relative_to(root.resolve()):
                raise NoticeError('cargo_declared_license_missing:' + package['name'])
            candidates.add(declared)
        if not candidates:
            raise NoticeError('cargo_license_missing:' + package['name'])
        for path in sorted(candidates):
            add(package['name'], package['version'], f'https://crates.io/crates/{package["name"]}/{package["version"]}',
                package.get('license') or 'See included license', path.relative_to(root).as_posix(), regular_bytes(path))
    (output / 'LICENSE').write_bytes(project_license)
    (output / 'THIRD-PARTY-NOTICES.txt').write_text('\n'.join(sections), encoding='utf-8', newline='\n')
    (output / 'THIRD-PARTY-NOTICES.json').write_text(json.dumps(entries, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return entries
