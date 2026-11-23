"""Poll authenticated transport receipts without granting send permission."""
import re
import sqlite3
from datetime import datetime, timezone
from control_everything.workspace.store import WorkspaceError


class AutomationIdentityReceipts:
    def __init__(self, store, service, connector):
        self.store, self.service, self.connector = store, service, connector
        self._scope, self._cursor = None, ('', '')

    def drain(self, stop_event):
        result = {'attached': 0, 'waiting': 0, 'invalid': 0, 'error': 0}
        try:
            binding = dict(self.connector.current_binding() or {})
            scope = tuple(binding.get(k) for k in ('hub_origin', 'device_id', 'generation'))
            if stop_event.is_set() or not all(scope):
                return result
            if scope != self._scope:
                self._scope, self._cursor = scope, ('', '')
            with self.store.connection() as db:
                row = db.execute('''SELECT * FROM automation_identity_challenges
                    WHERE hub_origin=? AND device_id=? AND generation=?
                    AND state='awaiting_message' AND expires_at>?
                    AND (created_at,id)>(?,?) ORDER BY created_at,id LIMIT 1''',
                    (*scope, datetime.now(timezone.utc).isoformat(), *self._cursor)).fetchone()
                row = dict(row) if row else None
            if row is None:
                self._cursor = ('', '')
                return result
            self._cursor = (row['created_at'], row['id'])
            if stop_event.is_set() or binding != dict(self.connector.current_binding() or {}):
                return result
            try:
                status = self.connector.identity_send_status(row['id'])
            except Exception as error:
                # Hub 404 means the challenge was never registered. Do not send or treat it as a tunnel fault.
                if getattr(error, 'status', None) == 404 and getattr(error, 'code', None) == 'not_found':
                    result['waiting'] += 1
                else:
                    result['error'] += 1
                return result
            if stop_event.is_set() or binding != dict(self.connector.current_binding() or {}):
                return result
            fields = {'attempt_id','challenge_id','state','expires_at','context','message_id'}
            context = {k: row['account_id' if k == 'channel_account_id' else k]
                       for k in ('producer_id','project_id','channel_account_id','app_id','chat_id','device_id','generation')}
            if (type(status) is not dict or set(status) != fields
                    or type(status['attempt_id']) is not str
                    or not re.fullmatch('[a-f0-9]{32}', status['attempt_id'])
                    or status['challenge_id'] != row['id'] or status['expires_at'] != row['expires_at']
                    or type(status['context']) is not dict or status['context'] != context
                    or type(status['context'].get('generation')) is not int
                    or status['state'] not in ('queued','sending','unknown','sent','expired')):
                result['invalid'] += 1
                return result
            if status['state'] != 'sent':
                result['waiting' if status['message_id'] is None else 'invalid'] += 1
                return result
            message_id = status['message_id']
            if (type(message_id) is not str or not message_id or len(message_id) > 256
                    or any(ord(char) < 32 for char in message_id)):
                result['invalid'] += 1
                return result
            self.service.attach_message(row['project_id'], row['id'], status['message_id'])
            result['attached'] += 1
        except ValueError:
            result['invalid'] += 1
        except (sqlite3.Error, WorkspaceError, OSError):
            result['error'] += 1
        return result
