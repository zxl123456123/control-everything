"""Read-only Keycloak registration directory using server-owned credentials."""

import base64
import json
import urllib.parse
import urllib.request

from .identity import HubError


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise HubError("member_directory_unavailable", 503)


class KeycloakUserDirectory:
    def __init__(self, issuer, client_id, client_secret):
        parsed = urllib.parse.urlsplit(issuer)
        base, marker, realm = issuer.rpartition("/realms/")
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.query or parsed.fragment or not marker or not realm or "/" in realm
                or not isinstance(client_id, str) or not 1 <= len(client_id) <= 256
                or not isinstance(client_secret, str) or not 1 <= len(client_secret) <= 4096):
            raise ValueError("invalid_user_directory_config")
        self.issuer = issuer
        self.token_url = issuer + "/protocol/openid-connect/token"
        self.users_url = base + "/admin/realms/" + realm + "/users"
        credentials = urllib.parse.quote(client_id, safe="") + ":" + urllib.parse.quote(client_secret, safe="")
        self._authorization = "Basic " + base64.b64encode(credentials.encode()).decode()

    @staticmethod
    def _json(request, maximum=262144):
        try:
            with urllib.request.build_opener(_NoRedirect()).open(request, timeout=3) as response:
                if response.status != 200:
                    raise ValueError("invalid_directory_status")
                raw = response.read(maximum + 1)
            if len(raw) > maximum:
                raise ValueError("directory_response_too_large")
            return json.loads(raw)
        except (OSError, ValueError, HubError):
            raise HubError("member_directory_unavailable", 503) from None

    def page(self, limit, offset):
        token = self._json(urllib.request.Request(self.token_url,
            data=b"grant_type=client_credentials", headers={
                "Authorization": self._authorization, "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json"}), 16384)
        access_token = token.get("access_token") if isinstance(token, dict) else None
        if (not isinstance(access_token, str) or not 1 <= len(access_token) <= 16384
                or any(ord(char) < 33 for char in access_token)):
            raise HubError("member_directory_unavailable", 503)
        headers = {"Authorization": "Bearer " + access_token, "Accept": "application/json"}
        total = self._json(urllib.request.Request(self.users_url + "/count", headers=headers))
        query = urllib.parse.urlencode({"first": offset, "max": limit, "briefRepresentation": "true"})
        users = self._json(urllib.request.Request(self.users_url + "?" + query, headers=headers))
        if type(total) is not int or total < 0 or not isinstance(users, list) or len(users) > limit:
            raise HubError("member_directory_unavailable", 503)
        result, subjects = [], set()
        for user in users:
            if not isinstance(user, dict):
                raise HubError("member_directory_unavailable", 503)
            subject = user.get("id")
            if (not isinstance(subject, str) or not 1 <= len(subject) <= 256 or subject in subjects
                    or any(ord(char) < 32 for char in subject)):
                raise HubError("member_directory_unavailable", 503)
            subjects.add(subject)
            names = [user.get(key) for key in ("username", "firstName", "lastName")]
            if any(value is not None and (not isinstance(value, str) or len(value) > 256
                   or any(ord(char) < 32 for char in value)) for value in names):
                raise HubError("member_directory_unavailable", 503)
            try:
                for value in [subject, *names]:
                    if value is not None:
                        value.encode("utf-8")
            except UnicodeError:
                raise HubError("member_directory_unavailable", 503) from None
            name = names[0] or " ".join(filter(None, names[1:])) or "未命名账号"
            created, enabled = user.get("createdTimestamp"), user.get("enabled")
            if (not isinstance(name, str) or len(name) > 512 or any(ord(char) < 32 for char in name)
                    or created is not None and (type(created) is not int or not 0 <= created <= 9223372036854775807)
                    or enabled is not None and type(enabled) is not bool):
                raise HubError("member_directory_unavailable", 503)
            result.append({"sub": subject, "name": name, "registered_at": created / 1000 if created is not None else None,
                           "enabled": enabled})
        return result, total
