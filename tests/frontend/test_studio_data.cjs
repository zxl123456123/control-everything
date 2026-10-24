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

function studioFixture({ savedCreatorUrl = null, monitorAvailable = true, unified = false, initialUrl = 'http://127.0.0.1:8772/studio#home', initialFailure = '' } = {}) {
  const elements = [];
  const active = { isConnected: true, focusCount: 0, focus() { this.focusCount++; } };
  function element(tag = 'div') {
    const node = { tagName: tag, children: [], dataset: {}, style: {}, listeners: {}, open: false, isConnected: true,
      classList: { add() {} }, className: '', textContent: '',
      append(...values) { values.forEach(value => { value.parent = this; this.children.push(value); }); },
      attachShadow() { this.shadowRoot = element('shadow'); return this.shadowRoot; },
      remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
      addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); },
      setAttribute(name, value) { this[name] = value; },
      focus() {},
      showModal() { this.open = true; },
      close() { this.open = false; for (const callback of this.listeners.close || []) callback(); },
      querySelector(selector) {
        const all = this.children.flatMap(child => [child, ...child.descendants()]);
        return all.find(child => selector === '#' + child.id || selector === child.tagName
          || selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/)?.slice(1).every((value, index, parts) => index === 1 || (parts[1] === undefined ? Object.hasOwn(child, value) : child[value] === parts[1])));
      },
      descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    };
    node.querySelectorAll = selector => node.descendants().filter(child => child.tagName === selector);
    Object.defineProperty(node, 'innerHTML', { get() { return this.html || ''; }, set(value) {
      this.html = value; this.children = [];
      for (const match of value.matchAll(/<(form|fieldset|input|button|p)\b([^>]*)>/g)) {
        const child = element(match[1]);
        for (const attribute of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) child[attribute[1]] = attribute[2] ?? '';
        child.checked = Object.hasOwn(child, 'checked');
        this.append(child);
      }
    } });
    elements.push(node); return node;
  }
  const body = element('body');
  const nodes = new Map();
  for (const id of ['ce-studio', 'studio-content', 'studio-status', 'studio-tasks', 'studio-agent-board', 'studio-monitor', 'studio-monitor-content', 'studio-rail', 'studio-topbar', 'studio-project-search', 'studio-project-sort']) {
    nodes.set(id, { dataset: {}, innerHTML: '', textContent: '', hidden: false, listeners: {},
      focus() {}, setSelectionRange() {}, addEventListener(name, callback) { this.listeners[name] = callback; }, classList: { remove() {}, add() {} } });
  }
  const creatorInput = { value: '', focus() {} }, writes = [], removed = [], mounts = [], monitorCalls = [];
  if (unified) { nodes.get('ce-studio').dataset.unified = 'true'; nodes.get('ce-studio').dataset.theme = 'dark'; }
  nodes.get('ce-studio').querySelector = selector => selector === '[data-creator-url]' ? creatorInput : nodes.get(selector.slice(1));
  nodes.get('ce-studio').getRootNode = () => ({ styleSheets: [{ href: 'http://127.0.0.1/workspace.css', cssRules: [{ cssText: '.onboarding-dialog{padding:28px}' }] }, { href: 'http://127.0.0.1/studio-preview.css', cssRules: [{ cssText: '#ce-studio .ce-project-settings{color:red}' }] }] });
  nodes.get('ce-studio').append = (...values) => body.append(...values);
  Object.defineProperty(nodes.get('ce-studio'), 'innerHTML', { set() { throw new Error('Do not replace the stable shell'); } });
  let failed = initialFailure === 'snapshot', updates = 0, editorMounts = 0;
  const mobileMounts = [], mobileDisposals = [];
  const snapshot = { workspace: { projects: { items: [{ id: 'server-project', name: '<Real project>', directories: [{ path: 'C:/example/fixture' }] }] } }, agents: [], items: [] };
  const callbacks = {}, boardProjects = [], projectSnapshots = [], posts = [], location = new URL(initialUrl);
  const client = { bootstrap: async () => { if (initialFailure === 'bootstrap') throw new Error('bootstrap offline'); }, api() {}, post: async (url, value) => { posts.push({ url, value }); return { status: 'ok', project: { id: value.id } }; }, canWrite: () => true,
    snapshot: async () => { if (failed) throw new Error('offline'); return snapshot; } };
  const localStorage = { getItem: key => key === 'ce-studio-creator-url' ? savedCreatorUrl : null,
    setItem: (...args) => writes.push(args), removeItem: key => removed.push(key) };
  const window = { localStorage, addEventListener(name, callback) { callbacks[name] = callback; },
    removeEventListener(name) { delete callbacks[name]; }, dispatchEvent(event) { callbacks[event.type]?.(event); },
    StudioData: { create: () => client },
    StudioMobileEntry: { mount: (container, options) => { mobileMounts.push(options); container.innerHTML = '手机与设备说明'; return () => mobileDisposals.push(options); } },
    WorkspaceTaskCenter: { create: () => { editorMounts++; return { update() { updates++; }, setContext() {} }; } },
    WorkspaceAgentBoard: { create: () => { editorMounts++; return { load: async () => {}, setProject: (...args) => boardProjects.push(args), open() {} }; } } };
  if (monitorAvailable) window.WorkspaceProjectMonitor = { create(options) {
    mounts.push(options); return { setActive: value => monitorCalls.push([options.projectId, 'active', value]), destroy: () => monitorCalls.push([options.projectId, 'destroy']) };
  } };
  window.fetch = () => Promise.resolve({ ok: false, text: async () => '' });
  let onboardingOptions, dispose;
  const dialog = element('dialog'); dialog.id = 'onboarding-dialog';
  window.WorkspaceOnboarding = { create(options) { onboardingOptions = options; return { open: async () => options.dialog.showModal() }; } };
  const document = { activeElement: active, getElementById: () => null, createElement: element, body };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.js'), 'utf8'), {
    URL: class FixtureURL extends URL { constructor(value, base) { super(value, base || location.href); } }, URLSearchParams, window, document, location, localStorage, console,
    DOMParser: class { parseFromString() { return { getElementById: () => dialog }; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    fetch: (...args) => window.fetch(...args),
  });
  dispose = window.StudioPreview.mount(nodes.get('ce-studio'), { onProjects: (rows, metadata) => projectSnapshots.push({ rows, metadata }) });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { nodes, snapshot, client, location, writes, removed, mounts, monitorCalls, callbacks, window, body, elements, dialog, active, boardProjects, projectSnapshots, posts, mobileMounts, mobileDisposals,
    onboarding: () => onboardingOptions, dispose: () => dispose(),
    editorMounts: () => editorMounts, updates: () => updates,
    fail() { failed = true; }, flush,
    async route(value) { location.hash = '#' + value; callbacks.hashchange(); await flush(); },
    submit(value) { creatorInput.value = value; nodes.get('ce-studio').listeners.submit({ preventDefault() {}, target: { dataset: { creatorForm: 'true' } } }); },
    openProject(id, href = '#project/' + id + '/tasks', modifiers = {}) { let prevented = false; nodes.get('ce-studio').listeners.click({ ...modifiers, preventDefault() { prevented = true; }, target: { closest: selector => selector === '[data-open-project]' ? { dataset: { openProject: id }, getAttribute: () => href } : null } }); return prevented; },
    manage(id) { nodes.get('ce-studio').listeners.click({ target: { closest: selector => selector === '[data-project-settings]' ? { dataset: { projectSettings: id } } : null } }); },
    search(value) { nodes.get('ce-studio').listeners.input({ target: { id: 'studio-project-search', value, selectionStart: value.length } }); },
    sort(value) { nodes.get('ce-studio').listeners.change({ target: { id: 'studio-project-sort', value } }); },
    click(action) { nodes.get('ce-studio').listeners.click({ target: { closest: selector => selector === '[data-action]' ? { dataset: { action } } : null } }); }
  };
}

test('mobile navigation survives initial API failure and refresh without remounting', async () => {
  for (const initialFailure of ['bootstrap', 'snapshot', '']) {
    const f = studioFixture({ initialUrl: 'http://example.test/studio?project_id=p#mobile', initialFailure });
    await f.flush();
    assert.equal(f.mobileMounts.length, 1); assert.equal(f.mobileMounts[0].returnHash, '#home');
    assert.equal(f.nodes.get('studio-content').innerHTML, '手机与设备说明');
    for (const id of ['studio-rail', 'studio-topbar']) assert.match(f.nodes.get(id).innerHTML, /href="#mobile"[^>]*aria-current="page"/);
    assert.match(f.nodes.get('studio-topbar').innerHTML, /手机与设备/);
    f.click('refresh'); await f.flush(); assert.equal(f.mobileMounts.length, 1);
    f.dispose(); assert.equal(f.mobileDisposals.length, 1);
  }
});
test('mobile return context follows project, legacy, and history routes without stale reuse', async () => {
  for (const initialUrl of ['http://example.test/studio#project/p/review', 'http://example.test/studio?project_id=p']) {
    const f = studioFixture({ initialUrl, unified: true }); await f.flush();
    const expected = initialUrl.includes('#') ? '#project/p/review' : '#project/p/workspace';
    await f.route('mobile'); assert.equal(f.mobileMounts.at(-1).returnHash, expected);
    await f.route(expected.slice(1)); assert.equal(f.mobileDisposals.length, 1);
    await f.route('mobile'); assert.equal(f.mobileMounts.at(-1).returnHash, expected);
    await f.route('home'); await f.route('mobile'); assert.equal(f.mobileMounts.at(-1).returnHash, '#home');
    f.dispose();
  }
});
test('mobile resource is loaded before Studio in both assembly paths', () => {
  for (const file of ['web/workspace/studio-preview.html', 'web/workbench-engine/src/renderer/src/web/platform-studio-surface.tsx']) {
    const text = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
    assert.ok(text.indexOf('/mobile-device-entry.js') >= 0);
    assert.ok(text.indexOf('/mobile-device-entry.js') < text.indexOf('/studio-preview.js'));
  }
});
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
  assert.match(f.nodes.get('studio-content').innerHTML, /<h1>&lt;Real project&gt; · 事项<\/h1>/);
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
  assert.match(f.nodes.get('studio-content').innerHTML, /<a[^>]+class="ce-project-title-link"[^>]+href="#project\/server-project\/tasks"[^>]+data-open-project="server-project"/);
  assert.match(f.nodes.get('studio-content').innerHTML, /尚无事项记录/);
  assert.match(f.nodes.get('studio-content').innerHTML, /href="#project\/server-project\/workspace"[^>]*>打开开发/);
  assert.equal(f.nodes.get('ce-studio').dataset.theme, 'dark');
  const overview = f.nodes.get('studio-content').innerHTML;
  assert.equal(f.openProject('server-project'), true);
  assert.equal(f.location.pathname, '/studio');
  assert.equal(f.location.hash, '#project/server-project/tasks');
  assert.equal(f.editorMounts(), 1);
  f.location.search = '?project_id=server-project';
  await f.route('');
  assert.equal(f.nodes.get('ce-studio').dataset.projectSurface, 'false');
  assert.equal(f.nodes.get('studio-content').innerHTML, overview);
  assert.equal(f.nodes.get('studio-agent-board').hidden, true);
});

test('project title always enters tasks even when review is pending', () => {
  const context = vm.createContext({ window: {}, document: { getElementById() {} } });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.js'), 'utf8'), context);
  assert.equal(context.window.StudioPreview.projectEntryTab([{ state: 'doing' }, { state: 'review' }]), 'tasks');
  assert.equal(context.window.StudioPreview.projectEntryTab([{ state: 'doing', title: '继续' }]), 'tasks');
  assert.equal(context.window.StudioPreview.projectEntryTab([]), 'tasks');
});

test('overview renders one progress card per project with stable tasks and separate shortcuts', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  f.snapshot.items.push(
    { id: 'doing', project_id: 'server-project', state: 'doing', title: 'Older work', updated_at: '2026-10-20T10:00:00Z' },
    { id: 'review-1', project_id: 'server-project', state: 'review', title: 'Review one', updated_at: '2026-10-21T10:00:00Z' },
    { id: 'review-2', project_id: 'server-project', state: 'review', title: '<Latest & result>', updated_at: '2026-10-23T10:00:00+00:00' },
    { id: 'blocked', project_id: 'server-project', state: 'blocked', title: 'Blocked', updated_at: '2026-10-22T10:00:00Z' },
    { id: 'done', project_id: 'server-project', state: 'done', title: 'Done' });
  await f.route('home');
  const html = f.nodes.get('studio-content').innerHTML;
  assert.equal((html.match(/data-project-card="server-project"/g) || []).length, 1);
  assert.match(html, /ce-project-title-link" href="#project\/server-project\/tasks"/);
  assert.match(html, /ce-review-shortcut" href="#project\/server-project\/review"[^>]*>待验收 <b>2<\/b>/);
  assert.match(html, /ce-development-shortcut" href="#project\/server-project\/workspace"/);
  assert.match(html, /已记录事项 <b>1\/5<\/b> 已完成/);
  assert.match(html, /<progress max="5" value="1"/);
  assert.match(html, /&lt;Latest &amp; result&gt;/);
  assert.match(html, /<time datetime="2026-10-23T10:00:00\+00:00">2026-10-23 10:00:00\+00:00<\/time>/);
  assert.equal(html.includes(f.snapshot.workspace.projects.items[0].directories[0].path), false);
  assert.doesNotMatch(html, /Older work/);
  for (const label of ['项目总数', '进行中项目', '需关注项目']) assert.match(html, new RegExp(label + '<\\/span><strong>1<\\/strong>'));
});

test('overview filters and sorting stay in memory while statistics keep their catalog scope', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  f.snapshot.workspace.projects.items.push({ id: 'alpha', name: 'Alpha' }, { id: 'zeta', name: 'Zeta' }, { id: 'old', name: 'Archived', archived: true });
  f.snapshot.items.push({ id: 'a', project_id: 'alpha', state: 'doing', updated_at: '2026-10-21T10:00:00Z' },
    { id: 'z', project_id: 'zeta', state: 'review', updated_at: '2026-10-23T10:00:00Z' });
  await f.route('home');
  let reads = 0; const read = f.client.snapshot; f.client.snapshot = async () => { reads++; return read(); };
  const html = () => f.nodes.get('studio-content').innerHTML;
  assert.ok(html().indexOf('data-project-card="zeta"') < html().indexOf('data-project-card="alpha"'));
  assert.ok(html().indexOf('data-project-card="alpha"') < html().indexOf('data-project-card="server-project"'));
  f.sort('name'); assert.ok(html().indexOf('data-project-card="alpha"') < html().indexOf('data-project-card="zeta"'));
  f.click('attention-projects'); assert.match(html(), /data-project-card="zeta"/); assert.doesNotMatch(html(), /data-project-card="alpha"/);
  assert.match(html(), /项目总数<\/span><strong>3<\/strong>/);
  f.search('missing'); assert.match(html(), /没有匹配的项目/); assert.match(html(), /data-action="clear-project-filters"/);
  f.click('clear-project-filters'); assert.match(html(), /data-project-card="alpha"/);
  f.search('  ALPHA  '); assert.match(html(), /data-project-card="alpha"/); assert.doesNotMatch(html(), /data-project-card="zeta"/);
  f.click('clear-project-filters'); f.click('attention-projects'); f.click('archived-projects');
  assert.match(html(), /data-project-card="old"/); assert.doesNotMatch(html(), /data-open-project|打开开发|href="#project/);
  assert.match(html(), /项目总数<\/span><strong>1<\/strong>/);
  assert.equal(reads, 0);
});

test('project registration uses a styled visible target and every close stays on the current page', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  await f.route('project/server-project/workspace');
  const hash = f.location.hash;
  f.window.fetch = async () => ({ ok: true, text: async () => '<dialog id="onboarding-dialog"></dialog>' });
  for (const reason of ['cancel', 'escape', 'saved']) {
    f.callbacks['platform-add-project'](); await f.flush();
    assert.equal(f.dialog.open, true);
    const host = f.body.children.find(node => Object.hasOwn(node.dataset, 'platformProjectDialog'));
    assert.ok(host.shadowRoot, 'the body target must isolate and carry existing styles');
    const wrapper = host.shadowRoot.querySelector('#ce-studio');
    assert.equal(wrapper.dataset.unified, 'true'); assert.equal(wrapper.dataset.theme, 'dark');
    assert.equal(f.dialog.parent, wrapper);
    assert.match(host.shadowRoot.querySelector('style').textContent, /onboarding-dialog/);
    assert.match(host.shadowRoot.querySelector('style').textContent, /ce-project-settings/);
    if (reason === 'saved') await f.onboarding().onChanged({ id: 'new-project' });
    f.dialog.close(); assert.equal(f.location.hash, hash);
    assert.ok(f.active.focusCount > 0);
  }
  f.callbacks['platform-add-project'](); await f.flush(); f.dispose();
  assert.equal(f.dialog.open, false); assert.equal(f.body.children.length, 0);
});

test('registration load failure is visible and allows a retry from the development page', async () => {
  const f = studioFixture({ unified: true }); await f.flush(); await f.route('project/server-project/workspace');
  f.callbacks['platform-add-project']();
  await f.flush();
  const notice = f.elements.find(node => node.tagName === 'dialog' && node.open);
  assert.match(notice.innerHTML, /添加项目暂不可用/);
  notice.querySelector('button').listeners.click[0](); assert.equal(notice.isConnected, false);
  f.window.fetch = async () => ({ ok: true, text: async () => '' });
  f.callbacks['platform-add-project'](); await f.flush();
  assert.equal(f.dialog.open, true); assert.equal(f.location.hash, '#project/server-project/workspace');
});

test('an unregistered directory notice stays on the current page', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  await f.route('project/server-project/workspace');
  f.callbacks['platform-manage-project']({ detail: { directory: 'C:/example/unregistered' } });
  assert.equal(f.location.hash, '#project/server-project/workspace');
  const notice = f.elements.find(node => node.tagName === 'dialog' && node.open);
  assert.match(notice.innerHTML, /请从项目总览管理已登记的项目/);
  notice.querySelector('button').listeners.click[0](); assert.equal(notice.isConnected, false);
});

test('mixed states retain stable project navigation and explicit shortcut routes', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  f.snapshot.items = [
    { id: 'r', project_id: 'server-project', title: 'Review work', state: 'review', updated_at: '2026-10-23' },
    { id: 'd', project_id: 'server-project', title: 'Doing work', state: 'doing', updated_at: '2026-10-24' },
    { id: 'b', project_id: 'server-project', title: 'Blocked work', state: 'blocked' }
  ];
  await f.route('home');
  const html = f.nodes.get('studio-content').innerHTML;
  for (const [className, tab] of [['ce-project-title-link', 'tasks'], ['ce-review-shortcut', 'review'], ['ce-development-shortcut', 'workspace']]) {
    assert.match(html, new RegExp('class="[^"\\n]*' + className + '" href="#project/server-project/' + tab + '"'));
    assert.equal(f.openProject('server-project', '#project/server-project/' + tab), true);
    assert.equal(f.location.hash, '#project/server-project/' + tab);
  }
  assert.match(f.nodes.get('studio-rail').innerHTML, /href="#project\/server-project\/tasks"/);
  assert.equal(f.openProject('server-project', '#project/server-project/tasks', { ctrlKey: true }), false);
  const standalone = studioFixture(); await standalone.flush();
  assert.equal(standalone.openProject('server-project', '/workbench/web-index.html?project_id=server-project'), false);
  assert.equal(standalone.location.hash, '#home');
});

test('project rows keep management separate and archived projects restore through the existing save API', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  let html = f.nodes.get('studio-content').innerHTML;
  assert.match(html, /<\/a><\/h2>[\s\S]*<\/div><\/div><button[^>]+data-project-settings="server-project"/);
  f.snapshot.workspace.projects.items[0].archived = true;
  f.click('archived-projects'); html = f.nodes.get('studio-content').innerHTML;
  assert.match(html, /已归档/); assert.match(html, /data-project-settings="server-project"/);
  assert.doesNotMatch(html, /data-open-project|href="#project/);
  f.manage('server-project');
  const dialog = f.elements.find(node => node.tagName === 'dialog' && node.open);
  assert.equal(dialog.querySelector('[name="archived"]').checked, true);
  dialog.querySelector('[name="archived"]').checked = false;
  dialog.querySelector('[name="name"]').value = 'Restored project';
  await dialog.querySelector('form').listeners.submit[0]({ preventDefault() {} });
  assert.equal(f.posts.length, 1); assert.equal(f.posts[0].url, '/api/workspace/projects/save');
  assert.equal(f.posts[0].value.archived, false); assert.equal(dialog.open, false); assert.equal(f.location.hash, '#home');
});

test('archived task views show a recovery state without exposing active task actions', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  f.snapshot.workspace.projects.items[0].archived = true;
  await f.route('project/server-project/review');
  assert.equal(f.nodes.get('studio-agent-board').hidden, true);
  assert.match(f.nodes.get('studio-content').innerHTML, /已归档/);
  assert.match(f.nodes.get('studio-content').innerHTML, /href="#home"/);
  assert.equal(f.location.hash, '#project/server-project/review');
});

test('project snapshots send archived identity separately from active native candidates', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  f.snapshot.workspace.projects.items.push({ id: 'archived-project', name: 'Archived project', archived: true, directories: [{ id: 'main', path: 'C:/example/archived' }] });
  await f.route('home');
  const published = f.projectSnapshots.at(-1);
  assert.deepEqual(Array.from(published.rows, row => row.id), ['server-project']);
  assert.deepEqual(JSON.parse(JSON.stringify(published.metadata)), { archived: [{ id: 'archived-project', name: 'Archived project', directory: 'C:/example/archived' }] });
});

test('latest real timestamp wins while undated items retain a truthful unknown time', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  f.snapshot.items = [{ project_id: 'server-project', title: 'Undated', state: 'todo' }, { project_id: 'server-project', title: 'Dated', state: 'done', updated_at: '2026-10-23' }];
  await f.route('home'); assert.match(f.nodes.get('studio-content').innerHTML, /Dated/); assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /Undated/);
  for (const timestamp of ['2026-10-23T10:00:00Z', '2026-10-23T18:00:00+08:00']) {
    f.snapshot.items[1].updated_at = timestamp; await f.route('home');
    assert.ok(f.nodes.get('studio-content').innerHTML.includes('>' + timestamp.replace('T', ' ') + '</time>'));
  }
  f.snapshot.items.pop(); await f.route('home'); assert.match(f.nodes.get('studio-content').innerHTML, /Undated/); assert.match(f.nodes.get('studio-content').innerHTML, /时间未知/);
});


test('project task heading, filters and counts stay scoped through navigation and refresh', async () => {
  const f = studioFixture(); await f.flush();
  f.nodes.get('ce-studio').dataset.isolatedPreview = 'true';
  f.snapshot.items = [{ id: 'a', project_id: 'server-project' }, { id: 'b', project_id: 'other' }, { id: 'c', project_id: 'server-project' }];
  await f.route('project/server-project/tasks');
  assert.match(f.nodes.get('studio-content').innerHTML, /&lt;Real project&gt; · 事项/);
  assert.match(f.nodes.get('studio-content').innerHTML, /本项目全部/);
  assert.equal(f.nodes.get('studio-status').textContent, '隔离测试数据 · 本项目 2 项事项');
  f.click('refresh'); await f.flush();
  assert.equal(f.nodes.get('studio-status').textContent, '隔离测试数据 · 本项目 2 项事项');
  await f.route('project/other/review');
  assert.equal(f.nodes.get('studio-status').textContent, '隔离测试数据 · 本项目 1 项事项');
  await f.route('inbox');
  assert.equal(f.nodes.get('studio-status').textContent, '隔离测试数据 · 1 个项目 · 3 项事项');
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /本项目全部/);
  f.dispose();
});


test('project count retains failed refresh evidence after changing task routes', async () => {
  const f = studioFixture(); await f.flush();
  f.snapshot.items = [{ project_id: 'server-project' }, { project_id: 'other' }];
  f.fail(); await f.route('project/server-project/tasks');
  assert.match(f.nodes.get('studio-status').textContent, /本项目 1 项事项.*offline.*上次读取/);
  await f.route('project/other/review');
  assert.match(f.nodes.get('studio-status').textContent, /本项目 1 项事项.*offline.*上次读取/);
  f.dispose();
});
