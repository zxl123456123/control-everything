"""Synthetic peers and temporary private directories; no remote or personal state."""
import base64
from copy import deepcopy
import json
import shutil
import subprocess
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

from control_everything.integrations.remote_connector import (
    ConnectorConfig, RemotePeer, ConnectorError, ConnectorStore, DPAPI, RemoteConnector, DeviceKeys,
)

from control_everything.integrations.oidc_discovery import OidcDiscovery
TOKEN = "A" * 43
CONFIG = {"device_id": "device-1", "generation": 1, "credential_revision": 1,
          "public_origin": "https://workbench.example.test", "proxy_token": TOKEN,
          "ssh": {"host": "relay.example.test", "port": 2223, "user": "ce_device1",
                  "host_key": "ssh-ed25519 " + "A" * 68}, "remote_http_port": 19001, "remote_ws_port": 19002}
IDENTITY = {"installation_id": "installation-1", "public_key": "ssh-ed25519 " + "A" * 68,
            "key_fingerprint": "SHA256:fixture"}


class Protector:
    def protect(self, raw): return b"PROTECTED:" + raw
    def unprotect(self, raw):
        if not raw.startswith(b"PROTECTED:"): raise ValueError()
        return raw[10:]


class ClockStop:
    def __init__(self, clock): self.clock, self.stopped, self.waits = clock, False, []
    def wait(self, delay):
        self.waits.append(delay)
        self.clock[0] += delay
        return self.stopped
    def set(self): self.stopped = True
    def clear(self): self.stopped = False
    def is_set(self): return self.stopped


class Peer:
    def __init__(self):
        self.calls, self.tokens = [], []
        self.config = deepcopy(CONFIG)
        self.match = None
        self.complete_error = None
        self.config_error = None
        self.complete_revision = 1
        self.identity = {"account": {"sub": "subject-A", "issuer": "https://identity.example.test/realms/team", "name": "Member A"}, "member_active": True}
        self.identity_error = None
        self.revoke_error = None
        self.verification_uri = "https://identity.example.test/realms/team/device"

    def request(self, method, path, body=None, token=None, *, oauth=False):
        self.calls.append((method, path, body, token))
        if path == "/auth/device": return {"device_code": "secret-code", "user_code": "USER-CODE", "verification_uri": self.verification_uri, "expires_in": 30, "interval": 1}
        if path == "/token":
            if self.tokens:
                value = self.tokens.pop(0)
                if isinstance(value, Exception): raise value
            return {"access_token": "fixture-oauth", "refresh_token": "discard-this"}
        if path.endswith('/identity'):
            if self.identity_error: raise self.identity_error
            return deepcopy(self.identity)
        if path.endswith('/status'):
            if self.match is None: raise ConnectorError("not_found", 404)
            return deepcopy(self.match)
        if path.endswith('/complete'):
            if self.complete_error: raise self.complete_error
            self.config['credential_revision'] = self.complete_revision
            return {"device_id": "device-1", "generation": 1, "credential_revision": self.complete_revision, "control_token": TOKEN, "config": self.config}
        if path.endswith('/enrollment') or path.endswith('/recover'):
            return {"challenge_id": "challenge-1", "payload": base64.b64encode(b'canonical stored server bytes').decode(), "expires_at": 9999}
        if path.endswith('/config'):
            if self.config_error: raise self.config_error
            return deepcopy(self.config)
        if path.endswith('/heartbeat'): return {"state": "online"}
        if path.endswith('/revoke'):
            if self.revoke_error: raise self.revoke_error
            return {"state": "revoked"}
        raise AssertionError(path)


class ConnectorConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.tool = Path(self.temp.name).resolve() / 'synthetic-tool.exe'
        self.tool.write_bytes(b'not executable; configuration validation only')

    def config(self, issuer, **overrides):
        values = dict(issuer=issuer, hub_origin='https://workbench.example.test',
                      ssh_executable=self.tool, keygen_executable=self.tool)
        values.update(overrides)
        return ConnectorConfig(**values)

    def test_any_https_issuer_path_is_preserved(self):
        for path in ('', '/realms/team', '/identity/realms/control-everything', '/auth/realms/team', '/application/o/workbench',
                     '/oauth2/default', '/tenant.v2/oidc~x'):
            issuer = 'https://identity.example.test' + path
            with self.subTest(path=path):
                self.assertEqual(self.config(issuer).issuer, issuer)

    def test_issuer_rejects_trailing_slash_encoding_traversal_and_url_components(self):
        paths = ('/identity//realms/team', '/identity/realms/', '/identity/realms/team/',
                 '/identity/../realms/team', '/identity/realms/.', '/identity/realms/..', '/realms/.', '/realms/..',
                 '/%69dentity/realms/team', '/identity/realms/%2e%2e',
                 '/identity/realms/team%2Fextra', '/identity/realms/team?x=1',
                 '/identity/realms/team#fragment', '/', '/realms/te am', '/realms/te\\am')
        for path in paths:
            with self.subTest(path=path), self.assertRaises(ValueError):
                self.config('https://identity.example.test' + path)
        for issuer in ('http://identity.example.test/identity/realms/team',
                       'https://user@identity.example.test/identity/realms/team',
                       'https://identity.example.test:443/identity/realms/team',
                       'https://identity.example.test:0/identity/realms/team',
                       'https://identity.example.test%2fother/identity/realms/team'):
            with self.subTest(issuer=issuer), self.assertRaises(ValueError):
                self.config(issuer)

    def test_prefixed_issuer_retains_client_hub_and_tool_checks(self):
        issuer = 'https://identity.example.test/identity/realms/team'
        for overrides, code in (({'client_id': 'other-client'}, 'remote_client_invalid'),
                                ({'hub_origin': 'http://workbench.example.test'}, 'remote_origin_invalid'),
                                ({'ssh_executable': self.tool.parent / 'missing.exe'}, 'remote_tool_missing'),
                                ({'keygen_executable': self.tool.parent / 'missing.exe'}, 'remote_tool_missing')):
            with self.subTest(fields=tuple(overrides)), self.assertRaisesRegex(ValueError, code):
                self.config(issuer, **overrides)


class DiscoveredEndpointTests(unittest.TestCase):
    """The device flow talks to the endpoints the issuer advertises, never to hardcoded provider paths."""

    def peer(self, document):
        issuer = 'https://identity.example.test/application/o/workbench'
        peer = RemotePeer(SimpleNamespace(issuer=issuer, hub_origin='https://workbench.example.test'))
        peer.discovery = OidcDiscovery(issuer, fetch=lambda url: dict(document, issuer=issuer))
        seen = []

        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, limit): return b'{"ok": true}'

        class Opener:
            def open(self, request, timeout):
                seen.append((request.full_url, request.data))
                return Response()
        peer.opener = Opener()
        return peer, seen

    def test_device_and_token_requests_use_advertised_endpoints(self):
        peer, seen = self.peer({'device_authorization_endpoint': 'https://identity.example.test/application/o/device/',
                                'token_endpoint': 'https://identity.example.test/application/o/token/'})
        peer.request('POST', '/auth/device', {'client_id': 'workbench-desktop'}, oauth=True)
        peer.request('POST', '/token', {'client_id': 'workbench-desktop'}, oauth=True)
        self.assertEqual([url for url, _ in seen], ['https://identity.example.test/application/o/device/',
                                                    'https://identity.example.test/application/o/token/'])

    def test_missing_foreign_or_unsafe_endpoints_fail_as_an_unreachable_identity_service(self):
        for document in ({}, {'token_endpoint': 'https://other.example.test/token'}, {'token_endpoint': 'http://identity.example.test/token'}):
            peer, seen = self.peer(document)
            with self.subTest(document=document), self.assertRaises(ConnectorError) as caught:
                peer.request('POST', '/token', {'client_id': 'workbench-desktop'}, oauth=True)
            self.assertEqual(caught.exception.code, 'remote_network_unavailable')
            self.assertEqual(seen, [])

    def test_only_the_two_device_flow_paths_are_reachable(self):
        peer, seen = self.peer({})
        with self.assertRaises(ConnectorError):
            peer.request('POST', '/revoke', {}, oauth=True)
        self.assertEqual(seen, [])


class ConnectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name).resolve()
        api = SimpleNamespace(owner=Mock(return_value=1), close=Mock())
        self.store = ConnectorStore(root, protector=Protector(), secure_directory=lambda p: None, api=api)
        self.store.write("installation.json", {"installation_id": "installation-1"})
        self.peer, self.clock = Peer(), [0]
        keys = SimpleNamespace(ensure=lambda store: dict(IDENTITY), sign=Mock(return_value="SSHSIG fixture"))
        config = SimpleNamespace(issuer="https://identity.example.test/realms/team", hub_origin="https://workbench.example.test", client_id="workbench-desktop", ssh_executable=root/'ssh.exe', keygen_executable=root/'ssh-keygen.exe')
        self.tunnel = SimpleNamespace(running=True, start=Mock(), close=Mock())
        self.connector = RemoteConnector(config, self.store, peer=self.peer, keys=keys, now=lambda: self.clock[0], tunnel_factory=lambda c: self.tunnel)
        self.connector._stop = ClockStop(self.clock)

    def authorize(self): self.connector._authorize()

    def test_status_exposes_configured_portal_without_authorization_or_credentials(self):
        status = self.connector.status()
        self.assertEqual(status['portal_url'], 'https://workbench.example.test/remote')
        self.assertEqual(status['state'], 'unbound')
        self.assertEqual(self.peer.calls, [])
        self.assertNotIn('account', status)
        self.assertNotIn('token', json.dumps(status))

    def test_authorization_pending_and_slow_down_use_worker_interval(self):
        self.peer.tokens = [ConnectorError('authorization_pending'), ConnectorError('slow_down')]
        self.authorize()
        self.assertEqual(self.connector._stop.waits, [1,1,6])
        self.assertEqual(self.connector.status()['state'], 'awaiting_local_confirmation')
        self.assertFalse(any(c[1].endswith('/enrollment') for c in self.peer.calls))
        self.assertNotIn('fixture-oauth', json.dumps(self.connector.status()))

    def test_access_denied_and_expired_stop_without_enrollment(self):
        for code in ['access_denied','expired_token']:
            self.peer.tokens = [ConnectorError(code)]
            self.authorize()
            self.assertEqual(self.connector.status()['code'], code)
            self.assertIsNone(self.connector._oauth)

    def test_deadline_stops_pending_poll(self):
        self.peer.tokens = [ConnectorError('authorization_pending') for _ in range(40)]
        self.authorize()
        self.assertEqual(self.connector.status()['code'], 'expired_token')
        self.assertEqual(sum(c[1]=='/token' for c in self.peer.calls),29)

    def test_untrusted_verification_origin_rejected(self):
        self.peer.verification_uri='https://attacker.example.test/device'
        self.authorize()
        self.assertEqual(self.connector.status()['code'],'remote_verification_uri_invalid')

    def test_confirm_required_before_key_registration(self):
        with self.assertRaisesRegex(ConnectorError, 'confirmation_required'): self.connector.confirm()
        self.assertFalse(self.peer.calls)

    def test_success_protects_before_config_then_clears_pending(self):
        self.authorize()
        self.connector.confirm()
        self.assertEqual(self.connector.status()['state'],'connecting')
        self.assertTrue((self.store.root/'credentials.bin').read_bytes().startswith(b'PROTECTED:'))
        self.assertIsNone(self.store.read('pending.json'))
        self.assertIsNone(self.connector._oauth)
        self.assertEqual(self.connector.keys.sign.call_args.args[1],b'canonical stored server bytes')

    def test_complete_response_loss_requires_fresh_authorization_recovery(self):
        self.authorize()
        self.peer.complete_error=ConnectorError('remote_network_unavailable')
        with self.assertRaises(ConnectorError): self.connector.confirm()
        self.assertEqual(self.store.read('pending.json')['operation'],'bind')
        self.assertIsNone(self.store.read('credentials.bin',protected=True))
        self.peer.match={'device_id':'device-1','generation':1,'credential_revision':1,'recoverable':True}
        self.peer.complete_error=None
        self.peer.complete_revision=2
        self.authorize()
        self.assertEqual(self.connector.status()['operation'],'recover')
        self.connector.confirm()
        self.assertEqual(self.store.read('credentials.bin',protected=True)['credential_revision'],2)
        self.assertEqual(sum(c[1].endswith('/enrollment') for c in self.peer.calls),1)

    def test_config_response_loss_keeps_protected_token_and_pending(self):
        self.authorize(); self.peer.config_error=ConnectorError('remote_network_unavailable')
        with self.assertRaises(ConnectorError): self.connector.confirm()
        self.assertEqual(self.store.read('credentials.bin',protected=True)['credential_revision'],1)
        self.assertIsNotNone(self.store.read('pending.json'))
        self.connector.connect(1,2)
        self.tunnel.start.assert_not_called()

    def test_recovery_second_response_loss_advances_from_status_again(self):
        self.peer.match={'device_id':'device-1','generation':1,'credential_revision':2,'recoverable':True}
        self.authorize(); self.peer.complete_error=ConnectorError('remote_network_unavailable')
        with self.assertRaises(ConnectorError): self.connector.confirm()
        self.peer.match['credential_revision']=3
        self.peer.complete_revision=4; self.peer.complete_error=None
        self.authorize(); self.connector.confirm()
        self.assertEqual(self.store.read('credentials.bin',protected=True)['credential_revision'],4)

    def test_conflict_preserves_pending_without_retry_or_success(self):
        self.authorize(); self.peer.complete_error=ConnectorError('credential_revision_conflict',409)
        with self.assertRaises(ConnectorError): self.connector.confirm()
        self.assertIsNotNone(self.store.read('pending.json'))
        self.assertIsNone(self.connector._oauth)
        self.assertEqual(sum(c[1].endswith('/complete') for c in self.peer.calls),1)

    def test_late_response_cannot_overwrite_new_revision_or_pending(self):
        pending={'challenge_id':'c1','operation':'recover','expected_credential_revision':1,'target_device_id':'device-1','generation':1}
        self.store.write('pending.json',pending)
        newer={'device_id':'device-1','generation':1,'credential_revision':3,'control_token':TOKEN}
        self.store.write('credentials.bin',newer,protected=True)
        with self.assertRaisesRegex(ConnectorError,'stale_response'): self.connector._accept_reply(pending,{**newer,'credential_revision':2})
        self.assertEqual(self.store.read('credentials.bin',protected=True),newer)
        self.store.write('pending.json',{'challenge_id':'new'})
        with self.assertRaisesRegex(ConnectorError,'stale_response'): self.connector._accept_reply(pending,newer)

    def test_wrong_revision_device_generation_do_not_persist(self):
        self.authorize()
        self.peer.complete_revision=2
        with self.assertRaisesRegex(ConnectorError,'revision_mismatch'): self.connector.confirm()
        self.assertIsNone(self.store.read('credentials.bin',protected=True))

    def test_revoked_status_cannot_recover(self):
        self.peer.match={'device_id':'device-1','generation':1,'credential_revision':1,'recoverable':False}
        self.authorize()
        self.assertEqual(self.connector.status()['code'],'device_not_recoverable')
        with self.assertRaises(ConnectorError): self.connector.confirm()

    def test_backoff_is_bounded_and_revocation_never_auto_rebinds(self):
        self.authorize(); self.connector.confirm()
        self.peer.config_error=ConnectorError('remote_network_unavailable')
        for _ in range(10):
            self.clock[0]=self.connector._next_retry
            self.connector.connect(8766,12345)
            self.assertLessEqual(self.connector._next_retry-self.clock[0],60)
        self.clock[0]=self.connector._next_retry
        self.peer.config_error=ConnectorError('control_token_invalid',401)
        self.connector.connect(8766,12345)
        self.assertEqual(self.connector.status()['state'],'revoked')
        count=len(self.peer.calls); self.connector.connect(8766,12345)
        self.assertEqual(count,len(self.peer.calls))

    def test_tunnel_heartbeat_and_close_only_own_job(self):
        self.authorize(); self.connector.confirm()
        self.assertEqual(self.connector.connect(8766,12345)['state'],'online')
        self.tunnel.start.assert_called_once_with(8766,12345)
        self.connector.close(); self.tunnel.close.assert_called_once()

    def test_invalid_ssh_config_cannot_inject_options(self):
        for field,value in [('host','host\nProxyCommand evil'),('user','root -o x')]:
            config=deepcopy(CONFIG); config['ssh'][field]=value
            with self.assertRaises(ConnectorError): self.connector._tunnel_config(config)

    def test_store_os_mutex_rejects_second_process(self):
        self.store.api.owner.return_value=None
        with self.assertRaisesRegex(ConnectorError,'installation_in_use'):
            with self.store.locked(): pass

    def test_corrupt_protected_file_fails_closed(self):
        (self.store.root/'credentials.bin').write_bytes(b'plaintext')
        with self.assertRaises(ConnectorError): self.store.read('credentials.bin',protected=True)

    def test_two_directories_have_separate_pending_and_tokens(self):
        with tempfile.TemporaryDirectory() as other:
            second=ConnectorStore(Path(other).resolve(),protector=Protector(),secure_directory=lambda p:None,api=self.store.api)
            self.authorize(); self.connector.confirm()
            self.assertIsNone(second.read('credentials.bin',protected=True))
            self.assertIsNone(second.read('pending.json'))

    def test_dpapi_current_user_roundtrip_and_tampering(self):
        protector=DPAPI(); blob=protector.protect(b'synthetic nonpersonal fixture')
        self.assertNotIn(b'synthetic nonpersonal fixture',blob)
        self.assertEqual(protector.unprotect(blob),b'synthetic nonpersonal fixture')
        with self.assertRaises(ConnectorError): protector.unprotect(blob[:-8])

    def test_standard_ed25519_sshsig_and_private_acl(self):
        keygen=shutil.which('ssh-keygen')
        self.assertIsNotNone(keygen, 'OpenSSH ssh-keygen is required for this signature test')
        executable=Path(keygen)
        with tempfile.TemporaryDirectory() as temporary:
            store=ConnectorStore(Path(temporary).resolve())
            keys=DeviceKeys(executable)
            with store.locked():
                identity=keys.ensure(store)
                signature=keys.sign(store,b'synthetic canonical enrollment bytes')
                self.assertEqual(identity,keys.ensure(store))
            allowed=store.root/'allowed_signers'
            allowed.write_text('device '+identity['public_key']+'\n')
            signed=store.root/'signature'
            signed.write_text(signature)
            result=subprocess.run([str(executable),'-Y','verify','-f',str(allowed),'-I','device',
                '-n','control-everything-device-enrollment-v1','-s',str(signed)],
                input=b'synthetic canonical enrollment bytes',capture_output=True,
                creationflags=subprocess.CREATE_NO_WINDOW)
            self.assertEqual(result.returncode,0)
            self.assertTrue(identity['key_fingerprint'].startswith('SHA256:'))

    def test_credential_protection_failure_keeps_pending_before_token_commit(self):
        self.authorize()
        self.store.protector.protect=Mock(side_effect=ConnectorError('remote_credential_protection_failed'))
        with self.assertRaises(ConnectorError): self.connector.confirm()
        self.assertIsNotNone(self.store.read('pending.json'))
        self.assertIsNone(self.store.read('credentials.bin',protected=True))

    def test_real_os_mutex_covers_independent_store_instances(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary).resolve()
            first=ConnectorStore(root)
            second=ConnectorStore(root)
            with first.locked():
                with self.assertRaisesRegex(ConnectorError,'installation_in_use'):
                    with second.locked(): pass

    def test_remote_grant_cleanup_failure_does_not_claim_complete_revoke(self):
        self.authorize();self.connector.confirm()
        self.connector._on_revoked=Mock(side_effect=OSError('synthetic failure'))
        with self.assertRaisesRegex(ConnectorError,'cleanup_unverified'):self.connector.revoke()
        self.assertEqual(self.connector.status()['state'],'revoked')
        self.assertEqual(self.connector.status()['code'],'remote_grant_cleanup_unverified')
        self.assertIsNone(self.store.read('credentials.bin',protected=True))

    def test_inactive_member_identity_is_displayed_without_confirmation(self):
        self.peer.identity['member_active']=False
        self.authorize()
        state=self.connector.status()
        self.assertEqual(state['account']['sub'],'subject-A')
        self.assertFalse(state['member_active'])
        self.assertEqual(state['code'],'remote_membership_required')
        with self.assertRaises(ConnectorError): self.connector.confirm()
        self.assertFalse(any(c[1].endswith('/enrollment') for c in self.peer.calls))

    def test_identity_errors_never_fall_back_to_unverified_token_or_previous_name(self):
        for status in [401,403]:
            self.peer.identity_error=ConnectorError('identity_rejected',status)
            self.authorize()
            self.assertNotIn('account',self.connector.status())
            self.assertIsNone(self.connector._oauth)

    def test_missing_name_uses_subject_without_changing_owner(self):
        self.peer.identity['account'].pop('name')
        self.authorize()
        self.assertEqual(self.connector.status()['account']['name'],'subject-A')
        self.assertEqual(self.connector.status()['account']['sub'],'subject-A')

    def test_failed_grant_retirement_survives_restart_until_explicit_resume(self):
        self.authorize();self.connector.confirm()
        self.connector._on_revoked=Mock(side_effect=OSError('synthetic failure'))
        with self.assertRaises(ConnectorError):self.connector.revoke()
        self.assertTrue(self.store.read('revocation.json')['remote_grant_cleanup_pending'])
        restored=RemoteConnector(self.connector.config,self.store,peer=self.peer,on_revoked=Mock())
        restored.connect(8766,12345)
        self.assertEqual(restored.status()['state'],'revoked')
        restored.resume_revocation_cleanup()
        self.assertIsNone(self.store.read('revocation.json'))
        restored._on_revoked.assert_called_once()

    def test_lost_revoke_response_does_not_claim_server_success_or_reconnect(self):
        self.authorize();self.connector.confirm()
        self.peer.revoke_error=ConnectorError('remote_network_unavailable')
        self.connector._on_revoked=Mock()
        with self.assertRaisesRegex(ConnectorError,'revoke_unconfirmed'):self.connector.revoke()
        self.assertEqual(self.connector.status()['code'],'remote_revoke_unconfirmed')
        self.assertIsNotNone(self.store.read('credentials.bin',protected=True))
        before=len(self.peer.calls)
        self.connector.connect(8766,12345)
        self.assertEqual(len(self.peer.calls),before)
        self.assertIsNone(self.connector.prepare_access())

    def test_periodic_connect_preserves_pending_recovery_confirmation(self):
        self.authorize(); self.peer.complete_error=ConnectorError('remote_network_unavailable')
        with self.assertRaises(ConnectorError): self.connector.confirm()
        self.peer.match={'device_id':'device-1','generation':1,'credential_revision':1,'recoverable':True}
        self.peer.complete_error=None;self.peer.complete_revision=2
        self.authorize()
        for _ in range(5):
            self.clock[0]+=120
            self.connector.connect(8766,12345)
            self.assertEqual(self.connector.status()['state'],'awaiting_local_confirmation')
        self.connector.confirm()
        self.assertEqual(self.store.read('credentials.bin',protected=True)['credential_revision'],2)

    def test_periodic_connect_preserves_existing_credential_authorization_stages(self):
        self.authorize();self.connector.confirm()
        self.peer.match={'device_id':'device-1','generation':1,'credential_revision':1,'recoverable':True}
        for state in ['authorizing','enrolling']:
            self.connector._state=state
            before=len(self.peer.calls)
            for _ in range(3):self.connector.connect(8766,12345)
            self.assertEqual(self.connector.status()['state'],state)
            self.assertEqual(len(self.peer.calls),before)
        self.authorize();self.peer.complete_revision=2
        for _ in range(3):self.connector.connect(8766,12345)
        self.assertEqual(self.connector.status()['state'],'awaiting_local_confirmation')
        self.connector.confirm()
        self.assertEqual(self.store.read('credentials.bin',protected=True)['credential_revision'],2)

    def test_revoke_crash_boundaries_keep_local_cleanup_recoverable(self):
        boundaries=['cleanup_write_before','cleanup_write_after','request_return','requested_clear_before',
                    'requested_clear_after','credentials_clear_before','credentials_clear_after','callback_before',
                    'callback_after','cleanup_clear_before','cleanup_clear_after']
        for boundary in boundaries:
            with self.subTest(boundary=boundary), tempfile.TemporaryDirectory() as temporary:
                store=ConnectorStore(Path(temporary).resolve(),protector=Protector(),secure_directory=lambda p:None,api=self.store.api)
                store.write('installation.json',{'installation_id':'installation-1'})
                credential={'device_id':'device-1','generation':1,'credential_revision':1,'control_token':TOKEN}
                store.write('credentials.bin',credential,protected=True)
                peer=Peer();callback=Mock()
                connector=RemoteConnector(self.connector.config,store,peer=peer,on_revoked=callback)
                write,clear,request=store.write,store.clear,peer.request
                triggered=[False]
                def crash(at):
                    if at==boundary and not triggered[0]:
                        triggered[0]=True
                        raise SystemExit('synthetic process exit')
                def write_fault(name,value,**kwargs):
                    if name=='revocation.json':crash('cleanup_write_before')
                    write(name,value,**kwargs)
                    if name=='revocation.json':crash('cleanup_write_after')
                def clear_fault(name):
                    label={'revocation_requested.json':'requested_clear','credentials.bin':'credentials_clear',
                           'revocation.json':'cleanup_clear'}.get(name)
                    if label:crash(label+'_before')
                    clear(name)
                    if label:crash(label+'_after')
                def request_fault(*args,**kwargs):
                    result=request(*args,**kwargs)
                    if args[1].endswith('/revoke'):crash('request_return')
                    return result
                def callback_fault():
                    crash('callback_before');callback();crash('callback_after')
                store.write,store.clear,peer.request=write_fault,clear_fault,request_fault
                connector._on_revoked=callback_fault
                with self.assertRaises(SystemExit):connector.revoke()
                self.assertTrue(triggered[0])
                store.write,store.clear,peer.request=write,clear,request
                unresolved=store.read('revocation_requested.json') is not None
                had_cleanup=store.read('revocation.json') is not None
                before=len(peer.calls);resumed=Mock()
                restored=RemoteConnector(connector.config,store,peer=peer,on_revoked=resumed)
                restored.resume_revocation_cleanup()
                self.assertEqual(len(peer.calls),before,'resume must not replay central revoke')
                self.assertTrue(callback.called or resumed.called,'local grant retirement must never be lost')
                if unresolved:
                    self.assertTrue(resumed.called)
                    self.assertEqual(restored.status()['code'],'remote_revoke_unconfirmed')
                    self.assertEqual(restored.status()['state'],'offline')
                elif had_cleanup:
                    self.assertTrue(resumed.called)
                    self.assertEqual(restored.status()['state'],'revoked')

if __name__=='__main__': unittest.main()
