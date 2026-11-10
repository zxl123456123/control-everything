"""Deterministic font payload checks against source bytes and isolated fixtures."""

from contextlib import redirect_stderr, redirect_stdout
import base64
import importlib.util
import io
from pathlib import Path
import re
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("build_ui_font", ROOT / "tools/packaging/build_ui_font.py")
FONT_BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FONT_BUILDER)


class UIFontAssetsTests(unittest.TestCase):
    def fixture(self, root):
        for path in (FONT_BUILDER.FONT_PATH, FONT_BUILDER.NOTICE_PATH):
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((ROOT / path).read_bytes())
        originals = {}
        for path in (FONT_BUILDER.JS_PATH, FONT_BUILDER.CSS_PATH):
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            original = b"/* handwritten before */\r\n" + FONT_BUILDER.BEGIN + b"\nold\n" + FONT_BUILDER.END + b"\r\n/* handwritten after */\r\n"
            target.write_bytes(original)
            originals[path] = original
        return originals

    def run_builder(self, root, mode):
        output, errors = io.StringIO(), io.StringIO()
        with redirect_stdout(output), redirect_stderr(errors):
            code = FONT_BUILDER.main([mode, "--root", str(root)])
        return code, output.getvalue(), errors.getvalue()

    def outside_block(self, value):
        start = value.index(FONT_BUILDER.BEGIN)
        end = value.index(FONT_BUILDER.END) + len(FONT_BUILDER.END)
        return value[:start], value[end:]

    def test_checkout_payload_matches_the_one_font_and_complete_notice(self):
        self.assertEqual(self.run_builder(ROOT, "check")[0], 0)
        font = (ROOT / FONT_BUILDER.FONT_PATH).read_bytes()
        notice = (ROOT / FONT_BUILDER.NOTICE_PATH).read_text(encoding="utf-8").rstrip("\n")
        self.assertEqual(len(font), 69436)
        self.assertEqual(FONT_BUILDER.sha256(font), FONT_BUILDER.FONT_SHA256)
        for path in (FONT_BUILDER.JS_PATH, FONT_BUILDER.CSS_PATH):
            text = (ROOT / path).read_text(encoding="utf-8")
            payloads = re.findall(r"data:font/woff2;base64,([A-Za-z0-9+/=]+)", text)
            self.assertEqual(len(payloads), 1)
            self.assertEqual(base64.b64decode(payloads[0], validate=True), font)
            self.assertIn(notice, text)
            self.assertIn("/*! Geist font copyright", text)
            self.assertIn("Retain in distributed/minified assets", text)

    def test_build_reproducible_preserving_all_handwritten_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            originals = self.fixture(root)
            self.assertEqual(self.run_builder(root, "build")[0], 0)
            first = {path: (root / path).read_bytes() for path in originals}
            for path, original in originals.items():
                self.assertEqual(self.outside_block(first[path]), self.outside_block(original))
            self.assertEqual(self.run_builder(root, "build")[0], 0)
            for path in originals:
                self.assertEqual((root / path).read_bytes(), first[path])
            self.assertEqual(self.run_builder(root, "check")[0], 0)

    def test_check_detects_tampering_without_writing_any_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            originals = self.fixture(root)
            self.assertEqual(self.run_builder(root, "build")[0], 0)
            for tampered_path in originals:
                original = (root / tampered_path).read_bytes()
                (root / tampered_path).write_bytes(original.replace(b"data:font/woff2;base64,", b"data:font/woff2;base64,A", 1))
                before = {path: (root / path).read_bytes() for path in originals}
                code, _, errors = self.run_builder(root, "check")
                self.assertEqual(code, 1)
                self.assertIn("generated font block differs", errors)
                self.assertEqual({path: (root / path).read_bytes() for path in originals}, before)
                (root / tampered_path).write_bytes(original)

    def test_check_remains_reproducible_for_lf_and_windows_crlf_checkouts(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            originals = self.fixture(root)
            for path in originals:
                (root / path).write_bytes((root / path).read_bytes().replace(b"\r\n", b"\n"))
            self.assertEqual(self.run_builder(root, "build")[0], 0)
            before_lf_check = {path: ((root / path).read_bytes(), (root / path).stat().st_mtime_ns) for path in originals}
            self.assertEqual(self.run_builder(root, "check")[0], 0)
            self.assertEqual({path: ((root / path).read_bytes(), (root / path).stat().st_mtime_ns) for path in originals}, before_lf_check)
            for path in originals:
                (root / path).write_bytes((root / path).read_bytes().replace(b"\n", b"\r\n"))
            before_crlf_check = {path: ((root / path).read_bytes(), (root / path).stat().st_mtime_ns) for path in originals}
            self.assertEqual(self.run_builder(root, "check")[0], 0)
            self.assertEqual({path: ((root / path).read_bytes(), (root / path).stat().st_mtime_ns) for path in originals}, before_crlf_check)
            before = {path: (root / path).read_bytes() for path in originals}
            self.assertEqual(self.run_builder(root, "build")[0], 0)
            self.assertEqual({path: (root / path).read_bytes() for path in originals}, before)

    def test_missing_inputs_and_changed_font_fail_without_writes(self):
        for missing in (FONT_BUILDER.FONT_PATH, FONT_BUILDER.NOTICE_PATH):
            with self.subTest(missing=missing), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                originals = self.fixture(root)
                (root / missing).unlink()
                for mode in ("build", "check"):
                    code, _, errors = self.run_builder(root, mode)
                    self.assertEqual(code, 1)
                    self.assertIn("FAILED", errors)
                    self.assertEqual({path: (root / path).read_bytes() for path in originals}, originals)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            originals = self.fixture(root)
            (root / FONT_BUILDER.FONT_PATH).write_bytes(b"changed source")
            self.assertEqual(self.run_builder(root, "build")[0], 1)
            self.assertEqual({path: (root / path).read_bytes() for path in originals}, originals)

    def test_invalid_or_missing_markers_do_not_partially_update_outputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            originals = self.fixture(root)
            broken = originals[FONT_BUILDER.CSS_PATH].replace(FONT_BUILDER.END, b"missing end")
            (root / FONT_BUILDER.CSS_PATH).write_bytes(broken)
            code, _, errors = self.run_builder(root, "build")
            self.assertEqual(code, 1)
            self.assertIn("expected one generated font block", errors)
            self.assertEqual((root / FONT_BUILDER.JS_PATH).read_bytes(), originals[FONT_BUILDER.JS_PATH])
            self.assertEqual((root / FONT_BUILDER.CSS_PATH).read_bytes(), broken)


if __name__ == "__main__":
    unittest.main()
