"""Local owner integration registration uses accepted database authority."""
import json
import sys
import threading
from http.client import HTTPConnection

from control_everything.http.gateway import HOST, PanelHandler, PanelServer
from control_everything.input_validation import ProfileError
from tests.backend.test_automation_queue import AutomationQueueFixture
from tests.backend.test_automation_consumer import PlanningHost
from control_everything.workspace.automation_flow import AutomationQueue
from control_everything.workspace.automation_consumer import AutomationConsumer
from tests.backend import test_automation_deliveries as deliveries


class IntegrationTargetTests(AutomationQueueFixture):
    pump = deliveries.AutomationDeliveryTests.pump
    prepare = deliveries.AutomationDeliveryTests.prepare
    def configure_verification(self):
        deliveries.AutomationDeliveryTests.configure_verification(self)
        script = self.root/'repo'/'verify.py'
        script.write_text("print('verified')",encoding='utf-8')
        with self.profile.store.connection() as c:
            c.execute('DELETE FROM automation_events WHERE id=?',(self.event['id'],))
        self.event = self.service.enable_task_automation(self.item['id'],{**self.body,'verification':{
            'argv':[sys.executable,str(script)],'source_files':['input.txt','verify.py'],'timeout':3}})

    def setUp(self):
        super().setUp()
        self.consumer_type = AutomationConsumer
        self.queue,self.host = AutomationQueue(self.profile.store),PlanningHost()
        self.consumer = AutomationConsumer(self.queue,self.host)
        self.prepare()
        self.published = self.pump()
        self.service.check_verification = self.consumer.check_verification
        item = self.profile.store.get_item(self.item['id'])
        self.delivery = item['current_delivery_id']
        self.approval = {'expected_revision':item['revision'],'progress_revision':item['progress_revision'],
            'delivery_id':self.delivery,'verdict':'approved','reason':'Reviewed exact change','confirmed':True,'client_token':'owner-one'}
        accepted = self.service.review_task_delivery(self.item['id'],self.approval)
        with self.profile.store.connection() as c:
            flow = self.queue._view(c,self.published['flow']['id'])['flow']
        item = self.profile.store.get_item(self.item['id'])
        self.request = {'flow_id':flow['id'],'expected_flow_revision':flow['revision'],
            'expected_revision':item['revision'],'progress_revision':item['progress_revision'],
            'delivery_id':self.delivery,'review_id':accepted['review']['id'],'client_token':'target-one','confirmed':True,
            'target':{'branch':'develop','repository_path':str(self.root/'target'),
                'target_worktree_path':str(self.root/'target'),'candidate_worktree_path':str(self.root/'candidate'),
                'expected_base':'a'*40,'remote_name':'origin','remote_url':str(self.root/'bare.git'),
                'files':[{'source_path':p,'target_path':p} for p in ['input.txt','verify.py']],
                'script_arg_map':[{'index':1,'source_path':'verify.py'}],'commit_message':'feat: integrate verified change'}}

    def test_registration_and_history_replay_leave_task_and_steps_unchanged(self):
        with self.profile.store.connection() as c:
            before={table:[tuple(r) for r in c.execute('SELECT * FROM '+table)] for table in ('task_items','task_reviews','automation_steps')}
        result=self.service.register_task_integration_target(self.item['id'],self.request)
        self.assertFalse(result['replayed'])
        self.assertEqual(result['flow']['status'],'waiting_external')
        self.assertEqual(result['flow']['revision'],self.request['expected_flow_revision']+1)
        self.assertEqual(result['integration_target']['verification'],self.published['step']['request']['verification'])
        replay=self.service.register_task_integration_target(self.item['id'],self.request)
        self.assertTrue(replay['replayed'])
        self.assertEqual(replay['flow'],result['flow'])
        with self.profile.store.connection() as c:
            for table,rows in before.items(): self.assertEqual([tuple(r) for r in c.execute('SELECT * FROM '+table)],rows)
        with self.assertRaises(ProfileError):
            self.service.register_task_integration_target(self.item['id'],{**self.request,'client_token':'replacement'})

    def test_invalid_mapping_paths_remote_and_versions_do_not_write(self):
        changes=[{'actor':'model'},{'confirmed':False},{'expected_flow_revision':True},{'expected_revision':0}]
        for target_change in ({'branch':'main'},{'remote_url':'https://secret@example.test/r'},
                              {'candidate_worktree_path':str(self.root/'repo'/'nested')},
                              {'script_arg_map':[{'index':0,'source_path':'verify.py'}]},
                              {'files':[{'source_path':'../verify.py','target_path':'../verify.py'}]},
                              {'argv':['danger']}):
            changes.append({'target':{**self.request['target'],**target_change}})
        with self.profile.store.connection() as c: before='\n'.join(c.iterdump())
        for change in changes:
            with self.subTest(change=change),self.assertRaises(ProfileError):
                self.service.register_task_integration_target(self.item['id'],{**self.request,**change})
        with self.profile.store.connection() as c: self.assertEqual('\n'.join(c.iterdump()),before)

    def test_unapproved_or_nonlocal_review_and_old_delivery_are_rejected(self):
        mutations = [("UPDATE task_reviews SET reviewer='model'", "UPDATE task_reviews SET reviewer='local_owner'"),
                     ("UPDATE task_reviews SET verdict='rejected'", "UPDATE task_reviews SET verdict='approved'"),
                     ("UPDATE task_items SET accepted_delivery_id=NULL", None)]
        for change,restore in mutations:
            with self.profile.store.connection() as c:
                c.execute(change)
                before='\n'.join(c.iterdump())
            with self.assertRaises(ProfileError):
                self.service.register_task_integration_target(self.item['id'],self.request)
            with self.profile.store.connection() as c:
                self.assertEqual('\n'.join(c.iterdump()),before)
                if restore: c.execute(restore)

    def test_closed_connections_and_fresh_profile_service_replay_persisted_snapshot(self):
        from control_everything.profiles.profile import Profile
        from control_everything.workspace.service import WorkspaceService
        result = self.service.register_task_integration_target(self.item['id'],self.request)
        # Stores open and close a SQLite connection per context; none remains open here.
        old_store = self.profile.store
        self.service = None
        self.profile = None
        reopened = Profile.open(str(self.root/'profile'))
        service = WorkspaceService(profile=reopened)
        self.assertIsNot(reopened.store,old_store)
        with reopened.store.connection() as c:
            persisted = json.loads(c.execute('SELECT attention_json FROM automation_flows WHERE id=?',
                                           (self.request['flow_id'],)).fetchone()[0])['integration_target']
            before = '\n'.join(c.iterdump())
        self.assertEqual(persisted,result['integration_target'])
        replay = service.register_task_integration_target(self.item['id'],self.request)
        self.assertTrue(replay['replayed'])
        self.assertEqual(replay['integration_target'],result['integration_target'])
        self.assertEqual(replay['flow']['revision'],result['flow']['revision'])
        with reopened.store.connection() as c:
            self.assertEqual('\n'.join(c.iterdump()),before)

    def test_competing_http_owners_record_exactly_one_target_without_other_mutations(self):
        from concurrent.futures import ThreadPoolExecutor
        import copy
        with self.profile.store.connection() as c:
            before = {table:[tuple(r) for r in c.execute('SELECT * FROM '+table)]
                      for table in ('task_items','task_reviews','automation_steps')}
            original = dict(c.execute('SELECT * FROM automation_flows WHERE id=?',
                                     (self.request['flow_id'],)).fetchone())
        server=PanelServer((HOST,0),PanelHandler)
        server.workspace,server.profile=self.service,self.profile
        server.expected_host=f'127.0.0.1:{server.server_address[1]}'
        server.origin=server.local_origin='http://'+server.expected_host
        server.csrf_token='concurrent-owner'
        thread=threading.Thread(target=server.serve_forever);thread.start()
        barrier=threading.Barrier(2)
        def send(index):
            request=copy.deepcopy(self.request)
            request['client_token']=f'competing-{index}'
            request['target']['commit_message']=f'feat: candidate {index}'
            barrier.wait(timeout=3)
            c=HTTPConnection('127.0.0.1',server.server_address[1],timeout=5)
            try:
                c.request('POST',f"/api/workspace/tasks/{self.item['id']}/automation-integration-target",json.dumps(request),
                    {'Origin':server.origin,'X-Session-CSRF':server.csrf_token,'X-Session-Client':'panel','Content-Type':'application/json'})
                response=c.getresponse()
                return response.status,json.loads(response.read())
            finally:
                c.close()
        try:
            with ThreadPoolExecutor(max_workers=2) as pool:
                responses=list(pool.map(send,(1,2)))
        finally:
            server.shutdown();thread.join(3);server.server_close()
        self.assertEqual(sorted(status for status,_ in responses),[200,409],responses)
        winner=next(value for status,value in responses if status==200)
        with self.profile.store.connection() as c:
            for table,rows in before.items():
                self.assertEqual([tuple(r) for r in c.execute('SELECT * FROM '+table)],rows)
            final=dict(c.execute('SELECT * FROM automation_flows WHERE id=?',(self.request['flow_id'],)).fetchone())
        self.assertEqual(final['revision'],original['revision']+1)
        self.assertEqual(final['context_json'],original['context_json'])
        self.assertEqual(final['status'],original['status'])
        self.assertEqual(json.loads(final['attention_json'])['integration_target'],winner['integration_target'])

    def test_unsafe_remote_forms_cannot_be_registered(self):
        from control_everything.workspace.automation_integration_targets import _target
        for remote in ('https://example.test/repo?access_token=placeholder','https://example.test/repo?',
                       'https://example.test/repo#','https:///missing-host','ext::command',
                       '--upload-pack=command','relative.git','file:///tmp/repo.git',
                       '//server/share/repo.git','\\\\server\\share\\repo.git'):
            with self.subTest(remote=remote),self.assertRaises(ProfileError):
                _target({**self.request['target'],'remote_url':remote},self.published['step'])

    def test_frozen_spec_cannot_authorize_ambiguous_relative_paths(self):
        import copy
        from control_everything.workspace.automation_integration_targets import _target
        for path in ('.git./config','file:stream','trailing.','trailing ','./verify.py','folder/../verify.py'):
            verify=copy.deepcopy(self.published['step'])
            verify['request']['verification']['source_files']=[path]
            # A valid declared script remains at the exact argv index; only the
            # additional declared path identity is ambiguous.
            verify['request']['verification']['source_files'].append('verify.py')
            target=copy.deepcopy(self.request['target'])
            target['files']=[{'source_path':p,'target_path':p} for p in (path,'verify.py')]
            with self.subTest(path=path),self.assertRaises(ProfileError):
                _target(target,verify)

    def test_nonqualified_or_device_absolute_paths_are_rejected(self):
        from control_everything.workspace.automation_integration_targets import _path
        for path in ('\\root-relative','//server/share/repo','\\\\server\\share\\repo',
                     '\\\\?\\C:\\repo','C:relative'):
            with self.subTest(path=path),self.assertRaises(ProfileError):
                _path(path)

    def test_real_http_requires_csrf_then_records(self):
        server=PanelServer((HOST,0),PanelHandler)
        server.workspace,server.profile=self.service,self.profile
        server.expected_host=f'127.0.0.1:{server.server_address[1]}'
        server.origin=server.local_origin='http://'+server.expected_host
        server.csrf_token='target-owner'
        thread=threading.Thread(target=server.serve_forever);thread.start()
        try:
            for token,status in [('wrong',403),('target-owner',200)]:
                c=HTTPConnection('127.0.0.1',server.server_address[1],timeout=3)
                c.request('POST',f"/api/workspace/tasks/{self.item['id']}/automation-integration-target",json.dumps(self.request),
                    {'Origin':server.origin,'X-Session-CSRF':token,'X-Session-Client':'panel','Content-Type':'application/json'})
                response=c.getresponse();value=json.loads(response.read());c.close()
                self.assertEqual(response.status,status,value)
        finally:
            server.shutdown();thread.join(3);server.server_close()
