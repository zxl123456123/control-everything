"""Durable automation claims; external work never runs inside these transactions."""

from dataclasses import dataclass
import json
import time
from uuid import uuid4

from control_everything.input_validation import ProfileError
from control_everything.workspace import dispatch
from control_everything.workspace.native_progress import check_versions, digest, fail, packed, row_view, task_access, touch
from control_everything.workspace.store import now_utc
from control_everything.workspace.automation_planning import planning_outcome

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
            supported = payload['request']['agent'] == 'codex'
            if supported and connection.execute('SELECT 1 FROM automation_steps s JOIN automation_flows f ON f.id=s.flow_id '
                    'WHERE f.project_id=? AND s.writes_project=1 '
                    "AND s.status IN ('reserved','dispatching','running','unknown','cancelling')",
                    (event['project_id'],)).fetchone():
                return None
            connection.execute('INSERT INTO automation_flows(id,task_id,project_id,origin_event_id,status,phase,'
                'context_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
                (identity, item['id'], item['project_id'], event_id, 'running', 'prepare', packed(context), stamp, stamp))
            if not supported:
                connection.execute("UPDATE automation_flows SET status='waiting_external',attention_json=? WHERE id=?",
                    (packed({'reason': 'agent_not_supported', 'agent': payload['request']['agent']}), identity))
                connection.execute('UPDATE automation_events SET flow_id=?,consumed_at=? WHERE id=?', (identity, stamp, event_id))
                return self._view(connection, identity)
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
            if current['status'] == 'reserved' and status == 'dispatching':
                flow = connection.execute('SELECT * FROM automation_flows WHERE id=?', (current['flow_id'],)).fetchone()
                problem = self._input_problem(connection, flow['task_id'], json.loads(flow['context_json']))
                if problem:
                    fail('automation_requirement_changed' if problem == 'requirement_changed' else problem)
            stamp = now_utc()
            connection.execute('UPDATE automation_steps SET status=?,binding_json=?,result_json=?,updated_at=? WHERE id=?',
                (status, current['binding_json'] if binding is None else packed(binding),
                 current['result_json'] if result is None else packed(result), stamp, step['id']))
            connection.execute('UPDATE automation_flows SET revision=revision+1,updated_at=? WHERE id=?',
                               (stamp, current['flow_id']))
            return row_view(self._step(connection, step['id']))

    def reserve_next(self, lease, previous, kind, request, *, writes_project=True):
        with self.store.connection() as connection:
            connection.execute('BEGIN IMMEDIATE')
            self._guard(connection, lease)
            flow = connection.execute('SELECT * FROM automation_flows WHERE id=?', (previous['flow_id'],)).fetchone()
            frozen = packed({'context': json.loads(flow['context_json']), **request})
            existing = connection.execute('SELECT id,kind,request_json,writes_project FROM automation_steps '
                'WHERE flow_id=? AND ordinal=?', (flow['id'], previous['ordinal'] + 1)).fetchone()
            if existing:
                if (existing['kind'] != kind or existing['request_json'] != frozen
                        or existing['writes_project'] != int(writes_project)):
                    fail('automation_step_conflict')
                return row_view(self._step(connection, existing['id']))
            current = self._step(connection, previous['id'])
            if (current['status'] != 'completed' or flow['status'] != 'running'
                    or current['flow_revision'] != previous['flow_revision']):
                fail('automation_step_changed')
            context = json.loads(flow['context_json'])
            problem = self._input_problem(connection, flow['task_id'], context)
            if problem:
                fail('automation_requirement_changed' if problem == 'requirement_changed' else problem)
            if writes_project and connection.execute('SELECT 1 FROM automation_steps s '
                    'JOIN automation_flows f ON f.id=s.flow_id WHERE f.project_id=? AND s.writes_project=1 '
                    "AND s.status IN ('reserved','dispatching','running','unknown','cancelling')", (flow['project_id'],)).fetchone():
                return None
            identity, stamp = str(uuid4()), now_utc()
            operation = f'{int(self.clock() * 1000)}-{uuid4().hex}'
            connection.execute('INSERT INTO automation_steps(id,flow_id,ordinal,kind,attempt,owner_generation,'
                'writes_project,status,operation_id,request_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                (identity, flow['id'], previous['ordinal'] + 1, kind, 0, lease.generation, int(writes_project),
                 'reserved', operation, frozen, stamp, stamp))
            connection.execute('UPDATE automation_flows SET phase=?,revision=revision+1,updated_at=? WHERE id=?',
                               (kind, stamp, flow['id']))
            return row_view(self._step(connection, identity))

    def publish_delivery(self, lease, step, checked_result):
        """Publish one current checked verification, without granting human acceptance."""
        with self.store.connection() as connection:
            connection.execute('BEGIN IMMEDIATE')
            self._guard(connection, lease)
            view = self._view(connection, step['flow_id'])
            flow, current = view['flow'], view['step']
            if (not flow or not current or current['id'] != step['id']
                    or current['kind'] != 'verify' or current['status'] != 'completed'
                    or current['request'] != step['request'] or current['result'] != step['result']):
                fail('automation_step_changed')
            receipt = checked_result['receipt']
            if (receipt != current['result'].get('receipt') or receipt['status'] != 'passed'
                    or type(receipt['exit_code']) is not int or receipt['exit_code'] != 0
                    or receipt['source_changed'] is not False or receipt['source_before'] != receipt['source_after']):
                fail('automation_delivery_unverified')
            existing = connection.execute("SELECT * FROM task_deliveries WHERE task_id=? AND source='automation_verify' "
                'AND source_key=?', (flow['task_id'], current['id'])).fetchone()
            if existing:
                if (flow['status'] != 'awaiting_acceptance' or flow['attention'].get('delivery_id') != existing['id']
                        or row_view(existing)['material']['receipt'] != receipt):
                    fail('automation_step_changed')
                return {**view, 'delivery': row_view(existing)}
            if flow['status'] != 'running' or flow['revision'] != step['flow_revision']:
                fail('automation_step_changed')
            context, request = flow['context'], current['request']
            problem = self._input_problem(connection, flow['task_id'], context)
            if problem:
                fail('automation_requirement_changed' if problem == 'requirement_changed' else problem)
            records = {kind: row_view(self._step(connection, request.get(kind + '_step_id'))) for kind in
                       ('implement', 'plan', 'review')}
            implement, plan, review = (records[key] for key in ('implement', 'plan', 'review'))
            versions = {key: context[key] for key in ('requirement_revision','brief_revision','policy_version')}
            if (any(not record or record['flow_id'] != flow['id'] or record['status'] != 'completed'
                    or record['request'].get('context') != context for record in records.values())
                    or implement['kind'] != 'implement' or plan['kind'] != 'plan' or review['kind'] != 'plan_review'
                    or request.get('context') != context or request.get('versions') != versions
                    or request.get('implement_hash') != digest(implement['result']['text'])
                    or request.get('plan_hash') != digest(plan['result']['text'])
                    or request.get('review_hash') != digest(review['result']['text'])
                    or any(implement['request'].get(key) != request.get(key) for key in
                           ('plan_step_id','review_step_id','plan_hash','review_hash','versions'))
                    or request['verification'] != context['input']['request'].get('verification')
                    or any(request['scope'] != {key: record['request']['params'].get(key) for key in
                           ('runtimeId','environmentId','repoId','worktreeId','cwd')} for record in records.values())
                    or planning_outcome(plan, review)['action'] != 'implement'):
                fail('automation_delivery_unverified')
            for record, model in ((plan,'gpt-6-astra'),(review,'gpt-6-astra'),(implement,'gpt-6.1-sol')):
                if (record['request']['params'].get('model') != model
                        or record['result'].get('facts',{}).get('status',{}).get('model') != model):
                    fail('automation_delivery_unverified')
            if connection.execute('SELECT 1 FROM automation_steps s JOIN automation_flows f ON f.id=s.flow_id '
                    'WHERE f.project_id=? AND s.writes_project=1 '
                    "AND s.status IN ('reserved','dispatching','running','unknown','cancelling')", (flow['project_id'],)).fetchone():
                fail('automation_project_busy')
            identity, stamp = str(uuid4()), now_utc()
            material = {**request, 'flow_id': flow['id'], 'verify_step_id': current['id'],
                        'receipt': receipt, 'verify_hash': digest(current['result']),
                        'output_dir': checked_result['output_dir'], 'identity_scope': 'declared_inputs'}
            connection.execute('INSERT INTO task_deliveries(id,task_id,native_run_id,source,source_key,summary,'
                'material_json,verification,created_at) VALUES(?,?,NULL,?,?,?,?,?,?)',
                (identity,flow['task_id'],'automation_verify',current['id'],
                 'Declared input verification exited 0 with unchanged source and complete logs.',packed(material),'passed',stamp))
            item = task_access(connection, flow['task_id'], writable=True)
            touch(connection, item, 'review', delivery_id=identity, accepted=False)
            attention = {'delivery_id':identity, 'expected_revision':item['revision']+1,
                         'progress_revision':item['progress_revision']+1}
            connection.execute("UPDATE automation_flows SET status='awaiting_acceptance',phase='acceptance',"
                'attention_json=?,revision=revision+1,updated_at=? WHERE id=?', (packed(attention),stamp,flow['id']))
            return {**self._view(connection,flow['id']), 'delivery': row_view(connection.execute(
                'SELECT * FROM task_deliveries WHERE id=?',(identity,)).fetchone())}

    def pending_events(self):
        with self.store.connection() as connection:
            return [row[0] for row in connection.execute('SELECT e.id FROM automation_events e '
                'LEFT JOIN automation_flows f ON f.id=e.flow_id WHERE e.flow_id IS NULL OR f.status=\'running\' '
                'ORDER BY e.received_at,e.id')]

    def get_step(self, step_id):
        with self.store.connection() as connection:
            return row_view(self._step(connection, step_id))

    def check_current(self, lease, step):
        """Validate the current frozen input before an external dispatch."""
        with self.store.connection() as connection:
            connection.execute('BEGIN IMMEDIATE')
            self._guard(connection, lease)
            view = self._view(connection, step['flow_id'])
            if (view['flow']['status'] != 'running' or view['step']['id'] != step['id']
                    or view['flow']['revision'] != step['flow_revision']):
                fail('automation_step_changed')
            return self._input_problem(connection, view['flow']['task_id'], view['flow']['context'])

    @staticmethod
    def _input_problem(connection, task_id, context):
        try:
            item = task_access(connection, task_id, writable=True)
        except ProfileError as error:
            if str(error) == 'project_unavailable':
                return 'project_unavailable'
            raise
        brief = dispatch._brief(connection, item['id'])
        if (item['revision'] != context['requirement_revision'] or brief['revision'] != context['brief_revision']):
            return 'requirement_changed'
        try:
            directory = dispatch._directory(connection, item['project_id'], brief['execution_directory_id'])
        except ProfileError:
            return 'project_directory_changed'
        if directory != context['input']['directory']:
            return 'project_directory_changed'
        return None

    def wait(self, lease, step, status, phase, attention):
        with self.store.connection() as connection:
            connection.execute('BEGIN IMMEDIATE')
            self._guard(connection, lease)
            view = self._view(connection, step['flow_id'])
            if (view['flow']['status'] != 'running' or view['step']['id'] != step['id']
                    or view['flow']['revision'] != step['flow_revision']
                    or view['step']['status'] != step['status']):
                fail('automation_step_changed')
            connection.execute('UPDATE automation_flows SET status=?,phase=?,attention_json=?,revision=revision+1,'
                'updated_at=? WHERE id=?', (status, phase, packed(attention), now_utc(), step['flow_id']))
            return self._view(connection, step['flow_id'])
