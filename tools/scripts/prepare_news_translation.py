"""Install the public English-Chinese model into the chosen local profile."""
from pathlib import Path
from urllib.request import urlopen
import hashlib
import json
import zipfile

import argparse
from control_everything.paths import default_profile_dir

ROOT = default_profile_dir() / "news-reader" / "translation-model"
URL = "https://data.argosopentech.com/argospm/v1/translate-en_zh-1_9.argosmodel"
# These matching public mirror hashes are a cross-check, not an upstream signature.
EXPECTED_SHA256 = "433e7c4f034d87fbe2353161e05f18646d7999452f801a4e1f0378522b9850ab"
HASH_REFERENCE = "https://huggingface.co/TiberiuCristianLeon/Argostranslate/blob/9dc7a2c8f29ac18e020c93f8208476d1e3fe9a9f/translate-en_zh-1_9.argosmodel"


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    archive = ROOT / "english-chinese.argosmodel"
    if not archive.exists():
        partial = ROOT / "download.part"
        with urlopen(URL, timeout=45) as response, partial.open("wb") as output:
            total = 0
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
                total += len(chunk)
                if total % (8 * 1024 * 1024) == 0:
                    print(f"Downloaded {total // (1024 * 1024)} MiB", flush=True)
        with partial.open("rb") as source:
            actual_hash = hashlib.file_digest(source, "sha256").hexdigest()
        if actual_hash != EXPECTED_SHA256:
            raise ValueError("Downloaded model differs from both public mirrors")
        partial.replace(archive)
    with archive.open("rb") as source:
        actual_hash = hashlib.file_digest(source, "sha256").hexdigest()
    if actual_hash != EXPECTED_SHA256:
        raise ValueError("Model archive checksum changed")
    with zipfile.ZipFile(archive) as model:
        if model.testzip() is not None:
            raise ValueError("Model archive CRC failed")
        for name in model.namelist():
            if not (ROOT / name).resolve().is_relative_to(ROOT.resolve()):
                raise ValueError("Model archive path escaped its directory")
        model.extractall(ROOT)
    report = {
        "download_url": URL,
        "package": "translate-en_zh-1_9",
        "bytes": archive.stat().st_size,
        "sha256": actual_hash,
        "hash_reference": HASH_REFERENCE,
        "hash_verification": "matches public mirrors; no publisher signature was available",
    }
    (ROOT / "download-record.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=default_profile_dir())
    args = parser.parse_args()
    ROOT = args.data_dir / "news-reader" / "translation-model"
    main()
