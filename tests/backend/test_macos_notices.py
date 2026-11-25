import hashlib
import json
import base64
import io
import tarfile
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/packaging'))
import macos_notices


class MacOSNoticesTests(unittest.TestCase):
    def test_collects_exact_watcher_provider_and_pnpm_pty_license(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = root / '.build/distribution'
            records.mkdir(parents=True)
            (records / 'runtime.json').write_text('{}')
            pty = root / 'node_modules/.pnpm/node-pty@1/node_modules/node-pty'
            pty.mkdir(parents=True)
            (pty / 'LICENSE').write_text('Fixture pty MIT')
            (pty / 'package.json').write_text('{"version":"1"}')
            watcher = root / 'out/orcad/node_modules/@parcel/watcher/watcher.node'
            watcher.parent.mkdir(parents=True)
            watcher.write_bytes(b'native fixture')
            (root / 'out/orcad/.server-target').write_text('darwin-arm64')
            archive = root / 'out/.orcad-watchers/2.5.6/darwin-arm64/package.tgz'
            archive.parent.mkdir(parents=True)
            with tarfile.open(archive, 'w:gz') as stream:
                for name, body in {'package/watcher.node': b'native fixture', 'package/LICENSE': b'Fixture watcher MIT',
                    'package/package.json': b'{"name":"@parcel/watcher-darwin-arm64","version":"2.5.6"}'}.items():
                    entry = tarfile.TarInfo(name)
                    entry.size = len(body)
                    stream.addfile(entry, io.BytesIO(body))
            integrity = base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
            (root / 'pnpm-lock.yaml').write_text("  '@parcel/watcher-darwin-arm64@2.5.6':\n    resolution: {integrity: sha512-" + integrity + '}\n')
            report = macos_notices.collect(root / 'notices', root, python_distributions=[])
            self.assertEqual({row['name'] for row in report['notices']}, {'node-pty', '@parcel/watcher-darwin-arm64'})
            watcher.write_bytes(b'wrong native fixture')
            with self.assertRaisesRegex(ValueError, 'macos_watcher_provider_mismatch'):
                macos_notices.collect(root / 'notices', root, python_distributions=[])

    def test_python_license_filename_variants(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = root / '.build/distribution'
            records.mkdir(parents=True)
            (records / 'runtime.json').write_text('{}')
            paths = [Path('fixture.dist-info/licenses/LICENCE'), Path('fixture.dist-info/licenses/LICENSE.md')]
            for path in paths:
                (root / path).parent.mkdir(parents=True, exist_ok=True)
                (root / path).write_text('Fixture MIT')
            installed = SimpleNamespace(metadata={'Name': 'fixture'}, version='1', files=paths,
                                        locate_file=lambda path: root / path)
            report = macos_notices.collect(root / 'notices', root, python_distributions=[installed])
            self.assertEqual(len(report['notices']), 2)
            self.assertFalse(any(row['component'] == 'fixture@1' for row in report['missing']))

    def test_python_inventory_follows_requested_extras_without_build_tools(self):
        rows = {name: SimpleNamespace(metadata={'Name': name}, requires=requires) for name, requires in {
            'control-everything': ['fixture[clean]', 'unused; extra == "news"'],
            'fixture': ['cleaner; extra == "clean"'], 'cleaner': []}.items()}
        with patch.object(macos_notices.importlib.metadata, 'distribution', side_effect=lambda name: rows[name]):
            selected = macos_notices.product_distributions()
        self.assertEqual({row.metadata['Name'] for row in selected}, {'control-everything', 'fixture', 'cleaner'})

    def test_public_attachment_is_preserved_and_hash_checked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            raw = b'{"components":[],"notices":{},"schema":1}\n'
            index = {'attachment': {'url': 'https://example.test/notices.json',
                                   'sha256': hashlib.sha256(raw).hexdigest()}}
            (root / 'published-DESKTOP-NOTICES.json').write_bytes(raw)
            with patch.object(macos_notices.urllib.request, 'urlopen') as network:
                macos_notices.public_notices(index, root)
                network.assert_not_called()
            self.assertEqual((root / 'published-DESKTOP-NOTICES.json').read_bytes(), raw)
            (root / 'published-DESKTOP-NOTICES.json').write_bytes(raw + b' ')
            with self.assertRaisesRegex(ValueError, 'macos_published_notices_hash_mismatch'):
                macos_notices.public_notices(index, root)

    def test_public_notice_reuse_checks_component_source_and_metadata(self):
        text = 'Fixture MIT'
        digest = hashlib.sha256(text.encode()).hexdigest()
        notice = {'source': 'https://example.test/LICENSE', 'sha256': digest}
        package = {'name': 'fixture', 'version': '1', 'metadataSha256': 'a' * 64}
        index = {'packages': [{**package, 'notices': [notice]}]}
        document = {'components': [{'group': 'engine', 'name': 'fixture', 'version': '1', 'notices': [digest]}],
                    'notices': {digest: {'sources': [notice['source']], 'text': text}}}
        macos_notices.reuse_notice(package, index, document)
        self.assertEqual(package['notices'][0]['text'], text)
        with self.assertRaisesRegex(ValueError, 'macos_notice_index_identity_missing'):
            macos_notices.reuse_notice({**package, 'metadataSha256': 'b' * 64}, index, document)
        document['notices'][digest]['sources'] = ['different']
        with self.assertRaisesRegex(ValueError, 'macos_published_notice_source_mismatch'):
            macos_notices.reuse_notice(package, index, document)

    def test_collects_actual_graph_and_keeps_closure_unverified(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = root / '.build/distribution'
            records.mkdir(parents=True)
            text = 'Fixture MIT license'
            package = {'name': 'fixture', 'version': '1', 'notices': [
                {'source': 'fixture/LICENSE', 'text': text,
                 'sha256': hashlib.sha256(text.encode()).hexdigest()}]}
            (records / 'runtime.json').write_text(json.dumps({'bundles': [{'owners': [{'package': package}]}]}))
            license_file = root / 'LICENSE.txt'
            license_file.write_text('Fixture PSF license')
            pty = root / 'node_modules/node-pty'
            pty.mkdir(parents=True)
            (pty / 'LICENSE').write_text('Fixture pty MIT')
            (pty / 'package.json').write_text('{"version":"1"}')
            ripgrep = root / 'resources/licenses/ripgrep'
            ripgrep.mkdir(parents=True)
            for name in ('LICENSE-MIT', 'RUST-CRATE-NOTICES.txt'):
                (ripgrep / name).write_text('Fixture rg MIT')
            raw = license_file.read_bytes()
            report = macos_notices.collect(root / 'notices', root, python_distributions=[], runtime_license=license_file,
                native_notices=[{'name': 'Node.js', 'version': '24', 'source': 'fixture archive/LICENSE',
                                 'path': license_file, 'sha256': hashlib.sha256(raw).hexdigest()}])
            self.assertEqual(report['missing'], [])
            self.assertEqual(report['native_closure'], 'not_checked')
            self.assertEqual(report['distribution'], 'not_verified')
            self.assertTrue(report['candidate_notices_ready'])
            self.assertEqual([row['name'] for row in report['notices']],
                             ['fixture', 'CPython', 'Node.js', 'node-pty', 'ripgrep', 'ripgrep'])
            self.assertIn(text, (root / 'notices/THIRD-PARTY-NOTICES.txt').read_text())

    def test_wrong_prepared_identity_is_reported_without_borrowing_license(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = root / '.build/distribution'
            records.mkdir(parents=True)
            package = {'name': 'fixture', 'version': '1', 'metadataSha256': 'different', 'notices': []}
            (records / 'runtime.json').write_text(json.dumps({'owner': {'package': package}}))
            prepared = root / 'inputs.json'
            prepared.write_text(json.dumps([{'name': 'fixture', 'version': '1', 'metadata_sha256': 'original'}]))
            report = macos_notices.collect(root / 'notices', root, python_distributions=[], package_inputs=prepared)
            self.assertEqual(report['notices'], [])
            self.assertEqual(report['missing'][0]['reason'], 'distribution_notice_identity_hash')
            self.assertEqual(report['missing'][1]['component'], 'CPython')

    def test_requires_actual_build_records(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'macos_distribution_records_missing'):
                macos_notices.collect(Path(directory) / 'notices', directory, python_distributions=[])

    def test_reuses_reviewed_notice_only_for_exact_metadata_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = root / '.build/distribution'
            records.mkdir(parents=True)
            package = {'name': 'fixture', 'version': '1', 'metadataSha256': 'a' * 64, 'notices': []}
            (records / 'runtime.json').write_text(json.dumps({'owner': {'package': package}}))
            metadata = json.dumps({'name': 'fixture', 'version': '1', 'gitHead': 'b' * 40,
                                   'repository': 'https://github.com/example/fixture'})
            text = 'Fixture MIT license'
            prepared = root / 'inputs.json'
            prepared.write_text(json.dumps([{'name': 'fixture', 'version': '1',
                'metadata_sha256': 'a' * 64, 'registry_metadata': metadata,
                'registry_metadata_sha256': hashlib.sha256(metadata.encode()).hexdigest(),
                'notices': [{'source': 'https://raw.githubusercontent.com/example/fixture/' + 'b' * 40 + '/LICENSE',
                             'text': text, 'sha256': hashlib.sha256(text.encode()).hexdigest()}]}]))
            report = macos_notices.collect(root / 'notices', root, python_distributions=[], package_inputs=prepared)
            self.assertEqual(report['notices'][0]['text'], text)
            self.assertEqual(len(report['missing']), 4)


if __name__ == '__main__':
    unittest.main()
