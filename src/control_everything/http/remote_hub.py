"""HTTP request validation and assembly for the dedicated remote admission service."""

from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import sys
from urllib.parse import parse_qs, urlsplit

from control_everything.integrations.remote_hub.identity import HubError
from control_everything.integrations.remote_hub.sessions import COOKIE_NAME


def _fields(body, names, optional=()):
    if not isinstance(body, dict) or not set(names) <= set(body) <= set(names) | set(optional):
        raise HubError("invalid_request_fields", 400)
    return body


def _bearer(headers):
    value = headers.get("Authorization", "")
    if not value.startswith("Bearer ") or len(value.split()) != 2:
        raise HubError("bearer_required", 401)
    return value[7:]


def _pagination(query):
    try:
        values = parse_qs(query, keep_blank_values=True, strict_parsing=True, max_num_fields=2)
    except ValueError:
        raise HubError("invalid_pagination", 400) from None
    if set(values) - {"limit", "offset"} or any(len(parts) != 1 or not re.fullmatch(r"[0-9]{1,10}", parts[0]) for parts in values.values()):
        raise HubError("invalid_pagination", 400)
    return {"limit": int(values.get("limit", ["25"])[0]), "offset": int(values.get("offset", ["0"])[0])}


def dispatch(service, method, uri, headers, body):
    """Return (status, JSON body, response headers); no business transitions live here."""
    parsed = urlsplit(uri)
    path = parsed.path
    if parsed.fragment or (parsed.query and path not in ("/remote/api/admin/members", "/remote/desktop/admin/members")):
        raise HubError("invalid_request_uri", 400)
    cookie = SimpleCookie()
    try:
        cookie.load(headers.get("Cookie", ""))
    except Exception:
        raise HubError("invalid_cookie", 400) from None
    session_cookie = cookie[COOKIE_NAME].value if COOKIE_NAME in cookie else ""
    if path.startswith("/remote/desktop/"):
        token = _bearer(headers)
        if path in ("/remote/desktop/config", "/remote/desktop/heartbeat", "/remote/desktop/revoke"):
            if path.endswith("/config") and method == "GET":
                return 200, service.config(token), {}
            if path.endswith("/heartbeat") and method == "POST":
                values = _fields(body, ("installation_id", "runtime_ready"), ("os_name", "os_version", "app_version"))
                return 200, service.heartbeat(token, **values), {}
            if path.endswith("/revoke") and method == "POST":
                _fields(body, ())
                return 200, service.revoke_control(token), {}
            raise HubError("method_not_allowed", 405)
        identity = service.identities.authenticate(token, "desktop")
        if path == "/remote/desktop/identity" and method == "GET":
            return 200, service.desktop_identity(identity), {}
        if path == "/remote/desktop/admin/members" and method == "GET":
            _fields(body, ())
            return 200, service.admin_members(identity, **_pagination(parsed.query)), {}
        if method != "POST":
            raise HubError("method_not_allowed", 405)
        if path == "/remote/desktop/invitations":
            _fields(body, ())
            return 200, service.create_invitation(identity), {}
        if path == "/remote/desktop/activate":
            return 200, service.activate(identity, **_fields(body, ("invite",))), {}
        if path == "/remote/desktop/enrollment":
            return 200, service.begin_enrollment(identity, **_fields(body, ("installation_id", "public_key", "name"))), {}
        if path == "/remote/desktop/enrollment/status":
            return 200, service.enrollment_status(identity, **_fields(body, ("installation_id", "public_key"))), {}
        if path == "/remote/desktop/enrollment/recover":
            return 200, service.begin_recovery(identity, **_fields(body, ("installation_id", "public_key", "device_id", "generation", "expected_credential_revision"))), {}
        match = re.fullmatch(r"/remote/desktop/enrollment/([A-Za-z0-9_-]{32})/complete", path)
        if match:
            return 200, service.complete_enrollment(identity, match[1], **_fields(body, ("signature",))), {}
        raise HubError("not_found", 404)
    if path.startswith("/remote/mobile/"):
        # Bearer only: cookies, proxy identity headers and Origin play no part, and no CORS headers
        # are ever emitted, so browsers cannot call this surface cross-origin.
        identity = service.identities.authenticate(_bearer(headers), "mobile")
        if path == "/remote/mobile/me":
            if method != "GET":
                raise HubError("method_not_allowed", 405)
            _fields(body, ())
            return 200, service.mobile_me(identity), {}
        if path == "/remote/mobile/devices":
            if method != "GET":
                raise HubError("method_not_allowed", 405)
            _fields(body, ())
            return 200, service.mobile_devices(identity), {}
        match = re.fullmatch(r"/remote/mobile/devices/([0-9a-f]{24})/revoke", path)
        if path in ("/remote/mobile/activate", "/remote/mobile/logout") or match:
            if method != "POST":
                raise HubError("method_not_allowed", 405)
            if match:
                _fields(body, ())
                return 200, service.mobile_revoke(identity, match[1]), {}
            if path.endswith("/activate"):
                return 200, service.mobile_activate(identity, **_fields(body, ("invite",))), {}
            _fields(body, ())
            return 200, service.mobile_logout(identity), {}
        raise HubError("not_found", 404)
    identity = service.browser_identity(headers.get("X-Auth-Request-Access-Token", ""),
                                        headers.get("X-Auth-Request-User", ""), headers.get("X-CE-Route-Proof", ""))
    if path == "/internal/authorize" and method == "GET":
        try:
            result = service.authorize(identity, session_cookie, method=headers.get("X-Forwarded-Method", ""),
                                       uri=headers.get("X-Forwarded-Uri", ""), context=headers.get("X-CE-Context"),
                                       origin=headers.get("Origin"))
        except HubError as error:
            if (error.code == "session_required" and headers.get("X-Forwarded-Method") in ("GET", "HEAD")
                    and headers.get("X-Forwarded-Uri") in service.document_paths
                    and headers.get("Upgrade") is None and headers.get("X-CE-Context") is None
                    and headers.get("Origin") in (None, service.public_origin)):
                return 303, {}, {"Location": "/remote"}
            raise
        return 200, {}, result
    if path == "/remote/api/session" and method == "GET":
        result, set_cookie = service.session(identity, session_cookie)
        return 200, result, {"Set-Cookie": set_cookie} if set_cookie else {}
    if path == "/remote/api/admin/members":
        if method != "GET":
            raise HubError("method_not_allowed", 405)
        _fields(body, ())
        service.sessions.validate_read(identity, session_cookie, csrf=headers.get("X-CE-CSRF", ""), origin=headers.get("Origin"))
        return 200, service.admin_members(identity, **_pagination(parsed.query)), {}
    if method != "POST":
        raise HubError("method_not_allowed", 405)
    service.sessions.validate(identity, session_cookie, csrf=headers.get("X-CE-CSRF", ""), origin=headers.get("Origin"))
    if path == "/remote/api/invitations":
        _fields(body, ())
        return 200, service.create_invitation(identity), {}
    if path == "/remote/api/activate":
        return 200, service.activate(identity, **_fields(body, ("invite",))), {}
    if path == "/remote/api/logout":
        _fields(body, ())
        service.sessions.logout(identity, session_cookie, headers.get("X-CE-CSRF", ""), headers.get("Origin"))
        return 200, {"logout_url": "/oauth2/sign_out"}, {"Set-Cookie": COOKIE_NAME + "=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0"}
    match = re.fullmatch(r"/remote/api/devices/([0-9a-f]{24})/revoke", path)
    if match:
        _fields(body, ())
        return 200, service.revoke(identity, match[1]), {}
    raise HubError("not_found", 404)


class HubHTTPServer(ThreadingHTTPServer):
    # Cold Web bundles can authorize many independent asset connections at once.
    request_queue_size = 128


def build_server(address, service):
    if address[0] not in ("127.0.0.1", "::1"):
        raise ValueError("hub_requires_loopback_listener")

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, format, *args):
            pass  # Do not log credentials, challenge IDs or request headers.

        def handle_request(self):
            try:
                for name in ("Authorization", "Cookie", "Origin", "X-Auth-Request-Access-Token",
                             "X-Auth-Request-User", "X-CE-Route-Proof", "X-CE-Context", "X-CE-CSRF"):
                    if len(self.headers.get_all(name, [])) > 1:
                        raise HubError("ambiguous_security_header", 400)
                if self.headers.get("Transfer-Encoding") or len(self.headers.get_all("Content-Length", [])) > 1:
                    raise HubError("invalid_body_length", 400)
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 <= length <= 16384:
                    raise HubError("request_too_large", 413)
                if self.command == "POST" and self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                    raise HubError("json_required", 415)
                body = json.loads(self.rfile.read(length)) if length else {}
                status, result, extra = dispatch(service, self.command, self.path, self.headers, body)
            except HubError as error:
                status, result, extra = error.status, {"error": error.code, **error.details}, {}
            except (ValueError, UnicodeError):
                status, result, extra = 400, {"error": "invalid_json"}, {}
            except Exception:
                status, result, extra = 503, {"error": "hub_unavailable"}, {}
            data = json.dumps(result, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            for key, value in extra.items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(data)

        do_GET = do_POST = handle_request

    server = HubHTTPServer(address, Handler)
    server.daemon_threads = True
    return server


def identity_admin(service, args, out=None):
    """Local administrator actions on the identities table; prints one JSON document."""
    out = out or sys.stdout
    store = service.store
    if args.action == "list-identities":
        with store.transaction() as db:
            rows = [dict(row) for row in db.execute(
                "SELECT i.account_id,i.issuer,i.sub,COALESCE(m.status,'inactive') AS membership "
                "FROM identities i LEFT JOIN members m ON m.account_id=i.account_id ORDER BY i.created_at,i.issuer,i.sub")]
        print(json.dumps({"identities": rows}, ensure_ascii=False, indent=2), file=out)
        return 0
    account = args.account_id
    if bool(account) == bool(args.from_sub):
        raise SystemExit("link-identity needs exactly one of --account-id or --from-sub (with --from-issuer)")
    if args.from_sub:
        from control_everything.integrations.remote_hub.identity import Identity
        account = store.account_id(Identity(args.from_issuer or service.identities.issuer, args.from_sub, "", 0))
        if account is None:
            raise SystemExit("no account is linked to the --from identity")
    if not args.sub:
        raise SystemExit("link-identity needs --sub")
    try:
        result = store.link_identity(account, args.issuer or service.identities.issuer, args.sub)
    except HubError as error:
        raise SystemExit("link-identity refused: " + error.code) from None
    print(json.dumps(result, ensure_ascii=False, indent=2), file=out)
    return 0


def main(argv=None):
    import argparse
    from control_everything.integrations.remote_hub.admin import build_service
    from control_everything.integrations.remote_hub.identity import Identity
    parser = argparse.ArgumentParser(description="Dedicated account-owned remote admission hub")
    parser.add_argument("--config", required=True)
    parser.add_argument("action", choices=("serve", "bootstrap-admin", "reconcile", "link-identity", "list-identities"))
    # link-identity: attach an identity of a new/replacement identity provider to an existing account.
    parser.add_argument("--account-id", help="32-hex internal account id (see list-identities)")
    parser.add_argument("--from-issuer", help="alternative to --account-id: issuer of an already linked identity")
    parser.add_argument("--from-sub", help="alternative to --account-id: subject of an already linked identity")
    parser.add_argument("--issuer", help="issuer of the identity to link (defaults to the configured issuer)")
    parser.add_argument("--sub", help="subject of the identity to link")
    args = parser.parse_args(argv)
    service = build_service(args.config)
    if args.action in ("link-identity", "list-identities"):
        return identity_admin(service, args)
    if args.action == "bootstrap-admin":
        for issuer, sub in service.admin_subjects:
            service.store.set_member(Identity(issuer, sub, "", 0))
    elif args.action == "reconcile":
        service.reconcile()
    else:
        service.reconcile()
        server = build_server(("127.0.0.1", 18869), service)
        try:
            server.serve_forever(poll_interval=0.25)
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
