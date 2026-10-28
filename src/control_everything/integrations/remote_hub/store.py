"""Dedicated SQLite control directory with immediate transactions and no business data."""

from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
import uuid

from .identity import HubError

RECOVERABLE = ("pending", "provisioned", "online", "offline")
SCHEMA_VERSION = 3
# Heartbeat freshness window shared with the browser authorization path.
ONLINE_WINDOW = 45
# Copy of a pre-account-id database, written next to it before the first v3 migration.
BACKUP_SUFFIX = ".pre-account-id"
ACCOUNT_ID = re.compile(r"[0-9a-f]{32}")

# Latest schema. Ownership is keyed on the internal account_id; (issuer, sub) only lives in identities,
# so replacing the identity provider is a data operation (link-identity), not a table migration.
_TABLES = {
    "identities": """CREATE TABLE identities(issuer TEXT NOT NULL, sub TEXT NOT NULL, account_id TEXT NOT NULL,
        created_at REAL, PRIMARY KEY(issuer,sub))""",
    "members": """CREATE TABLE members(account_id TEXT PRIMARY KEY, status TEXT NOT NULL, last_logout_at REAL)""",
    "invites": """CREATE TABLE invites(token_hash TEXT PRIMARY KEY, expires REAL NOT NULL, consumed_by TEXT)""",
    "devices": """CREATE TABLE devices(device_id TEXT PRIMARY KEY, account_id TEXT NOT NULL,
        installation_id TEXT NOT NULL, key_fingerprint TEXT NOT NULL,
        public_key TEXT NOT NULL, name TEXT NOT NULL, generation INTEGER NOT NULL,
        state TEXT NOT NULL, http_port INTEGER UNIQUE, ws_port INTEGER UNIQUE,
        control_token_hash TEXT, credential_revision INTEGER NOT NULL DEFAULT 0,
        proxy_secret TEXT NOT NULL, last_heartbeat REAL, cleanup_error TEXT,
        created_at REAL, os_name TEXT, os_version TEXT, app_version TEXT)""",
    "enrollments": """CREATE TABLE enrollments(challenge_id TEXT PRIMARY KEY, account_id TEXT NOT NULL,
        installation_id TEXT NOT NULL, public_key TEXT NOT NULL,
        key_fingerprint TEXT NOT NULL, name TEXT NOT NULL, payload BLOB NOT NULL,
        expires REAL NOT NULL, operation TEXT NOT NULL, expected_credential_revision INTEGER,
        device_id TEXT, generation INTEGER, consumed INTEGER NOT NULL DEFAULT 0)""",
    "browser_sessions": """CREATE TABLE browser_sessions(session_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL, sid TEXT NOT NULL, csrf TEXT NOT NULL,
        expires REAL NOT NULL, invalidated INTEGER NOT NULL DEFAULT 0)""",
    "contexts": """CREATE TABLE contexts(context_id TEXT PRIMARY KEY, session_hash TEXT NOT NULL,
        device_id TEXT NOT NULL, generation INTEGER NOT NULL, scope TEXT NOT NULL)""",
}
_INDEXES = (
    "CREATE INDEX identities_account ON identities(account_id)",
    "CREATE UNIQUE INDEX owner_active ON devices(account_id) WHERE state!='revoked'",
)


def token_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


def new_account_id():
    return uuid.uuid4().hex


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
        self._backup_before_migration()
        with self.transaction() as db:
            exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_version'").fetchone()
            if exists is None:
                # Fresh database: create the latest schema atomically (no executescript: it would commit).
                db.execute("CREATE TABLE schema_version(version INTEGER NOT NULL)")
                for ddl in (*_TABLES.values(), *_INDEXES):
                    db.execute(ddl)
                db.execute("INSERT INTO schema_version VALUES(?)", (SCHEMA_VERSION,))
            else:
                self._migrate(db)
        if os.name != "nt":
            os.chmod(path, 0o600)

    def _backup_before_migration(self):
        """Copy a v1/v2 database to ``<path>.pre-account-id`` before the first migration touches it.

        Uses the SQLite online-backup API (consistent even with concurrent readers), writes a temporary
        file first and renames it, so a crash never leaves a half-written backup under the final name.
        The copy is refreshed on every start while the database is still pre-v3, so it always matches
        the state a failed migration rolled back to; once migrated it is never touched again.
        """
        if not Path(self.path).is_file() or Path(self.path).stat().st_size == 0:
            return
        source = sqlite3.connect(self.path, timeout=10)
        try:
            try:
                row = source.execute("SELECT version FROM schema_version").fetchone()
            except sqlite3.OperationalError:
                return
            if row is None or row[0] not in (1, 2):
                return
            target_path = self.path + BACKUP_SUFFIX
            temporary = target_path + ".tmp"
            Path(temporary).unlink(missing_ok=True)
            target = sqlite3.connect(temporary)
            try:
                source.backup(target)
            finally:
                target.close()
            if os.name != "nt":
                os.chmod(temporary, 0o600)
            os.replace(temporary, target_path)
        finally:
            source.close()

    @staticmethod
    def _migrate(db):
        """Forward-only migrations in the caller's single transaction; a newer version is refused."""
        version = db.execute("SELECT version FROM schema_version").fetchall()[0][0]
        if version not in (1, 2, SCHEMA_VERSION):
            raise ValueError("unsupported_hub_schema")
        if version == 1:
            # v2: nullable mobile-facing metadata. Existing rows stay valid with NULLs.
            for table, column in (("devices", "created_at REAL"), ("devices", "os_name TEXT"),
                                  ("devices", "os_version TEXT"), ("devices", "app_version TEXT"),
                                  ("members", "last_logout_at REAL")):
                db.execute(f"ALTER TABLE {table} ADD COLUMN {column}")
            db.execute("UPDATE schema_version SET version=2")
            version = 2
        if version == 2:
            RemoteHubStore._migrate_account_ids(db)
            db.execute("UPDATE schema_version SET version=?", (SCHEMA_VERSION,))

    @staticmethod
    def _migrate_account_ids(db):
        """v3: give every (issuer, sub) a random internal account_id and re-key all ownership on it."""
        db.execute(_TABLES["identities"])
        pairs = set()
        for table in ("members", "devices", "enrollments", "browser_sessions"):
            pairs.update(tuple(row) for row in db.execute(
                f"SELECT DISTINCT issuer,sub FROM {table} WHERE issuer IS NOT NULL AND sub IS NOT NULL"))
        invites = db.execute("SELECT rowid,consumed_by FROM invites WHERE consumed_by IS NOT NULL").fetchall()
        consumers = {}
        for rowid, raw in invites:
            try:
                value = json.loads(raw)
            except (TypeError, ValueError):
                continue
            if (isinstance(value, list) and len(value) == 2 and all(isinstance(item, str) for item in value)):
                consumers[rowid] = tuple(value)
                pairs.add(tuple(value))
        created = time.time()
        for issuer, sub in sorted(pairs):
            db.execute("INSERT INTO identities(issuer,sub,account_id,created_at) VALUES(?,?,?,?)",
                       (issuer, sub, new_account_id(), created))
        db.execute("CREATE INDEX identities_account ON identities(account_id)")
        expected = {table: db.execute(
            f"SELECT COUNT(*) FROM {table} WHERE issuer IS NOT NULL AND sub IS NOT NULL").fetchone()[0]
            for table in ("members", "devices", "enrollments", "browser_sessions")}
        # Rebuild each table: old one aside, final one created, rows copied through identities, old one dropped.
        copies = {
            "members": ("account_id,status,last_logout_at",
                        "i.account_id,t.status,t.last_logout_at"),
            "devices": ("device_id,account_id,installation_id,key_fingerprint,public_key,name,generation,state,"
                        "http_port,ws_port,control_token_hash,credential_revision,proxy_secret,last_heartbeat,"
                        "cleanup_error,created_at,os_name,os_version,app_version",
                        "t.device_id,i.account_id,t.installation_id,t.key_fingerprint,t.public_key,t.name,t.generation,"
                        "t.state,t.http_port,t.ws_port,t.control_token_hash,t.credential_revision,t.proxy_secret,"
                        "t.last_heartbeat,t.cleanup_error,t.created_at,t.os_name,t.os_version,t.app_version"),
            "enrollments": ("challenge_id,account_id,installation_id,public_key,key_fingerprint,name,payload,expires,"
                            "operation,expected_credential_revision,device_id,generation,consumed",
                            "t.challenge_id,i.account_id,t.installation_id,t.public_key,t.key_fingerprint,t.name,t.payload,"
                            "t.expires,t.operation,t.expected_credential_revision,t.device_id,t.generation,t.consumed"),
            "browser_sessions": ("session_hash,account_id,sid,csrf,expires,invalidated",
                                 "t.session_hash,i.account_id,t.sid,t.csrf,t.expires,t.invalidated"),
        }
        for table, (columns, selected) in copies.items():
            db.execute(f"ALTER TABLE {table} RENAME TO {table}_v2")
            db.execute(_TABLES[table])
            db.execute(f"INSERT INTO {table}({columns}) SELECT {selected} FROM {table}_v2 AS t "
                       "JOIN identities AS i ON i.issuer=t.issuer AND i.sub=t.sub")
            db.execute(f"DROP TABLE {table}_v2")
            copied = db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            if copied != expected[table]:
                raise ValueError("account_id_migration_row_mismatch")
        db.execute(_INDEXES[1])
        # Invitation consumer: [issuer, sub] JSON becomes the plain account_id.
        for rowid, pair in consumers.items():
            account = db.execute("SELECT account_id FROM identities WHERE issuer=? AND sub=?", pair).fetchone()
            db.execute("UPDATE invites SET consumed_by=? WHERE rowid=?", (account[0], rowid))

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

    # ---- account resolution: (issuer, sub) -> internal account_id, always through identities ----

    @staticmethod
    def lookup_account(db, issuer, sub):
        row = db.execute("SELECT account_id FROM identities WHERE issuer=? AND sub=?", (issuer, sub)).fetchone()
        return row[0] if row else None

    def ensure_account_row(self, db, issuer, sub):
        account = self.lookup_account(db, issuer, sub)
        if account is None:
            account = new_account_id()
            db.execute("INSERT INTO identities(issuer,sub,account_id,created_at) VALUES(?,?,?,?)",
                       (issuer, sub, account, self.clock()))
        return account

    def account_id(self, identity):
        """Internal account of an identity, or None when the hub has never seen it."""
        with self.transaction() as db:
            return self.lookup_account(db, identity.issuer, identity.sub)

    def ensure_account(self, identity):
        with self.transaction() as db:
            return self.ensure_account_row(db, identity.issuer, identity.sub)

    def identities_of(self, account_id):
        with self.transaction() as db:
            return [dict(row) for row in db.execute(
                "SELECT issuer,sub,account_id FROM identities WHERE account_id=? ORDER BY created_at,issuer,sub",
                (account_id,))]

    def admin_accounts(self, db, pairs):
        """Accounts of configured (issuer, sub) administrator pairs; unknown pairs are skipped."""
        accounts = set()
        for issuer, sub in pairs:
            account = self.lookup_account(db, issuer, sub)
            if account is not None:
                accounts.add(account)
        return accounts

    def link_identity(self, account_id, issuer, sub):
        """Link one more (issuer, sub) to an existing account, e.g. after replacing the identity provider.

        Idempotent. A login-only account created for that identity (no membership, device, enrollment or
        invitation) is absorbed; anything else is refused so two real accounts are never merged silently.
        """
        if (not isinstance(account_id, str) or not ACCOUNT_ID.fullmatch(account_id)
                or not isinstance(issuer, str) or not issuer or not isinstance(sub, str) or not sub):
            raise HubError("invalid_identity_link", 400)
        with self.transaction() as db:
            if db.execute("SELECT 1 FROM identities WHERE account_id=?", (account_id,)).fetchone() is None:
                raise HubError("account_not_found", 404)
            current = self.lookup_account(db, issuer, sub)
            if current == account_id:
                return {"account_id": account_id, "issuer": issuer, "sub": sub, "linked": False, "absorbed": False}
            if current is None:
                db.execute("INSERT INTO identities(issuer,sub,account_id,created_at) VALUES(?,?,?,?)",
                           (issuer, sub, account_id, self.clock()))
                return {"account_id": account_id, "issuer": issuer, "sub": sub, "linked": True, "absorbed": False}
            in_use = (db.execute("SELECT COUNT(*) FROM identities WHERE account_id=?", (current,)).fetchone()[0] > 1
                      or any(db.execute(f"SELECT 1 FROM {table} WHERE account_id=?", (current,)).fetchone()
                             for table in ("members", "devices", "enrollments"))
                      or db.execute("SELECT 1 FROM invites WHERE consumed_by=?", (current,)).fetchone())
            if in_use:
                raise HubError("identity_already_linked", 409)
            db.execute("UPDATE browser_sessions SET invalidated=1 WHERE account_id=?", (current,))
            db.execute("UPDATE identities SET account_id=? WHERE issuer=? AND sub=?", (account_id, issuer, sub))
            return {"account_id": account_id, "issuer": issuer, "sub": sub, "linked": True, "absorbed": True}

    @staticmethod
    def require_account_member(db, account_id):
        row = db.execute("SELECT status FROM members WHERE account_id=?", (account_id,)).fetchone()
        if account_id is None or row is None or row[0] != "active":
            raise HubError("membership_required", 403)

    @classmethod
    def require_member(cls, db, identity):
        cls.require_account_member(db, cls.lookup_account(db, identity.issuer, identity.sub))

    def set_member(self, identity, status="active"):
        if status not in ("active", "disabled"):
            raise ValueError("invalid_member_status")
        with self.transaction() as db:
            account = self.ensure_account_row(db, identity.issuer, identity.sub)
            db.execute("INSERT INTO members(account_id,status) VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET status=excluded.status",
                       (account, status))
            if status == "disabled":
                self.invalidate_account_sessions(account, db=db)

    def invalidate_account_sessions(self, account_id, db=None):
        if db is None:
            with self.transaction() as own:
                return self.invalidate_account_sessions(account_id, db=own)
        return db.execute("UPDATE browser_sessions SET invalidated=1 WHERE account_id=? AND invalidated=0",
                          (account_id,)).rowcount

    def invalidate_sessions(self, issuer, sub, db=None):
        """Invalidate every live browser session of one member in one statement; returns the count."""
        if db is None:
            with self.transaction() as own:
                return self.invalidate_sessions(issuer, sub, db=own)
        account = self.lookup_account(db, issuer, sub)
        return 0 if account is None else self.invalidate_account_sessions(account, db=db)

    def mark_logout(self, identity):
        """Invalidate the member's browser sessions and stamp the logout; never creates a member row."""
        with self.transaction() as db:
            account = self.lookup_account(db, identity.issuer, identity.sub)
            if account is None:
                return 0
            db.execute("UPDATE members SET last_logout_at=? WHERE account_id=?", (self.clock(), account))
            return self.invalidate_account_sessions(account, db=db)

    def member_status(self, identity):
        with self.transaction() as db:
            row = db.execute("SELECT m.status FROM members m JOIN identities i ON i.account_id=m.account_id "
                             "WHERE i.issuer=? AND i.sub=?", (identity.issuer, identity.sub)).fetchone()
        return row[0] if row else "inactive"

    def devices_of(self, identity, limit=20):
        with self.transaction() as db:
            return [dict(row) for row in db.execute(
                "SELECT d.* FROM devices d JOIN identities i ON i.account_id=d.account_id "
                "WHERE i.issuer=? AND i.sub=? ORDER BY d.generation DESC LIMIT ?",
                (identity.issuer, identity.sub, limit))]

    def create_invitation(self):
        token = secrets.token_urlsafe(32)
        with self.transaction() as db:
            db.execute("INSERT INTO invites VALUES(?,?,NULL)", (token_hash(token), self.clock() + 86400))
        return token

    def activate(self, identity, invite):
        with self.transaction() as db:
            account = self.ensure_account_row(db, identity.issuer, identity.sub)
            # A disabled member stays disabled; raising here rolls back, so the invite is not consumed
            # (and a login-only account row created above is rolled back with it).
            current = db.execute("SELECT status FROM members WHERE account_id=?", (account,)).fetchone()
            if current is not None and current[0] == "disabled":
                raise HubError("member_disabled", 403)
            updated = db.execute("UPDATE invites SET consumed_by=? WHERE token_hash=? AND consumed_by IS NULL AND expires>?",
                                 (account, token_hash(invite), self.clock()))
            if updated.rowcount != 1:
                raise HubError("invalid_invitation", 400)
            db.execute("INSERT INTO members(account_id,status) VALUES(?,'active') ON CONFLICT(account_id) DO UPDATE SET status='active'",
                       (account,))

    def own_device(self, identity, device_id=None):
        with self.transaction() as db:
            account = self.lookup_account(db, identity.issuer, identity.sub)
            if account is None:
                return None
            sql = "SELECT * FROM devices WHERE account_id=?"
            args = [account]
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
            account = self.lookup_account(db, identity.issuer, identity.sub)
            db.execute("INSERT INTO enrollments(challenge_id,account_id,installation_id,public_key,key_fingerprint,name,payload,expires,operation,expected_credential_revision,device_id,generation) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                       (values["challenge_id"], account, values["installation_id"],
                        values["public_key"], values["key_fingerprint"], values["name"], values["payload"],
                        values["expires_at"], values["operation"], values.get("expected_credential_revision"),
                        values.get("device_id"), values.get("generation")))

    def challenge(self, identity, challenge_id):
        with self.transaction() as db:
            self.require_member(db, identity)
            row = db.execute("SELECT * FROM enrollments WHERE challenge_id=? AND account_id=?",
                             (challenge_id, self.lookup_account(db, identity.issuer, identity.sub))).fetchone()
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
            challenge = db.execute("SELECT * FROM enrollments WHERE challenge_id=? AND account_id=?",
                                   (challenge_id, self.lookup_account(db, identity.issuer, identity.sub))).fetchone()
            if challenge is None:
                raise HubError("enrollment_not_found", 404)
            self._unconsumed(challenge, db)
            if challenge["operation"] != "bind":
                raise HubError("invalid_enrollment_operation", 400)
            account = challenge["account_id"]
            if db.execute("SELECT 1 FROM devices WHERE account_id=? AND state!='revoked'", (account,)).fetchone():
                raise HubError("device_already_bound", 409)
            used = {row[0] for row in db.execute("SELECT http_port FROM devices WHERE http_port IS NOT NULL UNION SELECT ws_port FROM devices WHERE ws_port IS NOT NULL")}
            ports = [port for port in range(self.port_start, self.port_end + 1) if port not in used][:2]
            if len(ports) != 2:
                raise HubError("port_pool_exhausted", 503)
            device_id = secrets.token_hex(12)
            generation = 1 + db.execute("SELECT COALESCE(MAX(generation),0) FROM devices WHERE account_id=?",
                                        (account,)).fetchone()[0]
            db.execute("INSERT INTO devices(device_id,account_id,installation_id,key_fingerprint,public_key,name,generation,state,http_port,ws_port,proxy_secret,created_at) VALUES(?,?,?,?,?,?,?,'pending',?,?,?,?)",
                       (device_id, account, challenge["installation_id"], challenge["key_fingerprint"],
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
            changed = db.execute("UPDATE devices SET control_token_hash=?,credential_revision=1 WHERE device_id=? AND account_id=? AND state='provisioned' AND credential_revision=0",
                                 (token_hash(token), device_id, self.lookup_account(db, identity.issuer, identity.sub)))
            if changed.rowcount != 1:
                raise HubError("credential_revision_conflict", 409)
        return token

    def consume_and_rotate_credential_cas(self, identity, challenge_id):
        token = secrets.token_urlsafe(32)
        conflict = False
        with self.transaction() as db:
            self.require_member(db, identity)
            challenge = db.execute("SELECT * FROM enrollments WHERE challenge_id=? AND account_id=?",
                                   (challenge_id, self.lookup_account(db, identity.issuer, identity.sub))).fetchone()
            if challenge is None:
                raise HubError("enrollment_not_found", 404)
            self._unconsumed(challenge, db)
            if challenge["operation"] != "recover":
                raise HubError("invalid_enrollment_operation", 400)
            device = db.execute("SELECT * FROM devices WHERE device_id=?", (challenge["device_id"],)).fetchone()
            if (device is None or device["account_id"] != challenge["account_id"]
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
            changed = db.execute("UPDATE devices SET state=?,last_heartbeat=?,os_name=COALESCE(?,os_name),os_version=COALESCE(?,os_version),app_version=COALESCE(?,app_version) WHERE device_id=? AND control_token_hash=? AND generation=? AND http_port=? AND ws_port=? AND state IN ('provisioned','online','offline') AND EXISTS(SELECT 1 FROM members WHERE members.account_id=devices.account_id AND members.status='active')",
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
