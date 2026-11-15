"""Internal simulated identity lifecycle; no production SDK authentication is implied."""
import hashlib
import json
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory

from control_everything.workspace.automation_identities import IdentityService
from control_everything.workspace.automation_remote_inbox import RemoteAutomationInbox
from control_everything.workspace.store import WorkspaceStore


class IdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = WorkspaceStore(Path(self.temp.name)/'workspace.db', profile=True)
        with self.store.connection() as db:
            db.execute("INSERT INTO projects VALUES('p','Project',0,'now','now',0)")
        self.binding = {'hub_origin':'https://hub.example.test','device_id':'device','generation':1}
        self.context = {**self.binding,'producer_id':'producer','channel_account_id':'account','app_id':'app','chat_id':'chat','project_id':'p'}
        self.service = IdentityService(self.store, lambda: dict(self.binding))

    def challenge(self):
        result = self.service.create_challenge('p',self.context)
        self.service.attach_message('p',result['challenge_id'],'card')
        return result

    def candidate(self, challenge, who='user', event='event'):
        e = {k:self.context[k] for k in ('producer_id','channel_account_id','app_id','chat_id')}
        e.update(message_id='card',nonce=challenge['nonce'],actor_open_id=who,event_id=event,inbox_message_id='inbox-'+event)
        payload = {'kind':'feishu_identity_binding','project_id':'p',
                   **{k:e[k] for k in ('producer_id','channel_account_id','app_id','chat_id','message_id','actor_open_id')},
                   'binding':{'namespace':'control-everything.identity.v1','challenge_id':challenge['challenge_id'],'nonce':e['nonce']}}
        RemoteAutomationInbox(self.store).receive({**self.binding,'credential_revision':1},
            {'id':e['inbox_message_id'],'source':'feishu:'+hashlib.sha256(json.dumps(['account','app'],separators=(',', ':')).encode()).hexdigest(),'event_id':event,'payload':payload,'lease_id':'lease','lease_expires_at':100})
        return e, self.service.receive_candidate('p',challenge['challenge_id'],e)

    def test_lifecycle_multiple_candidates_and_reopen(self):
        challenge = self.challenge()
        e, first = self.candidate(challenge)
        _, second = self.candidate(challenge,'other','event2')
        self.assertEqual(first,self.service.receive_candidate('p',challenge['challenge_id'],e))
        view = self.service.list('p')[0]
        self.assertEqual(len(view['candidates']),2)
        self.assertEqual(view['bindings'],[])
        self.assertNotIn('nonce_hash',view)
        with self.store.connection() as db:
            row = db.execute('SELECT nonce_hash FROM automation_identity_challenges').fetchone()
            self.assertEqual(row[0],hashlib.sha256(challenge['nonce'].encode()).hexdigest())
        fact = self.service.confirm('p',second['id'])
        reopened = IdentityService(WorkspaceStore(self.store.path, profile=True),lambda:dict(self.binding))
        self.assertEqual(reopened.list('p')[0]['bindings'][0]['id'],fact['id'])
        self.assertEqual(reopened.revoke('p',fact['id'])['state'],'revoked')
        with self.assertRaises(ValueError):
            reopened.receive_candidate('p',challenge['challenge_id'],e)
        with self.store.connection() as db:
            for table in ('task_items','task_reviews','automation_flows'):
                self.assertEqual(db.execute('SELECT count(*) FROM '+table).fetchone()[0],0)

    def test_mismatches_and_no_message(self):
        challenge = self.service.create_challenge('p',self.context)
        with self.assertRaises(ValueError):
            self.candidate(challenge)
        self.service.attach_message('p',challenge['challenge_id'],'card')
        e, candidate = self.candidate(challenge)
        for key in ('app_id','chat_id','message_id','nonce','channel_account_id','producer_id','inbox_message_id','event_id','actor_open_id'):
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.service.receive_candidate('p',challenge['challenge_id'],{**e,key:'wrong'})
        with self.store.connection() as db:
            db.execute("UPDATE automation_identity_challenges SET expires_at='2000'")
        with self.assertRaises(ValueError):
            self.service.confirm('p',candidate['id'])

    def test_generation_and_archived_project(self):
        c = self.challenge()
        _, candidate = self.candidate(c)
        fact = self.service.confirm('p',candidate['id'])
        self.binding['generation'] = 2
        self.assertEqual(self.service.list('p'),[])
        with self.assertRaises(ValueError):
            self.service.revoke('p',fact['id'])
        with self.store.connection() as db:
            db.execute("UPDATE projects SET archived=1 WHERE id='p'")
        with self.assertRaises(ValueError):
            self.service.list('p')

    def test_concurrent_confirmation_has_one_winner(self):
        c = self.challenge()
        _, candidate = self.candidate(c)
        def confirm(_):
            try:
                return self.service.confirm('p',candidate['id'])['state']
            except ValueError:
                return 'rejected'
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertCountEqual(list(pool.map(confirm,range(2))),['active','rejected'])

    def test_binding_change_rolls_back(self):
        count = 0
        def changed():
            nonlocal count
            count += 1
            return {**self.binding,'generation':count}
        with self.assertRaises(ValueError):
            IdentityService(self.store,changed).create_challenge('p',self.context)
        with self.store.connection() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM automation_identity_challenges').fetchone()[0],0)




    def test_cross_project_context_rejected(self):
        with self.assertRaises(ValueError):
            self.service.create_challenge('p',{**self.context,'project_id':'other'})

    def test_backup_and_concurrent_revoke(self):
        import sqlite3
        c = self.challenge()
        _, candidate = self.candidate(c)
        fact = self.service.confirm('p',candidate['id'])
        backup = Path(self.temp.name)/'backup.db'
        with self.store.connection() as source:
            with closing(sqlite3.connect(backup)) as destination:
                source.backup(destination)
        restored = IdentityService(WorkspaceStore(backup,profile=True),lambda:dict(self.binding))
        self.assertEqual(restored.list('p')[0]['bindings'][0],fact)
        with ThreadPoolExecutor(max_workers=2) as pool:
            states = list(pool.map(lambda _:self.service.revoke('p',fact['id'])['state'], range(2)))
        self.assertEqual(states,['revoked','revoked'])
        self.assertEqual(restored.list('p')[0]['bindings'][0]['state'],'active')


    def test_event_id_is_scoped_to_source_and_inbox_tampering_rejected(self):
        first = self.challenge()
        self.candidate(first)
        self.context['app_id'] = 'another-app'
        second = self.challenge()
        e = {k:self.context[k] for k in ('producer_id','channel_account_id','app_id','chat_id')}
        e.update(message_id='card',nonce=second['nonce'],actor_open_id='user',event_id='event',inbox_message_id='second-inbox')
        payload = {'kind':'feishu_identity_binding','project_id':'p',
                   **{k:e[k] for k in ('producer_id','channel_account_id','app_id','chat_id','message_id','actor_open_id')},
                   'binding':{'namespace':'control-everything.identity.v1','challenge_id':second['challenge_id'],'nonce':e['nonce']}}
        source = 'feishu:'+hashlib.sha256(json.dumps(['account','another-app'],separators=(',', ':')).encode()).hexdigest()
        RemoteAutomationInbox(self.store).receive({**self.binding,'credential_revision':1},
            {'id':'second-inbox','source':source,'event_id':'event','payload':payload,'lease_id':'lease','lease_expires_at':100})
        candidate = self.service.receive_candidate('p',second['challenge_id'],e)
        self.assertEqual(candidate['app_id'],'another-app')
        with self.store.connection() as db:
            db.execute("UPDATE automation_remote_inbox SET payload_json='{}' WHERE message_id='second-inbox'")
        with self.assertRaisesRegex(ValueError,'provenance'):
            self.service.receive_candidate('p',second['challenge_id'],e)
        with self.store.connection() as db:
            db.execute("UPDATE automation_remote_inbox SET payload_json=?,source='wrong' WHERE message_id='second-inbox'",(json.dumps(payload),))
        with self.assertRaisesRegex(ValueError,'provenance'):
            self.service.receive_candidate('p',second['challenge_id'],e)
