"""Compute planning advice from completed, independently bound step records."""

import json

from control_everything.workspace.native_progress import digest, fail

KINDS = ('small', 'feature', 'permission', 'complex')


def _read(step, kind):
    if step.get('kind') != kind or step.get('status') != 'completed':
        fail('invalid_planning_result')
    try:
        value = json.loads(step['result']['text'])
    except (KeyError, TypeError, ValueError):
        fail('invalid_planning_result')
    fields = {'kind', 'questions'} | ({'plan', 'needs_human'} if kind == 'plan' else {'verdict', 'rationale'})
    if (type(value) is not dict or set(value) != fields or value['kind'] not in KINDS
            or type(value['questions']) is not list
            or any(type(question) is not str or not question.strip() for question in value['questions'])):
        fail('invalid_planning_result')
    text = value['plan' if kind == 'plan' else 'rationale']
    if type(text) is not str or not text.strip():
        fail('invalid_planning_result')
    if kind == 'plan':
        if type(value['needs_human']) is not bool:
            fail('invalid_planning_result')
    elif value['verdict'] not in ('approve', 'revise', 'discuss'):
        fail('invalid_planning_result')
    return value


def read_plan(step):
    return _read(step, 'plan')


def _session(step):
    binding = step.get('binding') or {}
    session = binding.get('providerSession') or {}
    identity = (binding.get('agent'), session.get('key'), session.get('id'))
    if any(type(part) is not str or not part.strip() for part in identity):
        fail('independent_review_required')
    return identity


def planning_outcome(plan_step, review_step):
    plan, review = read_plan(plan_step), _read(review_step, 'plan_review')
    request = plan_step.get('request') or {}
    review_request = review_step.get('request') or {}
    target = review_request.get('review_of') or {}
    context, review_context = request.get('context') or {}, review_request.get('context') or {}
    if (not plan_step.get('flow_id') or plan_step['flow_id'] != review_step.get('flow_id')
            or not plan_step.get('id') or target.get('step_id') != plan_step['id']
            or target.get('text_sha256') != digest(plan_step['result']['text'])
            or any(context.get(key) is None or context[key] != review_context.get(key)
                   for key in ('requirement_revision', 'brief_revision', 'policy_version'))):
        fail('automation_plan_changed')
    if _session(plan_step) == _session(review_step):
        fail('independent_review_required')
    attempt = request.get('plan_attempt')
    if type(attempt) is not int or attempt < 0:
        fail('invalid_planning_result')
    questions = list(dict.fromkeys(plan['questions'] + review['questions']))
    result = {'action': 'wait_for_user', 'questions': questions,
              'requires_code_review': plan['kind'] != 'small' or review['kind'] != 'small'}
    if plan['needs_human'] or questions or review['verdict'] == 'discuss':
        return result
    if review['verdict'] == 'revise':
        if attempt < 2:
            result.update(action='revise_plan', next_attempt=attempt + 1)
        else:
            result['reason'] = 'plan_revision_limit'
    elif not result['requires_code_review']:
        result['action'] = 'implement'
    return result
