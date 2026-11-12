"""Persist GitHub changes before delivering them through the existing Feishu bot."""
import argparse
from contextlib import closing
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
import uuid

from control_everything.integrations.progress_feishu import NotSent

SHANGHAI = timezone(timedelta(hours=8))


def split_message(message):
    return [message[offset:offset + 8000] for offset in range(0, len(message), 8000)]


def _database(directory):
    directory = Path(directory)
    if not directory.is_absolute() or any(path.is_symlink() for path in (directory, *directory.parents)):
        raise ValueError('absolute_unlinked_state_required')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = directory / 'progress.sqlite3'
    if path.is_symlink():
        raise ValueError('linked_database_refused')
    database = sqlite3.connect(path, timeout=60)
    path.chmod(0o600)
    database.execute('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    database.execute('CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY, identity TEXT UNIQUE NOT NULL, '
                     'body TEXT NOT NULL, uuid TEXT NOT NULL, status TEXT NOT NULL, attempted_at REAL, '
                     'last_attempt REAL, message_id TEXT, error TEXT)')
    database.commit()
    return database


def _queue(database, identity, body):
    if database.execute('SELECT 1 FROM outbox WHERE identity=?', (identity + ':0',)).fetchone():
        return
    for index, part in enumerate(split_message(body)):
        database.execute('INSERT OR IGNORE INTO outbox(identity,body,uuid,status) VALUES(?,?,?,?)',
                         (identity + ':' + str(index), part, str(uuid.uuid4()), 'pending'))


def _deliver(database, send, clock):
    sent = 0
    ids = [row[0] for row in database.execute("SELECT id FROM outbox WHERE status!='sent' ORDER BY id")]
    for identity in ids:
        timestamp = clock()
        database.execute('BEGIN IMMEDIATE')
        row = database.execute('SELECT body,uuid,status,attempted_at,last_attempt FROM outbox WHERE id=?',
                               (identity,)).fetchone()
        body, delivery_uuid, status, first, last = row
        # Feishu only deduplicates a UUID for one hour. Keep a margin and never restart that clock.
        if (status == 'sent' or last is not None and timestamp - last < 120
                or first is not None and timestamp - first > 3300):
            database.commit()
            continue
        database.execute("UPDATE outbox SET status='attempt',attempted_at=?,last_attempt=? WHERE id=?",
                         (first if first is not None else timestamp, timestamp, identity))
        database.commit()
        try:
            message_id = send(body, delivery_uuid, deadline=(first if first is not None else timestamp) + 3300)
            if not isinstance(message_id, str) or not re.fullmatch(r'om_[A-Za-z0-9]+', message_id):
                raise ValueError('message_receipt_invalid')
            database.execute("UPDATE outbox SET status='sent',message_id=?,error=NULL WHERE id=? AND status!='sent'",
                             (message_id, identity))
            sent += 1
        except NotSent as error:
            database.execute("UPDATE outbox SET status=?,attempted_at=?,error=? WHERE id=? AND last_attempt=? AND status!='sent'",
                             ('pending' if first is None else 'unknown', first, type(error).__name__, identity, timestamp))
        except (OSError, ValueError, KeyError, TypeError) as error:
            database.execute("UPDATE outbox SET status='unknown',error=? WHERE id=? AND last_attempt=? AND status!='sent'",
                             (type(error).__name__, identity, timestamp))
        database.commit()
    counts = dict(database.execute('SELECT status,count(*) FROM outbox GROUP BY status'))
    return {'sent': sent, 'pending': counts.get('pending', 0),
            'unknown': counts.get('unknown', 0) + counts.get('attempt', 0)}


def run(config, action, *, collect, send, now=None):
    from control_everything.integrations.progress_report import changes, daily

    started = time.monotonic()
    now = now or datetime.now(SHANGHAI)
    if now.tzinfo is None:
        raise ValueError('timezone_required')
    now = now.astimezone(SHANGHAI)
    if action not in ('preview', 'poll', 'startup', 'status'):
        raise ValueError('unknown_monitor_action')
    if action == 'preview':
        items = collect()
        return {'status': 'preview', 'items': len(items), 'message': daily(items, now)}
    identity = json.dumps([config[key] for key in ('repository', 'project_owner', 'project_number', 'route_identity')])
    with closing(_database(config['state_dir'])) as database:
        database.execute('BEGIN IMMEDIATE')
        metadata = dict(database.execute('SELECT key,value FROM metadata'))
        if metadata.get('identity', identity) != identity:
            raise ValueError('monitor_identity_changed')
        if action == 'status':
            database.commit()
            return {'status': 'status', 'deliveries': dict(database.execute('SELECT status,count(*) FROM outbox GROUP BY status'))}
        items = collect()
        previous = json.loads(metadata['snapshot']) if 'snapshot' in metadata else None
        revision = int(metadata.get('revision', '0')) + 1
        if previous is not None:
            events = changes(previous, items, now)
            if events:
                body = '项目进度变化 · ' + now.strftime('%Y-%m-%d %H:%M') + '\n\n' + '\n\n'.join(events)
                _queue(database, 'changes:' + str(revision), body)
        if action == 'startup':
            _queue(database, 'startup', '自动播报已启用\n每5分钟检查关键变化；北京时间18:30发送按人日报。\n'
                   '以下是当前快照，不回放历史完成通知。\n\n' + daily(items, now))
        date = now.date().isoformat()
        last_daily = metadata.get('last_daily', '')
        if (now.hour, now.minute) >= (18, 30) and last_daily != date:
            if action != 'startup':
                _queue(database, 'daily:' + date, daily(items, now))
            last_daily = date
        database.executemany('INSERT OR REPLACE INTO metadata VALUES(?,?)',
                             [('identity', identity), ('snapshot', json.dumps(items, ensure_ascii=False)),
                              ('revision', str(revision)), ('last_collected_at', now.isoformat()),
                              ('last_daily', last_daily)])
        database.commit()
        result = _deliver(database, send, lambda: now.timestamp() + time.monotonic() - started)
        return {'status': 'baseline' if previous is None else 'observed', 'items': len(items), **result}


def settings(config):
    route = json.loads(Path(config['route_config']).read_text(encoding='utf-8-sig'))
    profile = json.loads(Path(config['openclaw_profile']).read_text(encoding='utf-8-sig'))
    feishu = profile['channels']['feishu']
    account = feishu['accounts'][route['account']]
    if (route['repository'] != config['repository'] or route['target'] not in feishu['groups']
            or account.get('enabled') is not True or account['appId'] != route['sender_app_id']):
        raise ValueError('fixed_route_mismatch')
    config = dict(config)
    config['route_identity'] = hashlib.sha256(json.dumps(
        [route['account'], route['target'], account['appId']]).encode()).hexdigest()
    return config, route, account


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('preview', 'poll', 'startup', 'status'))
    parser.add_argument('--config', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        from control_everything.integrations.github_progress import collect
        from control_everything.integrations.progress_feishu import FeishuSender

        config, route, account = settings(json.loads(args.config.read_text(encoding='utf-8-sig')))
        # Credentials stay in memory and are never part of the state or output.
        values = dict(line.strip().split('=', 1) for line in Path(config['github_env_file']).read_text().splitlines()
                      if line.strip() and not line.lstrip().startswith('#') and '=' in line)
        token = values['GITHUB_TOKEN'].strip().strip('\"\'')
        if not token:
            raise ValueError('github_token_required')
        reader = lambda: collect(token, config['repository'], config['project_owner'], config['project_number'])
        result = run(config, args.action, collect=reader,
                     send=FeishuSender(account['appId'], account['appSecret'], route['target']))
        print(json.dumps(result, ensure_ascii=False))
        return 1 if result.get('pending') or result.get('unknown') else 0
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error) as error:
        print('progress_monitor_failed:' + type(error).__name__, file=sys.stderr)
        return 1


if __name__ == '__main__':
    os.umask(0o077)
    raise SystemExit(main())
