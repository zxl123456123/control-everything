"""Bind reviewed local notices to exact fresh outputs; never download or infer licenses."""

import hashlib
import importlib.util
import json
from pathlib import Path, PurePosixPath
import re
import tarfile


SPEC = importlib.util.spec_from_file_location('workbench_distribution', Path(__file__).with_name('workbench_distribution.py'))
DISTRIBUTION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DISTRIBUTION)
REQUIRED = {'pinned-node', 'windows-security', 'windows-cli-launcher', 'node-pty-conpty', 'ripgrep'}
FINAL_OUTPUTS = ('out/web/', 'out/mobile-web/', 'out/orcad/', 'out/runtimes/', 'out/node_modules/')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def relative(value):
    if (not isinstance(value, str) or not value or '\\' in value or ':' in value
            or PurePosixPath(value).is_absolute() or any(p in ('', '.', '..') for p in value.split('/'))):
        raise ValueError('materials_relative_path')
    return value


def hashed(value):
    if not isinstance(value, str) or not re.fullmatch('[a-f0-9]{64}', value):
        raise ValueError('materials_sha256')
    return value


def file(root, name, *, provider=False):
    root = Path(root).absolute()
    path = root / relative(name)
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('materials_path_escape')
    # pnpm providers may link into this unit's own virtual store, never outside it.
    if not provider and any(p.is_symlink() or p.is_junction() for p in (path, *path.parents)):
        raise ValueError('materials_link')
    if not path.is_file():
        raise ValueError('materials_file_missing:' + name)
    return path


def read_inputs(materials_dir):
    """Check static inputs before building; providers need not exist yet."""
    if not Path(materials_dir).is_absolute():
        raise ValueError('absolute_materials_directory_required')
    raw = {name: file(materials_dir, name).read_bytes() for name in
           ('external-components.json', 'package-license-inputs.json')}
    document, packages = (json.loads(raw[name]) for name in raw)
    if (not isinstance(document, dict) or set(document) != {'schema', 'components'}
            or type(document['schema']) is not int or document['schema'] != 1
            or not isinstance(document['components'], list) or not isinstance(packages, list)):
        raise ValueError('materials_schema')
    names = set()
    for component in document['components']:
        if (not isinstance(component, dict) or set(component) -
                {'name', 'version', 'notices', 'source_inputs', 'bindings', 'specifiers'}
                or not all(component.get(k) for k in ('name', 'version', 'notices', 'source_inputs', 'bindings'))
                or not all(isinstance(component[k], str) for k in ('name', 'version'))
                or component['name'] in names or component['name'].startswith('resource:')
                or not isinstance(component['notices'], list)
                or any(not isinstance(n, dict) or not all(isinstance(n.get(k), str) for k in ('source', 'text', 'sha256'))
                       for n in component['notices'])
                or not isinstance(component['source_inputs'], list) or not isinstance(component['bindings'], list)
                or not isinstance(component.get('specifiers', []), list)
                or any(not isinstance(s, str) or not s for s in component.get('specifiers', []))):
            raise ValueError('materials_component')
        names.add(component['name'])
        DISTRIBUTION.check_notices(component['notices'])
        for source in component['source_inputs']:
            if not isinstance(source, dict) or set(source) != {'path', 'sha256'}:
                raise ValueError('materials_source_fields')
            path = relative(source['path'])
            if path.startswith(('out/', '.build/', '.cache/')):
                raise ValueError('materials_source_is_generated')
            hashed(source['sha256'])
        paths = set()
        for binding in component['bindings']:
            if not isinstance(binding, dict) or set(binding) not in (
                    {'output', 'provider'}, {'output', 'archive', 'archive_sha256', 'member'}):
                raise ValueError('materials_binding_fields')
            output = relative(binding['output'])
            if output in paths:
                raise ValueError('materials_duplicate_output')
            paths.add(output)
            provider = relative(binding.get('provider', binding.get('archive')))
            if provider == output or provider.startswith(FINAL_OUTPUTS):
                raise ValueError('materials_self_provider')
            if 'archive' in binding:
                relative(binding['member'])
                hashed(binding['archive_sha256'])
    if not REQUIRED.issubset(names):
        raise ValueError('materials_required_components')
    seen = set()
    for package in packages:
        if not isinstance(package, dict) or not all(isinstance(package.get(k), str) and package[k]
                                                   for k in ('name', 'version', 'metadata_sha256')):
            raise ValueError('materials_package')
        key = (package['name'], package['version'])
        if key in seen:
            raise ValueError('materials_duplicate_package')
        seen.add(key)
        # Reuse the exact existing proof rules, including fixed exceptional packages.
        try:
            DISTRIBUTION.resolve_notices({'name': key[0], 'version': key[1], 'notices': [],
                                         'metadataSha256': hashed(package['metadata_sha256'])}, [package])
        except (AttributeError, KeyError, TypeError) as error:
            raise ValueError('materials_package') from error
    return {'components': document['components'], 'packages': packages,
            'input_hashes': {name: digest(data) for name, data in raw.items()}}


def resources(unit, outputs):
    manifest = json.loads(file(unit.parents[1], 'tools/packaging/workbench-engine-source.json').read_bytes())
    inventory = {row['path']: row for row in manifest['resources']}
    matches = {name: set() for name in inventory}
    def local(name):
        path = Path(name)
        return path.relative_to(unit).as_posix() if path.is_absolute() else relative(name)
    def source_name(name):
        path = Path(name)
        if path.is_absolute():
            return path.relative_to(unit).as_posix() if path.is_relative_to(unit) else None
        return name.replace('\\', '/')
    for path in sorted((unit / '.build/distribution').glob('*.json')):
        record = json.loads(file(unit, path.relative_to(unit).as_posix()).read_bytes())
        def output(name):
            return local(record.get('outputMap', {}).get(name, name))
        for bundle in record['bundles']:
            for name, row in bundle['outputs'].items():
                for source in row.get('inputs', {}):
                    if source_name(source) in matches:
                        matches[source_name(source)].add(output(name))
        for copied in record.get('copies', []):
            source = source_name(copied['owner']['input'])
            if source in matches:
                matches[source].add(output(copied['output']))
    result = []
    for name, resource in inventory.items():
        matches[name].update(n for n, row in outputs.items() if row['sha256'] == resource['sha256'])
        if not matches[name]:
            continue
        if digest(file(unit, name).read_bytes()) != resource['sha256'] or not resource['license_paths']:
            raise ValueError('materials_resource_changed:' + name)
        notices = []
        for license_path in resource['license_paths']:
            text = file(unit, license_path).read_bytes().decode('utf-8')
            notices.append({'source': license_path, 'text': text, 'sha256': digest(text.encode())})
        paths = sorted(matches[name])
        result.append({'name': 'resource:' + name, 'version': resource['sha256'],
                       'integrity': 'source-sha256:' + resource['sha256'], 'notices': notices,
                       'output_paths': paths, 'output_hashes': {n: outputs[n]['sha256'] for n in paths}})
    return result


def prepare(unit, rows, run_dir, materials_dir):
    unit, run_dir = Path(unit).absolute(), Path(run_dir).absolute()
    if not run_dir.is_dir() or any(p.is_symlink() or p.is_junction() for p in (run_dir, *run_dir.parents)):
        raise ValueError('materials_run_directory')
    if run_dir.resolve().is_relative_to(Path(materials_dir).resolve()):
        raise ValueError('materials_read_only_directory')
    inputs = read_inputs(materials_dir)
    outputs = {relative(row['path']): row for row in rows}
    if len(outputs) != len(rows):
        raise ValueError('materials_duplicate_output')
    for name, row in outputs.items():
        data = file(unit, name).read_bytes()
        if len(data) != row['bytes'] or digest(data) != row['sha256']:
            raise ValueError('materials_output_changed:' + name)
    external = []
    for component in inputs['components']:
        for source in component['source_inputs']:
            if digest(file(unit, source['path'], provider=True).read_bytes()) != source['sha256']:
                raise ValueError('materials_source_changed:' + source['path'])
        hashes = {}
        for binding in component['bindings']:
            name = binding['output']
            if name not in outputs:
                raise ValueError('materials_output_missing:' + name)
            provider = binding.get('provider', binding.get('archive'))
            if provider in outputs:
                raise ValueError('materials_output_is_provider')
            path = file(unit, provider, provider=True)
            resolved = path.resolve().relative_to(unit.resolve()).as_posix()
            if resolved.startswith(FINAL_OUTPUTS):
                raise ValueError('materials_self_provider')
            if path.samefile(file(unit, name)):
                raise ValueError('materials_self_provider')
            if 'archive' in binding:
                if digest(path.read_bytes()) != binding['archive_sha256']:
                    raise ValueError('materials_archive_changed')
                with tarfile.open(path, 'r:*') as archive:
                    members = [m for m in archive.getmembers() if m.name == binding['member']]
                    if len(members) != 1 or not members[0].isfile():
                        raise ValueError('materials_archive_member')
                    data = archive.extractfile(members[0]).read()
            else:
                data = path.read_bytes()
            if digest(data) != outputs[name]['sha256']:
                raise ValueError('materials_provider_mismatch:' + name)
            hashes[name] = digest(data)
        external.append({'name': component['name'], 'version': component['version'], 'notices': component['notices'],
                         'specifiers': component.get('specifiers', []), 'output_paths': sorted(hashes),
                         'output_hashes': hashes, 'integrity': 'sha256:' + digest(json.dumps(hashes, sort_keys=True).encode()),
                         'integrity_kind': 'canonical-actual-output-hash-map'})
    external.extend(resources(unit, outputs))
    receipt = {'schema': 1, 'input_hashes': inputs['input_hashes'],
               'outputs_sha256': digest(json.dumps(rows, sort_keys=True).encode())}
    pending = {}
    for name, value in [('external-dependency-notices.json', external), ('package-license-inputs.json', inputs['packages']),
                        ('materials-receipt.json', receipt)]:
        data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
        path = run_dir / name
        if path.exists() and file(run_dir, name).read_bytes() != data:
            raise ValueError('materials_existing_input_differs:' + name)
        pending[path] = data
    for path, data in pending.items():
        if not path.exists():
            with path.open('xb') as stream:
                stream.write(data)
    return receipt
