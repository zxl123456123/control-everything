"""Provider-neutral identity: OIDC discovery, local JWKS verification, optional config and directory."""

import base64
from contextlib import contextmanager
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from control_everything.integrations.oidc_discovery import (
    DiscoveryError, OidcDiscovery, _NoRedirect, checked_url, fetch_json,
)
from control_everything.integrations.remote_hub.admin import build_service
from control_everything.integrations.remote_hub.identity import HubError, TokenIntrospector

ISSUER = "https://identity.example.test/realms/team"
DOCUMENT = {"issuer": ISSUER,
            "introspection_endpoint": ISSUER + "/protocol/openid-connect/token/introspect",
            "jwks_uri": ISSUER + "/protocol/openid-connect/certs",
            "token_endpoint": ISSUER + "/protocol/openid-connect/token",
            "device_authorization_endpoint": ISSUER + "/protocol/openid-connect/auth/device",
            "end_session_endpoint": ISSUER + "/protocol/openid-connect/logout"}
TOKEN_SHAPE = "synthetic-access-token"


def make_key(kid, private=None, algorithm="RS256", **extra):
    private = private or rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(jwt.algorithms.get_default_algorithms()[algorithm].to_jwk(private.public_key()))
    return private, dict(jwk, kid=kid, use="sig", alg=algorithm, **extra)


class Provider:
    """Fake identity provider: serves discovery + JWKS and counts requests per URL."""

    def __init__(self, clock):
        self.clock, self.calls, self.fail = clock, {}, False
        self.private, jwk = make_key("k1")
        self.keys = [jwk]
        self.document = dict(DOCUMENT)

    def fetch(self, url):
        self.calls[url] = self.calls.get(url, 0) + 1
        if self.fail:
            raise DiscoveryError("discovery_unavailable")
        if url == ISSUER + "/.well-known/openid-configuration":
            return dict(self.document)
        if url == DOCUMENT["jwks_uri"]:
            return {"keys": list(self.keys)}
        raise AssertionError(url)

    def token(self, key=None, kid="k1", algorithm="RS256", **claims):
        now = self.clock()
        payload = {"iss": ISSUER, "sub": "account-a", "aud": ["workbench-hub", "account"], "azp": "workbench-mobile",
                   "exp": now + 300, "preferred_username": "ada", "name": "Ada L", "email": "ada@example.test"}
        payload.update(claims)
        payload = {k: v for k, v in payload.items() if v is not None}
        return jwt.encode(payload, key or self.private, algorithm=algorithm, headers={"kid": kid} if kid else {})


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.now = [1000.0]
        self.provider = Provider(lambda: self.now[0])
        self.discovery = OidcDiscovery(ISSUER, fetch=self.provider.fetch, clock=lambda: self.now[0])

    def test_endpoints_come_from_the_document_and_are_cached(self):
        self.assertEqual(self.discovery.endpoint("token_endpoint"), DOCUMENT["token_endpoint"])
        self.discovery.endpoint("introspection_endpoint")
        self.assertEqual(self.provider.calls[ISSUER + "/.well-known/openid-configuration"], 1)
        self.now[0] += 3601
        self.discovery.endpoint("token_endpoint")
        self.assertEqual(self.provider.calls[ISSUER + "/.well-known/openid-configuration"], 2)

    def test_non_keycloak_endpoint_layout_is_honored(self):
        self.provider.document["token_endpoint"] = "https://identity.example.test/oauth/v2/token"
        self.assertEqual(self.discovery.endpoint("token_endpoint"), "https://identity.example.test/oauth/v2/token")

    def test_document_for_another_issuer_is_rejected(self):
        self.provider.document["issuer"] = "https://evil.example.test/realms/team"
        with self.assertRaises(DiscoveryError):
            self.discovery.document()

    def test_unsafe_or_foreign_endpoints_are_rejected(self):
        for value in ("http://identity.example.test/token", "https://user@identity.example.test/token",
                      "https://identity.example.test/token#x", "https://identity.example.test/to ken", None, 7):
            with self.subTest(value=value), self.assertRaises(DiscoveryError):
                checked_url(value)
        self.provider.document["token_endpoint"] = "https://other.example.test/token"
        discovery = OidcDiscovery(ISSUER, fetch=self.provider.fetch, clock=lambda: self.now[0])
        with self.assertRaises(DiscoveryError):
            discovery.endpoint("token_endpoint")
        self.assertEqual(discovery.endpoint("token_endpoint", same_origin=False), "https://other.example.test/token")

    def test_last_good_document_survives_a_short_outage_but_a_cold_start_fails(self):
        self.discovery.document()
        self.now[0] += 4000
        self.provider.fail = True
        self.assertEqual(self.discovery.endpoint("token_endpoint"), DOCUMENT["token_endpoint"])
        calls = self.provider.calls[ISSUER + "/.well-known/openid-configuration"]
        self.discovery.document()
        self.assertEqual(self.provider.calls[ISSUER + "/.well-known/openid-configuration"], calls, "retry window")
        with self.assertRaises(DiscoveryError):
            OidcDiscovery(ISSUER, fetch=self.provider.fetch).document()

    def test_unknown_kid_refreshes_jwks_at_most_once_per_window_and_skips_encryption_keys(self):
        _, enc = make_key("enc-key")
        self.provider.keys.append(dict(enc, use="enc"))
        self.assertEqual(self.discovery.signing_key("k1")["kid"], "k1")
        self.assertIsNone(self.discovery.signing_key("enc-key"))
        for _ in range(5):
            self.assertIsNone(self.discovery.signing_key("unknown"))
        self.assertLessEqual(self.provider.calls[DOCUMENT["jwks_uri"]], 2)
        self.now[0] += 31
        _, rotated = make_key("k2")
        self.provider.keys.append(rotated)
        self.assertEqual(self.discovery.signing_key("k2")["kid"], "k2")

    def test_fetch_never_follows_redirects(self):
        with self.assertRaises(DiscoveryError):
            _NoRedirect().redirect_request(None, None, 302, "Found", {}, "https://elsewhere.example.test")

    def test_fetch_json_is_bounded_and_typed(self):
        class Response:
            status = 200
            def __init__(self, raw): self.raw = raw
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, limit): return self.raw[:limit]
        for raw in (b"[]", b"not json", b"{" + b" " * 70000 + b"}"):
            with self.subTest(raw=raw[:8]), patch("urllib.request.OpenerDirector.open", return_value=Response(raw)), \
                    self.assertRaises(DiscoveryError):
                fetch_json("https://identity.example.test/doc", limit=65536)


class JwtVerificationTests(unittest.TestCase):
    def setUp(self):
        self.now = [1_800_000_000.0]
        self.provider = Provider(lambda: self.now[0])
        self.discovery = OidcDiscovery(ISSUER, fetch=self.provider.fetch, clock=lambda: self.now[0])

    def verifier(self, **options):
        options.setdefault("mode", "jwt")
        return TokenIntrospector(ISSUER, clock=lambda: self.now[0], discovery=self.discovery, **options)

    def test_defaults_to_local_jwt_without_credentials_and_introspection_with_them(self):
        self.assertEqual(TokenIntrospector(ISSUER).mode, "jwt")
        self.assertEqual(TokenIntrospector(ISSUER, "hub", "secret").mode, "introspection")
        for mode in ("strict", "introspection"):
            with self.subTest(mode=mode), self.assertRaisesRegex(ValueError, "introspection_credentials_required"):
                TokenIntrospector(ISSUER, mode=mode)
        with self.assertRaisesRegex(ValueError, "invalid_token_verification"):
            TokenIntrospector(ISSUER, mode="trust-me")
        with self.assertRaisesRegex(ValueError, "invalid_jwt_algorithms"):
            TokenIntrospector(ISSUER, algorithms=("HS256",))

    def test_valid_token_yields_identity_for_each_client_kind(self):
        verifier = self.verifier()
        for kind, azp in (("browser", "workbench-web"), ("desktop", "workbench-desktop"), ("mobile", "workbench-mobile")):
            identity = verifier.authenticate(self.provider.token(azp=azp, sub="s-" + kind), kind)
            self.assertEqual((identity.issuer, identity.sub, identity.azp, identity.name), (ISSUER, "s-" + kind, azp, "ada"))
            self.assertEqual((identity.display_name, identity.email), ("Ada L", "ada@example.test"))
            with self.assertRaises(HubError) as caught:
                verifier.authenticate(self.provider.token(azp=azp, sub="x" + kind), "mobile" if kind != "mobile" else "desktop")
            self.assertEqual((caught.exception.code, caught.exception.status), ("identity_scope_rejected", 403))

    def test_client_id_claim_is_accepted_when_azp_is_absent(self):
        token = self.provider.token(azp=None, client_id="workbench-mobile")
        self.assertEqual(self.verifier().authenticate(token, "mobile").azp, "workbench-mobile")

    def test_result_is_cached_for_30_seconds_without_new_provider_calls(self):
        verifier = self.verifier()
        token = self.provider.token()
        verifier.authenticate(token, "mobile")
        calls = dict(self.provider.calls)
        self.now[0] += 29
        verifier.authenticate(token, "mobile")
        self.assertEqual(self.provider.calls, calls)
        self.now[0] += 2
        verifier.authenticate(token, "mobile")  # still before exp, re-verified from the cached JWKS

    def reject(self, token, status=401, code="invalid_identity", kind="mobile", **options):
        with self.assertRaises(HubError) as caught:
            self.verifier(**options).authenticate(token, kind)
        self.assertEqual((caught.exception.code, caught.exception.status), (code, status))

    def test_bad_signature_issuer_audience_expiry_and_claims_are_rejected(self):
        other, _ = make_key("k1")
        self.reject(self.provider.token(key=other))
        self.reject(self.provider.token(iss="https://evil.example.test/realms/team"))
        self.reject(self.provider.token(iss=None))
        self.reject(self.provider.token(aud=["account"]), 403, "identity_scope_rejected")
        self.reject(self.provider.token(aud=None), 403, "identity_scope_rejected")
        self.reject(self.provider.token(azp="workbench-desktop"), 403, "identity_scope_rejected")
        self.reject(self.provider.token(exp=self.now[0] - 1))
        self.reject(self.provider.token(exp=None))
        self.reject(self.provider.token(sub=None))
        self.reject(self.provider.token(nbf=self.now[0] + 3600))
        self.reject(self.provider.token(kid="unknown"))
        self.reject("x" * 40)
        self.reject("a.b.c" + "d" * 20)

    def test_algorithm_confusion_none_and_symmetric_tokens_are_rejected(self):
        header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "kid": "k1"}).encode()).rstrip(b"=").decode()
        body = base64.urlsafe_b64encode(json.dumps({"iss": ISSUER, "sub": "x", "aud": "workbench-hub",
                                                     "azp": "workbench-mobile", "exp": self.now[0] + 99}).encode()).rstrip(b"=").decode()
        self.reject(f"{header}.{body}.")
        # A symmetric algorithm is never on the allowlist, whatever key material it claims to use.
        header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "kid": "k1"}).encode()).rstrip(b"=").decode()
        self.reject(f"{header}.{body}.c2lnbmF0dXJl")
        # An allowlisted algorithm that disagrees with the published key's alg is refused as well.
        _, ec_jwk = make_key("k1", ec.generate_private_key(ec.SECP256R1()), "ES256")
        self.provider.keys[:] = [ec_jwk]
        self.reject(self.provider.token(algorithm="RS256"))

    def test_algorithm_allowlist_can_be_narrowed(self):
        self.reject(self.provider.token(), algorithms=("ES256",))

    def test_jwks_outage_is_503_not_a_trust_decision(self):
        self.provider.fail = True
        self.reject(self.provider.token(), 503, "identity_unavailable")

    def test_ec_keys_are_supported(self):
        private, jwk = make_key("ec1", ec.generate_private_key(ec.SECP256R1()), "ES256")
        self.provider.keys.append(jwk)
        token = self.provider.token(key=private, kid="ec1", algorithm="ES256")
        self.assertEqual(self.verifier().authenticate(token, "mobile").sub, "account-a")

    def test_strict_mode_also_requires_an_active_introspection_answer(self):
        answers = []
        verifier = self.verifier(mode="strict", client_id="hub", client_secret="secret",
                                 transport=lambda token: answers.pop(0))
        token = self.provider.token()
        for answer in ({"active": False}, {"active": True, "sub": "someone-else"}, None):
            answers.append(answer)
            with self.subTest(answer=answer), self.assertRaises(HubError) as caught:
                verifier.authenticate(token, "mobile")
            self.assertEqual(caught.exception.status, 401)
        answers.append({"active": True, "sub": "account-a"})
        self.assertEqual(verifier.authenticate(token, "mobile").sub, "account-a")
        self.assertEqual(answers, [])
        verifier.transport = lambda token: (_ for _ in ()).throw(OSError("down"))
        with self.assertRaises(HubError) as caught:
            verifier.authenticate(self.provider.token(sub="fresh"), "mobile")
        self.assertEqual(caught.exception.status, 503)
        # A forged token never reaches introspection.
        verifier.transport = lambda token: self.fail("introspected an unsigned token")
        other, _ = make_key("k1")
        with self.assertRaises(HubError):
            verifier.authenticate(self.provider.token(key=other), "mobile")

    def test_introspection_mode_uses_the_discovered_endpoint_and_basic_credentials(self):
        verifier = TokenIntrospector(ISSUER, "hub", "secret", clock=lambda: self.now[0], discovery=self.discovery)
        captured = []

        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, limit):
                return json.dumps({"active": True, "sub": "account-a", "aud": "workbench-hub", "client_id": "workbench-mobile",
                                   "exp": self.now + 60}).encode()
        Response.now = self.now[0]

        class Opener:
            def open(self, request, timeout):
                captured.append(request)
                return Response()
        self.provider.document["introspection_endpoint"] = "https://identity.example.test/oauth2/introspect"
        self.discovery = verifier.discovery = OidcDiscovery(ISSUER, fetch=self.provider.fetch, clock=lambda: self.now[0])
        with patch("control_everything.integrations.remote_hub.identity.urllib.request.build_opener", return_value=Opener()):
            identity = verifier.authenticate(TOKEN_SHAPE + "-0001", "mobile")
        self.assertEqual((identity.sub, identity.azp), ("account-a", "workbench-mobile"))
        self.assertEqual(captured[0].full_url, "https://identity.example.test/oauth2/introspect")
        self.assertTrue(captured[0].headers["Authorization"].startswith("Basic "))


class OptionalConfigTests(unittest.TestCase):
    def config(self, directory, **changes):
        config = json.loads(Path("docs/examples/integrations/workbench-identity.hub.example.json").read_text())
        config["database"] = str(Path(directory) / "hub.db")
        config.update(changes)
        config = {k: v for k, v in config.items() if v is not None}
        path = Path(directory) / "config.json"
        path.write_text(json.dumps(config))
        path.chmod(0o600)
        return path

    def build(self, directory, **changes):
        with patch("control_everything.integrations.remote_hub.admin.SSHSignatureVerifier"):
            return build_service(self.config(directory, **changes))

    def test_introspection_credentials_are_optional_and_select_local_jwt(self):
        with tempfile.TemporaryDirectory() as directory:
            hub = self.build(directory, introspection_client_id=None, introspection_client_secret=None)
            self.assertEqual((hub.identities.mode, hub.user_directory), ("jwt", None))
            self.assertEqual(self.build(directory).identities.mode, "introspection")
            self.assertEqual(self.build(directory, token_verification="strict").identities.mode, "strict")
            self.assertEqual(self.build(directory, token_verification="jwt").identities.mode, "jwt")

    def test_partial_or_contradictory_verification_settings_fail_closed(self):
        bad = [dict(introspection_client_id=None), dict(introspection_client_secret=None),
               dict(introspection_client_secret=""), dict(token_verification="trust"),
               dict(introspection_client_id=None, introspection_client_secret=None, token_verification="strict"),
               dict(unknown_field=1), dict(route_proof="")]
        with tempfile.TemporaryDirectory() as directory:
            for changes in bad:
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    self.build(directory, **changes)

    def test_building_the_service_never_contacts_the_identity_provider(self):
        with tempfile.TemporaryDirectory() as directory, patch("urllib.request.OpenerDirector.open", side_effect=AssertionError):
            self.build(directory, introspection_client_id=None, introspection_client_secret=None)


class DeploymentExampleTests(unittest.TestCase):
    def test_oauth2_proxy_example_uses_generic_oidc_with_discovered_logout(self):
        text = Path("docs/examples/integrations/workbench-identity.oauth2-proxy.example.cfg").read_text()
        self.assertIn('provider = "oidc"', text)
        self.assertNotIn("keycloak-oidc", text)
        self.assertIn("end_session_endpoint", text)
        self.assertIn("{id_token}", text)
