"""Static contract tests for deploy/remote (no Docker, no network, no real server)."""

import json
import re
import unittest
from pathlib import Path

KIT = Path(__file__).resolve().parents[2] / 'deploy' / 'remote'
DOC_IP = re.compile(r'\b203\.0\.113\.\d{1,3}\b')
ANY_IPV4 = re.compile(r'\b(?:\d{1,3}\.){3}\d{1,3}\b')
IDP_WORDS = re.compile(r'keycloak|casdoor|realm', re.IGNORECASE)


def read(relative):
    return (KIT / relative).read_text(encoding='utf-8')


def env_example():
    values = {}
    for line in read('ce-remote.env.example').splitlines():
        if line.strip() and not line.lstrip().startswith('#'):
            key, _, value = line.partition('=')
            values[key.strip()] = value
    return values


class RealmContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.realm = json.loads(read('realm/workbench-realm.json'))
        cls.clients = {client['clientId']: client for client in cls.realm['clients']}

    def test_expected_clients_exist(self):
        self.assertEqual(set(self.clients), {'workbench-web', 'workbench-desktop', 'workbench-mobile',
                                             'workbench-hub', 'workbench-user-directory'})

    def test_mobile_client_is_public_pkce_without_direct_grants(self):
        mobile = self.clients['workbench-mobile']
        self.assertTrue(mobile['publicClient'])
        self.assertTrue(mobile['standardFlowEnabled'])
        self.assertFalse(mobile['directAccessGrantsEnabled'])
        self.assertFalse(mobile['implicitFlowEnabled'])
        self.assertFalse(mobile.get('serviceAccountsEnabled', False))
        self.assertEqual(mobile['attributes']['pkce.code.challenge.method'], 'S256')
        self.assertEqual(mobile['redirectUris'], ['${CE_MOBILE_SCHEME}:/oauth/callback'])

    def test_every_token_issuing_client_carries_the_hub_audience(self):
        for name in ('workbench-web', 'workbench-desktop', 'workbench-mobile'):
            with self.subTest(client=name):
                mappers = self.clients[name].get('protocolMappers', [])
                audiences = [m['config'].get('included.client.audience') for m in mappers
                             if m['protocolMapper'] == 'oidc-audience-mapper']
                self.assertIn('workbench-hub', audiences)

    def test_directory_client_is_a_scoped_service_account(self):
        directory = self.clients['workbench-user-directory']
        self.assertTrue(directory['serviceAccountsEnabled'])
        self.assertFalse(directory['standardFlowEnabled'])
        self.assertFalse(directory['directAccessGrantsEnabled'])
        account = next(user for user in self.realm['users'] if user['username'] == 'service-account-workbench-user-directory')
        roles = account['clientRoles']['realm-management']
        self.assertEqual(sorted(roles), ['query-users', 'view-users'])

    def test_only_placeholders_for_secrets_and_origins(self):
        text = read('realm/workbench-realm.json')
        for name in ('CE_PUBLIC_ORIGIN', 'CE_MOBILE_SCHEME', 'WORKBENCH_WEB_CLIENT_SECRET',
                     'WORKBENCH_HUB_CLIENT_SECRET', 'WORKBENCH_DIRECTORY_CLIENT_SECRET'):
            self.assertIn('${' + name + '}', text)
        self.assertIsNone(ANY_IPV4.search(text))


class EnvTemplateTests(unittest.TestCase):
    def test_secrets_are_placeholders_and_ip_is_documentation_range(self):
        values = env_example()
        for key in ('CE_ROUTE_PROOF', 'OAUTH2_PROXY_COOKIE_SECRET', 'OAUTH2_PROXY_CLIENT_SECRET',
                    'CE_HUB_INTROSPECTION_CLIENT_SECRET', 'CE_DIRECTORY_CLIENT_SECRET',
                    'KC_BOOTSTRAP_ADMIN_PASSWORD', 'KC_DB_PASSWORD'):
            self.assertEqual(values[key], 'CHANGE_ME_AT_INSTALL', key)
        text = read('ce-remote.env.example')
        for match in ANY_IPV4.findall(text):
            self.assertTrue(DOC_IP.fullmatch(match) or match.startswith('127.0.0.1'), match)
        self.assertTrue(DOC_IP.fullmatch(values['CE_PUBLIC_IP']))

    def test_idp_block_and_keycloak_block_are_the_only_idp_specific_values(self):
        values = env_example()
        for key in values:
            if IDP_WORDS.search(key) or key.startswith('KC_') or key == 'PG_MEM_LIMIT' or key == 'PG_SHARED_BUFFERS':
                continue
            self.assertFalse(IDP_WORDS.search(values[key]) and key not in {
                'CE_OIDC_ISSUER', 'CE_OIDC_PROVIDER', 'CE_OIDC_LOGOUT_URL', 'CE_IDP_PUBLIC_PATHS'}, key)

    def test_keycloak_budget_is_capped(self):
        values = env_example()
        self.assertEqual(values['KC_MEM_LIMIT'], '768m')
        heap = int(re.search(r'-Xmx(\d+)m', values['KC_JAVA_HEAP']).group(1))
        meta = int(re.search(r'MaxMetaspaceSize=(\d+)m', values['KC_JAVA_OPTS']).group(1))
        self.assertLessEqual(heap + meta, 512)
        self.assertIn('UseSerialGC', values['KC_JAVA_OPTS'])


class CouplingTests(unittest.TestCase):
    def test_caddy_and_systemd_and_core_compose_are_idp_agnostic(self):
        for relative in ('caddy/Caddyfile', 'docker-compose.yml', 'oauth2-proxy/oauth2-proxy.cfg',
                         'systemd/ce-remote-hub.service', 'systemd/ce-device-provisioner.service',
                         'systemd/ce-device-provisioner.socket', 'systemd/ce-device-sshd.service',
                         'systemd/ce-public-ip-alias.service'):
            with self.subTest(file=relative):
                self.assertIsNone(IDP_WORDS.search(read(relative)))

    def test_caddy_variables_are_passed_through_by_compose(self):
        caddy = set(re.findall(r'\{\$([A-Z0-9_]+)\}', read('caddy/Caddyfile')))
        compose = read('docker-compose.yml')
        for name in caddy:
            self.assertRegex(compose, r'\b' + name + r'\b', name)
            self.assertIn(name, env_example())

    def test_caddy_uses_the_ip_certificate_profile(self):
        text = read('caddy/Caddyfile')
        self.assertIn('profile shortlived', text)
        self.assertIn('default_sni {$CE_PUBLIC_IP}', text)

    def test_caddy_image_supports_ip_certificates(self):
        match = re.search(r'caddy:(\d+)\.(\d+)\.(\d+)', read('docker-compose.yml'))
        self.assertGreaterEqual(tuple(map(int, match.groups())), (2, 11, 1))


class ResourceLimitTests(unittest.TestCase):
    def test_every_service_has_a_memory_limit(self):
        for relative in ('docker-compose.yml', 'idp-keycloak.yml'):
            text = read(relative)
            block = re.split(r'\n(?:volumes|networks):\n', text.split('\nservices:\n', 1)[1])[0]
            services = re.findall(r'^  ([a-z0-9-]+):\n', block, re.M)
            self.assertGreaterEqual(len(services), 1)
            self.assertEqual(len(re.findall(r'^    mem_limit:', text, re.M)), len(services), relative)

    def test_hub_unit_is_limited_and_hardened(self):
        text = read('systemd/ce-remote-hub.service')
        self.assertIn('MemoryMax=192M', text)
        self.assertIn('127.0.0.1', read('ce-remote.env.example'))

    def test_no_service_is_published_beyond_loopback(self):
        for relative in ('docker-compose.yml', 'idp-keycloak.yml'):
            for port in re.findall(r'^\s+- "?([0-9.:]+:\d+:\d+)"?$', read(relative), re.M):
                self.assertTrue(port.startswith('127.0.0.1:'), port)

    def test_daemon_json_and_dockerd_are_never_touched(self):
        for relative in ('install.sh', 'uninstall.sh', 'scripts/common.sh', 'scripts/check.sh'):
            text = read(relative)
            self.assertNotRegex(text, r'(?m)^[^#\n]*(>|tee|cp|mv|sed -i)[^\n]*daemon\.json')
            self.assertNotRegex(text, r'systemctl\s+(restart|stop|reload)\s+docker\b')


class RepositoryHygieneTests(unittest.TestCase):
    def test_no_env_dotfiles_and_no_real_addresses(self):
        for path in KIT.rglob('*'):
            if path.is_file():
                self.assertFalse(path.name.startswith('.env'), path)
                if path.suffix in {'.sh', '.yml', '.json', '.md', '.cfg', '.service', '.socket', '.conf', '.example'} \
                        or path.name in {'Caddyfile', 'Dockerfile'}:
                    for match in ANY_IPV4.findall(path.read_text(encoding='utf-8')):
                        self.assertTrue(DOC_IP.fullmatch(match) or match.startswith('127.'),
                                        '%s: %s' % (path, match))

    def test_shell_scripts_are_strict_and_executable(self):
        for name in ('install.sh', 'uninstall.sh', 'scripts/check.sh', 'scripts/promote-admin.sh'):
            self.assertRegex(read(name), r'(?m)^set -[eu]+o pipefail$', name)
        self.assertTrue(read('install.sh').startswith('#!/usr/bin/env bash'))


if __name__ == '__main__':
    unittest.main()
