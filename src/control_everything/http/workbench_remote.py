"""Local-only connector controls; product gateway explicitly mounts these handlers."""

import secrets
import re
from urllib.parse import urlsplit

from control_everything.integrations.remote_access import PROXY_HEADER
from control_everything.integrations.remote_connector import ConnectorError

PATHS = {"/api/desktop/remote/status", "/api/desktop/remote/authorize",
         "/api/desktop/remote/confirm", "/api/desktop/remote/revoke"}


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
