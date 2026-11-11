"""Send verified release announcements through a fixed, privately configured OpenClaw account."""
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        raise ValueError('github_redirect_refused')


def github_get(repository, path):
    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'session-panel-release-notify'}
    if os.environ.get('GH_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['GH_TOKEN']
    request = Request(f'https://api.github.com/repos/{repository}/{path}', headers=headers)
    with build_opener(NoRedirect()).open(request, timeout=30) as response:
        return json.load(response)


def verified_event(config, event, message, get):
    repository, target = config['repository'], config['target']
    require(isinstance(repository, str) and re.fullmatch(r'[\w-]+/[\w.-]+', repository, re.ASCII)
            and repository.split('/')[1] not in ('.', '..'), 'repository_invalid')
    require(isinstance(target, str) and re.fullmatch(r'oc_[A-Za-z0-9]+', target), 'fixed_group_required')
    require(isinstance(config['account'], str) and config['account'].strip(), 'account_required')
    require(isinstance(config['openclaw_command'], list) and config['openclaw_command']
            and all(isinstance(arg, str) and arg for arg in config['openclaw_command']), 'command_required')
    require(type(event['schema']) is int and event['schema'] == 1
            and event['status'] == 'published-verified' and event['repository'] == repository, 'event_identity')
    require(type(event['release_id']) is int and event['release_id'] > 0
            and re.fullmatch(r'[0-9a-f]{40}', event['commit'])
            and re.fullmatch(r'[A-Za-z0-9._-]+', event['tag']), 'release_identity')
    url = f"https://github.com/{repository}/releases/tag/{quote(event['tag'], safe='')}"
    require(event['release_url'] == url and 0 < len(message) <= 2000 and url in message, 'announcement_invalid')
    remote = get(repository, f"releases/{event['release_id']}")
    require(remote['id'] == event['release_id'] and remote['draft'] is False
            and remote['tag_name'] == event['tag'] and remote['html_url'] == url, 'release_not_published')
    ref = get(repository, 'git/ref/tags/' + quote(event['tag'], safe=''))['object']
    for _ in range(8):
        if ref['type'] != 'tag':
            break
        require(re.fullmatch(r'[0-9a-f]{40}', ref['sha']), 'tag_identity')
        ref = get(repository, 'git/tags/' + ref['sha'])['object']
    require(ref['type'] == 'commit' and ref['sha'] == event['commit'], 'tag_commit_mismatch')
    actual = []
    for page in range(1, 101):
        rows = get(repository, f"releases/{event['release_id']}/assets?per_page=100&page={page}")
        require(isinstance(rows, list), 'assets_response_invalid')
        actual.extend(rows)
        if len(rows) < 100:
            break
    else:
        raise ValueError('assets_pagination_limit')
    expected = event['assets']
    require(isinstance(expected, list) and expected and len({row['name'] for row in expected}) == len(expected),
            'event_assets_required')
    require(all(type(row['size']) is int and row['size'] >= 0
                and re.fullmatch(r'[0-9a-f]{64}', row['sha256']) for row in expected), 'event_asset_identity')
    require(all(row['state'] == 'uploaded' for row in actual), 'assets_not_uploaded')
    require(sorted((row['name'], row['size'], row.get('digest') or '') for row in actual)
            == sorted((row['name'], row['size'], 'sha256:' + row['sha256']) for row in expected), 'assets_mismatch')


def cli_result(config, action, message, message_id, run):
    argv = [*config['openclaw_command'], 'message', action, '--channel', 'feishu',
            '--account', config['account'], '--target', 'chat:' + config['target'], '--json']
    argv += ['--message', message] if action == 'send' else ['--message-id', message_id]
    process = run(argv, stdin=subprocess.DEVNULL, capture_output=True, text=True,
                  encoding='utf-8', timeout=60, shell=False)
    result = json.loads(process.stdout)
    require(isinstance(result, dict), 'cli_response_invalid')
    return process.returncode, result


def sent_id(config, result):
    require(result.get('action') == 'send' and result.get('channel') == 'feishu'
            and result.get('dryRun') is False and result.get('ok') is not False, 'send_not_confirmed')
    payload = result['payload']
    if result.get('handledBy') == 'plugin':
        require(payload.get('ok') is True and payload.get('chatId') == config['target'], 'plugin_send_not_confirmed')
        message_id = payload.get('messageId')
    elif result.get('handledBy') == 'core':
        require(payload.get('deliveryStatus') == 'sent' and payload.get('to') in
                (config['target'], 'chat:' + config['target']), 'core_send_not_confirmed')
        message_id = payload['result']['messageId']
    else:
        raise ValueError('unknown_delivery_handler')
    require(isinstance(message_id, str) and re.fullmatch(r'om_[A-Za-z0-9]+', message_id)
            and result.get('messageId') == message_id, 'message_id_not_confirmed')
    return message_id


def read_content_matches(observed, message):
    expected = message.replace('\r\n', '\n')
    content = observed['content'].replace('\r\n', '\n')
    if content == expected:
        return True
    if observed.get('contentType') != 'post':
        return False
    # OpenClaw v2026.11.2 post.ts renders links as escaped labels with exact hrefs.
    # Derive the bounded post form from the reviewed body; never strip received Markdown.
    lines = []
    for line in expected.split('\n'):
        if not line:
            continue
        if re.fullmatch(r'https://[^\s<>()\[\]\\]+', line):
            label = re.sub(r'([\\`*_{}\[\]()#+\-!|>~])', r'\\\1', line)
            line = f'[{label}]({line})'
        lines.append(line)
    return content == '\n'.join(lines)


def reconciled_id(config, result, message_id, message):
    require(result.get('action') == 'read' and result.get('channel') == 'feishu'
            and result.get('dryRun') is False and result.get('ok') is not False, 'read_not_confirmed')
    payload = result['payload']
    observed = payload['message']
    require(payload.get('ok') is True and observed['messageId'] == message_id
            and observed['chatId'] == config['target'] and observed['senderType'] == 'app'
            and config.get('sender_app_id') and observed['senderId'] == config['sender_app_id']
            and read_content_matches(observed, message), 'message_not_reconciled')
    return message_id


def execute(action, config, event, message, *, message_id=None, get=github_get, run=subprocess.run):
    require(action in ('preview', 'send', 'reconcile'), 'action_invalid')
    verified_event(config, event, message, get)
    if action == 'preview':
        return {'status': 'preview', 'release_id': event['release_id'], 'message': message}
    if action == 'reconcile':
        require(isinstance(message_id, str) and re.fullmatch(r'om_[A-Za-z0-9]+', message_id), 'message_id_required')
    state = Path(config['state_dir'])
    require(state.is_absolute() and '..' not in state.parts, 'absolute_state_directory_required')
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    identity = json.dumps([event['repository'], event['release_id'], config['target']], separators=(',', ':'))
    body_sha = hashlib.sha256(message.encode('utf-8')).hexdigest()
    event_identity = {key: event[key] for key in ('repository', 'release_id', 'tag', 'commit', 'release_url')}
    event_identity['assets'] = sorted(event['assets'], key=lambda row: row['name'])
    event_sha = hashlib.sha256(json.dumps(event_identity, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    database = state / 'notifications.sqlite3'
    with closing(sqlite3.connect(database, timeout=10)) as connection:
        database.chmod(0o600)
        connection.execute('CREATE TABLE IF NOT EXISTS deliveries (identity TEXT PRIMARY KEY, body_sha TEXT NOT NULL, status TEXT NOT NULL, receipt TEXT NOT NULL)')
        initial = {'status': 'attempt', 'release_id': event['release_id'], 'body_sha256': body_sha,
                   'event_sha256': event_sha, 'started_at': int(time.time())}
        if action == 'send':
            inserted = connection.execute('INSERT OR IGNORE INTO deliveries VALUES (?,?,?,?)',
                (identity, body_sha, 'attempt', json.dumps(initial))).rowcount == 1
        else:
            inserted = False
        row = connection.execute('SELECT body_sha,status,receipt FROM deliveries WHERE identity=?', (identity,)).fetchone()
        require(row is not None, 'no_attempt_to_reconcile')
        require(row[0] == body_sha, 'body_changed_for_delivery')
        require(json.loads(row[2])['event_sha256'] == event_sha, 'release_changed_for_delivery')
        if action == 'send' and row[1] == 'not-sent':
            previous = json.loads(row[2])
            initial['not_sent_attempts'] = [*previous.get('not_sent_attempts', []),
                {key: previous.get(key) for key in ('started_at', 'checked_at', 'error')}]
            inserted = connection.execute("UPDATE deliveries SET status='attempt',receipt=? WHERE identity=? AND status='not-sent'",
                                          (json.dumps(initial), identity)).rowcount == 1
            row = connection.execute('SELECT body_sha,status,receipt FROM deliveries WHERE identity=?', (identity,)).fetchone()
        connection.commit()
        if row[1] == 'sent' or action == 'send' and not inserted:
            return json.loads(row[2])
        outcome = {**json.loads(row[2]), 'status': 'unknown', 'checked_at': int(time.time())}
        try:
            code, result = cli_result(config, 'send' if action == 'send' else 'read', message, message_id, run)
            outcome['exit_code'] = code
            if isinstance(result.get('messageId'), str) and re.fullmatch(r'om_[A-Za-z0-9]+', result['messageId']):
                outcome['message_id'] = result['messageId']
            require(code == 0, 'cli_nonzero')
            outcome['message_id'] = sent_id(config, result) if action == 'send' else reconciled_id(config, result, message_id, message)
            outcome['status'] = 'sent'
        except (FileNotFoundError, PermissionError) as error:
            outcome['status'] = 'not-sent' if action == 'send' else 'unknown'
            outcome['error'] = type(error).__name__
        except (OSError, ValueError, KeyError, TypeError, AttributeError, subprocess.SubprocessError) as error:
            outcome['error'] = str(error) if type(error) is ValueError else type(error).__name__
        connection.execute("UPDATE deliveries SET status=?,receipt=? WHERE identity=? AND status!='sent'",
                           (outcome['status'], json.dumps(outcome, ensure_ascii=False), identity))
        connection.commit()
        return json.loads(connection.execute('SELECT receipt FROM deliveries WHERE identity=?', (identity,)).fetchone()[0])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('preview', 'send', 'reconcile'))
    for name in ('config', 'event', 'message'):
        parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--message-id')
    args = parser.parse_args(argv)
    try:
        result = execute(args.action, json.loads(args.config.read_text(encoding='utf-8-sig')),
                         json.loads(args.event.read_text(encoding='utf-8-sig')),
                         args.message.read_text(encoding='utf-8'), message_id=args.message_id)
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result['status'] in ('preview', 'sent') else 1
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error) as error:
        print('release_notify: ' + type(error).__name__, file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
