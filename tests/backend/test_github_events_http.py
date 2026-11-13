"""Exercise a real local webhook HTTP boundary without GitHub or Feishu calls."""
from contextlib import closing
import http.client
import json
import threading
import unittest
from unittest.mock import patch

from control_everything.http import github_events


class GitHubEventHttpTests(unittest.TestCase):
    def setUp(self):
        self.woken = threading.Event()
        self.server = github_events.make_server({}, b'x' * 64, self.woken, address=('127.0.0.1', 0))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.close)

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)

    def request(self, method='POST', path=github_events.HOOK_PATH, body=b'{}', **headers):
        with closing(http.client.HTTPConnection(*self.server.server_address, timeout=3)) as connection:
            connection.request(method, path, body, {'Content-Type': 'application/json',
                'X-GitHub-Delivery': '11111111-1111-4111-8111-111111111111',
                'X-GitHub-Event': 'issues', 'X-Hub-Signature-256': 'fixture', **headers})
            result = connection.getresponse()
            return result.status, json.loads(result.read())

    def test_worker_wires_push_and_pr_reviewers_to_durable_queue(self):
        push, pr = object(), object()
        with patch.object(github_events, 'make_reviewer', side_effect=[push, pr]) as factory, \
                patch.object(github_events, 'drain', side_effect=SystemExit) as drain, \
                patch.object(github_events, 'FeishuSender'):
            with self.assertRaises(SystemExit):
                github_events.deliver_events({'ai_review': {'enabled': True}}, {'target': 'fixture'},
                    {'appId': 'fixture', 'appSecret': 'fixture'}, threading.Event())
        self.assertEqual(factory.call_count, 2)
        self.assertEqual(factory.call_args.kwargs, {'pull_request': True})
        self.assertIs(drain.call_args.kwargs['review'], push)
        self.assertIs(drain.call_args.kwargs['review_pr'], pr)

    def test_persisted_event_is_accepted_and_worker_is_woken(self):
        with patch.object(github_events, 'accept_event', return_value={'status': 'accepted'}) as accept:
            self.assertEqual(self.request()[0], 202)
        self.assertTrue(self.woken.is_set())
        self.assertEqual(accept.call_args.args[4], b'{}')

    def test_bad_signature_is_forbidden_and_does_not_wake_worker(self):
        with patch.object(github_events, 'accept_event', side_effect=PermissionError('private')):
            code, body = self.request()
        self.assertEqual(code, 403)
        self.assertNotIn('private', json.dumps(body))
        self.assertFalse(self.woken.is_set())

    def test_bad_repository_or_payload_is_rejected(self):
        with patch.object(github_events, 'accept_event', side_effect=ValueError('private')):
            self.assertEqual(self.request()[0], 400)
        self.assertFalse(self.woken.is_set())

    def test_database_failure_is_not_acknowledged(self):
        with patch.object(github_events, 'accept_event', side_effect=OSError('private')):
            self.assertEqual(self.request()[0], 503)
        self.assertFalse(self.woken.is_set())

    def test_unknown_path_and_method_are_rejected_before_queue(self):
        with patch.object(github_events, 'accept_event') as accept:
            self.assertEqual(self.request(path='/other')[0], 404)
            self.assertEqual(self.request(method='GET')[0], 405)
        accept.assert_not_called()

    def test_form_payload_and_oversize_body_are_rejected_before_queue(self):
        with patch.object(github_events, 'accept_event') as accept:
            self.assertEqual(self.request(**{'Content-Type': 'application/x-www-form-urlencoded'})[0], 415)
            with patch.object(github_events, 'MAX_BODY', 1):
                self.assertEqual(self.request()[0], 413)
        accept.assert_not_called()


if __name__ == '__main__':
    unittest.main()
