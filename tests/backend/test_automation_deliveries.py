"""Publish only independently approved, current, real verification evidence."""
import json
from pathlib import Path
from unittest.mock import patch

from control_everything.execution.verification import read_verification_receipt
from control_everything.input_validation import ProfileError
from control_everything.workspace import automation_flow
from control_everything.workspace.native_progress import digest, packed
from tests.backend import test_automation_consumer as consumer_tests
from tests.backend.test_automation_queue import AutomationQueueFixture


class AutomationDeliveryTests(AutomationQueueFixture):
    def setUp(self):
        super().setUp()
        from control_everything.workspace.automation_consumer import AutomationConsumer
        from control_everything.workspace.automation_flow import AutomationQueue
        from tests.backend.test_automation_consumer import PlanningHost
        self.consumer_type = AutomationConsumer
        self.queue = AutomationQueue(self.profile.store)
        self.host = PlanningHost()
        self.consumer = AutomationConsumer(self.queue,self.host)
    pump = consumer_tests.ConsumerTests.pump
    configure_verification = consumer_tests.ConsumerTests.configure_verification

    def prepare(self):
        self.configure_verification()
        def check(step, flow):
            output = self.profile.data_dir / 'automation-verification' / flow['id'] / step['id']
            return {'receipt': read_verification_receipt(output_dir=output,
                argv=step['request']['verification']['argv'], cwd=step['request']['scope']['cwd'],
                task_id=flow['task_id'], flow_id=flow['id'], step_id=step['id'],
                source_files=step['request']['verification']['source_files']), 'output_dir': str(output)}
        self.consumer.check_verification = check
        for _ in range(12):
            self.consumer.run_once()
        with self.profile.store.connection() as c:
            self.view = self.queue._view(c, c.execute('SELECT id FROM automation_flows').fetchone()[0])
        self.assertEqual(self.view['step']['status'], 'completed')
        return check

    def test_real_receipt_creates_one_unaccepted_delivery_and_restart_does_not_touch(self):
        self.prepare()
        original = self.profile.store.get_item(self.item['id'])
        result = self.pump()
        self.assertEqual(result['flow']['status'], 'awaiting_acceptance')
        with self.profile.store.connection() as c:
            deliveries = c.execute('SELECT * FROM task_deliveries').fetchall()
            self.assertEqual(len(deliveries), 1)
            d = dict(deliveries[0])
            self.assertEqual((d['source'],d['source_key'],d['native_run_id']), ('automation_verify',result['step']['id'],None))
            material = json.loads(d['material_json'])
            self.assertEqual(material['receipt'], result['step']['result']['receipt'])
            self.assertEqual(material['identity_scope'], 'declared_inputs')
            self.assertEqual(c.execute('SELECT COUNT(*) FROM task_reviews').fetchone()[0], 0)
        item = self.profile.store.get_item(self.item['id'])
        self.assertEqual((item['state'],item['current_delivery_id'],item['accepted_delivery_id']), ('review',d['id'],None))
        self.assertEqual(item['revision'], original['revision']+1)
        checked = self.consumer.check_verification(self.view['step'], self.view['flow'])
        self.queue.publish_delivery(self.consumer.lease, self.view['step'], checked)
        self.assertEqual(self.profile.store.get_item(self.item['id'])['revision'], item['revision'])
        self.consumer = self.consumer_type(self.queue,self.host)
        self.pump()
        self.assertEqual(len(self.host.calls), 3)
        self.assertEqual(len(self.verification_calls), 1)

    def test_tampered_evidence_or_source_is_not_ready(self):
        check = self.prepare()
        output = Path(self.view['step']['result']['output_dir'])
        for target in ('receipt.json','stdout.log','input.txt'):
            with self.subTest(target=target):
                path = self.root/'repo'/target if target=='input.txt' else output/target
                original = path.read_bytes()
                path.write_bytes(original+b'changed')
                with self.assertRaises((ValueError, OSError)):
                    check(self.view['step'],self.view['flow'])
                path.write_bytes(original)
        for files in ([], ['input.txt','./input.txt'], ['../outside.txt'], [str(self.root/'repo/input.txt')]):
            with self.subTest(files=files), self.assertRaises(ValueError):
                read_verification_receipt(output_dir=output, argv=self.view['step']['request']['verification']['argv'],
                    cwd=self.root/'repo',task_id=self.item['id'],flow_id=self.view['flow']['id'],
                    step_id=self.view['step']['id'],source_files=files)
        (output/'stderr.log').write_bytes(b'changed')
        result = self.pump()
        self.assertEqual(result['flow']['status'], 'waiting_external')
        self.assertEqual(result['flow']['attention']['reason'], 'verification_evidence_invalid')

    def test_missing_checker_cannot_publish(self):
        self.prepare()
        self.consumer.check_verification = None
        self.assertEqual(self.pump()['flow']['attention']['reason'], 'verification_checker_unavailable')

    def test_transaction_rechecks_versions_owner_and_slot_and_rolls_back_touch_failure(self):
        check = self.prepare()
        checked = check(self.view['step'],self.view['flow'])
        with patch.object(automation_flow, 'touch', side_effect=RuntimeError('fixture_after_delivery_insert')):
            with self.assertRaisesRegex(RuntimeError,'fixture_after_delivery_insert'):
                self.queue.publish_delivery(self.consumer.lease,self.view['step'],checked)
        with self.profile.store.connection() as c:
            self.assertEqual(c.execute('SELECT COUNT(*) FROM task_deliveries').fetchone()[0],0)
            self.assertEqual(c.execute('SELECT status FROM automation_flows').fetchone()[0],'running')
        with self.profile.store.connection() as c:
            c.execute('UPDATE task_items SET revision=revision+1 WHERE id=?',(self.item['id'],))
        with self.assertRaisesRegex(ProfileError,'automation_requirement_changed'):
            self.queue.publish_delivery(self.consumer.lease,self.view['step'],checked)

    def test_wrong_model_or_frozen_reference_cannot_publish(self):
        check = self.prepare()
        checked = check(self.view['step'],self.view['flow'])
        for change in ('model','review'):
            with self.subTest(change=change), self.profile.store.connection() as c:
                if change=='model':
                    row=c.execute("SELECT id,result_json FROM automation_steps WHERE kind='implement'").fetchone()
                    value=json.loads(row['result_json']); value['facts']['status']['model']='gpt-6-astra'
                    column='result_json'
                else:
                    row=c.execute("SELECT id,request_json FROM automation_steps WHERE kind='verify'").fetchone()
                    value=json.loads(row['request_json']); value['review_step_id']='missing'
                    column='request_json'
                old=c.execute(f'SELECT {column} FROM automation_steps WHERE id=?',(row['id'],)).fetchone()[0]
                c.execute(f'UPDATE automation_steps SET {column}=? WHERE id=?',(packed(value),row['id']))
                c.commit()
                with self.assertRaisesRegex(ProfileError,'automation_delivery_unverified|automation_step_changed'):
                    self.queue.publish_delivery(self.consumer.lease,self.view['step'],checked)
                c.execute(f'UPDATE automation_steps SET {column}=? WHERE id=?',(old,row['id']))

    def test_completed_step_can_publish_under_new_owner_but_old_lease_cannot(self):
        check = self.prepare()
        checked = check(self.view['step'],self.view['flow'])
        old = self.consumer.lease
        self.queue.release(old)
        from control_everything.workspace.automation_flow import AutomationQueue
        queue = AutomationQueue(self.profile.store)
        lease = queue.acquire()
        with self.assertRaisesRegex(ProfileError,'automation_owner_lost'):
            self.queue.publish_delivery(old,self.view['step'],checked)
        view = queue.claim(lease,self.event['id'])
        self.assertNotEqual(view['step']['owner_generation'], lease.generation)
        self.assertEqual(queue.publish_delivery(lease,view['step'],checked)['flow']['status'],'awaiting_acceptance')

    def test_flow_cas_and_active_project_writer_are_rechecked(self):
        check = self.prepare()
        checked = check(self.view['step'],self.view['flow'])
        with self.profile.store.connection() as c:
            c.execute('UPDATE automation_flows SET revision=revision+1 WHERE id=?',(self.view['flow']['id'],))
        with self.assertRaisesRegex(ProfileError,'automation_step_changed'):
            self.queue.publish_delivery(self.consumer.lease,self.view['step'],checked)
        self.view['step'] = self.queue.get_step(self.view['step']['id'])
        with self.profile.store.connection() as c:
            c.execute("UPDATE automation_steps SET status='unknown',writes_project=1 WHERE kind='implement'")
        with self.assertRaises(ProfileError):
            self.queue.publish_delivery(self.consumer.lease,self.view['step'],checked)
        with self.profile.store.connection() as c:
            c.execute("UPDATE automation_steps SET status='completed',writes_project=1 WHERE kind='implement'")
            c.execute("UPDATE automation_steps SET status='unknown',writes_project=1 WHERE kind='prepare'")
        with self.assertRaisesRegex(ProfileError,'automation_project_busy'):
            self.queue.publish_delivery(self.consumer.lease,self.view['step'],checked)

    def test_missing_or_non_small_independent_approval_is_not_ready(self):
        check = self.prepare()
        checked = check(self.view['step'],self.view['flow'])
        with self.profile.store.connection() as c:
            row = c.execute("SELECT id,result_json FROM automation_steps WHERE kind='plan_review'").fetchone()
            value=json.loads(row['result_json']); text=json.loads(value['text']); text['kind']='feature'
            value['text']=json.dumps(text)
            c.execute('UPDATE automation_steps SET result_json=? WHERE id=?',(packed(value),row['id']))
            for frozen in c.execute("SELECT id,request_json FROM automation_steps WHERE kind IN ('implement','verify')").fetchall():
                request=json.loads(frozen['request_json']); request['review_hash']=digest(value['text'])
                c.execute('UPDATE automation_steps SET request_json=? WHERE id=?',(packed(request),frozen['id']))
        self.view['step']=self.queue.get_step(self.view['step']['id'])
        with self.assertRaisesRegex(ProfileError,'automation_delivery_unverified'):
            self.queue.publish_delivery(self.consumer.lease,self.view['step'],checked)

    def test_checker_gap_directory_change_waits_without_ready(self):
        check = self.prepare()
        def changed(step,flow):
            result = check(step,flow)
            consumer_tests.ConsumerTests.change_project(self)
            return result
        self.consumer.check_verification=changed
        self.assertEqual(self.pump()['flow']['attention']['reason'],'project_directory_changed')

    def test_queue_owner_error_after_checker_is_not_relabelled_as_evidence_error(self):
        check = self.prepare()
        def replaced(step,flow):
            result=check(step,flow)
            self.queue.release(self.consumer.lease)
            return result
        self.consumer.check_verification=replaced
        with self.assertRaisesRegex(ProfileError,'automation_owner_lost'):
            self.consumer.run_once()
        with self.profile.store.connection() as c:
            self.assertEqual(c.execute('SELECT status FROM automation_flows').fetchone()[0],'running')
            self.assertEqual(c.execute('SELECT COUNT(*) FROM task_deliveries').fetchone()[0],0)

    def test_verified_evidence_copy_uses_current_profile_path_without_changing_original_result(self):
        import shutil
        from control_everything.profiles.profile import Profile
        from control_everything.profiles.profile_import import create_backup, restore_backup
        from control_everything.workspace.automation_flow import AutomationQueue
        check = self.prepare()
        step, flow = self.view['step'], self.view['flow']
        original_result = packed(step['result'])
        original_output = Path(step['result']['output_dir'])
        self.queue.release(self.consumer.lease)
        backup = create_backup(self.profile)
        copied = restore_backup(str(backup), str(self.root/'copied-profile'))
        self.profile = Profile.open(str(copied))
        output = self.profile.data_dir/'automation-verification'/flow['id']/step['id']
        shutil.copytree(original_output, output)
        self.queue = AutomationQueue(self.profile.store)
        lease = self.queue.acquire()
        step = self.queue.claim(lease,self.event['id'])['step']
        log = output/'stdout.log'
        original_log = log.read_bytes()
        log.write_bytes(original_log+b'tampered')
        with self.assertRaisesRegex(ValueError,'verification_log_changed'):
            check(step,flow)
        log.write_bytes(original_log)
        checked = check(step,flow)
        result = self.queue.publish_delivery(lease,step,checked)
        self.assertEqual(result['flow']['status'],'awaiting_acceptance')
        material = result['delivery']['material']
        self.assertEqual(material['output_dir'],str(output))
        self.assertEqual(material['verify_hash'],digest(json.loads(original_result)))
        self.assertEqual(packed(self.queue.get_step(step['id'])['result']),original_result)
        self.assertEqual(step['result']['output_dir'],str(original_output))
        self.assertEqual((original_output/'stdout.log').read_bytes(),original_log)
