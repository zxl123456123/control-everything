"""Real local Git execution through the owner HTTP and background consumer boundary."""
import json
from pathlib import Path
import shutil
import subprocess
import threading
import time
from types import SimpleNamespace
from unittest.mock import patch
from http.client import HTTPConnection

from tests.backend.test_automation_integration_targets import IntegrationTargetTests
from control_everything.http.gateway import HOST, PanelHandler, PanelServer


class DevelopIntegrationTests(IntegrationTargetTests):
    def setUp(self):
        super().setUp()
        self.git_exe = str(Path(shutil.which('git')).resolve())
        (self.root/'empty-hooks').mkdir()
        self.target = self.root/'target'
        self.target.mkdir()
        self.bare = self.root/'bare.git'
        self.git(self.root,'init','--bare',str(self.bare))
        self.git(self.target,'init','-b','develop')
        self.git(self.target,'config','user.name','Fixture Owner')
        self.git(self.target,'config','user.email','fixture@example.test')
        for name in ('input.txt','verify.py'):
            shutil.copyfile(self.root/'repo'/name,self.target/name)
        (self.target/'input.txt').write_text('baseline',encoding='utf-8')
        self.git(self.target,'add','--','input.txt','verify.py')
        self.git(self.target,'commit','-m','test: initialize local integration fixture')
        self.base=self.git(self.target,'rev-parse','HEAD').strip()
        self.git(self.target,'remote','add','origin',str(self.bare))
        self.git(self.target,'push','-u','origin','develop')
        self.git(self.target,'worktree','add','-b','fixture-candidate',str(self.root/'candidate'),self.base)
        self.request['target']['expected_base']=self.base
        source=self.root/'repo'
        self.git(source,'init','-b','source-fixture')
        self.git(source,'config','user.name','Fixture Owner')
        self.git(source,'config','user.email','fixture@example.test')
        self.git(source,'add','--','input.txt','verify.py')
        self.git(source,'commit','-m','test: approved source fixture')
        (source/'unowned-source.txt').write_text('preserve source owner bytes',encoding='utf-8')
        self.source_status=self.git(source,'status','--porcelain=v1','--untracked-files=all')

    def configure_verification(self):
        super().configure_verification()
        if self._testMethodName in ('test_candidate_test_failure_preserves_unknown_without_second_commit',
                                    'test_candidate_timeout_is_unknown_and_never_repeated',
                                    'test_target_test_failure_does_not_push',
                                    'test_lease_loss_stops_operation_without_redispatch'):
            operation = ("raise SystemExit(7)" if 'failure' in self._testMethodName else "time.sleep(5)")
            where = 'target' if self._testMethodName=='test_target_test_failure_does_not_push' else 'candidate'
            (self.root/'repo'/'verify.py').write_text(
                "import pathlib,time\nif pathlib.Path.cwd().name == '"+where+"':\n    "+operation+"\nprint('verified')\n",encoding='utf-8')

    def git(self,cwd,*args):
        result=subprocess.run([self.git_exe,'-c','core.hooksPath='+str(self.root/'empty-hooks'),'-c','commit.gpgSign=false',*args],cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
        self.assertEqual(result.returncode,0,result.stderr.decode('utf-8',errors='replace'))
        return result.stdout.decode('utf-8',errors='replace')

    def start_registered(self):
        server=PanelServer((HOST,0),PanelHandler)
        server.workspace,server.profile=self.service,self.profile
        server.expected_host=f'127.0.0.1:{server.server_address[1]}'
        server.origin=server.local_origin='http://'+server.expected_host
        server.csrf_token='fixture-owner'
        thread=threading.Thread(target=server.serve_forever);thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(thread.join,3)
        self.addCleanup(server.shutdown)
        connection=HTTPConnection('127.0.0.1',server.server_address[1],timeout=5)
        try:
            connection.request('POST',f"/api/workspace/tasks/{self.item['id']}/automation-integration-target",json.dumps(self.request),
                {'Origin':server.origin,'X-Session-CSRF':server.csrf_token,'X-Session-Client':'panel','Content-Type':'application/json'})
            response=connection.getresponse();body=json.loads(response.read())
            self.assertEqual(response.status,200,body)
        finally:
            connection.close()
        if hasattr(self,'before_attach'):
            self.before_attach()
        self.queue.release(self.consumer.lease)
        self.consumer.lease=None
        self.host.available=False
        runtime=SimpleNamespace(ready=False,config=SimpleNamespace(git_executable=Path(self.git_exe)))
        with patch('control_everything.integrations.workbench_progress.WorkbenchProgressAdapter',return_value=self.host), \
             patch('control_everything.workspace.native_progress_observer.NativeProgressObserver.start'):
            server.attach_workbench_runtime(runtime)
        return server

    def wait_result(self,server):
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            with self.profile.store.connection() as c:
                view=self.queue._view(c,self.request['flow_id'])
            if view['flow']['attention'].get('reason')=='integration_rejected' or view['flow']['status']=='completed' or view['step']['kind']=='integrate' and view['step']['status'] in ('unknown','failed'):
                return view
            server.automation_consumer_service.wake()
            time.sleep(.02)
        return view

    def test_http_background_runner_integrates_exactly_one_commit(self):
        source_before={p:(self.root/'repo'/p).read_bytes() for p in ('input.txt','verify.py')}
        server=self.start_registered()
        view=self.wait_result(server)
        self.assertEqual(view['flow']['status'],'completed',view['step'].get('result'))
        head=self.git(self.target,'rev-parse','HEAD').strip()
        self.assertEqual(head,view['step']['result']['candidate_sha'])
        self.assertEqual(self.git(self.target,'rev-list','--count',self.base+'..HEAD').strip(),'1')
        self.assertEqual(set(self.git(self.target,'diff','--name-only',self.base,'HEAD').splitlines()),{'input.txt'})
        self.assertEqual(self.git(self.target,'ls-remote','origin','refs/heads/develop').split()[0],head)
        self.assertEqual(self.profile.store.get_item(self.item['id'])['state'],'done')
        for p,data in source_before.items():
            self.assertEqual((self.root/'repo'/p).read_bytes(),data)
        self.assertEqual(self.git(self.target,'status','--porcelain'), '')
        self.assertEqual(self.git(self.root/'repo','status','--porcelain=v1','--untracked-files=all'),self.source_status)
        self.assertEqual((self.root/'repo'/'unowned-source.txt').read_text(),'preserve source owner bytes')
        result=view['step']['result']
        self.assertFalse(result['process_tree_verified'])
        self.assertEqual(result['cleanup_scope'],'direct_processes')
        self.assertTrue(result['cleanup_verified'])
        self.assertEqual(sum(c['stage']=='commit-approved-files' for c in result['commands']),1)
        pushes=[c for c in result['commands'] if c['stage']=='push-develop']
        self.assertEqual(len(pushes),1)
        self.assertEqual(pushes[0]['argv'][-1],head+':refs/heads/develop')
        self.assertNotIn('--force',pushes[0]['argv'])
        for key,root in (('candidate_test',self.root/'candidate'),('target_test',self.target)):
            self.assertEqual(result[key]['argv'][1],str(root/'verify.py'))
            self.assertEqual(Path(result[key]['command_directory'],'stdout.log').read_text().strip(),'verified')
        for name,data in source_before.items():
            self.assertEqual((self.target/name).read_bytes(),data)


    def assert_no_reexecution(self,server,view):
        before=self.git(self.root/'candidate','rev-parse','HEAD')
        operation=view['step']['operation_id']
        server.automation_consumer_service.wake()
        time.sleep(.15)
        with self.profile.store.connection() as c:
            after=self.queue._view(c,self.request['flow_id'])['step']
            count=c.execute("SELECT count(*) FROM automation_steps WHERE flow_id=? AND kind='integrate'",(self.request['flow_id'],)).fetchone()[0]
        self.assertEqual(count,1)
        self.assertEqual(after['operation_id'],operation)
        self.assertEqual(self.git(self.root/'candidate','rev-parse','HEAD'),before)

    def test_dirty_target_is_preserved_and_never_committed(self):
        (self.target/'unowned.txt').write_text('unowned',encoding='utf-8')
        server=self.start_registered()
        view=self.wait_result(server)
        self.assertEqual(view['step']['status'],'unknown')
        self.assertEqual(self.git(self.target,'rev-parse','HEAD').strip(),self.base)
        self.assertEqual((self.target/'unowned.txt').read_text(),'unowned')
        self.assert_no_reexecution(server,view)

    def test_target_advance_is_preserved_without_integration_commit(self):
        (self.target/'other.txt').write_text('other owner',encoding='utf-8')
        self.git(self.target,'add','--','other.txt')
        self.git(self.target,'commit','-m','test: unrelated owner advance')
        advanced=self.git(self.target,'rev-parse','HEAD').strip()
        server=self.start_registered()
        view=self.wait_result(server)
        self.assertEqual(view['step']['status'],'unknown')
        self.assertEqual(self.git(self.target,'rev-parse','HEAD').strip(),advanced)
        self.assertEqual(self.git(self.root/'candidate','rev-parse','HEAD').strip(),self.base)
        self.assert_no_reexecution(server,view)

    def test_candidate_test_failure_preserves_unknown_without_second_commit(self):
        server=self.start_registered()
        view=self.wait_result(server)
        self.assertEqual(view['step']['status'],'unknown')
        self.assertEqual(self.git(self.root/'candidate','rev-parse','HEAD').strip(),self.base)
        self.assertEqual(self.git(self.target,'ls-remote','origin','refs/heads/develop').split()[0],self.base)
        self.assert_no_reexecution(server,view)

    def test_candidate_timeout_is_unknown_and_never_repeated(self):
        server=self.start_registered()
        view=self.wait_result(server)
        self.assertEqual(view['step']['status'],'unknown')
        self.assertEqual(self.git(self.root/'candidate','rev-parse','HEAD').strip(),self.base)
        output=self.profile.data_dir/'automation-integration'/view['flow']['id']/view['step']['id']
        incomplete=json.loads((output/'incomplete.json').read_text(encoding='utf-8'))
        self.assertEqual(incomplete['error_type'],'TimeoutError',incomplete['reason'])
        self.assertFalse(incomplete['process_tree_verified'])
        self.assert_no_reexecution(server,view)

    def test_target_test_failure_does_not_push(self):
        server=self.start_registered()
        view=self.wait_result(server)
        self.assertEqual(view['step']['status'],'unknown')
        output=self.profile.data_dir/'automation-integration'/view['flow']['id']/view['step']['id']
        incomplete=json.loads((output/'incomplete.json').read_text(encoding='utf-8'))
        self.assertEqual(self.git(self.target,'rev-list','--count',self.base+'..HEAD').strip(),'1',incomplete['reason'])
        self.assertEqual(self.git(self.target,'ls-remote','origin','refs/heads/develop').split()[0],self.base)
        self.assert_no_reexecution(server,view)

    def test_source_log_changed_before_runner_does_not_write_git(self):
        log=Path(self.published['step']['result']['output_dir'])/'stdout.log'
        self.before_attach=lambda:log.write_bytes(b'changed')
        server=self.start_registered()
        view=self.wait_result(server)
        self.assertEqual(view['flow']['attention']['reason'],'integration_rejected')
        self.assertEqual(view['step']['status'],'failed')
        self.assertEqual(self.git(self.root/'candidate','rev-parse','HEAD').strip(),self.base)
        self.assert_no_reexecution(server,view)

    def test_source_bytes_changed_before_runner_does_not_write_git(self):
        self.before_attach=lambda:(self.root/'repo'/'input.txt').write_bytes(b'changed')
        server=self.start_registered()
        view=self.wait_result(server)
        self.assertEqual(view['flow']['attention']['reason'],'integration_rejected')
        self.assertEqual(view['step']['status'],'failed')
        self.assertEqual(self.git(self.target,'rev-parse','HEAD').strip(),self.base)
        self.assert_no_reexecution(server,view)

    def test_approval_changed_before_runner_does_not_reserve(self):
        def change():
            with self.profile.store.connection() as c:
                c.execute('UPDATE task_items SET progress_revision=progress_revision+1 WHERE id=?',(self.item['id'],))
        self.before_attach=change
        server=self.start_registered()
        view=self.wait_result(server)
        self.assertEqual(view['flow']['attention']['reason'],'integration_rejected')
        self.assertEqual(view['step']['kind'],'verify')
        self.assertEqual(self.git(self.root/'candidate','rev-parse','HEAD').strip(),self.base)

    def test_lease_loss_stops_operation_without_redispatch(self):
        from control_everything.workspace.automation_flow import AutomationQueue
        server=self.start_registered()
        root=self.profile.data_dir/'automation-integration'/self.request['flow_id']
        deadline=time.monotonic()+25
        while time.monotonic()<deadline and not list(root.glob('*/*-candidate-test/intent.json')):
            time.sleep(.02)
        self.assertTrue(list(root.glob('*/*-candidate-test/intent.json')))
        successor=AutomationQueue(self.profile.store,clock=lambda:time.time()+120)
        lease=successor.acquire()
        self.assertIsNotNone(lease)
        deadline=time.monotonic()+5
        while time.monotonic()<deadline and not list(root.glob('*/incomplete.json')):
            time.sleep(.02)
        self.assertTrue(list(root.glob('*/incomplete.json')))
        with self.profile.store.connection() as c:
            view=self.queue._view(c,self.request['flow_id'])
        self.assertEqual(view['step']['status'],'dispatching')
        self.assertEqual(self.git(self.root/'candidate','rev-parse','HEAD').strip(),self.base)
        self.assert_no_reexecution(server,view)
