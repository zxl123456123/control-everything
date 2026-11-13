"""Actual loopback requests for device-bound mailbox transport, without task execution."""

from concurrent.futures import ThreadPoolExecutor
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import Mock

from control_everything.http.remote_hub import build_server
from control_everything.integrations.remote_hub.automation_mailbox import AutomationMailbox
from control_everything.integrations.remote_hub.identity import HubError
from .test_remote_hub_support import A, B, bind, service

CLAIM = '/remote/desktop/automation/claim'
ACK = '/remote/desktop/automation/ack'


class AutomationMailboxHTTPTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.hub = service(Path(temporary.name) / 'hub.db')
        self.hub.identities = Mock()
        self.hub.identities.authenticate.side_effect = HubError('invalid_identity', 401)
        self.device = bind(self.hub)
        self.token = self.device['control_token']
        self.mailbox = AutomationMailbox(self.hub.store)
        self.payload = {'kind': 'decision', 'task_id': 'task-a', 'decision_id': 'decision-a'}
        self.received = self.mailbox.receive(self.device['device_id'], self.device['generation'],
                                             'feishu:test-app', 'event-a', self.payload)
        self.server = build_server(('127.0.0.1', 0), self.hub)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': .01}, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop)

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, path, body=None, *, token=None, headers=None, method='POST'):
        fields = {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (token or self.token)}
        fields.update(headers or {})
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=3)
        try:
            connection.request(method, path, json.dumps(body if body is not None else {}), fields)
            response = connection.getresponse()
            return response.status, json.loads(response.read()), dict(response.getheaders())
        finally:
            connection.close()

    def test_claim_ack_and_idempotent_ack_use_device_credential(self):
        status, data, headers = self.request(CLAIM)
        self.assertEqual(status, 200)
        message = data['message']
        self.assertEqual((message['id'], message['payload']), (self.received['id'], self.payload))
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertNotIn('Access-Control-Allow-Origin', headers)
        self.assertNotIn('Set-Cookie', headers)
        body = {'message_id': message['id'], 'lease_id': message['lease_id']}
        for _ in range(2):
            self.assertEqual(self.request(ACK, body)[:2], (200, {'id': message['id'], 'state': 'acknowledged'}))
        self.assertEqual(self.request(CLAIM)[:2], (200, {'message': None}))
        self.hub.identities.authenticate.assert_not_called()

    def test_forged_identity_and_cookie_do_not_replace_device_token(self):
        for headers in ({'Authorization': ''}, {'Authorization': 'Bearer wrong-token'},
                        {'Authorization': '', 'Cookie': 'forged', 'X-Auth-Request-User': A.sub,
                         'X-CE-Route-Proof': self.hub.route_proof}):
            self.assertEqual(self.request(CLAIM, headers=headers)[0], 401)
        self.assertIsNotNone(self.request(CLAIM)[1]['message'])

    def test_strict_post_bodies_and_query_rejection_do_not_claim(self):
        for body in ({'device_id': self.device['device_id']}, {'command': 'not-executed'}, ['not-object']):
            self.assertEqual(self.request(CLAIM, body)[0], 400)
        for path in (CLAIM + '?', CLAIM + '?token=wrong'):
            self.assertEqual(self.request(path)[0], 400)
        self.assertEqual(self.request(CLAIM, method='GET')[0], 405)
        self.assertEqual(self.request(ACK, {'message_id': self.received['id']})[0], 400)
        self.assertEqual(self.request(CLAIM, headers={'Content-Type': 'text/plain'})[0], 415)
        self.assertIsNotNone(self.request(CLAIM)[1]['message'])

    def test_foreign_device_cannot_read_or_ack_message(self):
        other = bind(self.hub, identity=B)
        self.assertEqual(self.request(CLAIM, token=other['control_token'])[:2], (200, {'message': None}))
        message = self.request(CLAIM)[1]['message']
        body = {'message_id': message['id'], 'lease_id': message['lease_id']}
        self.assertEqual(self.request(ACK, body, token=other['control_token'])[0], 409)
        self.assertEqual(self.request(ACK, body)[0], 200)

    def test_revocation_between_claim_and_ack_rejects_both_operations(self):
        message = self.request(CLAIM)[1]['message']
        self.hub.store.mark_revoking(self.device['device_id'])
        self.assertEqual(self.request(ACK, {'message_id': message['id'], 'lease_id': message['lease_id']})[0], 401)
        self.assertEqual(self.request(CLAIM)[0], 401)

    def test_concurrent_http_claims_return_only_one_lease(self):
        with ThreadPoolExecutor(4) as workers:
            results = list(workers.map(lambda _: self.request(CLAIM), range(4)))
        self.assertEqual([status for status, _, _ in results], [200] * 4)
        self.assertEqual(sum(result['message'] is not None for _, result, _ in results), 1)

    def test_failure_to_persist_ack_reports_unavailable_and_leaves_pending(self):
        message = self.request(CLAIM)[1]['message']
        with self.hub.store.transaction() as db:
            db.execute("CREATE TRIGGER reject_ack BEFORE UPDATE OF acknowledged_at ON automation_inbox "
                       "BEGIN SELECT RAISE(ABORT, 'synthetic storage failure'); END")
        body = {'message_id': message['id'], 'lease_id': message['lease_id']}
        self.assertEqual(self.request(ACK, body)[:2], (503, {'error': 'hub_unavailable'}))
        with self.hub.store.transaction() as db:
            self.assertIsNone(db.execute('SELECT acknowledged_at FROM automation_inbox').fetchone()[0])
            db.execute('DROP TRIGGER reject_ack')
        self.assertEqual(self.request(ACK, body)[0], 200)
