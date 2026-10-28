"""Fixed-issuer token verification (introspection or JWKS) and the single SSHSIG enrollment protocol."""

import base64
from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import subprocess
import tempfile
import threading
import time
import urllib.parse
import urllib.request

from control_everything.integrations.oidc_discovery import DiscoveryError, OidcDiscovery

NAMESPACE = "control-everything-device-enrollment-v1"


class HubError(Exception):
    def __init__(self, code, status=403, **details):
        super().__init__(code)
        self.code, self.status, self.details = code, status, details


@dataclass(frozen=True)
class Identity:
    issuer: str
    sub: str
    azp: str
    expires_at: float
    sid: str = ""
    name: str = ""
    # Optional display claims, only populated when the client requested the profile/email scopes.
    display_name: str = ""
    email: str = ""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise HubError("identity_unavailable", 503)


JWT_ALGORITHMS = ("RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "EdDSA")
VERIFICATION_MODES = ("introspection", "jwt", "strict")


class TokenIntrospector:
    """Validates Bearer access tokens for one fixed issuer.

    ``introspection`` asks the provider for every uncached token (default when introspection
    credentials are configured), ``jwt`` verifies the signature locally against the provider JWKS,
    and ``strict`` does both. Endpoints always come from OIDC discovery.
    """

    def __init__(self, issuer, client_id=None, client_secret=None, *, audience="workbench-hub",
                 browser_client="workbench-web", desktop_client="workbench-desktop",
                 mobile_client="workbench-mobile", clock=time.time, transport=None, mode=None,
                 discovery=None, algorithms=JWT_ALGORITHMS):
        parsed = urllib.parse.urlsplit(issuer)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or issuer.endswith("/")):
            raise ValueError("invalid_fixed_issuer")
        self.issuer = issuer
        self.client_id, self.client_secret = client_id, client_secret
        self.mode = mode or ("introspection" if client_id else "jwt")
        if self.mode not in VERIFICATION_MODES:
            raise ValueError("invalid_token_verification")
        if self.mode != "jwt" and not (isinstance(client_id, str) and client_id and isinstance(client_secret, str) and client_secret):
            raise ValueError("introspection_credentials_required")
        if self.mode != "introspection":
            if not algorithms or not set(algorithms) <= set(JWT_ALGORITHMS):
                raise ValueError("invalid_jwt_algorithms")
            try:
                import jwt  # PyJWT[crypto] is a dependency of the pinned MCP package.
            except ImportError:
                raise ValueError("jwt_support_unavailable") from None
            self._jwt = jwt
        self.algorithms = tuple(algorithms)
        self.discovery = discovery or OidcDiscovery(issuer, clock=clock)
        self.audience = audience
        self.clients = {"browser": browser_client, "desktop": desktop_client, "mobile": mobile_client}
        self.clock, self.transport = clock, transport or self._request
        self._cache, self._lock = {}, threading.Lock()

    def _request(self, token):
        body = urllib.parse.urlencode({"token": token}).encode()
        credentials = base64.b64encode((self.client_id + ":" + self.client_secret).encode()).decode()
        request = urllib.request.Request(self.discovery.endpoint("introspection_endpoint"), data=body, headers={
            "Authorization": "Basic " + credentials,
            "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"})
        with urllib.request.build_opener(_NoRedirect()).open(request, timeout=5) as response:
            raw = response.read(65537)
            if len(raw) > 65536:
                raise HubError("identity_unavailable", 503)
            return json.loads(raw)

    def _local_claims(self, token):
        """Signature, algorithm and issuer checks; audience, azp and expiry share the common checks."""
        jwt = self._jwt
        try:
            header = jwt.get_unverified_header(token)
            algorithm, kid = header.get("alg"), header.get("kid")
            if algorithm not in self.algorithms or not (kid is None or isinstance(kid, str)):
                raise HubError("invalid_identity", 401)
            try:
                jwk = self.discovery.signing_key(kid)
            except DiscoveryError:
                raise HubError("identity_unavailable", 503) from None
            if jwk is None or jwk.get("alg", algorithm) != algorithm:
                raise HubError("invalid_identity", 401)
            claims = jwt.decode(token, jwt.PyJWK.from_dict(jwk).key, algorithms=[algorithm], options={
                "verify_aud": False, "verify_exp": False, "verify_nbf": False, "verify_iat": False,
                "verify_iss": False, "require": ["exp", "sub", "iss"]})
        except HubError:
            raise
        except (jwt.PyJWTError, ValueError, TypeError, KeyError):
            raise HubError("invalid_identity", 401) from None
        nbf = claims.get("nbf")
        if claims["iss"] != self.issuer or (nbf is not None and (type(nbf) not in (int, float) or nbf > self.clock() + 30)):
            raise HubError("invalid_identity", 401)
        return dict(claims, active=True)

    def _verified(self, token):
        if self.mode == "introspection":
            return self.transport(token)
        claims = self._local_claims(token)
        if self.mode == "strict":
            remote = self.transport(token)
            if not isinstance(remote, dict) or remote.get("active") is not True or remote.get("sub") != claims["sub"]:
                raise HubError("invalid_identity", 401)
        return claims

    @staticmethod
    def _claim(value):
        if not isinstance(value, str) or len(value) > 256 or any(ord(char) < 32 for char in value):
            return ""
        return value

    def authenticate(self, token, kind, trusted_sub=None):
        if kind not in self.clients or not isinstance(token, str) or not 16 <= len(token) <= 16384:
            raise HubError("invalid_identity", 401)
        digest = hashlib.sha256(token.encode()).hexdigest()
        key = (digest, kind)
        with self._lock:
            now = self.clock()
            cached = self._cache.get(key)
            if cached and cached[0] > now:
                identity = cached[1]
            else:
                self._cache.pop(key, None)
                identity = None
        if identity is None:
            # The identity provider round trip runs outside the lock so one slow introspection cannot stall
            # unrelated requests. Concurrent first requests for one token may each introspect once.
            query_started = now
            try:
                data = self._verified(token)
            except HubError:
                raise
            except Exception:
                raise HubError("identity_unavailable", 503) from None
            now = self.clock()
            aud = data.get("aud") if isinstance(data, dict) else None
            aud = [aud] if isinstance(aud, str) else aud
            exp = data.get("exp") if isinstance(data, dict) else None
            if (not isinstance(data, dict) or data.get("active") is not True
                    or ("iss" in data and data["iss"] != self.issuer)
                    or not isinstance(data.get("sub"), str) or not data["sub"]
                    or type(exp) not in (int, float) or not math.isfinite(exp) or exp <= now):
                raise HubError("invalid_identity", 401)
            # RFC 9068 / RFC 7662 providers may report the client as client_id instead of azp.
            azp = data.get("azp") if "azp" in data else data.get("client_id")
            if not isinstance(aud, list) or self.audience not in aud or azp != self.clients[kind]:
                raise HubError("identity_scope_rejected", 403)
            name = data.get("preferred_username") or data.get("username") or data["sub"]
            if not isinstance(name, str) or len(name) > 256 or any(ord(char) < 32 for char in name):
                name = data["sub"]
            identity = Identity(self.issuer, data["sub"], azp, exp,
                                data.get("sid") if isinstance(data.get("sid"), str) else "", name,
                                self._claim(data.get("name")), self._claim(data.get("email")))
            cache_expires = min(query_started + 30, exp)
            if cache_expires <= now:
                raise HubError("identity_unavailable", 503)
            with self._lock:
                # Bound memory; eviction cannot extend identity lifetime.
                if len(self._cache) >= 1024:
                    self._cache.clear()
                self._cache[key] = (cache_expires, identity)
        if trusted_sub is not None and identity.sub != trusted_sub:
            raise HubError("identity_mismatch", 403)
        return identity


def public_key_fingerprint(public_key):
    if not isinstance(public_key, str) or not re.fullmatch(r"ssh-ed25519 [A-Za-z0-9+/]+={0,2}", public_key):
        raise HubError("invalid_public_key", 400)
    try:
        blob = base64.b64decode(public_key.split()[1], validate=True)
    except ValueError:
        raise HubError("invalid_public_key", 400) from None
    if (len(blob) != 51 or blob[:4] != struct.pack(">I", 11)
            or blob[4:15] != b"ssh-ed25519" or blob[15:19] != struct.pack(">I", 32)):
        raise HubError("invalid_public_key", 400)
    return "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode().rstrip("=")


class SSHSignatureVerifier:
    def __init__(self, ssh_keygen):
        self.executable = str(Path(ssh_keygen).resolve(strict=True))

    def verify(self, payload, public_key, signature):
        public_key_fingerprint(public_key)
        if not isinstance(signature, str) or len(signature) > 8192 or not signature.isascii():
            raise HubError("invalid_signature", 400)
        with tempfile.TemporaryDirectory(prefix="ce-sshsig-") as directory:
            root = Path(directory)
            (root / "allowed").write_text("device " + public_key + "\n", encoding="ascii")
            (root / "signature").write_text(signature, encoding="ascii")
            try:
                result = subprocess.run([self.executable, "-Y", "verify", "-f", str(root / "allowed"),
                                         "-I", "device", "-n", NAMESPACE, "-s", str(root / "signature")],
                                        input=payload, capture_output=True, timeout=10, check=False)
            except (OSError, subprocess.TimeoutExpired, UnicodeError):
                raise HubError("signature_verifier_unavailable", 503) from None
            if result.returncode:
                raise HubError("invalid_signature", 403)
