"""Local-only connector controls; product gateway explicitly mounts these handlers."""

import secrets
import re
from urllib.parse import parse_qs, urlsplit

from control_everything.integrations.remote_access import PROXY_HEADER
from control_everything.integrations.remote_connector import ConnectorError

PATHS = {"/api/desktop/remote/status", "/api/desktop/remote/authorize",
         "/api/desktop/remote/confirm", "/api/desktop/remote/revoke"}
ACCOUNT_PATHS = {"/api/desktop/account/" + name for name in
                 ("status", "authorize", "logout", "members", "invitations", "activate", "configure")}


def handle_account(handler, path, *, write=False):
    if path not in ACCOUNT_PATHS:
        return False
    if (not local_control_allowed(handler, write=write)
            or handler.headers.get_all("X-Session-Client", []) != ["panel"]):
        handler.reject(403, "local_control_required")
        return True
    account = getattr(handler.server, "desktop_account", None)
    name, query = path.rsplit("/", 1)[-1], urlsplit(handler.path).query
    try:
        if query and (write or name != "members"):
            raise ValueError("invalid_request")
        body = handler.read_json_body(max_bytes=1024, strict=True) if write else {}
        expected = {"invite"} if name == "activate" else {"issuer", "hub_origin"} if name == "configure" else set()
        if not isinstance(body, dict) or set(body) != expected:
            raise ValueError("invalid_request")
        if name == "configure" and write:
            setup = getattr(getattr(handler.server, "desktop", None), "server_setup", None)
            if account is not None or setup is None:
                raise ConnectorError("remote_configuration_locked", 409)
            setup.configure(body['issuer'], body['hub_origin'])
            value = {"saved": True, "restart_required": True}
        elif account is None:
            if name != "status" or write:
                raise ConnectorError("remote_not_configured", 409)
            value = {"configured": False, "state": "signed_out", "account": None, "admin": False}
        elif not write and name == "status":
            value = account.status()
        elif not write and name == "members":
            values = parse_qs(query, keep_blank_values=True, strict_parsing=True, max_num_fields=2)
            if (set(values) - {"limit", "offset"} or any(len(parts) != 1 or
                    not re.fullmatch(r"[0-9]{1,10}", parts[0]) for parts in values.values())):
                raise ValueError("invalid_pagination")
            limit, offset = int(values.get("limit", ["25"])[0]), int(values.get("offset", ["0"])[0])
            if not 1 <= limit <= 100 or not 0 <= offset <= 2147483647:
                raise ValueError("invalid_pagination")
            value = account.members(limit, offset)
        elif write and name in ("authorize", "logout"):
            value = getattr(account, name)()
        elif write and name in ("invitations", "activate"):
            value = account.mutate(name, body)
        else:
            handler.reject(405, "method_not_allowed")
            return True
        handler.reply(200, value)
    except ConnectorError as error:
        handler.reject(error.status or 503, error.code)
    except (ValueError, TypeError, UnicodeError):
        handler.reject(400, "invalid_request")
    return True


def local_control_allowed(handler, *, write=False):
    origin = handler.server.local_origin
    authority = urlsplit(origin).netloc
    if (handler.client_address[0] != "127.0.0.1"
            or handler.headers.get_all("Host", []) != [authority]
            or handler.headers.get_all(PROXY_HEADER, [])
            or handler.headers.get_all("X-CE-Proxy-Token", [])):
        return False
    origins = handler.headers.get_all("Origin", [])
    if origins and origins != [origin]:
        return False
    if write:
        tokens = handler.headers.get_all("X-Session-CSRF", [])
        return (origins == [origin] and len(tokens) == 1
                and secrets.compare_digest(tokens[0], handler.server.csrf_token))
    return True


def handle_get(handler, path):
    if handle_account(handler, path):
        return True
    if path not in PATHS:
        return False
    if path != "/api/desktop/remote/status":
        handler.reject(405, "method_not_allowed")
    elif not local_control_allowed(handler):
        handler.reject(403, "local_control_required")
    else:
        connector = getattr(handler.server, "remote_connector", None)
        handler.reply(200, connector.status() if connector else {
            "state": "unbound", "code": "remote_not_configured", "configured": False})
    return True


def handle_post(handler, path):
    if handle_account(handler, path, write=True):
        return True
    if path not in PATHS:
        return False
    if not local_control_allowed(handler, write=True):
        handler.reject(403, "local_control_required")
        return True
    connector = getattr(handler.server, "remote_connector", None)
    if connector is None:
        handler.reject(409, "remote_not_configured")
        return True
    actions = {"/api/desktop/remote/authorize": connector.begin_authorization,
               "/api/desktop/remote/confirm": connector.confirm,
               "/api/desktop/remote/revoke": connector.revoke}
    if path not in actions:
        handler.reject(405, "method_not_allowed")
        return True
    try:
        actions[path]()
        handler.reply(200, connector.status())
    except ConnectorError as error:
        handler.reject(409, error.code)
    return True

def handle_health(handler, raw_path, method="GET"):
    """Integration mounts this before ordinary routing, never on the public edge."""
    if raw_path.split("?", 1)[0] != "/__ce_remote_health":
        return False
    connector = getattr(handler.server, "remote_connector", None)
    access = connector.remote_access if connector else None
    if method != "GET":
        handler.reject(405, "method_not_allowed")
    elif (not access or not access.accept_proxy_request(handler.headers)
            or handler.headers.get_all("Origin", []) != [access.public_origin]):
        handler.reject(403, "remote_probe_rejected")
    elif not (match := re.fullmatch(r"/__ce_remote_health\?nonce=([A-Za-z0-9_-]{32})", raw_path)):
        handler.reject(400, "remote_probe_invalid")
    else:
        identity = connector.health_identity
        runtime = getattr(handler.server, "workbench_runtime", None)
        if not identity or not runtime or not runtime.ready:
            handler.reject(503, "remote_runtime_unavailable")
        else:
            handler.reply(200, {"nonce": match[1], "device_id": identity["device_id"], "generation": identity["generation"],
                                "platform_installation_id": identity["platform_installation_id"], "channel": "http", "ready": True})
    return True
