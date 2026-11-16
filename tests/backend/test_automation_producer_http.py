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

    def test_waiting_card_is_stored_once_and_claimed_by_its_producer(self):
        value = {'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
                 'requirement_revision': 3, 'choice': '按已审方案实现'}
        card = {'schema': '2.0', 'body': {'elements': [{'tag': 'markdown'}, {'tag': 'button', 'value': value}]}}
        first = self.request('/remote/desktop/automation/card', card)
        self.assertEqual(first[0], 200)
        self.assertFalse(first[1]['duplicate'])
        second = self.request('/remote/desktop/automation/card', card)
        self.assertEqual(second[1], {'id': first[1]['id'], 'duplicate': True, 'state': 'pending'})
        claimed = self.request('/remote/producer/automation/outbound/claim', {'producer_id': 'producer-a'},
                               token=self.producer_token)
        self.assertEqual(claimed[1]['card']['body']['elements'][1]['value']['flow_id'], 'flow-1')
        marked = self.request('/remote/producer/automation/outbound/sent',
                              {'producer_id': 'producer-a', 'id': claimed[1]['id'], 'message_id': 'om-card'},
                              token=self.producer_token)
        self.assertEqual(marked[1]['state'], 'sent')
        found = self.request('/remote/producer/automation/outbound/lookup',
                             {'producer_id': 'producer-a', 'message_id': 'om-card'}, token=self.producer_token)
        self.assertEqual(found[1]['card']['body']['elements'][1]['value']['flow_id'], 'flow-1')
        self.assertIsNone(self.request('/remote/producer/automation/outbound/lookup',
                                       {'producer_id': 'producer-a', 'message_id': 'om-missing'},
                                       token=self.producer_token)[1]['card'])
        self.assertIsNone(self.request('/remote/producer/automation/outbound/claim', {'producer_id': 'producer-a'},
                                       token=self.producer_token)[1]['card'])
        vague = {'schema': '2.0', 'body': {'elements': [{}, {'value': dict(value, choice='不错')}]}}
        self.assertEqual(self.request('/remote/desktop/automation/card', vague)[0], 400)
        acceptance = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'decision_id': 'accept-delivery', 'task_id': 'task',
            'delivery_id': 'delivery', 'flow_id': 'flow-1', 'expected_revision': 4, 'progress_revision': 5,
            'verdict': 'approved'}}]}}
        stored = self.request('/remote/desktop/automation/card', acceptance)
        self.assertEqual(stored[0], 200)
        self.assertNotEqual(stored[1]['id'], first[1]['id'])
        self.assertTrue(self.request('/remote/desktop/automation/card', acceptance)[1]['duplicate'])
        blocked = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 4, 'reason': 'integration_target_required'}}]}}
        held = self.request('/remote/desktop/automation/card', blocked)
        self.assertEqual(held[0], 200)
        self.assertNotIn(held[1]['id'], (first[1]['id'], stored[1]['id']))
        question = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 5, 'reason': 'human_decision_required'}}]}}
        asked = self.request('/remote/desktop/automation/card', question)
        self.assertEqual(asked[0], 200)
        self.assertNotIn(asked[1]['id'], (first[1]['id'], stored[1]['id'], held[1]['id']))
        revision = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 6, 'reason': 'plan_revision_limit'}}]}}
        limited = self.request('/remote/desktop/automation/card', revision)
        self.assertEqual(limited[0], 200)
        self.assertNotIn(limited[1]['id'], (first[1]['id'], stored[1]['id'], held[1]['id'], asked[1]['id']))
        changed = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 7, 'reason': 'requirement_changed'}}]}}
        stale = self.request('/remote/desktop/automation/card', changed)
        self.assertEqual(stale[0], 200)
        self.assertNotIn(stale[1]['id'], (first[1]['id'], stored[1]['id'], held[1]['id'], asked[1]['id'], limited[1]['id']))
        review = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 8, 'reason': 'independent_review_required'}}]}}
        blocked = self.request('/remote/desktop/automation/card', review)
        self.assertEqual(blocked[0], 200)
        self.assertNotIn(blocked[1]['id'], (first[1]['id'], stored[1]['id'], held[1]['id'], asked[1]['id'], limited[1]['id'], stale[1]['id']))
        moved = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 9, 'reason': 'project_directory_changed'}}]}}
        directory = self.request('/remote/desktop/automation/card', moved)
        self.assertEqual(directory[0], 200)
        self.assertNotIn(directory[1]['id'], (first[1]['id'], stored[1]['id'], held[1]['id'], asked[1]['id'], limited[1]['id'], stale[1]['id'], blocked[1]['id']))
        archived = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 10, 'reason': 'project_unavailable'}}]}}
        unavailable = self.request('/remote/desktop/automation/card', archived)
        self.assertEqual(unavailable[0], 200)
        self.assertNotIn(unavailable[1]['id'], (first[1]['id'], stored[1]['id'], held[1]['id'], asked[1]['id'], limited[1]['id'], stale[1]['id'], blocked[1]['id'], directory[1]['id']))
        drifted = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 11, 'reason': 'verification_evidence_invalid'}}]}}
        evidence = self.request('/remote/desktop/automation/card', drifted)
        self.assertEqual(evidence[0], 200)
        self.assertNotIn(evidence[1]['id'], (first[1]['id'], stored[1]['id'], held[1]['id'], asked[1]['id'], limited[1]['id'], stale[1]['id'], blocked[1]['id'], directory[1]['id'], unavailable[1]['id']))
        invalid = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 12, 'reason': 'invalid_code_review'}}]}}
        review = self.request('/remote/desktop/automation/card', invalid)
        self.assertEqual(review[0], 200)
        self.assertNotIn(review[1]['id'], (first[1]['id'], stored[1]['id'], held[1]['id'], asked[1]['id'], limited[1]['id'], stale[1]['id'], blocked[1]['id'], directory[1]['id'], unavailable[1]['id'], evidence[1]['id']))
        mismatch = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 13, 'reason': 'model_mismatch'}}]}}
        model = self.request('/remote/desktop/automation/card', mismatch)
        self.assertEqual(model[0], 200)
        self.assertNotIn(model[1]['id'], (first[1]['id'], stored[1]['id'], held[1]['id'], asked[1]['id'], limited[1]['id'], stale[1]['id'], blocked[1]['id'], directory[1]['id'], unavailable[1]['id'], evidence[1]['id'], review[1]['id']))
        missing = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 14, 'reason': 'model_unobserved'}}]}}
        unobserved = self.request('/remote/desktop/automation/card', missing)
        self.assertEqual(unobserved[0], 200)
        self.assertNotIn(unobserved[1]['id'], (model[1]['id'], review[1]['id']))
        unknown = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 15, 'reason': 'verification_unknown'}}]}}
        held_unknown = self.request('/remote/desktop/automation/card', unknown)
        self.assertEqual(held_unknown[0], 200)
        self.assertNotIn(held_unknown[1]['id'], (unobserved[1]['id'], model[1]['id']))
        checker = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 16, 'reason': 'verification_checker_unavailable'}}]}}
        held_checker = self.request('/remote/desktop/automation/card', checker)
        self.assertEqual(held_checker[0], 200)
        self.assertNotIn(held_checker[1]['id'], (held_unknown[1]['id'], unobserved[1]['id']))
        readonly = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 17, 'reason': 'read_only_result_unverified'}}]}}
        held_readonly = self.request('/remote/desktop/automation/card', readonly)
        self.assertEqual(held_readonly[0], 200)
        self.assertNotIn(held_readonly[1]['id'], (held_checker[1]['id'], held_unknown[1]['id']))
        callback = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 18, 'reason': 'verification_callback_unavailable'}}]}}
        held_callback = self.request('/remote/desktop/automation/card', callback)
        self.assertEqual(held_callback[0], 200)
        self.assertNotIn(held_callback[1]['id'], (held_readonly[1]['id'], held_checker[1]['id']))
        unpublished = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 19, 'reason': 'automation_delivery_unverified'}}]}}
        held_unpublished = self.request('/remote/desktop/automation/card', unpublished)
        self.assertEqual(held_unpublished[0], 200)
        self.assertNotIn(held_unpublished[1]['id'], (held_callback[1]['id'], held_readonly[1]['id']))
        busy = {'schema': '2.0', 'body': {'elements': [{}, {'value': {
            'namespace': 'control-everything.automation.v1', 'task_id': 'task', 'flow_id': 'flow-1',
            'requirement_revision': 20, 'reason': 'automation_project_busy'}}]}}
        held_busy = self.request('/remote/desktop/automation/card', busy)
        self.assertEqual(held_busy[0], 200)
        self.assertNotIn(held_busy[1]['id'], (held_unpublished[1]['id'], held_callback[1]['id']))

    def test_config_exposes_only_current_device_public_contexts(self):
        from control_everything.integrations.remote_hub.automation_producer import AutomationProducers
        configs = [self.config, dict(self.config, producer_id='other', device_id='other-device',
                   token_sha256='1' * 64), dict(self.config, producer_id='old', generation=99,
                   token_sha256='2' * 64)]
        self.hub.automation_producers = AutomationProducers(configs)
        status, body, *_ = self.request('/remote/desktop/config', method='GET')
        self.assertEqual(status, 200)
        contexts = body['automation_identity_contexts']
        self.assertEqual(contexts, [{key: value for key, value in self.config.items()
                                   if key != 'token_sha256'}])
        self.assertNotIn(self.producer_token, json.dumps(contexts))
        self.assertNotIn('token', json.dumps(contexts))

    def test_binding_transport_is_strict_and_persistent(self):
        body = {key: value for key, value in self.body.items() if key != 'decision'}
        body['binding'] = dict(namespace='control-everything.identity.v1', challenge_id='challenge', nonce='nonce')
        self.assertEqual(self.receive(body)[0], 200)
        with self.hub.store.transaction() as db:
            db.execute('DELETE FROM automation_inbox WHERE id=?', (self.received['id'],))
        payload = self.request(CLAIM)[1]['message']['payload']
        self.assertEqual(payload, dict(kind='feishu_identity_binding', producer_id='producer-a',
            project_id='project-a', channel_account_id='channel-a', app_id='app-a', chat_id='chat-a',
            message_id=body['message_id'], actor_open_id=body['actor_open_id'], binding=body['binding']))
        changed = dict(body, binding=dict(body['binding'], nonce='different'))
        self.assertEqual(self.receive(changed)[0], 409)
        for extra in ('app_id', 'project_id', 'actor_role'):
            self.assertEqual(self.receive(dict(body, **{extra: 'forged'}))[0], 400)
        self.assertEqual(self.receive(dict(body, decision=self.body['decision']))[0], 400)
        for extra in ('actor_open_id', 'app_id', 'role'):
            self.assertEqual(self.receive(dict(body, binding=dict(body['binding'], **{extra: 'forged'})))[0], 400)
        for change in ({'namespace': 'wrong'}, {'nonce': ''}, {'challenge_id': 1}):
            self.assertEqual(self.receive(dict(body, binding=dict(body['binding'], **change)))[0], 400)

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
