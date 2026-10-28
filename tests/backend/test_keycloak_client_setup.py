"""Synthetic Keycloak admin API for the existing-realm mobile client script; nothing touches a network."""

from copy import deepcopy
import io
import json
import unittest
import urllib.parse

from control_everything.integrations.remote_hub import keycloak_client_setup as setup

REALM = "team"
SCHEME = "com.example.workbench"
PASSWORD = "synthetic-admin-password"
CLIENT_SECRET = "synthetic-service-secret+with&encoding"
ENV = {"KEYCLOAK_URL": "https://identity.example.test", "KEYCLOAK_REALM": REALM,
       "KEYCLOAK_ADMIN_USER": "synthetic-admin", "KEYCLOAK_ADMIN_PASSWORD": PASSWORD,
       "CE_MOBILE_SCHEME": SCHEME}
SERVICE_ENV = {**{key: value for key, value in ENV.items() if "ADMIN" not in key},
               "KEYCLOAK_ADMIN_CLIENT_ID": "synthetic-service-admin", "KEYCLOAK_ADMIN_CLIENT_SECRET": CLIENT_SECRET}


class FakeKeycloak:
    """Just enough of the admin API; `calls` records every request for write-scope assertions."""

    def __init__(self, realm=None, clients=None, scopes=("profile", "email"), password=PASSWORD,
                 omit_disabled_authorization=False):
        self.realm = {"realm": REALM, "revokeRefreshToken": True, "refreshTokenMaxReuse": 0,
                      "registrationAllowed": True, **(realm or {})}
        self.clients = {c["id"]: deepcopy(c) for c in (clients or [])}
        self.mappers = {}
        self.default = {}
        self.optional = {}
        self.scopes = [{"id": f"scope-{name}", "name": name, "protocol": "openid-connect"} for name in scopes]
        self.password = password
        self.calls = []
        self.token_requests = []
        self.omit_disabled_authorization = omit_disabled_authorization

    def writes(self):
        return [(m, p) for m, p, _ in self.calls if m != "GET" and "/protocol/openid-connect/token" not in p]

    def send(self, method, url, headers, body):
        path = urllib.parse.urlsplit(url).path
        payload = json.loads(body) if body and headers.get("Content-Type") == "application/json" else None
        self.calls.append((method, path, payload))
        if path.endswith("/protocol/openid-connect/token"):
            form = urllib.parse.parse_qs(body.decode())
            self.token_requests.append((method, path, headers, form))
            if form.get("grant_type") == ["client_credentials"]:
                ok = form == {"grant_type": ["client_credentials"], "client_id": [SERVICE_ENV["KEYCLOAK_ADMIN_CLIENT_ID"]],
                              "client_secret": [CLIENT_SECRET]}
            else:
                ok = form == {"grant_type": ["password"], "client_id": ["admin-cli"],
                              "username": [ENV["KEYCLOAK_ADMIN_USER"]], "password": [self.password]}
            return (200, {}, b'{"access_token":"synthetic-token"}') if ok else (401, {}, b'{"error":"echo-secret"}')
        assert headers["Authorization"] == "Bearer synthetic-token"
        prefix = f"/admin/realms/{REALM}"
        assert path.startswith(prefix)
        rest = path[len(prefix):]
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        parts = [p for p in rest.split("/") if p]
        if rest == "" and method == "GET":
            return self.ok(self.realm)
        if rest == "/client-scopes" and method == "GET":
            return self.ok(self.scopes)
        if rest == "/clients" and method == "GET":
            wanted = query.get("clientId", [None])[0]
            clients = [deepcopy(c) for c in self.clients.values() if wanted in (None, c["clientId"])]
            if self.omit_disabled_authorization:
                for client in clients:
                    if client.get("authorizationServicesEnabled") is False:
                        client.pop("authorizationServicesEnabled")
            return self.ok(clients)
        if rest == "/clients" and method == "POST":
            identifier = f"uuid-{len(self.clients) + 1}"
            self.clients[identifier] = {**deepcopy(payload), "id": identifier, "secret": None}
            self.mappers[identifier] = []
            # A freshly created client inherits the realm's default scopes.
            self.default[identifier] = [{"id": "scope-profile", "name": "profile"}, {"id": "scope-email", "name": "email"}]
            self.optional[identifier] = []
            return 201, {"Location": f"https://identity.example.test{prefix}/clients/{identifier}"}, b""
        identifier = parts[1]
        sub = "/".join(parts[2:])
        if sub == "" and method == "PUT":
            self.clients[identifier] = {**payload, "id": identifier}
            return 204, {}, b""
        if sub == "protocol-mappers/models" and method == "GET":
            return self.ok(self.mappers.get(identifier, []))
        if sub == "protocol-mappers/models" and method == "POST":
            self.mappers.setdefault(identifier, []).append({**deepcopy(payload), "id": f"mapper-{len(self.mappers[identifier])}"})
            return 201, {}, b""
        if sub.startswith("protocol-mappers/models/") and method == "PUT":
            self.mappers[identifier] = [payload if m["id"] == payload["id"] else m for m in self.mappers[identifier]]
            return 204, {}, b""
        if sub == "default-client-scopes" and method == "GET":
            return self.ok(self.default.get(identifier, []))
        if sub == "optional-client-scopes" and method == "GET":
            return self.ok(self.optional.get(identifier, []))
        scope_id = parts[-1]
        name = scope_id.removeprefix("scope-")
        if sub.startswith("optional-client-scopes/") and method == "DELETE":
            self.optional[identifier] = [s for s in self.optional.get(identifier, []) if s["id"] != scope_id]
            return 204, {}, b""
        if sub.startswith("default-client-scopes/") and method == "PUT":
            self.default.setdefault(identifier, []).append({"id": scope_id, "name": name})
            return 204, {}, b""
        return 404, {}, b'{"errorMessage":"not found"}'

    @staticmethod
    def ok(value):
        return 200, {}, json.dumps(value).encode()


def run(fake, *extra, env=None):
    out = io.StringIO()
    code = setup.run(list(extra), {**ENV, **(env or {})}, fake.send, out)
    return code, json.loads(out.getvalue())


class PayloadTests(unittest.TestCase):
    def test_only_omitted_disabled_authorization_is_equivalent_to_false(self):
        desired = {"authorizationServicesEnabled": False, "implicitFlowEnabled": False}
        self.assertEqual(setup.changed_fields({}, desired), ["implicitFlowEnabled"])
        for value in (True, None):
            with self.subTest(value=value):
                existing = {**desired, "authorizationServicesEnabled": value}
                self.assertEqual(setup.changed_fields(existing, desired), ["authorizationServicesEnabled"])
        self.assertEqual(setup.changed_fields({}, {"authorizationServicesEnabled": True}),
                         ["authorizationServicesEnabled"])

    def test_client_is_public_pkce_without_direct_grants_or_service_account(self):
        client = setup.build_client("workbench-mobile", SCHEME)
        self.assertTrue(client["publicClient"])
        self.assertTrue(client["standardFlowEnabled"])
        for key in ("directAccessGrantsEnabled", "implicitFlowEnabled", "serviceAccountsEnabled", "bearerOnly"):
            self.assertIs(client[key], False)
        self.assertEqual(client["redirectUris"], [f"{SCHEME}:/oauth/callback"])
        self.assertEqual(client["webOrigins"], [])
        self.assertEqual(client["attributes"]["pkce.code.challenge.method"], "S256")
        self.assertEqual(client["attributes"]["post.logout.redirect.uris"], f"{SCHEME}:/oauth/callback")
        self.assertNotIn("secret", client)

    def test_audience_mapper_targets_the_hub_in_the_access_token_only(self):
        mapper = setup.build_audience_mapper("workbench-hub")
        self.assertEqual(mapper["protocolMapper"], "oidc-audience-mapper")
        self.assertEqual(mapper["config"], {"included.client.audience": "workbench-hub",
                                            "access.token.claim": "true", "id.token.claim": "false"})

    def test_unsafe_scheme_names_and_urls_are_rejected(self):
        for scheme in ("http", "https", "javascript", "Com.Example", "", None, "1abc", "a b", "x" * 80):
            with self.assertRaises(setup.SetupError, msg=scheme):
                setup.build_client("workbench-mobile", scheme)
        for name in ("", "a/b", "a b", "x" * 300, None):
            with self.assertRaises(setup.SetupError):
                setup.build_client(name, SCHEME)
            with self.assertRaises(setup.SetupError):
                setup.build_audience_mapper(name)
        for url in ("http://identity.example.test", "ftp://x", "https://u:p@x.test", "https://x.test?a=1", "", "x.test"):
            with self.assertRaises(setup.SetupError, msg=url):
                setup.validate_base_url(url)
        self.assertEqual(setup.validate_base_url("http://127.0.0.1:8080/"), "http://127.0.0.1:8080")

    def test_merge_keeps_unmanaged_fields_and_reports_only_names(self):
        existing = {"id": "u", "clientId": "workbench-mobile", "name": "Custom name", "description": "kept",
                    "directAccessGrantsEnabled": True, "redirectUris": ["old:/x"],
                    "attributes": {"custom": "kept", "pkce.code.challenge.method": "plain"}}
        merged = setup.merge_client(existing, setup.build_client("workbench-mobile", SCHEME))
        self.assertEqual(merged["name"], "Custom name")
        self.assertEqual(merged["description"], "kept")
        self.assertEqual(merged["attributes"]["custom"], "kept")
        self.assertEqual(merged["attributes"]["pkce.code.challenge.method"], "S256")
        self.assertFalse(merged["directAccessGrantsEnabled"])
        names = setup.changed_fields(existing, merged)
        self.assertIn("directAccessGrantsEnabled", names)
        self.assertIn("attributes.pkce.code.challenge.method", names)
        self.assertNotIn("description", names)
        self.assertTrue(all(":" not in name for name in names))
        self.assertEqual(setup.changed_fields(merged, setup.merge_client(merged, setup.build_client("workbench-mobile", SCHEME))), [])


class ScriptTests(unittest.TestCase):
    def test_server_omitting_disabled_authorization_keeps_second_run_a_noop(self):
        fake = FakeKeycloak(omit_disabled_authorization=True)
        self.assertEqual(run(fake)[0], 0)
        first_writes = len(fake.writes())
        code, result = run(fake, "--dry-run")
        self.assertEqual((code, result["steps"]), (0, []))
        self.assertEqual(run(fake)[1]["steps"], [])
        self.assertEqual(len(fake.writes()), first_writes)

    def test_fresh_realm_gets_only_the_client_mapper_and_email_scope_then_second_run_is_a_noop(self):
        fake = FakeKeycloak()
        realm_before = deepcopy(fake.realm)
        code, result = run(fake)
        self.assertEqual(code, 0)
        self.assertEqual([s["action"] for s in result["steps"]],
                         ["create_client", "create_mapper", "ensure_default_email_scope_after_creation"])
        (client,) = fake.clients.values()
        self.assertEqual(client["clientId"], "workbench-mobile")
        self.assertEqual(fake.mappers[client["id"]][0]["config"]["included.client.audience"], "workbench-hub")
        self.assertIn("email", [s["name"] for s in fake.default[client["id"]]])
        self.assertEqual(fake.realm, realm_before)
        first_writes = len(fake.writes())
        self.assertTrue(all(p.startswith(f"/admin/realms/{REALM}/clients") for _, p in fake.writes()))
        code, result = run(fake)
        self.assertEqual((code, result["steps"]), (0, []))
        self.assertEqual(len(fake.writes()), first_writes)

    def test_dry_run_with_credentials_only_reads(self):
        fake = FakeKeycloak()
        code, result = run(fake, "--dry-run")
        self.assertEqual(code, 0)
        self.assertTrue(result["dry_run"] and result["compared_with_server"])
        self.assertEqual(fake.writes(), [])
        self.assertEqual(fake.clients, {})
        self.assertNotIn(PASSWORD, json.dumps(result))

    def test_dry_run_without_credentials_never_contacts_the_server(self):
        fake = FakeKeycloak()
        env = {k: v for k, v in ENV.items() if "ADMIN" not in k}
        out = io.StringIO()
        self.assertEqual(setup.run(["--dry-run"], env, fake.send, out), 0)
        self.assertEqual(fake.calls, [])
        result = json.loads(out.getvalue())
        self.assertFalse(result["compared_with_server"])
        self.assertEqual(result["client"]["redirectUris"], [f"{SCHEME}:/oauth/callback"])

    def test_missing_credentials_without_dry_run_is_an_error(self):
        fake = FakeKeycloak()
        with self.assertRaises(setup.SetupError):
            setup.run([], {k: v for k, v in ENV.items() if "ADMIN" not in k}, fake.send, io.StringIO())
        self.assertEqual(fake.calls, [])

    def test_drifted_existing_client_is_corrected_without_losing_other_settings(self):
        drifted = {"id": "uuid-1", "clientId": "workbench-mobile", "name": "Mine", "publicClient": True,
                   "directAccessGrantsEnabled": True, "serviceAccountsEnabled": True,
                   "redirectUris": ["old:/x", "https://evil.example.test/*"],
                   "attributes": {"pkce.code.challenge.method": "plain", "custom": "kept"}}
        fake = FakeKeycloak(clients=[drifted])
        fake.mappers["uuid-1"] = [{"id": "m1", "name": "hub-audience", "protocol": "openid-connect",
                                    "protocolMapper": "oidc-audience-mapper",
                                    "config": {"included.client.audience": "other", "access.token.claim": "false"}}]
        fake.default["uuid-1"] = [{"id": "scope-profile", "name": "profile"}]
        fake.optional["uuid-1"] = [{"id": "scope-email", "name": "email"}]
        code, result = run(fake)
        self.assertEqual(code, 0)
        client = fake.clients["uuid-1"]
        self.assertFalse(client["directAccessGrantsEnabled"] or client["serviceAccountsEnabled"])
        self.assertEqual(client["redirectUris"], [f"{SCHEME}:/oauth/callback"])
        self.assertEqual((client["name"], client["attributes"]["custom"]), ("Mine", "kept"))
        self.assertEqual(fake.mappers["uuid-1"][0]["config"]["included.client.audience"], "workbench-hub")
        self.assertEqual(fake.mappers["uuid-1"][0]["config"]["access.token.claim"], "true")
        self.assertEqual(fake.optional["uuid-1"], [])
        self.assertIn("email", [s["name"] for s in fake.default["uuid-1"]])
        self.assertIn("update_client", [s["action"] for s in result["steps"]])
        self.assertNotIn("old:/x", json.dumps(result))
        self.assertTrue(all(p.startswith(f"/admin/realms/{REALM}/clients/uuid-1") for _, p in fake.writes()))
        self.assertEqual(run(fake)[1]["steps"], [])

    def test_confidential_client_of_the_same_id_is_not_converted_unless_asked(self):
        fake = FakeKeycloak(clients=[{"id": "uuid-1", "clientId": "workbench-mobile", "publicClient": False}])
        with self.assertRaises(setup.SetupError):
            run(fake)
        self.assertEqual(fake.writes(), [])
        code, _ = run(fake, "--allow-convert-confidential")
        self.assertEqual(code, 0)
        self.assertTrue(fake.clients["uuid-1"]["publicClient"])

    def test_realm_without_an_email_scope_fails_before_any_write(self):
        fake = FakeKeycloak(scopes=("profile",))
        with self.assertRaises(setup.SetupError):
            run(fake)
        self.assertEqual(fake.writes(), [])

    def test_realm_settings_are_reported_but_never_changed(self):
        fake = FakeKeycloak(realm={"revokeRefreshToken": False})
        before = deepcopy(fake.realm)
        code, result = run(fake)
        self.assertEqual(code, 0)
        self.assertTrue(any(w.startswith("realm_refresh_token_rotation_off") for w in result["warnings"]))
        self.assertTrue(any(w.startswith("audience_client_missing") for w in result["warnings"]))
        self.assertEqual(fake.realm, before)
        self.assertFalse([p for _, p in fake.writes() if "/clients" not in p])

    def test_failed_login_reports_status_without_echoing_secrets(self):
        fake = FakeKeycloak(password="different")
        with self.assertRaises(setup.SetupError) as raised:
            run(fake)
        self.assertEqual(str(raised.exception), "admin_authentication_failed_http_401")
        self.assertNotIn(PASSWORD, str(raised.exception))
        self.assertNotIn("echo-secret", str(raised.exception))
        self.assertEqual(len(fake.calls), 1)

    def test_server_errors_name_the_request_but_not_the_credentials(self):
        fake = FakeKeycloak()
        original = fake.send
        def failing(method, url, headers, body):
            if method == "POST" and url.endswith("/clients"):
                return 403, {}, b'{"errorMessage":"forbidden"}'
            return original(method, url, headers, body)
        with self.assertRaises(setup.SetupError) as raised:
            setup.run([], ENV, failing, io.StringIO())
        self.assertIn("POST /clients -> HTTP 403", str(raised.exception))
        self.assertNotIn(PASSWORD, str(raised.exception))


class ServiceAdminTests(unittest.TestCase):
    def test_service_dry_run_uses_client_credentials_in_master_and_only_reads(self):
        fake = FakeKeycloak()
        out = io.StringIO()
        self.assertEqual(setup.run(["--dry-run"], SERVICE_ENV, fake.send, out), 0)
        result = json.loads(out.getvalue())
        self.assertTrue(result["compared_with_server"])
        self.assertEqual(fake.writes(), [])
        self.assertEqual(fake.clients, {})
        method, path, headers, form = fake.token_requests[0]
        self.assertEqual((method, path), ("POST", "/realms/master/protocol/openid-connect/token"))
        self.assertEqual(headers["Content-Type"], "application/x-www-form-urlencoded")
        self.assertEqual(form, {"grant_type": ["client_credentials"],
                                "client_id": [SERVICE_ENV["KEYCLOAK_ADMIN_CLIENT_ID"]],
                                "client_secret": [CLIENT_SECRET]})
        for private in (CLIENT_SECRET, "synthetic-token", SERVICE_ENV["KEYCLOAK_ADMIN_CLIENT_ID"]):
            self.assertNotIn(private, out.getvalue())

    def test_service_apply_is_idempotent_and_honors_admin_realm(self):
        fake = FakeKeycloak()
        env = {**SERVICE_ENV, "KEYCLOAK_ADMIN_REALM": "admin-team"}
        out = io.StringIO()
        self.assertEqual(setup.run([], env, fake.send, out), 0)
        self.assertTrue(fake.writes())
        self.assertEqual(fake.token_requests[0][1], "/realms/admin-team/protocol/openid-connect/token")
        write_count = len(fake.writes())
        out = io.StringIO()
        self.assertEqual(setup.run([], env, fake.send, out), 0)
        self.assertEqual(json.loads(out.getvalue())["steps"], [])
        self.assertEqual(len(fake.writes()), write_count)

    def test_partial_or_mixed_credentials_fail_before_network_even_for_dry_run(self):
        base = {key: value for key, value in ENV.items() if "ADMIN" not in key}
        user = {"KEYCLOAK_ADMIN_USER": "synthetic-admin", "KEYCLOAK_ADMIN_PASSWORD": PASSWORD}
        service = {"KEYCLOAK_ADMIN_CLIENT_ID": "synthetic-service-admin", "KEYCLOAK_ADMIN_CLIENT_SECRET": CLIENT_SECRET}
        partial = [{key: value} for key, value in {**user, **service}.items()]
        partial += [{**user, "KEYCLOAK_ADMIN_PASSWORD": ""}, {**service, "KEYCLOAK_ADMIN_CLIENT_SECRET": ""}]
        mixed = [{**user, **service}, {**user, "KEYCLOAK_ADMIN_CLIENT_ID": "synthetic-service-admin"},
                 {**service, "KEYCLOAK_ADMIN_USER": "synthetic-admin"},
                 {"KEYCLOAK_ADMIN_PASSWORD": PASSWORD, "KEYCLOAK_ADMIN_CLIENT_SECRET": CLIENT_SECRET}]
        for credentials in partial + mixed:
            for argv in ([], ["--dry-run"]):
                with self.subTest(keys=sorted(credentials), dry_run=bool(argv)):
                    fake = FakeKeycloak()
                    out = io.StringIO()
                    with self.assertRaises(setup.SetupError) as raised:
                        setup.run(argv, {**base, **credentials}, fake.send, out)
                    self.assertEqual(str(raised.exception), "mixed_admin_credentials" if credentials in mixed else "incomplete_admin_credentials")
                    self.assertEqual(fake.calls, [])
                    self.assertEqual(out.getvalue(), "")

    def test_service_authentication_failure_does_not_echo_response_or_secret(self):
        calls = []
        def failing(method, url, headers, body):
            calls.append((method, url))
            return 401, {}, json.dumps({"error": "invalid_client", "error_description": CLIENT_SECRET,
                                       "access_token": "synthetic-sensitive-token"}).encode()
        out = io.StringIO()
        with self.assertRaises(setup.SetupError) as raised:
            setup.run(["--dry-run"], SERVICE_ENV, failing, out)
        self.assertEqual(str(raised.exception), "admin_authentication_failed_http_401")
        self.assertEqual(len(calls), 1)
        self.assertEqual(out.getvalue(), "")

    def test_admin_api_failure_does_not_echo_service_secret_or_token(self):
        fake = FakeKeycloak()
        def failing(method, url, headers, body):
            if "/admin/realms/" in url:
                return 403, {}, json.dumps({"errorMessage": CLIENT_SECRET + " synthetic-token"}).encode()
            return fake.send(method, url, headers, body)
        out = io.StringIO()
        with self.assertRaises(setup.SetupError) as raised:
            setup.run(["--dry-run"], SERVICE_ENV, failing, out)
        self.assertEqual(str(raised.exception), "GET  -> HTTP 403")
        self.assertNotIn(CLIENT_SECRET, str(raised.exception))
        self.assertNotIn("synthetic-token", str(raised.exception))
        self.assertEqual(out.getvalue(), "")


if __name__ == "__main__":
    unittest.main()
