"""Ownership policy examples; imports are checked by the real Import Linter."""

import importlib.util
import ast
import sys
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('check_architecture', Path(__file__).resolve().parents[2] / 'tools/scripts/check_architecture.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class ArchitectureTests(TestCase):
    def test_identity_properties_have_exact_ownership(self):
        prefix = 'web/workspace/identity-theme/control-everything/login/'
        for name in ['theme.properties', 'messages/messages_zh_Hans.properties', 'resources/css/studio.css']:
            self.assertIsNone(policy.ownership_error(prefix + name))
        for name in ['other.properties', 'messages/messages_en.properties', 'theme.ftl',
                     'resources/css/other.css', 'resources/js/theme.js', 'other/login/resources/css/studio.css']:
            self.assertEqual(policy.ownership_error(prefix + name), 'unknown_frontend_owner')

    def test_workbench_owner_requires_exact_manifest_members(self):
        with patch.object(policy, 'workbench_policy') as source:
            source.return_value.contains.side_effect = lambda value: value == 'web/workbench-engine/src/App.tsx'
            self.assertIsNone(policy.ownership_error('web/workbench-engine/src/App.tsx'))
            for name in ['unknown.tsx', 'AGENTS.md', 'out/runtime.js', '.github/workflows/publish.yml']:
                self.assertEqual(policy.ownership_error('web/workbench-engine/' + name),
                                 'unregistered_workbench_source')

    def test_shared_manifest_has_only_standard_library_imports(self):
        path = Path(__file__).resolve().parents[2] / 'src/control_everything/installation/manifest.py'
        for node in ast.walk(ast.parse(path.read_text(encoding='utf-8'))):
            if isinstance(node, ast.Import):
                names = [alias.name.split('.')[0] for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                self.assertEqual(node.level, 0)
                names = [node.module.split('.')[0]]
            else:
                continue
            self.assertTrue(set(names).issubset(sys.stdlib_module_names))

    def test_known_owners_allow_legitimate_cross_feature_changes(self):
        for path in ['web/workspace/studio-preview.js', 'web/workspace/studio-shell.js',
                     'src/control_everything/workspace/validation.py', 'src/control_everything/profiles/profile_import.py',
                     'src/control_everything/platform/windows_jobs.py', 'src/control_everything/input_validation.py',
                     'src/control_everything/platform/windows_installation.py', 'src/control_everything/installation/registry.py',
                     'src/control_everything/installation/maintenance.py', 'src/control_everything/installation/manifest.py',
                     'web/workspace/quota.js', 'tools/typescript/tsconfig.news.json',
                     'tools/packaging/build_assets.py', 'pyproject.toml', 'MANIFEST.in', 'setup.py',
                     'docs/README.md', 'docs/architecture/architecture.md',
                     'docs/architecture/workbench-contract.md', 'docs/guides/usage.md',
                     'docs/guides/windows.md', 'docs/guides/integrations.md',
                     'docs/guides/development-files.md',
                     'docs/guides/EMBEDDING.md', 'docs/guides/PETS_INTEGRATION.md', 'LICENSE',
                     'docs/examples/legacy/progress-manual.example.json', 'tests/e2e/verify_architecture.py',
                     'docs/examples/integrations/codex.toml.example', 'tools/scripts/check_architecture.py',
                     '.github/CODEOWNERS', 'rust-toolchain.toml']:
            with self.subTest(path=path):
                self.assertIsNone(policy.ownership_error(path))

    def test_new_business_files_cannot_accumulate_in_undeclared_locations(self):
        for path, reason in [('new_feature.py', 'root_file_has_no_owner'),
                             ('scripts/new_feature.py', 'unregistered_top_level_directory'),
                             ('tools/scripts/nested/new_feature.py', 'scripts_are_development_entries'),
                             ('docs/examples/private.json', 'unknown_example_owner'),
                             ('docs/current/architecture.md', 'unknown_public_guide'),
                             ('docs/architecture.md', 'unknown_public_guide'),
                             ('docs/usage.md', 'unknown_public_guide'),
                             ('docs/guides/unknown.md', 'unknown_public_guide'),
                             ('src/control_everything/new_feature.py', 'package_root_is_for_entries_and_foundations'),
                             ('src/control_everything/utils/feature.py', 'unknown_backend_owner'),
                             ('src/another_app/main.py', 'unknown_backend_owner'),
                             ('control_everything/workspace/service.py', 'unregistered_top_level_directory'),
                             ('tools/misc/check.py', 'unknown_development_tool'),
                             ('another_app/main.py', 'unregistered_top_level_directory'),
                             ('tests/random/test_feature.py', 'unknown_test_type')]:
            with self.subTest(path=path):
                self.assertEqual(policy.ownership_error(path), reason)

    def test_local_layout_requires_feature_directories_even_for_ignored_files(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            for directory in ('docs/current/task', 'docs/archive/old-task',
                              'docs/guides', 'docs/architecture', 'docs/examples',
                              'work/task', 'work/archive/old-task'):
                (root / directory).mkdir(parents=True, exist_ok=True)
            for relative in ('docs/README.md', 'work/README.md', 'docs/current/task/README.md',
                             'docs/archive/old-task/report.md', 'work/task/report.json',
                             'work/archive/old-task/output.log'):
                (root / relative).touch()
            self.assertEqual(policy.local_layout_errors(root), [])
            scattered = ('docs/random.md', 'docs/current/loose.md',
                         'docs/archive/old.json', 'work/report.json', 'work/archive/loose.json')
            for relative in scattered:
                (root / relative).touch()
            self.assertEqual(policy.local_layout_errors(root), [
                {'path': relative, 'reason': 'local_file_requires_feature_directory'}
                for relative in scattered])

    def test_local_docs_root_only_accepts_declared_sections(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'docs/unknown').mkdir(parents=True)
            self.assertEqual(policy.local_layout_errors(root), [{
                'path': 'docs/unknown', 'reason': 'unknown_documentation_directory'}])

    def test_active_task_requires_an_entry_and_completed_scope_moves_to_archive(self):
        with TemporaryDirectory() as temporary:
            root = Path(temporary)
            task = root / 'docs/current/task'
            task.mkdir(parents=True)
            self.assertEqual(policy.local_layout_errors(root), [{
                'path': 'docs/current/task', 'reason': 'active_task_requires_readme'}])
            readme = task / 'README.md'
            for state in ('进行中', '暂停', '待验收'):
                readme.write_text('# Task\n\n- 当前状态：' + state + '。\n', encoding='utf-8')
                self.assertEqual(policy.local_layout_errors(root), [])
            readme.write_text('# Task\n\n- 当前状态：进行中。\n\n## 历史\n- 当前状态：已结束。\n', encoding='utf-8')
            self.assertEqual(policy.local_layout_errors(root), [])
            readme.write_text('# Task\n\n- 当前状态：已结束。\n', encoding='utf-8')
            self.assertEqual(policy.local_layout_errors(root), [{
                'path': 'docs/current/task', 'reason': 'closed_task_requires_archive'}])
            archive = root / 'docs/archive'
            archive.mkdir()
            task.rename(archive / 'task')
            self.assertEqual(policy.local_layout_errors(root), [])

    def test_explicit_publication_candidates_do_not_scan_local_artifacts(self):
        with TemporaryDirectory() as temporary:
            candidates = Path(temporary) / 'files.json'
            candidates.write_text('["docs/README.md"]', encoding='utf-8')
            with patch.object(sys, 'argv', ['check_architecture.py', 'layout', '--files', str(candidates)]), \
                    patch.object(policy, 'local_layout_errors') as local, redirect_stdout(StringIO()):
                self.assertEqual(policy.main(), 0)
                local.assert_not_called()
        with patch.object(sys, 'argv', ['check_architecture.py', 'layout']), \
                patch.object(policy, 'git_candidates', return_value=['docs/README.md']), \
                patch.object(policy, 'local_layout_errors', return_value=[{
                    'path': 'work/report.json', 'reason': 'local_file_requires_feature_directory'}]), \
                redirect_stdout(StringIO()):
            self.assertEqual(policy.main(), 1)

    def test_relative_paths_cannot_escape_or_change_windows_meaning(self):
        for path in ['../outside.py', '/outside.py', 'web/../bad.js', 'web//bad.js',
                     'C:/example/file.py', 'web\\workspace\\bad.js', 'web/workspace./bad.js', '', 1]:
            with self.subTest(path=path):
                self.assertEqual(policy.ownership_error(path), 'invalid_relative_path')
