"""Local owner decisions bind a published automation delivery to real disk evidence."""
import json
import threading
from http.client import HTTPConnection
from unittest.mock import Mock, patch

from control_everything.http.gateway import HOST, PanelHandler, PanelServer
from control_everything.input_validation import ProfileError
from control_everything.workspace.automation_consumer import AutomationConsumer
from control_everything.workspace.automation_flow import AutomationQueue
from tests.backend import test_automation_deliveries as deliveries
from tests.backend.test_automation_consumer import PlanningHost
from tests.backend.test_automation_queue import AutomationQueueFixture


class AutomationDeliveryReviewTests(AutomationQueueFixture):
    pump = deliveries.AutomationDeliveryTests.pump
    configure_verification = deliveries.AutomationDeliveryTests.configure_verification
    prepare = deliveries.AutomationDeliveryTests.prepare

    def setUp(self):
        super().setUp()
        self.consumer_type = AutomationConsumer
        self.queue, self.host = AutomationQueue(self.profile.store), PlanningHost()
        self.consumer = AutomationConsumer(self.queue,self.host)
        self.prepare()
        self.published = self.pump()
        self.service.check_verification = self.consumer.check_verification
        self.delivery = self.profile.store.get_item(self.item['id'])['current_delivery_id']
        item = self.profile.store.get_item(self.item['id'])
        self.approval = {'expected_revision':item['revision'],'progress_revision':item['progress_revision'],
            'delivery_id':self.delivery,'verdict':'approved','reason':'Reviewed exact change','confirmed':True,'client_token':'owner-one'}

    def test_stored_feishu_acceptance_records_only_the_current_delivery(self):
        from control_everything.workspace.automation_human_decisions import apply_acceptance_decisions
        from control_everything.workspace.automation_remote_inbox import RemoteAutomationInbox
        binding = {'hub_origin': 'https://hub.example.test', 'device_id': 'device', 'generation': 1,
                   'credential_revision': 1}
        decision = {'namespace': 'control-everything.automation.v1', 'decision_id': 'decision-1',
                    'task_id': self.item['id'], 'delivery_id': self.delivery,
                    'expected_revision': self.approval['expected_revision'],
                    'progress_revision': self.approval['progress_revision'], 'verdict': 'approved'}
        inbox = RemoteAutomationInbox(self.profile.store)
        inbox.receive(binding, {'id': 'om-stale', 'source': 'feishu:test', 'event_id': 'evt-stale',
                                 'lease_id': 'lease', 'lease_expires_at': 10, 'payload': {
                                     'kind': 'feishu_card_decision', 'actor_open_id': 'ou-owner',
                                     'decision': dict(decision, decision_id='stale', expected_revision=decision['expected_revision'] + 1)}})
        self.assertEqual(apply_acceptance_decisions(self.profile.store, self.service, binding), [])
        inbox.receive(binding, {'id': 'om-accept', 'source': 'feishu:test', 'event_id': 'evt-accept',
                                 'lease_id': 'lease-2', 'lease_expires_at': 11, 'payload': {
                                     'kind': 'feishu_card_decision', 'project_id': self.project['id'],
                                     'app_id': 'app', 'actor_open_id': 'ou-owner', 'decision': decision}})
        from tests.backend.test_automation_queue import bind_actor, designate_actor
        bind_actor(self.profile.store, self.project['id'], 'ou-owner')
        designate_actor(self.profile.store, self.item['id'], 'ou-owner')
        first = apply_acceptance_decisions(self.profile.store, self.service, binding)
        second = apply_acceptance_decisions(self.profile.store, self.service, binding)
        self.assertFalse(first[0]['replayed'])
        self.assertTrue(second[0]['replayed'])
        with self.profile.store.connection() as connection:
            accepted = connection.execute('SELECT accepted_delivery_id FROM task_items WHERE id=?',
                                          (self.item['id'],)).fetchone()['accepted_delivery_id']
        self.assertEqual(accepted, self.delivery)
        with self.profile.store.connection() as connection:
            reviewer = connection.execute('SELECT reviewer FROM task_reviews WHERE task_id=?',
                                          (self.item['id'],)).fetchone()['reviewer']
        self.assertEqual(reviewer, 'ou-owner')

    def test_changed_source_does_not_accept_the_stored_delivery(self):
        from control_everything.workspace.automation_remote_inbox import RemoteAutomationInbox
        from tests.backend.test_automation_queue import bind_actor, designate_actor
        cards = []
        self.consumer.on_wait = cards.append
        (self.root / 'repo' / 'input.txt').write_bytes(b'changed after the test')
        binding = {'hub_origin': 'https://hub.example.test', 'device_id': 'device', 'generation': 1,
                   'credential_revision': 1}
        decision = {'namespace': 'control-everything.automation.v1', 'decision_id': 'decision-stale-source',
                    'task_id': self.item['id'], 'delivery_id': self.delivery,
                    'expected_revision': self.approval['expected_revision'],
                    'progress_revision': self.approval['progress_revision'], 'verdict': 'approved'}
        RemoteAutomationInbox(self.profile.store).receive(binding, {
            'id': 'om-stale-source', 'source': 'feishu:test', 'event_id': 'evt-stale-source', 'lease_id': 'lease',
            'lease_expires_at': 10, 'payload': {
                'kind': 'feishu_card_decision', 'project_id': self.project['id'], 'app_id': 'app',
                'actor_open_id': 'ou-owner', 'decision': decision}})
        bind_actor(self.profile.store, self.project['id'], 'ou-owner')
        designate_actor(self.profile.store, self.item['id'], 'ou-owner')
        self.consumer.review_service = self.service
        self.consumer.current_binding = lambda: binding
        self.consumer.run_once()
        with self.profile.store.connection() as connection:
            accepted = connection.execute('SELECT accepted_delivery_id FROM task_items WHERE id=?',
                                          (self.item['id'],)).fetchone()['accepted_delivery_id']
            flow = self.queue._view(connection, self.published['flow']['id'])['flow']
        self.assertIsNone(accepted)
        self.assertEqual(flow['attention']['reason'], 'verification_evidence_invalid')
        value = cards[-1]['body']['elements'][1]['value']
        self.assertEqual(value['reason'], 'verification_evidence_invalid')
        self.assertEqual(value['flow_id'], self.published['flow']['id'])
        self.assertNotIn('verdict', value)

    def test_unbound_actor_does_not_accept_the_current_delivery(self):
        from control_everything.workspace.automation_human_decisions import apply_acceptance_decisions
        from control_everything.workspace.automation_remote_inbox import RemoteAutomationInbox
        binding = {'hub_origin': 'https://hub.example.test', 'device_id': 'device', 'generation': 1,
                   'credential_revision': 1}
        decision = {'namespace': 'control-everything.automation.v1', 'decision_id': 'decision-stranger',
                    'task_id': self.item['id'], 'delivery_id': self.delivery,
                    'expected_revision': self.approval['expected_revision'],
                    'progress_revision': self.approval['progress_revision'], 'verdict': 'approved'}
        RemoteAutomationInbox(self.profile.store).receive(binding, {
            'id': 'om-stranger', 'source': 'feishu:test', 'event_id': 'evt-stranger', 'lease_id': 'lease',
            'lease_expires_at': 10, 'payload': {
                'kind': 'feishu_card_decision', 'actor_open_id': 'ou-stranger', 'decision': decision}})
        self.assertEqual(apply_acceptance_decisions(self.profile.store, self.service, binding), [])
        with self.profile.store.connection() as connection:
            accepted = connection.execute('SELECT accepted_delivery_id FROM task_items WHERE id=?',
                                          (self.item['id'],)).fetchone()['accepted_delivery_id']
        self.assertIsNone(accepted)

    def test_accepted_delivery_without_a_target_is_not_rejected(self):
        from control_everything.workspace.automation_delivery_reviews import review_delivery
        review_delivery(self.service, self.item['id'], self.approval)
        cards = []
        self.consumer.on_wait = cards.append
        self.consumer.integration = lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError('integrated'))
        self.consumer.check_verification = self.service.check_verification
        self.consumer.run_once()
        self.assertEqual(cards[0]['body']['elements'][1]['value']['reason'], 'integration_target_required')
        self.assertEqual(cards[0]['body']['elements'][1]['value']['flow_id'], self.published['flow']['id'])
        self.assertNotIn('choice', cards[0]['body']['elements'][1]['value'])
        with self.profile.store.connection() as connection:
            flow = self.queue._view(connection, self.published['flow']['id'])['flow']
            kinds = [row['kind'] for row in connection.execute('SELECT kind FROM automation_steps')]
        self.assertEqual(flow['status'], 'waiting_external')
        self.assertEqual(flow['attention']['reason'], 'integration_not_connected')
        self.assertNotIn('integration_target', flow['attention'])
        self.assertNotIn('integrate', kinds)

    def test_rejected_delivery_stays_stopped_and_emits_a_card(self):
        from control_everything.workspace.automation_delivery_reviews import review_delivery
        cards = []
        self.consumer.on_wait = cards.append
        body = dict(self.approval, verdict='rejected', reason='飞书拒绝', client_token='reject-1')
        review_delivery(self.service, self.item['id'], body)
        self.consumer.run_once()
        self.assertEqual(cards[0]['body']['elements'][1]['value']['reason'], 'acceptance_rejected')
        self.assertNotIn('choice', cards[0]['body']['elements'][1]['value'])
        with self.profile.store.connection() as connection:
            flow = self.queue._view(connection, self.published['flow']['id'])['flow']
            kinds = [row['kind'] for row in connection.execute('SELECT kind FROM automation_steps')]
            accepted = connection.execute('SELECT accepted_delivery_id FROM task_items WHERE id=?',
                                          (self.item['id'],)).fetchone()['accepted_delivery_id']
        self.assertEqual(flow['status'], 'waiting_external')
        self.assertEqual(flow['attention']['reason'], 'acceptance_rejected')
        self.assertNotIn('implement', kinds[4:])
        self.assertIsNone(accepted)

    def test_changes_requested_reserves_a_repair_without_accepting(self):
        from control_everything.workspace.automation_delivery_reviews import review_delivery
        body = dict(self.approval, verdict='changes_requested', reason='飞书要求修改', client_token='change-1')
        review_delivery(self.service, self.item['id'], body)
        step = self.consumer.run_once()
        self.assertEqual(step['kind'], 'implement')
        self.assertEqual(step['request']['repair_of']['round'], 1)
        self.assertIn('飞书要求修改', step['request']['params']['prompt'])
        self.assertIn('untrusted data', step['request']['params']['prompt'])
        with self.profile.store.connection() as connection:
            accepted = connection.execute('SELECT accepted_delivery_id FROM task_items WHERE id=?',
                                          (self.item['id'],)).fetchone()['accepted_delivery_id']
            status = self.queue._view(connection, self.published['flow']['id'])['flow']['status']
        self.assertIsNone(accepted)
        self.assertEqual(status, 'running')

    def test_normal_published_stage_is_observation_only_and_requires_current_delivery(self):
        item = self.profile.store.get_item(self.item['id'])
        request = {'flow_id':self.published['flow']['id'],
            'expected_flow_revision':self.published['flow']['revision']-2,
            'expected_revision':item['revision']-1,'progress_revision':item['progress_revision']-1,'confirmed':True}
        with self.profile.store.connection() as c:
            before = '\n'.join(c.iterdump())
        result = self.service.resume_task_automation(self.item['id'],request)
        self.assertEqual(result['status'],'already_at_stage')
        with self.profile.store.connection() as c:
            self.assertEqual('\n'.join(c.iterdump()),before)
            c.execute('UPDATE task_items SET current_delivery_id=NULL WHERE id=?',(self.item['id'],))
        with self.assertRaises(ProfileError):
            self.service.resume_task_automation(self.item['id'],request)

    def test_real_http_owner_approval_records_acceptance_without_done(self):
        server = PanelServer((HOST,0),PanelHandler)
        server.workspace, server.profile = self.service,self.profile
        server.expected_host = f'127.0.0.1:{server.server_address[1]}'
        server.origin = server.local_origin = 'http://'+server.expected_host
        server.csrf_token = 'temporary-owner-token'
        with patch('control_everything.integrations.workbench_progress.WorkbenchProgressAdapter',return_value=self.host):
            server.attach_workbench_runtime(Mock(ready=True))
        thread=threading.Thread(target=server.serve_forever)
        thread.start()
        try:
            for invalid in ({'X-Session-CSRF':'wrong'}, {'Origin':'http://untrusted.invalid'}, {'X-CE-Proxy-Token':'remote'}):
                denied=HTTPConnection('127.0.0.1',server.server_address[1],timeout=3)
                denied.request('POST',f"/api/workspace/tasks/{self.item['id']}/delivery-review",json.dumps(self.approval),
                    {'Origin':server.origin,'X-Session-CSRF':server.csrf_token,'X-Session-Client':'panel',
                     'Content-Type':'application/json',**invalid})
                response=denied.getresponse(); response.read(); denied.close()
                self.assertEqual(response.status,403)
            with self.profile.store.connection() as c:
                self.assertEqual(c.execute('SELECT COUNT(*) FROM task_reviews').fetchone()[0],0)
            connection=HTTPConnection('127.0.0.1',server.server_address[1],timeout=3)
            connection.request('POST',f"/api/workspace/tasks/{self.item['id']}/delivery-review",json.dumps(self.approval),
                {'Origin':server.origin,'X-Session-CSRF':server.csrf_token,'X-Session-Client':'panel','Content-Type':'application/json'})
            response=connection.getresponse(); value=json.loads(response.read()); connection.close()
            self.assertEqual(response.status,200,value)
            self.assertEqual(value['item']['state'],'review')
            self.assertEqual(value['item']['accepted_delivery_id'],self.delivery)
        finally:
            server.shutdown(); thread.join(3); server.server_close()
        with self.profile.store.connection() as c:
            review=c.execute('SELECT * FROM task_reviews').fetchone()
            self.assertEqual((review['delivery_id'],review['native_run_id'],review['verdict']),(self.delivery,None,'approved'))
            flow=c.execute('SELECT * FROM automation_flows').fetchone()
            self.assertEqual((flow['status'],flow['phase']),('waiting_external','integration'))
            self.assertEqual(json.loads(flow['attention_json'])['target_branch'],'develop')

    def test_replay_keeps_historical_fact_without_touch_after_source_changes(self):
        first=self.service.review_task_delivery(self.item['id'],self.approval)
        (self.root/'repo/input.txt').write_bytes(b'new source after decision')
        again=self.service.review_task_delivery(self.item['id'],self.approval)
        self.assertEqual(first['item']['revision'],again['item']['revision'])
        self.assertEqual(again['item']['accepted_delivery_id'],self.delivery)
        with self.assertRaises(ProfileError):
            self.service.review_task_delivery(self.item['id'],{**self.approval,'reason':'different'})

    def test_new_decision_rejects_changed_source_logs_and_missing_checker(self):
        source=self.root/'repo/input.txt'; original=source.read_bytes(); source.write_bytes(b'changed')
        with self.assertRaises(ProfileError):
            self.service.review_task_delivery(self.item['id'],self.approval)
        source.write_bytes(original)
        checker=self.service.check_verification
        self.service.check_verification=None
        with self.assertRaises(ProfileError):
            self.service.review_task_delivery(self.item['id'],self.approval)
        self.service.check_verification=checker
        from pathlib import Path
        output=Path(self.published['step']['result']['output_dir']); (output/'stderr.log').write_bytes(b'tampered')
        with self.assertRaises(ProfileError):
            self.service.review_task_delivery(self.item['id'],self.approval)
        self.assertIsNone(self.profile.store.get_item(self.item['id'])['accepted_delivery_id'])

    def test_conflicting_concurrent_decisions_have_one_winner(self):
        from concurrent.futures import ThreadPoolExecutor
        barrier=threading.Barrier(2)
        checker=self.service.check_verification
        def checked(step,flow):
            result=checker(step,flow); barrier.wait(timeout=5); return result
        self.service.check_verification=checked
        def decide(verdict):
            try:
                self.service.review_task_delivery(self.item['id'],{**self.approval,'verdict':verdict,'client_token':verdict})
                return True
            except ProfileError:
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes=list(pool.map(decide,('approved','rejected')))
        self.assertEqual(outcomes.count(True),1)
        with self.profile.store.connection() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM task_reviews').fetchone()[0],1)

    def test_strict_owner_request_rejects_forged_actor_and_non_string_reason(self):
        for body in ({**self.approval,'actor':'owner'}, {**self.approval,'reason':None},
                     {**self.approval,'confirmed':False}, {**self.approval,'verdict':'automatic'},
                     {**self.approval,'progress_revision':True}):
            with self.subTest(body=body), self.assertRaises(ProfileError):
                self.service.review_task_delivery(self.item['id'],body)

    def test_checker_gap_control_change_and_touch_failure_do_not_record_decision(self):
        from control_everything.workspace import automation_delivery_reviews as reviews
        with patch.object(reviews,'touch',side_effect=RuntimeError('fixture_before_touch')):
            with self.assertRaisesRegex(RuntimeError,'fixture_before_touch'):
                self.service.review_task_delivery(self.item['id'],self.approval)
        with self.profile.store.connection() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM task_reviews').fetchone()[0],0)
            self.assertEqual(c.execute('SELECT status FROM automation_flows').fetchone()[0],'awaiting_acceptance')
        checker=self.service.check_verification
        def changed(step,flow):
            result=checker(step,flow)
            with self.profile.store.connection() as c:
                c.execute('UPDATE task_items SET progress_revision=progress_revision+1 WHERE id=?',(self.item['id'],))
            return result
        self.service.check_verification=changed
        with self.assertRaisesRegex(ProfileError,'delivery_changed'):
            self.service.review_task_delivery(self.item['id'],self.approval)
        with self.profile.store.connection() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM task_reviews').fetchone()[0],0)

    def test_changes_requested_is_a_human_fact_without_automatic_repair(self):
        result=self.service.review_task_delivery(self.item['id'],{**self.approval,'verdict':'changes_requested'})
        self.assertEqual(result['item']['state'],'doing')
        self.assertIsNone(result['item']['accepted_delivery_id'])
        with self.profile.store.connection() as c:
            flow=c.execute('SELECT * FROM automation_flows').fetchone()
            self.assertEqual(json.loads(flow['attention_json'])['reason'],'acceptance_changes_requested')
        self.pump()
        self.assertEqual(len(self.host.calls),3)

    def test_dispatch_uses_requested_historical_delivery_source(self):
        from uuid import uuid4
        old=str(uuid4())
        with self.profile.store.connection() as c:
            c.execute("INSERT INTO task_deliveries VALUES(?,?,NULL,'legacy_review','legacy','Old','{}','unverified','then')",
                      (old,self.item['id']))
        body={**self.approval,'delivery_id':old}
        with patch.object(self.service.native_progress,'review_delivery',return_value={'native':'unchanged'}) as native:
            self.assertEqual(self.service.review_task_delivery(self.item['id'],body),{'native':'unchanged'})
            native.assert_called_once_with(self.item['id'],body)

    def test_old_delivery_and_missing_trusted_model_or_active_writer_cannot_be_approved(self):
        from control_everything.workspace.native_progress import packed
        with self.profile.store.connection() as c:
            c.execute("UPDATE automation_steps SET status='unknown',writes_project=1 WHERE kind='prepare'")
        with self.assertRaisesRegex(ProfileError,'automation_project_busy'):
            self.service.review_task_delivery(self.item['id'],self.approval)
        with self.profile.store.connection() as c:
            c.execute("UPDATE automation_steps SET status='completed' WHERE kind='prepare'")
            row=c.execute("SELECT id,result_json FROM automation_steps WHERE kind='plan'").fetchone()
            result=json.loads(row['result_json']); result['facts']['status'].pop('model')
            c.execute('UPDATE automation_steps SET result_json=? WHERE id=?',(packed(result),row['id']))
        with self.assertRaisesRegex(ProfileError,'automation_delivery_unverified'):
            self.service.review_task_delivery(self.item['id'],self.approval)
        with self.profile.store.connection() as c:
            c.execute('UPDATE task_items SET current_delivery_id=NULL WHERE id=?',(self.item['id'],))
        with self.assertRaisesRegex(ProfileError,'delivery_changed'):
            self.service.review_task_delivery(self.item['id'],self.approval)
        with self.profile.store.connection() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM task_reviews').fetchone()[0],0)

    def test_replay_without_checker_returns_recorded_fact_but_new_token_cannot_reapprove(self):
        result=self.service.review_task_delivery(self.item['id'],self.approval)
        self.service.check_verification=None
        replay=self.service.review_task_delivery(self.item['id'],self.approval)
        self.assertEqual(replay['review']['id'],result['review']['id'])
        self.assertTrue(replay['replayed'])
        with self.assertRaises(ProfileError):
            self.service.review_task_delivery(self.item['id'],{**self.approval,'client_token':'another'})

class AutomationCapabilityResumeTests(AutomationQueueFixture):
    pump = deliveries.AutomationDeliveryTests.pump
    configure_verification = deliveries.AutomationDeliveryTests.configure_verification
    prepare = deliveries.AutomationDeliveryTests.prepare

    def setUp(self):
        super().setUp()
        self.consumer_type = AutomationConsumer
        self.queue,self.host=AutomationQueue(self.profile.store),PlanningHost()
        self.consumer=AutomationConsumer(self.queue,self.host)
        self.prepare()
        self.waiting=self.queue.wait(self.consumer.lease,self.view['step'],'waiting_external','verify',
            {'reason':'code_review_or_acceptance_not_connected'})
        self.service.check_verification=self.consumer.check_verification
        self.queue.release(self.consumer.lease)
        item=self.profile.store.get_item(self.item['id'])
        self.resume={'flow_id':self.waiting['flow']['id'],'expected_flow_revision':self.waiting['flow']['revision'],
            'expected_revision':item['revision'],'progress_revision':item['progress_revision'],'confirmed':True}

    def test_resume_keeps_original_operation_and_replay_does_not_repeat_work(self):
        original=self.waiting['step']
        result=self.service.resume_task_automation(self.item['id'],self.resume)
        self.assertEqual(result['status'],'resumed')
        self.assertEqual(result['flow']['revision'],self.resume['expected_flow_revision']+1)
        replay=self.service.resume_task_automation(self.item['id'],self.resume)
        self.assertEqual(replay['status'],'already_at_stage')
        self.assertEqual(replay['flow']['revision'],result['flow']['revision'])
        ready=self.pump()
        self.assertEqual(ready['flow']['status'],'awaiting_acceptance')
        self.assertEqual(ready['step']['operation_id'],original['operation_id'])
        self.assertEqual(ready['step']['result'],original['result'])
        self.assertEqual(len(self.host.calls),3)
        self.assertEqual(len(self.verification_calls),1)
        self.assertEqual(self.service.resume_task_automation(self.item['id'],self.resume)['status'],'already_at_stage')
        self.assertIsNone(self.profile.store.get_item(self.item['id'])['accepted_delivery_id'])

    def test_existing_running_stage_is_observed_without_claiming_request_history(self):
        # Restore the normal completed-verify running stage, without invoking resume.
        with self.profile.store.connection() as c:
            c.execute("UPDATE automation_flows SET status='running',revision=?,attention_json='{}' WHERE id=?",
                      (self.waiting['flow']['revision']-1,self.resume['flow_id']))
            before = '\n'.join(c.iterdump())
        request = {**self.resume,'expected_flow_revision':self.waiting['flow']['revision']-2}
        result = self.service.resume_task_automation(self.item['id'],request)
        self.assertEqual(result['status'],'already_at_stage')
        with self.profile.store.connection() as c:
            self.assertEqual('\n'.join(c.iterdump()),before)

    def test_wrong_reason_waiting_user_unknown_and_stale_versions_cannot_resume(self):
        from control_everything.workspace.native_progress import packed
        for change in ({'confirmed':False},{'expected_flow_revision':True},{'progress_revision':True},
                       {'expected_flow_revision':self.resume['expected_flow_revision']-1},{'actor':'owner'}):
            with self.subTest(change=change),self.assertRaises(ProfileError):
                self.service.resume_task_automation(self.item['id'],{**self.resume,**change})
        for status,reason in (('waiting_user','code_review_or_acceptance_not_connected'),
                              ('waiting_external','verification_unknown'),('waiting_external','verification_not_configured')):
            with self.profile.store.connection() as c:
                c.execute('UPDATE automation_flows SET status=?,attention_json=?',(status,packed({'reason':reason})))
            with self.assertRaises(ProfileError):
                self.service.resume_task_automation(self.item['id'],self.resume)
        with self.profile.store.connection() as c:
            c.execute("UPDATE automation_flows SET status='waiting_external',attention_json=?",
                      (packed({'reason':'code_review_or_acceptance_not_connected'}),))
            c.execute("UPDATE automation_steps SET status='unknown' WHERE kind='verify'")
        with self.assertRaises(ProfileError):
            self.service.resume_task_automation(self.item['id'],self.resume)

    def test_source_change_or_missing_checker_does_not_wake_wait(self):
        source=self.root/'repo/input.txt'; original=source.read_bytes(); source.write_bytes(b'changed')
        with self.assertRaises(ProfileError):
            self.service.resume_task_automation(self.item['id'],self.resume)
        source.write_bytes(original)
        self.service.check_verification=None
        with self.assertRaises(ProfileError):
            self.service.resume_task_automation(self.item['id'],self.resume)
        with self.profile.store.connection() as c:
            self.assertEqual(c.execute('SELECT status FROM automation_flows').fetchone()[0],'waiting_external')

    def test_real_http_resume_is_consumed_by_background_without_model_or_runner_replay(self):
        import time
        server=PanelServer((HOST,0),PanelHandler)
        server.workspace,server.profile=self.service,self.profile
        server.expected_host=f'127.0.0.1:{server.server_address[1]}'
        server.origin=server.local_origin='http://'+server.expected_host
        server.csrf_token='resume-owner-token'
        with patch('control_everything.integrations.workbench_progress.WorkbenchProgressAdapter',return_value=self.host):
            server.attach_workbench_runtime(Mock(ready=True))
        thread=threading.Thread(target=server.serve_forever); thread.start()
        try:
            connection=HTTPConnection('127.0.0.1',server.server_address[1],timeout=3)
            connection.request('POST',f"/api/workspace/tasks/{self.item['id']}/automation-resume",json.dumps(self.resume),
                {'Origin':server.origin,'X-Session-CSRF':server.csrf_token,'X-Session-Client':'panel','Content-Type':'application/json'})
            response=connection.getresponse(); value=json.loads(response.read()); connection.close()
            self.assertEqual(response.status,202,value)
            deadline=time.monotonic()+5
            while time.monotonic()<deadline:
                with self.profile.store.connection() as c:
                    flow=c.execute('SELECT status FROM automation_flows').fetchone()[0]
                if flow=='awaiting_acceptance': break
                server.automation_consumer_service.wake(); threading.Event().wait(.02)
            self.assertEqual(flow,'awaiting_acceptance')
        finally:
            server.shutdown(); thread.join(3); server.server_close()
        self.assertEqual(len(self.host.calls),3)
        self.assertEqual(len(self.verification_calls),1)
        with self.profile.store.connection() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM automation_steps').fetchone()[0],5)
            self.assertEqual(c.execute('SELECT COUNT(*) FROM task_deliveries').fetchone()[0],1)
            self.assertEqual(c.execute('SELECT COUNT(*) FROM task_reviews').fetchone()[0],0)
