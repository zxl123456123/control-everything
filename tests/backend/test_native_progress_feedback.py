"""Revision-bound feedback and receipt recovery, without sending to a real terminal."""

import copy
from unittest.mock import Mock

from control_everything.input_validation import ProfileError
from control_everything.workspace import task_messages
from control_everything.workspace.native_progress import NativeProgress
from tests.backend.test_native_progress import NativeFixture


class NativeFeedbackTests(NativeFixture):
    def feedback(self, value, *, send=False, token='feedback-one'):
        return {'expected_revision': value['item']['revision'], 'progress_revision': value['item']['progress_revision'],
                'source_delivery_id': value['current_delivery']['id'], 'body_text': 'Make it clearer',
                'client_token': token, 'send': send}

    def approval(self, value, token='approve-one'):
        return {'expected_revision': value['item']['revision'], 'progress_revision': value['item']['progress_revision'],
                'delivery_id': value['current_delivery']['id'], 'verdict': 'approved', 'reason': '',
                'confirmed': True, 'client_token': token}

    def test_save_is_not_sent_and_replay_uses_same_message(self):
        self.start()
        value = self.done()
        body = self.feedback(value)
        saved = self.progress.save_feedback(self.item['id'], body)
        self.assertEqual(saved['messages'][0]['native_delivery']['state'], 'saved')
        self.assertEqual(saved['messages'][0]['delivery_state'], 'previewed')
        replayed = self.progress.save_feedback(self.item['id'], body)
        self.assertEqual(len(replayed['messages']), 1)
        self.assertEqual(self.host.send_calls, 0)
        with self.assertRaisesRegex(ProfileError, 'item_changed'):
            self.progress.save_feedback(self.item['id'], {**body, 'body_text': 'changed'})
        with self.assertRaisesRegex(ProfileError, 'native_managed_message'):
            task_messages.mark_sent(self.store, saved['messages'][0]['id'])

    def test_acceptance_is_not_turn_start_or_done_and_read_recovery_does_not_send(self):
        self.start()
        value = self.done()
        body = self.feedback(value, send=True)
        result = self.progress.save_feedback(self.item['id'], body)
        message = result['messages'][0]
        self.assertEqual(message['native_delivery']['state'], 'input_accepted')
        self.assertNotEqual(result['item']['state'], 'done')
        self.progress.save_feedback(self.item['id'], body)
        self.progress.send_feedback(self.item['id'], message['id'])
        self.assertEqual(self.host.send_calls, 1)
        self.progress.record_receipt(message['id'], {'receiptState': 'absent', 'bindingState': 'unavailable'})
        result = self.progress.get(self.item['id'])
        self.assertEqual(result['messages'][0]['native_delivery']['state'], 'input_accepted')
        self.assertIn('historical_receipt', result['messages'][0]['native_delivery']['receipt'])

    def test_accepted_then_disconnected_reconciles_only_original_receipt(self):
        self.start()
        value = self.done()
        original = self.host.send
        def lost_reply(params, request_id):
            original(params, request_id)
            raise OSError('lost reply')
        self.host.send = lost_reply
        result = self.progress.save_feedback(self.item['id'], self.feedback(value, send=True))
        self.assertEqual(result['messages'][0]['native_delivery']['state'], 'unknown')
        service = NativeProgress(self.store, self.host)
        from threading import Event
        jobs = [job for job in service.observe_jobs() if job[0] == 'receipt']
        self.assertEqual(len(jobs), 1)
        # Exhaustion keeps the unknown receipt; a later read recovers without resending.
        service.observe_job(jobs[0], timeout=0, cancel_event=Event())
        self.assertEqual(service.get(self.item['id'])['messages'][0]['native_delivery']['state'], 'unknown')
        service.observe_job(jobs[0], timeout=5, cancel_event=Event())
        result = service.get(self.item['id'])
        self.assertEqual(result['messages'][0]['native_delivery']['state'], 'input_accepted')
        self.assertEqual(self.host.send_calls, 1)
        self.assertEqual(self.host.receipt_calls, 2)

    def test_pending_invalid_or_wrong_identity_never_grants_acceptance(self):
        self.start()
        result = self.progress.save_feedback(self.item['id'], self.feedback(self.done(), send=True))
        message = result['messages'][0]
        for response in ({'receiptState': 'pending'}, {'receiptState': 'invalid'},
                         {'receiptState': 'completed', 'receipt': {'send': {'accepted': True}}}):
            self.progress.record_receipt(message['id'], response)
            self.assertEqual(self.host.send_calls, 1)
        self.assertNotEqual(self.progress.get(self.item['id'])['messages'][0]['native_delivery']['state'], 'turn_started')

    def test_confirm_current_delivery_once_new_work_reopens_and_replay_does_not_close_it(self):
        self.start()
        done = self.done()
        body = self.approval(done)
        accepted = self.progress.review_delivery(self.item['id'], body)
        self.assertEqual(accepted['item']['state'], 'done')
        self.assertEqual(accepted['item']['accepted_delivery_id'], done['current_delivery']['id'])
        working = self.publish(state='working', turnStartedAt=200, turnEndedAt=None)
        self.assertEqual(working['item']['state'], 'doing')
        replayed = self.progress.review_delivery(self.item['id'], body)
        self.assertEqual(replayed['item']['state'], 'doing')
        with self.assertRaisesRegex(ProfileError, 'delivery_unknown'):
            self.progress.review_delivery(self.item['id'], {**body, 'client_token': 'new-intent'})

    def test_new_result_rejects_old_approval_and_unknown_hook_rejects_new(self):
        self.start()
        first = self.done()
        body = self.approval(first)
        second = self.done('New result', start=200, end=300)
        with self.assertRaisesRegex(ProfileError, 'item_changed|delivery_changed'):
            self.progress.review_delivery(self.item['id'], body)
        self.host.reply = {'available': False, 'reason': 'identity_unobserved'}
        with self.assertRaisesRegex(ProfileError, 'delivery_unknown'):
            self.progress.review_delivery(self.item['id'], self.approval(second))

    def test_feedback_and_old_confirmation_cannot_both_succeed(self):
        self.start()
        value = self.done()
        body = self.approval(value)
        other = NativeProgress(type(self.store)(self.store.path, profile=True), self.host)
        other.save_feedback(self.item['id'], self.feedback(value))
        with self.assertRaisesRegex(ProfileError, 'item_changed|delivery_changed'):
            self.progress.review_delivery(self.item['id'], body)

    def test_new_result_after_accepted_input_can_be_confirmed_without_claiming_message_turn_started(self):
        self.start()
        first = self.done()
        sent = self.progress.save_feedback(self.item['id'], self.feedback(first, send=True))
        self.assertEqual(sent['messages'][0]['native_delivery']['state'], 'input_accepted')
        second = self.done('Changed result', start=200, end=300)
        approved = self.progress.review_delivery(self.item['id'], self.approval(second))
        self.assertEqual(approved['item']['state'], 'done')
        self.assertEqual(approved['item']['accepted_delivery_id'], second['current_delivery']['id'])
        self.assertEqual(approved['messages'][0]['native_delivery']['state'], 'input_accepted')

    def test_effect_free_refusal_can_only_retry_on_explicit_send_and_preserves_attempt(self):
        self.start()
        first = self.done()
        original = self.host.send
        def refuse(params, request_id):
            result = original(params, request_id)
            result['send'].update(accepted=False, bytesWritten=0, refusedReason='input-locked')
            result['send']['prompt']['stages'] = []
            return result
        self.host.send = refuse
        refused = self.progress.save_feedback(self.item['id'], self.feedback(first, send=True))
        msg = refused['messages'][0]
        self.assertEqual(msg['native_delivery']['state'], 'refused')
        request_id = msg['native_delivery']['request_id']
        self.assertFalse(any(job[0] == 'receipt' for job in self.progress.observe_jobs()))
        self.host.send = original
        accepted = self.progress.send_feedback(self.item['id'], msg['id'])['messages'][0]['native_delivery']
        self.assertEqual(accepted['state'], 'input_accepted')
        self.assertNotEqual(accepted['request_id'], request_id)
        self.assertEqual(accepted['attempts'][0]['request_id'], request_id)
        self.assertEqual(self.host.send_calls, 2)

    def test_new_turn_without_a_result_cannot_confirm_previous_delivery(self):
        self.start()
        first = self.done()
        self.publish(state='working', turnStartedAt=200, turnEndedAt=None)
        latest = self.publish(state='done', turnStartedAt=200, turnEndedAt=300,
                              turnEndDisposition='identified', lastAssistantMessage='')
        self.assertEqual(latest['current_delivery']['id'], first['current_delivery']['id'])
        self.assertFalse(latest['capabilities']['can_review'])
        with self.assertRaisesRegex(ProfileError, 'delivery_unknown|delivery_changed'):
            self.progress.review_delivery(self.item['id'], self.approval(latest))

    def test_released_runs_saved_feedback_does_not_block_new_runs_delivery(self):
        self.start()
        first = self.done()
        saved = self.progress.save_feedback(self.item['id'], self.feedback(first))
        released = self.progress.release(self.item['id'], {
            'native_run_id': saved['native_run']['id'], 'expected_revision': saved['item']['revision'],
            'expected_binding_revision': saved['native_run']['binding_revision'], 'client_token': 'release', 'confirmed': True})
        self.progress.start(self.item['id'], {**self.start_body, 'client_token': 'start-two',
                                            'expected_revision': released['item']['revision']})
        latest = self.done('New run result', start=200, end=300)
        self.assertTrue(latest['capabilities']['can_review'])
        approved = self.progress.review_delivery(self.item['id'], self.approval(latest))
        self.assertEqual(approved['item']['state'], 'done')

    def test_resume_binding_does_not_revalidate_previous_delivery(self):
        self.start()
        first = self.done()
        self.host.binding.update(terminalHandle='resumed', ptyId='new-pty', processIncarnation='new-incarnation',
                                 statusProcessIncarnation='new-pty:new-incarnation')
        resumed = self.progress.resume(self.item['id'], {'native_run_id': first['native_run']['id'],
            'expected_binding_revision': first['native_run']['binding_revision'], 'client_token': 'resume'})
        self.assertFalse(resumed['capabilities']['can_review'])

    def test_current_turn_result_gaps_all_reject_previous_result_confirmation(self):
        self.start()
        first = self.done()
        for index, gap in enumerate(({'lastAssistantMessage': ''}, {'lastAssistantMessageIsToolOutput': True},
                                    {'turnEndDisposition': 'ambiguous'}, {'interrupted': True},
                                    {'sessionBoundary': True}, {'turnStartedAt': None}, {'turnEndedAt': None})):
            with self.subTest(gap=gap):
                start = 200 + index * 100
                self.publish(state='working', turnStartedAt=start, turnEndedAt=None, interrupted=False, sessionBoundary=False)
                status = {'state': 'done', 'turnStartedAt': start, 'turnEndedAt': start + 50,
                          'turnEndDisposition': 'identified', 'lastAssistantMessage': 'Candidate',
                          'lastAssistantMessageIsToolOutput': False, 'interrupted': False, 'sessionBoundary': False, **gap}
                latest = self.publish(**status)
                self.assertEqual(latest['current_delivery']['id'], first['current_delivery']['id'])
                self.assertFalse(latest['capabilities']['can_review'])
                with self.assertRaisesRegex(ProfileError, 'delivery_unknown|delivery_changed'):
                    self.progress.review_delivery(self.item['id'], self.approval(latest, token=f'gap-{index}'))
