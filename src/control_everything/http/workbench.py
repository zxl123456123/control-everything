"""Same-origin Studio and a manifest-bound, internally managed project client."""

import hashlib
import json
from pathlib import Path, PurePosixPath
import re
from urllib.parse import parse_qs, quote, unquote, urlsplit

from control_everything.input_validation import ProfileError
from control_everything.integrations.workbench_runtime import WorkbenchUnavailable
from control_everything.paths import web_root
from control_everything.workspace.validation import project_id_valid

WEB = web_root()
STUDIO_RESOURCES = {
    "/studio": ("studio-preview.html", "text/html; charset=utf-8"),
    "/studio-shell": ("studio-preview.html", "text/html; charset=utf-8"),
    "/studio-preview.css": ("studio-preview.css", "text/css; charset=utf-8"),
    "/studio-preview.js": ("studio-preview.js", "text/javascript; charset=utf-8"),
    "/studio-data.js": ("studio-data.js", "text/javascript; charset=utf-8"),
    "/workspace-admin": ("workspace.html", "text/html; charset=utf-8"),
}
STUDIO_CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
              "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; "
              "frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
ASSET_SUFFIXES = {"", ".html", ".js", ".mjs", ".css", ".json", ".png", ".svg", ".webp", ".ico",
                  ".woff", ".woff2", ".ttf", ".otf", ".wasm", ".bcmap", ".pfb"}


def _relative(value):
    if (type(value) is not str or not value or "\\" in value or ":" in value or "%" in value
            or any(ord(char) < 32 for char in value)):
        raise ValueError("invalid_workbench_asset")
    path = PurePosixPath(value)
    if path.is_absolute() or path.as_posix() != value or any(part in (".", "..") or part.startswith(".") for part in path.parts):
        raise ValueError("invalid_workbench_asset")
    if path.suffix.lower() not in ASSET_SUFFIXES:
        raise ValueError("invalid_workbench_asset")
    return path


def _unlinked(path):
    for current in (path, *path.parents):
        if current.is_symlink() or current.is_junction():
            raise ValueError("linked_workbench_asset")
    return path


class WorkbenchAssets:
    """Read only verified build files; never expose a source directory listing."""

    def __init__(self, root, manifest_path):
        self.root = _unlinked(Path(root).absolute()).resolve()
        manifest = json.loads(_unlinked(Path(manifest_path).absolute()).read_text(encoding="utf-8"))
        if (type(manifest) is not dict or set(manifest) != {"schema", "files"}
                or type(manifest["schema"]) is not int or manifest["schema"] != 1 or type(manifest["files"]) is not list):
            raise ValueError("invalid_workbench_manifest")
        self.files = {}
        for entry in manifest["files"]:
            if type(entry) is not dict or set(entry) != {"path", "mime", "sha256", "bytes"}:
                raise ValueError("invalid_workbench_manifest")
            relative = _relative(entry["path"]).as_posix()
            if (relative in self.files or type(entry["sha256"]) is not str or not re.fullmatch(r"[a-f0-9]{64}", entry["sha256"])
                    or type(entry["bytes"]) is not int or entry["bytes"] < 0
                    or type(entry["mime"]) is not str or not re.fullmatch(r"[a-z0-9.+-]+/[a-z0-9.+-]+(?:; charset=utf-8)?", entry["mime"])):
                raise ValueError("invalid_workbench_manifest")
            self.files[relative] = entry
            self.read(relative)
        if "web-index.html" not in self.files:
            raise ValueError("missing_workbench_entry")

    def read(self, relative):
        relative = _relative(relative).as_posix()
        entry = self.files.get(relative)
        if entry is None:
            raise FileNotFoundError("unlisted_workbench_asset")
        target = _unlinked(self.root.joinpath(*PurePosixPath(relative).parts))
        if not target.is_file() or not target.resolve().is_relative_to(self.root):
            raise FileNotFoundError("missing_workbench_asset")
        body = target.read_bytes()
        if len(body) != entry["bytes"] or hashlib.sha256(body).hexdigest() != entry["sha256"]:
            raise ValueError("workbench_asset_changed")
        return body, entry["mime"]


def _workbench_csp(manager):
    origin = manager.websocket_origin
    parsed = urlsplit(origin)
    if (parsed.scheme != "ws" or parsed.hostname != "127.0.0.1" or parsed.username or parsed.password
            or parsed.path or parsed.query or parsed.fragment or not parsed.port
            or origin != f"ws://127.0.0.1:{parsed.port}"):
        raise WorkbenchUnavailable("runtime_protocol_error")
    return ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; "
            f"connect-src 'self' {origin}; object-src 'none'; frame-src 'self' blob:; "
            "frame-ancestors 'none'; base-uri 'none'; form-action 'self'")


def handle_get(handler, path):
    if (path.path == "/workspace" and not path.query
            and getattr(handler.server, "workbench_runtime", None) is not None
            and getattr(handler.server, "workbench_assets", None) is not None):
        # Browsers retain the original fragment when Location has none.
        handler.send_response(302)
        handler.send_header("Location", "/studio")
        handler.send_header("Content-Length", "0")
        handler.send_header("Cache-Control", "no-store")
        handler.end_headers()
        return True
    resource = STUDIO_RESOURCES.get(path.path)
    if resource:
        if path.query:
            handler.reject(400, "invalid_request")
            return True
        try:
            manager = getattr(handler.server, "workbench_runtime", None)
            assets = getattr(handler.server, "workbench_assets", None)
            if path.path == "/studio" and manager is not None and assets is not None:
                body, mime = assets.read("web-index.html")
                # The verified Web entry uses relative build assets; Studio is one level higher.
                body = body.replace(b'="./assets/', b'="/workbench/assets/')
                handler.reply(200, body, mime, csp=_workbench_csp(manager))
                return True
            body = (WEB / "workspace" / resource[0]).read_bytes()
            if path.path == "/workspace-admin":
                body = body.replace(b'<body>', b'<body data-integration-admin="true">', 1)
            if path.path in ("/studio", "/studio-shell") and manager is not None:
                body = body.replace(b'id="ce-studio"', b'id="ce-studio" data-isolated-preview="true"', 1)
            handler.reply(200, body, resource[1], csp=STUDIO_CSP)
        except (OSError, ValueError, WorkbenchUnavailable):
            handler.reject(503, "studio_assets_unavailable")
        return True
    if not path.path.startswith("/workbench/"):
        return False
    try:
        relative = unquote(path.path[len("/workbench/"):], errors="strict")
        _relative(relative)
        if relative == "web-index.html":
            params = parse_qs(path.query, keep_blank_values=True, strict_parsing=True)
            if set(params) != {"project_id"} or len(params["project_id"]) != 1 or not project_id_valid(params["project_id"][0]):
                raise ValueError("invalid_request")
            manager = getattr(handler.server, "workbench_runtime", None)
            if manager is None or not manager.ready:
                raise WorkbenchUnavailable("runtime_unavailable")
            csp = _workbench_csp(manager)
        else:
            if path.query:
                raise ValueError("invalid_request")
            csp = None
        assets = getattr(handler.server, "workbench_assets", None)
        if assets is None:
            raise WorkbenchUnavailable("workbench_assets_unavailable")
        body, mime = assets.read(relative)
        handler.reply(200, body, mime, csp=csp)
    except WorkbenchUnavailable as error:
        handler.reject(503, error.code)
    except FileNotFoundError:
        handler.reject(404, "route_not_found")
    except (ValueError, UnicodeError) as error:
        if str(error) in ("workbench_asset_changed", "linked_workbench_asset"):
            handler.reject(503, "workbench_assets_unavailable")
        else:
            handler.reject(400, "invalid_workbench_asset")
    except OSError:
        handler.reject(503, "workbench_assets_unavailable")
    return True


def _project(workspace, identity):
    if workspace is None or workspace.profile is None:
        raise ProfileError("workspace_unavailable", status=503)
    project = next((row for row in workspace.registered_projects() if row["id"] == identity), None)
    if project is None or project.get("archived"):
        raise ProfileError("project_not_found", status=404)
    if project.get("binding_available") is False:
        raise ProfileError("project_directory_unavailable", status=409)
    directory = next((row["path"] for row in project.get("directories", []) if row["id"] == "main"), None)
    if not directory:
        raise ProfileError("project_directory_unavailable", status=409)
    return {"id": project["id"], "name": project["name"], "directory": directory, "updated_at": project.get("updated_at")}


def handle_post(handler, path):
    if path.path != "/api/workbench/bootstrap":
        return False
    if not handler.allowed(api=True, focus=True):
        return True
    manager = getattr(handler.server, "workbench_runtime", None)
    result = None
    try:
        if path.query:
            raise ValueError("invalid_request")
        body = handler.read_json_body(max_bytes=4096, strict=True)
        if set(body) != {"project_id"} or not project_id_valid(body["project_id"]):
            raise ValueError("invalid_request")
        if manager is None or not manager.ready:
            raise WorkbenchUnavailable("runtime_unavailable")
        project = _project(handler.server.workspace, body["project_id"])
        result = manager.bootstrap(project["id"], project["name"], project["directory"])
        if _project(handler.server.workspace, project["id"]) != project:
            raise ProfileError("project_directory_changed", status=409)
        response = {"project": {"id": project["id"], "name": project["name"]},
                    "runtime": result["runtime"], "target": result["target"],
                    "returnUrl": "/studio#project/" + quote(project["id"], safe="")}
        handler.reply(200, response)
        return True
    except ProfileError as error:
        failure = (error.status, error.reason)
    except WorkbenchUnavailable as error:
        failure = (503, error.code)
    except ValueError as error:
        failure = (413 if str(error) == "body_too_large" else 400, "invalid_request")
    except (BrokenPipeError, ConnectionError):
        failure = None
    except Exception:
        failure = (503, "workbench_bootstrap_failed")
    if result is not None:
        try:
            manager.discard_bootstrap(result)
        except Exception:
            failure = (503, "workbench_device_cleanup_failed")
    if failure is not None:
        handler.reject(*failure)
    return True
