"""Member, enrollment, routing and revocation operations behind the HTTP boundary."""

import base64
import hmac
import json
import re
import secrets
import threading
from urllib.parse import parse_qs, urlsplit

from .identity import HubError, public_key_fingerprint
from .sessions import BrowserSessions
from .store import RECOVERABLE, public_device


class RemoteHubService:
    def __init__(self, store, identities, verifier, provisioner, *, public_origin, route_proof,
                 ssh_host, ssh_host_key, ssh_port=2223, admin_subjects=(), channel_probe=None, user_directory=None,
                 static_paths=(), document_paths=("/studio", "/workspace", "/workspace-admin", "/news", "/sessions", "/progress")):
        parsed = urlsplit(public_origin)
        if parsed.scheme != "https" or parsed.netloc != parsed.hostname or parsed.path or not route_proof:
            raise ValueError("invalid_hub_origin_or_proof")
        self.store, self.identities, self.verifier, self.provisioner = store, identities, verifier, provisioner
        self.public_origin, self.route_proof = public_origin, route_proof
        self.ssh_host, self.ssh_host_key, self.ssh_port = ssh_host, ssh_host_key, ssh_port
        self.admin_subjects = frozenset(admin_subjects)
        self.user_directory = user_directory
        self.sessions = BrowserSessions(store, public_origin)
        self.channel_probe = channel_probe
        self.static_paths, self.document_paths = frozenset(static_paths), frozenset(document_paths)
        self._limits, self._limit_lock = {}, threading.Lock()

    def limit(self, key, maximum=30, window=60):
        now = self.store.clock()
        with self._limit_lock:
            times = [value for value in self._limits.get(key, ()) if value > now - window]
            if len(times) >= maximum:
                raise HubError("rate_limited", 429)
            if len(self._limits) > 4096:
                self._limits = {name: values for name, values in self._limits.items() if values and values[-1] > now - window}
            times.append(now)
            self._limits[key] = times

    def require_internal(self, proof):
        if not isinstance(proof, str) or not hmac.compare_digest(self.route_proof, proof):
            raise HubError("untrusted_proxy", 403)

    def browser_identity(self, token, trusted_sub, proof):
        self.require_internal(proof)
        if not trusted_sub:
            raise HubError("invalid_identity", 401)
        return self.identities.authenticate(token, "browser", trusted_sub)

    def require_member(self, identity):
        with self.store.transaction() as db:
            self.store.require_member(db, identity)

    def desktop_identity(self, identity):
        with self.store.transaction() as db:
            member = db.execute("SELECT status FROM members WHERE issuer=? AND sub=?", (identity.issuer, identity.sub)).fetchone()
        return {"account": {"issuer": identity.issuer, "sub": identity.sub, "name": identity.name or identity.sub},
                "member_active": bool(member and member[0] == "active")}

    def session(self, identity, cookie):
        csrf, set_cookie = self.sessions.open(identity, cookie)
        with self.store.transaction() as db:
            member = db.execute("SELECT status FROM members WHERE issuer=? AND sub=?", (identity.issuer, identity.sub)).fetchone()
        device = self.store.own_device(identity)
        return {"account": {"sub": identity.sub, "name": identity.name or identity.sub}, "membership": member[0] if member else "inactive",
                "admin": (identity.issuer, identity.sub) in self.admin_subjects,
                "device": public_device(device) if device else None, "csrf": csrf, "session_changed": bool(set_cookie)}, set_cookie

    def create_invitation(self, identity):
        if (identity.issuer, identity.sub) not in self.admin_subjects:
            raise HubError("admin_required", 403)
        self.limit((identity.issuer, identity.sub, "invitation"), 10)
        return {"invitation": self.store.create_invitation(), "expires_in": 86400}

    def admin_members(self, identity, limit=25, offset=0):
        if (identity.issuer, identity.sub) not in self.admin_subjects:
            raise HubError("admin_required", 403)
        if type(limit) is not int or not 1 <= limit <= 100 or type(offset) is not int or not 0 <= offset <= 2147483647:
            raise HubError("invalid_pagination", 400)
        if self.user_directory is None:
            raise HubError("member_directory_not_configured", 503)
        accounts, total = self.user_directory.page(limit, offset)
        items = []
        with self.store.transaction() as db:
            for account in accounts:
                owner = (self.user_directory.issuer, account["sub"])
                member = db.execute("SELECT status FROM members WHERE issuer=? AND sub=?", owner).fetchone()
                device = db.execute("SELECT device_id,name,state,last_heartbeat FROM devices WHERE issuer=? AND sub=? AND state!='revoked'", owner).fetchone()
                current = {key: device[key] for key in ("device_id", "name", "state")} if device else None
                if current and current["state"] == "online" and (device["last_heartbeat"] is None or self.store.clock() - device["last_heartbeat"] > 45):
                    current["state"] = "offline"
                items.append({"account": account, "membership": member[0] if member else "inactive",
                              "admin": owner in self.admin_subjects, "device": current})
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    def _require_admin(self, identity):
        if (identity.issuer, identity.sub) not in self.admin_subjects:
            raise HubError("admin_required", 403)

    def admin_roster(self, identity, limit=25, offset=0):
        """Admin-only roster of hub members. Names are best-effort from the optional directory."""
        self._require_admin(identity)
        if type(limit) is not int or not 1 <= limit <= 100 or type(offset) is not int or not 0 <= offset <= 2147483647:
            raise HubError("invalid_pagination", 400)
        rows, total = self.store.roster_page(limit, offset, identity.issuer)
        names = {}
        if self.user_directory is not None:
            try:
                names = {account["sub"]: account["name"] for account in self.user_directory.page(100, 0)[0]}
            except HubError:
                names = {}
        now, items = self.store.clock(), []
        for row in rows:
            devices = []
            for device in row["devices"]:
                state = device["state"]
                fresh = device["last_heartbeat"] is not None and now - device["last_heartbeat"] <= 45
                if state == "online" and not fresh:
                    state = "offline"
                devices.append({"device_id": device["device_id"], "name": device["name"], "state": state,
                                "generation": device["generation"], "last_seen": device["last_heartbeat"],
                                "cleanup_failed": bool(device["cleanup_failed"])})
            stamps = [value for value in (row["last_login"], *(d["last_seen"] for d in devices)) if value is not None]
            items.append({"sub": row["sub"], "name": names.get(row["sub"]) or None, "membership": row["status"],
                          "admin": (identity.issuer, row["sub"]) in self.admin_subjects, "devices": devices,
                          "sessions": row["sessions"], "last_active": max(stamps) if stamps else None})
        return {"items": items, "total": total, "limit": limit, "offset": offset, "names_available": self.user_directory is not None}

    def set_member_status(self, identity, sub, status):
        self._require_admin(identity)
        if not isinstance(sub, str) or not 1 <= len(sub) <= 256 or any(ord(char) < 32 for char in sub):
            raise HubError("invalid_member", 400)
        if status not in ("active", "disabled"):
            raise HubError("invalid_member_status", 400)
        self.limit((identity.issuer, identity.sub, "member-status"), 30)
        if (identity.issuer, sub) in self.admin_subjects:
            raise HubError("cannot_change_admin", 409)
        self.store.set_member_status(identity.issuer, sub, status)
        return {"sub": sub, "membership": status}

    def activate(self, identity, invite):
        self.limit((identity.issuer, identity.sub, "activate"), 10)
        if not isinstance(invite, str) or not 16 <= len(invite) <= 128:
            raise HubError("invalid_invitation", 400)
        self.store.activate(identity, invite)
        return {"membership": "active"}

    def _installation(self, installation_id, public_key):
        if not isinstance(installation_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", installation_id):
            raise HubError("invalid_installation_id", 400)
        return public_key_fingerprint(public_key)

    def _matching(self, identity, installation_id, public_key, device_id=None, generation=None):
        self.require_member(identity)
        fingerprint = self._installation(installation_id, public_key)
        if ((device_id is not None and (not isinstance(device_id, str) or not re.fullmatch(r"[0-9a-f]{24}", device_id)))
                or (generation is not None and type(generation) is not int)):
            raise HubError("device_not_found", 404)
        device = self.store.own_device(identity, device_id)
        if (device is None or device["installation_id"] != installation_id or device["key_fingerprint"] != fingerprint
                or device["public_key"] != public_key or (generation is not None and device["generation"] != generation)):
            raise HubError("device_not_found", 404)
        return device

    def _challenge(self, identity, installation_id, public_key, name, operation, device=None):
        self.limit((identity.issuer, identity.sub, "enrollment"), 10)
        fingerprint = self._installation(installation_id, public_key)
        challenge_id, expires = secrets.token_urlsafe(24), self.store.clock() + 120
        payload = {"version": 1, "random_nonce": secrets.token_urlsafe(32), "challenge_id": challenge_id,
                   "issuer": identity.issuer, "sub": identity.sub, "installation_id": installation_id,
                   "key_fingerprint": fingerprint, "operation": operation, "expires_at": expires}
        if device:
            payload.update(device_id=device["device_id"], generation=device["generation"],
                           expected_credential_revision=device["credential_revision"])
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        self.store.add_challenge(identity, dict(payload, payload=raw, public_key=public_key, name=name))
        return {"challenge_id": challenge_id, "payload": base64.b64encode(raw).decode(), "expires_at": expires}

    def begin_enrollment(self, identity, installation_id, public_key, name):
        self.require_member(identity)
        if self.store.own_device(identity):
            raise HubError("device_already_bound", 409)
        if not isinstance(name, str) or not 1 <= len(name) <= 100 or any(ord(char) < 32 for char in name):
            raise HubError("invalid_device_name", 400)
        return self._challenge(identity, installation_id, public_key, name, "bind")

    def enrollment_status(self, identity, installation_id, public_key):
        device = self._matching(identity, installation_id, public_key)
        return {key: device[key] for key in ("device_id", "generation", "state", "credential_revision")} | {
            "recoverable": device["state"] in RECOVERABLE}

    def begin_recovery(self, identity, installation_id, public_key, device_id, generation, expected_credential_revision):
        device = self._matching(identity, installation_id, public_key, device_id, generation)
        if device["state"] not in RECOVERABLE:
            raise HubError("device_not_recoverable", 409)
        if type(expected_credential_revision) is not int or device["credential_revision"] != expected_credential_revision:
            raise HubError("credential_revision_conflict", 409)
        return self._challenge(identity, installation_id, public_key, device["name"], "recover", device)

    def _ensure(self, device):
        if device["state"] != "pending":
            return
        try:
            self.provisioner.ensure_device(device["device_id"], device["public_key"], device["http_port"], device["ws_port"])
        except Exception:
            raise HubError("provisioning_unavailable", 503) from None
        self.store.mark_provisioned_unless_revoked(device["device_id"])

    def complete_enrollment(self, identity, challenge_id, signature):
        self.limit((identity.issuer, identity.sub, "complete"), 30)
        challenge = self.store.challenge(identity, challenge_id)
        self.store._unconsumed(challenge)
        self.verifier.verify(challenge["payload"], challenge["public_key"], signature)
        if challenge["operation"] == "bind":
            device = self.store.consume_and_reserve_once(identity, challenge_id)
            self._ensure(device)
            token = self.store.issue_initial_credential_unless_revoked(identity, device["device_id"])
        elif challenge["operation"] == "recover":
            device = self._matching(identity, challenge["installation_id"], challenge["public_key"],
                                    challenge["device_id"], challenge["generation"])
            if device["state"] not in RECOVERABLE:
                raise HubError("device_not_recoverable", 409)
            self._ensure(device)
            token = self.store.consume_and_rotate_credential_cas(identity, challenge_id)
        else:
            raise HubError("invalid_enrollment_operation", 400)
        config = self.config(token)
        return {key: config[key] for key in ("device_id", "generation", "credential_revision")} | {
            "control_token": token, "config": config}

    def config(self, token):
        device = self.store.authenticate_control(token)
        with self.store.transaction() as db:
            from .identity import Identity
            self.store.require_member(db, Identity(device["issuer"], device["sub"], "", 0))
        return {"device_id": device["device_id"], "generation": device["generation"],
                "credential_revision": device["credential_revision"], "public_origin": self.public_origin,
                "ssh": {"host": self.ssh_host, "port": self.ssh_port,
                        "user": "ced_" + device["device_id"], "host_key": self.ssh_host_key},
                "remote_http_port": device["http_port"], "remote_ws_port": device["ws_port"],
                "proxy_token": device["proxy_secret"]}

    def heartbeat(self, token, installation_id, runtime_ready):
        device = self.store.authenticate_control(token)
        self.config(token)
        if installation_id != device["installation_id"] or type(runtime_ready) is not bool:
            raise HubError("installation_mismatch", 403)
        # A caller's readiness claim alone is never evidence of two live channels.
        online = False
        if runtime_ready and self.channel_probe:
            try:
                online = self.channel_probe(device) is True
            except Exception:
                online = False
        self.store.update_online(device, token, online)
        return {"state": "online" if online else "offline"}

    def revoke(self, identity, device_id):
        device = self.store.device(device_id)
        if ((device["issuer"], device["sub"]) != (identity.issuer, identity.sub)
                and (identity.issuer, identity.sub) not in self.admin_subjects):
            raise HubError("device_not_found", 404)
        return self._revoke(device)

    def revoke_control(self, token):
        return self._revoke(self.store.authenticate_control(token))

    def _revoke(self, device):
        self.store.mark_revoking(device["device_id"])
        try:
            self.provisioner.disable_device(device["device_id"])
            self.provisioner.terminate_verified_connections(device["device_id"])
            inspected = self.provisioner.inspect_device(device["device_id"])
            if inspected.get("connections") != 0 or inspected.get("listeners") != 0:
                raise RuntimeError("cleanup_incomplete")
        except Exception:
            self.store.finish_revoke(device["device_id"], "cleanup_failed")
        else:
            self.store.finish_revoke(device["device_id"])
        result = self.store.device(device["device_id"])
        return {"device_id": result["device_id"], "state": result["state"], "cleanup_error": result["cleanup_error"]}

    def reconcile(self):
        return [self._revoke(device) for device in self.store.revoking_devices()]

    def authorize(self, identity, cookie, *, method, uri, context=None, origin=None):
        self.require_member(identity)
        self.sessions.validate(identity, cookie)
        if method not in ("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"):
            raise HubError("method_rejected", 403)
        if origin is not None and origin != self.public_origin:
            raise HubError("origin_rejected", 403)
        if method not in ("GET", "HEAD") and origin != self.public_origin:
            raise HubError("origin_rejected", 403)
        parsed = urlsplit(uri)
        if parsed.scheme or parsed.netloc or not parsed.path.startswith("/") or "\\" in uri:
            raise HubError("invalid_request_uri", 400)
        device = self.store.own_device(identity)
        if (not device or device["state"] != "online" or device["last_heartbeat"] is None
                or self.store.clock() - device["last_heartbeat"] > 45):
            raise HubError("device_offline", 503)
        websocket = parsed.path == "/workbench-runtime"
        query = parse_qs(parsed.query, keep_blank_values=True)
        if websocket:
            if (method != "GET" or set(query) != {"orca-client", "ce_context"}
                    or query["orca-client"] != ["web"] or len(query["ce_context"]) != 1
                    or origin != self.public_origin):
                raise HubError("websocket_rejected", 403)
            context = query["ce_context"][0]
        document = parsed.path in self.document_paths and method in ("GET", "HEAD") and context is None
        static = parsed.path in self.static_paths and method in ("GET", "HEAD")
        if not context and not document and not static:
            raise HubError("context_required", 403)
        metadata = {}
        if not static:
            context_id, scope = self.sessions.context(identity, cookie, device, context)
            metadata = {"X-CE-Page-Context": context_id, "X-CE-Storage-Scope": scope}
        # Recheck revocation after context creation and before publishing a route.
        current = self.store.device(device["device_id"])
        if current["state"] != "online" or current["generation"] != device["generation"]:
            raise HubError("device_offline", 503)
        return {"X-CE-Upstream": f"127.0.0.1:{device['ws_port'] if websocket else device['http_port']}",
                "X-CE-Device-Proof": device["proxy_secret"], **metadata}
