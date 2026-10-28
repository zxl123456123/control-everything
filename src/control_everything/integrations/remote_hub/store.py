"""Dedicated SQLite control directory with immediate transactions and no business data."""

from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time

from .identity import HubError

RECOVERABLE = ("pending", "provisioned", "online", "offline")
SCHEMA_VERSION = 2
# Heartbeat freshness window shared with the browser authorization path.
ONLINE_WINDOW = 45


def token_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


def public_device(device):
    return {key: device[key] for key in ("device_id", "generation", "installation_id", "key_fingerprint",
                                        "credential_revision", "state", "name")}


class RemoteHubStore:
    def __init__(self, path, *, port_start=20000, port_end=20999, clock=time.time):
        if not 1024 <= port_start < port_end <= 65535:
            raise ValueError("invalid_port_pool")
        self.path, self.port_start, self.port_end, self.clock = str(path), port_start, port_end, clock
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        if Path(path).is_symlink() or Path(path).parent.is_symlink():
            raise ValueError("hub_database_requires_private_unlinked_path")
        if os.name != "nt":
            if Path(path).parent.stat().st_mode & 0o077:
                raise ValueError("hub_database_directory_requires_private_permissions")
        with self.transaction() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS schema_version(version INTEGER NOT NULL);
                INSERT INTO schema_version SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM schema_version);
                CREATE TABLE IF NOT EXISTS members(issuer TEXT, sub TEXT, status TEXT NOT NULL,
                    PRIMARY KEY(issuer,sub));
                CREATE TABLE IF NOT EXISTS invites(token_hash TEXT PRIMARY KEY, expires REAL NOT NULL,
                    consumed_by TEXT);
                CREATE TABLE IF NOT EXISTS devices(device_id TEXT PRIMARY KEY, issuer TEXT NOT NULL,
                    sub TEXT NOT NULL, installation_id TEXT NOT NULL, key_fingerprint TEXT NOT NULL,
                    public_key TEXT NOT NULL, name TEXT NOT NULL, generation INTEGER NOT NULL,
                    state TEXT NOT NULL, http_port INTEGER UNIQUE, ws_port INTEGER UNIQUE,
                    control_token_hash TEXT, credential_revision INTEGER NOT NULL DEFAULT 0,
                    proxy_secret TEXT NOT NULL, last_heartbeat REAL, cleanup_error TEXT);
                CREATE UNIQUE INDEX IF NOT EXISTS owner_active ON devices(issuer,sub) WHERE state!='revoked';
                CREATE TABLE IF NOT EXISTS enrollments(challenge_id TEXT PRIMARY KEY, issuer TEXT NOT NULL,
                    sub TEXT NOT NULL, installation_id TEXT NOT NULL, public_key TEXT NOT NULL,
                    key_fingerprint TEXT NOT NULL, name TEXT NOT NULL, payload BLOB NOT NULL,
                    expires REAL NOT NULL, operation TEXT NOT NULL, expected_credential_revision INTEGER,
                    device_id TEXT, generation INTEGER, consumed INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS browser_sessions(session_hash TEXT PRIMARY KEY,
                    issuer TEXT NOT NULL, sub TEXT NOT NULL, sid TEXT NOT NULL, csrf TEXT NOT NULL,
                    expires REAL NOT NULL, invalidated INTEGER NOT NULL DEFAULT 0);
                CREATE TABLE IF NOT EXISTS contexts(context_id TEXT PRIMARY KEY, session_hash TEXT NOT NULL,
                    device_id TEXT NOT NULL, generation INTEGER NOT NULL, scope TEXT NOT NULL);
            """)
            self._migrate(db)
        if os.name != "nt":
            os.chmod(path, 0o600)

    @staticmethod
    def _migrate(db):
        """Forward-only, additive migrations; an unknown (newer) version is refused, never downgraded."""
        version = db.execute("SELECT version FROM schema_version").fetchall()[0][0]
        if version not in (1, SCHEMA_VERSION):
            raise ValueError("unsupported_hub_schema")
        if version == 1:
            # v2: nullable mobile-facing metadata. Existing rows stay valid with NULLs.
            for table, column in (("devices", "created_at REAL"), ("devices", "os_name TEXT"),
                                  ("devices", "os_version TEXT"), ("devices", "app_version TEXT"),
                                  ("members", "last_logout_at REAL")):
                db.execute(f"ALTER TABLE {table} ADD COLUMN {column}")
            db.execute("UPDATE schema_version SET version=?", (SCHEMA_VERSION,))

    @contextmanager
    def transaction(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            db.execute("PRAGMA foreign_keys=ON")
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def require_member(db, identity):
        row = db.execute("SELECT status FROM members WHERE issuer=? AND sub=?",
                         (identity.issuer, identity.sub)).fetchone()
        if row is None or row[0] != "active":
            raise HubError("membership_required", 403)

    def set_member(self, identity, status="active"):
        if status not in ("active", "disabled"):
            raise ValueError("invalid_member_status")
        with self.transaction() as db:
            db.execute("INSERT INTO members(issuer,sub,status) VALUES(?,?,?) ON CONFLICT(issuer,sub) DO UPDATE SET status=excluded.status",
                       (identity.issuer, identity.sub, status))
            if status == "disabled":
                self.invalidate_sessions(identity.issuer, identity.sub, db=db)

    def invalidate_sessions(self, issuer, sub, db=None):
        """Invalidate every live browser session of one member in one statement; returns the count."""
        if db is None:
            with self.transaction() as own:
                return self.invalidate_sessions(issuer, sub, db=own)
        return db.execute("UPDATE browser_sessions SET invalidated=1 WHERE issuer=? AND sub=? AND invalidated=0",
                          (issuer, sub)).rowcount

    def mark_logout(self, identity):
        """Invalidate the member's browser sessions and stamp the logout; never creates a member row."""
        with self.transaction() as db:
            db.execute("UPDATE members SET last_logout_at=? WHERE issuer=? AND sub=?",
                       (self.clock(), identity.issuer, identity.sub))
            return self.invalidate_sessions(identity.issuer, identity.sub, db=db)

    def member_status(self, identity):
        with self.transaction() as db:
            row = db.execute("SELECT status FROM members WHERE issuer=? AND sub=?",
                             (identity.issuer, identity.sub)).fetchone()
        return row[0] if row else "inactive"

    def devices_of(self, identity, limit=20):
        with self.transaction() as db:
            return [dict(row) for row in db.execute(
                "SELECT * FROM devices WHERE issuer=? AND sub=? ORDER BY generation DESC LIMIT ?",
                (identity.issuer, identity.sub, limit))]

    def create_invitation(self):
        token = secrets.token_urlsafe(32)
        with self.transaction() as db:
            db.execute("INSERT INTO invites VALUES(?,?,NULL)", (token_hash(token), self.clock() + 86400))
        return token

    def activate(self, identity, invite):
        with self.transaction() as db:
            # A disabled member stays disabled; raising here rolls back, so the invite is not consumed.
            current = db.execute("SELECT status FROM members WHERE issuer=? AND sub=?",
                                 (identity.issuer, identity.sub)).fetchone()
            if current is not None and current[0] == "disabled":
                raise HubError("member_disabled", 403)
            updated = db.execute("UPDATE invites SET consumed_by=? WHERE token_hash=? AND consumed_by IS NULL AND expires>?",
                                 (json.dumps([identity.issuer, identity.sub]), token_hash(invite), self.clock()))
            if updated.rowcount != 1:
                raise HubError("invalid_invitation", 400)
            db.execute("INSERT INTO members(issuer,sub,status) VALUES(?,?,'active') ON CONFLICT(issuer,sub) DO UPDATE SET status='active'",
                       (identity.issuer, identity.sub))

    def own_device(self, identity, device_id=None):
        with self.transaction() as db:
            sql = "SELECT * FROM devices WHERE issuer=? AND sub=?"
            args = [identity.issuer, identity.sub]
            if device_id:
                sql += " AND device_id=?"
                args.append(device_id)
            else:
                sql += " AND state!='revoked'"
            row = db.execute(sql, args).fetchone()
            return dict(row) if row else None

    def device(self, device_id):
        with self.transaction() as db:
            row = db.execute("SELECT * FROM devices WHERE device_id=?", (device_id,)).fetchone()
            if row is None:
                raise HubError("device_not_found", 404)
            return dict(row)

    def add_challenge(self, identity, values):
        with self.transaction() as db:
            self.require_member(db, identity)
            db.execute("INSERT INTO enrollments(challenge_id,issuer,sub,installation_id,public_key,key_fingerprint,name,payload,expires,operation,expected_credential_revision,device_id,generation) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       (values["challenge_id"], identity.issuer, identity.sub, values["installation_id"],
                        values["public_key"], values["key_fingerprint"], values["name"], values["payload"],
                        values["expires_at"], values["operation"], values.get("expected_credential_revision"),
                        values.get("device_id"), values.get("generation")))

    def challenge(self, identity, challenge_id):
        with self.transaction() as db:
            self.require_member(db, identity)
            row = db.execute("SELECT * FROM enrollments WHERE challenge_id=? AND issuer=? AND sub=?",
                             (challenge_id, identity.issuer, identity.sub)).fetchone()
            if row is None:
                raise HubError("enrollment_not_found", 404)
            result = dict(row)
            if result["device_id"]:
                device = db.execute("SELECT credential_revision FROM devices WHERE device_id=?", (result["device_id"],)).fetchone()
                result["result_credential_revision"] = device[0] if device else 0
            return result

    def _unconsumed(self, challenge, db=None):
        if challenge["consumed"]:
            revision = dict(challenge).get("result_credential_revision", 0)
            if db is not None and challenge["device_id"]:
                row = db.execute("SELECT credential_revision FROM devices WHERE device_id=?", (challenge["device_id"],)).fetchone()
                revision = row[0] if row else 0
            raise HubError("enrollment_consumed", 409, device_id=challenge["device_id"],
                           generation=challenge["generation"], credential_revision=revision)
        if challenge["expires"] <= self.clock():
            raise HubError("enrollment_expired", 409)

    def consume_and_reserve_once(self, identity, challenge_id):
        with self.transaction() as db:
            self.require_member(db, identity)
            challenge = db.execute("SELECT * FROM enrollments WHERE challenge_id=? AND issuer=? AND sub=?",
                                   (challenge_id, identity.issuer, identity.sub)).fetchone()
            if challenge is None:
                raise HubError("enrollment_not_found", 404)
            self._unconsumed(challenge, db)
            if challenge["operation"] != "bind":
                raise HubError("invalid_enrollment_operation", 400)
            if db.execute("SELECT 1 FROM devices WHERE issuer=? AND sub=? AND state!='revoked'",
                          (identity.issuer, identity.sub)).fetchone():
                raise HubError("device_already_bound", 409)
            used = {row[0] for row in db.execute("SELECT http_port FROM devices WHERE http_port IS NOT NULL UNION SELECT ws_port FROM devices WHERE ws_port IS NOT NULL")}
            ports = [port for port in range(self.port_start, self.port_end + 1) if port not in used][:2]
            if len(ports) != 2:
                raise HubError("port_pool_exhausted", 503)
            device_id = secrets.token_hex(12)
            generation = 1 + db.execute("SELECT COALESCE(MAX(generation),0) FROM devices WHERE issuer=? AND sub=?",
                                        (identity.issuer, identity.sub)).fetchone()[0]
            db.execute("INSERT INTO devices(device_id,issuer,sub,installation_id,key_fingerprint,public_key,name,generation,state,http_port,ws_port,proxy_secret,created_at) VALUES(?,?,?,?,?,?,?,?,'pending',?,?,?,?)",
                       (device_id, identity.issuer, identity.sub, challenge["installation_id"], challenge["key_fingerprint"],
                        challenge["public_key"], challenge["name"], generation, *ports, secrets.token_urlsafe(32), self.clock()))
            db.execute("UPDATE enrollments SET consumed=1,device_id=?,generation=? WHERE challenge_id=?",
                       (device_id, generation, challenge_id))
            return dict(db.execute("SELECT * FROM devices WHERE device_id=?", (device_id,)).fetchone())

    def mark_provisioned_unless_revoked(self, device_id):
        with self.transaction() as db:
            db.execute("UPDATE devices SET state='provisioned' WHERE device_id=? AND state='pending'", (device_id,))

    def issue_initial_credential_unless_revoked(self, identity, device_id):
        token = secrets.token_urlsafe(32)
        with self.transaction() as db:
            self.require_member(db, identity)
            changed = db.execute("UPDATE devices SET control_token_hash=?,credential_revision=1 WHERE device_id=? AND issuer=? AND sub=? AND state='provisioned' AND credential_revision=0",
                                 (token_hash(token), device_id, identity.issuer, identity.sub))
            if changed.rowcount != 1:
                raise HubError("credential_revision_conflict", 409)
        return token

    def consume_and_rotate_credential_cas(self, identity, challenge_id):
        token = secrets.token_urlsafe(32)
        conflict = False
        with self.transaction() as db:
            self.require_member(db, identity)
            challenge = db.execute("SELECT * FROM enrollments WHERE challenge_id=? AND issuer=? AND sub=?",
                                   (challenge_id, identity.issuer, identity.sub)).fetchone()
            if challenge is None:
                raise HubError("enrollment_not_found", 404)
            self._unconsumed(challenge, db)
            if challenge["operation"] != "recover":
                raise HubError("invalid_enrollment_operation", 400)
            device = db.execute("SELECT * FROM devices WHERE device_id=?", (challenge["device_id"],)).fetchone()
            if (device is None or device["issuer"] != identity.issuer or device["sub"] != identity.sub
                    or device["installation_id"] != challenge["installation_id"]
                    or device["key_fingerprint"] != challenge["key_fingerprint"]
                    or device["generation"] != challenge["generation"]):
                raise HubError("device_not_found", 404)
            if device["state"] not in ("provisioned", "online", "offline"):
                raise HubError("device_not_recoverable", 409)
            db.execute("UPDATE enrollments SET consumed=1 WHERE challenge_id=?", (challenge_id,))
            if device["credential_revision"] != challenge["expected_credential_revision"]:
                conflict = True
            else:
                db.execute("UPDATE devices SET control_token_hash=?,credential_revision=credential_revision+1 WHERE device_id=?",
                           (token_hash(token), device["device_id"]))
        if conflict:
            raise HubError("credential_revision_conflict", 409)
        return token

    def authenticate_control(self, token):
        with self.transaction() as db:
            row = db.execute("SELECT * FROM devices WHERE control_token_hash=? AND state IN ('provisioned','online','offline')",
                             (token_hash(token),)).fetchone()
            if row is None:
                raise HubError("invalid_control_token", 401)
            return dict(row)

    def update_online(self, device, token, online, info=None):
        info = info or {}
        with self.transaction() as db:
            changed = db.execute("UPDATE devices SET state=?,last_heartbeat=?,os_name=COALESCE(?,os_name),os_version=COALESCE(?,os_version),app_version=COALESCE(?,app_version) WHERE device_id=? AND control_token_hash=? AND generation=? AND http_port=? AND ws_port=? AND state IN ('provisioned','online','offline') AND EXISTS(SELECT 1 FROM members WHERE members.issuer=devices.issuer AND members.sub=devices.sub AND members.status='active')",
                                 ("online" if online else "offline", self.clock(), info.get("os_name"), info.get("os_version"),
                                  info.get("app_version"), device["device_id"], token_hash(token),
                                  device["generation"], device["http_port"], device["ws_port"]))
            if changed.rowcount != 1:
                raise HubError("invalid_control_token", 401)

    def mark_revoking(self, device_id):
        with self.transaction() as db:
            db.execute("UPDATE devices SET state='revoking',control_token_hash=NULL WHERE device_id=? AND state!='revoked'", (device_id,))

    def finish_revoke(self, device_id, error=None):
        with self.transaction() as db:
            if error:
                db.execute("UPDATE devices SET cleanup_error=? WHERE device_id=? AND state='revoking'", (error, device_id))
            else:
                db.execute("UPDATE devices SET state='revoked',http_port=NULL,ws_port=NULL,cleanup_error=NULL WHERE device_id=? AND state='revoking'", (device_id,))

    def revoking_devices(self):
        with self.transaction() as db:
            return [dict(row) for row in db.execute("SELECT * FROM devices WHERE state='revoking'")]
