"""Desktop account login, independent of computer enrollment and tunnel credentials."""

import threading
import time
from urllib.parse import urlencode, urlsplit

from .remote_connector import ConnectorError


class RemoteAccount:
    def __init__(self, peer, store, *, clock=time.time):
        self.peer, self.store, self.clock = peer, store, clock
        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._worker = None
        self._grant = None
        self._identity = None
        self._checked = 0
        self._error = ""
        self._tokens = store.read("account-oauth.json", protected=True)
        if self._tokens and self._tokens.get("issuer") != peer.config.issuer:
            self._tokens = None

    def _save(self, value):
        access, refresh, expires = value.get("access_token"), value.get("refresh_token"), value.get("expires_in")
        if (not isinstance(access, str) or not 16 <= len(access) <= 16384
                or not isinstance(refresh, str) or not 16 <= len(refresh) <= 16384
                or type(expires) is not int or not 1 <= expires <= 86400):
            raise ConnectorError("remote_token_invalid")
        self._tokens = {"issuer": self.peer.config.issuer, "access_token": access,
                        "refresh_token": refresh, "expires_at": self.clock() + expires}
        self.store.write("account-oauth.json", self._tokens, protected=True)

    def _access(self):
        if not self._tokens:
            raise ConnectorError("account_login_required", 401)
        if self._tokens["expires_at"] <= self.clock() + 30:
            self._save(self.peer.request("POST", "/token", {
                "client_id": self.peer.config.client_id, "grant_type": "refresh_token",
                "refresh_token": self._tokens["refresh_token"]}, oauth=True))
        return self._tokens["access_token"]

    def _read_identity(self):
        value = self.peer.request("GET", "/remote/desktop/identity", token=self._access())
        account = value.get("account")
        if (not isinstance(account, dict) or account.get("issuer") != self.peer.config.issuer
                or not isinstance(account.get("sub"), str) or not account["sub"]
                or type(value.get("admin")) is not bool):
            raise ConnectorError("remote_identity_invalid")
        if self._identity and self._identity["account"]["sub"] != account["sub"]:
            raise ConnectorError("remote_identity_changed", 401)
        self._identity = {"account": account, "admin": value["admin"],
                          "membership": value.get("membership", "inactive")}
        self._checked = self.clock()

    def status(self):
        with self._lock:
            if self._tokens and self.clock() - self._checked >= 30:
                try:
                    self._read_identity()
                    self._error = ""
                except ConnectorError as error:
                    self._identity = None
                    self._error = error.code
                    if error.status in (400, 401, 403):
                        self._tokens = None
                        self.store.clear("account-oauth.json")
            value = {"configured": True, "state": "signed_in" if self._identity else "signed_out",
                     "account": None, "admin": False, "code": self._error}
            if self._identity:
                value.update(self._identity)
            if self._grant:
                value.update(state="authorizing", **{key: self._grant[key] for key in
                             ("user_code", "verification_uri", "expires_in")})
            return value

    def authorize(self):
        with self._lock:
            if self._worker and self._worker.is_alive():
                raise ConnectorError("remote_authorization_in_progress", 409)
            self._stop.clear()
            grant = self.peer.request("POST", "/auth/device", {
                "client_id": self.peer.config.client_id, "scope": "openid profile"}, oauth=True)
            uri = urlsplit(grant.get("verification_uri", ""))
            issuer = urlsplit(self.peer.config.issuer)
            if ((uri.scheme, uri.netloc) != (issuer.scheme, issuer.netloc)
                    or uri.username or uri.password or uri.fragment
                    or not isinstance(grant.get("device_code"), str) or not grant["device_code"]
                    or not isinstance(grant.get("user_code"), str) or not grant["user_code"]
                    or type(grant.get("expires_in")) is not int or not 1 <= grant["expires_in"] <= 1800
                    or type(grant.get("interval", 5)) is not int or not 1 <= grant.get("interval", 5) <= 60):
                raise ConnectorError("remote_grant_invalid")
            self._tokens = self._identity = None
            self.store.clear("account-oauth.json")
            self._grant, self._error = grant, ""
            self._worker = threading.Thread(target=self._poll, args=(grant,), name="desktop-account", daemon=True)
            self._worker.start()
            return self.status()

    def _poll(self, grant):
        interval, deadline = grant.get("interval", 5), self.clock() + grant["expires_in"]
        try:
            while not self._stop.wait(interval):
                if self.clock() >= deadline:
                    raise ConnectorError("expired_token")
                try:
                    value = self.peer.request("POST", "/token", {
                        "client_id": self.peer.config.client_id,
                        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                        "device_code": grant["device_code"]}, oauth=True)
                except ConnectorError as error:
                    if error.code == "authorization_pending":
                        continue
                    if error.code == "slow_down":
                        interval += 5
                        continue
                    raise
                with self._lock:
                    if self._stop.is_set():
                        return
                    self._save(value)
                    self._read_identity()
                return
        except (ConnectorError, OSError, ValueError) as error:
            with self._lock:
                if not self._stop.is_set():
                    self._error = getattr(error, "code", "remote_state_invalid")
                    self._tokens = self._identity = None
                    self.store.clear("account-oauth.json")
        finally:
            with self._lock:
                self._grant = None

    def members(self, limit=25, offset=0):
        with self._lock:
            # The hub also checks the current subject on every directory request.
            try:
                self._read_identity()
            except ConnectorError as error:
                self._identity = None
                self._checked = 0
                if error.status in (400, 401, 403):
                    self._tokens = None
                    self.store.clear("account-oauth.json")
                raise
            if self._identity["admin"] is not True:
                raise ConnectorError("admin_required", 403)
            return self.peer.request("GET", "/remote/desktop/admin/members?" +
                                     urlencode({"limit": limit, "offset": offset}), token=self._access())

    def mutate(self, kind, body):
        if kind not in ("invitations", "activate"):
            raise ConnectorError("remote_endpoint_invalid")
        with self._lock:
            result = self.peer.request("POST", "/remote/desktop/" + kind, body, self._access())
            self._checked = 0
            return result

    def logout(self):
        self.close()
        with self._lock:
            self._tokens = self._identity = self._grant = None
            self._error = ""
            self.store.clear("account-oauth.json")
        return self.status()

    def close(self):
        self._stop.set()
        if self._worker:
            self._worker.join(timeout=20)
            if self._worker.is_alive():
                raise ConnectorError("remote_authorization_in_progress", 409)
