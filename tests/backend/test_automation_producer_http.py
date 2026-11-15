"""Synthetic producer requests over the real HTTP and SQLite boundaries."""
import hashlib
import json
import os
import sys
import copy
from pathlib import Path
import unittest
from . import test_automation_mailbox_http as mailbox_tests
CLAIM, ACK = mailbox_tests.CLAIM, mailbox_tests.ACK

RECEIVE = '/remote/producer/automation/receive'


class AutomationProducerHTTPTests(unittest.TestCase):
    request = mailbox_tests.AutomationMailboxHTTPTests.request
    stop = mailbox_tests.AutomationMailboxHTTPTests.stop
    def setUp(self):
        mailbox_tests.AutomationMailboxHTTPTests.setUp(self)
        self.producer_token = 'synthetic-producer-' + 'a' * 43
        self.config = dict(producer_id='producer-a', token_sha256=hashlib.sha256(self.producer_token.encode()).hexdigest(),
                           channel_account_id='channel-a', app_id='app-a', chat_id='chat-a',
                           device_id=self.device['device_id'], generation=self.device['generation'], project_id='project-a')
        from control_everything.integrations.remote_hub.admin import build_service
        from .test_remote_hub_support import A, KEY
        self.config_path = Path(self.hub.store.path).parent / 'private.json'
        self.private = dict(issuer=A.issuer, database=str(self.hub.store.path), public_origin=self.hub.public_origin,
                            route_proof=self.hub.route_proof, ssh_host=self.hub.ssh_host, ssh_host_key=KEY,
                            ssh_keygen=sys.executable, provisioner_socket='synthetic-socket', admin_subjects=[],
                            static_paths=[], automation_producers=[self.config], token_verification='introspection',
                            introspection_client_id='synthetic-client', introspection_client_secret='synthetic-secret')
        self.config_path.write_text(json.dumps(self.private), encoding='utf-8')
        os.chmod(self.config_path, 0o600)
        loaded = build_service(self.config_path)
        self.hub.__dict__.update(loaded.__dict__)
        self.body = dict(producer_id='producer-a', event_id='event-producer', chat_id='chat-a', message_id='message-a',
                         actor_open_id='operator-a', decision=dict(namespace='control-everything.automation.v1',
                         decision_id='decision-a', task_id='task-a', delivery_id='delivery-a', expected_revision=1,
                         progress_revision=2, verdict='approved'))

    def receive(self, body=None, **options):
        return self.request(RECEIVE, self.body if body is None else body, token=self.producer_token, **options)

    def test_producer_replay_and_context(self):
        first = self.receive()
        self.assertEqual(first[0], 200)
        self.assertEqual(self.receive()[:2], first[:2])
        with self.hub.store.transaction() as db:
            db.execute('DELETE FROM automation_inbox WHERE id=?', (self.received['id'],))
        message = self.request(CLAIM)[1]['message']
        self.assertEqual(message['payload']['actor_open_id'], 'operator-a')
        self.assertEqual(message['payload']['project_id'], 'project-a')
        self.assertEqual(message['payload']['decision'], self.body['decision'])
        self.assertEqual(self.request(ACK, dict(message_id=message['id'], lease_id=message['lease_id']))[0], 200)
        self.assertEqual(self.receive()[1]['state'], 'acknowledged')

    def test_producer_boundaries(self):
        self.assertEqual(self.request(RECEIVE, self.body)[0], 401)
        self.assertEqual(self.receive(dict(self.body, chat_id='other'))[0], 403)
        for field in ('source', 'project_id', 'actor_role', 'device_id'):
            self.assertEqual(self.receive(dict(self.body, **{field:'forged'}))[0], 400)
        self.assertEqual(self.receive(dict(self.body, decision=dict(self.body['decision'], actor_role='owner')))[0], 400)
        self.assertEqual(self.receive(method='GET')[0], 405)
        self.assertEqual(self.request(RECEIVE+'?', self.body, token=self.producer_token)[0], 400)
        self.assertEqual(self.request(CLAIM, token=self.producer_token)[0], 401)

    def test_producer_storage_failure(self):
        with self.hub.store.transaction() as db:
            db.execute("CREATE TRIGGER reject_receive BEFORE INSERT ON automation_inbox BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END")
        self.assertEqual(self.receive()[0], 503)

    def test_rebuild_rotation_conflict_and_closed_config(self):
        from control_everything.integrations.remote_hub.admin import build_service
        first = self.receive()
        self.hub.__dict__.update(build_service(self.config_path).__dict__)
        self.assertEqual(self.receive()[:2], first[:2])
        changed = copy.deepcopy(self.body)
        changed['decision']['verdict'] = 'rejected'
        self.assertEqual(self.receive(changed)[0], 409)
        self.private['automation_producers'][0]['producer_id'] = 'rotated'
        self.private['automation_producers'][0]['token_sha256'] = hashlib.sha256(('b'*50).encode()).hexdigest()
        self.config_path.write_text(json.dumps(self.private), encoding='utf-8')
        self.hub.__dict__.update(build_service(self.config_path).__dict__)
        self.assertEqual(self.request(RECEIVE, dict(self.body, producer_id='rotated'), token='b'*50)[:2], first[:2])
        self.private['automation_producers'][0]['project_id'] = 'changed-route'
        self.config_path.write_text(json.dumps(self.private), encoding='utf-8')
        self.hub.__dict__.update(build_service(self.config_path).__dict__)
        self.assertEqual(self.request(RECEIVE, dict(self.body, producer_id='rotated'), token='b'*50)[0], 409)
        del self.private['automation_producers']
        self.config_path.write_text(json.dumps(self.private), encoding='utf-8')
        self.hub.__dict__.update(build_service(self.config_path).__dict__)
        self.assertEqual(self.receive()[0], 401)

    def test_revoked_target(self):
        self.hub.store.mark_revoking(self.device['device_id'])
        self.assertEqual(self.receive()[0], 409)

    def test_invalid_config_is_rejected(self):
        from control_everything.integrations.remote_hub.automation_producer import AutomationProducers
        for change in ({'generation': True}, {'token_sha256': 'BAD'}, {'actor_role': 'owner'}):
            with self.assertRaises(ValueError):
                AutomationProducers([dict(self.config, **change)])
        with self.assertRaises(ValueError):
            AutomationProducers([self.config, self.config])

    def test_generation_and_membership_are_checked_by_mailbox(self):
        from .test_remote_hub_support import A
        with self.hub.store.transaction() as db:
            db.execute('UPDATE devices SET generation=generation+1 WHERE device_id=?', (self.device['device_id'],))
        self.assertEqual(self.receive()[0], 409)
        with self.hub.store.transaction() as db:
            db.execute('UPDATE devices SET generation=generation-1 WHERE device_id=?', (self.device['device_id'],))
        self.hub.store.set_member(A, 'disabled')
        self.assertEqual(self.receive()[0], 403)

    def test_invalid_identity_and_body_do_not_persist(self):
        for token in ('wrong', 'synthetic-client', self.token):
            self.assertEqual(self.request(RECEIVE, self.body, token=token)[0], 401)
        for headers in ({'Authorization': ''}, {'Authorization':'', 'Cookie':'forged',
                         'X-Auth-Request-User':'account-a', 'X-CE-Route-Proof':self.hub.route_proof}):
            self.assertEqual(self.receive(headers=headers)[0], 401)
        self.assertEqual(self.receive(dict(self.body, producer_id='unknown'))[0], 401)
        for key, value in (('expected_revision', True), ('progress_revision', -1), ('verdict', 'execute'),
                           ('namespace', 'other'), ('decision_id', '')):
            body = copy.deepcopy(self.body)
            body['decision'][key] = value
            self.assertEqual(self.receive(body)[0], 400)
        for method in ('PUT', 'PATCH', 'DELETE', 'OPTIONS'):
            self.assertEqual(self.receive(method=method)[0], 405)
        self.assertEqual(self.receive(headers={'Content-Type':'text/plain'})[0], 415)
        with self.hub.store.transaction() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM automation_inbox').fetchone()[0], 1)

    def test_duplicate_security_headers_and_limit(self):
        import http.client
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=3)
        try:
            connection.putrequest('POST', RECEIVE)
            connection.putheader('Authorization', 'Bearer ' + self.producer_token)
            connection.putheader('Authorization', 'Bearer ' + self.producer_token)
            connection.putheader('Content-Type', 'application/json')
            connection.putheader('Content-Length', '0')
            connection.endheaders()
            response = connection.getresponse()
            self.assertEqual(response.status, 400)
            response.read()
        finally:
            connection.close()
        self.assertEqual(self.receive(dict(self.body, actor_open_id='a'*17000))[0], 413)

    def test_unsupported_verbs_keep_existing_surface_and_head_has_no_body(self):
        import http.client
        import inspect
        from http.server import BaseHTTPRequestHandler
        self.assertIn('NOT_IMPLEMENTED', inspect.getsource(BaseHTTPRequestHandler.handle_one_request))
        self.assertFalse(hasattr(BaseHTTPRequestHandler, 'do_PUT'))
        for method, path, expected in (('PUT', RECEIVE, 405), ('HEAD', RECEIVE, 405),
                                       ('PUT', CLAIM, 501), ('HEAD', CLAIM, 501)):
            connection = http.client.HTTPConnection(*self.server.server_address, timeout=3)
            try:
                connection.request(method, path, headers={'Authorization':'Bearer '+self.producer_token})
                response = connection.getresponse()
                self.assertEqual(response.status, expected)
                content = response.read()
                if method == 'HEAD':
                    self.assertEqual(content, b'')
            finally:
                connection.close()
