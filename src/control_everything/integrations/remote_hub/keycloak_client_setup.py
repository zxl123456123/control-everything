"""Idempotently add the native `workbench-mobile` public PKCE client to an EXISTING realm.

The Keycloak Admin REST API is used so a realm that already holds real users is never imported
over. Only the one client, its audience mapper and that client's default `email` scope assignment
are written. Realm settings are read, never changed.
"""

import argparse
from copy import deepcopy
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_CLIENT_ID = "workbench-mobile"
DEFAULT_AUDIENCE = "workbench-hub"
ADMIN_CLIENT_ID = "admin-cli"
MAPPER_NAME = "hub-audience"
CALLBACK_PATH = "/oauth/callback"
EMAIL_SCOPE = "email"
REQUEST_TIMEOUT = 15
MAX_RESPONSE = 4 * 1024 * 1024
_NAME = re.compile(r"^[A-Za-z0-9._-]{1,255}$")
_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]{0,63}$")
# Schemes a native app must never register: they are web, script or local-file origins.
_FORBIDDEN_SCHEMES = {"http", "https", "javascript", "data", "file", "blob", "about", "ftp", "ws", "wss"}
_LOOPBACK = {"localhost", "127.0.0.1", "::1"}


class SetupError(Exception):
    """A configuration or server problem; the message never contains a credential."""


def validate_scheme(scheme):
    if not isinstance(scheme, str) or not _SCHEME.match(scheme) or scheme in _FORBIDDEN_SCHEMES:
        raise SetupError("invalid_mobile_scheme")
    return scheme


def validate_name(value, code):
    if not isinstance(value, str) or not _NAME.match(value):
        raise SetupError(code)
    return value


def validate_base_url(value):
    parsed = urllib.parse.urlsplit(value or "")
    loopback = (parsed.hostname or "") in _LOOPBACK
    if (not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.scheme not in ("https", "http") or (parsed.scheme == "http" and not loopback)):
        # Admin credentials travel in the token request, so plain http is loopback-only.
        raise SetupError("invalid_keycloak_url")
    return value.rstrip("/")


def redirect_uri(scheme):
    return f"{validate_scheme(scheme)}:{CALLBACK_PATH}"


def build_client(client_id, scheme):
    """Desired client representation: public, code + S256, no direct grants, no service account."""
    uri = redirect_uri(scheme)
    return {
        "clientId": validate_name(client_id, "invalid_client_id"),
        "name": "Workbench mobile (native, PKCE)",
        "enabled": True,
        "protocol": "openid-connect",
        "publicClient": True,
        "bearerOnly": False,
        "standardFlowEnabled": True,
        "implicitFlowEnabled": False,
        "directAccessGrantsEnabled": False,
        "serviceAccountsEnabled": False,
        "authorizationServicesEnabled": False,
        "redirectUris": [uri],
        "webOrigins": [],
        "attributes": {
            "pkce.code.challenge.method": "S256",
            "post.logout.redirect.uris": uri,
            "use.refresh.tokens": "true",
        },
    }


def build_audience_mapper(audience):
    return {
        "name": MAPPER_NAME,
        "protocol": "openid-connect",
        "protocolMapper": "oidc-audience-mapper",
        "config": {
            "included.client.audience": validate_name(audience, "invalid_audience"),
            "access.token.claim": "true",
            "id.token.claim": "false",
        },
    }


def merge_client(existing, desired):
    """Apply the managed fields to an existing client and keep every other field as it is."""
    merged = deepcopy(existing)
    for key, value in desired.items():
        if key == "attributes":
            merged.setdefault("attributes", {}).update(value)
        elif key == "name":
            merged.setdefault("name", value)
        else:
            merged[key] = deepcopy(value)
    return merged


def changed_fields(existing, merged):
    """Names of the changed fields only; values (redirect URIs, secrets) are not reported."""
    names = [key for key in merged if key != "attributes" and merged[key] != existing.get(key)]
    before = existing.get("attributes") or {}
    names += ["attributes." + key for key, value in (merged.get("attributes") or {}).items()
              if before.get(key) != value]
    return sorted(names)


def merge_mapper(existing, desired):
    merged = deepcopy(existing)
    merged.update({key: deepcopy(desired[key]) for key in ("name", "protocol", "protocolMapper")})
    merged["config"] = {**(existing.get("config") or {}), **desired["config"]}
    return merged


def default_send(method, url, headers, body):
    """HTTP transport that never follows redirects and bounds the response size."""
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(request, timeout=REQUEST_TIMEOUT) as response:
            return response.status, dict(response.headers), response.read(MAX_RESPONSE + 1)[:MAX_RESPONSE]
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read(MAX_RESPONSE + 1)[:MAX_RESPONSE]
    except (urllib.error.URLError, OSError, TimeoutError):
        raise SetupError("keycloak_unreachable") from None


class KeycloakAdmin:
    def __init__(self, base_url, realm, send=default_send):
        self.base = validate_base_url(base_url)
        self.realm = validate_name(realm, "invalid_realm")
        self.send = send
        self.token = None

    def authenticate(self, admin_realm, username=None, password=None, *, client_id=None, client_secret=None):
        url = f"{self.base}/realms/{urllib.parse.quote(validate_name(admin_realm, 'invalid_admin_realm'), safe='')}/protocol/openid-connect/token"
        credentials = ({"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret}
                       if client_id else {"grant_type": "password", "client_id": ADMIN_CLIENT_ID,
                                          "username": username, "password": password})
        form = urllib.parse.urlencode(credentials).encode()
        status, _, body = self.send("POST", url, {"Content-Type": "application/x-www-form-urlencoded",
                                                  "Accept": "application/json"}, form)
        try:
            token = json.loads(body).get("access_token") if status == 200 else None
        except (ValueError, AttributeError):
            token = None
        if not isinstance(token, str) or not token:
            # The token endpoint's body is never echoed.
            raise SetupError(f"admin_authentication_failed_http_{status}")
        self.token = token

    def call(self, method, path, payload=None, expected=(200,)):
        url = f"{self.base}/admin/realms/{urllib.parse.quote(self.realm, safe='')}{path}"
        headers = {"Authorization": f"Bearer {self.token}", "Accept": "application/json"}
        body = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(payload).encode()
        status, response_headers, raw = self.send(method, url, headers, body)
        if status not in expected:
            # Server error bodies may echo credentials or tokens; report only request metadata.
            raise SetupError(f"{method} {path.split('?')[0]} -> HTTP {status}")
        parsed = None
        if raw:
            try:
                parsed = json.loads(raw)
            except ValueError:
                parsed = None
        return parsed, response_headers


def _find_by_name(items, name):
    return next((item for item in items or [] if isinstance(item, dict) and item.get("name") == name), None)


def collect_state(admin, client_id, hub_audience):
    """Read-only pass: everything the plan needs, gathered before any write."""
    realm, _ = admin.call("GET", "")
    if not isinstance(realm, dict):
        raise SetupError("realm_unreadable")
    query = "?clientId=" + urllib.parse.quote(client_id, safe="")
    clients, _ = admin.call("GET", "/clients" + query)
    existing = next((c for c in clients or [] if isinstance(c, dict) and c.get("clientId") == client_id), None)
    hub, _ = admin.call("GET", "/clients?clientId=" + urllib.parse.quote(hub_audience, safe=""))
    scopes, _ = admin.call("GET", "/client-scopes")
    email = next((s for s in scopes or [] if isinstance(s, dict) and s.get("name") == EMAIL_SCOPE
                  and s.get("protocol", "openid-connect") == "openid-connect"), None)
    if not email or not email.get("id"):
        raise SetupError("realm_has_no_email_client_scope")
    state = {"realm": realm, "client": existing, "email_scope_id": email["id"],
             "hub_exists": any(isinstance(c, dict) and c.get("clientId") == hub_audience for c in hub or []),
             "mapper": None, "scope_state": "pending_creation"}
    if existing:
        base = "/clients/" + urllib.parse.quote(existing["id"], safe="")
        mappers, _ = admin.call("GET", base + "/protocol-mappers/models")
        state["mapper"] = _find_by_name(mappers, MAPPER_NAME)
        default, _ = admin.call("GET", base + "/default-client-scopes")
        optional, _ = admin.call("GET", base + "/optional-client-scopes")
        if _find_by_name(default, EMAIL_SCOPE):
            state["scope_state"] = "default"
        elif _find_by_name(optional, EMAIL_SCOPE):
            state["scope_state"] = "optional"
        else:
            state["scope_state"] = "missing"
    return state


def warnings_for(state, allow_convert):
    found = []
    realm = state["realm"]
    if not realm.get("revokeRefreshToken"):
        found.append("realm_refresh_token_rotation_off: enable 'Revoke Refresh Token' in the realm "
                     "settings; this script does not change realm settings")
    elif realm.get("refreshTokenMaxReuse", 0) != 0:
        found.append("realm_refresh_token_reuse_allowed: set 'Refresh Token Max Reuse' to 0")
    if not state["hub_exists"]:
        found.append("audience_client_missing: no client with the audience id exists in this realm")
    existing = state["client"]
    if existing and not existing.get("publicClient") and not allow_convert:
        raise SetupError("existing_client_is_confidential: pass --allow-convert-confidential to make it public")
    return found


def plan(state, desired_client, desired_mapper):
    existing = state["client"]
    steps = []
    if not existing:
        steps.append({"action": "create_client"})
    else:
        merged = merge_client(existing, desired_client)
        fields = changed_fields(existing, merged)
        if fields:
            steps.append({"action": "update_client", "fields": fields, "body": merged})
        if state["mapper"] is None:
            steps.append({"action": "create_mapper"})
        else:
            merged_mapper = merge_mapper(state["mapper"], desired_mapper)
            if merged_mapper != state["mapper"]:
                steps.append({"action": "update_mapper", "body": merged_mapper})
        if state["scope_state"] == "optional":
            steps.append({"action": "remove_optional_email_scope"})
        if state["scope_state"] in ("optional", "missing"):
            steps.append({"action": "add_default_email_scope"})
        return steps
    steps.append({"action": "create_mapper"})
    steps.append({"action": "ensure_default_email_scope_after_creation"})
    return steps


def apply(admin, client_id, steps, desired_client, desired_mapper, state):
    client_uuid = state["client"]["id"] if state["client"] else None
    scope = urllib.parse.quote(state["email_scope_id"], safe="")
    for step in steps:
        action = step["action"]
        if action == "create_client":
            _, headers = admin.call("POST", "/clients", desired_client, (201,))
            location = next((v for k, v in headers.items() if k.lower() == "location"), "")
            client_uuid = location.rstrip("/").rsplit("/", 1)[-1]
            if not client_uuid:
                found, _ = admin.call("GET", "/clients?clientId=" + urllib.parse.quote(client_id, safe=""))
                client_uuid = next(c["id"] for c in found if c.get("clientId") == client_id)
        base = "/clients/" + urllib.parse.quote(client_uuid or "", safe="")
        if action == "update_client":
            admin.call("PUT", base, step["body"], (204,))
        elif action == "create_mapper":
            admin.call("POST", base + "/protocol-mappers/models", desired_mapper, (201,))
        elif action == "update_mapper":
            admin.call("PUT", base + "/protocol-mappers/models/" + urllib.parse.quote(step["body"]["id"], safe=""),
                       step["body"], (204,))
        elif action == "remove_optional_email_scope":
            admin.call("DELETE", base + "/optional-client-scopes/" + scope, None, (204,))
        elif action == "add_default_email_scope":
            admin.call("PUT", base + "/default-client-scopes/" + scope, None, (204,))
        elif action == "ensure_default_email_scope_after_creation":
            # A new client normally inherits the realm's default scopes; only add what is missing.
            default, _ = admin.call("GET", base + "/default-client-scopes")
            if not _find_by_name(default, EMAIL_SCOPE):
                optional, _ = admin.call("GET", base + "/optional-client-scopes")
                if _find_by_name(optional, EMAIL_SCOPE):
                    admin.call("DELETE", base + "/optional-client-scopes/" + scope, None, (204,))
                admin.call("PUT", base + "/default-client-scopes/" + scope, None, (204,))


def parse_args(argv, environ):
    parser = argparse.ArgumentParser(
        description="Add or update the workbench-mobile public PKCE client in an existing Keycloak realm. "
                    "Admin credentials are read only from KEYCLOAK_ADMIN_USER/PASSWORD or "
                    "KEYCLOAK_ADMIN_CLIENT_ID/SECRET environment variables.")
    parser.add_argument("--url", default=environ.get("KEYCLOAK_URL"), help="Keycloak base URL (env KEYCLOAK_URL)")
    parser.add_argument("--realm", default=environ.get("KEYCLOAK_REALM"), help="target realm (env KEYCLOAK_REALM)")
    parser.add_argument("--admin-realm", default=environ.get("KEYCLOAK_ADMIN_REALM", "master"))
    parser.add_argument("--scheme", default=environ.get("CE_MOBILE_SCHEME"),
                        help="app custom URL scheme (env CE_MOBILE_SCHEME)")
    parser.add_argument("--client-id", default=environ.get("CE_MOBILE_CLIENT_ID", DEFAULT_CLIENT_ID))
    parser.add_argument("--audience", default=environ.get("CE_HUB_AUDIENCE", DEFAULT_AUDIENCE))
    parser.add_argument("--dry-run", action="store_true",
                        help="read-only: show the plan without writing anything")
    parser.add_argument("--allow-convert-confidential", action="store_true",
                        help="allow turning an existing confidential client of that id into a public one")
    return parser.parse_args(argv)


def run(argv, environ=None, send=default_send, out=None):
    environ = os.environ if environ is None else environ
    out = out or sys.stdout
    options = parse_args(argv, environ)
    desired_client = build_client(options.client_id, options.scheme)
    desired_mapper = build_audience_mapper(options.audience)
    username = environ.get("KEYCLOAK_ADMIN_USER")
    password = environ.get("KEYCLOAK_ADMIN_PASSWORD")
    admin_client_id = environ.get("KEYCLOAK_ADMIN_CLIENT_ID")
    admin_client_secret = environ.get("KEYCLOAK_ADMIN_CLIENT_SECRET")
    if (username or password) and (admin_client_id or admin_client_secret):
        raise SetupError("mixed_admin_credentials")
    if bool(username) != bool(password) or bool(admin_client_id) != bool(admin_client_secret):
        raise SetupError("incomplete_admin_credentials")
    has_credentials = bool(username or admin_client_id)
    result = {"dry_run": options.dry_run, "client_id": options.client_id, "realm": options.realm}
    if options.dry_run and not has_credentials:
        # No credentials: show the desired objects only; the server state was not compared.
        result.update({"compared_with_server": False, "client": desired_client, "mapper": desired_mapper})
        out.write(json.dumps(result, indent=2) + "\n")
        return 0
    if not options.url or not options.realm or not has_credentials:
        raise SetupError("missing_url_realm_or_admin_credentials")
    admin = KeycloakAdmin(options.url, options.realm, send)
    admin.authenticate(options.admin_realm, username, password,
                       client_id=admin_client_id, client_secret=admin_client_secret)
    state = collect_state(admin, options.client_id, options.audience)
    result["warnings"] = warnings_for(state, options.allow_convert_confidential)
    steps = plan(state, desired_client, desired_mapper)
    result["compared_with_server"] = True
    result["steps"] = [{key: value for key, value in step.items() if key != "body"} for step in steps]
    if not options.dry_run:
        apply(admin, options.client_id, steps, desired_client, desired_mapper, state)
    out.write(json.dumps(result, indent=2) + "\n")
    return 0


def main(argv=None):
    try:
        raise SystemExit(run(sys.argv[1:] if argv is None else argv))
    except SetupError as error:
        sys.stderr.write(f"error: {error}\n")
        raise SystemExit(1) from None
