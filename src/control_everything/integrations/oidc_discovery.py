"""Fixed-issuer OpenID Connect discovery and JWKS retrieval.

Endpoints are read from ``<issuer>/.well-known/openid-configuration`` instead of provider-specific
paths, so any standards-compliant identity provider (Keycloak by default) can be used. The issuer is
a fixed private setting; documents are fetched over HTTPS without following redirects and the
advertised ``issuer`` must equal the configured one.
"""

import json
import threading
import time
import urllib.parse
import urllib.request

DISCOVERY_PATH = "/.well-known/openid-configuration"


class DiscoveryError(Exception):
    """The identity provider metadata is unreachable or violates the fixed-issuer contract."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise DiscoveryError("discovery_redirect_rejected")


def fetch_json(url, limit=262144, timeout=5):
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.build_opener(_NoRedirect()).open(request, timeout=timeout) as response:
            if response.status != 200:
                raise DiscoveryError("discovery_status_invalid")
            raw = response.read(limit + 1)
    except DiscoveryError:
        raise
    except (OSError, ValueError):
        raise DiscoveryError("discovery_unavailable") from None
    if len(raw) > limit:
        raise DiscoveryError("discovery_response_too_large")
    try:
        value = json.loads(raw)
    except ValueError:
        raise DiscoveryError("discovery_response_invalid") from None
    if not isinstance(value, dict):
        raise DiscoveryError("discovery_response_invalid")
    return value


def checked_url(value, *, origin=None):
    """Return an HTTPS URL without credentials or fragment; optionally pinned to the issuer origin."""
    parsed = urllib.parse.urlsplit(value) if isinstance(value, str) and len(value) <= 2048 else None
    if (parsed is None or parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.fragment or any(ord(char) < 33 for char in value)):
        raise DiscoveryError("discovery_endpoint_invalid")
    if origin is not None and parsed.netloc != origin:
        raise DiscoveryError("discovery_endpoint_origin_rejected")
    return value


class OidcDiscovery:
    def __init__(self, issuer, *, fetch=None, clock=time.time, ttl=3600, retry=30):
        parsed = urllib.parse.urlsplit(issuer)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or issuer.endswith("/")):
            raise ValueError("invalid_fixed_issuer")
        self.issuer, self._origin = issuer, parsed.netloc
        self._fetch, self._clock, self._ttl, self._retry = fetch or fetch_json, clock, ttl, retry
        self._lock = threading.Lock()
        self._document = self._document_expires = None
        self._jwks, self._jwks_expires, self._jwks_attempt = {}, 0, -1e18

    def document(self):
        now = self._clock()
        with self._lock:
            if self._document is not None and self._document_expires > now:
                return self._document
            stale = self._document
        try:
            value = self._fetch(self.issuer + DISCOVERY_PATH)
            if value.get("issuer") != self.issuer:
                raise DiscoveryError("discovery_issuer_mismatch")
        except DiscoveryError:
            if stale is None:
                raise
            # Keep serving the last good metadata for a short window while the provider is unreachable.
            with self._lock:
                self._document_expires = now + self._retry
            return stale
        with self._lock:
            self._document, self._document_expires = value, now + self._ttl
        return value

    def endpoint(self, name, *, same_origin=True):
        return checked_url(self.document().get(name), origin=self._origin if same_origin else None)

    def advertises(self, name):
        return isinstance(self.document().get(name), str)

    def signing_key(self, kid):
        """Return the JWK (dict) used to verify a signature, refreshing the set at most once per retry window."""
        now = self._clock()
        with self._lock:
            fresh = self._jwks_expires > now
            found = self._pick(kid)
            may_refresh = now - self._jwks_attempt >= self._retry
        if found is not None and fresh:
            return found
        if not fresh or (found is None and may_refresh):
            self._refresh_jwks(now)
            with self._lock:
                return self._pick(kid)
        return found

    def _pick(self, kid):
        if kid is None:
            return next(iter(self._jwks.values())) if len(self._jwks) == 1 else None
        return self._jwks.get(kid)

    def _refresh_jwks(self, now):
        with self._lock:
            self._jwks_attempt = now
        try:
            body = self._fetch(checked_url(self.document().get("jwks_uri")))
            keys = body.get("keys")
            if not isinstance(keys, list) or len(keys) > 64:
                raise DiscoveryError("discovery_jwks_invalid")
            table = {}
            for key in keys:
                if (isinstance(key, dict) and isinstance(key.get("kid"), str) and key.get("use", "sig") == "sig"):
                    table[key["kid"]] = key
        except DiscoveryError:
            if not self._jwks:
                raise
            with self._lock:
                self._jwks_expires = now + self._retry
            return
        with self._lock:
            self._jwks, self._jwks_expires = table, now + self._ttl
