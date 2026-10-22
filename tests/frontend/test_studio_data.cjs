'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-data.js'), 'utf8');
function fixture(respond) {
  const calls = [];
  const context = vm.createContext({ window: {}, AbortController, URLSearchParams, setTimeout, clearTimeout,
    localStorage: new Proxy({}, { get() { throw new Error('credential storage forbidden'); } }) });
  vm.runInContext(source, context);
  const client = context.window.StudioData.create({ fetchImpl: async (url, options) => {
    calls.push({ url, options }); const result = await respond(url, options, calls.length);
    return { ok: result.status === undefined || result.status === 200, status: result.status || 200, json: async () => result.body };
  } });
  return { client, calls };
}
test('writes require fresh bootstrap and keep CSRF only in memory', async () => {
  const f = fixture(url => ({ body: url === '/api/bootstrap' ? { csrf_token: 'secret-fixture', capabilities: { profile: true } } : { item: { id: 'real' } } }));
  await assert.rejects(f.client.post('/api/workspace/items', { title: 'x' }), error => error.reason === 'csrf_rejected');
  assert.equal(f.calls.length, 0);
  await f.client.bootstrap(); await f.client.post('/api/workspace/items', { title: 'x' });
  assert.equal(f.calls[1].options.headers['X-Session-CSRF'], 'secret-fixture');
  assert.equal(f.calls[1].options.headers['X-Session-Client'], 'panel');
  assert.equal(f.calls[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(f.calls[1].options.body), { title: 'x' });
});
test('a failed write rejects with conflict and never manufactures a saved item', async () => {
  const f = fixture(url => ({ status: url === '/api/bootstrap' ? 200 : 409,
    body: url === '/api/bootstrap' ? { csrf_token: 'token', capabilities: { profile: true } } : { reason: 'item_changed' } }));
  await f.client.bootstrap();
  await assert.rejects(f.client.post('/api/workspace/items/update', { id: 'x', expected_revision: 1, changes: { title: 'draft' } }),
    error => error.status === 409 && error.reason === 'item_changed');
});
test('snapshot reads every revision-consistent page before reporting task counts', async () => {
  const f = fixture(url => ({ body: url === '/api/workspace' ? { projects: { status: 'available', items: [] } }
    : url === '/api/workspace/agents' ? { items: [] }
      : { items: [{ id: url.includes('offset=1') ? 'second' : 'first' }], total: 2, list_revision: 7 } }));
  const result = await f.client.snapshot();
  assert.deepEqual(Array.from(result.items, row => row.id), ['first', 'second']);
  assert.ok(f.calls.some(call => call.url.includes('offset=1') && call.url.includes('list_revision=7')));
});
test('an incomplete or changing catalog is an error, not an empty success', async () => {
  const f = fixture(url => ({ body: url === '/api/workspace' ? { projects: { status: 'available', items: [] } }
    : url === '/api/workspace/agents' ? { items: [] } : { items: [], total: 10, list_revision: 7 } }));
  await assert.rejects(f.client.snapshot(), error => error.reason === 'list_changed');
});
test('product page loads real management modules and has no iframe pairing control', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.html'), 'utf8');
  assert.ok(html.indexOf('/studio-data.js') < html.indexOf('/studio-preview.js'));
  for (const script of ['/task-center.js', '/agents.js', '/project-space.js']) assert.ok(html.includes(script));
  assert.doesNotMatch(html, /iframe|orca-surface|orca-client-url/);
});

test('Studio preserves mounted editors on refresh and renders only server projects', async () => {
  const nodes = new Map();
  for (const id of ['ce-studio', 'studio-content', 'studio-status', 'studio-tasks', 'studio-agent-board', 'studio-rail', 'studio-topbar']) {
    nodes.set(id, { dataset: {}, innerHTML: '', textContent: '', hidden: false, listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; }, classList: { remove() {}, add() {} } });
  }
  let failed = false, mounts = 0, updates = 0;
  const snapshot = { workspace: { projects: { items: [{ id: 'server-project', name: '<Real project>', directories: [{ path: 'C:/example/fixture' }] }] } }, agents: [], items: [] };
  const callbacks = {};
  const window = { addEventListener(name, callback) { callbacks[name] = callback; },
    StudioData: { create: () => ({ bootstrap: async () => {}, api() {}, post() {}, canWrite: () => true,
      snapshot: async () => { if (failed) throw new Error('offline'); return snapshot; } }) },
    WorkspaceTaskCenter: { create: () => { mounts++; return { update() { updates++; }, setContext() {} }; } },
    WorkspaceAgentBoard: { create: () => { mounts++; return { load: async () => {}, setProject() {}, open() {} }; } } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.js'), 'utf8'), {
    window, document: { getElementById: id => nodes.get(id) }, location: { hash: '#home' },
    localStorage: { getItem: () => null, setItem() {} }, console,
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(nodes.get('studio-content').innerHTML, /&lt;Real project&gt;/);
  assert.match(nodes.get('studio-content').innerHTML, /project_id=server-project/);
  assert.doesNotMatch(nodes.get('studio-content').innerHTML, /Tank Frontline|local-session|iframe/);
  failed = true; callbacks.hashchange();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(mounts, 2); assert.equal(updates, 1);
  assert.match(nodes.get('studio-status').textContent, /offline.*上次读取/);
  assert.match(nodes.get('studio-content').innerHTML, /&lt;Real project&gt;/);
});
