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
