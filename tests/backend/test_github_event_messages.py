"""Render signed event facts while keeping authors, actions and links distinct."""
from copy import deepcopy
from datetime import datetime, timezone
import json
import unittest

from control_everything.integrations.github_event_messages import render_event


REPO = 'example/project'
BASE = 'https://github.com/' + REPO
A, B = 'a' * 40, 'b' * 40


def payload(action='opened', **fields):
    issue = {'number': 7, 'title': '修复连接', 'state': 'open', 'state_reason': None,
             'assignees': [{'login': 'owner'}], 'user': {'login': 'author'}}
    pr = {**issue, 'merged': False}
    return {'action': action, 'repository': {'full_name': REPO}, 'sender': {'login': 'actor'},
            'issue': issue, 'pull_request': pr, **fields}


def push(**fields):
    commits = [{'id': A, 'message': '修复连接\n正文不应发布',
                'author': {'name': 'Actual Author', 'username': 'commit-author', 'email': 'private@example.test'}}]
    return payload(ref='refs/heads/develop', before=A, after=B, commits=commits,
                   pusher={'name': 'pusher'}, size=1, deleted=False, created=False, forced=False,
                   compare=BASE + '/compare/' + A + '...' + B, **fields)


class EventTemplateTests(unittest.TestCase):
    received = datetime(2026, 11, 11, 18, 2, 3, tzinfo=timezone.utc)
    delivery = '12345678-1234-4234-8234-123456789abc'

    def test_five_event_templates_have_scannable_fields_and_beijing_receipt_time(self):
        merged = payload('closed')
        merged['pull_request']['merged'] = True
        cases = [
            ('issues', payload('edited', changes={'title': {'from': 'old'}}), 'Issue 更新', 'Issue #7'),
            ('pull_request', merged, 'PR 已合并', 'PR #7'),
            ('push', push(), '代码推送', '分支：develop'),
            ('issue_comment', payload('created', comment={'id': 80, 'user': {'login': 'commenter'}}),
             'Issue 评论', 'Issue #7'),
            ('pull_request_review', payload('submitted', review={'id': 90, 'state': 'approved',
                                                                 'user': {'login': 'reviewer'}}),
             'PR 评审', 'PR #7'),
        ]
        for event, data, heading, item in cases:
            with self.subTest(event=event):
                text = render_event(event, data, REPO, received_at=self.received, delivery=self.delivery)
                self.assertTrue(text.startswith('<b>【' + heading + '】</b>\n'))
                for expected in ('仓库：' + REPO, '接收时间：2026-11-12 02:02:03（北京时间）',
                                 '操作人：actor', item, '\n查看：https://github.com/'):
                    self.assertIn(expected, text)
                for removed in ('事件编号', '变更：', '提交范围', '本次载荷', '总数未提供', '另计', '不代表任务验收'):
                    self.assertNotIn(removed, text)

    def test_push_time_is_receipt_time_and_all_branch_actions_remain_explicit(self):
        for flag, action in (('created', '新建分支并推送'), ('deleted', '删除分支'), ('forced', '强制推送')):
            with self.subTest(flag=flag):
                data = push()
                data[flag] = True
                data['head_commit'] = {'timestamp': '2001-01-01T00:00:00Z'}
                data['commits'][0]['timestamp'] = '2001-01-01T00:00:00Z'
                text = render_event('push', data, REPO, received_at=self.received)
                for expected in ('分支：develop', action, '2026-11-12 02:02:03'):
                    self.assertIn(expected, text)
                self.assertNotIn('2001-01-01', text)
                self.assertNotIn('事件编号：', text)

    def test_pr_conversation_comments_are_labeled_as_pr_comments(self):
        data = payload('created', comment={'id': 80, 'user': {'login': 'commenter'}})
        data['issue']['pull_request'] = {}
        self.assertTrue(render_event('issue_comment', data, REPO).startswith('<b>【PR 评论】</b>\n'))

    def test_default_receipt_time_is_labeled_and_naive_override_is_rejected(self):
        self.assertRegex(render_event('issues', payload(), REPO),
                         r'接收时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}（北京时间）')
        with self.assertRaisesRegex(ValueError, 'received_at_timezone_required'):
            render_event('issues', payload(), REPO, received_at=datetime(2026, 11, 12))


class IssueEventTests(unittest.TestCase):
    def test_opened_names_actor_and_current_owner(self):
        text = render_event('issues', payload(), REPO)
        for expected in ('actor', 'owner', 'Issue #7', '新建', BASE + '/issues/7'):
            self.assertIn(expected, text)

    def test_completion_and_not_planned_are_distinct(self):
        data = payload('closed')
        data['issue'].update(state='closed', state_reason='completed')
        text = render_event('issues', data, REPO)
        self.assertIn('标记完成', text)
        self.assertNotIn('验收另计', text)
        data['issue']['state_reason'] = 'not_planned'
        text = render_event('issues', data, REPO)
        self.assertIn('不再计划', text)
        self.assertNotIn('标记完成', text)

    def test_close_without_reason_does_not_infer_completion(self):
        text = render_event('issues', payload('closed'), REPO)
        self.assertIn('原因未提供', text)
        self.assertNotIn('标记完成', text)

    def test_edited_describes_fields_without_copying_bodies_or_old_values(self):
        data = payload('edited', changes={'title': {'from': 'private previous'}, 'body': {'from': 'secret body'}})
        data['issue']['body'] = 'private new body'
        text = render_event('issues', data, REPO)
        self.assertIn('标题', text)
        self.assertIn('正文', text)
        self.assertNotIn('private', text)
        self.assertNotIn('secret', text)

    def test_assignee_change_identifies_affected_person(self):
        data = payload('assigned', assignee={'login': 'new-owner'})
        self.assertIn('new-owner', render_event('issues', data, REPO))
        data['action'] = 'unassigned'
        self.assertIn('取消指派', render_event('issues', data, REPO))


class PullRequestEventTests(unittest.TestCase):
    def test_closed_requires_boolean_merged_true(self):
        data = payload('closed')
        text = render_event('pull_request', data, REPO)
        self.assertIn('关闭未合并', text)
        data['pull_request']['merged'] = True
        text = render_event('pull_request', data, REPO)
        self.assertIn('已合并', text)
        self.assertNotIn('验收、发布另计', text)
        for malformed in ('true', 1):
            with self.subTest(merged=malformed), self.assertRaises(ValueError):
                data['pull_request']['merged'] = malformed
                render_event('pull_request', data, REPO)

    def test_synchronize_is_new_commits_with_actual_before_and_after(self):
        data = payload('synchronize', before=A, after=B)
        text = render_event('pull_request', data, REPO)
        for expected in ('新提交', 'actor', '作者：author', BASE + '/pull/7'):
            self.assertIn(expected, text)
        self.assertNotIn('已完成', text)

    def test_ready_for_review_and_draft_actions_are_explicit(self):
        self.assertIn('可审查', render_event('pull_request', payload('ready_for_review'), REPO))
        self.assertIn('草稿', render_event('pull_request', payload('converted_to_draft'), REPO))

    def test_review_requested_names_reviewer(self):
        data = payload('review_requested', requested_reviewer={'login': 'reviewer'})
        self.assertIn('reviewer', render_event('pull_request', data, REPO))

    def test_pr_edit_explains_target_branch_change(self):
        data = payload('edited', changes={'base': {'ref': {'from': 'old'}}})
        self.assertIn('目标分支', render_event('pull_request', data, REPO))


class CommentAndReviewTests(unittest.TestCase):
    def test_issue_and_pr_conversation_comments_have_correct_canonical_anchors(self):
        for action, wording in (('created', '新增评论'), ('edited', '编辑评论'), ('deleted', '删除评论')):
            data = payload(action, comment={'id': 80, 'body': 'private comment', 'user': {'login': 'commenter'},
                                            'html_url': 'https://evil.test/private'})
            for is_pr, path in ((False, '/issues/7'), (True, '/pull/7')):
                with self.subTest(action=action, is_pr=is_pr):
                    if is_pr:
                        data['issue']['pull_request'] = {'url': 'untrusted'}
                    text = render_event('issue_comment', data, REPO)
                    self.assertIn(wording, text)
                    self.assertIn('actor', text)
                    self.assertIn('commenter', text)
                    self.assertIn(BASE + path + '#issuecomment-80', text)
                    self.assertNotIn('evil.test', text)
                    self.assertNotIn('private comment', text)

    def test_review_actions_preserve_real_review_state_and_review_author(self):
        for action, wording in (('submitted', '提交评审'), ('edited', '编辑评审'), ('dismissed', '撤销评审')):
            for state, label in (('approved', '批准'), ('changes_requested', '要求修改'), ('commented', '仅评论')):
                with self.subTest(action=action, state=state):
                    data = payload(action, review={'id': 90, 'state': state, 'user': {'login': 'reviewer'},
                                                   'body': 'private review', 'html_url': 'https://evil.test/review'})
                    text = render_event('pull_request_review', data, REPO)
                    for expected in (wording, label, 'actor', 'reviewer', '作者：author', BASE + '/pull/7#pullrequestreview-90'):
                        self.assertIn(expected, text)
                    self.assertNotIn('private review', text)
                    self.assertNotIn('evil.test', text)


class PushEventTests(unittest.TestCase):
    def test_push_emphasizes_subject_and_omits_repeated_people_email_and_body(self):
        text = render_event('push', push(), REPO)
        for expected in ('develop', 'actor', '提交总结：\n- 修复连接', '/compare/'):
            self.assertIn(expected, text)
        self.assertNotIn('commit-author', text)
        self.assertNotIn('推送人：', text)
        self.assertNotIn('private@example.test', text)
        self.assertNotIn('正文不应发布', text)
        self.assertNotIn('已完成', text)

    def test_push_lists_five_and_explicit_remaining_total(self):
        data = push()
        data['commits'] = [{**data['commits'][0], 'id': format(index, '040x'), 'message': f'change-{index}'} for index in range(1, 8)]
        data['size'] = 9
        text = render_event('push', data, REPO)
        self.assertNotIn('共 9', text)
        self.assertIn('另有 4', text)
        self.assertIn('change-5', text)
        self.assertNotIn('change-6', text)

    def test_deleted_branch_with_null_head_is_a_deletion(self):
        data = push()
        data.update(deleted=True, head_commit=None, commits=[], size=0, after='0' * 40)
        text = render_event('push', data, REPO)
        self.assertIn('删除分支', text)
        self.assertNotIn('新提交', text)

    def test_empty_push_with_null_head_is_safe(self):
        data = push()
        data.update(commits=[], size=0, head_commit=None)
        self.assertIn('本次没有新增提交', render_event('push', data, REPO))

    def test_missing_push_size_is_not_reported_as_a_known_total(self):
        data = push()
        del data['size']
        text = render_event('push', data, REPO)
        self.assertNotIn('总数未提供', text)
        self.assertNotIn('共 1', text)

    def test_tag_pushes_are_ignored(self):
        data = push()
        data['ref'] = 'refs/tags/v1.0'
        self.assertIsNone(render_event('push', data, REPO))

    def test_compare_link_cannot_escape_fixed_repository(self):
        for url in ('https://evil.test/compare/a...b', 'https://github.com/other/project/compare/a...b',
                    BASE + '/compare/../../other/project', BASE + '/compare/%2e%2e/%2e%2e/other',
                    BASE + '/compare/a\\..\\..\\other', BASE + '/compare/%252e%252e/%252e%252e/other'):
            with self.subTest(url=url):
                data = push()
                data['compare'] = url
                text = render_event('push', data, REPO)
                self.assertNotIn(url, text)
                self.assertIn(BASE + '/compare/' + A + '...' + B, text)


class EventCardTests(unittest.TestCase):
    def test_card_uses_plain_external_text_and_one_primary_view_link(self):
        from control_everything.integrations.github_event_messages import render_card
        body = ('<b>【代码推送】</b>\n仓库：' + REPO +
                '\n分支：develop\n<b>AI 总结：任务更清楚。</b>方便查看。' +
                '\n<b>AI 简评：</b>＜at id=all＞ **不要加粗** [恶意](https://evil.test)' +
                '\n' + BASE + '/blob/' + B + '/a.py#L1\n查看：' + BASE + '/compare/' + A + '...' + B)
        card = render_card(body, REPO)
        self.assertEqual(card['header']['template'], 'blue')
        self.assertEqual(card['header']['title']['content'], '代码推送')
        elements = card['elements']
        dynamic = [e['text']['content'] for e in elements if e['tag'] == 'div' and e['text']['tag'] == 'plain_text']
        self.assertTrue(any('**不要加粗** [恶意]' in value for value in dynamic))
        markdown = [e['text']['content'] for e in elements if e['tag'] == 'div' and e['text']['tag'] == 'lark_md']
        self.assertFalse(any('evil.test' in value for value in markdown))
        self.assertTrue(any('[查看代码](' + BASE + '/blob/' + B in value for value in markdown))
        actions = [e for e in elements if e['tag'] == 'action']
        self.assertEqual(len(actions), 1)
        self.assertEqual(len(actions[0]['actions']), 1)
        self.assertEqual(actions[0]['actions'][0]['url'], BASE + '/compare/' + A + '...' + B)

    def test_long_code_urls_are_replaced_and_utf8_request_stays_below_30kb(self):
        from control_everything.integrations.github_event_messages import render_card
        from control_everything.integrations.progress_feishu import FeishuSender
        from urllib.parse import quote
        target = BASE + '/compare/' + A + '...' + B
        for path in ('a' * 12000, quote('中文目录' * 1500, safe='/')):
            with self.subTest(path_prefix=path[:12]):
                code_url = BASE + '/blob/' + B + '/' + path + '#L1'
                lines = ['<b>【代码推送】</b>', '仓库：' + REPO, '操作人：' + '中文' * 500,
                         '分支：' + '路径' * 500, '<b>AI 总结：' + '进展' * 400 + '</b>']
                for _ in range(3):
                    lines.extend(['<b>AI 简评：</b>' + '具体问题"\\' * 50, code_url])
                card = render_card('\n'.join([*lines, '查看：' + target]), REPO)
                text = [e.get('text', {}).get('content', '') for e in card['elements']]
                self.assertEqual(text.count('代码位置请在下方查看'), 3)
                self.assertFalse(any(code_url in value for value in text))
                self.assertEqual(card['elements'][-1]['actions'][0]['url'], target)
                captured = []
                def request(url, payload, token):
                    if url.endswith('/internal'):
                        return {'code': 0, 'tenant_access_token': 'fixture'}
                    captured.append(json.dumps(payload, ensure_ascii=False).encode('utf-8'))
                    return {'code': 0, 'data': {'message_id': 'om_fixture', 'chat_id': 'oc_fixture'}}
                FeishuSender('cli_fixture', 'fixture', 'oc_fixture', request=request)(
                    'unused', 'same-uuid', message_payload=('interactive', json.dumps(card, ensure_ascii=False)))
                self.assertLess(len(captured[0]), 30 * 1024)

    def test_card_bounds_display_fields_without_truncating_the_target_url(self):
        from control_everything.integrations.github_event_messages import render_card
        target = BASE + '/pull/7'
        card = render_card('<b>【PR 更新】</b>\nPR #7 ' + '长' * 20000 + '\n查看：' + target, REPO)
        self.assertLess(len(str(card)), 3000)
        self.assertEqual(card['elements'][-1]['actions'][0]['url'], target)


class ValidationTests(unittest.TestCase):
    def test_unsupported_events_and_actions_are_ignored(self):
        self.assertIsNone(render_event('unknown', {}, REPO))
        for event in ('issues', 'pull_request', 'issue_comment', 'pull_request_review'):
            with self.subTest(event=event):
                self.assertIsNone(render_event(event, payload('unknown_action'), REPO))

    def test_supported_event_rejects_wrong_repository_and_invalid_object_number(self):
        data = payload()
        data['repository']['full_name'] = 'other/project'
        with self.assertRaises(ValueError):
            render_event('issues', data, REPO)
        for number in (True, 0, '7', None):
            with self.subTest(number=number), self.assertRaises(ValueError):
                data = payload()
                data['issue']['number'] = number
                render_event('issues', data, REPO)

    def test_missing_objects_and_malformed_fields_are_rejected(self):
        for event, field in (('issues', 'issue'), ('pull_request', 'pull_request')):
            with self.subTest(event=event), self.assertRaises(ValueError):
                data = payload()
                del data[field]
                render_event(event, data, REPO)
        for fields in ({'before': 'not-a-sha'}, {'commits': 'not-a-list'}, {'size': -1}):
            with self.subTest(fields=fields), self.assertRaises(ValueError):
                data = push()
                data.update(fields)
                render_event('push', data, REPO)

    def test_invalid_action_and_repository_field_types_are_rejected_cleanly(self):
        for action in ([], {}, 1):
            with self.subTest(action=action), self.assertRaises(ValueError):
                render_event('issues', payload(action), REPO)
        for name in (None, [], {}):
            with self.subTest(full_name=name), self.assertRaises(ValueError):
                data = payload()
                data['repository']['full_name'] = name
                render_event('issues', data, REPO)
        with self.assertRaises(ValueError):
            data = payload()
            data['issue']['assignees'] = {}
            render_event('issues', data, REPO)

    def test_source_text_is_sanitized_without_mutating_input(self):
        data = payload('edited', changes={'title': {'from': 'old'}})
        data['issue']['title'] = '<at user_id="all">所有人</at>\n新行\x00\u202e'
        original = deepcopy(data)
        text = render_event('issues', data, REPO)
        self.assertEqual(data, original)
        content = text.split('\n', 1)[1]
        for unsafe in ('<', '>', '\x00', '\u202e'):
            self.assertNotIn(unsafe, content)
        self.assertIn('＜at', text)


if __name__ == '__main__':
    unittest.main()
