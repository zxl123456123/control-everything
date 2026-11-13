"""Check fixed routing, UUID reuse and categorized failures before real delivery."""
import json
import unittest
from unittest.mock import patch

from control_everything.integrations.progress_feishu import FeishuSender
from control_everything.integrations.progress_notifications import NotSent


class FeishuProgressTests(unittest.TestCase):
    def test_sends_fixed_group_text_with_delivery_uuid_and_reuses_token(self):
        calls = []
        def request(path, payload, token):
            calls.append((path, payload, token))
            if path.endswith('/internal'):
                return {'code': 0, 'tenant_access_token': 'fixture', 'expire': 7200}
            return {'code': 0, 'data': {'message_id': 'om_fixture', 'chat_id': 'oc_fixture'}}
        sender = FeishuSender('cli_fixture', 'fixture', 'oc_fixture', request=request)
        self.assertEqual(sender('公告', 'delivery-uuid'), 'om_fixture')
        sender('另一条', 'other-uuid')
        self.assertEqual(len(calls), 3)
        self.assertEqual(calls[1][1]['uuid'], 'delivery-uuid')
        self.assertEqual(calls[1][1]['receive_id'], 'oc_fixture')
        self.assertEqual(json.loads(calls[1][1]['content']), {'text': '公告'})

    def test_sends_frozen_interactive_content_without_reencoding_it(self):
        calls = []
        def request(path, payload, token):
            calls.append(payload)
            return ({'code': 0, 'tenant_access_token': 'fixture'} if path.endswith('/internal') else
                    {'code': 0, 'data': {'message_id': 'om_fixture', 'chat_id': 'oc_fixture'}})
        sender = FeishuSender('cli_fixture', 'fixture', 'oc_fixture', request=request)
        content = '{"elements": [], "header": {"title": {"tag": "plain_text", "content": "进展"}}}'
        sender('ignored display body', 'same-uuid', message_payload=('interactive', content))
        self.assertEqual(calls[-1], {'receive_id': 'oc_fixture', 'msg_type': 'interactive',
                                    'uuid': 'same-uuid', 'content': content})

    def test_token_failure_is_known_not_sent(self):
        sender = FeishuSender('cli_fixture', 'fixture', 'oc_fixture',
                              request=lambda *args: {'code': 999, 'msg': 'private response'})
        with self.assertRaises(NotSent) as error:
            sender('公告', 'delivery-uuid')
        self.assertNotIn('private', str(error.exception))

    def test_bad_post_receipt_is_unknown_not_a_pre_send_failure(self):
        def request(path, payload, token):
            return ({'code': 0, 'tenant_access_token': 'fixture'} if path.endswith('/internal') else
                    {'code': 0, 'data': {'message_id': 'om_fixture', 'chat_id': 'oc_other'}})
        with self.assertRaisesRegex(ValueError, 'message_route_mismatch'):
            FeishuSender('cli_fixture', 'fixture', 'oc_fixture', request=request)('公告', 'delivery-uuid')

    def test_rechecks_window_after_token_fetch_before_message_post(self):
        calls = []
        def request(path, payload, token):
            calls.append(path)
            return {'code': 0, 'tenant_access_token': 'fixture'}
        with patch('control_everything.integrations.progress_feishu.time.time', return_value=101):
            with self.assertRaisesRegex(NotSent, 'delivery_window_expired'):
                FeishuSender('cli_fixture', 'fixture', 'oc_fixture', request=request)('公告', 'same-uuid', deadline=100)
        self.assertEqual(calls, ['auth/v3/tenant_access_token/internal'])


if __name__ == '__main__':
    unittest.main()
