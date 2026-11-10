"""Socket-free progress route authorization and request composition."""

from email.message import Message
from types import SimpleNamespace
from unittest.mock import Mock
from urllib.parse import urlsplit
import unittest
from uuid import uuid4

from control_everything.http import project_progress_routes as routes
from control_everything.http.gateway import PanelHandler
from tests.backend.test_profile_http import ProfileHTTPTests
from tests.backend.test_project_management import project_body
from tests.backend.test_native_progress import FakeHost
from unittest.mock import patch


class ProjectProgressAPITests(unittest.TestCase):
    def handler(self):
        service = Mock()
        headers = Message()
        headers['Host'] = '127.0.0.1:1234'
        headers['Origin'] = 'http://127.0.0.1:1234'
        headers['X-Session-CSRF'] = 'fixture-token'
        return SimpleNamespace(server=SimpleNamespace(workspace=SimpleNamespace(native_progress=service),
                                 local_origin='http://127.0.0.1:1234', csrf_token='fixture-token'),
                               headers=headers, client_address=('127.0.0.1', 100), profile=lambda: object(),
                               read_json_body=Mock(return_value={}), reply=Mock(), reject=Mock(), profile_error=Mock())

    def test_local_csrf_required_before_owner_composition(self):
        for invalid in ('Origin', 'Host', 'X-Session-CSRF', 'X-CE-Proxy-Token'):
            with self.subTest(invalid=invalid):
                h = self.handler()
                if invalid in h.headers:
                    del h.headers[invalid]
                h.headers[invalid] = 'invalid'
                self.assertTrue(routes.handle(h, urlsplit(f'/api/workspace/tasks/{uuid4()}/native-start'), write=True))
                h.reject.assert_called_once_with(403, 'local_control_required')
                h.read_json_body.assert_not_called()
                h.server.workspace.native_progress.start.assert_not_called()

    def test_read_remote_capability_is_unavailable_and_never_calls_mutations(self):
        h = self.handler()
        h.headers['X-CE-Proxy-Token'] = 'remote'
        task_id = str(uuid4())
        self.assertTrue(routes.handle(h, urlsplit(f'/api/workspace/tasks/{task_id}/progress')))
        h.server.workspace.native_progress.get.assert_called_once_with(task_id, execution_allowed=False)
        h.server.workspace.native_progress.start.assert_not_called()

    def test_fixed_routes_accept_no_arbitrary_owner_method(self):
        h = self.handler()
        task_id = str(uuid4())
        self.assertFalse(routes.handle(h, urlsplit(f'/api/workspace/tasks/{task_id}/terminal.send'), write=True))
        h.read_json_body.return_value = {'request': 'fixture'}
        self.assertTrue(routes.handle(h, urlsplit(f'/api/workspace/tasks/{task_id}/native-feedback'), write=True))
        h.server.workspace.native_progress.save_feedback.assert_called_once_with(task_id, {'request': 'fixture'})
        h.server.workspace.native_progress.send_feedback.assert_not_called()

    def test_queries_invalid_ids_and_read_write_method_confusion_rejected(self):
        for path, write, code in ((f'/api/workspace/tasks/{uuid4()}/progress', True, 405),
                                  (f'/api/workspace/tasks/{uuid4()}/native-start', False, 405),
                                  ('/api/workspace/tasks/not-uuid/progress', False, 400),
                                  (f'/api/workspace/tasks/{uuid4()}/progress?method=send', False, 400)):
            h = self.handler()
            routes.handle(h, urlsplit(path), write=write)
            self.assertEqual(h.reject.call_args.args[0], code)


class ProjectProgressQuickCreateTests(unittest.TestCase):
    request = ProfileHTTPTests.request

    def setUp(self):
        ProfileHTTPTests.setUp(self)
        self.server.local_origin = self.server.origin
        self.workspace.native_progress.adapter = FakeHost()

    def test_real_default_item_post_starts_without_second_brief_input(self):
        project = self.profile.store.save_project(project_body(self.root / 'repo'))
        status, created = self.request('/api/workspace/items', 'POST', {'title': '只输入一次的需求', 'project_id': project['id']})
        self.assertEqual(status, 200)
        item = created['item']
        status, before = self.request(f"/api/workspace/tasks/{item['id']}/brief")
        self.assertEqual(before['brief']['revision'], 0)
        with patch.object(PanelHandler, 'client_address', ('127.0.0.1', 12345), create=True):
            status, started = self.request(f"/api/workspace/tasks/{item['id']}/native-start", 'POST', {
                'expected_revision': item['revision'], 'brief_revision': 0, 'client_token': 'quick-start',
                'agent': 'codex', 'worktree_id': 'worktree'})
        self.assertEqual(status, 200, started)
        self.assertEqual(started['native_run']['brief_snapshot']['brief']['request_text'], item['title'])
        body = {'expected_revision': item['revision'], 'brief_revision': 0, 'client_token': 'quick-start',
                'agent': 'codex', 'worktree_id': 'worktree'}
        self.request('/api/workspace/items/update', 'POST', {'id': item['id'], 'expected_revision': started['item']['revision'],
                                                          'changes': {'title': 'Later title'}})
        with patch.object(PanelHandler, 'client_address', ('127.0.0.1', 12345), create=True):
            status, replayed = self.request(f"/api/workspace/tasks/{item['id']}/native-start", 'POST', body)
        self.assertEqual(status, 200)
        self.assertEqual(replayed['native_run']['brief_snapshot']['brief']['request_text'], item['title'])
        self.assertEqual(self.workspace.native_progress.adapter.create_calls, 1)

    def test_quick_create_fallback_never_replaces_an_existing_brief(self):
        project = self.profile.store.save_project(project_body(self.root / 'repo'))
        _, created = self.request('/api/workspace/items', 'POST', {'title': 'Short label', 'project_id': project['id']})
        item = created['item']
        status, saved = self.request(f"/api/workspace/tasks/{item['id']}/brief", 'POST', {
            'expected_revision': 0, 'request_text': 'Existing full requirement', 'acceptance_text': '',
            'constraints_text': '', 'references': [], 'execution_directory_id': None})
        self.assertEqual(status, 200)
        with patch.object(PanelHandler, 'client_address', ('127.0.0.1', 12345), create=True):
            status, started = self.request(f"/api/workspace/tasks/{item['id']}/native-start", 'POST', {
                'expected_revision': item['revision'], 'brief_revision': saved['brief']['revision'], 'client_token': 'with-brief',
                'agent': 'codex', 'worktree_id': 'worktree'})
        self.assertEqual(status, 200, started)
        self.assertEqual(started['native_run']['brief_snapshot']['brief']['request_text'], 'Existing full requirement')


if __name__ == '__main__':
    unittest.main()
