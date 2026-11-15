"""A Feishu plan release is a durable producer event, not a chat turn."""
import hashlib
import unittest

from control_everything.integrations.remote_hub.automation_producer import AutomationProducers
from control_everything.integrations.remote_hub.identity import HubError


class Mailbox:
    def receive(self, device_id, generation, source, event_id, payload):
        self.last = payload
        return {'id': event_id, 'state': 'pending'}


class PlanReleaseTests(unittest.TestCase):
    def test_exact_release_is_stored_and_other_text_is_rejected(self):
        token = 'producer-token'
        producers = AutomationProducers([{
            'producer_id': 'father', 'token_sha256': hashlib.sha256(token.encode()).hexdigest(),
            'channel_account_id': 'account', 'app_id': 'app', 'chat_id': 'oc-chat',
            'device_id': 'device', 'generation': 1, 'project_id': 'project'}])
        mailbox = Mailbox()
        body = {'producer_id': 'father', 'event_id': 'evt-1', 'chat_id': 'oc-chat',
                'message_id': 'om-1', 'actor_open_id': 'ou-owner',
                'plan_release': {'namespace': 'control-everything.automation.v1', 'flow_id': 'flow-1',
                                 'text': '按已审方案实现', 'requirement_revision': 3}}
        self.assertEqual(producers.receive(mailbox, token, body)['state'], 'pending')
        self.assertEqual(mailbox.last['kind'], 'feishu_plan_release')
        self.assertEqual(mailbox.last['plan_release']['flow_id'], 'flow-1')
        body['plan_release'] = dict(body['plan_release'], text='不错')
        with self.assertRaises(HubError):
            producers.receive(mailbox, token, body)
