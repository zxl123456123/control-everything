"""Loopback HTTP checks for local identity facts, without sending any messages."""
import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import Mock

from control_everything.http.gateway import PanelHandler
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
        self.assertEqual(self.request('/contexts')[1]['contexts'],[self.context])

    def test_local_authority_and_strict_body(self):
        for path,method,body in (('', 'GET',None),('/challenges','POST',{'producer_id':'producer'})):
            for headers in ({'Origin':'https://evil.example'},{'X-CE-Proxy-Token':'forged'}):
                self.assertEqual(self.request(path,method,body,headers)[0],403)
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

    def test_missing_dependencies_and_method_shapes(self):
        self.assertEqual(self.request('/challenges')[0],405)
        self.assertEqual(self.request('','POST',{})[0],405)
        self.assertEqual(self.request('?')[0],400)
        self.server.remote_connector = None
        self.assertEqual(self.request()[0],503)

    def test_pending_configuration_change_rejects_without_writes(self):
        from types import SimpleNamespace
        self.server.desktop = SimpleNamespace(configuration_changed=True)
        for path,body in (('/challenges',{'producer_id':'producer'}),('/confirm',{'candidate_id':'a'*32})):
            self.assertEqual(self.request(path,'POST',body)[0],409)
        with self.profile.store.connection() as db:
            for table in ('automation_identity_challenges','automation_identity_bindings'):
                self.assertEqual(db.execute('SELECT count(*) FROM '+table).fetchone()[0],0)
        self.connector.identity_context.assert_not_called()
