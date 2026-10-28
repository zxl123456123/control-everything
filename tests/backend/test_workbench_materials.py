"""Reviewed inputs must prove fresh providers before output hashes are rebound."""

import copy
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('workbench_materials', ROOT / 'tools/packaging/workbench_materials.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class MaterialsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.unit = self.root / 'web/workbench-engine'
        self.run = self.root / 'run'
        self.materials = self.root / 'materials'
        self.run.mkdir()
        self.materials.mkdir()
        self.write('src/native.cc', b'reviewed source')
        self.write('LICENSE', b'Complete fixture notice')
        self.notice = {'source': 'LICENSE', 'text': 'Complete fixture notice', 'sha256': M.digest(b'Complete fixture notice')}
        self.rows, components = [], []
        for name in sorted(M.REQUIRED):
            output, provider = 'out/' + name + '.bin', '.build/' + name + '.bin'
            self.write(provider, name.encode())
            self.add_output(output, name.encode())
            components.append({'name': name, 'version': '1.0', 'notices': [self.notice],
                               'source_inputs': [{'path': 'src/native.cc', 'sha256': M.digest(b'reviewed source')}],
                               'bindings': [{'output': output, 'provider': provider}]})
        self.inputs = {'schema': 1, 'components': components}
        self.save_inputs()
        (self.materials / 'package-license-inputs.json').write_text('[]', encoding='utf-8')
        manifest = self.root / 'tools/packaging/workbench-engine-source.json'
        manifest.parent.mkdir(parents=True)
        manifest.write_text('{"resources": []}', encoding='utf-8')
        (self.unit / '.build/distribution').mkdir()

    def write(self, name, data):
        path = self.unit / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def add_output(self, name, data):
        self.write(name, data)
        self.rows.append({'path': name, 'bytes': len(data), 'sha256': M.digest(data)})

    def save_inputs(self):
        (self.materials / 'external-components.json').write_text(json.dumps(self.inputs), encoding='utf-8')

    def prepare(self):
        return M.prepare(self.unit, self.rows, self.run, self.materials)

    def test_fresh_provider_binding_is_repeatable_and_materials_remain_unchanged(self):
        before = {p.name: p.read_bytes() for p in self.materials.iterdir()}
        receipt = self.prepare()
        self.assertEqual(self.prepare(), receipt)
        self.assertEqual({p.name: p.read_bytes() for p in self.materials.iterdir()}, before)
        self.assertEqual(receipt['input_hashes'], {name: M.digest(data) for name, data in before.items()})
        outputs = json.loads((self.run / 'external-dependency-notices.json').read_bytes())
        for component in outputs:
            self.assertEqual(component['output_hashes'][component['output_paths'][0]],
                             M.digest(component['name'].encode()))

    def test_preflight_does_not_need_future_outputs(self):
        for row in self.rows:
            (self.unit / row['path']).unlink()
        self.assertEqual(len(M.read_inputs(self.materials)['components']), len(M.REQUIRED))
        with self.assertRaisesRegex(ValueError, 'file_missing'):
            self.prepare()

    def test_materials_require_absolute_path_and_source_pins_cannot_be_generated(self):
        with self.assertRaisesRegex(ValueError, 'absolute_materials'):
            M.read_inputs(Path('materials'))
        for path in ('out/fake-source.cc', '.build/fake-source.cc', '.cache/fake-source.cc'):
            with self.subTest(path=path):
                self.inputs['components'][0]['source_inputs'][0]['path'] = path
                self.save_inputs()
                with self.assertRaisesRegex(ValueError, 'source_is_generated'):
                    M.read_inputs(self.materials)

    def test_any_final_output_directory_is_not_a_provider(self):
        for provider in ('out/orcad/other.node', 'out/web/old.js', 'out/runtimes/old/node.exe'):
            with self.subTest(provider=provider):
                self.inputs['components'][0]['bindings'][0]['provider'] = provider
                self.save_inputs()
                with self.assertRaisesRegex(ValueError, 'self_provider'):
                    M.read_inputs(self.materials)

    def test_changed_source_cannot_be_blessed_with_current_output_hashes(self):
        self.write('src/native.cc', b'unreviewed source')
        with self.assertRaisesRegex(ValueError, 'source_changed'):
            self.prepare()
        self.assertEqual(list(self.run.iterdir()), [])

    def test_provider_bytes_and_output_manifest_both_must_match(self):
        binding = self.inputs['components'][0]['bindings'][0]
        self.write(binding['provider'], b'wrong provider')
        with self.assertRaisesRegex(ValueError, 'provider_mismatch'):
            self.prepare()
        self.write(binding['output'], b'changed output')
        with self.assertRaisesRegex(ValueError, 'output_changed'):
            self.prepare()

    def test_unknown_or_renamed_binding_and_self_provider_are_rejected(self):
        binding = self.inputs['components'][0]['bindings'][0]
        binding['output'] = 'out/new-name.bin'
        self.save_inputs()
        with self.assertRaisesRegex(ValueError, 'output_missing'):
            self.prepare()
        binding['provider'] = binding['output']
        self.save_inputs()
        with self.assertRaisesRegex(ValueError, 'self_provider'):
            M.read_inputs(self.materials)

    def test_old_generated_json_is_not_a_reviewed_template(self):
        self.inputs['components'][0]['output_hashes'] = {'out/fake': '0' * 64}
        self.save_inputs()
        with self.assertRaisesRegex(ValueError, 'materials_component'):
            M.read_inputs(self.materials)

    def test_path_escape_duplicate_and_missing_component_fail_in_preflight(self):
        original = copy.deepcopy(self.inputs)
        for mutate, message in [
            (lambda d: d['components'][0]['bindings'][0].update(provider='../escape'), 'relative_path'),
            (lambda d: d['components'].append(copy.deepcopy(d['components'][0])), 'materials_component'),
            (lambda d: d['components'].pop(), 'required_components'),
            (lambda d: d['components'][0]['source_inputs'][0].update(sha256='untrusted'), 'sha256'),
        ]:
            with self.subTest(message=message):
                self.inputs = copy.deepcopy(original)
                mutate(self.inputs)
                self.save_inputs()
                with self.assertRaisesRegex(ValueError, message):
                    M.read_inputs(self.materials)

    def test_wrong_schema_types_are_rejected_before_build(self):
        original = copy.deepcopy(self.inputs)
        for mutate in [lambda d: d['components'][0].update(name=[]),
                       lambda d: d['components'][0].update(notices=['invalid']),
                       lambda d: d['components'][0]['notices'][0].update(text=123),
                       lambda d: d['components'][0].update(bindings=['invalid']),
                       lambda d: d['components'][0].update(source_inputs=['invalid'])]:
            with self.subTest(mutate=mutate):
                self.inputs = copy.deepcopy(original)
                mutate(self.inputs)
                self.save_inputs()
                with self.assertRaises(ValueError):
                    M.read_inputs(self.materials)
        self.inputs = original
        self.save_inputs()
        (self.materials / 'package-license-inputs.json').write_text('[null]', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'materials_package'):
            M.read_inputs(self.materials)

    def test_output_directory_cannot_write_inside_reviewed_materials(self):
        with self.assertRaisesRegex(ValueError, 'read_only_directory'):
            M.prepare(self.unit, self.rows, self.materials, self.materials)
        nested = self.materials / 'nested-run'
        nested.mkdir()
        with self.assertRaisesRegex(ValueError, 'read_only_directory'):
            M.prepare(self.unit, self.rows, nested, self.materials)
        self.assertEqual(list(nested.iterdir()), [])

    def test_changed_notice_or_package_metadata_fails_before_build(self):
        self.inputs['components'][0]['notices'][0]['text'] = 'altered'
        self.save_inputs()
        with self.assertRaisesRegex(ValueError, 'notice_hash'):
            M.read_inputs(self.materials)
        self.inputs['components'][0]['notices'][0]['text'] = 'Complete fixture notice'
        self.save_inputs()
        registry = json.dumps({'name': 'pkg', 'version': '1'})
        package = {'name': 'pkg', 'version': '1', 'metadata_sha256': 'a' * 64,
                   'registry_metadata': registry, 'registry_metadata_sha256': 'b' * 64, 'notices': [self.notice]}
        (self.materials / 'package-license-inputs.json').write_text(json.dumps([package]), encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'identity_hash'):
            M.read_inputs(self.materials)

    def test_fixed_archive_member_and_archive_identity_are_checked(self):
        component = self.inputs['components'][0]
        path = self.unit / '.build/native.tgz'
        raw = component['name'].encode()
        with tarfile.open(path, 'w:gz') as archive:
            member = tarfile.TarInfo('package/native.bin')
            member.size = len(raw)
            archive.addfile(member, io.BytesIO(raw))
        component['bindings'] = [{'output': 'out/' + component['name'] + '.bin', 'archive': '.build/native.tgz',
                                  'archive_sha256': M.digest(path.read_bytes()), 'member': 'package/native.bin'}]
        self.save_inputs()
        self.prepare()
        component['bindings'][0]['member'] = 'package/missing.bin'
        self.save_inputs()
        with self.assertRaisesRegex(ValueError, 'archive_member'):
            self.prepare()
        component['bindings'][0]['member'] = 'package/native.bin'
        self.save_inputs()
        path.write_bytes(b'tampered')
        with self.assertRaisesRegex(ValueError, 'archive_changed'):
            self.prepare()

    def test_existing_different_input_is_preserved_without_partial_other_writes(self):
        target = self.run / 'package-license-inputs.json'
        target.write_bytes(b'["prior evidence"]')
        with self.assertRaisesRegex(ValueError, 'existing_input_differs'):
            self.prepare()
        self.assertEqual(target.read_bytes(), b'["prior evidence"]')
        self.assertEqual([p.name for p in self.run.iterdir()], ['package-license-inputs.json'])

    def test_resources_follow_exact_graph_and_known_source_bytes(self):
        self.write('resources/logo.bin', b'reviewed resource')
        self.add_output('out/web/main.js', b'generated bundle')
        resources = [{'path': 'resources/logo.bin', 'sha256': M.digest(b'reviewed resource'), 'license_paths': ['LICENSE']}]
        (self.root / 'tools/packaging/workbench-engine-source.json').write_text(json.dumps({'resources': resources}))
        record = {'bundles': [{'outputs': {'out/web/main.js': {'inputs': {
            'resources/logo.bin': {}, '\u0000virtual:fixture': {}, '../outside.js': {}}}}}], 'copies': []}
        (self.unit / '.build/distribution/web.json').write_text(json.dumps(record))
        self.prepare()
        external = json.loads((self.run / 'external-dependency-notices.json').read_bytes())
        resource = next(c for c in external if c['name'].startswith('resource:'))
        self.assertEqual(resource['output_paths'], ['out/web/main.js'])
        self.write('resources/logo.bin', b'unreviewed resource')
        with self.assertRaisesRegex(ValueError, 'resource_changed'):
            self.prepare()

    def test_unclaimed_new_output_is_left_for_final_collector_to_reject(self):
        self.add_output('out/unclaimed.bin', b'not a known resource')
        self.prepare()
        external = json.loads((self.run / 'external-dependency-notices.json').read_bytes())
        with self.assertRaisesRegex(ValueError, 'distribution_unattributed'):
            M.DISTRIBUTION.validate(self.unit, self.rows, [], external)


if __name__ == '__main__':
    unittest.main()
