"""Administrator-created ordinary accounts, including partial identity-provider success."""

import json
import sqlite3
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from control_everything.integrations.remote_hub.admin import build_service
from control_everything.integrations.remote_hub.identity import HubError, Identity
from .test_remote_hub_support import A, B, bind, service


class AccountCreationTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.hub = service(Path(directory.name) / 'hub.db', admin_subjects=[(A.issuer, A.sub)])
        self.provider = self.hub.user_provisioning = Mock(issuer=A.issuer)
        self.created = {'sub': 'new-ordinary-user', 'name': 'new.member', 'enabled': True}
        self.provider.create.return_value = dict(self.created)
        self.provider.get_user.return_value = dict(self.created)
        self.password = 'Synthetic-test-password!'
        self.identity = Identity(A.issuer, self.created['sub'], '', 0)

    def test_create_activates_only_new_ordinary_member_and_never_returns_password(self):
        bound = bind(self.hub)
        before_device = self.hub.store.own_device(A)
        result = self.hub.admin_create_member(A, 'new.member', self.password)
        self.assertEqual(result, {'account': self.created, 'created': True, 'membership': 'active'})
        self.assertEqual(self.hub.store.member_status(self.identity), 'active')
        self.assertFalse(self.hub.is_admin(self.identity))
        self.assertEqual(self.hub.store.own_device(A), before_device)
        self.assertEqual(self.hub.store.member_status(B), 'active')
        self.assertNotIn(self.password, json.dumps(result))
        self.assertNotIn(bound['control_token'], json.dumps(result))
        self.provider.create.assert_called_once_with('new.member', self.password)

    def test_non_admin_and_disabled_admin_cannot_call_identity_provider(self):
        for identity in (B, A):
            if identity is A:
                self.hub.store.set_member(A, 'disabled')
            with self.subTest(identity=identity.sub), self.assertRaises(HubError):
                self.hub.admin_create_member(identity, 'new.member', self.password)
        self.provider.create.assert_not_called()

    def test_missing_provider_and_invalid_input_fail_before_creation(self):
        for username, password in [('with spaces', self.password), ('member', 'short')]:
            with self.subTest(username=username), self.assertRaises(HubError):
                self.hub.admin_create_member(A, username, password)
        self.provider.create.assert_not_called()
        self.hub.user_provisioning = None
        with self.assertRaises(HubError) as caught:
            self.hub.admin_create_member(A, 'new.member', self.password)
        self.assertEqual(caught.exception.code, 'account_creation_unavailable')

    def test_existing_username_is_not_activated_or_reset(self):
        self.provider.create.side_effect = HubError('username_exists', 409)
        with patch.object(self.hub.store, 'activate_member') as activate:
            with self.assertRaises(HubError) as caught:
                self.hub.admin_create_member(A, 'new.member', self.password)
        self.assertEqual(caught.exception.code, 'username_exists')
        activate.assert_not_called()
        self.provider.get_user.assert_not_called()

    def test_created_identity_with_unconfirmed_activation_can_retry_without_password(self):
        with patch.object(self.hub.store, 'activate_member', side_effect=OSError('synthetic database failure')):
            result = self.hub.admin_create_member(A, 'new.member', self.password)
        self.assertTrue(result['created'])
        self.assertEqual(result['membership'], 'activation_unconfirmed')
        self.assertNotIn(self.password, json.dumps(result))
        for _ in range(2):
            recovered = self.hub.admin_activate_member(A, self.created['sub'])
            self.assertEqual(recovered['membership'], 'active')
        self.assertEqual(self.hub.store.member_status(self.identity), 'active')
        self.provider.create.assert_called_once()

    def test_identity_created_before_admin_lookup_failure_is_reported_as_partial(self):
        with patch.object(self.hub, 'is_admin', side_effect=[True, sqlite3.OperationalError('synthetic failure')]):
            result = self.hub.admin_create_member(A, 'new.member', self.password)
        self.assertTrue(result['created'])
        self.assertEqual(result['account']['sub'], self.created['sub'])
        self.assertEqual(result['membership'], 'activation_unconfirmed')
        self.provider.create.assert_called_once()

    def test_activation_rechecks_existing_identity_and_refuses_disabled_or_admin(self):
        for subject, enabled in [(self.created['sub'], False), (A.sub, True)]:
            self.provider.get_user.return_value = {'sub': subject, 'name': 'member', 'enabled': enabled}
            with self.subTest(subject=subject), self.assertRaises(HubError):
                self.hub.admin_activate_member(A, subject)
        self.assertEqual(self.hub.store.member_status(self.identity), 'inactive')
        with self.assertRaises(HubError):
            self.hub.admin_activate_member(B, self.created['sub'])

    def test_creation_rate_limit_stops_before_an_eleventh_identity_provider_write(self):
        for _ in range(10):
            self.hub.admin_create_member(A, 'new.member', self.password)
        with self.assertRaises(HubError) as caught:
            self.hub.admin_create_member(A, 'new.member', self.password)
        self.assertEqual((caught.exception.code, caught.exception.status), ('rate_limited', 429))
        self.assertEqual(self.provider.create.call_count, 10)

    def test_provisioning_uses_separate_explicit_config_and_preserves_read_only_directory(self):
        config = json.loads(Path('docs/examples/integrations/workbench-identity.hub.example.json').read_text())
        with tempfile.TemporaryDirectory() as folder:
            config['database'] = str(Path(folder)/'hub.db')
            config['user_provisioning'] = {'client_id': 'synthetic-create', 'client_secret': 'synthetic-private'}
            config['user_directory'] = {'client_id': 'synthetic-read', 'client_secret': 'synthetic-read-private'}
            path = Path(folder)/'config.json'
            path.write_text(json.dumps(config))
            path.chmod(0o600)
            with patch('control_everything.integrations.remote_hub.admin.SSHSignatureVerifier'):
                hub = build_service(path)
            self.assertIsNotNone(hub.user_provisioning)
            self.assertIsNot(hub.user_provisioning, hub.user_directory)
            self.assertEqual(hub.user_provisioning.issuer, config['issuer'])
            config['user_provisioning']['endpoint'] = 'https://unexpected.example.test'
            path.write_text(json.dumps(config))
            with self.assertRaises(ValueError):
                build_service(path)


if __name__ == '__main__':
    unittest.main()
