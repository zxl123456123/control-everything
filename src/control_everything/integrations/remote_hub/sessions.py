"""Server-side browser sessions and immutable page contexts."""

import hmac
import secrets

from .identity import HubError
from .store import token_hash

COOKIE_NAME = "__Host-ce_remote"


class BrowserSessions:
    def __init__(self, store, public_origin):
        self.store, self.public_origin = store, public_origin

    def _load(self, db, identity, cookie):
        row = db.execute("SELECT * FROM browser_sessions WHERE session_hash=?", (token_hash(cookie or ""),)).fetchone()
        if (row is None or row["invalidated"] or row["expires"] <= self.store.clock()
                or row["issuer"] != identity.issuer or row["sub"] != identity.sub
                or row["sid"] != identity.sid):
            raise HubError("session_required", 401)
        return row

    def open(self, identity, cookie):
        with self.store.transaction() as db:
            try:
                row = self._load(db, identity, cookie)
                return row["csrf"], None
            except HubError:
                if cookie:
                    db.execute("UPDATE browser_sessions SET invalidated=1 WHERE session_hash=?", (token_hash(cookie),))
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
            db.execute("INSERT INTO browser_sessions VALUES(?,?,?,?,?,?,0)",
                       (token_hash(token), identity.issuer, identity.sub, identity.sid, csrf,
                        min(identity.expires_at, self.store.clock() + 1800)))
            return csrf, f"{COOKIE_NAME}={token}; Path=/; Secure; HttpOnly; SameSite=Lax"

    def validate(self, identity, cookie, *, csrf=None, origin=None):
        with self.store.transaction() as db:
            row = self._load(db, identity, cookie)
            if csrf is not None and (origin != self.public_origin or not hmac.compare_digest(row["csrf"], csrf)):
                raise HubError("csrf_rejected", 403)
            return dict(row)

    def logout(self, identity, cookie, csrf, origin):
        self.validate(identity, cookie, csrf=csrf, origin=origin)
        with self.store.transaction() as db:
            db.execute("UPDATE browser_sessions SET invalidated=1 WHERE session_hash=?", (token_hash(cookie),))

    def context(self, identity, cookie, device, existing=None):
        with self.store.transaction() as db:
            session = self._load(db, identity, cookie)
            if existing:
                row = db.execute("SELECT * FROM contexts WHERE context_id=?", (existing,)).fetchone()
                if (row is None or row["session_hash"] != session["session_hash"]
                        or row["device_id"] != device["device_id"] or row["generation"] != device["generation"]):
                    raise HubError("context_mismatch", 403)
                return row["context_id"], row["scope"]
            context_id, scope = secrets.token_urlsafe(24), token_hash(
                "\0".join((identity.issuer, identity.sub, device["device_id"], str(device["generation"]))))
            db.execute("INSERT INTO contexts VALUES(?,?,?,?,?)",
                       (context_id, session["session_hash"], device["device_id"], device["generation"], scope))
            return context_id, scope
