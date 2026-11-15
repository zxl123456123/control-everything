"""Durable transport receipt, without business approval or dispatch."""

import hashlib
import json
import math

from control_everything.workspace.store import now_utc


class RemoteAutomationInbox:
    def __init__(self, store):
        self.store = store

    @staticmethod
    def _binding(binding):
        if (any(type(binding.get(key)) is not str or not binding[key] or len(binding[key]) > 256
                for key in ('hub_origin', 'device_id'))
                or any(type(binding.get(key)) is not int or binding[key] < 1
                       for key in ('generation', 'credential_revision'))):
            raise ValueError('remote_mailbox_binding_invalid')
        return tuple(binding[key] for key in ('hub_origin', 'device_id', 'generation'))

    def receive(self, binding, envelope):
        identity = self._binding(binding)
        if (type(envelope) is not dict
                or any(type(envelope.get(key)) is not str or not envelope[key] or len(envelope[key]) > 256
                       for key in ('id', 'source', 'event_id', 'lease_id'))
                or type(envelope.get('payload')) is not dict
                or type(envelope.get('lease_expires_at')) not in (int, float)
                or not math.isfinite(envelope['lease_expires_at'])):
            raise ValueError('remote_mailbox_message_invalid')
        try:
            payload = json.dumps(envelope['payload'], ensure_ascii=False, sort_keys=True,
                                 separators=(',', ':'), allow_nan=False)
            raw = payload.encode('utf-8')
            if len(raw) > 65536:
                raise ValueError()
        except (TypeError, ValueError, UnicodeError, RecursionError):
            raise ValueError('remote_mailbox_message_invalid') from None
        message = (*identity, envelope['id'])
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            rows = db.execute('SELECT * FROM automation_remote_inbox WHERE '
                              '(hub_origin=? AND device_id=? AND generation=? AND message_id=?) OR '
                              '(hub_origin=? AND source=? AND event_id=?)',
                              (*message, identity[0], envelope['source'], envelope['event_id'])).fetchall()
            for row in rows:
                if (tuple(row[key] for key in ('hub_origin', 'device_id', 'generation', 'message_id')) != message
                        or row['source'] != envelope['source'] or row['event_id'] != envelope['event_id']
                        or row['payload_json'] != payload):
                    raise ValueError('remote_mailbox_conflict')
            if rows:
                db.execute("UPDATE automation_remote_inbox SET ack_credential_revision=?,lease_id=?,"
                           "lease_expires_at=?,ack_state='pending',acknowledged_at=NULL WHERE "
                           'hub_origin=? AND device_id=? AND generation=? AND message_id=?',
                           (binding['credential_revision'], envelope['lease_id'], envelope['lease_expires_at'], *message))
            else:
                db.execute('INSERT INTO automation_remote_inbox VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                           (*message, envelope['source'], envelope['event_id'], payload,
                            hashlib.sha256(raw).hexdigest(), now_utc(), 'pending_validation',
                            binding['credential_revision'], envelope['lease_id'], envelope['lease_expires_at'],
                            'pending', None))
        return {'duplicate': bool(rows), 'ack': {'message_id': envelope['id'], 'lease_id': envelope['lease_id']}}

    def pending_ack(self, binding):
        identity = self._binding(binding)
        with self.store.connection() as db:
            row = db.execute("SELECT message_id,lease_id FROM automation_remote_inbox WHERE "
                             "hub_origin=? AND device_id=? AND generation=? AND ack_credential_revision=? "
                             "AND ack_state='pending' ORDER BY received_at,message_id LIMIT 1",
                             (*identity, binding['credential_revision'])).fetchone()
            return dict(row) if row else None

    def _update(self, binding, message_id, lease_id, state):
        identity = self._binding(binding)
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('UPDATE automation_remote_inbox SET ack_state=?,acknowledged_at=? WHERE '
                       'hub_origin=? AND device_id=? AND generation=? AND message_id=? '
                       "AND ack_credential_revision=? AND lease_id=? AND ack_state='pending'",
                       (state, now_utc() if state == 'acknowledged' else None, *identity, message_id,
                        binding['credential_revision'], lease_id))

    def acknowledge(self, binding, message_id, lease_id):
        self._update(binding, message_id, lease_id, 'acknowledged')

    def expire_lease(self, binding, message_id, lease_id):
        self._update(binding, message_id, lease_id, 'lease_stale')
