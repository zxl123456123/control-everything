"""Human local-owner decisions for verified automation deliveries."""
from uuid import uuid4

from control_everything.input_validation import ProfileError
from control_everything.workspace import dispatch, task_messages
from control_everything.workspace.automation_flow import AutomationQueue
from control_everything.workspace.automation_planning import planning_outcome
from control_everything.workspace.native_progress import body_fields, check_versions, digest, fail, packed, row_view, task_access, touch
from control_everything.workspace.store import now_utc


def _current(connection, task_id, body):
    item = task_access(connection, task_id, writable=True)
    check_versions(item, body)
    delivery = row_view(connection.execute('SELECT * FROM task_deliveries WHERE id=? AND task_id=?',
                        (body['delivery_id'],task_id)).fetchone())
    if not delivery or delivery['source'] != 'automation_verify' or item['current_delivery_id'] != delivery['id']:
        fail('delivery_changed')
    material = delivery['material']
    view = AutomationQueue._view(connection, material['flow_id'])
    flow, verify = view['flow'],view['step']
    if (not flow or not verify or flow['task_id'] != task_id or flow['project_id'] != item['project_id']
            or flow['status'] != 'awaiting_acceptance' or verify['kind'] != 'verify' or verify['status'] != 'completed'
            or verify['id'] != delivery['source_key'] or verify['id'] != material['verify_step_id']
            or flow['attention'].get('delivery_id') != delivery['id']
            or flow['attention'].get('expected_revision') != item['revision']
            or flow['attention'].get('progress_revision') != item['progress_revision']):
        fail('delivery_changed')
    context, request = flow['context'],verify['request']
    if dispatch._brief(connection,task_id)['revision'] != context['brief_revision']:
        fail('brief_changed')
    if dispatch._directory(connection,item['project_id'],context['input']['brief']['execution_directory_id']) != context['input']['directory']:
        fail('project_directory_changed')
    records = {kind: row_view(AutomationQueue._step(connection,request.get(kind+'_step_id'))) for kind in ('implement','plan','review')}
    implement, plan, review = (records[key] for key in ('implement','plan','review'))
    versions = {key:context[key] for key in ('requirement_revision','brief_revision','policy_version')}
    receipt = material['receipt']
    if (any(not record or record['flow_id'] != flow['id'] or record['status'] != 'completed'
            or record['request'].get('context') != context for record in records.values())
            or implement['kind'] != 'implement' or plan['kind'] != 'plan' or review['kind'] != 'plan_review'
            or request.get('context') != context or request.get('versions') != versions
            or any(material.get(key) != value for key,value in request.items())
            or material['verify_hash'] != digest(verify['result']) or receipt != verify['result']['receipt']
            or material['identity_scope'] != 'declared_inputs' or receipt['status'] != 'passed'
            or type(receipt['exit_code']) is not int or receipt['exit_code'] != 0
            or receipt['source_changed'] is not False or receipt['source_before'] != receipt['source_after']
            or request['implement_hash'] != digest(implement['result']['text'])
            or request['plan_hash'] != digest(plan['result']['text']) or request['review_hash'] != digest(review['result']['text'])
            or any(implement['request'].get(key) != request.get(key) for key in
                   ('plan_step_id','review_step_id','plan_hash','review_hash','versions'))
            or request['verification'] != context['input']['request'].get('verification')
            or any(request['scope'] != {key:record['request']['params'].get(key) for key in
                   ('runtimeId','environmentId','repoId','worktreeId','cwd')} for record in records.values())
            or planning_outcome(plan,review)['action'] != 'implement'):
        fail('automation_delivery_unverified')
    for record, model in ((plan,'gpt-6-astra'),(review,'gpt-6-astra'),(implement,'gpt-6.1-sol')):
        if (record['request']['params'].get('model') != model
                or record['result'].get('facts',{}).get('status',{}).get('model') != model):
            fail('automation_delivery_unverified')
    if connection.execute('SELECT 1 FROM automation_steps s JOIN automation_flows f ON f.id=s.flow_id '
            'WHERE f.project_id=? AND s.writes_project=1 '
            "AND s.status IN ('reserved','dispatching','running','unknown','cancelling')",(flow['project_id'],)).fetchone():
        fail('automation_project_busy')
    return item,delivery,flow,verify


def review_delivery(service, task_id, body):
    body_fields(body, ('expected_revision','progress_revision','delivery_id','verdict','reason','confirmed','client_token'))
    if body['confirmed'] is not True or body['verdict'] not in ('approved','changes_requested','rejected'):
        raise ProfileError('invalid_review')
    if not isinstance(body['reason'], str):
        raise ProfileError('invalid_review','reason')
    task_messages._text(body['reason'],'reason',10000,required=body['verdict'] != 'approved')
    request_hash = digest(body)
    def replay(connection):
        task_access(connection,task_id,writable=True)
        row = connection.execute('SELECT * FROM task_reviews WHERE task_id=? AND client_token=?',
                                 (task_id,body['client_token'])).fetchone()
        if row and row['request_hash'] != request_hash:
            fail('item_changed')
        return row_view(row)
    with service.store.connection() as connection:
        previous = replay(connection)
        if previous:
            return {**service.native_progress.get(task_id),'review':previous,'replayed':True}
        item,delivery,flow,verify = _current(connection,task_id,body)
    if service.check_verification is None:
        fail('verification_checker_unavailable')
    try:
        checked = service.check_verification(verify,flow)
        if checked['receipt'] != delivery['material']['receipt']:
            raise ValueError('verification_receipt_changed')
    except Exception:
        fail('verification_evidence_invalid')
    with service.store.connection() as connection:
        connection.execute('BEGIN IMMEDIATE')
        previous = replay(connection)
        if previous:
            return {**service.native_progress.get(task_id),'review':previous,'replayed':True}
        item,current,current_flow,current_verify = _current(connection,task_id,body)
        if (current_flow['revision'] != flow['revision'] or current != delivery or current_verify != verify):
            fail('delivery_changed')
        identity = str(uuid4())
        evidence = {'flow_id':flow['id'],'verify_step_id':verify['id'],'receipt_sha256':digest(checked['receipt']),
                    'output_dir':checked['output_dir'],'identity_scope':'declared_inputs'}
        connection.execute('INSERT INTO task_reviews(id,task_id,verdict,reason,evidence_json,reviewer,created_at,'
            'delivery_id,native_run_id,client_token,request_hash) VALUES(?,?,?,?,?,?,?, ?,NULL,?,?)',
            (identity,task_id,body['verdict'],body['reason'],packed(evidence),'local_owner',now_utc(),
             delivery['id'],body['client_token'],request_hash))
        approved = body['verdict'] == 'approved'
        touch(connection,item,'review' if approved else 'doing',delivery_id=delivery['id'],accepted=approved)
        attention = {'delivery_id':delivery['id'],'review_id':identity,'expected_revision':item['revision']+1,
                     'progress_revision':item['progress_revision']+1,
                     'reason':'integration_not_connected' if approved else 'acceptance_'+body['verdict']}
        if approved:
            attention.update(accepted_review_id=identity,accepted_delivery_id=delivery['id'],target_branch='develop')
        connection.execute("UPDATE automation_flows SET status='waiting_external',phase=?,attention_json=?,"
            'revision=revision+1,updated_at=? WHERE id=?',
            ('integration' if approved else 'acceptance',packed(attention),now_utc(),flow['id']))
        saved = row_view(connection.execute('SELECT * FROM task_reviews WHERE id=?',(identity,)).fetchone())
    return {**service.native_progress.get(task_id),'review':saved,'replayed':False}
