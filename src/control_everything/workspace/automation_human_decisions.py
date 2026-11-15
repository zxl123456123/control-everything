"""Classify a trusted human reply. A model summary is not a decision."""
import json

from control_everything.input_validation import ProfileError
from control_everything.workspace.automation_delivery_reviews import review_delivery
from control_everything.workspace.native_progress import row_view

VAGUE = ('不错', '可以考虑', '再看看', '以后可以')
PLAN_RELEASE = '按已审方案实现'


def acceptance_card(flow):
    """A card for the current delivery. It does not accept by being sent."""
    attention = (flow or {}).get('attention') or {}
    delivery_id = attention.get('delivery_id')
    task_id = flow.get('task_id')
    if (flow.get('status') != 'awaiting_acceptance' or not task_id or not isinstance(delivery_id, str) or not delivery_id
            or type(attention.get('expected_revision')) is not int or type(attention.get('progress_revision')) is not int):
        raise ValueError('acceptance_card_unavailable')
    decision = {'namespace': 'control-everything.automation.v1', 'decision_id': 'accept-' + delivery_id,
                'task_id': task_id, 'delivery_id': delivery_id, 'flow_id': flow['id'],
                'expected_revision': attention['expected_revision'], 'progress_revision': attention['progress_revision'],
                'verdict': 'approved'}
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '这个版本通过，集成 develop'}, 'type': 'primary',
              'value': decision}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '待验收'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '当前交付可以验收。通过后只集成 develop。'}, button]}}


def waiting_card(flow):
    """A card for the current wait. It does not grant acceptance or start work by itself."""
    attention = (flow or {}).get('attention') or {}
    task_id = (flow.get('context') or {}).get('input', {}).get('brief', {}).get('task_id') or flow.get('task_id')
    if flow.get('status') != 'waiting_user' or not task_id:
        raise ValueError('waiting_card_unavailable')
    revision = attention.get('versions', {}).get('requirement_revision')
    if attention.get('requires_code_review') is True and not attention.get('questions'):
        choice = PLAN_RELEASE
        question = '已审方案可以开始实现吗？'
    else:
        questions = attention.get('questions') or []
        if len(questions) != 1:
            raise ValueError('waiting_card_ambiguous')
        question = questions[0]
        choice = None
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': choice or '需要说明'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id,
                        'flow_id': flow['id'], 'requirement_revision': revision, 'choice': choice}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '需要决定'}},
            'body': {'elements': [{'tag': 'markdown', 'content': question}, button]}}


def apply_acceptance_decisions(store, service, binding):
    """Apply a stored Feishu acceptance. It does not accept a different delivery."""
    if service is None or any(not binding.get(key) for key in ('hub_origin', 'device_id', 'generation')):
        return []
    with store.connection() as db:
        rows = db.execute('''SELECT payload_json FROM automation_remote_inbox
            WHERE hub_origin=? AND device_id=? AND generation=? AND ack_state='pending'
            ORDER BY received_at,message_id''',
            (binding['hub_origin'], binding['device_id'], binding['generation'])).fetchall()
    applied = []
    for row in rows:
        decision = _stored_acceptance(row['payload_json'])
        if decision is None:
            continue
        try:
            applied.append(review_delivery(service, decision['task_id'], decision['body']))
        except ProfileError as error:
            if str(error) == 'automation_owner_lost':
                raise
    return applied


def _stored_acceptance(raw):
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if type(payload) is not dict or payload.get('kind') != 'feishu_card_decision':
        return None
    decision = payload.get('decision')
    actor = payload.get('actor_open_id')
    fields = {'namespace', 'decision_id', 'task_id', 'delivery_id', 'expected_revision', 'progress_revision', 'verdict'}
    if (type(decision) is not dict or set(decision) != fields or decision.get('namespace') != 'control-everything.automation.v1'
            or decision.get('verdict') not in ('approved', 'changes_requested', 'rejected')
            or any(type(decision.get(key)) is not str or not decision[key] for key in ('decision_id', 'task_id', 'delivery_id'))
            or any(type(decision.get(key)) is not int or decision[key] < 0 for key in ('expected_revision', 'progress_revision'))
            or type(actor) is not str or not actor):
        return None
    reason = {'approved': '这个版本通过，集成 develop', 'changes_requested': '飞书要求修改', 'rejected': '飞书拒绝'}
    return {'task_id': decision['task_id'], 'body': {
        'expected_revision': decision['expected_revision'], 'progress_revision': decision['progress_revision'],
        'delivery_id': decision['delivery_id'], 'verdict': decision['verdict'], 'reason': reason[decision['verdict']],
        'confirmed': True, 'client_token': decision['decision_id']}}


def apply_plan_releases(store, consumer, binding):
    """Apply a stored release for the current wait. Replay returns the same step."""
    if any(not binding.get(key) for key in ('hub_origin', 'device_id', 'generation')):
        return []
    with store.connection() as db:
        rows = db.execute('''SELECT payload_json FROM automation_remote_inbox
            WHERE hub_origin=? AND device_id=? AND generation=? AND ack_state='pending'
            ORDER BY received_at,message_id''',
            (binding['hub_origin'], binding['device_id'], binding['generation'])).fetchall()
    applied = []
    for row in rows:
        release = _stored_release(row['payload_json'])
        if release is None:
            continue
        existing = _released_implement(store, release['flow_id'], release['requirement_revision'])
        if existing is not None:
            applied.append(existing)
            continue
        if not _waiting_release(store, release['flow_id'], release['requirement_revision']):
            continue
        try:
            applied.append(consumer.release_plan(release['flow_id'], {
                'source': 'human', 'quoted': False, 'actor_id': release['actor_id'], 'text': PLAN_RELEASE}))
        except ProfileError as error:
            if str(error) == 'automation_owner_lost':
                raise
    return applied


def _stored_release(raw):
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if type(payload) is not dict:
        return None
    release = payload.get('plan_release')
    actor = payload.get('actor_open_id')
    if (payload.get('kind') != 'feishu_plan_release' or type(release) is not dict
            or release.get('namespace') != 'control-everything.automation.v1' or release.get('text') != PLAN_RELEASE
            or type(release.get('flow_id')) is not str or not release['flow_id']
            or type(release.get('requirement_revision')) is not int or type(actor) is not str or not actor):
        return None
    return {'flow_id': release['flow_id'], 'requirement_revision': release['requirement_revision'], 'actor_id': actor}


def _flow_ends(store, flow_id):
    with store.connection() as db:
        flow = row_view(db.execute('SELECT * FROM automation_flows WHERE id=?', (flow_id,)).fetchone())
        step = row_view(db.execute('SELECT * FROM automation_steps WHERE flow_id=? ORDER BY ordinal DESC LIMIT 1',
                                   (flow_id,)).fetchone())
    return flow, step


def _waiting_release(store, flow_id, revision):
    flow, step = _flow_ends(store, flow_id)
    attention = (flow or {}).get('attention') or {}
    versions = attention.get('versions') or {}
    return (flow is not None and step is not None and flow.get('status') == 'waiting_user'
            and step.get('kind') == 'plan_review' and step.get('status') == 'completed'
            and attention.get('requires_code_review') is True and not attention.get('questions')
            and versions.get('requirement_revision') == revision)


def _released_implement(store, flow_id, revision):
    with store.connection() as db:
        rows = db.execute("SELECT * FROM automation_steps WHERE flow_id=? AND kind='implement' ORDER BY ordinal",
                          (flow_id,)).fetchall()
    for row in rows:
        body = row_view(row)
        request = body.get('request') or {}
        if (request.get('requires_code_review') is True
                and (request.get('versions') or {}).get('requirement_revision') == revision):
            return body
    return None


def apply_waiting_reply(consumer, flow, value, actor_id):
    card = waiting_card(flow)
    expected = card['body']['elements'][1]['value']
    if value != expected or not isinstance(actor_id, str) or not actor_id:
        return {'action': 'reject', 'reason': 'stale_or_foreign_card'}
    if expected['choice'] != PLAN_RELEASE:
        return {'action': 'ask', 'reason': 'decision_unclear'}
    return consumer.release_plan(flow['id'], {
        'source': 'human', 'quoted': False, 'actor_id': actor_id, 'text': PLAN_RELEASE})


def is_plan_release(message):
    return (isinstance(message, dict) and message.get('source') == 'human' and message.get('quoted') is not True
            and message.get('text') == PLAN_RELEASE and isinstance(message.get('actor_id'), str) and message.get('actor_id'))


def classify_decision(message, *, tasks):
    """Return execute, ask, or reject. Execution still needs the existing review service."""
    if not isinstance(message, dict) or message.get('source') != 'human' or message.get('quoted') is True:
        return {'action': 'reject', 'reason': 'not_a_human_decision'}
    text = message.get('text')
    actor = message.get('actor_id')
    if not isinstance(text, str) or not text.strip() or not isinstance(actor, str) or not actor:
        return {'action': 'reject', 'reason': 'not_a_human_decision'}
    if any(phrase in text for phrase in VAGUE) or text.endswith('?') or text.endswith('？'):
        return {'action': 'reject', 'reason': 'not_a_decision'}
    open_tasks = [task for task in tasks if task.get('open')]
    if len(open_tasks) != 1:
        return {'action': 'ask', 'reason': 'task_ambiguous'}
    task = open_tasks[0]
    if message.get('requirement_revision') != task.get('requirement_revision'):
        return {'action': 'reject', 'reason': 'stale_version'}
    if text == '这个版本通过，集成 develop' and task.get('delivery_id'):
        return {'action': 'execute', 'reason': 'accept_current_delivery', 'task_id': task['id'],
                'delivery_id': task['delivery_id'], 'verdict': 'approved'}
    choice = _explicit_choice(text, task.get('choices') or [])
    if choice:
        return {'action': 'execute', 'reason': 'explicit_choice', 'task_id': task['id'],
                'question_id': task.get('question_id'), 'choice': choice}
    return {'action': 'ask', 'reason': 'decision_unclear'}


def question_card(waiting):
    """One choice card for a single open question. Silence is not a choice."""
    questions = waiting.get('questions') or []
    choices = waiting.get('choices') or []
    if (not waiting.get('task_id') or not waiting.get('title') or len(questions) != 1 or len(choices) < 2
            or len({*choices}) != len(choices)):
        raise ValueError('question_card_ambiguous')
    return {
        'schema': '2.0',
        'header': {'title': {'tag': 'plain_text', 'content': waiting['title']}},
        'body': {'elements': [
            {'tag': 'markdown', 'content': questions[0]},
            *[{'tag': 'button', 'text': {'tag': 'plain_text', 'content': '按%s做' % choice}, 'type': 'primary',
               'value': {'namespace': 'control-everything.automation.v1', 'task_id': waiting['task_id'],
                         'requirement_revision': waiting.get('requirement_revision'), 'choice': choice}}
              for choice in choices],
        ]},
    }


def reply_from_card(value, waiting):
    if (not isinstance(value, dict) or value.get('namespace') != 'control-everything.automation.v1'
            or value.get('task_id') != waiting.get('task_id')
            or ('flow_id' in waiting and value.get('flow_id') != waiting.get('flow_id'))
            or value.get('requirement_revision') != waiting.get('requirement_revision')
            or value.get('choice') not in (waiting.get('choices') or [])):
        return {'action': 'reject', 'reason': 'stale_or_foreign_card'}
    return {'action': 'execute', 'reason': 'explicit_choice', 'task_id': waiting['task_id'],
            'choice': value['choice']}


def _explicit_choice(text, choices):
    if not text.startswith('按') or not text.endswith('做'):
        return None
    wanted = text[1:-1].strip()
    matches = [choice for choice in choices if choice == wanted]
    return matches[0] if len(matches) == 1 else None
