"""Fixed-issuer OAuth introspection and the single SSHSIG enrollment protocol."""

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


class TokenIntrospector:
    def __init__(self, issuer, client_id, client_secret, *, audience="workbench-hub",
                 browser_client="workbench-web", desktop_client="workbench-desktop",
                 mobile_client="workbench-mobile", clock=time.time, transport=None):
        parsed = urllib.parse.urlsplit(issuer)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or issuer.endswith("/")):
            raise ValueError("invalid_fixed_issuer")
        self.issuer = issuer
        self.endpoint = issuer + "/protocol/openid-connect/token/introspect"
        self.client_id, self.client_secret = client_id, client_secret
        self.audience = audience
        self.clients = {"browser": browser_client, "desktop": desktop_client, "mobile": mobile_client}
        self.clock, self.transport = clock, transport or self._request
        self._cache, self._lock = {}, threading.Lock()

    def _request(self, token):
        body = urllib.parse.urlencode({"token": token}).encode()
        credentials = base64.b64encode((self.client_id + ":" + self.client_secret).encode()).decode()
        request = urllib.request.Request(self.endpoint, data=body, headers={
            "Authorization": "Basic " + credentials,
            "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"})
        with urllib.request.build_opener(_NoRedirect()).open(request, timeout=5) as response:
            raw = response.read(65537)
            if len(raw) > 65536:
                raise HubError("identity_unavailable", 503)
            return json.loads(raw)

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
            # The Keycloak round trip runs outside the lock so one slow introspection cannot stall
            # unrelated requests. Concurrent first requests for one token may each introspect once.
            query_started = now
            try:
                data = self.transport(token)
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
            if not isinstance(aud, list) or self.audience not in aud or data.get("azp") != self.clients[kind]:
                raise HubError("identity_scope_rejected", 403)
            name = data.get("preferred_username") or data.get("username") or data["sub"]
            if not isinstance(name, str) or len(name) > 256 or any(ord(char) < 32 for char in name):
                name = data["sub"]
            identity = Identity(self.issuer, data["sub"], data["azp"], exp,
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
