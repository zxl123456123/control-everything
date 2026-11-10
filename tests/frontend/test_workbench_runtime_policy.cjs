'use strict';
// Node 24 type stripping loads this leaf policy only; no listener or runtime starts.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let policy, webOrigin;
test.before(async () => {
  policy = await import(pathToFileURL(path.resolve(__dirname,
    '../../web/workbench-engine/src/main/platform-runtime-policy.ts')).href);
  webOrigin = await import(pathToFileURL(path.resolve(__dirname,
    '../../web/workbench-engine/src/shared/web-origin-security.ts')).href);
});
test('product isolation requires a complete exact loopback origin', () => {
  assert.equal(policy.readPlatformRuntimePolicy({}), null);
  assert.deepEqual(policy.readPlatformRuntimePolicy({ CE_WORKBENCH_ISOLATED: '1',
    CE_WORKBENCH_ORIGIN: 'http://127.0.0.1:14401' }), { origin: 'http://127.0.0.1:14401' });
  for (const origin of [undefined, 'http://localhost:14401', 'http://127.0.0.1:14401/',
    'http://127.0.0.1:14401/path', 'http://example.invalid:14401', 'null']) {
    assert.throws(() => policy.readPlatformRuntimePolicy({ CE_WORKBENCH_ISOLATED: '1', CE_WORKBENCH_ORIGIN: origin }));
  }
});
test('browser upgrades require exactly one correct Origin and Host before authentication', () => {
  const active = { origin: 'http://127.0.0.1:14401' };
  const headers = ['Host', '127.0.0.1:24401', 'Origin', active.origin];
  assert.equal(policy.platformUpgradeAllowed(headers, '/', 24401, active), true);
  for (const bad of [[], headers.slice(0, 2), ['Host', '127.0.0.1:24401', 'Origin', 'null'],
    ['Host', 'localhost:24401', 'Origin', active.origin], ['Host', '127.0.0.1:24402', 'Origin', active.origin],
    [...headers, 'origin', active.origin], [...headers, 'HOST', '127.0.0.1:24401'],
    ['Host', '127.0.0.1:24401', 'Origin', 'http://example.invalid:14401']]) {
    for (const target of ['/', '/?orca-client=web']) {
      assert.equal(policy.platformUpgradeAllowed(bad, target, 24401, active), false);
    }
  }
  for (const target of ['/other', '/?token=fixture', undefined, '/?', '/?orca-client=', '/?orca-client=mobile',
    '/?orca-client=web&orca-client=web', '/?orca-client=web&extra=1', '/?extra=1&orca-client=web',
    '/?orca-client=web&', '/other?orca-client=web', '/?%6frca-client=web', '/?orca-client=%77eb']) {
    assert.equal(policy.platformUpgradeAllowed(headers, target, 24401, active), false);
  }
});

test('the real Web transport marker is accepted with the same exact header gates', () => {
  const active = { origin: 'http://127.0.0.1:14401' };
  const url = new URL(webOrigin.withWebClientUpgradeMarker('ws://127.0.0.1:24401'));
  const target = url.pathname + url.search;
  assert.equal(target, '/?orca-client=web');
  assert.equal(policy.platformUpgradeAllowed(['Host', url.host, 'Origin', active.origin], target, 24401, active), true);
});
test('standalone source mode retains its original transport contract', () => {
  assert.equal(policy.platformUpgradeAllowed([], '/existing-native-path', 24401, null), true);
});
