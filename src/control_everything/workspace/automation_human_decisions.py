"""Classify a trusted human reply. A model summary is not a decision."""
import json

from control_everything.input_validation import ProfileError
from control_everything.workspace.automation_delivery_reviews import review_delivery
from control_everything.workspace.automation_identities import decision_authorized, trusted_context
from control_everything.workspace.native_progress import row_view

VAGUE = ('不错', '可以考虑', '再看看', '以后可以')
PLAN_RELEASE = '按已审方案实现'
ACCEPTANCE_REPLIES = {
    '这个版本通过，集成 develop': 'approved',
    '这一版要修改': 'changes_requested',
    '这一版不通过': 'rejected',
}


def integration_failure_card(flow, step):
    """A failed develop retest. The button does not claim success or retry."""
    task_id = (flow or {}).get('task_id')
    if (not task_id or (step or {}).get('kind') != 'integrate' or step.get('status') != 'unknown'
            or (step.get('result') or {}).get('reason') != 'integration_incomplete'):
        raise ValueError('integration_failure_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': 'develop 复测未通过'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': 0, 'reason': 'integration_retest_failed'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '集成没有完成'}},
            'body': {'elements': [{'tag': 'markdown', 'content': 'develop 复测没有通过。这不是成功，也不会自动重试。'}, button]}}


def rejection_card(flow):
    """A rejected delivery stays rejected. The button does not resume work."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = attention.get('expected_revision')
    if (not task_id or flow.get('status') != 'waiting_external' or flow.get('phase') != 'acceptance'
            or attention.get('reason') != 'acceptance_rejected' or type(revision) is not int or revision < 0):
        raise ValueError('rejection_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '这一版已拒绝'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'acceptance_rejected'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '验收未通过'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '这一版已拒绝。不会自动返修，也不会集成 develop。'}, button]}}


def verification_card(flow):
    """Verification is missing. The button does not invent a command."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (not task_id or attention.get('reason') != 'verification_not_configured'
            or type(revision) is not int or revision < 0):
        raise ValueError('verification_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '还没有验证命令'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'verification_not_configured'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '需要验证'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '实现已停下。没有验证命令，所以不会自称测试通过。'}, button]}}


def refusal_card(flow):
    """A read-only launch was refused. The button does not continue with writes."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    reason = attention.get('reason')
    if (flow.get('status') != 'waiting_external'
            or reason not in ('read_only_launch_args_unsupported', 'read_only_command_override_unsupported')
            or not task_id or type(revision) is not int or revision < 0):
        raise ValueError('refusal_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '只读启动被拒绝'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': reason}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '不能继续'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '只读启动被拒绝。不会改用可写方式继续，也不会进入验收。'}, button]}}


def changed_plan_card(flow):
    """The reviewed plan no longer matches. The button does not start that plan."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'automation_plan_changed'
            or not task_id or type(revision) is not int or revision < 0):
        raise ValueError('changed_plan_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '方案已变化'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'automation_plan_changed'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '不能开工'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '方案在审查后变了。不会按旧方案开始实现。'}, button]}}


def planning_card(flow):
    """The planning result is not usable. The button does not start implementation."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'invalid_planning_result'
            or not task_id or type(revision) is not int or revision < 0):
        raise ValueError('planning_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '规划结果无效'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'invalid_planning_result'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '不能开工'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '规划结果无效。不会按这个结果开始实现。'}, button]}}


def busy_card(flow):
    """Another write holds the project. The button does not accept this delivery."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'automation_project_busy'
            or not task_id or type(revision) is not int or revision < 0):
        raise ValueError('busy_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '项目正在写入'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'automation_project_busy'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '不能进入验收'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '项目正在被别的写入占用。不会进入验收。'}, button]}}


def unpublished_card(flow):
    """Verification did not become a delivery. The button does not accept it."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'automation_delivery_unverified'
            or not task_id or type(revision) is not int or revision < 0):
        raise ValueError('unpublished_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '不能形成交付'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'automation_delivery_unverified'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '不能进入验收'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '验证结果不能形成交付。不会进入验收。'}, button]}}


def callback_card(flow):
    """Verification cannot run. The button does not invent a command or claim success."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'verification_callback_unavailable'
            or not task_id or type(revision) is not int or revision < 0):
        raise ValueError('callback_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '还不能验证'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'verification_callback_unavailable'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '不能当成测试通过'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '没有验证回调。不会执行测试，也不会把这一步当成通过。'}, button]}}


def read_only_card(flow):
    """A read-only result could not be checked. The button does not continue or accept."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'read_only_result_unverified'
            or not task_id or type(revision) is not int or revision < 0):
        raise ValueError('read_only_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '只读结果未核对'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'read_only_result_unverified'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '不能继续'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '只读步骤的结果无法核对。不会继续实现，也不会进入验收。'}, button]}}


def checker_card(flow):
    """No checker can reread the receipt. The button does not claim the tests passed."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'verification_checker_unavailable'
            or not task_id or type(revision) is not int or revision < 0):
        raise ValueError('checker_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '还不能复核验证'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'verification_checker_unavailable'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '不能进入验收'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '没有复核验证证据。不会把这一步当成测试通过，也不会进入验收。'}, button]}}


def unknown_verification_card(flow):
    """Verification ended unknown. The button does not claim success or retry."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'verification_unknown' or not task_id
            or type(revision) is not int or revision < 0):
        raise ValueError('unknown_verification_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '验证结果未知'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'verification_unknown'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '不能当成测试通过'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '验证结果未知。不会当成测试通过，也不会自动重试。'}, button]}}


def model_card(flow):
    """The observed model is missing or wrong. The button does not continue the step."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    reason = attention.get('reason')
    if (flow.get('status') != 'waiting_external' or reason not in ('model_unobserved', 'model_mismatch') or not task_id
            or type(revision) is not int or revision < 0):
        raise ValueError('model_card_unavailable')
    text = ('没有观察到这一步的模型。不会把这一步当成完成。' if reason == 'model_unobserved'
            else '这一步的模型与要求不一致。不会继续。')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '模型未按要求执行'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': reason}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '不能继续'}},
            'body': {'elements': [{'tag': 'markdown', 'content': text}, button]}}


def invalid_review_card(flow):
    """The code review was not a verdict. The button does not accept the work."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'invalid_code_review' or not task_id
            or type(revision) is not int or revision < 0):
        raise ValueError('invalid_review_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '审查结果无效'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'invalid_code_review'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '不能进入验收'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '代码审查没有给出有效结论。不会进入验收。'}, button]}}


def evidence_card(flow):
    """Tested sources changed. The button does not accept the old delivery."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'verification_evidence_invalid'
            or not task_id or type(revision) is not int or revision < 0):
        raise ValueError('evidence_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '测试后的文件已变化'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'verification_evidence_invalid'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '不能当成测试通过'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '测试之后文件变了。不会把这一版当成测试通过，也不会用旧决定验收。'}, button]}}


def unavailable_card(flow):
    """The project is unavailable. The button does not start the old plan."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'project_unavailable' or not task_id
            or type(revision) is not int or revision < 0):
        raise ValueError('unavailable_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '项目已不可用'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'project_unavailable'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '旧方案不能开工'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '项目已不可用。旧方案不会开始实现。'}, button]}}


def directory_card(flow):
    """The project directory changed. The button does not choose a directory or start the old plan."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'project_directory_changed' or not task_id
            or type(revision) is not int or revision < 0):
        raise ValueError('directory_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '目录已变化'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'project_directory_changed'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '旧方案不能开工'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '项目目录已经变了。旧方案不会在新目录里开始实现。'}, button]}}


def independent_review_card(flow):
    """The review shared a session with the work. The button does not accept it."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'independent_review_required' or not task_id
            or type(revision) is not int or revision < 0):
        raise ValueError('independent_review_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '审查不是独立的'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'independent_review_required'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '不能进入验收'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '审查和被审查的工作是同一次会话。不会进入验收。'}, button]}}


def requirement_card(flow):
    """The requirement changed. The button does not start the old plan or accept an old delivery."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_external' or attention.get('reason') != 'requirement_changed' or not task_id
            or type(revision) is not int or revision < 0):
        raise ValueError('requirement_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '需求版本已变化'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'requirement_changed'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '旧决定已失效'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '需求版本已经变了。旧方案不会开始实现，旧验收也不会覆盖新版本。'}, button]}}


def plan_revision_card(flow):
    """Two plan revisions are used. The button does not grant another round or start implementation."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (attention.get('versions') or {}).get('requirement_revision')
    if (flow.get('status') != 'waiting_user' or attention.get('reason') != 'plan_revision_limit' or not task_id
            or attention.get('release_ready') is True or type(revision) is not int or revision < 0):
        raise ValueError('plan_revision_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '两轮方案修订已用尽'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'plan_revision_limit'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '需要人处理'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '同一方案的两轮修订已经用尽。不会再自动改方案，也不会开始实现。'}, button]}}


def repair_budget_card(flow):
    """The repair budget is exhausted. The button does not grant another round."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = (flow.get('context') or {}).get('requirement_revision')
    if (not task_id or attention.get('reason') != 'repair_budget_exhausted' or attention.get('repair_rounds') != 2
            or type(revision) is not int or revision < 0):
        raise ValueError('repair_budget_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '两轮返修已用尽'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'repair_budget_exhausted'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '需要人处理'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '测试和审查共用的两轮返修已经用尽。不会再自动修改。'}, button]}}


def target_wait_card(flow):
    """A blocked integration wait. The button does not register a target or start integration."""
    attention = (flow or {}).get('attention') or {}
    task_id = flow.get('task_id')
    revision = attention.get('expected_revision')
    if (flow.get('status') != 'waiting_external' or flow.get('phase') != 'integration' or not task_id
            or attention.get('reason') != 'integration_not_connected' or attention.get('integration_target')
            or type(revision) is not int or revision < 0):
        raise ValueError('target_wait_card_unavailable')
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': '需要登记 develop 目标'}, 'type': 'primary',
              'value': {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'flow_id': flow['id'],
                        'requirement_revision': revision, 'reason': 'integration_target_required'}}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '集成还不能开始'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '验收已记录。还没有 develop 集成目标，所以不会开始集成。'}, button]}}


def acceptance_card(flow):
    """A card for the current delivery. It does not accept by being sent."""
    attention = (flow or {}).get('attention') or {}
    delivery_id = attention.get('delivery_id')
    task_id = flow.get('task_id')
    if (flow.get('status') != 'awaiting_acceptance' or not task_id or not isinstance(delivery_id, str) or not delivery_id
            or type(attention.get('expected_revision')) is not int or type(attention.get('progress_revision')) is not int):
        raise ValueError('acceptance_card_unavailable')
    shared = {'namespace': 'control-everything.automation.v1', 'task_id': task_id, 'delivery_id': delivery_id,
              'flow_id': flow['id'], 'expected_revision': attention['expected_revision'],
              'progress_revision': attention['progress_revision']}
    buttons = [{'tag': 'button', 'text': {'tag': 'plain_text', 'content': label}, 'type': 'primary',
                'value': {**shared, 'decision_id': prefix + delivery_id, 'verdict': verdict}}
               for prefix, verdict, label in (
                   ('accept-', 'approved', '这个版本通过，集成 develop'),
                   ('change-', 'changes_requested', '这一版要修改'),
                   ('reject-', 'rejected', '这一版不通过'))]
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '待验收'}},
            'body': {'elements': [{'tag': 'markdown', 'content': '当前交付可以验收。通过后只集成 develop。'}, *buttons]}}


def waiting_card(flow):
    """A card for the current wait. It does not grant acceptance or start work by itself."""
    attention = (flow or {}).get('attention') or {}
    task_id = (flow.get('context') or {}).get('input', {}).get('brief', {}).get('task_id') or flow.get('task_id')
    if flow.get('status') != 'waiting_user' or not task_id:
        raise ValueError('waiting_card_unavailable')
    revision = attention.get('versions', {}).get('requirement_revision')
    shared = {'namespace': 'control-everything.automation.v1', 'task_id': task_id,
              'flow_id': flow['id'], 'requirement_revision': revision}
    decision = attention.get('decision')
    if decision:
        elements = [{'tag': 'div', 'text': {'tag': 'plain_text', 'content': decision['question']}}]
        for option in decision['options']:
            elements.extend([
                {'tag': 'div', 'text': {'tag': 'plain_text', 'content': option['label'] + '：' + option['impact']}},
                {'tag': 'button', 'text': {'tag': 'plain_text', 'content': option['label']},
                 'value': {**shared, 'decision_id': decision['decision_id'], 'choice_id': option['id']}},
            ])
        return {'project_id': flow['project_id'], 'schema': '2.0',
                'header': {'title': {'tag': 'plain_text', 'content': '需要决定'}},
                'body': {'elements': elements}}
    if attention.get('release_ready') is True and not attention.get('questions'):
        question = '已审方案可以开始实现吗？'
        label = PLAN_RELEASE
        value = {**shared, 'choice': PLAN_RELEASE}
    else:
        questions = attention.get('questions') or []
        if type(revision) is not int or revision < 0 or any(not isinstance(item, str) or not item.strip() for item in questions):
            raise ValueError('waiting_card_ambiguous')
        question = '\n'.join(questions) if questions else '方案需要决定。这张卡片不会开始实现。'
        label = '需要说明'
        value = {**shared, 'reason': 'human_decision_required'}
    button = {'tag': 'button', 'text': {'tag': 'plain_text', 'content': label}, 'type': 'primary', 'value': value}
    return {'schema': '2.0', 'header': {'title': {'tag': 'plain_text', 'content': '需要决定'}},
            'body': {'elements': [{'tag': 'markdown', 'content': question}, button]}}


def apply_acceptance_decisions(store, service, binding):
    """Apply a stored Feishu acceptance. It does not accept a different delivery."""
    if service is None or any(not binding.get(key) for key in ('hub_origin', 'device_id', 'generation')):
        return []
    with store.connection() as db:
        rows = db.execute('''SELECT payload_json FROM automation_remote_inbox
            WHERE hub_origin=? AND device_id=? AND generation=? AND ack_state IN ('pending','acknowledged')
            ORDER BY received_at,message_id''',
            (binding['hub_origin'], binding['device_id'], binding['generation'])).fetchall()
    applied = []
    for row in rows:
        decision = _stored_acceptance(row['payload_json'])
        if decision is None or not decision_authorized(
                store, decision['actor_id'], task_id=decision['task_id'], trusted=decision['trusted'], device=binding):
            continue
        try:
            applied.append(review_delivery(service, decision['task_id'], decision['body'], reviewer=decision['actor_id']))
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
            or type(actor) is not str or not actor or trusted_context(payload) is None):
        return None
    reason = {'approved': '这个版本通过，集成 develop', 'changes_requested': '飞书要求修改', 'rejected': '飞书拒绝'}
    return {'task_id': decision['task_id'], 'trusted': trusted_context(payload), 'body': {
        'expected_revision': decision['expected_revision'], 'progress_revision': decision['progress_revision'],
        'delivery_id': decision['delivery_id'], 'verdict': decision['verdict'], 'reason': reason[decision['verdict']],
        'confirmed': True, 'client_token': decision['decision_id']}, 'actor_id': actor}


def apply_plan_releases(store, consumer, binding):
    """Apply a stored release for the current wait. Replay returns the same step."""
    if any(not binding.get(key) for key in ('hub_origin', 'device_id', 'generation')):
        return []
    with store.connection() as db:
        rows = db.execute('''SELECT payload_json FROM automation_remote_inbox
            WHERE hub_origin=? AND device_id=? AND generation=? AND ack_state IN ('pending','acknowledged')
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
        if not decision_authorized(store, release['actor_id'], flow_id=release['flow_id'],
                                   trusted=release['trusted'], device=binding):
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
            or type(release.get('requirement_revision')) is not int or type(actor) is not str or not actor
            or trusted_context(payload) is None):
        return None
    return {'flow_id': release['flow_id'], 'requirement_revision': release['requirement_revision'],
            'actor_id': actor, 'trusted': trusted_context(payload)}


def apply_plan_choices(store, consumer, binding):
    if any(not binding.get(key) for key in ('hub_origin', 'device_id', 'generation')):
        return
    with store.connection() as db:
        rows = db.execute("""SELECT payload_json FROM automation_remote_inbox
            WHERE hub_origin=? AND device_id=? AND generation=? AND ack_state IN ('pending','acknowledged')
              AND json_extract(payload_json, '$.kind')='feishu_plan_choice'
            ORDER BY received_at,message_id""",
            (binding['hub_origin'], binding['device_id'], binding['generation'])).fetchall()
    fields = {'namespace', 'task_id', 'flow_id', 'requirement_revision', 'decision_id', 'choice_id'}
    for row in rows:
        payload = json.loads(row['payload_json'])
        choice, actor = payload.get('plan_choice'), payload.get('actor_open_id')
        if (type(choice) is not dict or set(choice) != fields
                or choice['namespace'] != 'control-everything.automation.v1'
                or type(choice['requirement_revision']) is not int or choice['requirement_revision'] < 0
                or any(type(choice[key]) is not str or not choice[key]
                       for key in ('task_id', 'flow_id', 'decision_id', 'choice_id'))
                or type(actor) is not str or not actor):
            continue
        try:
            consumer.select_plan_option(choice, actor, trusted_context(payload), binding)
        except ProfileError as error:
            if str(error) == 'automation_owner_lost':
                raise


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
            and attention.get('release_ready') is True and not attention.get('questions')
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


def acceptance_reply(text, card):
    """A reply decides only the acceptance button it answers. Another card is not a choice."""
    verdict = ACCEPTANCE_REPLIES.get(text)
    elements = ((card or {}).get('body') or {}).get('elements')
    if verdict is None or not isinstance(elements, list):
        return None
    fields = ('namespace', 'decision_id', 'task_id', 'delivery_id', 'expected_revision', 'progress_revision', 'verdict')
    matches = []
    for element in elements:
        if not isinstance(element, dict) or element.get('tag') != 'button':
            continue
        content = element.get('text').get('content') if isinstance(element.get('text'), dict) else None
        value = element.get('value')
        if (content != text or not isinstance(value, dict) or value.get('verdict') != verdict
                or value.get('namespace') != 'control-everything.automation.v1'
                or any(not isinstance(value.get(key), str) or not value[key] for key in ('decision_id', 'task_id', 'delivery_id'))
                or any(type(value.get(key)) is not int or value[key] < 0 for key in ('expected_revision', 'progress_revision'))):
            continue
        matches.append({key: value[key] for key in fields})
    return matches[0] if len(matches) == 1 else None


def release_reply(text, card):
    """A reply releases only the card it answers. Unrelated text does not choose a flow."""
    value = (((card or {}).get('body') or {}).get('elements') or [None, None])[1]
    value = value.get('value') if isinstance(value, dict) else None
    if (text != PLAN_RELEASE or not isinstance(value, dict) or value.get('choice') != PLAN_RELEASE
            or value.get('namespace') != 'control-everything.automation.v1'
            or not isinstance(value.get('flow_id'), str) or not value['flow_id']
            or type(value.get('requirement_revision')) is not int):
        return None
    return {'namespace': value['namespace'], 'flow_id': value['flow_id'], 'text': PLAN_RELEASE,
            'requirement_revision': value['requirement_revision']}


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
