"""Include only the HTTP allowlist from the single web source tree."""

from pathlib import Path, PurePosixPath
import shutil
import hashlib
import json
import mimetypes

from setuptools.command.build_py import build_py


WEB_ASSETS = (
    "sessions/index.html", "sessions/app.js", "sessions/style.css",
    "progress/progress.html", "progress/progress.js", "progress/progress.css",
    "product/index.html", "product/product.css", "product/product.js",
    "workspace/workspace.html", "workspace/workspace.js", "workspace/workspace.css",
    "workspace/ui-theme.js", "workspace/ui-dialog.js", "workspace/studio-shell.js", "workspace/studio-pet-settings.js", "workspace/studio-mascot.js",
    "workspace/onboarding.js",
    "workspace/desktop.html", "workspace/desktop.js", "workspace/remote-context.js",
    "workspace/account-device.js",
    "workspace/remote-account.html", "workspace/remote-account.js", "workspace/remote-account.css",
    "workspace/agents.js",
    "workspace/project-progress.js", "workspace/project-progress-model.js", "workspace/project-progress.css",
    "workspace/task-center.js", "workspace/project-space.js", "workspace/execution.js", "workspace/observation.js",
    "workspace/news.js", "workspace/quota.js",
    "workspace/news-reader.html", "workspace/news-reader.css", "workspace/news-reader.js",
    "workspace/news-sections.css", "workspace/news-sections.js", "workspace/news-section-editor.js", "workspace/news-search.js",
    "workspace/news-spider.js", "workspace/news-browser.js", "workspace/news-public-embed.js",
    "workspace/news-pets.js", "workspace/news-pet-dial.js", "workspace/news-pet-wheel.js", "workspace/news-pet-prefs.js", "workspace/news-pet-director.js", "workspace/news-pet-status.js", "workspace/news-naidragon.js", "workspace/news-tabbycat.js",
    "workspace/mobile-device-entry.js", "workspace/studio-preview.html", "workspace/studio-preview.css", "workspace/studio-preview.js",
    "workspace/studio-data.js",
    "workspace/monitor-art.js", "workspace/monitor-scene.js", "workspace/monitor-model.js",
    "workspace/project-monitor.js", "workspace/project-monitor.css",
)


def export_workbench_assets(engine_root, build_run):
    """Publish only Web artifacts already pinned by the source build contract."""
    engine_root, build_run = Path(engine_root).resolve(), Path(build_run).resolve()
    document = json.loads((build_run / "output-manifest.json").read_text(encoding="utf-8"))
    rows = []
    overrides = {".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
                 ".woff2": "font/woff2", ".woff": "font/woff", ".bcmap": "application/octet-stream",
                 ".pfb": "application/x-font-type1"}
    for row in document["files"]:
        name = row["path"]
        if not name.startswith("out/web/"):
            continue
        relative = name[len("out/web/"):]
        path = PurePosixPath(relative)
        if (path.is_absolute() or path.as_posix() != relative or ".." in path.parts
                or "\\" in relative or ":" in relative):
            raise ValueError("invalid_workbench_artifact")
        if any(part.startswith(".") for part in path.parts) or path.suffix == ".map":
            continue
        source = engine_root / name
        for item in (source, *source.parents):
            if item.is_symlink() or item.is_junction():
                raise ValueError("linked_workbench_artifact")
            if item == engine_root:
                break
        content = source.read_bytes()
        if hashlib.sha256(content).hexdigest() != row["sha256"] or len(content) != row["bytes"]:
            raise ValueError("workbench_artifact_changed")
        mime = overrides.get(path.suffix) or mimetypes.guess_type(relative)[0] or "application/octet-stream"
        rows.append({"path": relative, "mime": mime, "sha256": row["sha256"], "bytes": len(content)})
    if "web-index.html" not in {row["path"] for row in rows} or len(rows) != len({row["path"] for row in rows}):
        raise ValueError("invalid_workbench_artifact_set")
    destination = build_run / "web-assets.json"
    destination.write_text(json.dumps({"schema": 1, "files": sorted(rows, key=lambda row: row["path"])},
                                      indent=2) + "\n", encoding="utf-8")
    return destination


class BuildPy(build_py):
    def asset_mapping(self):
        root = Path(__file__).resolve().parents[2]
        result = {}
        for relative in WEB_ASSETS:
            path = PurePosixPath(relative)
            if (path.is_absolute() or '..' in path.parts or path.as_posix() != relative
                    or '\\' in relative or ':' in relative or path.suffix not in {'.html', '.css', '.js'}):
                raise ValueError("invalid_web_asset")
            source = root / "web" / relative
            cursor = source
            while cursor != root:
                if cursor.is_symlink() or cursor.is_junction():
                    raise ValueError("linked_web_asset")
                cursor = cursor.parent
            if not source.is_file():
                raise ValueError("missing_web_asset: " + relative)
            destination = Path(self.build_lib) / "control_everything" / "_assets" / "web" / relative
            result[str(destination)] = str(source)
        return result

    def get_source_files(self):
        root = Path(__file__).resolve().parents[2]
        sources = [Path(source).relative_to(root).as_posix() for source in self.asset_mapping().values()]
        return list(dict.fromkeys(super().get_source_files() + sources))

    def get_outputs(self, include_bytecode=1):
        return list(dict.fromkeys(super().get_outputs(include_bytecode) + list(self.asset_mapping())))

    def get_output_mapping(self):
        return {**super().get_output_mapping(), **self.asset_mapping()}

    def run(self):
        mapping = self.asset_mapping()
        super().run()
        if self.editable_mode:
            return
        for destination, source in mapping.items():
            target = Path(destination)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            if target.read_bytes() != Path(source).read_bytes():
                raise ValueError("web_asset_copy_mismatch")
