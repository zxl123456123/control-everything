"""Durable automation claims; external work never runs inside these transactions."""

from dataclasses import dataclass
import json
import time
from uuid import uuid4

from control_everything.workspace import dispatch
from control_everything.workspace.native_progress import check_versions, fail, packed, row_view, task_access
from control_everything.workspace.store import now_utc

LEASE_SECONDS = 60
STEP_TRANSITIONS = {
    'reserved': ('dispatching',),
    'dispatching': ('running', 'completed', 'failed', 'unknown'),
    'running': ('completed', 'failed', 'unknown'),
    'unknown': ('running', 'completed', 'failed'),
}


@dataclass(frozen=True)
class OwnerLease:
    owner_id: str
    generation: int


class AutomationQueue:
    def __init__(self, store, *, owner_id=None, clock=time.time):
        self.store = store
        self.owner_id = owner_id or str(uuid4())
        self.clock = clock

    def acquire(self):
        with self.store.connection() as connection:
            connection.execute('BEGIN IMMEDIATE')
            current = connection.execute('SELECT * FROM automation_owner WHERE id=1').fetchone()
            now = self.clock()
            if current and current['lease_until'] > now:
                if current['owner_id'] != self.owner_id:
                    return None
                generation = current['generation']
            else:
                generation = current['generation'] + 1 if current else 1
            connection.execute('INSERT INTO automation_owner VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET '
                'owner_id=excluded.owner_id,generation=excluded.generation,lease_until=excluded.lease_until',
                (self.owner_id, generation, now + LEASE_SECONDS))
            return OwnerLease(self.owner_id, generation)

    def _guard(self, connection, lease):
        current = connection.execute('SELECT * FROM automation_owner WHERE id=1').fetchone()
        if (not current or lease.owner_id != self.owner_id or current['owner_id'] != lease.owner_id
                or current['generation'] != lease.generation or current['lease_until'] <= self.clock()):
            fail('automation_owner_lost')

    def renew(self, lease):
        with self.store.connection() as connection:
            connection.execute('BEGIN IMMEDIATE')
            self._guard(connection, lease)
            connection.execute('UPDATE automation_owner SET lease_until=? WHERE id=1',
                               (self.clock() + LEASE_SECONDS,))
            return lease

    def release(self, lease):
        with self.store.connection() as connection:
            connection.execute('BEGIN IMMEDIATE')
            self._guard(connection, lease)
            connection.execute('UPDATE automation_owner SET owner_id=NULL,generation=generation+1,lease_until=0 WHERE id=1')

    @staticmethod
    def _view(connection, flow_id):
        return {
            'flow': row_view(connection.execute('SELECT * FROM automation_flows WHERE id=?', (flow_id,)).fetchone()),
            'step': row_view(connection.execute('SELECT s.*,f.revision AS flow_revision FROM automation_steps s '
                'JOIN automation_flows f ON f.id=s.flow_id WHERE s.flow_id=? '
                'ORDER BY s.ordinal DESC LIMIT 1', (flow_id,)).fetchone()),
        }

    @staticmethod
    def _step(connection, step_id):
        return connection.execute('SELECT s.*,f.revision AS flow_revision FROM automation_steps s '
            'JOIN automation_flows f ON f.id=s.flow_id WHERE s.id=?', (step_id,)).fetchone()

    def claim(self, lease, event_id):
        with self.store.connection() as connection:
            connection.execute('BEGIN IMMEDIATE')
            self._guard(connection, lease)
            event = connection.execute('SELECT * FROM automation_events WHERE id=?', (event_id,)).fetchone()
            if event is None:
                fail('automation_event_not_found')
            if event['flow_id']:
                # Ownership changes retain the exact external operation and its uncertain state.
                connection.execute("UPDATE automation_steps SET owner_generation=? WHERE flow_id=? "
                    "AND status IN ('reserved','dispatching','running','unknown','cancelling')",
                    (lease.generation, event['flow_id']))
                return self._view(connection, event['flow_id'])
            if connection.execute("SELECT 1 FROM automation_flows WHERE task_id=? "
                    "AND status NOT IN ('completed','failed','cancelled')", (event['task_id'],)).fetchone():
                return None
            if connection.execute('SELECT 1 FROM automation_steps s JOIN automation_flows f ON f.id=s.flow_id '
                    'WHERE f.project_id=? AND s.writes_project=1 '
                    "AND s.status IN ('reserved','dispatching','running','unknown','cancelling')",
                    (event['project_id'],)).fetchone():
                return None
            payload = json.loads(event['payload_json'])
            item = task_access(connection, event['task_id'], writable=True)
            check_versions(item, {'expected_revision': event['requirement_revision']})
            if item['state'] in ('review', 'done'):
                fail('session_conflict')
            brief = dispatch._brief(connection, item['id'])
            if brief['revision'] != event['brief_revision']:
                fail('brief_changed')
            directory = dispatch._directory(connection, item['project_id'], brief['execution_directory_id'])
            if item['project_id'] != event['project_id'] or directory != payload['directory']:
                fail('project_directory_changed')
            identity, step_id, stamp = str(uuid4()), str(uuid4()), now_utc()
            context = {'policy_version': 1, 'requirement_revision': event['requirement_revision'],
                       'brief_revision': event['brief_revision'], 'input': payload}
            connection.execute('INSERT INTO automation_flows(id,task_id,project_id,origin_event_id,status,phase,'
                'context_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
                (identity, item['id'], item['project_id'], event_id, 'running', 'prepare', packed(context), stamp, stamp))
            operation = f'{int(self.clock() * 1000)}-{uuid4().hex}'
            connection.execute('INSERT INTO automation_steps(id,flow_id,ordinal,kind,attempt,owner_generation,status,'
                'operation_id,request_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                (step_id, identity, 1, 'prepare', 0, lease.generation, 'reserved', operation, packed(context), stamp, stamp))
            connection.execute('UPDATE automation_events SET flow_id=?,consumed_at=? WHERE id=?',
                               (identity, stamp, event_id))
            return self._view(connection, identity)

    def record(self, lease, step, status, *, binding=None, result=None):
        """Persist a reply using the lease and step state captured before the external call."""
        with self.store.connection() as connection:
            connection.execute('BEGIN IMMEDIATE')
            self._guard(connection, lease)
            current = self._step(connection, step['id'])
            if (not current or current['owner_generation'] != lease.generation
                    or step['owner_generation'] != lease.generation or current['status'] != step['status']
                    or current['flow_revision'] != step['flow_revision']):
                fail('automation_step_changed')
            if status not in STEP_TRANSITIONS.get(current['status'], ()):
                fail('automation_step_transition')
            stamp = now_utc()
            connection.execute('UPDATE automation_steps SET status=?,binding_json=?,result_json=?,updated_at=? WHERE id=?',
                (status, current['binding_json'] if binding is None else packed(binding),
                 current['result_json'] if result is None else packed(result), stamp, step['id']))
            connection.execute('UPDATE automation_flows SET revision=revision+1,updated_at=? WHERE id=?',
                               (stamp, current['flow_id']))
            return row_view(self._step(connection, step['id']))
