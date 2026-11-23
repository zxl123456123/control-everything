"""One-time permission to transport an identity challenge, never identity authority."""
from datetime import datetime
import json
import re
import uuid

from .identity import HubError
from .automation_producer import _text


def _fields(body, fields):
    if type(body) is not dict or set(body) != set(fields):
        raise HubError('invalid_request_fields', 400)


def _id(value):
    return isinstance(value, str) and re.fullmatch('[0-9a-f]{32}', value)


class AutomationIdentitySend:
    def __init__(self, store, mailbox, producers):
        self.store, self.mailbox, self.producers = store, mailbox, producers

    def _config(self, producer_id):
        config = self.producers.configuration(producer_id)
        fingerprint = config.pop('token_sha256')
        return config, fingerprint, json.dumps(config, sort_keys=True, separators=(',', ':'))

    def _active(self, db, context):
        device = db.execute("SELECT * FROM devices WHERE device_id=? AND generation=? "
                            "AND state IN ('provisioned','online','offline')",
                            (context['device_id'], context['generation'])).fetchone()
        if device is None:
            raise HubError('identity_send_target_unavailable', 409)
        self.store.require_account_member(db, device['account_id'])

    def _status(self, row):
        state = row['state']
        if row['expires_epoch'] <= self.store.clock():
            state = {'queued': 'expired', 'sending': 'unknown'}.get(state, state)
        return dict(attempt_id=row['attempt_id'], challenge_id=row['challenge_id'], state=state,
                    expires_at=row['expires_at'], context=json.loads(row['context_json']),
                    message_id=row['message_id'] if state == 'sent' else None)

    def register(self, token, body):
        _fields(body, ('producer_id', 'challenge_id', 'nonce', 'expires_at', 'expected_context'))
        if not _text(body['producer_id']) or not _id(body['challenge_id']) or not _text(body['nonce']):
            raise HubError('invalid_request_fields', 400)
        with self.store.transaction() as db:
            device = self.mailbox._control(db, token)
            context, fingerprint, encoded = self._config(body['producer_id'])
            expected = body['expected_context']
            if (type(expected) is not dict or set(expected) != set(context)
                    or any(type(expected[k]) is not type(context[k]) or expected[k] != context[k] for k in context)):
                raise HubError('identity_send_context_changed', 409)
            if (context['device_id'], context['generation']) != (device['device_id'], device['generation']):
                raise HubError('identity_send_target_forbidden', 403)
            row = db.execute('SELECT * FROM automation_identity_send WHERE device_id=? AND generation=? AND challenge_id=?',
                             (device['device_id'], device['generation'], body['challenge_id'])).fetchone()
            if row:
                if (row['nonce'], row['expires_at'], row['producer_id'], row['context_json'], row['token_sha256']) != (
                        body['nonce'], body['expires_at'], body['producer_id'], encoded, fingerprint):
                    raise HubError('identity_send_conflict', 409)
                return self._status(row)
            try:
                expires = datetime.fromisoformat(body['expires_at'])
                if expires.tzinfo is None:
                    raise ValueError()
                epoch = expires.timestamp()
                if not self.store.clock() < epoch <= self.store.clock() + 600:
                    raise ValueError()
            except (TypeError, ValueError, OverflowError):
                raise HubError('invalid_identity_send_expiry', 400) from None
            attempt = uuid.uuid4().hex
            db.execute('INSERT INTO automation_identity_send VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
                       (attempt, device['device_id'], device['generation'], body['challenge_id'], body['producer_id'],
                        encoded, fingerprint, body['nonce'], body['expires_at'], epoch, 'queued', None, self.store.clock()))
            return self._status(db.execute('SELECT * FROM automation_identity_send WHERE attempt_id=?', (attempt,)).fetchone())

    def status(self, token, body):
        _fields(body, ('challenge_id',))
        if not _id(body['challenge_id']):
            raise HubError('invalid_request_fields', 400)
        with self.store.transaction() as db:
            device = self.mailbox._control(db, token)
            row = db.execute('SELECT * FROM automation_identity_send WHERE device_id=? AND generation=? AND challenge_id=?',
                             (device['device_id'], device['generation'], body['challenge_id'])).fetchone()
            if row is None:
                raise HubError('not_found', 404)
            return self._status(row)

    def claim(self, token, body):
        _fields(body, ('producer_id',))
        if not _text(body['producer_id']):
            raise HubError('invalid_request_fields', 400)
        self.producers.authenticate(body['producer_id'], token)
        context, fingerprint, encoded = self._config(body['producer_id'])
        with self.store.transaction() as db:
            self._active(db, context)
            row = db.execute("SELECT * FROM automation_identity_send WHERE producer_id=? AND context_json=? "
                             "AND token_sha256=? AND state='queued' AND expires_epoch>? ORDER BY created_at,attempt_id LIMIT 1",
                             (body['producer_id'], encoded, fingerprint, self.store.clock())).fetchone()
            if row is None:
                return {'attempt': None}
            db.execute("UPDATE automation_identity_send SET state='sending' WHERE attempt_id=? AND state='queued'", (row['attempt_id'],))
            return {'attempt': dict(attempt_id=row['attempt_id'], challenge_id=row['challenge_id'],
                                    nonce=row['nonce'], expires_at=row['expires_at'], context=context)}

    def result(self, token, body):
        if type(body) is not dict or body.get('state') not in ('sent', 'unknown'):
            raise HubError('invalid_request_fields', 400)
        _fields(body, ('producer_id', 'attempt_id', 'state', 'message_id') if body['state'] == 'sent'
                else ('producer_id', 'attempt_id', 'state'))
        if (not _text(body['producer_id']) or not _id(body['attempt_id'])
                or (body['state'] == 'sent' and not _text(body['message_id']))):
            raise HubError('invalid_request_fields', 400)
        self.producers.authenticate(body['producer_id'], token)
        context, fingerprint, encoded = self._config(body['producer_id'])
        with self.store.transaction() as db:
            self._active(db, context)
            row = db.execute('SELECT * FROM automation_identity_send WHERE attempt_id=? AND producer_id=? AND context_json=? AND token_sha256=?',
                             (body['attempt_id'], body['producer_id'], encoded, fingerprint)).fetchone()
            if row is None or row['state'] == 'queued':
                raise HubError('identity_send_permission_missing', 409)
            if row['state'] == 'sent':
                if body['state'] == 'sent' and row['message_id'] != body['message_id']:
                    raise HubError('identity_send_conflict', 409)
                return self._status(row)
            db.execute('UPDATE automation_identity_send SET state=?,message_id=? WHERE attempt_id=?',
                       (body['state'], body.get('message_id'), body['attempt_id']))
            return self._status(db.execute('SELECT * FROM automation_identity_send WHERE attempt_id=?', (body['attempt_id'],)).fetchone())
