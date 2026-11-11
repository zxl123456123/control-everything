"""Create ordinary Keycloak accounts with separate, server-owned provisioning credentials."""

import base64
import json
import re
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

from .identity import HubError


USERNAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{2,63}")
SUBJECT = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,254}")


def validate_new_account(username, password):
    if not isinstance(username, str) or not USERNAME.fullmatch(username):
        raise HubError("account_input_rejected", 400)
    if (not isinstance(password, str) or not 12 <= len(password) <= 1024
            or any(unicodedata.category(character) == "Cc" for character in password)):
        raise HubError("account_input_rejected", 400)
    try:
        password.encode("utf-8")
    except UnicodeError:
        raise HubError("account_input_rejected", 400) from None


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class KeycloakUserProvisioning:
    def __init__(self, issuer, client_id, client_secret):
        if not isinstance(issuer, str):
            raise ValueError("invalid_user_provisioning_config")
        parsed = urllib.parse.urlsplit(issuer)
        parsed.port  # Reject malformed authorities before deriving credential-bearing endpoints.
        base, marker, realm = issuer.rpartition("/realms/")
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or not marker
                or not re.fullmatch(r"[A-Za-z0-9_.~-]{1,255}", realm) or realm in (".", "..")
                or any(ord(character) < 33 for character in issuer)
                or not isinstance(client_id, str) or not 1 <= len(client_id) <= 256
                or not isinstance(client_secret, str) or not 1 <= len(client_secret) <= 4096):
            raise ValueError("invalid_user_provisioning_config")
        self.issuer = issuer
        self.token_url = issuer + "/protocol/openid-connect/token"
        self.users_url = base + "/admin/realms/" + realm + "/users"
        credentials = urllib.parse.quote(client_id, safe="") + ":" + urllib.parse.quote(client_secret, safe="")
        self._authorization = "Basic " + base64.b64encode(credentials.encode()).decode()

    @staticmethod
    def _send(request, *, expected=200, maximum=65536, failure="account_creation_unavailable"):
        creating = expected == 201
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())
            with opener.open(request, timeout=5) as response:
                if response.status != expected:
                    raise HubError(failure, 503)
                if creating:
                    return response.headers.get("Location", "")
                raw = response.read(maximum + 1)
            if len(raw) > maximum:
                raise ValueError("response_too_large")
            return json.loads(raw)
        except urllib.error.HTTPError as error:
            if creating and error.code == 409:
                raise HubError("username_exists", 409) from None
            if creating and error.code == 400:
                raise HubError("account_input_rejected", 400) from None
            if error.code in (401, 403):
                raise HubError("account_creation_unavailable", 503) from None
            if not creating and request.get_method() == "GET" and error.code == 404:
                raise HubError("account_not_found", 404) from None
            raise HubError(failure, 503) from None
        except (OSError, ValueError):
            raise HubError(failure, 503) from None

    def _access(self):
        value = self._send(urllib.request.Request(self.token_url, data=b"grant_type=client_credentials", headers={
            "Authorization": self._authorization, "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json"}), maximum=16384)
        token = value.get("access_token") if isinstance(value, dict) else None
        if (not isinstance(token, str) or not 1 <= len(token) <= 16384
                or any(not 33 <= ord(character) <= 126 for character in token)):
            raise HubError("account_creation_unavailable", 503)
        return token

    def create(self, username, password):
        validate_new_account(username, password)
        payload = {"username": username, "enabled": True, "requiredActions": [],
                   "credentials": [{"type": "password", "value": password, "temporary": False}]}
        request = urllib.request.Request(self.users_url, data=json.dumps(payload).encode("utf-8"), method="POST",
            headers={"Authorization": "Bearer " + self._access(), "Content-Type": "application/json",
                     "Accept": "application/json"})
        # A timed-out POST may already have committed. Never retry or modify a duplicate username.
        location = self._send(request, expected=201, failure="account_creation_unknown")
        prefix = self.users_url + "/"
        subject = location[len(prefix):] if isinstance(location, str) and location.startswith(prefix) else ""
        if not SUBJECT.fullmatch(subject):
            raise HubError("account_creation_unknown", 503)
        return {"sub": subject, "name": username, "enabled": True}

    def get_user(self, sub):
        if not isinstance(sub, str) or not SUBJECT.fullmatch(sub):
            raise HubError("account_input_rejected", 400)
        request = urllib.request.Request(self.users_url + "/" + urllib.parse.quote(sub, safe=""), method="GET",
            headers={"Authorization": "Bearer " + self._access(), "Accept": "application/json"})
        value = self._send(request, failure="account_lookup_unavailable")
        name = value.get("username") if isinstance(value, dict) else None
        if (not isinstance(name, str) or not USERNAME.fullmatch(name)
                or value.get("id") != sub or value.get("enabled") is not True):
            raise HubError("account_lookup_unavailable", 503)
        return {"sub": sub, "name": name, "enabled": True}
