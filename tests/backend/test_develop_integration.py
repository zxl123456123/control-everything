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
from functools import partial

from tests.backend.test_automation_integration_targets import IntegrationTargetTests
from control_everything.http.gateway import HOST, PanelHandler, PanelServer
from control_everything.execution.develop_integration import preflight_develop_target, run_develop_integration
from control_everything.input_validation import ProfileError
from control_everything.workspace.automation_consumer import AutomationConsumer
from control_everything.workspace.automation_delivery_reviews import prepare_acceptance_offer
from control_everything.workspace.automation_flow import AutomationQueue
from control_everything.workspace.automation_human_decisions import acceptance_card, apply_acceptance_decisions
from control_everything.workspace.automation_remote_inbox import RemoteAutomationInbox
from tests.backend.test_automation_consumer import PlanningHost
from tests.backend.test_automation_queue import AutomationQueueFixture, bind_actor, designate_actor


class DevelopIntegrationTests(IntegrationTargetTests):
    def setUp(self):
        super().setUp()
        self.configure_git()
        self.request['target']['expected_base'] = self.base

    def configure_git(self):
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
        # A measured 82-command local run completed at 30.625 seconds.
        # This is the fixture-wide budget; individual command deadlines stay fixed.
        deadline=time.monotonic()+60
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
        def candidate_test_started():
            for path in root.glob('*/*/intent.json'):
                try:
                    intent=json.loads(path.read_text(encoding='utf-8'))
                except json.JSONDecodeError:
                    continue
                if intent.get('stage')=='candidate-test':
                    return True
            return False
        deadline=time.monotonic()+25
        while time.monotonic()<deadline and not candidate_test_started():
            time.sleep(.02)
        self.assertTrue(candidate_test_started())
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

    def test_deep_profile_preserves_full_receipts_with_numbered_directories(self):
        from control_everything.profiles.profile import Profile
        from control_everything.workspace.service import WorkspaceService
        from control_everything.workspace.automation_flow import AutomationQueue
        # Match the real diagnostic output base: the old stage suffix exceeded
        # the Windows directory creation limit before the first remote readback.
        suffix=len(str(Path('automation-integration')/self.request['flow_id']/('0'*36)))+1
        profile_length=229-suffix
        deep=self.root/('p'*(profile_length-len(str(self.root))-1))
        shutil.copytree(self.profile.data_dir,deep)
        self.profile=Profile.open(str(deep))
        self.service=WorkspaceService(profile=self.profile)
        self.queue=AutomationQueue(self.profile.store,owner_id=self.queue.owner_id)
        self.consumer.queue=self.queue
        self.assertEqual(len(str(self.profile.data_dir/'automation-integration'/self.request['flow_id']/('0'*36))),229)
        self.test_http_background_runner_integrates_exactly_one_commit()
        with self.profile.store.connection() as c:
            result=self.queue._view(c,self.request['flow_id'])['step']['result']
        for command in result['commands']:
            self.assertTrue(Path(command['directory']).name.isdigit())
            receipt=json.loads((Path(command['directory'])/'receipt.json').read_text(encoding='utf-8'))
            self.assertEqual(receipt['stage'],command['stage'])


class PreparedIntegrationOfferTests(AutomationQueueFixture):
    configure_git = DevelopIntegrationTests.configure_git
    git = DevelopIntegrationTests.git
    prepare = IntegrationTargetTests.prepare
    pump = IntegrationTargetTests.pump

    def setUp(self):
        super().setUp()
        self.queue, self.host = AutomationQueue(self.profile.store), PlanningHost()
        self.cards = []
        self.consumer_type = partial(AutomationConsumer, on_wait=self.cards.append,
            prepare_integration=partial(prepare_acceptance_offer, self.service), integration=self.integrate)
        self.binding = {'hub_origin': 'https://hub.example.test', 'device_id': 'device', 'generation': 1,
                        'credential_revision': 1}
        bind_actor(self.profile.store, self.project['id'], 'ou-owner')
        designate_actor(self.profile.store, self.item['id'], 'ou-owner')

    def configure_verification(self):
        IntegrationTargetTests.configure_verification(self)
        self.configure_git()
        self.service.integration_preflight = partial(preflight_develop_target, git_executable=self.git_exe)
        self.configuration = {
            'directory_id': self.event['payload']['directory']['binding_id'],
            'verification': self.event['payload']['request']['verification'],
            'confirmed': True,
            'integration': {'repository_path': str(self.target), 'target_worktree_path': str(self.target),
                'candidate_worktree_path': str(self.root/'candidate'), 'remote_name': 'origin',
                'remote_url': str(self.bare)},
        }
        if self.before_publication:
            self.before_publication()

    def integrate(self, step, flow, *, cancel_event, checkpoint):
        source_output = self.profile.data_dir / 'automation-verification' / flow['id'] / self.view['step']['id']
        return run_develop_integration(step, flow, git_executable=self.git_exe,
            output_dir=self.root/'integrated', source_output_dir=source_output,
            cancel_event=cancel_event, checkpoint=checkpoint)

    def save_target(self, **values):
        self.service.set_project_automation_verification(self.project['id'], {**self.configuration, **values})

    def publish_card(self, configure=None):
        self.before_publication = configure
        self.prepare()
        self.service.check_verification = self.consumer.check_verification
        self.published = self.pump()
        self.assertEqual(self.published['flow']['status'], 'awaiting_acceptance')
        return self.cards[-1]['body']['elements'][1]

    def click(self, button, identity='click', **overrides):
        decision = {k: v for k, v in button['value'].items() if k != 'flow_id'}
        RemoteAutomationInbox(self.profile.store).receive(self.binding, {
            'id': identity, 'source': 'feishu:test', 'event_id': 'event-'+identity, 'lease_id': 'lease',
            'lease_expires_at': 10, 'payload': {'kind': 'feishu_card_decision', 'project_id': self.project['id'],
                'app_id': 'app', 'actor_open_id': 'ou-owner', 'decision': {**decision, **overrides}}})
        return self.apply_clicks()

    def apply_clicks(self):
        return apply_acceptance_decisions(self.profile.store, self.service, self.binding)

    def heads(self):
        return tuple(self.git(root, 'rev-parse', ref).strip() for root, ref in (
            (self.target,'HEAD'), (self.root/'candidate','HEAD'), (self.bare,'refs/heads/develop')))

    def test_accept_only_card_finishes_with_no_integration_wait_even_if_a_target_is_added(self):
        button = self.publish_card()
        self.assertEqual(button['text']['content'], '通过验收')
        self.assertNotIn('develop', self.cards[-1]['body']['elements'][0]['content'])
        self.save_target()
        self.assertEqual(len(self.click(button)), 1)
        self.assertTrue(self.apply_clicks()[0]['replayed'])
        count = len(self.cards)
        self.consumer.run_once()
        self.assertEqual(len(self.cards), count)
        self.assertEqual(self.heads(), (self.base,) * 3)
        item = self.profile.store.get_item(self.item['id'])
        self.assertEqual((item['state'], item['accepted_delivery_id']), ('done', button['value']['delivery_id']))
        with self.profile.store.connection() as connection:
            flow = self.queue._view(connection, self.published['flow']['id'])['flow']
        self.assertEqual((flow['status'], flow['phase']), ('completed', 'acceptance'))
        self.assertNotIn('integration_target', flow['attention'])

    def test_dirty_candidate_can_only_offer_acceptance(self):
        def configure():
            self.save_target()
            (self.root/'candidate'/'untracked.txt').write_text('owner file', encoding='utf-8')
        self.assertEqual(self.publish_card(configure)['text']['content'], '通过验收')
        self.assertEqual(self.heads(), (self.base,) * 3)

    def test_changed_then_revoked_target_cannot_accept_stale_offer_after_restoring_configuration(self):
        button = self.publish_card(self.save_target)
        fallback = self.cards[-1]['body']['elements'][2]
        self.assertEqual(fallback['text']['content'], '通过验收')
        self.assertTrue(button['value']['decision_id'].startswith('integrate-'))
        self.save_target(integration={**self.configuration['integration'], 'remote_name': 'other'})
        self.assertEqual(self.click(button), [])
        self.save_target(integration=None)
        self.assertEqual(self.apply_clicks(), [])
        self.save_target()
        self.assertEqual(self.apply_clicks(), [])
        self.assertEqual(self.heads(), (self.base,) * 3)
        self.assertIsNone(self.profile.store.get_item(self.item['id'])['accepted_delivery_id'])
        offer = prepare_acceptance_offer(self.service, self.published['flow'])
        self.assertNotEqual(acceptance_card(self.published['flow'], approval=offer)['body']['elements'][1]['value'],
                            button['value'])
        self.save_target(integration=None)
        applied = self.click(fallback, 'fallback')
        self.assertEqual(len(applied), 1)
        self.assertFalse(applied[0]['replayed'])
        self.assertTrue(self.apply_clicks()[0]['replayed'])
        self.consumer.run_once()
        self.assertEqual(self.heads(), (self.base,) * 3)
        self.assertFalse((self.root/'integrated').exists())
        item = self.profile.store.get_item(self.item['id'])
        self.assertEqual((item['state'], item['accepted_delivery_id']), ('done', button['value']['delivery_id']))
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute("SELECT count(*) FROM task_reviews").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT count(*) FROM automation_steps WHERE kind='integrate'").fetchone()[0], 0)

    def test_confirmed_project_offer_runs_one_exact_commit_and_replays_without_writes(self):
        def configure():
            with self.assertRaisesRegex(ProfileError, 'invalid_integration_target'):
                self.save_target(confirmed=False)
            self.save_target()
        button = self.publish_card(configure)
        self.assertEqual(button['text']['content'], '这个版本通过，集成 develop')
        self.assertIn('origin/develop', self.cards[-1]['body']['elements'][0]['content'])
        self.assertEqual(self.heads(), (self.base,) * 3)
        self.assertFalse((self.root/'integrated').exists())
        self.assertEqual(self.click(button, 'stale', expected_revision=button['value']['expected_revision']-1), [])
        self.assertEqual(self.click(button, 'foreign', decision_id='integrate-' + '0'*64), [])
        self.assertEqual(len(self.click(button)), 1)
        self.assertTrue(self.apply_clicks()[0]['replayed'])
        self.assertEqual(self.heads(), (self.base,) * 3)
        self.consumer.run_once()
        with self.profile.store.connection() as connection:
            view = self.queue._view(connection, self.published['flow']['id'])
        self.assertEqual(view['flow']['status'], 'completed', view['step'].get('result'))
        self.assertEqual(view['step']['result']['integration_target']['target']['expected_base'], self.base)
        self.assertEqual(view['step']['result']['integration_target']['accepted_flow_revision'],
                         self.published['flow']['revision']+1)
        head = self.git(self.target, 'rev-parse', 'HEAD').strip()
        next_target = dict(view['step']['result']['integration_target']['target'])
        del next_target['expected_base']
        self.assertEqual(preflight_develop_target(self.root/'repo', next_target, git_executable=self.git_exe), head)
        self.assertEqual(self.heads(), (head,) * 3)
        self.assertEqual(self.git(self.target, 'rev-list', '--count', self.base+'..HEAD').strip(), '1')
        self.assertEqual(set(self.git(self.target,'diff','--name-only',self.base,'HEAD').splitlines()), {'input.txt'})
        self.assertTrue(view['step']['result']['candidate_test_passed'])
        self.assertTrue(view['step']['result']['target_test_passed'])
        self.assertTrue(self.apply_clicks()[0]['replayed'])
        self.consumer.run_once()
        self.assertEqual(self.heads(), (head,) * 3)
        with self.profile.store.connection() as connection:
            self.assertEqual(connection.execute("SELECT count(*) FROM task_reviews").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT count(*) FROM automation_steps WHERE kind='integrate'").fetchone()[0], 1)
