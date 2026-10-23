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
  for (const script of ['/task-center.js', '/agents.js', '/project-space.js', '/monitor-art.js', '/monitor-scene.js', '/monitor-model.js', '/project-monitor.js']) assert.ok(html.includes(script));
  assert.doesNotMatch(html, /iframe|orca-surface|orca-client-url/);
});

function studioFixture({ savedCreatorUrl = null, monitorAvailable = true, unified = false } = {}) {
  const nodes = new Map();
  for (const id of ['ce-studio', 'studio-content', 'studio-status', 'studio-tasks', 'studio-agent-board', 'studio-monitor', 'studio-monitor-content', 'studio-rail', 'studio-topbar']) {
    nodes.set(id, { dataset: {}, innerHTML: '', textContent: '', hidden: false, listeners: {},
      addEventListener(name, callback) { this.listeners[name] = callback; }, classList: { remove() {}, add() {} } });
  }
  const creatorInput = { value: '', focus() {} }, writes = [], removed = [], mounts = [], monitorCalls = [];
  if (unified) { nodes.get('ce-studio').dataset.unified = 'true'; nodes.get('ce-studio').dataset.theme = 'dark'; }
  nodes.get('ce-studio').querySelector = selector => selector === '[data-creator-url]' ? creatorInput : nodes.get(selector.slice(1));
  Object.defineProperty(nodes.get('ce-studio'), 'innerHTML', { set() { throw new Error('Do not replace the stable shell'); } });
  let failed = false, updates = 0, editorMounts = 0;
  const snapshot = { workspace: { projects: { items: [{ id: 'server-project', name: '<Real project>', directories: [{ path: 'C:/example/fixture' }] }] } }, agents: [], items: [] };
  const callbacks = {}, location = new URL('http://127.0.0.1:8772/studio#home');
  const client = { bootstrap: async () => {}, api() {}, post() {}, canWrite: () => true,
    snapshot: async () => { if (failed) throw new Error('offline'); return snapshot; } };
  const localStorage = { getItem: key => key === 'ce-studio-creator-url' ? savedCreatorUrl : null,
    setItem: (...args) => writes.push(args), removeItem: key => removed.push(key) };
  const window = { localStorage, addEventListener(name, callback) { callbacks[name] = callback; },
    StudioData: { create: () => client },
    WorkspaceTaskCenter: { create: () => { editorMounts++; return { update() { updates++; }, setContext() {} }; } },
    WorkspaceAgentBoard: { create: () => { editorMounts++; return { load: async () => {}, setProject() {}, open() {} }; } } };
  if (monitorAvailable) window.WorkspaceProjectMonitor = { create(options) {
    mounts.push(options); return { setActive: value => monitorCalls.push([options.projectId, 'active', value]), destroy: () => monitorCalls.push([options.projectId, 'destroy']) };
  } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.js'), 'utf8'), {
    URL, URLSearchParams, window, document: { getElementById: id => nodes.get(id) }, location, localStorage, console,
    fetch() { throw new Error('Studio must not probe the creator service'); },
  });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { nodes, snapshot, client, location, writes, removed, mounts, monitorCalls, callbacks,
    editorMounts: () => editorMounts, updates: () => updates,
    fail() { failed = true; }, flush,
    async route(value) { location.hash = '#' + value; callbacks.hashchange(); await flush(); },
    submit(value) { creatorInput.value = value; nodes.get('ce-studio').listeners.submit({ preventDefault() {}, target: { dataset: { creatorForm: 'true' } } }); },
    openProject(id) { nodes.get('ce-studio').listeners.click({ target: { closest: selector => selector === '[data-open-project]' ? { dataset: { openProject: id } } : null } }); },
    click(action) { nodes.get('ce-studio').listeners.click({ target: { closest: selector => selector === '[data-action]' ? { dataset: { action } } : null } }); }
  };
}

test('Studio preserves mounted editors on refresh and renders only server projects', async () => {
  const f = studioFixture(); await f.flush();
  assert.match(f.nodes.get('studio-content').innerHTML, /&lt;Real project&gt;/);
  assert.match(f.nodes.get('studio-content').innerHTML, /project_id=server-project/);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /Tank Frontline|local-session|iframe/);
  f.fail(); await f.route('home');
  assert.equal(f.editorMounts(), 1); assert.equal(f.updates(), 0);
  assert.match(f.nodes.get('studio-status').textContent, /offline.*上次读取/);
  assert.match(f.nodes.get('studio-content').innerHTML, /&lt;Real project&gt;/);
});

test('creator is an independent top-level and narrow-screen link without project routing', async () => {
  const f = studioFixture(); await f.flush();
  const link = f.nodes.get('studio-rail').innerHTML.match(/<a [^>]+ce-creator-link[^>]*>/)[0];
  assert.match(link, /href="http:\/\/127\.0\.0\.1:8770\/"/);
  assert.match(link, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(link, /data-action|data-route/);
  assert.match(f.nodes.get('studio-topbar').innerHTML, /ce-creator-mobile.*href="http:\/\/127\.0\.0\.1:8770\/"/);
  f.nodes.get('ce-studio').listeners.click({ target: { closest: () => null } });
  assert.equal(f.location.hash, '#home'); assert.equal(f.editorMounts(), 1);
  f.click('theme'); assert.equal(f.nodes.get('ce-studio').dataset.theme, 'dark');
  assert.equal(f.editorMounts(), 1);
});

test('creator URL writes one independent key and rejects all credential-bearing forms', async () => {
  const f = studioFixture(); await f.flush(); await f.route('tools');
  assert.match(f.nodes.get('studio-content').innerHTML, /data-creator-form="true"/);
  f.submit('https://creator.example.test/workbench/');
  assert.deepEqual(f.writes, [['ce-studio-creator-url', 'https://creator.example.test/workbench/']]);
  for (const invalid of ['javascript:alert(1)', '//example.test', 'http://name:secret@example.test/',
    'https://example.test/?token=synthetic', 'https://example.test/#token', 'https://example.test/?',
    'https://example.test/#', 'https://example.test/a b', ' https://example.test/', 'https:\\example.test']) {
    f.submit(invalid); assert.equal(f.writes.length, 1);
    assert.match(f.nodes.get('studio-content').innerHTML, /aria-invalid="true"/);
    assert.match(f.nodes.get('studio-rail').innerHTML, /href="https:\/\/creator\.example\.test\/workbench\/"/);
  }
  assert.match(f.nodes.get('studio-topbar').innerHTML, /href="https:\/\/creator\.example\.test\/workbench\/"/);
  assert.equal(f.editorMounts(), 1);
});

test('invalid stored creator URLs are discarded without echoing token material', async () => {
  const f = studioFixture({ savedCreatorUrl: 'https://example.test/#synthetic-creator-secret' }); await f.flush();
  assert.deepEqual(f.removed, ['ce-studio-creator-url']);
  assert.match(f.nodes.get('studio-rail').innerHTML, /href="http:\/\/127\.0\.0\.1:8770\/"/);
  assert.doesNotMatch(f.nodes.get('studio-rail').innerHTML, /synthetic-creator-secret/);
  const valid = studioFixture({ savedCreatorUrl: 'https://creator.example.test/' }); await valid.flush();
  assert.match(valid.nodes.get('studio-rail').innerHTML, /href="https:\/\/creator\.example\.test\/"/);
});

test('project monitor reuses an instance, deactivates hidden views and destroys stale project bindings', async () => {
  const f = studioFixture(); await f.flush(); await f.route('project/server-project/monitor');
  assert.equal(f.nodes.get('studio-monitor').hidden, false); assert.equal(f.nodes.get('studio-agent-board').hidden, true);
  assert.equal(f.mounts.length, 1); assert.equal(f.mounts[0].fetchJson, f.client.api);
  assert.equal(f.mounts[0].projectId, 'server-project');
  await f.route('project/server-project/monitor'); assert.equal(f.mounts.length, 1);
  await f.route('home'); assert.deepEqual(f.monitorCalls.at(-1), ['server-project', 'active', false]);
  await f.route('project/server-project/monitor'); assert.equal(f.mounts.length, 1);
  f.mounts[0].onTask('task'); assert.equal(f.location.hash, '#project/server-project/tasks');
  f.snapshot.workspace.projects.items.push({ id: 'second', name: 'Second' });
  await f.route('project/second/monitor');
  assert.ok(f.monitorCalls.some(row => row[0] === 'server-project' && row[1] === 'destroy'));
  assert.equal(f.mounts.length, 2); assert.equal(f.mounts[1].projectId, 'second');
  f.snapshot.workspace.projects.items = []; await f.route('project/second/monitor');
  assert.deepEqual(f.monitorCalls.at(-1), ['second', 'destroy']); assert.equal(f.nodes.get('studio-monitor').hidden, true);
  assert.equal(f.editorMounts(), 1);
});

test('unified navigation deactivates the retained monitor before native workspace handover', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  await f.route('project/server-project/monitor');
  assert.deepEqual(f.monitorCalls.at(-1), ['server-project', 'active', true]);
  await f.route('project/server-project/workspace');
  assert.deepEqual(f.monitorCalls.at(-1), ['server-project', 'active', false]);
});

test('missing monitoring module is an honest unavailable state', async () => {
  const f = studioFixture({ monitorAvailable: false }); await f.flush(); await f.route('project/server-project/monitor');
  assert.match(f.nodes.get('studio-monitor-content').textContent, /监控资源尚未就绪/);
  assert.equal(f.mounts.length, 0); assert.equal(f.nodes.get('studio-agent-board').hidden, true);
});

test('outer navigation shows projects only and legacy task routes retain their business modules', async () => {
  const f = studioFixture(); await f.flush();
  assert.match(f.nodes.get('studio-rail').innerHTML, />项目<\/a>/);
  assert.doesNotMatch(f.nodes.get('studio-rail').innerHTML, /事项收件箱|全部事项|待处理/);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /事项收件箱|需要你确认|ce-home-lower/);
  await f.route('attention');
  assert.match(f.nodes.get('studio-content').innerHTML, /<h1>事项<\/h1>/);
  assert.equal(f.nodes.get('studio-agent-board').hidden, false);
  await f.route('project/server-project/tasks');
  assert.match(f.nodes.get('studio-content').innerHTML, /<h1>事项<\/h1>/);
  await f.route('project/server-project/workspace');
  assert.equal(f.nodes.get('studio-agent-board').hidden, true);
  await f.route('project/server-project/review');
  assert.match(f.nodes.get('studio-content').innerHTML, /aria-current="page">待验收/);
  await f.route('inbox/manage');
  assert.match(f.nodes.get('studio-content').innerHTML, /<h1>事项<\/h1>/);
  assert.equal(f.nodes.get('studio-tasks').hidden, true);
  assert.equal(f.nodes.get('studio-agent-board').hidden, false);
  assert.equal(f.editorMounts(), 1);
});

test('unified project opens as a view action and retains the overview until the native surface takes over', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  assert.match(f.nodes.get('studio-content').innerHTML, /<button[^>]+data-open-project="server-project"/);
  assert.equal(f.nodes.get('ce-studio').dataset.theme, 'dark');
  const overview = f.nodes.get('studio-content').innerHTML;
  f.openProject('server-project');
  assert.equal(f.location.pathname, '/studio');
  assert.equal(f.location.hash, '#project/server-project/workspace');
  assert.equal(f.editorMounts(), 1);
  f.location.search = '?project_id=server-project';
  await f.route('');
  assert.equal(f.nodes.get('ce-studio').dataset.projectSurface, 'false');
  assert.equal(f.nodes.get('studio-content').innerHTML, overview);
  assert.equal(f.nodes.get('studio-agent-board').hidden, true);
});
