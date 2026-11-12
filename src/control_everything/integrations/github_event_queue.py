"""Authenticate repository webhooks and durably queue their bounded announcements."""
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import hashlib
import hmac
import json
import re
import time
import uuid

from control_everything.integrations.github_event_messages import render_event
from control_everything.integrations.progress_notifications import _database, _deliver, _queue


def _verify_signature(secret, body, signature):
    if not isinstance(signature, str) or not re.fullmatch(r'sha256=[0-9a-f]{64}', signature):
        raise PermissionError('signature_required')
    expected = 'sha256=' + hmac.new(secret, body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise PermissionError('signature_mismatch')


@contextmanager
def _ledger(config):
    if (not isinstance(config['repository'], str) or not config['repository']
            or type(config['repository_id']) is not int or config['repository_id'] < 1
            or not isinstance(config['route_identity'], str) or not config['route_identity']):
        raise ValueError('event_configuration_invalid')
    identity = json.dumps([config[key] for key in ('repository', 'repository_id', 'route_identity')])
    with closing(_database(config['state_dir'])) as database:
        database.execute('PRAGMA busy_timeout=5000')
        database.execute('CREATE TABLE IF NOT EXISTS webhook_receipts (delivery TEXT PRIMARY KEY, '
                         'event TEXT NOT NULL, body_sha TEXT NOT NULL, outcome TEXT NOT NULL)')
        database.execute('BEGIN IMMEDIATE')
        stored = database.execute("SELECT value FROM metadata WHERE key='event_identity'").fetchone()
        if stored is not None and stored[0] != identity:
            raise ValueError('event_identity_changed')
        if stored is None:
            if (database.execute("SELECT 1 FROM metadata WHERE key='identity'").fetchone()
                    or database.execute('SELECT 1 FROM outbox LIMIT 1').fetchone()):
                raise ValueError('unowned_event_ledger')
            database.execute("INSERT INTO metadata VALUES('event_identity',?)", (identity,))
        database.commit()
        yield database


def accept_event(config, secret, delivery, event, body, signature):
    """Return only after the authenticated delivery and its messages are committed."""
    if not isinstance(secret, bytes) or len(secret) < 32:
        raise ValueError('webhook_secret_too_short')
    if not isinstance(body, bytes):
        raise ValueError('raw_body_required')
    _verify_signature(secret, body, signature)
    if (not isinstance(delivery, str)
            or not re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', delivery)
            or not isinstance(event, str) or not re.fullmatch(r'[a-z_]{1,64}', event)):
        raise ValueError('delivery_headers_invalid')
    delivery = str(uuid.UUID(delivery))
    payload = json.loads(body)
    repository = payload.get('repository') if isinstance(payload, dict) else None
    if (not isinstance(repository, dict) or repository.get('full_name') != config['repository']
            or type(repository.get('id')) is not int or repository['id'] != config['repository_id']):
        raise ValueError('fixed_repository_mismatch')
    body_sha = hashlib.sha256(body).hexdigest()
    with _ledger(config) as database:
        database.execute('BEGIN IMMEDIATE')
        previous = database.execute('SELECT event,body_sha FROM webhook_receipts WHERE delivery=?',
                                    (delivery,)).fetchone()
        if previous is not None:
            if previous != (event, body_sha):
                raise ValueError('delivery_payload_changed')
            database.commit()
            return {'status': 'duplicate', 'delivery': delivery}
        message = None if event == 'ping' else render_event(event, payload, config['repository'],
            received_at=datetime.now(timezone.utc), delivery=delivery)
        if message is not None and (not isinstance(message, str) or not message.strip()):
            raise ValueError('event_message_invalid')
        outcome = 'ping' if event == 'ping' else 'accepted' if message is not None else 'ignored'
        if message is not None:
            _queue(database, 'github:' + delivery, message)
        database.execute('INSERT INTO webhook_receipts VALUES(?,?,?,?)', (delivery, event, body_sha, outcome))
        database.commit()
    return {'status': outcome, 'delivery': delivery}


def drain(config, send, *, clock=time.time):
    """Send only previously received events; never fetch or synthesize GitHub activity."""
    with _ledger(config) as database:
        return _deliver(database, send, clock)


def retry_delay(config, now):
    """Find the next local delivery retry, or sleep until another webhook arrives."""
    delays = []
    with _ledger(config) as database:
        for status, first, last in database.execute(
                "SELECT status,attempted_at,last_attempt FROM outbox WHERE status!='sent'"):
            if status == 'pending' and first is None:
                delays.append(max(0, last + 120 - now) if last is not None else 0)
            elif first is not None:
                due = max(now, (last if last is not None else first) + 120)
                if due < first + 3300:
                    delays.append(due - now)
    return min(delays) if delays else None
