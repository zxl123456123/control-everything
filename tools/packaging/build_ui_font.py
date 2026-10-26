"""Generate the retained Geist payload in existing standalone delivery assets."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
import sys


FONT_PATH = Path("web/workbench-engine/src/renderer/src/assets/fonts/Geist-Variable.woff2")
NOTICE_PATH = Path("web/workbench-engine/licenses/Geist-OFL-notice.md")
FONT_SIZE = 69436
FONT_SHA256 = "e24cec106619c03f0b3519e31b9bc55e0d5e926b6a95b8d798cd8cef215b1505"
JS_PATH = Path("web/workspace/ui-theme.js")
CSS_PATH = Path("web/workspace/identity-theme/control-everything/login/resources/css/studio.css")
BEGIN = b"/* BEGIN CE GENERATED GEIST FONT */"
END = b"/* END CE GENERATED GEIST FONT */"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def replace_block(original: bytes, payload: bytes, path: Path) -> bytes:
    if original.count(BEGIN) != 1 or original.count(END) != 1:
        raise ValueError(f"{path.as_posix()}: expected one generated font block")
    start = original.index(BEGIN)
    end = original.index(END, start) + len(END)
    # Follow the handwritten prefix so normal Windows checkout conversion is reproducible.
    if b"\r\n" in original[:start]:
        payload = payload.replace(b"\n", b"\r\n")
    return original[:start] + payload + original[end:]


def generated_blocks(font: bytes, notice: bytes) -> tuple[bytes, bytes]:
    if len(font) != FONT_SIZE or sha256(font) != FONT_SHA256:
        raise ValueError("Geist source bytes changed; review the registered source before regeneration")
    notice_text = notice.decode("utf-8").replace("\r\n", "\n").rstrip("\n")
    if "*/" in notice_text:
        raise ValueError("Geist notice contains a comment terminator")
    data_url = "data:font/woff2;base64," + base64.b64encode(font).decode("ascii")
    header = (
        BEGIN.decode() + "\n"
        "/*! Geist font copyright and full SIL OFL notice. Retain in distributed/minified assets.\n"
        + notice_text + "\n*/\n"
        f"/* source-sha256: {FONT_SHA256}; notice-sha256: {sha256(notice)} */\n"
    )
    js = header + "const GEIST_DATA_URL = " + json.dumps(data_url) + ";\n" + END.decode()
    css = (
        header + '@font-face {\n  font-family: "Geist";\n  src: url("' + data_url + '") format("woff2");\n'
        "  font-style: normal;\n  font-weight: 100 900;\n  font-display: swap;\n}\n"
        ':root { --pf-v5-global--FontFamily--text: Geist, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif; }\n'
        + END.decode()
    )
    return js.encode("utf-8"), css.encode("utf-8")


def run(root: Path, mode: str) -> None:
    font = (root / FONT_PATH).read_bytes()
    notice = (root / NOTICE_PATH).read_bytes()
    blocks = generated_blocks(font, notice)
    outputs = []
    for relative, block in zip((JS_PATH, CSS_PATH), blocks):
        path = root / relative
        original = path.read_bytes()
        generated = replace_block(original, block, relative)
        outputs.append((relative, path, original, generated))
    if mode == "check":
        mismatches = [relative.as_posix() for relative, _, original, generated in outputs if original != generated]
        if mismatches:
            raise ValueError("generated font block differs: " + ", ".join(mismatches))
    else:
        for _, path, original, generated in outputs:
            if original != generated:
                path.write_bytes(generated)
    print(f"FONT_SOURCE {FONT_PATH.as_posix()} bytes={len(font)} sha256={sha256(font)}")
    print(f"FONT_NOTICE {NOTICE_PATH.as_posix()} sha256={sha256(notice)}")
    for relative, _, _, generated in outputs:
        print(f"GENERATED {relative.as_posix()} sha256={sha256(generated)}")
    print("UI_FONT_" + mode.upper() + "_OK")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("build", "check"))
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2], help="Source checkout or isolated fixture root")
    arguments = parser.parse_args(argv)
    try:
        run(arguments.root, arguments.mode)
    except (OSError, UnicodeError, ValueError) as error:
        print(f"UI_FONT_{arguments.mode.upper()}_FAILED: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
