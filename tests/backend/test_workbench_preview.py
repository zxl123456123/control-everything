"""Preview launch contracts; all server and runtime side effects are mocked."""

from contextlib import redirect_stdout
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import DEFAULT, patch

from tools.scripts import preview_workbench


class WorkbenchPreviewTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.profile = self.root / "profile"
        self.build_run = self.root / "build-run"
        self.git = self.root / "git.exe"
        self.workspace = self.root / "workspace"
        self.mocks = self.enterContext(patch.multiple(
            preview_workbench, export_workbench_assets=DEFAULT, WorkbenchAssets=DEFAULT,
            build_profile_server=DEFAULT, WorkbenchRuntime=DEFAULT,
        ))
        self.server = self.mocks["build_profile_server"].return_value
        self.server.origin = "http://127.0.0.1:8769"

    def run_preview(self, *options):
        argv = ["--data-dir", str(self.profile), "--build-run", str(self.build_run),
                "--git", str(self.git), "--workspace-root", str(self.workspace), *options]
        with redirect_stdout(io.StringIO()):
            self.assertEqual(preview_workbench.main(argv), 0)
        return self.mocks["WorkbenchRuntime"].call_args.args[0]

    def test_default_preview_inherits_host_environment(self):
        config = self.run_preview()
        self.assertTrue(config.inherit_host_environment)

    def test_isolated_environment_explicitly_disables_host_inheritance(self):
        config = self.run_preview("--isolated-environment")
        self.assertFalse(config.inherit_host_environment)

    def test_profile_workspace_roots_and_runtime_lifecycle_are_preserved(self):
        another_workspace = self.root / "another-workspace"
        config = self.run_preview("--workspace-root", str(another_workspace), "--port", "8871")
        self.assertEqual(config.data_root, self.profile / "workbench")
        self.assertEqual(config.allowed_workspace_roots, (self.workspace, another_workspace))
        self.assertEqual(config.git_executable, self.git)
        self.assertEqual(config.build_run, self.build_run)
        self.assertEqual(config.engine_root, preview_workbench.ROOT / "web/workbench-engine")
        self.mocks["build_profile_server"].assert_called_once_with(self.profile, 8871)
        self.mocks["export_workbench_assets"].assert_called_once_with(config.engine_root, self.build_run)
        runtime = self.mocks["WorkbenchRuntime"].return_value
        runtime.start.assert_called_once_with(self.server.origin)
        self.server.attach_workbench_runtime.assert_called_once_with(runtime)
        self.server.serve_forever.assert_called_once_with()
        runtime.close.assert_called_once_with()
        self.server.server_close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
