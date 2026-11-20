"""Compute planning advice from completed, independently bound step records."""

import json
import re

from control_everything.workspace.native_progress import digest, fail

KINDS = ('small', 'feature', 'permission', 'complex')
IMPLEMENT_DECISION_MARKER = 'AUTOMATION_IMPLEMENT_DECISION_V1'
IMPLEMENT_DECISION_PROMPT = (
    '\nIf a concrete implementation trade-off remains inside the reviewed plan, stop at the end of this turn '
    'and return only ' + IMPLEMENT_DECISION_MARKER + ' on the first line, followed by JSON '
    '{"decision":{"question":"specific decision","options":[{"id":"first","label":"short choice",'
    '"impact":"concrete consequence"},{"id":"second","label":"distinct choice","impact":"distinct consequence"}]}}. '
    'Only ask about choices within the frozen scope. Neither option may change behavior, permissions or requirements. '
    'If work requires a scope change, return the same marker followed by {"scope_change_required":true}, '
    'and do not make the change. Otherwise return the usual implementation summary.'
)


def _read(step, kind):
    if step.get('kind') != kind or step.get('status') != 'completed':
        fail('invalid_planning_result')
    try:
        value = json.loads(step['result']['text'])
    except (KeyError, TypeError, ValueError):
        fail('invalid_planning_result')
    fields = {'kind', 'questions'} | ({'plan', 'needs_human'} if kind == 'plan' else {'verdict', 'rationale'})
    optional = {'decision'} if kind == 'plan_review' else set()
    if (type(value) is not dict or not fields <= set(value) <= fields | optional or value['kind'] not in KINDS
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
    if 'decision' in value:
        if value['verdict'] != 'discuss' or not _valid_decision(value['decision']):
            fail('invalid_planning_result')
    return value


def _valid_decision(decision):
    def valid_text(text, limit):
        return type(text) is str and bool(text.strip()) and len(text) <= limit

    if (type(decision) is not dict or set(decision) != {'question', 'options'}
            or not valid_text(decision['question'], 300)
            or type(decision['options']) is not list or len(decision['options']) != 2):
        return False
    first, second = decision['options']
    return (all(type(option) is dict and set(option) == {'id', 'label', 'impact'}
                and type(option['id']) is str and re.fullmatch(r'[a-z][a-z0-9_-]{0,31}', option['id'])
                and valid_text(option['label'], 60) and valid_text(option['impact'], 400)
                for option in (first, second))
            and all(first[key].strip().casefold() != second[key].strip().casefold()
                    for key in ('id', 'label', 'impact')))


def read_plan(step):
    return _read(step, 'plan')


def implementation_decision(text):
    if IMPLEMENT_DECISION_MARKER not in text:
        return None
    marker, _, body = text.strip().partition('\n')
    if marker.strip() == IMPLEMENT_DECISION_MARKER:
        try:
            value = json.loads(body)
        except (TypeError, ValueError):
            value = None
        if type(value) is dict:
            if set(value) == {'scope_change_required'} and value['scope_change_required'] is True:
                fail('automation_plan_changed')
            if set(value) == {'decision'} and _valid_decision(value['decision']):
                return value['decision']
    fail('invalid_implementation_decision')


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
    if 'decision' in review:
        result['decision'] = {'decision_id': review_step['id'], **review['decision']}
    if plan['needs_human'] or questions or review['verdict'] == 'discuss':
        return result
    if review['verdict'] == 'revise':
        if attempt < 2:
            result.update(action='revise_plan', next_attempt=attempt + 1)
        else:
            result['reason'] = 'plan_revision_limit'
    elif not result['requires_code_review']:
        result['action'] = 'implement'
    else:
        result['release_ready'] = True
    return result
