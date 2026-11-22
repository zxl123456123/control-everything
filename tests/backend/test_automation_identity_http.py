"""Loopback HTTP checks for local identity facts, without sending any messages."""
import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import Mock

from control_everything.http.gateway import PanelHandler
from control_everything.integrations.remote_connector import ConnectorError
from tests.backend import test_profile_http


class IdentityHTTPTests(unittest.TestCase):
    def setUp(self):
        test_profile_http.ProfileHTTPTests.setUp(self)
        fixture = self.server
        server = ThreadingHTTPServer(('127.0.0.1',0),PanelHandler)
        server.__dict__.update(vars(fixture))
        self.server = server
        server.expected_host = '127.0.0.1:'+str(server.server_address[1])
        server.origin = server.local_origin = 'http://'+server.expected_host
        self.binding = {'hub_origin':'https://hub.example.test','device_id':'device','generation':1,'credential_revision':1}
        self.context = {k:v for k,v in self.binding.items() if k != 'credential_revision'}
        self.context.update(project_id='p',producer_id='producer',channel_account_id='account',app_id='app',chat_id='chat')
        self.connector = server.remote_connector = Mock()
        self.connector.current_binding.side_effect = lambda:dict(self.binding)
        self.connector.identity_context.side_effect = lambda producer,project:dict(self.context)
        self.connector.list_identity_contexts.return_value = [self.context,{**self.context,'project_id':'other'}]
        with self.profile.store.connection() as db:
            db.execute("INSERT INTO projects VALUES('p','Project',0,'now','now',0)")
        self.base = '/api/workspace/projects/p/automation-identities'
        thread = threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.01},daemon=True)
        thread.start()
        def stop():
            server.shutdown()
            server.server_close()
            thread.join(2)
        self.addCleanup(stop)

    def request(self,path='',method='GET',body=None,headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address,timeout=3)
        data = body if isinstance(body,bytes) else json.dumps(body).encode() if body is not None else None
        fields = {'Host':self.server.expected_host,'X-Session-Client':'panel'}
        if method == 'POST':
            fields.update(Origin=self.server.origin,**{'X-Session-CSRF':'token','Content-Type':'application/json'})
        fields.update(headers or {})
        try:
            connection.request(method,self.base+path,data,fields)
            response = connection.getresponse()
            return response.status,json.loads(response.read())
        finally:
            connection.close()

    def test_create_freezes_trusted_context_without_sending(self):
        status,created = self.request('/challenges','POST',{'producer_id':'producer'})
        self.assertEqual(status,201,created)
        self.assertTrue(created['nonce'])
        status, facts = self.request()
        self.assertEqual(status,200,facts)
        self.assertEqual(facts['identities'][0]['state'],'awaiting_message')
        self.assertEqual(facts['identities'][0]['candidates'],[])
        self.connector.identity_context.assert_called_once_with('producer','p')
        self.connector.register_identity_send.assert_not_called()
        self.connector.identity_send_status.assert_not_called()
        self.assertEqual(self.request('/contexts')[1]['contexts'],[self.context])

    def test_local_authority_and_strict_body(self):
        for path,method,body in (('', 'GET',None),('/challenges','POST',{'producer_id':'producer'})):
            for headers in ({'Origin':'https://evil.example'},{'X-CE-Proxy-Token':'forged'}):
                with self.subTest(method=method,path=path,header_names=tuple(headers)):
                    self.assertEqual(self.request(path,method,body,headers)[0],403)
        with self.subTest(method='POST',path='/challenges',header_names=('X-Session-CSRF',)):
            self.assertEqual(self.request('/challenges','POST',{'producer_id':'producer'},{'X-Session-CSRF':'wrong'})[0],403)
        for body in ({'producer_id':'producer','app_id':'forged'},{'producer_id':'producer','generation':2}, {'producer_id':1}, []):
            self.assertEqual(self.request('/challenges','POST',body)[0],400)
        self.assertEqual(self.request('/challenges','POST',b' '*16385)[0],413)
        self.assertEqual(self.request('?x=1')[0],400)
        self.assertEqual(self.request('/confirm','POST',{'candidate_id':'invalid'})[0],400)
        self.assertEqual(self.request('/attach-message','POST',{})[0],404)


    def test_explicit_confirm_revoke_with_internal_simulated_candidates(self):
        import hashlib
        from control_everything.workspace.automation_remote_inbox import RemoteAutomationInbox
        created = self.request('/challenges','POST',{'producer_id':'producer'})[1]
        service = self.workspace.identity_service(self.connector.current_binding)
        service.attach_message('p',created['challenge_id'],'card')
        candidates = []
        for actor in ('one','two'):
            envelope = {k:self.context[k] for k in ('producer_id','channel_account_id','app_id','chat_id')}
            envelope.update(message_id='card',nonce=created['nonce'],actor_open_id=actor,event_id=actor,inbox_message_id=actor)
            payload = {'kind':'feishu_identity_binding','project_id':'p',
                       **{k:envelope[k] for k in ('producer_id','channel_account_id','app_id','chat_id','message_id','actor_open_id')},
                       'binding':{'namespace':'control-everything.identity.v1','challenge_id':created['challenge_id'],'nonce':created['nonce']}}
            source = 'feishu:'+hashlib.sha256(json.dumps(['account','app'],separators=(',', ':')).encode()).hexdigest()
            RemoteAutomationInbox(self.profile.store).receive(self.binding,
                {'id':actor,'source':source,'event_id':actor,'payload':payload,'lease_id':'lease','lease_expires_at':100})
            candidates.append(service.receive_candidate('p',created['challenge_id'],envelope))
        facts = self.request()[1]['identities'][0]
        self.assertEqual(len(facts['candidates']),2)
        self.assertEqual(facts['bindings'],[])
        status,fact = self.request('/confirm','POST',{'candidate_id':candidates[1]['id']})
        self.assertEqual(status,200,fact)
        self.assertEqual(fact['candidate_id'],candidates[1]['id'])
        self.assertEqual(self.request('/revoke','POST',{'binding_id':fact['id']})[1]['state'],'revoked')
        self.binding['generation'] = 2
        self.assertEqual(self.request()[1]['identities'],[])
        self.assertEqual(self.request('/confirm','POST',{'candidate_id':candidates[0]['id']})[0],400)
        with self.profile.store.connection() as db:
            for table in ('task_reviews','task_items','automation_flows'):
                self.assertEqual(db.execute('SELECT count(*) FROM '+table).fetchone()[0],0)

    def test_acceptor_is_a_confirmed_binding_not_a_typed_open_id(self):
        import hashlib
        from control_everything.workspace.automation_identities import decision_authorized
        from control_everything.workspace.automation_remote_inbox import RemoteAutomationInbox
        created = self.request('/challenges','POST',{'producer_id':'producer'})[1]
        service = self.workspace.identity_service(self.connector.current_binding)
        service.attach_message('p',created['challenge_id'],'card')
        envelope = {k:self.context[k] for k in ('producer_id','channel_account_id','app_id','chat_id')}
        envelope.update(message_id='card',nonce=created['nonce'],actor_open_id='owner',event_id='owner',inbox_message_id='owner')
        payload = {'kind':'feishu_identity_binding','project_id':'p',
                   **{k:envelope[k] for k in ('producer_id','channel_account_id','app_id','chat_id','message_id','actor_open_id')},
                   'binding':{'namespace':'control-everything.identity.v1','challenge_id':created['challenge_id'],'nonce':created['nonce']}}
        source = 'feishu:'+hashlib.sha256(json.dumps(['account','app'],separators=(',', ':')).encode()).hexdigest()
        RemoteAutomationInbox(self.profile.store).receive(self.binding,
            {'id':'owner','source':source,'event_id':'owner','payload':payload,'lease_id':'lease','lease_expires_at':100})
        candidate = service.receive_candidate('p',created['challenge_id'],envelope)
        binding = self.request('/confirm','POST',{'candidate_id':candidate['id']})[1]
        task = self.profile.store.save_item({'title':'Need an acceptor','project_id':'p','provider_id':None,'state':'todo','session_key':None})
        device = {'hub_origin':'https://hub.example.test','device_id':'device','generation':1}
        trusted = {'project_id':'p','app_id':'app'}
        self.assertFalse(decision_authorized(self.profile.store,'owner',task_id=task['id'],trusted=trusted,device=device))
        self.assertEqual(self.request('/acceptor','POST',{'task_id':task['id'],'open_id':'owner'})[0],400)
        status, named = self.request('/acceptor','POST',{'task_id':task['id'],'binding_id':binding['id']})
        self.assertEqual(status,200,named)
        self.assertEqual(named['open_id'],'owner')
        self.assertTrue(decision_authorized(self.profile.store,'owner',task_id=task['id'],trusted=trusted,device=device))
        self.assertFalse(decision_authorized(self.profile.store,'other',task_id=task['id'],trusted=trusted,device=device))
        self.assertEqual(self.request('/acceptor')[0],405)

    def test_missing_dependencies_and_method_shapes(self):
        self.assertEqual(self.request('/challenges')[0],405)
        self.assertEqual(self.request('','POST',{})[0],405)
        self.assertEqual(self.request('?')[0],400)
        self.server.remote_connector = None
        self.assertEqual(self.request()[0],503)

    def test_grant_new_task_role_with_a_separately_selected_reviewer(self):
        from tests.backend.test_automation_queue import bind_actor

        initiator = bind_actor(self.profile.store, 'p', 'initiator')
        reviewer = bind_actor(self.profile.store, 'p', 'reviewer')
        with self.profile.store.connection() as db:
            db.execute("INSERT INTO project_directories VALUES('p','main','fixture','fixture',1)")
        body = {'binding_id': initiator, 'reviewer_binding_id': reviewer, 'directory_id': 'main', 'enabled': True}
        self.assertEqual(self.request('/assignment', 'POST', body, {'X-Session-CSRF': 'wrong'})[0], 403)
        self.assertEqual(self.request('/assignment', 'POST', {**body, 'reviewer_binding_id': 'reviewer'})[0], 400)
        self.assertEqual(self.request('/assignment', 'POST', body), (200, body))
        with self.profile.store.connection() as db:
            stored = db.execute('SELECT binding_id,reviewer_binding_id,directory_id FROM automation_assignment_grants').fetchone()
            self.assertEqual(tuple(stored), (initiator, reviewer, 'main'))
        revoked = {**body, 'enabled': False}
        self.assertEqual(self.request('/assignment', 'POST', revoked), (200, revoked))
        with self.profile.store.connection() as db:
            self.assertIsNone(db.execute('SELECT 1 FROM automation_assignment_grants').fetchone())

    def test_pending_configuration_change_rejects_without_writes(self):
        from types import SimpleNamespace
        self.server.desktop = SimpleNamespace(configuration_changed=True)
        for path,body in (('/challenges',{'producer_id':'producer'}),('/send',{'producer_id':'producer'}),
                          ('/confirm',{'candidate_id':'a'*32})):
            self.assertEqual(self.request(path,'POST',body)[0],409)
        with self.profile.store.connection() as db:
            for table in ('automation_identity_challenges','automation_identity_bindings'):
                self.assertEqual(db.execute('SELECT count(*) FROM '+table).fetchone()[0],0)
        self.connector.identity_context.assert_not_called()
        self.connector.register_identity_send.assert_not_called()

    def test_send_registers_once_without_pending_or_role(self):
        def register(context, challenge):
            self.assertEqual(context, self.context)
            self.assertEqual(set(challenge), {'challenge_id', 'nonce', 'expires_at'})
            self.assertTrue(challenge['nonce'])
            return {'challenge_id': challenge['challenge_id'], 'state': 'queued', 'nonce': challenge['nonce']}
        self.connector.register_identity_send.side_effect = register
        status, body = self.request('/send', 'POST', {'producer_id': 'producer'})
        self.assertEqual(status, 202, body)
        self.assertEqual(body, {'challenge_id': body['challenge_id'], 'transport_state': 'queued'})
        self.assertNotIn('nonce', json.dumps(body))
        self.assertEqual(self.connector.register_identity_send.call_count, 1)
        fact = self.request()[1]['identities'][0]
        self.assertEqual(fact['state'], 'awaiting_message')
        self.assertEqual(fact['candidates'], [])
        self.assertEqual(fact['bindings'], [])
        with self.profile.store.connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM automation_identity_bindings').fetchone()[0], 0)
            for table in ('task_reviews', 'task_items', 'automation_flows'):
                self.assertEqual(db.execute('SELECT count(*) FROM ' + table).fetchone()[0], 0)

    def test_send_failure_keeps_challenge_and_does_not_retry(self):
        self.connector.register_identity_send.side_effect = ConnectorError('identity_send_context_changed', 409)
        status, body = self.request('/send', 'POST', {'producer_id': 'producer'})
        self.assertEqual(status, 409, body)
        self.assertEqual(set(body), {'reason', 'challenge_id'})
        self.assertEqual(body['reason'], 'identity_send_context_changed')
        self.assertNotIn('nonce', json.dumps(body))
        self.assertEqual(self.connector.register_identity_send.call_count, 1)
        fact = self.request()[1]['identities'][0]
        self.assertEqual(fact['id'], body['challenge_id'])
        self.assertEqual(fact['state'], 'awaiting_message')
        self.assertEqual(fact['bindings'], [])
        self.connector.register_identity_send.side_effect = ConnectorError('remote_network_unavailable')
        status, unknown = self.request('/send', 'POST', {'producer_id': 'producer'})
        self.assertEqual((status, set(unknown), unknown['transport_state']), (202, {'challenge_id', 'transport_state'}, 'unknown'))
        self.assertEqual(self.connector.register_identity_send.call_count, 2)
        self.assertEqual(len(self.request()[1]['identities']), 2)
        self.connector.register_identity_send.return_value = {'challenge_id': '0' * 32, 'state': 'queued'}
        self.connector.register_identity_send.side_effect = None
        status, unverified = self.request('/send', 'POST', {'producer_id': 'producer'})
        self.assertEqual(unverified['transport_state'], 'unknown')
        self.assertEqual(status, 202)

    def test_send_rejects_bad_body_without_a_challenge(self):
        self.assertEqual(self.request('/send')[0], 405)
        self.assertEqual(self.request('/send', 'POST', {'producer_id': 'producer', 'nonce': 'forged'})[0], 400)
        self.connector.identity_context.side_effect = ConnectorError('remote_identity_context_unavailable', 409)
        self.assertEqual(self.request('/send', 'POST', {'producer_id': 'missing'})[0], 409)
        self.connector.register_identity_send.assert_not_called()
        with self.profile.store.connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM automation_identity_challenges').fetchone()[0], 0)

class RejectedProxyBodyTests(unittest.TestCase):
    def handler(self, method):
        import io
        from email.message import Message
        from types import SimpleNamespace
        handler = PanelHandler.__new__(PanelHandler)
        handler.server = SimpleNamespace(expected_host='127.0.0.1:1234')
        handler.path = '/api/workspace/projects/p/automation-identities/challenges'
        handler.headers = Message()
        handler.headers['Host'] = '127.0.0.1:1234'
        handler.headers['X-CE-Proxy-Token'] = 'forged'
        handler.headers['Content-Length'] = '2'
        handler.rfile = io.BytesIO(b'{}')
        handler.connection = Mock()
        handler.connection.gettimeout.return_value = 3
        handler._post_body_pending = method == 'POST'
        return handler

    def test_rejected_proxy_discards_actual_post_body_before_reply(self):
        handler = self.handler('POST')
        events = []
        original = handler._discard_rejected_post_body
        def discard():
            events.append('discard')
            original()
        handler._discard_rejected_post_body = Mock(side_effect=discard)
        def reply(*args):
            events.append('reply')
            self.assertEqual(handler.rfile.tell(),2)
        handler.reply = Mock(side_effect=reply)
        self.assertFalse(handler.remote_gate())
        self.assertEqual(events,['discard','reply'])
        handler.reply.assert_called_once_with(403,{'reason':'host_rejected'})

    def test_rejected_get_does_not_read_or_change_timeout(self):
        handler = self.handler('GET')
        handler.reply = Mock()
        self.assertFalse(handler.remote_gate())
        self.assertEqual(handler.rfile.tell(),0)
        handler.connection.settimeout.assert_not_called()

    def test_valid_remote_proxy_passes_without_discard(self):
        from control_everything.integrations.remote_access import RemoteAccess, PROXY_HEADER
        import secrets
        handler = self.handler('POST')
        access = RemoteAccess('https://panel.example.test',secrets.token_urlsafe(32))
        handler.server.remote_access = access
        handler.headers.replace_header('Host',access.authority)
        del handler.headers['X-CE-Proxy-Token']
        handler.headers[PROXY_HEADER] = access.proxy_secret
        handler.headers['X-CE-Page-Context'] = 'a'*32
        handler.headers['X-CE-Storage-Scope'] = 'a'*64
        handler.reply = Mock()
        handler._discard_rejected_post_body = Mock(wraps=handler._discard_rejected_post_body)
        self.assertTrue(handler.remote_gate())
        handler._discard_rejected_post_body.assert_not_called()
        handler.reply.assert_not_called()
        self.assertEqual(handler.rfile.tell(),0)
        handler.connection.settimeout.assert_not_called()
