"""Classify a trusted human reply. A model summary is not a decision."""

VAGUE = ('不错', '可以考虑', '再看看', '以后可以')
PLAN_RELEASE = '按已审方案实现'


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
