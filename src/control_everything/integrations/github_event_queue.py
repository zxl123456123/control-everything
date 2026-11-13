"""Authenticate repository webhooks and durably queue their bounded announcements."""
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import hashlib
import hmac
import json
import re
import sys
import time
import uuid

from control_everything.integrations.github_event_messages import _sha, render_event
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
        database.execute('CREATE TABLE IF NOT EXISTS push_reviews (uuid TEXT PRIMARY KEY, before_sha TEXT NOT NULL, '
                         'after_sha TEXT NOT NULL, prepared INTEGER NOT NULL DEFAULT 0)')
        database.execute('CREATE TABLE IF NOT EXISTS pr_reviews (uuid TEXT PRIMARY KEY, number INTEGER NOT NULL, '
                         'base_sha TEXT NOT NULL, head_sha TEXT NOT NULL, context TEXT NOT NULL, '
                         'prepared INTEGER NOT NULL DEFAULT 0, UNIQUE(number,base_sha,head_sha))')
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
            if config.get('ai_review'):
                delivery_uuid = database.execute('SELECT uuid FROM outbox WHERE identity=?', ('github:' + delivery + ':0',)).fetchone()[0]
                if event == 'push' and not payload.get('deleted'):
                    database.execute('INSERT INTO push_reviews(uuid,before_sha,after_sha) VALUES(?,?,?)',
                                     (delivery_uuid, payload['before'], payload['after']))
                elif event == 'pull_request' and not payload['pull_request'].get('draft', False) and (payload['action'] in
                        ('opened', 'synchronize', 'reopened', 'ready_for_review') or
                        payload['action'] == 'edited' and 'base' in payload.get('changes', {})):
                    pr = payload['pull_request']
                    base, head = _sha(pr['base']['sha']), _sha(pr['head']['sha'])
                    description = pr.get('body') or ''
                    if not isinstance(description, str):
                        raise ValueError('review_pr_description_invalid')
                    context = {'version': 1, 'number': pr['number'], 'title': pr['title'][:200],
                               'description': description[:800]}
                    database.execute('INSERT OR IGNORE INTO pr_reviews(uuid,number,base_sha,head_sha,context) '
                                     'VALUES(?,?,?,?,?)', (delivery_uuid, pr['number'], base, head, json.dumps(context)))
        database.execute('INSERT INTO webhook_receipts VALUES(?,?,?,?)', (delivery, event, body_sha, outcome))
        database.commit()
    return {'status': outcome, 'delivery': delivery}


def drain(config, send, *, clock=time.time, review=None, review_pr=None):
    """Send only previously received events; never fetch or synthesize GitHub activity."""
    with _ledger(config) as database:
        def prepared_send(body, delivery_uuid, *, deadline=None):
            row = database.execute('SELECT before_sha,after_sha,prepared FROM push_reviews WHERE uuid=?', (delivery_uuid,)).fetchone()
            table = 'push_reviews'
            if row is None:
                table = 'pr_reviews'
                row = database.execute('SELECT base_sha,head_sha,prepared,context FROM pr_reviews WHERE uuid=?', (delivery_uuid,)).fetchone()
            if row and not row[2]:
                # Freeze a fallback before external calls. A crash cannot cause a new model answer on retry.
                version = f'评审版本：{row[1][:8]}\n' if table == 'pr_reviews' else ''
                fallback = body + '\n' + version + 'AI 分析暂不可用。'
                database.execute(f'UPDATE {table} SET prepared=1 WHERE uuid=?', (delivery_uuid,))
                database.execute('UPDATE outbox SET body=? WHERE uuid=?', (fallback, delivery_uuid))
                database.commit()
                try:
                    if table == 'pr_reviews':
                        analysis = review_pr(row[0], row[1], json.loads(row[3])) if review_pr else None
                    else:
                        analysis = review(row[0], row[1]) if review else None
                    if not isinstance(analysis, str) or not analysis.strip():
                        raise ValueError('review_unavailable')
                    # Keep event metadata and link, replacing the raw commit list with the analysis.
                    prefix = body.split('\n提交总结：', 1)[0] + '\n' if '\n提交总结：' in body else body.rsplit('查看：', 1)[0]
                    body = prefix + version + analysis + '\n查看：' + body.rsplit('查看：', 1)[-1]
                    database.execute('UPDATE outbox SET body=? WHERE uuid=?', (body, delivery_uuid))
                    database.commit()
                except (OSError, ValueError, KeyError, TypeError) as error:
                    print(('pr_review_unavailable:' if table == 'pr_reviews' else 'push_review_unavailable:') + type(error).__name__, file=sys.stderr, flush=True)
                    body = fallback
            return send(body, delivery_uuid, deadline=deadline)
        return _deliver(database, prepared_send, clock)


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
