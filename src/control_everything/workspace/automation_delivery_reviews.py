"""Human local-owner decisions for verified automation deliveries."""
import json
from uuid import uuid4

from control_everything.input_validation import ProfileError
from control_everything.workspace import dispatch, task_messages
from control_everything.workspace.automation_flow import AutomationQueue, reviewer_may_integrate
from control_everything.workspace.automation_integration_targets import _target, _text, prepare_offer, project_target
from control_everything.workspace.automation_planning import planning_outcome
from control_everything.workspace.native_progress import body_fields, check_versions, digest, fail, packed, row_view, task_access, touch
from control_everything.workspace.store import now_utc


def _current(connection, task_id, body, *, allow_recorded=False):
    item = task_access(connection, task_id, writable=True)
    check_versions(item, body)
    delivery = row_view(connection.execute('SELECT * FROM task_deliveries WHERE id=? AND task_id=?',
                        (body['delivery_id'],task_id)).fetchone())
    if not delivery or delivery['source'] != 'automation_verify' or item['current_delivery_id'] != delivery['id']:
        fail('delivery_changed')
    material = delivery['material']
    view = AutomationQueue._view(connection, material['flow_id'])
    flow, latest = view['flow'], view['step']
    verify = _delivery_verification(connection, delivery, latest)
    if (not flow or not verify or flow['task_id'] != task_id or flow['project_id'] != item['project_id']
            or verify['kind'] != 'verify' or verify['status'] != 'completed'
            or verify['id'] != delivery['source_key'] or verify['id'] != material['verify_step_id']
            or flow['attention'].get('delivery_id') != delivery['id']
            or flow['attention'].get('expected_revision') != item['revision']
            or flow['attention'].get('progress_revision') != item['progress_revision']):
        fail('delivery_changed')
    if flow['status'] != 'awaiting_acceptance':
        if not allow_recorded or not _recorded_acceptance(connection, item, flow, delivery, verify):
            fail('delivery_changed')
    _evidence(connection, item, flow, verify, material)
    return item,delivery,flow,verify


def _recorded_acceptance(connection, item, flow, delivery, verify):
    attention = flow['attention']
    if (flow['status'] != 'completed' or flow['phase'] != 'acceptance'
            or attention.get('reason') != 'acceptance_approved' or item['state'] != 'done'
            or item['accepted_delivery_id'] != delivery['id']
            or attention.get('accepted_delivery_id') != delivery['id']
            or attention.get('accepted_review_id') != attention.get('review_id')):
        return False
    review = row_view(connection.execute(
        'SELECT * FROM task_reviews WHERE id=? AND task_id=? AND delivery_id=? AND verdict=? AND client_token=?',
        (attention.get('accepted_review_id'), item['id'], delivery['id'], 'approved', 'record-' + delivery['id'])).fetchone())
    return (review is not None and review['evidence'].get('flow_id') == flow['id']
            and review['evidence'].get('verify_step_id') == verify['id']
            and review['evidence'].get('receipt_sha256') == digest(delivery['material']['receipt']))


def _delivery_verification(connection, delivery, latest):
    if not delivery or not latest:
        return None
    if (latest['kind'] == 'code_review' and latest['status'] == 'completed'
            and latest['request'].get('verify_step_id') == delivery['source_key']):
        verify = row_view(AutomationQueue._step(connection, delivery['source_key']))
        return verify if verify and verify['flow_id'] == latest['flow_id'] else None
    return latest


def _review_approved(connection, verify):
    gate = row_view(connection.execute(
        'SELECT * FROM automation_steps WHERE flow_id=? AND ordinal=?',
        (verify['flow_id'], verify['ordinal'] + 1)).fetchone())
    if (not gate or gate['kind'] != 'code_review' or gate['status'] != 'completed'
            or gate['request'].get('verify_step_id') != verify['id']
            or gate['request'].get('implement_step_id') != verify['request'].get('implement_step_id')
            or gate['request'].get('implement_hash') != verify['request'].get('implement_hash')):
        return False
    try:
        verdict = json.loads(gate['result'].get('text'))
    except (TypeError, ValueError):
        return False
    return isinstance(verdict, dict) and verdict.get('verdict') == 'approve'


def _evidence(connection, item, flow, verify, material, *, exclude_step_id=None):
    if exclude_step_id is not None:
        own = AutomationQueue._step(connection, exclude_step_id)
        if not own or own["flow_id"] != flow["id"] or own["kind"] != "integrate":
            fail("automation_step_changed")
    receipt = material['receipt']
    context, request = flow['context'],verify['request']
    if dispatch._brief(connection,item['id'])['revision'] != context['brief_revision']:
        fail('brief_changed')
    if dispatch._directory(connection,item['project_id'],context['input']['brief']['execution_directory_id']) != context['input']['directory']:
        fail('project_directory_changed')
    records = {kind: row_view(AutomationQueue._step(connection,request.get(kind+'_step_id'))) for kind in ('implement','plan','review')}
    implement, plan, review = (records[key] for key in ('implement','plan','review'))
    versions = {key:context[key] for key in ('requirement_revision','brief_revision','policy_version')}
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
            or verify['flow_id'] != flow['id']):
        fail('automation_delivery_unverified')
    outcome = planning_outcome(plan, review)
    if ((outcome['requires_code_review'] or request.get('requires_code_review') is True)
            and not _review_approved(connection, verify)
            or outcome['action'] != 'implement' and outcome.get('release_ready') is not True):
        fail('automation_delivery_unverified')
    for record, model in ((plan,'gpt-6-astra'),(review,'gpt-6-astra'),(implement,'gpt-6.1-sol')):
        if (record['request']['params'].get('model') != model
                or record['result'].get('facts',{}).get('status',{}).get('model') != model):
            fail('automation_delivery_unverified')
    if connection.execute('SELECT 1 FROM automation_steps s JOIN automation_flows f ON f.id=s.flow_id '
            'WHERE f.project_id=? AND s.writes_project=1 AND (? IS NULL OR s.id != ?) '
            "AND s.status IN ('reserved','dispatching','running','unknown','cancelling')",(flow['project_id'],exclude_step_id,exclude_step_id)).fetchone():
        fail('automation_project_busy')

def prepare_acceptance_offer(service, flow):
    body = {k: flow['attention'][k] for k in ('delivery_id', 'expected_revision', 'progress_revision')}
    try:
        with service.store.connection() as connection:
            _, _, current, verify = _current(connection, flow['task_id'], body)
            configured = project_target(connection, current, verify)
        offer = prepare_offer(service, configured, current, verify)
        if offer:
            with service.store.connection() as connection:
                _, _, latest, latest_verify = _current(connection, flow['task_id'], body)
                if (latest['revision'] != current['revision'] or latest_verify != verify
                        or project_target(connection, latest, latest_verify) != configured):
                    return None
        return offer
    except ProfileError:
        return None


def prepare_integration_card(service, task_id, body):
    from control_everything.workspace.automation_human_decisions import acceptance_card

    body_fields(body, ('delivery_id', 'expected_revision', 'progress_revision', 'confirmed'))
    if (body['confirmed'] is not True or not isinstance(body['delivery_id'], str)
            or any(type(body[key]) is not int or body[key] < 0 for key in ('expected_revision', 'progress_revision'))):
        raise ProfileError('invalid_integration_card')
    with service.store.connection() as connection:
        item, delivery, flow, verify = _current(connection, task_id, body, allow_recorded=True)
        if flow['status'] != 'completed':
            fail('delivery_changed')
        configured = project_target(connection, flow, verify)
    _check_verification(service, delivery, flow, verify)
    offer = prepare_offer(service, configured, flow, verify)
    if not offer:
        fail('integration_offer_changed')
    with service.store.connection() as connection:
        current = _current(connection, task_id, body, allow_recorded=True)
        if current != (item, delivery, flow, verify) or project_target(connection, flow, verify) != configured:
            fail('integration_offer_changed')
    return item['project_id'], acceptance_card(flow, approval=offer, task_title=item['title'])


def _check_verification(service, delivery, flow, verify):
    if service.check_verification is None:
        fail('verification_checker_unavailable')
    try:
        checked = service.check_verification(verify, flow)
        if checked['receipt'] != delivery['material']['receipt']:
            raise ValueError('verification_receipt_changed')
    except Exception:
        fail('verification_evidence_invalid')
    return checked


def integration_snapshot(target, verify, delivery_id, review_id, client_token, request_hash,
                         control_revision, progress_revision, flow_revision):
    return {'client_token': client_token, 'request_hash': request_hash, 'actor': 'local_owner',
            'recorded_at': now_utc(), 'target': target, 'delivery_id': delivery_id, 'review_id': review_id,
            'verify_step_id': verify['id'], 'verify_hash': digest(verify['result']),
            'source_root': verify['request']['scope']['cwd'], 'verification': verify['request']['verification'],
            'source_hash': verify['result']['receipt']['source_before'], 'accepted_control_revision': control_revision,
            'accepted_progress_revision': progress_revision, 'accepted_flow_revision': flow_revision}


def register_target(service, task_id, body):
    body_fields(body,('flow_id','expected_flow_revision','expected_revision','progress_revision','delivery_id','review_id','client_token','confirmed','target'))
    if body['confirmed'] is not True or any(type(body[k]) is not int or body[k] < 0 for k in ('expected_flow_revision','expected_revision','progress_revision')):
        raise ProfileError('invalid_integration_target')
    for key in ('flow_id','delivery_id','review_id','client_token'):
        _text(body[key])
    request_hash = digest({'task_id':task_id,'body':body})
    with service.store.connection() as connection:
        connection.execute('BEGIN IMMEDIATE')
        item = task_access(connection,task_id,writable=True)
        view = AutomationQueue._view(connection,body['flow_id'])
        flow = view['flow']
        if not flow or flow['task_id'] != task_id or flow['project_id'] != item['project_id']:
            fail('automation_step_changed')
        previous = flow['attention'].get('integration_target')
        if previous:
            if previous['client_token'] != body['client_token'] or previous['request_hash'] != request_hash:
                fail('item_changed')
            return {'flow':flow,'integration_target':previous,'recorded':True,'replayed':True}
        check_versions(item,body)
        delivery = row_view(connection.execute('SELECT * FROM task_deliveries WHERE id=? AND task_id=?',(body['delivery_id'],task_id)).fetchone())
        verify = _delivery_verification(connection, delivery, view['step'])
        review = row_view(connection.execute('SELECT * FROM task_reviews WHERE id=? AND task_id=?',(body['review_id'],task_id)).fetchone())
        attention = flow['attention']
        if (flow['revision'] != body['expected_flow_revision'] or flow['status'] != 'waiting_external' or flow['phase'] != 'integration'
                or attention.get('reason') != 'integration_not_connected' or not delivery or not review
                or item['current_delivery_id'] != delivery['id'] or item['accepted_delivery_id'] != delivery['id']
                or review['delivery_id'] != delivery['id'] or review['verdict'] != 'approved'
                or not reviewer_may_integrate(connection, task_id, review['reviewer'])
                or attention.get('accepted_review_id') != review['id'] or attention.get('accepted_delivery_id') != delivery['id']
                or attention.get('expected_revision') != item['revision'] or attention.get('progress_revision') != item['progress_revision']
                or delivery['source'] != 'automation_verify' or not verify or verify['kind'] != 'verify' or verify['status'] != 'completed'
                or delivery['source_key'] != verify['id'] or delivery['material'].get('verify_step_id') != verify['id']
                or delivery['material'].get('flow_id') != flow['id']):
            fail('automation_step_changed')
        _evidence(connection,item,flow,verify,delivery['material'])
        target = _target(body['target'],verify)
        snapshot = integration_snapshot(target, verify, delivery['id'], review['id'],
                                        body['client_token'], request_hash, item['revision'],
                                        item['progress_revision'], flow['revision'])
        connection.execute('UPDATE automation_flows SET attention_json=?,revision=revision+1,updated_at=? WHERE id=?',
            (packed({**attention,'integration_target':snapshot}),now_utc(),flow['id']))
        return {'flow':AutomationQueue._view(connection,flow['id'])['flow'],'integration_target':snapshot,'recorded':True,'replayed':False}


def review_delivery(service, task_id, body, *, reviewer='local_owner', approval=None, acceptance_card=None):
    body_fields(body, ('expected_revision','progress_revision','delivery_id','verdict','reason','confirmed','client_token'))
    if (body['confirmed'] is not True or body['verdict'] not in ('approved','changes_requested','rejected')
            or not isinstance(reviewer, str) or not reviewer or len(reviewer) > 256):
        raise ProfileError('invalid_review')
    if not isinstance(body['reason'], str):
        raise ProfileError('invalid_review','reason')
    task_messages._text(body['reason'],'reason',10000,required=body['verdict'] != 'approved')
    if approval == 'record' and (body['verdict'] != 'approved' or body['client_token'] != 'record-' + body['delivery_id']):
        fail('delivery_changed')
    allow_recorded = approval == 'integrate' and reviewer != 'local_owner'
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
        item,delivery,flow,verify = _current(connection,task_id,body,allow_recorded=allow_recorded)
        configured = project_target(connection, flow, verify) if approval == 'integrate' else None
    checked = _check_verification(service, delivery, flow, verify)
    offer = None
    if approval == 'integrate':
        offer = prepare_offer(service, configured, flow, verify)
        if body['verdict'] != 'approved' or not offer or offer['decision_id'] != body['client_token']:
            fail('integration_offer_changed')
    with service.store.connection() as connection:
        connection.execute('BEGIN IMMEDIATE')
        previous = replay(connection)
        if previous:
            return {**service.native_progress.get(task_id),'review':previous,'replayed':True}
        item,current,current_flow,current_verify = _current(connection,task_id,body,allow_recorded=allow_recorded)
        if (current_flow['revision'] != flow['revision'] or current != delivery or current_verify != verify):
            fail('delivery_changed')
        if offer and (not reviewer_may_integrate(connection, task_id, reviewer)
                      or project_target(connection, current_flow, current_verify) != offer['config']):
            fail('integration_offer_changed')
        identity = str(uuid4())
        evidence = {'flow_id':flow['id'],'verify_step_id':verify['id'],'receipt_sha256':digest(checked['receipt']),
                    'output_dir':checked['output_dir'],'identity_scope':'declared_inputs'}
        if acceptance_card is not None:
            evidence['acceptance_card'] = acceptance_card
        connection.execute('INSERT INTO task_reviews(id,task_id,verdict,reason,evidence_json,reviewer,created_at,'
            'delivery_id,native_run_id,client_token,request_hash) VALUES(?,?,?,?,?,?,?, ?,NULL,?,?)',
            (identity,task_id,body['verdict'],body['reason'],packed(evidence),reviewer,now_utc(),
             delivery['id'],body['client_token'],request_hash))
        approved = body['verdict'] == 'approved'
        only_accept = approved and approval == 'record'
        touch(connection, item, 'done' if only_accept or flow['status'] == 'completed' else 'review' if approved else 'doing',
              delivery_id=delivery['id'], accepted=approved)
        attention = {'delivery_id':delivery['id'],'review_id':identity,'expected_revision':item['revision']+1,
                     'progress_revision':item['progress_revision']+1,
                     'reason':'integration_not_connected' if approved else 'acceptance_'+body['verdict']}
        if approved:
            attention.update(accepted_review_id=identity, accepted_delivery_id=delivery['id'])
        status, phase, revision_increment = 'waiting_external', 'acceptance', 1
        if only_accept:
            status = 'completed'
            attention['reason'] = 'acceptance_approved'
        elif approved:
            phase = 'integration'
            attention['target_branch'] = 'develop'
            if offer:
                attention['integration_target'] = integration_snapshot(
                    offer['target'], verify, delivery['id'], identity, body['client_token'], request_hash,
                    item['revision']+1, item['progress_revision']+1, flow['revision']+1)
                revision_increment = 2
        connection.execute('UPDATE automation_flows SET status=?,phase=?,attention_json=?,'
                           'revision=revision+?,updated_at=? WHERE id=?',
                           (status, phase, packed(attention), revision_increment, now_utc(), flow['id']))
        saved = row_view(connection.execute('SELECT * FROM task_reviews WHERE id=?',(identity,)).fetchone())
    return {**service.native_progress.get(task_id),'review':saved,'replayed':False}


def resume_capability(service, task_id, body):
    body_fields(body, ('flow_id','expected_flow_revision','expected_revision','progress_revision','confirmed'))
    if (body['confirmed'] is not True or not isinstance(body['flow_id'], str)
            or any(type(body[key]) is not int or body[key] < 0 for key in
                   ('expected_flow_revision','expected_revision','progress_revision'))):
        raise ProfileError('invalid_resume')

    def current(connection):
        item = task_access(connection, task_id, writable=True)
        view = AutomationQueue._view(connection, body['flow_id'])
        flow, verify = view['flow'], view['step']
        if (not flow or flow['task_id'] != task_id or flow['project_id'] != item['project_id']
                or not verify or verify['kind'] != 'verify' or verify['status'] != 'completed'):
            fail('automation_step_changed')
        expected = body['expected_flow_revision']
        if flow['revision'] == expected+1 and flow['status'] == 'running':
            check_versions(item, body)
            return view, True
        if flow['revision'] == expected+2 and flow['status'] == 'awaiting_acceptance':
            delivery = row_view(connection.execute('SELECT * FROM task_deliveries WHERE id=?',
                                (flow['attention'].get('delivery_id'),)).fetchone())
            if (delivery and item['current_delivery_id'] == delivery['id']
                    and delivery['task_id'] == task_id and delivery['source'] == 'automation_verify'
                    and delivery['source_key'] == verify['id']
                    and item['revision'] == body['expected_revision']+1
                    and item['progress_revision'] == body['progress_revision']+1):
                return view, True
        check_versions(item, body)
        if (flow['revision'] != expected or flow['status'] != 'waiting_external'
                or flow['attention'].get('reason') != 'code_review_or_acceptance_not_connected'
                or connection.execute('SELECT 1 FROM task_deliveries WHERE task_id=?', (task_id,)).fetchone()
                or connection.execute('SELECT 1 FROM task_reviews WHERE task_id=?', (task_id,)).fetchone()):
            fail('automation_step_changed')
        problem = AutomationQueue._input_problem(connection,task_id,flow['context'])
        if problem:
            fail(problem)
        material = {**verify['request'], 'receipt':verify['result'].get('receipt'),
                    'verify_hash':digest(verify['result']), 'identity_scope':'declared_inputs'}
        _evidence(connection,item,flow,verify,material)
        return view, False

    with service.store.connection() as connection:
        view, at_stage = current(connection)
    if at_stage:
        return {**view, 'status':'already_at_stage'}
    if service.check_verification is None:
        fail('verification_checker_unavailable')
    try:
        checked = service.check_verification(view['step'],view['flow'])
        if checked['receipt'] != view['step']['result']['receipt']:
            raise ValueError('verification_receipt_changed')
    except Exception:
        fail('verification_evidence_invalid')
    with service.store.connection() as connection:
        connection.execute('BEGIN IMMEDIATE')
        latest, at_stage = current(connection)
        if at_stage:
            return {**latest, 'status':'already_at_stage'}
        if latest != view:
            fail('automation_step_changed')
        connection.execute("UPDATE automation_flows SET status='running',revision=revision+1,updated_at=? WHERE id=?",
                           (now_utc(),body['flow_id']))
        return {**AutomationQueue._view(connection,body['flow_id']), 'status':'resumed'}
