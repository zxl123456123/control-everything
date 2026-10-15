# Gateway 最小接口原文

source_type: delegate_action
created_at: 2026-10-13
created_from: root read-only exec, exit 0
related_stage: LWPlan
supersedes: none
status: active

以下为实际源码片段原样输出。按顺序来自 gateway.py reply/reject/allowed、garden_body、make_server；progress.py 常量/board/load_todos；codex_index.py items/分页返回。

```python
class PanelHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        # Request paths may identify a private conversation. Do not log them.
        pass

    def reply(self, status, payload, content_type="application/json; charset=utf-8"):
        body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(body)

    def reject(self, status, reason):
        self._discard_rejected_post_body()
        self.reply(status, {"status": "unknown", "reason": reason, "source": SOURCE,
                            "observed_at": datetime.now(timezone.utc).isoformat()})

    def _discard_rejected_post_body(self):
        if not getattr(self, "_post_body_pending", False):
            return
        self._post_body_pending = False
        lengths = self.headers.get_all("Content-Length", [])
        if self.headers.get_all("Transfer-Encoding", []) or len(lengths) != 1 or not re.fullmatch(r"[0-9]{1,10}", lengths[0]):
            return
        remaining = int(lengths[0])
        if not 1 <= remaining <= 4096:
            return
        previous_timeout = self.connection.gettimeout()
        deadline = time.monotonic() + 0.25
        try:
            while remaining:
                budget = deadline - time.monotonic()
                if budget <= 0:
                    break
                self.connection.settimeout(budget)
                chunk = self.rfile.read1(remaining)
                if not chunk:
                    break
                remaining -= len(chunk)
        except OSError:
            pass
        finally:
            self.connection.settimeout(previous_timeout)

    def allowed(self, *, api=False, focus=False):
        if self.headers.get_all("Host", []) != [self.server.expected_host]:
            self.reject(403, "host_rejected")
            return False
        origins = self.headers.get_all("Origin", [])
        if origins and origins != [self.server.origin]:
            self.reject(403, "origin_rejected")
            return False
        if api and self.headers.get_all("X-Session-Client", []) not in (["panel"], ["stdio"]):
            self.reject(403, "client_header_required")
            return False
        if focus and (origins != [self.server.origin] or self.headers.get_all("X-Session-CSRF", []) != [self.server.csrf_token]):
            self.reject(403, "csrf_rejected")
            return False
        return True

    def garden_body(self):
        lengths = self.headers.get_all("Content-Length", [])
        if (self.headers.get_all("Transfer-Encoding", []) or len(lengths) != 1
                or not re.fullmatch(r"[0-9]{1,10}", lengths[0])
                or self.headers.get_all("Content-Type", []) != ["application/json"]):
            raise ValueError("invalid_body")
        length = int(lengths[0])
        if not 1 <= length <= 4096:
            raise ValueError("invalid_body")
        self._post_body_pending = False
        previous_timeout = self.connection.gettimeout()
        deadline, data = time.monotonic() + 0.25, bytearray()
        try:
            while len(data) < length:
                budget = deadline - time.monotonic()
                if budget <= 0:
                    raise ValueError("body_timeout")
                self.connection.settimeout(budget)
                chunk = self.rfile.read1(length - len(data))
                if not chunk:
                    raise ValueError("invalid_body")
                data.extend(chunk)
        finally:
            self.connection.settimeout(previous_timeout)
        value = json.loads(data, parse_constant=invalid_json_constant)
        if not isinstance(value, dict):
            raise ValueError("invalid_body")
        return value

    def garden_reply(self, operation=None, body=None):
    # The address injection exists for temporary fixture tests. Production is fixed.
    if address[0] != HOST:
        raise ValueError("loopback_only")
    server = PanelServer(address, PanelHandler)
    server.daemon_threads = True
    server.service = service
    server.garden = garden
    server.expected_host = f"{HOST}:{server.server_address[1]}"
    server.origin = f"http://{server.expected_host}"
    server.csrf_token = secrets.token_urlsafe(32)
    return server


def serve():

REGISTRY = Path(__file__).resolve().parent.parent / "progress-registry.json"
MANUAL = REGISTRY.with_name("progress-manual.json")
STATES = ("未开始", "在做", "等我", "完成")
ID_TEXT = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")
STAGE = re.compile(r"当前阶段(?:\*\*)?\s*[:：]\s*([^\n]+)")
HEADING = re.compile(r"(?m)^#{1,6}\s+当前阶段\s*$")
DATED = re.compile(r"(?m)^(.*20\d{2}-\d{2}-\d{2}.*)$")
CLOSE_MARKERS = ("完成", "PASS", "Archive", "已收口")
OPEN_MARKERS = ("其余", "保持", "未完成", "BLOCKED", "待确认", "USER_CONFIRMATION")
NOTE_LIMIT = 24
TODOS = REGISTRY.with_name("progress-todos.json")
TEXT_LIMIT = 72
    saved = load_manual(manual_path)
    codex, grok = codex_cwds(), grok_cwds()
    projects = []
    for project in load_registry(registry_path):
        item = saved.get(project["id"], {})
        if not isinstance(item, dict):
            item = {}
        state = item.get("state")
        note = item.get("note")
        percent = item.get("percent")
        if isinstance(percent, bool) or not isinstance(percent, (int, float)) or not 0 <= percent <= 100:
            percent = 0
        projects.append({
            "id": project["id"],
            "name": project["name"],
            "state": state if state in STATES else "未开始",
            "note": note.strip() if isinstance(note, str) else "",
            "percent": int(percent),
            "records": latest_focus(project["root"]),
            "sessions": session_hits(project["root"], codex, grok),
        })
    return projects


def load_todos(path=TODOS):
    file = Path(path)
    if not file.exists():
        return []
    data = json.loads(file.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("invalid_todos")
    items = []
    for item in data:
        if not isinstance(item, dict):
            continue
        text, todo_id = item.get("text"), item.get("id")
        project_id = item.get("project_id") if isinstance(item.get("project_id"), str) else ""
        if isinstance(text, str) and isinstance(todo_id, str) and text.strip() and isinstance(item.get("done"), bool):
            items.append({"id": todo_id, "text": text.strip(), "project_id": project_id, "done": item["done"]})
    return items


                items.append({"thread_id": thread_id, "session_key": f"codex:{thread_id}", "cwd": cwd,
                              "created_at": utc_timestamp(created), "updated_at": utc_timestamp(updated),
                              "archived": False, "source_kind": kind, "activity_state": "unknown", "task_completion": "unknown"})
            return {"available": True, "reason": None, "source": "codex_local", "sampled_at": datetime.now(timezone.utc).isoformat(),
                    "items": items, "offset": offset, "limit": LIMIT, "total_visible": visible,
                    "next_offset": offset + len(items) if items and offset + len(items) < visible else None,
                    "coverage": dict(zip(COVERAGE_KEYS, (total, archived, subagents, others)))}
        finally:
            connection.close()
    except (sqlite3.Error, ValueError, TypeError, OverflowError, OSError):
        return unavailable(offset)

```

