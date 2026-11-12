"""Describe GitHub webhook facts without copying bodies or trusting supplied links."""
import re
from urllib.parse import unquote, urlsplit

from control_everything.integrations.progress_report import _text


ACTIONS = {
    'issues': {'opened': '新建', 'edited': '更新', 'deleted': '删除', 'closed': '关闭', 'reopened': '重新打开',
               'assigned': '指派', 'unassigned': '取消指派', 'labeled': '添加标签', 'unlabeled': '移除标签',
               'milestoned': '设置里程碑', 'demilestoned': '移除里程碑', 'locked': '锁定讨论', 'unlocked': '解锁讨论'},
    'pull_request': {'opened': '新建', 'edited': '更新', 'closed': '关闭', 'reopened': '重新打开',
                     'synchronize': '推送新提交', 'ready_for_review': '转为可审查', 'converted_to_draft': '转为草稿',
                     'assigned': '指派', 'unassigned': '取消指派', 'review_requested': '请求评审',
                     'review_request_removed': '移除评审请求', 'labeled': '添加标签', 'unlabeled': '移除标签',
                     'locked': '锁定讨论', 'unlocked': '解锁讨论',
                     'auto_merge_enabled': '启用自动合并', 'auto_merge_disabled': '停用自动合并'},
    'issue_comment': {'created': '新增评论', 'edited': '编辑评论', 'deleted': '删除评论'},
    'pull_request_review': {'submitted': '提交评审', 'edited': '编辑评审', 'dismissed': '撤销评审'},
}


def _mapping(value):
    if not isinstance(value, dict):
        raise ValueError('event_object_required')
    return value


def _required(value):
    if not isinstance(value, str) or not _text(value):
        raise ValueError('event_text_required')
    return _text(value)


def _person(value):
    return _required(_mapping(value).get('login'))


def _number(value):
    if type(value) is not int or not 0 < value < 2 ** 63:
        raise ValueError('event_number_required')
    return value


def _sha(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{40}(?:[0-9a-f]{24})?', value):
        raise ValueError('event_commit_required')
    return value


def _object(item, kind, base):
    item = _mapping(item)
    number, title = _number(item.get('number')), _required(item.get('title'))
    if kind == 'PR':
        who = '作者：' + (_person(item['user']) if item.get('user') is not None else '未提供')
    else:
        owners = item.get('assignees', [])
        if not isinstance(owners, list):
            raise ValueError('event_assignees_invalid')
        who = '负责人：' + ('、'.join(_person(owner) for owner in owners) or '未认领')
    return f'{kind} #{number} {title}（{who}）', f'{base}/{"pull" if kind == "PR" else "issues"}/{number}'


def _compare(value, base, before, after):
    if isinstance(value, str):
        parsed = urlsplit(value)
        path = unquote(parsed.path)
        if (parsed.scheme == 'https' and parsed.netloc == 'github.com' and not parsed.query and not parsed.fragment
                and _text(value) == value and '\\' not in path and '%' not in path
                and path.startswith(urlsplit(base).path + '/compare/') and path.rsplit('/compare/', 1)[-1]
                and not any(part in ('.', '..') for part in path.split('/'))):
            return value
    return f'{base}/compare/{before}...{after}'


def _push(payload, base, actor):
    ref = payload.get('ref')
    if not isinstance(ref, str):
        raise ValueError('event_ref_required')
    if not ref.startswith('refs/heads/'):
        return None
    branch = _required(ref[len('refs/heads/'):])
    before, after = _sha(payload.get('before')), _sha(payload.get('after'))
    flags = [payload.get(name, False) for name in ('deleted', 'created', 'forced')]
    if any(type(flag) is not bool for flag in flags):
        raise ValueError('event_push_flags_invalid')
    pusher = _required(_mapping(payload.get('pusher')).get('name'))
    action = '删除分支' if flags[0] else '新建分支并推送' if flags[1] else '强制推送' if flags[2] else '推送分支'
    lines = [f'GitHub · {base.removeprefix("https://github.com/")} · push',
             f'操作：{actor}；推送人：{pusher}；{action} {branch}（{before[:7]} → {after[:7]}）']
    if flags[0]:
        return '\n'.join([*lines, base])
    commits = payload.get('commits')
    if not isinstance(commits, list):
        raise ValueError('event_commits_invalid')
    total = payload.get('size', len(commits))
    if type(total) is not int or total < len(commits):
        raise ValueError('event_push_size_invalid')
    count = f'共 {total} 条' if 'size' in payload else '总数未提供'
    lines.append(f'本次载荷 {len(commits)} 条提交，{count}；不代表任务验收或发布。')
    for commit in commits[:5]:
        commit = _mapping(commit)
        author = _mapping(commit.get('author'))
        name = _required(author.get('username') or author.get('name') or '作者未提供')
        message = commit.get('message')
        if not isinstance(message, str):
            raise ValueError('event_commit_message_required')
        subject = _text((message.splitlines() or [''])[0])
        lines.append(f'- {_sha(commit.get("id"))[:7]} 作者：{name}；{subject[:240]}{"…" if len(subject) > 240 else ""}')
    if total > 5:
        lines.append(f'另有 {total - 5} 条未展开，请查看对比。')
    return '\n'.join([*lines, _compare(payload.get('compare'), base, before, after)])


def render_event(event: str, payload: dict, repository: str) -> str | None:
    """Return approved event wording, None for ignored actions, or reject malformed facts."""
    if event not in (*ACTIONS, 'push'):
        return None
    payload = _mapping(payload)
    action = payload.get('action')
    if event != 'push' and not isinstance(action, str):
        raise ValueError('event_action_required')
    if event != 'push' and action not in ACTIONS[event]:
        return None
    full_name = _mapping(payload.get('repository')).get('full_name')
    if (not isinstance(repository, str) or not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository)
            or any(part in ('.', '..') for part in repository.split('/'))
            or not isinstance(full_name, str) or full_name.casefold() != repository.casefold()):
        raise ValueError('event_repository_mismatch')
    base, actor = 'https://github.com/' + repository, _person(payload.get('sender'))
    if event == 'push':
        return _push(payload, base, actor)
    item = _mapping(payload.get('pull_request' if event in ('pull_request', 'pull_request_review') else 'issue'))
    kind = 'PR' if event in ('pull_request', 'pull_request_review') or 'pull_request' in item else 'Issue'
    label, link = _object(item, kind, base)
    detail = ACTIONS[event][action]
    if event == 'issues' and action == 'closed':
        detail = {'completed': '关闭（标记完成；人工验收另计）', 'not_planned': '关闭（不再计划，不计完成）'}.get(item.get('state_reason'), '关闭（原因未提供，不计完成）')
    elif event == 'pull_request' and action == 'closed':
        if type(item.get('merged')) is not bool:
            raise ValueError('event_merged_flag_required')
        detail = '已合并（验收、发布另计）' if item['merged'] else '关闭未合并'
    elif event == 'pull_request' and action == 'synchronize':
        detail += f'（{_sha(payload.get("before"))[:7]} → {_sha(payload.get("after"))[:7]}）'
    if event in ('issues', 'pull_request') and action == 'edited':
        fields = _mapping(payload.get('changes', {}))
        names = {'title': '标题', 'body': '正文', 'base': '目标分支'}
        detail += '：' + ('、'.join(names.get(name, '其他资料') for name in fields) or '字段未注明')
    if action in ('assigned', 'unassigned'):
        detail += ' ' + _person(payload.get('assignee'))
    if action in ('labeled', 'unlabeled'):
        detail += ' ' + _required(_mapping(payload.get('label')).get('name'))
    if action in ('review_requested', 'review_request_removed'):
        detail += ' ' + (_person(payload['requested_reviewer']) if payload.get('requested_reviewer') else
                         '团队：' + _required(_mapping(payload.get('requested_team')).get('slug')))
    if event in ('issue_comment', 'pull_request_review'):
        comment = _mapping(payload.get('comment' if event == 'issue_comment' else 'review'))
        detail += '；原作者：' + _person(comment.get('user'))
        link += '#' + ('issuecomment-' if event == 'issue_comment' else 'pullrequestreview-') + str(_number(comment.get('id')))
        if event == 'pull_request_review':
            state = _required(comment.get('state')).upper()
            states = {'APPROVED': '已批准', 'CHANGES_REQUESTED': '要求修改', 'COMMENTED': '仅评论', 'DISMISSED': '已撤销', 'PENDING': '尚未提交'}
            if state not in states:
                raise ValueError('event_review_state_invalid')
            detail += f'；评审状态：{states[state]}（{state}）'
    return f'GitHub · {repository} · {event}.{action}\n操作：{actor}；{detail}\n{label}\n{link}'
