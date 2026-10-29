"""Socket-free local-control request contracts."""
from email.message import Message
from types import SimpleNamespace
import unittest
from unittest.mock import Mock
from control_everything.http.workbench_remote import handle_get, handle_post, handle_health
from control_everything.integrations.remote_access import RemoteAccess


class WorkbenchRemoteTests(unittest.TestCase):
    def handler(self, **headers):
        message=Message()
        message['Host']='127.0.0.1:8766'
        for k,v in headers.items(): message[k]=v
        connector=SimpleNamespace(status=Mock(return_value={'state':'unbound','code':'unbound'}),
            begin_authorization=Mock(),confirm=Mock(),revoke=Mock())
        return SimpleNamespace(server=SimpleNamespace(local_origin='http://127.0.0.1:8766',csrf_token='csrf',remote_connector=connector),
            headers=message,client_address=('127.0.0.1',12345),reply=Mock(),reject=Mock())

    def test_get_status_cannot_poll_or_start(self):
        h=self.handler(); self.assertTrue(handle_get(h,'/api/desktop/remote/status'))
        h.server.remote_connector.begin_authorization.assert_not_called()
        h.server.remote_connector.confirm.assert_not_called()
        h.reply.assert_called_once_with(200,{'state':'unbound','code':'unbound'})

    def test_remote_proof_public_host_and_null_origin_reject_owner_controls(self):
        cases=[{'X-CE-Device-Proof':'proof'},{'Origin':'null'},{'Host':'public.example.test'}, {'X-CE-Proxy-Token':'legacy'}]
        for headers in cases:
            h=self.handler(**headers)
            self.assertTrue(handle_get(h,'/api/desktop/remote/status'))
            h.reject.assert_called_once_with(403,'local_control_required')

    def test_confirmation_requires_exact_local_origin_csrf_and_no_proxy_proof(self):
        for headers in [{},{'Origin':'http://127.0.0.1:8766'}, {'Origin':'http://evil','X-Session-CSRF':'csrf'},
                        {'Origin':'http://127.0.0.1:8766','X-Session-CSRF':'wrong'}]:
            h=self.handler(**headers); handle_post(h,'/api/desktop/remote/confirm')
            h.server.remote_connector.confirm.assert_not_called(); h.reject.assert_called_once()
        h=self.handler(Origin='http://127.0.0.1:8766',**{'X-Session-CSRF':'csrf'})
        handle_post(h,'/api/desktop/remote/confirm'); h.server.remote_connector.confirm.assert_called_once()

    def test_unconfigured_mode_remains_local(self):
        h=self.handler();h.server.remote_connector=None
        handle_get(h,'/api/desktop/remote/status')
        self.assertFalse(h.reply.call_args.args[1]['configured'])

    def test_wrong_method_and_non_loopback_cannot_run_actions(self):
        h=self.handler();handle_get(h,'/api/desktop/remote/authorize');h.reject.assert_called_once_with(405,'method_not_allowed')
        h=self.handler();h.client_address=('192.0.2.1',1234);handle_get(h,'/api/desktop/remote/status');h.reject.assert_called_once_with(403,'local_control_required')
        self.assertFalse(handle_get(h,'/unrelated'))

    def test_unrelated_post_does_not_wait_for_configuration_lock(self):
        import threading
        from control_everything.http.workbench_remote import handle_account
        handler = self.handler()
        lock = threading.RLock()
        handler.server.desktop = SimpleNamespace(configuration_lock=lock)
        completed, values = threading.Event(), []
        def route():
            values.append(handle_post(handler, '/api/unrelated'))
            values.append(handle_account(handler, '/api/unrelated', write=True))
            completed.set()
        with lock:
            worker = threading.Thread(target=route)
            worker.start()
            completed_in_time = completed.wait(2)
        worker.join(5)
        self.assertFalse(worker.is_alive())
        self.assertTrue(completed_in_time, 'unrelated requests waited for configuration lock')
        self.assertEqual(values, [False, False])
    def health_handler(self):
        h=self.handler()
        h.headers=Message()
        h.headers['Host']='workbench.example.test'
        h.headers['Origin']='https://workbench.example.test'
        h.headers['X-CE-Device-Proof']='A'*43
        h.server.remote_connector.remote_access=RemoteAccess('https://workbench.example.test','A'*43)
        h.server.remote_connector.health_identity={'device_id':'device-1','generation':1,'platform_installation_id':'platform-installation-1'}
        h.server.workbench_runtime=SimpleNamespace(ready=True)
        return h

    def test_health_requires_real_runtime_and_exact_snapshot(self):
        h=self.health_handler(); path='/__ce_remote_health?nonce='+'A'*32
        self.assertTrue(handle_health(h,path))
        self.assertEqual(h.reply.call_args.args,(200,{'nonce':'A'*32,'device_id':'device-1','generation':1,
            'platform_installation_id':'platform-installation-1','channel':'http','ready':True}))
        h=self.health_handler(); h.server.workbench_runtime.ready=False
        handle_health(h,path);h.reject.assert_called_once_with(503,'remote_runtime_unavailable');h.reply.assert_not_called()

    def test_health_missing_duplicate_wrong_headers_nonce_and_method_reject(self):
        path='/__ce_remote_health?nonce='+'A'*32
        for name,value in [('X-CE-Device-Proof',None),('X-CE-Device-Proof','B'*43),('X-CE-Device-Proof','A'*43),
                           ('Host','wrong.test'),('Origin','null'),('Origin','https://workbench.example.test')]:
            h=self.health_handler()
            if value is None: del h.headers[name]
            else: h.headers[name]=value
            handle_health(h,path);self.assertEqual(h.reject.call_args.args[0],403);h.reply.assert_not_called()
        for suffix in ['','?nonce=short','?nonce='+'A'*32+'&nonce='+'A'*32,'?nonce='+'A'*32+'&extra=1']:
            h=self.health_handler();handle_health(h,'/__ce_remote_health'+suffix);h.reject.assert_called_once_with(400,'remote_probe_invalid')
        h=self.health_handler();handle_health(h,path,'POST');h.reject.assert_called_once_with(405,'method_not_allowed')
