"""Repository policy checks use only synthetic repositories and runtime fixtures."""
import importlib.util
import ctypes
import json
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("repository_checks", Path(__file__).parents[2] / "tools/scripts/check_repository.py")
CHECKS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKS)
REAL_SCAN_GITLEAKS = CHECKS.scan_gitleaks
GITLEAKS = Path(__file__).parents[2] / "work/tools/gitleaks-8.30.1/gitleaks.exe"


class RepositoryChecksTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Repository Test")
        self.git("config", "user.email", "test@example.invalid")
        self.tool = patch.object(CHECKS, "scan_gitleaks", return_value={"version": CHECKS.VERSION, "exit_code": 0, "findings": []})
        self.scanner = self.tool.start()
        self.addCleanup(self.tool.stop)

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, capture_output=True, check=True).stdout.decode().strip()

    def save(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def commit(self):
        self.git("add", "--all")
        self.git("commit", "-qm", "test: synthetic fixture")
        return self.git("rev-parse", "HEAD")

    def check(self, mode, *args):
        code = CHECKS.main([mode, "--root", str(self.root), "--report", "work/fixture/report.json", *args])
        return code, json.loads((self.root / "work/fixture/report.json").read_text(encoding="utf-8"))

    def release(self, files, excluded=None):
        self.save("work/fixture/manifest.json", json.dumps({"files": files, "excluded": excluded or []}))
        return self.check("release", "--manifest", str(self.root / "work/fixture/manifest.json"))

    def test_cli_rejects_report_at_work_root_without_writing(self):
        for report in ('work/report.json', str(self.root / 'work/report.json')):
            with self.subTest(report=report):
                result = subprocess.run([sys.executable, str(SPEC.origin), 'release',
                                         '--root', str(self.root), '--report', report],
                                        cwd=self.root, capture_output=True, text=True)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertFalse((self.root / 'work/report.json').exists())
                self.assertFalse((self.root / 'work').exists())

    @staticmethod
    def personal_path():
        return "C:" + "/Users/" + "synthetic-person/private"

    def test_old_value_and_same_file_safe_addition_pass(self):
        self.save("sample.txt", self.personal_path() + "\nold\n")
        base = self.commit()
        self.save("sample.txt", self.personal_path() + "\nold\nsafe addition\n")
        head = self.commit()
        code, report = self.check("changes", "--base", base, "--head", head)
        self.assertEqual(code, 0)
        self.assertEqual(report["findings"], [])

    def test_new_personal_value_blocks_without_echo(self):
        self.save("sample.txt", "safe\n")
        base = self.commit()
        self.save("sample.txt", "safe\n" + self.personal_path() + "\n")
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 1)
        self.assertEqual(report["findings"][0]["line"], 2)
        self.assertNotIn(self.personal_path(), json.dumps(report))

    def test_rename_does_not_reintroduce_old_values(self):
        self.save("old.txt", self.personal_path() + "\n")
        base = self.commit()
        self.git("mv", "old.txt", "new.txt")
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 0)
        self.assertEqual(report["findings"], [])

    def test_escaped_ip_home_and_project_path(self):
        address = ".".join(["8", "8", "4", "4"])
        text = "\n".join([address.replace(".", "\\."), "/" + "home/private-person/data", "E:" + "/project-private/data"])
        self.save("sample.txt", text)
        code, report = self.release(["sample.txt"])
        self.assertEqual(code, 1)
        self.assertEqual(len(report["findings"]), 3)
        self.assertNotIn("private-person", json.dumps(report))

    def test_document_addresses_and_placeholders_pass(self):
        self.save("sample.txt", "127.0.0.1 192.0.2.10 198.51.100.20 203.0.113.30\n/home/example/data\nC:/temporary/example\n")
        self.assertEqual(self.release(["sample.txt"])[0], 0)

    def test_official_https_url_is_not_a_windows_drive(self):
        self.save("sample.txt", "https://github.com/gitleaks/gitleaks\n")
        self.assertEqual(self.release(["sample.txt"])[0], 0)

    def workbench_fixture(self):
        prefix = "web/workbench-engine/"
        source = b"export const example = true\n"
        notice = b"Synthetic license notice\n"
        image = b"\x89PNG\r\n\x1a\n\x00synthetic resource"
        data = {"src/main.tsx": source, "LICENSE": notice, "src/icon.png": image}
        for name, content in data.items():
            path = self.root / (prefix + name)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        document = {"schema": 1, "unit": prefix.rstrip("/"),
                    "files": [{"path": name, "sha256": hashlib.sha256(content).hexdigest()}
                              for name, content in data.items()],
                    "resources": [{"path": "src/icon.png", "sha256": hashlib.sha256(image).hexdigest(),
                                   "license_paths": ["LICENSE"]}],
                    "local_files": [], "adapted_files": []}
        self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
        return prefix, document

    def test_workbench_rename_uses_each_tree_source_inventory(self):
        prefix, document = self.workbench_fixture()
        base = self.commit()
        self.git("mv", prefix + "src/main.tsx", prefix + "src/workbench.tsx")
        document["files"][0].update(path="src/workbench.tsx", source_path="src/main.tsx")
        self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 0, report)
        self.assertIn(prefix + "src/workbench.tsx", [row["path"] for row in report["included"]])
        self.scanner.assert_called_once()

    def test_workbench_rename_requires_destination_registration(self):
        prefix, _ = self.workbench_fixture()
        base = self.commit()
        self.git("mv", prefix + "src/main.tsx", prefix + "src/workbench.tsx")
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 1)
        self.assertIn({"path": prefix + "src/workbench.tsx", "reason": "unregistered-workbench-source"}, report["blocked"])

    def test_workbench_rename_cannot_retroactively_register_its_source(self):
        prefix, document = self.workbench_fixture()
        source = document["files"].pop(0)
        self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
        base = self.commit()
        self.git("mv", prefix + "src/main.tsx", prefix + "src/workbench.tsx")
        document["files"].append(dict(source, path="src/workbench.tsx", source_path="src/main.tsx"))
        self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 1)
        self.assertIn({"path": prefix + "src/main.tsx", "reason": "unregistered-workbench-source"}, report["blocked"])

    def test_workbench_rename_still_scans_new_private_content(self):
        prefix, document = self.workbench_fixture()
        self.save(prefix + "src/main.tsx", "// synthetic source\n" * 20)
        base = self.commit()
        self.git("mv", prefix + "src/main.tsx", prefix + "src/workbench.tsx")
        self.save(prefix + "src/workbench.tsx", "// synthetic source\n" * 20 + self.personal_path() + "\n")
        document["files"][0].update(path="src/workbench.tsx", source_path="src/main.tsx")
        self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
        head = self.commit()
        self.assertIn("R", self.git("diff", "--name-status", "--find-renames", base, head))
        code, report = self.check("changes", "--base", base, "--head", head)
        self.assertEqual(code, 1)
        self.assertEqual(report["blocked"], [])
        self.assertTrue(any(row["path"] == prefix + "src/workbench.tsx" for row in report["findings"]))
        self.assertNotIn(self.personal_path(), json.dumps(report))
        self.scanner.assert_called_once()

    def test_exact_workbench_resource_is_scanned_with_its_notice(self):
        prefix, _ = self.workbench_fixture()
        files = [prefix + name for name in ["src/main.tsx", "LICENSE", "src/icon.png"]]
        code, report = self.release(files)
        self.assertEqual(code, 0)
        self.assertEqual(len(report["included"]), 3)
        self.scanner.assert_called_once()

    def test_workbench_resource_tampering_unknown_and_missing_notice_fail(self):
        prefix, _ = self.workbench_fixture()
        self.save(prefix + "src/unknown.tsx", "safe\n")
        self.assertEqual(self.release([prefix + "src/unknown.tsx"])[0], 1)
        image = self.root / (prefix + "src/icon.png")
        original = image.read_bytes()
        image.write_bytes(original + b"x")
        self.assertEqual(self.release([prefix + "src/icon.png"])[0], 1)
        image.write_bytes(original)
        (self.root / (prefix + "LICENSE")).unlink()
        self.assertEqual(self.release([prefix + "src/icon.png"])[0], 1)

    def test_workbench_source_does_not_bypass_privacy_or_path_checks(self):
        prefix, document = self.workbench_fixture()
        self.save(prefix + "src/main.tsx", self.personal_path())
        code, report = self.release([prefix + "src/main.tsx"])
        self.assertEqual(code, 1)
        self.assertTrue(report["findings"])
        document["local_files"] = ["**"]
        self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
        self.assertEqual(self.release([prefix + "src/main.tsx"])[0], 1)
        self.assertEqual(self.release(["elsewhere/icon.png"])[0], 1)

    def test_workbench_history_requires_notice_in_that_commit(self):
        self.save(".gitignore", "/work/\n")
        base = self.commit()
        prefix, _ = self.workbench_fixture()
        manifest = self.root / "tools/packaging/workbench-engine-source.json"
        saved = manifest.read_bytes()
        manifest.unlink()
        self.commit()
        manifest.write_bytes(saved)
        head = self.commit()
        code, report = self.check("changes", "--base", base, "--head", head)
        self.assertEqual(code, 1)
        self.assertTrue(any(item["path"] == prefix + "src/icon.png" for item in report["blocked"]))

    def test_workbench_reviewed_resource_history_passes(self):
        self.save(".gitignore", "/work/\n")
        base = self.commit()
        self.workbench_fixture()
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 0)
        self.assertEqual(report["blocked"], [])

    def reviewed_workbench_fixture(self):
        prefix, document = self.workbench_fixture()
        name = "src/main.tsx"
        content = ('export const systemPath = "C:' + '/Windows/System32"\n').encode()
        (self.root / (prefix + name)).write_bytes(content)
        sha = hashlib.sha256(content).hexdigest()
        next(item for item in document["files"] if item["path"] == name)["sha256"] = sha
        document["reviewed_findings"] = [{"path": name, "rule": "absolute-windows-path", "line": 1,
                                         "sha256": sha, "reason": "Fixed operating system location; no user data."}]
        self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
        return prefix, document

    def test_reviewed_false_positive_requires_exact_full_file_and_position(self):
        prefix, document = self.reviewed_workbench_fixture()
        name = prefix + "src/main.tsx"
        code, report = self.release([name])
        self.assertEqual(code, 0)
        self.assertEqual(len(report["reviewed_findings"]), 1)
        self.assertEqual(report["findings"], [])
        path = self.root / name
        path.write_bytes(path.read_bytes() + b"// changed\n")
        self.assertEqual(self.release([name])[0], 1)
        document["reviewed_findings"][0]["path"] = "src/**"
        self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
        self.assertEqual(self.release([name])[0], 1)

    def test_reviewed_finding_cannot_retroactively_authorize_history(self):
        self.save(".gitignore", "/work/\n")
        base = self.commit()
        prefix, document = self.reviewed_workbench_fixture()
        reviewed = document.pop("reviewed_findings")
        self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
        self.commit()
        document["reviewed_findings"] = reviewed
        self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 1)
        self.assertTrue(any(item["path"] == prefix + "src/main.tsx" for item in report["findings"]))

    def test_reviewed_gitleaks_keeps_original_result_and_rejects_unknown(self):
        prefix, document = self.reviewed_workbench_fixture()
        entry = dict(document["reviewed_findings"][0], rule="gitleaks:generic-api-key")
        document["reviewed_findings"].append(entry)
        self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
        finding = {"path": prefix + "src/main.tsx", "rule": entry["rule"], "line": 1}
        self.scanner.return_value = {"version": CHECKS.VERSION, "exit_code": 1, "findings": [finding]}
        code, report = self.release([finding["path"]])
        self.assertEqual(code, 0)
        self.assertEqual(report["gitleaks"]["exit_code"], 1)
        self.assertEqual(report["gitleaks"]["findings"], [finding])
        self.scanner.return_value = {"version": CHECKS.VERSION, "exit_code": 1,
                                    "findings": [dict(finding, line=2)]}
        self.assertEqual(self.release([finding["path"]])[0], 1)

    def test_workbench_excluded_windows_case_aliases_cannot_be_registered(self):
        self.save(".gitignore", "/work/\n")
        base = self.commit()
        prefix, document = self.workbench_fixture()
        names = ["agents.md", ".GITHUB/workflows/publish.yml", "Out/generated.js"]
        for name in names:
            self.save(prefix + name, "synthetic\n")
            document["local_files"] = [name]
            self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
            with self.subTest(name=name):
                self.assertEqual(self.release([prefix + name])[0], 1)
        document["local_files"] = names
        self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 1)
        self.assertTrue(report["blocked"])

    def test_workbench_expo_route_brackets_are_literal_members(self):
        prefix, document = self.workbench_fixture()
        name = "mobile/app/h/[hostId]/[...page].tsx"
        self.save(prefix + name, "export default function Page() {}\n")
        document["local_files"] = [name]
        self.save("tools/packaging/workbench-engine-source.json", json.dumps(document))
        self.assertEqual(self.release([prefix + name])[0], 0)
        self.assertEqual(self.release([prefix + name.replace('[hostId]', 'other')])[0], 1)

    def test_release_is_strict_and_manifest_limited(self):
        self.save("old.txt", self.personal_path())
        self.save("safe.txt", "safe\n")
        code, report = self.release(["safe.txt"], ["old.txt"])
        self.assertEqual(code, 0)
        self.assertEqual(report["excluded"], ["old.txt"])
        self.assertEqual(self.release(["old.txt"])[0], 1)

    def test_forbidden_paths_are_never_read(self):
        for name in [".env", "videos/draft.txt", "data.sqlite3", "image.png", "work/private.txt"]:
            with self.subTest(name=name), patch.object(CHECKS, "safe_file", side_effect=AssertionError("must not read")):
                code, report = self.release([name])
                self.assertEqual(code, 1)
                self.assertTrue(report["blocked"])

    def test_workbench_public_samples_are_exactly_registered(self):
        names = {
            "workbench-device-provisioner.service.example", "workbench-device-provisioner.socket.example",
            "workbench-device-sshd.example.conf", "workbench-device-sshd.service.example",
            "workbench-identity.README.md", "workbench-identity.hub.example.json",
            "workbench-identity.hub.service.example", "workbench-identity.oauth2-proxy.example.cfg",
            "workbench-identity.realm.example.json", "workbench-remote.Caddyfile.example",
        }
        prefix = "docs/examples/integrations/"
        for name in names:
            with self.subTest(name=name):
                self.assertIsNone(CHECKS.forbidden(prefix + name))
        for name in ("workbench-private.json", "workbench-identity.hub.example.json.bak",
                     "nested/workbench-remote.Caddyfile.example"):
            with self.subTest(name=name):
                self.assertEqual(CHECKS.forbidden(prefix + name), "excluded-directory")

    def test_existing_video_text_modifications_reach_full_interval_scanner(self):
        self.save(".gitignore", "/work/\n")
        names = ["videos/demo/STORYBOARD.md", "videos/demo/manifest.json", "videos/demo/capture.mjs"]
        for name in names:
            self.save(name, "old source\n")
        base = self.commit()
        for name in names:
            self.save(name, "remaining source\n")
        head = self.commit()
        code, report = self.check("changes", "--base", base, "--head", head)
        self.assertEqual(code, 0)
        self.assertEqual({item["path"] for item in report["included"]}, set(names))
        self.scanner.assert_called_once()
        self.assertEqual(self.scanner.call_args.args[-1], base + ".." + head)
        self.assertEqual(self.release([names[0]])[0], 1)

    def test_new_renamed_and_copied_video_sources_are_still_blocked(self):
        self.save(".gitignore", "/work/\n")
        self.save("videos/demo/original.md", "existing source\n")
        base = self.commit()
        self.save("videos/demo/new.md", "new source\n")
        self.git("mv", "videos/demo/original.md", "videos/demo/renamed.md")
        self.save("videos/demo/copied.md", "existing source\n")
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 1)
        self.assertTrue(report["blocked"])
        self.assertEqual(report["included"], [])
        self.scanner.assert_not_called()

    def test_modified_video_media_nested_and_private_paths_remain_blocked(self):
        self.save(".gitignore", "/work/\n")
        names = ["videos/demo/image.png", "videos/demo/work/notes.md", "videos/demo/node_modules/source.mjs",
                 "videos/demo/.codex/config.json", "videos/demo/.env.json", "videos/demo/data.sqlite3",
                 "videos/demo/config.toml", "videos/demo/docs/notes.md", "assets/videos/demo.md"]
        for name in names:
            self.save(name, "old\n")
        base = self.commit()
        for name in names:
            self.save(name, "changed\n")
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 1)
        self.assertEqual({item["path"] for item in report["blocked"]}, set(names))
        self.scanner.assert_not_called()

    def test_modified_video_text_cannot_hide_binary_or_new_personal_values(self):
        self.save(".gitignore", "/work/\n")
        self.save("videos/demo/source.md", "old\n")
        base = self.commit()
        self.save("videos/demo/source.md", self.personal_path() + "\n")
        head = self.commit()
        code, report = self.check("changes", "--base", base, "--head", head)
        self.assertEqual(code, 1)
        self.assertEqual(report["findings"][0]["rule"], "absolute-windows-path")
        self.scanner.assert_called_once()
        self.scanner.reset_mock()
        (self.root / "videos/demo/source.md").write_bytes(b"changed\x00binary")
        code, report = self.check("changes", "--base", head, "--head", self.commit())
        self.assertEqual(code, 1)
        self.assertEqual(report["blocked"], [{"path": "videos/demo/source.md", "reason": "binary-candidate"}])
        self.scanner.assert_not_called()

    def test_private_docs_are_local_only_in_release_and_changes(self):
        self.save(".gitignore", "/work/\n")
        self.save("docs/current/record.md", "local record\n")
        base = self.commit()
        self.assertEqual(self.release(["docs/current/record.md"])[0], 1)
        self.save("docs/current/record.md", "updated local record\n")
        self.save("nested/docs/new.md", "nested local record\n")
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 1)
        self.assertEqual({item["path"] for item in report["blocked"]}, {"docs/current/record.md", "nested/docs/new.md"})
        self.scanner.assert_not_called()

    def test_public_docs_are_scanned_in_release_and_changes(self):
        self.save(".gitignore", "/work/\n")
        self.save("docs/architecture/architecture.md", "Public architecture\n")
        base = self.commit()
        self.assertEqual(self.release(["docs/architecture/architecture.md"])[0], 0)
        self.save("docs/architecture/architecture.md", "Public architecture\n" + self.personal_path())
        head = self.commit()
        self.assertEqual(self.release(["docs/architecture/architecture.md"])[0], 1)
        code, report = self.check("changes", "--base", base, "--head", head)
        self.assertEqual(code, 1)
        self.assertEqual(report["findings"][0]["rule"], "absolute-windows-path")

    def test_legacy_public_guides_can_move_without_skipping_range_scan(self):
        self.save('.gitignore', '/work/\n')
        destinations = {
            'architecture.md': 'architecture/architecture.md',
            'workbench-contract.md': 'architecture/workbench-contract.md',
            **{name: 'guides/' + name for name in ('usage.md', 'windows.md', 'integrations.md',
                                                  'EMBEDDING.md', 'PETS_INTEGRATION.md')}}
        for name in destinations:
            self.save('docs/' + name, 'Public guide: ' + name + '\n')
        base = self.commit()
        for name, destination in destinations.items():
            (self.root / 'docs' / destination).parent.mkdir(parents=True, exist_ok=True)
            self.git('mv', 'docs/' + name, 'docs/' + destination)
        head = self.commit()
        code, report = self.check('changes', '--base', base, '--head', head)
        self.assertEqual(code, 0)
        self.assertEqual(report['blocked'], [])
        self.assertEqual({item['path'] for item in report['included']},
                         {'docs/' + name for name in destinations.values()})
        self.assertEqual(self.scanner.call_args.args[-1], base + '..' + head)

    def test_legacy_guide_additions_and_edits_before_migration_are_scanned(self):
        self.save('.gitignore', '/work/\n')
        base = self.commit()
        self.save('docs/usage.md', 'Initial guide\n')
        added = self.commit()
        self.save('docs/usage.md', 'Initial guide\nAdditional instructions\n')
        edited = self.commit()
        (self.root / 'docs/guides').mkdir()
        self.git('mv', 'docs/usage.md', 'docs/guides/usage.md')
        head = self.commit()
        code, report = self.check('changes', '--base', base, '--head', head)
        self.assertEqual(code, 0)
        for revision in (added, edited):
            self.assertIn({'path': 'docs/usage.md', 'commit': revision}, report['included'])
        self.assertEqual(self.scanner.call_args.args[-1], base + '..' + head)

    def test_legacy_guide_privacy_remains_reported_after_cleanup_and_migration(self):
        self.save('.gitignore', '/work/\n')
        base = self.commit()
        self.save('docs/usage.md', self.personal_path() + '\n')
        introduced = self.commit()
        self.save('docs/usage.md', 'Public guide\n')
        self.commit()
        (self.root / 'docs/guides').mkdir()
        self.git('mv', 'docs/usage.md', 'docs/guides/usage.md')
        head = self.commit()
        code, report = self.check('changes', '--base', base, '--head', head)
        self.assertEqual(code, 1)
        self.assertEqual(report['blocked'], [])
        self.assertTrue(any(item['path'] == 'docs/usage.md' and item['commit'] == introduced
                            and item['rule'] == 'absolute-windows-path' for item in report['findings']))
        self.assertNotIn(self.personal_path(), json.dumps(report))
        self.assertEqual(self.scanner.call_args.args[-1], base + '..' + head)

    @unittest.skipUnless(GITLEAKS.is_file(), 'Pinned local Gitleaks is installed separately')
    def test_legacy_guide_secret_before_migration_reaches_real_gitleaks(self):
        self.save('.gitignore', '/work/\n')
        base = self.commit()
        secret = 'ghp_' + 'aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0iL3oR6'
        self.save('docs/usage.md', 'token = "' + secret + '"\n')
        introduced = self.commit()
        self.save('docs/usage.md', 'Public guide\n')
        self.commit()
        (self.root / 'docs/guides').mkdir()
        self.git('mv', 'docs/usage.md', 'docs/guides/usage.md')
        head = self.commit()
        with patch.object(CHECKS, 'scan_gitleaks', wraps=REAL_SCAN_GITLEAKS):
            code, report = self.check('changes', '--base', base, '--head', head,
                                      '--gitleaks', str(GITLEAKS.resolve()))
        self.assertEqual(code, 1)
        self.assertEqual(report['blocked'], [])
        self.assertEqual(report['gitleaks']['exit_code'], 1)
        self.assertTrue(any(item['path'] == 'docs/usage.md' and item['commit'] == introduced
                            for item in report['gitleaks']['findings']))
        self.assertNotIn(secret, json.dumps(report))

    def test_private_doc_rename_to_public_guide_is_still_blocked(self):
        self.save('.gitignore', '/work/\n')
        self.save('docs/current/usage.md', 'Private record\n')
        base = self.commit()
        (self.root / 'docs/guides').mkdir()
        self.git('mv', 'docs/current/usage.md', 'docs/guides/usage.md')
        code, report = self.check('changes', '--base', base, '--head', self.commit())
        self.assertEqual(code, 1)
        self.assertIn({'path': 'docs/current/usage.md', 'reason': 'excluded-directory'}, report['blocked'])
        self.scanner.assert_not_called()

    def test_legacy_guides_still_present_at_head_or_release_are_blocked(self):
        self.save('.gitignore', '/work/\n')
        self.save('docs/usage.md', 'Legacy guide\n')
        base = self.commit()
        self.save('safe.txt', 'Unrelated change\n')
        code, report = self.check('changes', '--base', base, '--head', self.commit())
        self.assertEqual(code, 1)
        self.assertIn({'path': 'docs/usage.md', 'reason': 'excluded-directory'}, report['blocked'])
        self.assertEqual(self.release(['docs/usage.md'])[0], 1)
        self.scanner.assert_not_called()

    def test_private_docs_cannot_use_public_filename_to_bypass_scope(self):
        for name in ["docs/current/architecture.md", "docs/DEVELOPMENT_STATUS.md",
                     "docs/Docs.Maintenance.Conventions.md", "docs/examples/private.json"]:
            with self.subTest(name=name), patch.object(CHECKS, "safe_file", side_effect=AssertionError("must not read")):
                self.assertEqual(self.release([name])[0], 1)
        self.scanner.assert_not_called()

    @unittest.skipUnless(GITLEAKS.is_file(), "Pinned local Gitleaks is installed separately")
    def test_video_modification_uses_real_gitleaks_and_rejects_new_secret(self):
        self.save(".gitignore", "/work/\n")
        self.save("videos/demo/capture.mjs", "const source = 'old';\n")
        base = self.commit()
        self.save("videos/demo/capture.mjs", "const source = 'cleaned';\n")
        head = self.commit()
        with patch.object(CHECKS, "scan_gitleaks", wraps=REAL_SCAN_GITLEAKS) as actual:
            code, report = self.check("changes", "--base", base, "--head", head, "--gitleaks", str(GITLEAKS.resolve()))
            self.assertEqual(code, 0)
            self.assertEqual(report["gitleaks"]["exit_code"], 0)
            actual.assert_called_once()
            secret = "ghp_" + "aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0iL3oR6"
            self.save("videos/demo/capture.mjs", 'const token = "' + secret + '";\n')
            code, report = self.check("changes", "--base", head, "--head", self.commit(), "--gitleaks", str(GITLEAKS.resolve()))
            self.assertEqual(code, 1)
            self.assertEqual(report["gitleaks"]["exit_code"], 1)
            self.assertTrue(report["gitleaks"]["findings"])
            self.assertNotIn(secret, json.dumps(report))

    def test_empty_outside_missing_and_binary_fail_closed(self):
        self.assertEqual(self.release([])[0], 1)
        self.assertEqual(self.release(["../outside.txt"])[0], 1)
        self.assertEqual(self.release(["missing.txt"])[0], 1)
        (self.root / "binary.txt").write_bytes(b"safe\x00binary")
        self.assertEqual(self.release(["binary.txt"])[0], 1)

    def test_binary_markers_in_added_text_remain_scannable(self):
        self.save(".gitignore", "work/\n")
        self.save("sample.txt", "safe\n")
        base = self.commit()
        self.save("sample.txt", "GIT binary patch\nBinary files a/sample.txt and b/sample.txt differ\n")
        head = self.commit()
        code, report = self.check("changes", "--base", base, "--head", head)
        self.assertEqual(code, 0)
        self.assertEqual(report["blocked"], [])
        self.assertIn({"path": "sample.txt", "commit": head}, report["included"])
        self.scanner.assert_called_once()
        self.save("sample.txt", "GIT binary patch\n" + self.personal_path() + "\n")
        code, report = self.check("changes", "--base", head, "--head", self.commit())
        self.assertEqual(code, 1)
        self.assertEqual(report["blocked"], [])
        self.assertEqual(report["findings"][0]["rule"], "absolute-windows-path")

    def test_binary_commit_is_blocked_before_scanner(self):
        self.save("sample.txt", "safe\n")
        base = self.commit()
        (self.root / "sample.txt").write_bytes(b"safe\x00binary")
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 1)
        self.assertEqual(report["blocked"], [{"path": "sample.txt", "reason": "binary-candidate"}])
        self.scanner.assert_not_called()

    def test_diff_disabled_utf8_scans_only_added_committed_lines(self):
        self.save(".gitignore", "/work/\n")
        self.save(".gitattributes", "*.patch -diff\n")
        self.save("sample.patch", self.personal_path() + "\nold\n")
        base = self.commit()
        self.save("sample.patch", self.personal_path() + "\nold\nsafe addition\n")
        head = self.commit()
        self.assertIn("Binary files", self.git("diff", base, head, "--", "sample.patch"))
        code, report = self.check("changes", "--base", base, "--head", head)
        self.assertEqual(code, 0)
        self.assertEqual(report["findings"], [])
        self.assertEqual(report["blocked"], [])
        self.scanner.assert_called_once()
        self.save("sample.patch", self.personal_path() + "\nold\nsafe addition\n" + self.personal_path() + "\n")
        introduced = self.commit()
        self.save("sample.patch", "uncommitted clean working file\n")
        code, report = self.check("changes", "--base", head, "--head", introduced)
        self.assertEqual(code, 1)
        self.assertEqual(report["blocked"], [])
        self.assertEqual(report["findings"], [{"rule": rule, "path": "sample.patch", "line": 4, "commit": introduced}
                                              for rule in ["absolute-windows-path", "personal-home-path"]])
        self.assertNotIn(self.personal_path(), json.dumps(report))

    def test_diff_disabled_new_utf8_file_is_scanned(self):
        self.save(".gitignore", "/work/\n")
        self.save(".gitattributes", "*.patch -diff\n")
        base = self.commit()
        self.save("added.patch", "safe\n" + self.personal_path() + "\n")
        head = self.commit()
        code, report = self.check("changes", "--base", base, "--head", head)
        self.assertEqual(code, 1)
        self.assertEqual(report["blocked"], [])
        self.assertEqual(report["findings"], [{"rule": rule, "path": "added.patch", "line": 2, "commit": head}
                                              for rule in ["absolute-windows-path", "personal-home-path"]])
        self.scanner.assert_called_once()

    def test_diff_disabled_binary_and_non_utf8_blobs_stay_blocked(self):
        self.save(".gitignore", "/work/\n")
        self.save(".gitattributes", "*.patch -diff\n")
        self.save("sample.patch", "safe\n")
        base = self.commit()
        for data, reason in [(b"safe\x00binary", "binary-candidate"), (b"invalid\xfftext", "non-utf8-candidate")]:
            with self.subTest(reason=reason):
                (self.root / "sample.patch").write_bytes(data)
                head = self.commit()
                self.save("sample.patch", "uncommitted clean working file\n")
                code, report = self.check("changes", "--base", base, "--head", head)
                self.assertEqual(code, 1)
                self.assertEqual(report["blocked"], [{"path": "sample.patch", "reason": reason}])
                self.scanner.assert_not_called()
                base = head

    @unittest.skipUnless(GITLEAKS.is_file(), "Pinned local Gitleaks is installed separately")
    def test_diff_disabled_secret_is_found_in_full_interval_by_real_gitleaks(self):
        self.save(".gitignore", "/work/\n")
        self.save(".gitattributes", "*.patch -diff\n")
        self.save("sample.patch", "safe\n")
        base = self.commit()
        secret = "ghp_" + "aB3dE6gH9jK2mN5pQ8sT1vW4yZ7cF0iL3oR6"
        self.save("sample.patch", 'token = "' + secret + '"\n')
        introduced = self.commit()
        self.save("sample.patch", "safe\n")
        head = self.commit()
        self.assertIn("Binary files", self.git("diff", base, introduced, "--", "sample.patch"))
        actual = REAL_SCAN_GITLEAKS(self.root, GITLEAKS.resolve(), self.root, "git", base + ".." + head)
        self.assertEqual(actual["exit_code"], 1)
        self.assertTrue(any(item["commit"] == introduced and item["path"] == "sample.patch" for item in actual["findings"]))
        self.assertNotIn(secret, json.dumps(actual))
        with patch.object(CHECKS, "scan_gitleaks", wraps=REAL_SCAN_GITLEAKS):
            code, report = self.check("changes", "--base", base, "--head", head, "--gitleaks", str(GITLEAKS.resolve()))
        self.assertEqual(code, 1)
        self.assertEqual(report["blocked"], [])
        self.assertEqual(report["gitleaks"]["exit_code"], 1)
        self.assertTrue(any(item["commit"] == introduced for item in report["gitleaks"]["findings"]))
        self.assertNotIn(secret, json.dumps(report))

    def test_tool_exit_and_missing_tool_fail_closed(self):
        self.save("safe.txt", "safe\n")
        self.scanner.return_value = {"version": CHECKS.VERSION, "exit_code": 2, "findings": []}
        self.assertEqual(self.release(["safe.txt"])[0], 1)
        self.scanner.side_effect = CHECKS.CheckError("tool-unavailable")
        self.assertEqual(self.release(["safe.txt"])[0], 1)

    def test_zero_missing_equal_and_unrelated_commits_fail(self):
        self.save("safe.txt", "safe")
        head = self.commit()
        for base in ["0" * 40, "f" * 40, head, "--bad-option"]:
            with self.subTest(base=base):
                self.assertEqual(self.check("changes", "--base=" + base, "--head", head)[0], 1)

    def test_pr_base_can_advance_after_branching(self):
        self.save("safe.txt", "safe\n")
        original = self.commit()
        self.git("checkout", "-qb", "feature")
        self.save("feature.txt", "safe change\n")
        head = self.commit()
        self.git("checkout", "--detach", original)
        self.save("main.txt", self.personal_path())
        base = self.commit()
        code, report = self.check("changes", "--base", base, "--head", head)
        self.assertEqual(code, 0)
        self.assertEqual(report["merge_base"], original)

    def test_invalid_and_non_object_manifests_fail_without_values(self):
        for content in ["[]", "null", '{"files":["."]}', '{"files":["../private"]}']:
            self.save("work/fixture/manifest.json", content)
            code, report = self.check("release", "--manifest", str(self.root / "work/fixture/manifest.json"))
            self.assertEqual(code, 1)
            self.assertNotIn("../private", json.dumps(report))

    def test_transient_forbidden_commit_blocks_before_scanner(self):
        self.save("safe.txt", "safe")
        base = self.commit()
        self.save("private.sqlite3", "must not read")
        self.commit()
        self.git("rm", "private.sqlite3")
        head = self.commit()
        self.scanner.reset_mock()
        code, report = self.check("changes", "--base", base, "--head", head)
        self.assertEqual(code, 1)
        self.scanner.assert_not_called()
        self.assertTrue(report["blocked"])

    def test_merge_only_forbidden_file_blocks_before_scanner(self):
        self.save("safe.txt", "base\n")
        original = self.commit()
        self.git("checkout", "-qb", "side")
        self.save("side.txt", "side\n")
        self.commit()
        self.git("checkout", "--detach", original)
        self.save("safe.txt", "main\n")
        base = self.commit()
        self.git("merge", "--no-ff", "--no-commit", "side")
        self.save("private.sqlite3", "must not read")
        head = self.commit()
        self.scanner.reset_mock()
        self.assertEqual(self.check("changes", "--base", base, "--head", head)[0], 1)
        self.scanner.assert_not_called()

    def test_full_interval_is_forwarded_even_when_final_patch_is_empty(self):
        self.save("safe.txt", "safe\n")
        base = self.commit()
        self.save("safe.txt", "intermediate secret\n")
        self.commit()
        self.save("safe.txt", "safe\n")
        head = self.commit()
        self.scanner.return_value = {"version": CHECKS.VERSION, "exit_code": 1, "findings": [{"rule": "gitleaks:test", "path": "safe.txt", "line": 1}]}
        self.assertEqual(self.check("changes", "--base", base, "--head", head)[0], 1)
        self.assertEqual(self.scanner.call_args.args[-1], base + ".." + head)

    def test_personal_path_introduced_then_deleted_is_reported_at_commit(self):
        self.save("safe.txt", "safe\n")
        base = self.commit()
        self.save("safe.txt", self.personal_path() + "\n")
        introduced = self.commit()
        self.save("safe.txt", "safe\n")
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 1)
        self.assertEqual(report["findings"][0]["commit"], introduced)
        self.assertNotIn(self.personal_path(), json.dumps(report))

    def test_side_branch_transient_privacy_is_not_skipped(self):
        self.save("safe.txt", "safe\n")
        original = self.commit()
        self.git("checkout", "-qb", "side")
        self.save("private.txt", self.personal_path())
        introduced = self.commit()
        self.git("rm", "private.txt")
        self.commit()
        self.git("checkout", "--detach", original)
        self.save("main.txt", "safe\n")
        base = self.commit()
        self.git("merge", "--no-ff", "-m", "test: merge side", "side")
        code, report = self.check("changes", "--base", base, "--head", self.git("rev-parse", "HEAD"))
        self.assertEqual(code, 1)
        self.assertTrue(any(finding["commit"] == introduced for finding in report["findings"]))

    def test_merge_resolution_privacy_then_deleted_is_reported(self):
        self.save("safe.txt", "safe\n")
        original = self.commit()
        self.git("checkout", "-qb", "side")
        self.save("side.txt", "safe\n")
        self.commit()
        self.git("checkout", "--detach", original)
        self.save("main.txt", "safe\n")
        base = self.commit()
        self.git("merge", "--no-ff", "--no-commit", "side")
        self.save("private.txt", self.personal_path())
        introduced = self.commit()
        self.git("rm", "private.txt")
        code, report = self.check("changes", "--base", base, "--head", self.commit())
        self.assertEqual(code, 1)
        self.assertEqual(report["findings"][0]["commit"], introduced)

    def test_merging_existing_base_privacy_is_not_a_new_value(self):
        self.save("safe.txt", "safe\n")
        original = self.commit()
        self.git("checkout", "-qb", "feature")
        self.save("feature.txt", "safe\n")
        self.commit()
        self.git("checkout", "--detach", original)
        self.save("old.txt", self.personal_path())
        base = self.commit()
        self.git("checkout", "feature")
        self.git("merge", "--no-ff", "-m", "test: synchronize base", base)
        code, report = self.check("changes", "--base", base, "--head", self.git("rev-parse", "HEAD"))
        self.assertEqual(code, 0)
        self.assertEqual(report["findings"], [])

    def test_windows_trailing_aliases_rejected_before_file_access(self):
        for name in [".env ", "videos./draft.txt", "nested /safe.txt"]:
            with self.subTest(name=name), patch.object(CHECKS, "safe_file", side_effect=AssertionError("must not access alias")):
                self.assertEqual(self.release([name])[0], 1)

    @unittest.skipUnless(hasattr(ctypes, "WinDLL"), "Windows short names require Win32")
    def test_windows_short_name_cannot_read_private_candidate(self):
        self.save("progress-registry.json", "synthetic private data")
        function = ctypes.WinDLL("kernel32", use_last_error=True).GetShortPathNameW
        function.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_uint32]
        function.restype = ctypes.c_uint32
        buffer = ctypes.create_unicode_buffer(32768)
        count = function(str(self.root / "progress-registry.json"), buffer, len(buffer))
        self.assertGreater(count, 0)
        alias = Path(buffer.value).name
        if alias.lower() == "progress-registry.json":
            self.skipTest("8.3 alias unavailable on this volume")
        with patch.object(Path, "read_bytes", side_effect=AssertionError("must not read private alias")):
            self.assertEqual(self.release([alias])[0], 1)


if __name__ == "__main__":
    unittest.main()
