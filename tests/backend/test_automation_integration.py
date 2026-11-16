from tests.backend.test_automation_integration_targets import IntegrationTargetTests

class IntegrationExecutionTests(IntegrationTargetTests):
    def test_designated_acceptor_review_can_integrate_and_a_stranger_cannot(self):
        from control_everything.input_validation import ProfileError
        from tests.backend.test_automation_queue import designate_actor
        registered = self.service.register_task_integration_target(self.item['id'], self.request)
        with self.profile.store.connection() as connection:
            connection.execute("UPDATE task_reviews SET reviewer='ou-owner' WHERE task_id=?", (self.item['id'],))
        with self.assertRaises(ProfileError):
            self.queue.reserve_integration(self.queue.acquire(), registered['flow']['id'], registered['flow']['revision'])
        designate_actor(self.profile.store, self.item['id'], 'ou-stranger')
        with self.assertRaises(ProfileError):
            self.queue.reserve_integration(self.queue.acquire(), registered['flow']['id'], registered['flow']['revision'])
        with self.profile.store.connection() as connection:
            connection.execute('DELETE FROM automation_task_acceptors WHERE task_id=?', (self.item['id'],))
        designate_actor(self.profile.store, self.item['id'], 'ou-owner')
        step = self.queue.reserve_integration(self.queue.acquire(), registered['flow']['id'], registered['flow']['revision'])
        self.assertEqual(step['kind'], 'integrate')

    def test_registered_intent_is_claimed_without_model(self):
        registered = self.service.register_task_integration_target(self.item['id'], self.request)
        self.assertIn(self.event['id'], self.queue.pending_events())
        step = self.queue.reserve_integration(self.queue.acquire(), registered['flow']['id'], registered['flow']['revision'])
        self.assertEqual(step['kind'], 'integrate')
        self.assertEqual(step['request']['context'], registered['flow']['context'])

    def test_callback_completes_once_without_available_model(self):
        from control_everything.workspace.native_progress import digest
        self.service.register_task_integration_target(self.item['id'], self.request)
        self.host.available = False
        calls = []
        def run(step, flow, *, cancel_event, checkpoint):
            checkpoint()
            calls.append(step['operation_id'])
            return {'operation_id':step['operation_id'],'request_hash':digest(step['request']),
                    'integration_target':step['request']['integration_target'],
                    'candidate_sha':'b'*40,'target_sha':'b'*40,'remote_sha':'b'*40,
                    'candidate_test_passed':True,'target_test_passed':True,
                    'source_unchanged':True,'cleanup_verified':True}
        self.consumer.integration = run
        result = self.consumer.run_once()
        self.assertEqual(result['flow']['status'], 'completed')
        item = self.profile.store.get_item(self.item['id'])
        self.assertEqual(item['state'], 'done')
        self.assertEqual(item['accepted_delivery_id'],self.delivery)
        self.consumer.run_once()
        self.assertEqual(len(calls),1)

    def test_absent_callback_leaves_registered_wait(self):
        registered = self.service.register_task_integration_target(self.item['id'], self.request)
        result = self.consumer.run_once()
        self.assertEqual(result['flow'],registered['flow'])
        self.assertEqual(result['step']['kind'],'verify')

    def test_uncertain_callback_is_never_dispatched_again(self):
        self.service.register_task_integration_target(self.item['id'], self.request)
        calls = []
        def run(*args, **kwargs):
            calls.append(1)
            raise TimeoutError()
        cards = []
        self.consumer.on_wait = cards.append
        self.consumer.integration = run
        failed = self.consumer.run_once()
        self.assertEqual(failed['status'],'unknown')
        self.assertEqual(cards[0]['body']['elements'][1]['value']['reason'], 'integration_retest_failed')
        self.assertNotIn('verdict', cards[0]['body']['elements'][1]['value'])
        self.assertEqual(self.consumer.run_once()['status'],'unknown')
        self.assertEqual(len(calls),1)

    def test_accepted_revision_change_prevents_reservation(self):
        registered = self.service.register_task_integration_target(self.item['id'], self.request)
        with self.profile.store.connection() as c:
            c.execute('UPDATE task_items SET progress_revision=progress_revision+1 WHERE id=?',(self.item['id'],))
        from control_everything.input_validation import ProfileError
        with self.assertRaises(ProfileError):
            self.queue.reserve_integration(self.queue.acquire(),registered['flow']['id'],registered['flow']['revision'])

    def test_untrusted_result_cannot_complete_or_release_slot(self):
        self.service.register_task_integration_target(self.item['id'], self.request)
        self.consumer.integration = lambda *args, **kwargs: {'candidate_sha':'b'*40}
        step = self.consumer.run_once()
        self.assertEqual(step['status'],'unknown')
        self.assertEqual(self.profile.store.get_item(self.item['id'])['accepted_delivery_id'],self.delivery)
        with self.profile.store.connection() as c:
            self.assertEqual(c.execute("SELECT writes_project FROM automation_steps WHERE id=?",(step['id'],)).fetchone()[0],1)

    def test_checkpoint_rejects_changed_accepted_identity(self):
        self.service.register_task_integration_target(self.item['id'], self.request)
        def run(step, flow, *, cancel_event, checkpoint):
            with self.profile.store.connection() as c:
                c.execute('UPDATE task_items SET revision=revision+1 WHERE id=?',(self.item['id'],))
            checkpoint()
            self.fail('changed approval dispatched another action')
        self.consumer.integration = run
        result = self.consumer.run_once()
        self.assertEqual(result['status'],'unknown')
        self.assertEqual(result['result']['error_type'],'ProfileError')

    def test_gateway_attaches_explicit_callback_boundary(self):
        from unittest.mock import Mock, patch
        from control_everything.http.gateway import HOST, PanelHandler, PanelServer
        server = PanelServer((HOST,0),PanelHandler)
        server.workspace, server.profile = self.service, self.profile
        callback = Mock()
        server.automation_integration = callback
        try:
            with patch('control_everything.integrations.workbench_progress.WorkbenchProgressAdapter',return_value=self.host), \
                 patch('control_everything.workspace.automation_consumer.AutomationConsumerService.start'), \
                 patch('control_everything.workspace.native_progress_observer.NativeProgressObserver.start'):
                server.attach_workbench_runtime(Mock(ready=True))
            self.assertIs(server.automation_consumer_service.consumer.integration,callback)
        finally:
            server.server_close()

    def test_missing_checker_does_not_reserve(self):
        registered = self.service.register_task_integration_target(self.item['id'], self.request)
        self.consumer.integration = lambda *a, **k: self.fail('must not dispatch')
        self.consumer.check_verification = None
        result = self.consumer.run_once()
        self.assertEqual(result['flow'],registered['flow'])
        self.assertEqual(result['step']['kind'],'verify')

    def test_bad_source_checker_releases_reserved_slot(self):
        self.service.register_task_integration_target(self.item['id'], self.request)
        self.consumer.integration = lambda *a, **k: self.fail('must not dispatch')
        def invalid(*a):
            raise ValueError('source_changed')
        self.consumer.check_verification = invalid
        result = self.consumer.run_once()
        self.assertEqual(result['flow']['status'],'waiting_external')
        self.assertEqual(result['step']['status'],'failed')

    def test_sha256_target_accepts_same_format_result(self):
        from control_everything.workspace.native_progress import digest
        self.request['target']['expected_base']='a'*64
        self.service.register_task_integration_target(self.item['id'], self.request)
        def run(step, flow, **kwargs):
            return {'operation_id':step['operation_id'],'request_hash':digest(step['request']),
                'integration_target':step['request']['integration_target'],
                'candidate_sha':'b'*64,'target_sha':'b'*64,'remote_sha':'b'*64,
                'candidate_test_passed':True,'target_test_passed':True,
                'source_unchanged':True,'cleanup_verified':True}
        self.consumer.integration=run
        self.assertEqual(self.consumer.run_once()['flow']['status'],'completed')

    def test_copied_profile_keeps_historical_result_and_checks_current_receipt(self):
        import shutil
        from control_everything.profiles.profile import Profile
        from control_everything.workspace.automation_flow import AutomationQueue
        self.service.register_task_integration_target(self.item['id'], self.request)
        original = self.queue.get_step(self.published['step']['id'])
        shutil.copytree(self.root/'profile',self.root/'copied-profile')
        self.profile = Profile.open(str(self.root/'copied-profile'))
        self.queue = AutomationQueue(self.profile.store,owner_id=self.queue.owner_id)
        self.consumer.queue = self.queue
        calls=[]
        def run(step, flow, **kwargs):
            calls.append(1)
            raise TimeoutError()
        self.consumer.integration=run
        result=self.consumer.run_once()
        self.assertEqual(len(calls),1)
        self.assertEqual(result['status'],'unknown')
        self.assertEqual(self.queue.get_step(original['id'])['result'],original['result'])

    def _background_rejection(self, change):
        import time
        from control_everything.workspace.automation_consumer import AutomationConsumerService
        self.service.register_task_integration_target(self.item['id'], self.request)
        change()
        other = self.profile.store.save_item({'title':'Other authorized task','project_id':self.project['id'],
            'provider_id':None,'state':'todo','session_key':None})
        event = self.service.enable_task_automation(other['id'],{**self.body,'client_token':'other-approved'})
        self.consumer.integration=lambda *a, **k:self.fail('must not dispatch')
        service=AutomationConsumerService(self.consumer)
        service.start()
        try:
            deadline=time.monotonic()+5
            while time.monotonic()<deadline:
                with self.profile.store.connection() as c:
                    flow=c.execute('SELECT status FROM automation_flows WHERE task_id=?',(other['id'],)).fetchone()
                if flow and flow['status']=='waiting_external':
                    break
                service.wake()
                time.sleep(.02)
            self.assertTrue(service.thread.is_alive())
            self.assertIsNone(service.last_error)
            self.assertIsNotNone(flow)
            self.assertEqual(flow['status'],'waiting_external')
        finally:
            service.close()

    def test_background_rejects_changed_source_and_continues_other_task(self):
        self._background_rejection(lambda:(self.root/'repo'/'input.txt').write_text('changed',encoding='utf-8'))

    def test_background_rejects_changed_log_and_continues_other_task(self):
        from pathlib import Path
        self._background_rejection(lambda:(Path(self.published['step']['result']['output_dir'])/'stdout.log').write_bytes(b'changed'))

    def test_background_rejects_changed_approval_and_continues_other_task(self):
        def change():
            with self.profile.store.connection() as c:
                c.execute('UPDATE task_items SET revision=revision+1 WHERE id=?',(self.item['id'],))
        self._background_rejection(change)

    def test_owner_lost_before_dispatch_is_not_relabelled_or_written(self):
        from control_everything.input_validation import ProfileError
        self.service.register_task_integration_target(self.item['id'], self.request)
        original=self.consumer.check_verification
        def lose(step,flow):
            result=original(step,flow)
            with self.profile.store.connection() as c:
                c.execute('UPDATE automation_owner SET generation=generation+1')
            return result
        self.consumer.check_verification=lose
        self.consumer.integration=lambda *a,**k:self.fail('must not dispatch')
        with self.assertRaisesRegex(ProfileError,'automation_owner_lost'):
            self.consumer.run_once()
        with self.profile.store.connection() as c:
            step=self.queue._view(c,self.request['flow_id'])['step']
        self.assertEqual(step['status'],'reserved')

    def test_sha256_target_rejects_sha1_result(self):
        from control_everything.workspace.native_progress import digest
        self.request['target']['expected_base']='a'*64
        self.service.register_task_integration_target(self.item['id'], self.request)
        def run(step, flow, **kwargs):
            return {'operation_id':step['operation_id'],'request_hash':digest(step['request']),
                'integration_target':step['request']['integration_target'],
                'candidate_sha':'b'*40,'target_sha':'b'*40,'remote_sha':'b'*40,
                'candidate_test_passed':True,'target_test_passed':True,
                'source_unchanged':True,'cleanup_verified':True}
        self.consumer.integration=run
        self.assertEqual(self.consumer.run_once()['status'],'unknown')
