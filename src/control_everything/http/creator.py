"""Loopback-only source-checkout preview for managed Godot creation projects."""

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import secrets
import sys
from urllib.parse import urlsplit

from control_everything.execution.creator_process import CreatorProcesses
from control_everything.integrations.godot_creator import GodotLibrary, PROJECT_ID, strict_json
from control_everything.paths import web_root


RESOURCES = {"/": ("creator.html", "text/html; charset=utf-8"),
             "/creator.css": ("creator.css", "text/css; charset=utf-8"),
             "/creator.js": ("creator.js", "text/javascript; charset=utf-8"),
             "/studio-preview.css": ("studio-preview.css", "text/css; charset=utf-8")}
DETAIL_ROUTE = re.compile(r"/api/creator/projects/([0-9a-f]{32})\Z")
MESSAGES = {"host_rejected": "请求 Host 不匹配。", "origin_rejected": "只接受同源请求。",
            "csrf_rejected": "请求凭据无效，请刷新创作页。", "invalid_json": "需要不超过 16 KiB 的 JSON 对象。",
            "invalid_action": "只接受规定的项目 ID、动作和字段。", "invalid_request": "请求字段不匹配。",
            "invalid_project": "请输入不含控制字符的 1～80 字符名称，并选择 2D 或 3D。",
            "invalid_project_id": "项目 ID 格式不正确。", "project_not_found": "该创作项目不存在。",
            "invalid_brief": "创作说明最多 4000 字符。", "action_busy": "该类操作仍在运行。",
            "project_busy": "当前工程正在使用，请在原生窗口关闭后再操作。", "service_closed": "创作服务正在关闭。",
            "library_scan_failed": "项目库读取不完整，请检查权限、项目元数据或未完成创建的目录。",
            "project_metadata_invalid": "项目元数据缺失或损坏，请保留现场并检查项目目录。",
            "project_source_missing": "项目源码或 project.godot 缺失。", "project_path_invalid": "项目路径越界或包含链接。",
            "operation_failed": "无法执行操作，请检查本机配置与项目证据目录。",
            "project_read_failed": "项目说明或文件概览读取失败，请检查权限、编码及文件大小。",
            "not_found": "未提供该资源。", "resource_unavailable": "创作页面资源不可用，请从源码检出运行。",
            "method_not_allowed": "不支持该请求方法。"}


def agent_client_url(value):
    if value == "":
        return ""
    if (type(value) is not str or any(char.isspace() or ord(char) < 32 for char in value)
            or any(char in value for char in "\\?#")):
        raise ValueError("invalid_agent_client_url")
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username is not None or parsed.password is not None:
            raise ValueError("invalid_agent_client_url")
        parsed.port
    except ValueError:
        raise ValueError("invalid_agent_client_url") from None
    return value


class CreatorHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, status, value, content_type="application/json; charset=utf-8"):
        body = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; "
                         "connect-src 'self'; img-src 'self'; object-src 'none'; frame-src 'none'; "
                         "frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        if getattr(self, "command", None) != "HEAD":
            self.wfile.write(body)

    def reject(self, status, error):
        self.close_connection = True
        self.reply(status, {"error": error, "message": MESSAGES[error]})

    def send_error(self, code, message=None, explain=None):
        self.reject(code, "method_not_allowed" if code == 501 else "invalid_json")

    def failure(self, error, fallback="operation_failed"):
        reason = str(error)
        status = (404 if reason == "project_not_found" else 409 if reason in {"action_busy", "project_busy", "service_closed"}
                  else 422 if reason in {"invalid_action", "invalid_project", "invalid_project_id", "invalid_brief"} else 503)
        self.reject(status, reason if reason in MESSAGES else fallback)

    def allowed(self, *, write=False):
        if self.headers.get_all("Host", []) != [self.server.expected_host]:
            self.reject(403, "host_rejected")
            return False
        origins = self.headers.get_all("Origin", [])
        if (write or origins) and origins != [self.server.origin]:
            self.reject(403, "origin_rejected")
            return False
        if write and self.headers.get_all("X-Creator-CSRF", []) != [self.server.csrf_token]:
            self.reject(403, "csrf_rejected")
            return False
        return True

    def do_GET(self):
        if not self.allowed():
            return
        if self.path == "/api/creator/state":
            try:
                projects = self.server.library.projects()
                state = self.server.processes.snapshot()
            except (OSError, ValueError):
                self.reject(503, "library_scan_failed")
                return
            self.reply(200, {"version": 2, "csrf_token": self.server.csrf_token,
                             "library_path": str(self.server.library.root), "projects": projects,
                             "agent": {"mode": "workbench_client", "client_url": self.server.agent_client_url,
                                       "connection_state": "unverified", "can_submit": False}, **state})
            return
        match = DETAIL_ROUTE.fullmatch(self.path)
        if match:
            try:
                detail = self.server.library.detail(match[1])
            except (OSError, ValueError, UnicodeError) as error:
                self.failure(error, "project_read_failed")
                return
            self.reply(200, detail)
            return
        resource = RESOURCES.get(self.path)
        if resource is None:
            self.reject(404, "not_found")
            return
        try:
            body = (self.server.resource_root / resource[0]).read_bytes()
        except OSError:
            self.reject(503, "resource_unavailable")
            return
        self.reply(200, body, resource[1])

    def read_body(self):
        lengths, types = self.headers.get_all("Content-Length", []), self.headers.get_all("Content-Type", [])
        if (self.headers.get_all("Transfer-Encoding", []) or len(lengths) != 1
                or not re.fullmatch(r"[0-9]{1,5}", lengths[0]) or not 1 <= int(lengths[0]) <= 16384
                or len(types) != 1 or types[0].lower() not in {"application/json", "application/json; charset=utf-8"}):
            raise ValueError("invalid_json")
        self.connection.settimeout(2)
        data = self.rfile.read(int(lengths[0]))
        if len(data) != int(lengths[0]):
            raise ValueError("invalid_json")
        value = strict_json(data.decode("utf-8"))
        if type(value) is not dict:
            raise ValueError("invalid_json")
        return value

    def do_POST(self):
        if not self.allowed(write=True):
            return
        routes = {"/api/creator/projects": {"name", "kind"}, "/api/creator/brief": {"project_id", "text"},
                  "/api/creator/action": {"project_id", "action"}}
        if self.path not in routes:
            self.reject(404, "not_found")
            return
        try:
            value = self.read_body()
        except (OSError, ValueError, UnicodeError, RecursionError):
            self.reject(422, "invalid_json")
            return
        if set(value) != routes[self.path]:
            self.reject(422, "invalid_request")
            return
        if "project_id" in value and (type(value["project_id"]) is not str or not PROJECT_ID.fullmatch(value["project_id"])):
            self.reject(422, "invalid_project_id")
            return
        try:
            if self.path == "/api/creator/projects":
                result, status = {"project": self.server.library.create(value["name"], value["kind"])}, 201
            elif self.path == "/api/creator/brief":
                result, status = self.server.library.save_brief(value["project_id"], value["text"]), 200
            else:
                action = value["action"]
                if type(action) is not str or action not in {"edit", "play", "check"}:
                    self.reject(422, "invalid_action")
                    return
                result = self.server.processes.start(action, value["project_id"], self.server.library.prepare, self.server.library.run)
                status = 202
        except (OSError, ValueError, UnicodeError) as error:
            self.failure(error)
            return
        self.reply(status, result)

    def do_OPTIONS(self):
        self.reject(405, "method_not_allowed")

    def do_HEAD(self):
        self.do_GET()


class CreatorServer(ThreadingHTTPServer):
    allow_reuse_address = False

    def __init__(self, port, library, processes=None, *, client_url=""):
        selected_url = agent_client_url(client_url)
        super().__init__(("127.0.0.1", port), CreatorHandler)
        self.library = library
        self.processes = processes or CreatorProcesses()
        self.expected_host = "127.0.0.1:" + str(self.server_port)
        self.origin = "http://" + self.expected_host
        self.csrf_token = secrets.token_urlsafe(32)
        self.resource_root = web_root() / "workspace"
        self.agent_client_url = selected_url

    def server_close(self):
        if hasattr(self, "processes"):
            remaining = self.processes.close()
            if remaining:
                print("创作服务退出；以下本轮原生进程仍在运行，请在原生窗口正常关闭：", flush=True)
                print(json.dumps(remaining, ensure_ascii=False), flush=True)
        super().server_close()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", required=True)
    parser.add_argument("--library", required=True)
    parser.add_argument("--agent-client-url", default="")
    parser.add_argument("--port", type=int, default=8770)
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    try:
        library = GodotLibrary(args.engine, args.library)
        with CreatorServer(args.port, library, client_url=args.agent_client_url) as server:
            print("游戏创作：" + server.origin + "/", flush=True)
            print("项目库：" + str(library.root), flush=True)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass
    except (OSError, ValueError) as error:
        print("无法启动创作服务：" + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
