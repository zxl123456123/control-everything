"""Persistent transport envelopes; receipt never grants authority to execute a task."""

import json
import secrets
import uuid

from .identity import HubError
from .store import token_hash


class AutomationMailbox:
    def __init__(self, store):
        self.store = store

    def receive(self, device_id, generation, source, event_id, payload):
        """For trusted ingress after source verification, never a public write endpoint."""
        if (any(not isinstance(value, str) or not value or len(value) > 256
                for value in (device_id, source, event_id))
                or type(generation) is not int or generation < 1 or type(payload) is not dict):
            raise HubError('invalid_mailbox_message', 400)
        try:
            encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)
            if len(encoded.encode('utf-8')) > 65536:
                raise ValueError('payload_too_large')
        except (TypeError, ValueError, UnicodeError, RecursionError):
            raise HubError('invalid_mailbox_message', 400) from None
        with self.store.transaction() as db:
            device = db.execute("SELECT * FROM devices WHERE device_id=? AND generation=? "
                                "AND state IN ('provisioned','online','offline')", (device_id, generation)).fetchone()
            if device is None:
                raise HubError('mailbox_target_unavailable', 409)
            self.store.require_account_member(db, device['account_id'])
            previous = db.execute('SELECT * FROM automation_inbox WHERE source=? AND event_id=?', (source, event_id)).fetchone()
            if previous:
                if (previous['device_id'], previous['generation'], previous['payload_json']) != (device_id, generation, encoded):
                    raise HubError('mailbox_event_conflict', 409)
                return {'id': previous['id'], 'state': 'acknowledged' if previous['acknowledged_at'] is not None else 'pending'}
            message_id = uuid.uuid4().hex
            db.execute('INSERT INTO automation_inbox(id,source,event_id,device_id,generation,payload_json,created_at) '
                       'VALUES(?,?,?,?,?,?,?)', (message_id, source, event_id, device_id, generation, encoded, self.store.clock()))
            return {'id': message_id, 'state': 'pending'}

    def _control(self, db, token):
        if not isinstance(token, str) or not 43 <= len(token) <= 172:
            raise HubError('invalid_control_token', 401)
        device = db.execute("SELECT * FROM devices WHERE control_token_hash=? "
                            "AND state IN ('provisioned','online','offline')", (token_hash(token),)).fetchone()
        if device is None:
            raise HubError('invalid_control_token', 401)
        self.store.require_account_member(db, device['account_id'])
        return device

    def claim(self, token):
        """Lease one envelope; a lost response can replay after the lease expires."""
        with self.store.transaction() as db:
            device = self._control(db, token)
            now = self.store.clock()
            row = db.execute('SELECT * FROM automation_inbox WHERE device_id=? AND generation=? '
                             'AND acknowledged_at IS NULL AND (lease_until IS NULL OR lease_until<=? OR lease_revision!=?) '
                             'ORDER BY created_at,id LIMIT 1',
                             (device['device_id'], device['generation'], now, device['credential_revision'])).fetchone()
            if row is None:
                return None
            lease_id, expires = secrets.token_urlsafe(32), now + 30
            db.execute('UPDATE automation_inbox SET lease_id=?,lease_until=?,lease_revision=? WHERE id=?',
                       (lease_id, expires, device['credential_revision'], row['id']))
            return {'id': row['id'], 'source': row['source'], 'event_id': row['event_id'],
                    'payload': json.loads(row['payload_json']), 'lease_id': lease_id, 'lease_expires_at': expires}

    def acknowledge(self, token, message_id, lease_id):
        """Confirm durable local receipt, not business approval or successful execution."""
        if any(not isinstance(value, str) or not value or len(value) > 128 for value in (message_id, lease_id)):
            raise HubError('invalid_mailbox_ack', 400)
        with self.store.transaction() as db:
            device = self._control(db, token)
            row = db.execute('SELECT * FROM automation_inbox WHERE id=? AND device_id=? AND generation=?',
                             (message_id, device['device_id'], device['generation'])).fetchone()
            if row is None or row['lease_id'] != lease_id or row['lease_revision'] != device['credential_revision']:
                raise HubError('mailbox_lease_changed', 409)
            if row['acknowledged_at'] is None:
                now = self.store.clock()
                if row['lease_until'] is None or row['lease_until'] <= now:
                    raise HubError('mailbox_lease_expired', 409)
                db.execute('UPDATE automation_inbox SET acknowledged_at=? WHERE id=?', (now, message_id))
            return {'id': message_id, 'state': 'acknowledged'}
