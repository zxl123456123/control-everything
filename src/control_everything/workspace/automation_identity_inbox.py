"""Replay durable identity receipts without interpreting transport acknowledgements."""
import json
import sqlite3
from control_everything.workspace.store import WorkspaceError


class AutomationIdentityInbox:
    def __init__(self, store, service, current_binding):
        self.store, self.service, self.current_binding = store, service, current_binding
        self._scope = None
        self._cursor = ('', '')

    def drain(self, stop_event):
        result = {'processed': 0, 'invalid': 0, 'error': 0}
        binding = dict(self.current_binding() or {})
        scope = tuple(binding.get(k) for k in ('hub_origin', 'device_id', 'generation'))
        if stop_event.is_set() or not all(scope):
            return result
        if scope != self._scope:
            self._scope, self._cursor = scope, ('', '')
        try:
            with self.store.connection() as db:
                rows = db.execute('''SELECT i.* FROM automation_remote_inbox i
                    WHERE i.hub_origin=? AND i.device_id=? AND i.generation=?
                    AND (i.received_at,i.message_id) > (?,?)
                    AND NOT EXISTS (SELECT 1 FROM automation_identity_candidates c
                        JOIN automation_identity_challenges h ON h.id=c.challenge_id
                        WHERE h.hub_origin=i.hub_origin AND h.device_id=i.device_id
                        AND h.generation=i.generation AND c.inbox_message_id=i.message_id)
                    ORDER BY i.received_at,i.message_id LIMIT 32''', (*scope, *self._cursor)).fetchall()
            for row in rows:
                if stop_event.is_set() or binding != dict(self.current_binding() or {}):
                    break
                try:
                    payload = json.loads(row['payload_json'])
                    fields = {'kind','project_id','producer_id','channel_account_id','app_id','chat_id','message_id','actor_open_id','binding'}
                    if type(payload) is not dict or set(payload) != fields or payload['kind'] != 'feishu_identity_binding':
                        raise ValueError('identity_payload_invalid')
                    action = payload['binding']
                    if (type(action) is not dict or set(action) != {'namespace','challenge_id','nonce'}
                            or action['namespace'] != 'control-everything.identity.v1'
                            or any(type(v) is not str or not v for v in action.values())
                            or any(type(payload[k]) is not str or not payload[k] for k in fields - {'binding'})):
                        raise ValueError('identity_payload_invalid')
                    envelope = {k: payload[k] for k in ('producer_id','channel_account_id','app_id','chat_id','message_id','actor_open_id')}
                    envelope.update(nonce=action['nonce'],event_id=row['event_id'],inbox_message_id=row['message_id'])
                    self.service.receive_candidate(payload['project_id'], action['challenge_id'], envelope)
                    result['processed'] += 1
                except ValueError:
                    result['invalid'] += 1
                self._cursor = (row['received_at'], row['message_id'])
            if len(rows) < 32:
                self._cursor = ('', '')
        except (sqlite3.Error, WorkspaceError):
            result['error'] += 1
        return result
