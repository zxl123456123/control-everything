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

function studioFixture({ remote = false, savedCreatorUrl = null, monitorAvailable = true, unified = false, initialUrl = 'http://127.0.0.1:8772/studio#home', initialFailure = '' } = {}) {
  const elements = [];
  const active = { isConnected: true, focusCount: 0, focus() { this.focusCount++; } };
  function element(tag = 'div') {
    const node = { tagName: tag, children: [], dataset: {}, style: {}, listeners: {}, open: false, isConnected: true,
      classList: { add() {} }, className: '', textContent: '',
      append(...values) { values.forEach(value => { value.parent = this; this.children.push(value); }); },
      get childElementCount() { return this.children.length; },
      after(...values) { if (this.parent) { values.forEach(value => { value.parent = this.parent; }); this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, ...values); } },
      attachShadow() { this.shadowRoot = element('shadow'); return this.shadowRoot; },
      remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
      addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); },
      setAttribute(name, value) { this[name] = value; },
      focus() { this.focusCount = (this.focusCount || 0) + 1; },
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
  let menu = element('button'); menu.dataset.action = 'navigation';
  const scrollHost = { style: { overflow: 'auto', touchAction: 'pan-y' }, scrollTop: 237, scrollLeft: 4 };
  const nodes = new Map();
  for (const id of ['ce-studio', 'studio-content', 'studio-status', 'studio-tasks', 'studio-agent-board', 'studio-monitor', 'studio-monitor-content', 'studio-rail', 'studio-topbar', 'studio-project-search', 'studio-project-sort']) {
    nodes.set(id, { dataset: {}, innerHTML: '', textContent: '', hidden: false, listeners: {},
      focus() {}, setSelectionRange() {}, addEventListener(name, callback) { this.listeners[name] = callback; }, classList: { remove() {}, add() {} } });
  }
  const creatorInput = { value: '', focus() {} }, writes = [], removed = [], mounts = [], monitorCalls = [];
  if (unified) { nodes.get('ce-studio').dataset.unified = 'true'; nodes.get('ce-studio').dataset.theme = 'dark'; }
  nodes.get('ce-studio').querySelector = selector => selector === '[data-creator-url]' ? creatorInput : selector === '[data-action="navigation"]' ? menu : selector === 'dialog[open]' ? body.children.find(node => node.tagName === 'dialog' && node.open) : nodes.get(selector.slice(1));
  nodes.get('ce-studio').getRootNode = () => ({ host: { closest: () => scrollHost }, styleSheets: [{ href: 'http://127.0.0.1/workspace.css', cssRules: [{ cssText: '.onboarding-dialog{padding:28px}' }] }, { href: 'http://127.0.0.1/studio-preview.css', cssRules: [{ cssText: '#ce-studio .ce-project-settings{color:red}' }] }] });
  nodes.get('ce-studio').append = (...values) => body.append(...values);
  Object.defineProperty(nodes.get('ce-studio'), 'innerHTML', { set() { throw new Error('Do not replace the stable shell'); } });
  let failed = initialFailure === 'snapshot', updates = 0, editorMounts = 0;
  const mobileMounts = [], mobileDisposals = [];
  const snapshot = { workspace: { projects: { items: [{ id: 'server-project', name: '<Real project>', directories: [{ id: 'main', path: 'C:/example/fixture' }] }] } }, agents: [], items: [] };
  const callbacks = {}, boardProjects = [], projectSnapshots = [], posts = [], boardSnapshots = [], snapshotReads = [], timers = new Map(), location = new URL(initialUrl);
  let timerId = 0, clock = Date.now();
  const client = { bootstrap: async () => { if (initialFailure === 'bootstrap') throw new Error('bootstrap offline'); }, api() {}, post: async (url, value) => { posts.push({ url, value }); return { status: 'ok', project: { id: value.id } }; }, canWrite: () => true,
    snapshot: async () => { snapshotReads.push(true); if (failed) throw new Error('offline'); return snapshot; } };
  const localStorage = { getItem: key => key === 'ce-studio-creator-url' ? savedCreatorUrl : null,
    setItem: (...args) => writes.push(args), removeItem: key => removed.push(key) };
  const window = { history: { replaceState(_state, _title, hash) { location.hash = hash; } }, CEUITheme: { earlyRead: () => ({ theme: 'light', mount: () => () => {}, requestTheme(next) { this.theme = next; return {ok: true}; }, dispose() {} }) }, localStorage, addEventListener(name, callback) { callbacks[name] = callback; },
    removeEventListener(name) { delete callbacks[name]; }, dispatchEvent(event) { callbacks[event.type]?.(event); },
    StudioData: { create: () => client }, ProjectProgress: {}, ProjectProgressModel: {},
    StudioMobileEntry: { mount: (container, options) => { mobileMounts.push(options); container.innerHTML = '手机与设备说明'; return () => mobileDisposals.push(options); } },
    WorkspaceTaskCenter: { create: () => { editorMounts++; return { update() { updates++; }, setContext() {} }; } },
    WorkspaceAgentBoard: { create: options => { editorMounts++; return { load: () => options.onRefresh(), update: value => boardSnapshots.push(value), unavailable() {}, setProject: (...args) => boardProjects.push(args), open() {} }; } } };
  if (monitorAvailable) window.WorkspaceProjectMonitor = { create(options) {
    mounts.push(options); return { setActive: value => monitorCalls.push([options.projectId, 'active', value]), destroy: () => monitorCalls.push([options.projectId, 'destroy']) };
  } };
  window.fetch = () => Promise.resolve({ ok: false, text: async () => '' });
  let onboardingOptions, dispose;
  const dialog = element('dialog'); dialog.id = 'onboarding-dialog';
  window.WorkspaceOnboarding = { create(options) { onboardingOptions = options; return { open: async () => options.dialog.showModal() }; } };
  const document = { scrollingElement: scrollHost, activeElement: active, hidden: false, getElementById: () => null, createElement: element, body,
    addEventListener: (name, callback) => { callbacks['document:' + name] = callback; }, removeEventListener: name => { delete callbacks['document:' + name]; } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/project-progress-model.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-shell.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.js'), 'utf8'), {
    URL: class FixtureURL extends URL { constructor(value, base) { super(value, base || location.href); } }, URLSearchParams, window, document, location, localStorage, console,
    DOMParser: class { parseFromString() { return { getElementById: () => dialog }; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; this.defaultPrevented = false; } preventDefault() { this.defaultPrevented = true; } },
    fetch: (...args) => window.fetch(...args), Date: class extends Date { static now() { return clock; } },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
  });
  if (remote) {
    let active = true; const listeners = new Set();
    window.CERemoteContext = {context:'A'.repeat(32),get active(){return active;},storage:()=>localStorage,
      assertActive(){if(!active)throw new Error('remote_context_inactive');},
      onInactive(callback){listeners.add(callback);return ()=>listeners.delete(callback);},
      invalidate(){if(!active)return;active=false;for(const callback of [...listeners])callback();}};
  }
  dispose = window.StudioPreview.mount(nodes.get('ce-studio'), { onProjects: (rows, metadata) => projectSnapshots.push({ rows, metadata }) });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { nodes, menu, scrollHost, snapshot, client, location, writes, removed, mounts, monitorCalls, callbacks, window, body, elements, dialog, active, boardProjects, projectSnapshots, posts, mobileMounts, mobileDisposals, boardSnapshots, snapshotReads, timers, document,
    replaceMenu() { menu.isConnected = false; menu = element('button'); return menu; },
    onboarding: () => onboardingOptions, dispose: () => dispose(),
    editorMounts: () => editorMounts, updates: () => updates,
    fail() { failed = true; }, recover() { failed = false; }, flush,
    async advance(ms) { clock += ms; const callbacks = [...timers.values()]; timers.clear(); for (const callback of callbacks) callback(); await flush(); },
    async hidden(value) { document.hidden = value; callbacks['document:visibilitychange'](); await flush(); },
    async route(value) { const from = location.hash; location.hash = '#' + value; if (unified) callbacks['platform-navigation-accepted']({detail: {from, to: location.hash}}); else callbacks.hashchange(); await flush(); },
    submit(value) { creatorInput.value = value; nodes.get('ce-studio').listeners.submit({ preventDefault() {}, target: { dataset: { creatorForm: 'true' } } }); },
    openProject(id, href = '#project/' + id + '/workspace', modifiers = {}) { let prevented = false; nodes.get('ce-studio').listeners.click({ ...modifiers, preventDefault() { prevented = true; }, target: { closest: selector => selector === '[data-open-project]' ? { dataset: { openProject: id }, getAttribute: () => href } : null } }); return prevented; },
    manage(id) { nodes.get('ce-studio').listeners.click({ preventDefault() {}, target: { closest: selector => selector === '[data-project-settings]' ? { dataset: { projectSettings: id } } : null } }); },
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
    for (const id of ['studio-rail', 'studio-topbar']) assert.match(f.nodes.get(id).innerHTML, /href="#settings\/account"[^>]*aria-current="page"/);
    assert.match(f.nodes.get('studio-topbar').innerHTML, /账号与设备/);
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
    assert.ok(text.indexOf('/remote/account-device.js') >= 0);
    assert.ok(text.indexOf('/remote/account-device.js') < text.indexOf('/mobile-device-entry.js'));
    assert.ok(text.includes('/remote/remote-account.css'));
    assert.ok(text.indexOf('/mobile-device-entry.js') >= 0);
    assert.ok(text.indexOf('/mobile-device-entry.js') < text.indexOf('/studio-preview.js'));
  }
});
test('Studio preserves mounted editors on refresh and renders only server projects', async () => {
  const f = studioFixture(); await f.flush();
  assert.match(f.nodes.get('studio-content').innerHTML, /&lt;Real project&gt;/);
  assert.match(f.nodes.get('studio-content').innerHTML, /project_id=server-project/);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /Tank Frontline|local-session|iframe/);
  f.fail(); f.click('refresh'); await f.flush();
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
  assert.match(f.nodes.get('studio-content').innerHTML, /<details class="ce-creator-address">/);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /请先启动独立创作服务|普通 HTTP\(S\) 页面地址/);
  f.submit('https://creator.example.test/workbench/');
  assert.deepEqual(f.writes, [['ce-studio-creator-url', 'https://creator.example.test/workbench/']]);
  assert.match(f.nodes.get('studio-content').innerHTML, /<details class="ce-creator-address">/);
  for (const invalid of ['javascript:alert(1)', '//example.test', 'http://name:secret@example.test/',
    'https://example.test/?token=synthetic', 'https://example.test/#token', 'https://example.test/?',
    'https://example.test/#', 'https://example.test/a b', ' https://example.test/', 'https:\\example.test']) {
    f.submit(invalid); assert.equal(f.writes.length, 1);
    assert.match(f.nodes.get('studio-content').innerHTML, /aria-invalid="true"/);
    assert.match(f.nodes.get('studio-content').innerHTML, /<details class="ce-creator-address" open>/);
    assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /id="studio-creator-error" role="status" hidden/);
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
  f.snapshot.workspace.projects.items = []; f.click('refresh'); await f.flush();
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
  assert.match(f.nodes.get('studio-rail').innerHTML, /href="#home"[^>]*aria-label="项目总览"/);
  assert.doesNotMatch(f.nodes.get('studio-rail').innerHTML, /事项收件箱|全部事项|待处理/);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /事项收件箱|需要你确认|ce-home-lower/);
  await f.route('attention');
  assert.match(f.nodes.get('studio-content').innerHTML, /<h1>事项<\/h1>/);
  assert.equal(f.nodes.get('studio-agent-board').hidden, false);
  await f.route('project/server-project/tasks');
  assert.match(f.nodes.get('studio-content').innerHTML, /<h1[^>]*>项目进展<\/h1>/);
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
  assert.match(f.nodes.get('studio-content').innerHTML, /<a[^>]+class="ce-project-title-link"[^>]+href="#project\/server-project\/workspace"[^>]+data-open-project="server-project"/);
  assert.match(f.nodes.get('studio-content').innerHTML, /尚无事项记录/);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /打开开发|ce-development-shortcut/);
  assert.equal(f.nodes.get('ce-studio').dataset.theme, 'dark');
  const overview = f.nodes.get('studio-content').innerHTML;
  assert.equal(f.openProject('server-project'), true);
  assert.equal(f.location.pathname, '/studio');
  assert.equal(f.location.hash, '#project/server-project/workspace');
  assert.equal(f.editorMounts(), 1);
  f.location.search = '?project_id=server-project';
  await f.route('');
  assert.equal(f.nodes.get('ce-studio').dataset.projectSurface, 'false');
  assert.equal(f.nodes.get('studio-content').innerHTML, overview);
  assert.equal(f.nodes.get('studio-agent-board').hidden, true);
});

test('project title always enters workspace even when review is pending', () => {
  const context = vm.createContext({ window: {}, document: { getElementById() {} } });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.js'), 'utf8'), context);
  assert.equal(context.window.StudioPreview.projectEntryTab([{ state: 'doing' }, { state: 'review' }]), 'workspace');
  assert.equal(context.window.StudioPreview.projectEntryTab([{ state: 'doing', title: '继续' }]), 'workspace');
  assert.equal(context.window.StudioPreview.projectEntryTab([]), 'workspace');
});

test('overview renders one workspace title and exact review shortcut from real items', async () => {
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
  assert.match(html, /ce-project-title-link" href="#project\/server-project\/workspace"/);
  assert.match(html, /ce-review-shortcut" href="#project\/server-project\/review"[^>]*>待验收 2/);
  assert.doesNotMatch(html, /ce-development-shortcut/);
  assert.doesNotMatch(html, /<progress/);
  assert.match(html, /<span>3 待处理<\/span>/);
  assert.match(html, /<span>1 推进中<\/span>/);
  assert.match(html, /<span>0 有交付<\/span>/);
  assert.match(html, /&lt;Real project&gt;/);
  assert.equal(html.includes(f.snapshot.workspace.projects.items[0].directories[0].path), false);
  assert.doesNotMatch(html, /Older work/);
  assert.match(html, /1 个项目/);
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
  assert.match(html(), /1 个项目/);
  f.search('missing'); assert.match(html(), /没有匹配的项目/); assert.match(html(), /data-action="clear-project-filters"/);
  f.click('clear-project-filters'); assert.match(html(), /data-project-card="alpha"/);
  f.search('  ALPHA  '); assert.match(html(), /data-project-card="alpha"/); assert.doesNotMatch(html(), /data-project-card="zeta"/);
  f.click('clear-project-filters'); f.click('attention-projects'); f.click('archived-projects');
  assert.match(html(), /data-project-card="old"/); assert.match(html(), /href="#project\/old\/workspace"/);
  assert.match(html(), /1 个项目/);
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
  for (const [className, tab] of [['ce-project-title-link', 'workspace'], ['ce-review-shortcut', 'review']]) {
    assert.match(html, new RegExp('class="[^"\\n]*' + className + '" href="#project/server-project/' + tab + '"'));
    assert.equal(f.openProject('server-project', '#project/server-project/' + tab), true);
    assert.equal(f.location.hash, '#project/server-project/' + tab);
  }
  assert.doesNotMatch(f.nodes.get('studio-rail').innerHTML, /href="#project\//);
  assert.equal(f.openProject('server-project', '#project/server-project/tasks', { ctrlKey: true }), false);
  const standalone = studioFixture(); await standalone.flush();
  assert.equal(standalone.openProject('server-project', '/workbench/web-index.html?project_id=server-project'), false);
  assert.equal(standalone.location.hash, '#home');
});

test('project rows keep management separate and archived projects restore through the existing save API', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  let html = f.nodes.get('studio-content').innerHTML;
  assert.match(html, /<\/a><\/h2><button[^>]+data-project-menu="server-project"/);
  f.snapshot.workspace.projects.items[0].archived = true;
  f.click('archived-projects'); html = f.nodes.get('studio-content').innerHTML;
  assert.match(html, /已归档/); assert.match(html, /data-project-menu="server-project"/);
  assert.match(html, /href="#project\/server-project\/workspace"/);
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
  f.click('refresh'); await f.flush();
  const published = f.projectSnapshots.at(-1);
  assert.deepEqual(Array.from(published.rows, row => row.id), ['server-project']);
  assert.deepEqual(JSON.parse(JSON.stringify(published.metadata)), { archived: [{ id: 'archived-project', name: 'Archived project', directory: 'C:/example/archived' }] });
});

test('warm business filters share the published snapshot without another data read', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  assert.equal(f.snapshotReads.length, 1); assert.equal(f.boardSnapshots.length, 0, 'Hidden progress only caches the latest Studio snapshot');
  for (const tab of ['tasks', 'review', 'attention', 'workspace', 'activity', 'tasks']) await f.route('project/server-project/' + tab);
  assert.equal(f.snapshotReads.length, 1);
  assert.equal(f.boardSnapshots.length, 1); assert.equal(f.boardSnapshots[0], f.snapshot);
  assert.equal(f.nodes.get('studio-agent-board').hidden, false);
  assert.doesNotMatch(f.nodes.get('studio-status').textContent, /正在更新/);
  f.dispose(); assert.equal(f.timers.size, 0);
});

test('quiet refresh pauses in development and hidden documents, then rechecks stale data on return', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  await f.route('project/server-project/workspace');
  assert.equal(f.nodes.get('studio-agent-board').hidden, true); assert.equal(f.timers.size, 0);
  await f.advance(16000); assert.equal(f.snapshotReads.length, 1);
  await f.route('project/server-project/tasks'); assert.equal(f.snapshotReads.length, 2);
  await f.hidden(true); assert.equal(f.timers.size, 0);
  await f.advance(16000); assert.equal(f.snapshotReads.length, 2);
  await f.hidden(false); assert.equal(f.snapshotReads.length, 3);
  await f.advance(15000); assert.equal(f.snapshotReads.length, 4);
  assert.doesNotMatch(f.nodes.get('studio-status').textContent, /正在更新/);
  f.dispose();
});

test('concurrent refreshes share an in-flight read and retain a write-triggered follow-up', async () => {
  const f = studioFixture(); await f.flush();
  const pending = []; let reads = 0;
  f.client.snapshot = () => { reads++; return new Promise(resolve => pending.push(resolve)); };
  f.click('refresh'); f.click('refresh'); f.click('refresh');
  assert.equal(reads, 1);
  pending.shift()(f.snapshot); await f.flush(); assert.equal(reads, 2);
  pending.shift()(f.snapshot); await f.flush(); assert.equal(reads, 2);
  assert.equal(f.boardSnapshots.length, 0, 'Home refresh does not render a hidden consumer');
  await f.route('project/server-project/tasks'); assert.equal(f.boardSnapshots.length, 1); f.dispose();
});

test('unchanged refresh preserves normalized DOM and mobile return invalidates the content owner', async () => {
  const f=studioFixture(); await f.flush(); const writes=[];
  for (const id of ['studio-content','studio-rail','studio-topbar']) {
    const node=f.nodes.get(id); let html=node.innerHTML;
    Object.defineProperty(node,'innerHTML',{get:()=>html.replace(/\/>/g,'>'),set:value=>{writes.push(id);html=value;}});
  }
  await f.advance(15000); assert.deepEqual(writes,[]);
  f.search('nothing'); assert.ok(writes.includes('studio-content')); writes.length=0;
  await f.advance(15000); assert.deepEqual(writes,[]);
  await f.route('mobile'); await f.route('home');
  assert.match(f.nodes.get('studio-content').innerHTML,/没有匹配的项目/);
  assert.equal(f.mobileMounts.length,1); assert.equal(f.mobileDisposals.length,1);
});

test('latest real timestamp still sorts cards while undated items never manufacture recency', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  f.snapshot.workspace.projects.items.push({id:'other',name:'Other'});
  f.snapshot.items = [{ project_id: 'server-project', title: 'Undated', state: 'todo' }, { project_id: 'server-project', title: 'Dated', state: 'done', updated_at: '2026-10-23' }];
  f.snapshot.items.push({project_id:'other',state:'todo',updated_at:'2026-10-22'});
  const ids = () => [...f.nodes.get('studio-content').innerHTML.matchAll(/data-project-card="([^"]+)"/g)].map(match=>match[1]);
  for (const timestamp of ['2026-10-23T10:00:00Z', '2026-10-23T18:00:00+08:00']) {
    f.snapshot.items[1].updated_at = timestamp; await f.route('home');
    assert.deepEqual(ids(), ['server-project','other']);
  }
  f.snapshot.items.splice(1,1); await f.route('home'); assert.deepEqual(ids(), ['other','server-project']);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /<time/);
});


test('project task heading, filters and counts stay scoped through navigation and refresh', async () => {
  const f = studioFixture(); await f.flush();
  f.nodes.get('ce-studio').dataset.isolatedPreview = 'true';
  f.snapshot.items = [{ id: 'a', project_id: 'server-project' }, { id: 'b', project_id: 'other' }, { id: 'c', project_id: 'server-project' }];
  await f.route('project/server-project/tasks');
  assert.match(f.nodes.get('studio-content').innerHTML, /项目进展/);
  assert.match(f.nodes.get('studio-content').innerHTML, /本项目全部/);
  assert.equal(f.nodes.get('studio-status').textContent, ''); assert.equal(f.nodes.get('studio-status').hidden, true);
  f.click('refresh'); await f.flush();
  assert.equal(f.nodes.get('studio-status').textContent, ''); assert.equal(f.nodes.get('studio-status').hidden, true);
  await f.route('project/other/review');
  assert.equal(f.nodes.get('studio-status').textContent, ''); assert.equal(f.nodes.get('studio-status').hidden, true);
  await f.route('inbox');
  assert.equal(f.nodes.get('studio-status').textContent, ''); assert.equal(f.nodes.get('studio-status').hidden, true);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /本项目全部/);
  f.dispose();
});


test('project count retains failed refresh evidence after changing task routes', async () => {
  const f = studioFixture(); await f.flush();
  f.snapshot.items = [{ project_id: 'server-project' }, { project_id: 'other' }];
  f.fail(); f.click('refresh'); await f.flush(); await f.route('project/server-project/tasks');
  assert.match(f.nodes.get('studio-status').textContent, /offline.*上次读取/);
  await f.route('project/other/review');
  assert.match(f.nodes.get('studio-status').textContent, /offline.*上次读取/);
  f.dispose();
});


test('unified legacy inbox stays readable without a top-level task entry and exact filters remain explicit', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  await f.route('inbox');
  assert.doesNotMatch(f.nodes.get('studio-rail').innerHTML, /href="#inbox"/);
  assert.doesNotMatch(f.nodes.get('studio-topbar').innerHTML, /href="#inbox"/);
  assert.doesNotMatch(f.nodes.get('studio-topbar').innerHTML, /<span> \/ 事项<\/span>/);
  assert.doesNotMatch(f.nodes.get('studio-topbar').innerHTML, /data-action="refresh"/);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /aria-label="事项筛选"|ce-tabs/);
  const reads = f.snapshotReads.length;
  await f.route('inbox/review');
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /当前仅显示|ce-scope-note/);
  assert.deepEqual(f.boardProjects.at(-1), ['', 'review']);
  await f.route('project/server-project/attention');
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /当前仅显示|ce-scope-note/);
  assert.deepEqual(f.boardProjects.at(-1), ['server-project', 'attention']);
  assert.equal(f.snapshotReads.length, reads);
  f.dispose();
});


test('unified task pages omit the old duplicate progress link while monitor keeps its return action', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  for (const tab of ['tasks', 'review']) {
    await f.route('project/server-project/' + tab);
    assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, />业务进度<\/a>/);
  }
  await f.route('project/server-project/monitor');
  assert.match(f.nodes.get('studio-content').innerHTML, /href="#project\/server-project\/tasks">返回进展/);
  f.dispose();
});

test('retiring Studio uses its existing dispose and rejects late snapshots without rescheduling',async()=>{
  const f=studioFixture({remote:true});await f.flush();
  const previous=f.nodes.get('studio-content').innerHTML;
  let release;f.client.snapshot=()=>new Promise(resolve=>{release=resolve});
  f.click('refresh');await f.flush();
  const updates=f.boardSnapshots.length;
  f.window.CERemoteContext.invalidate();assert.equal(f.timers.size,0);
  release({...f.snapshot,items:[{id:'late-private-item'}]});await f.flush();
  assert.equal(f.boardSnapshots.length,updates);assert.equal(f.nodes.get('studio-content').innerHTML,previous);
  f.click('refresh');await f.flush();assert.equal(f.timers.size,0);
});

test('minimal project tasks remove scope notes, session links, management actions and preview status', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  f.nodes.get('ce-studio').dataset.isolatedPreview = 'true';
  await f.route('project/server-project/tasks');
  assert.match(f.nodes.get('studio-content').innerHTML, /<h1[^>]*>项目进展<\/h1>/);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /查看进展|ce-scope-note|事项管理/);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, />会话<\/a>/);
  assert.equal(f.nodes.get('studio-status').textContent, ''); assert.equal(f.nodes.get('studio-status').hidden, true);
  f.fail(); f.click('refresh'); await f.flush();
  assert.match(f.nodes.get('studio-status').textContent, /offline.*上次读取/);
  assert.equal(f.nodes.get('studio-status').hidden, false);
  f.dispose();
});


test('navigation drawer shares destinations, locks the real scroll host and restores on every dismissal', async () => {
  for (const unified of [false, true]) {
    const f = studioFixture({ unified }); await f.flush();
    const drawer = f.elements.find(node => node.id === 'studio-navigation');
    f.click('navigation');
    assert.equal(drawer.open, true);
    assert.equal(f.scrollHost.style.overflow, 'hidden');
    assert.match(drawer.innerHTML, /href="#home"/);
    assert.match(drawer.innerHTML, /href="#settings\/account"[^>]*>.*账号与设备/);
    assert.doesNotMatch(drawer.innerHTML, /href="#inbox"/);
    f.scrollHost.scrollTop = 0; drawer.close();
    assert.equal(f.menu.focusCount, 1);
    assert.equal(f.scrollHost.style.overflow, 'auto');
    assert.equal(f.scrollHost.scrollTop, 237);
    assert.equal(f.menu['aria-expanded'], 'false');
    f.click('navigation'); f.window.innerWidth = 1100; f.callbacks.resize();
    assert.equal(drawer.open, false); assert.equal(f.scrollHost.style.overflow, 'auto');
    f.click('navigation'); f.dispose();
    assert.equal(drawer.open, false); assert.equal(drawer.isConnected, false);
    assert.equal(f.scrollHost.scrollTop, 237); assert.equal(f.scrollHost.style.overflow, 'auto');
  }
});

test('drawer links close before routing and project dialogs close it before opening', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  const drawer = f.elements.find(node => node.id === 'studio-navigation');
  f.click('navigation');
  f.nodes.get('ce-studio').listeners.click({ target: { closest: selector => selector === 'a[href]' ? { href: '#mobile' } : null } });
  assert.equal(drawer.open, false); assert.equal(f.scrollHost.style.overflow, 'auto');
  f.click('navigation'); f.manage('server-project');
  assert.equal(drawer.open, false);
  assert.equal(f.elements.find(node => node.className === 'ce-project-settings').open, true);
  f.dispose();
});


test('drawer close restores the current menu after chrome replacement and backdrop dismissal', async () => {
  const f = studioFixture(); await f.flush();
  const drawer = f.elements.find(node => node.id === 'studio-navigation');
  f.click('navigation');
  const replacement = f.replaceMenu();
  drawer.close();
  assert.equal(replacement.focusCount, 1);
  assert.equal(replacement['aria-expanded'], 'false');
  f.click('navigation');
  drawer.listeners.click[0]({ target: drawer });
  assert.equal(drawer.open, false);
  assert.equal(replacement.focusCount, 2);
  assert.equal(f.scrollHost.style.overflow, 'auto');
  f.dispose();
});

test('first-level project requests enter the native workbench before its registration event opens a dialog', async () => {
  const f = studioFixture({unified:true}); await f.flush();
  f.window.fetch = async () => ({ok:true,text:async()=>''});
  f.callbacks['platform-add-project'](); await f.flush();
  assert.equal(f.location.hash, '#workbench'); assert.equal(f.dialog.open, false);
  await f.route('workbench');
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /data-action="open-project-dialog"|项目配置/);
  f.callbacks['platform-add-project'](); await f.flush(); assert.equal(f.dialog.open, true);
  f.dialog.close(); assert.equal(f.location.hash, '#workbench');
});

test('confirmed registration closes before refresh and only returned IDs determine the destination', async () => {
  const f = studioFixture({unified:true}); await f.flush(); await f.route('workbench');
  f.window.fetch = async () => ({ok:true,text:async()=>''}); f.callbacks['platform-add-project'](); await f.flush();
  f.snapshot.workspace.projects.items.push({id:'new-project',name:'New',directories:[{id:'main',path:'C:/example/new'}]});
  f.dialog.close(); await f.onboarding().onChanged(undefined,{kind:'registered',confirmedIDs:['new-project']});
  assert.equal(f.location.hash, '#project/new-project/workspace'); assert.equal(f.posts.length, 0);
  await f.route('workbench');
  await f.onboarding().onChanged(undefined,{kind:'source-saved'});
  assert.equal(f.location.hash, '#workbench');
  await f.onboarding().onChanged({id:'new-project'});
  assert.equal(f.location.hash, '#workbench');
});

test('multiple and partial receipts stay in an internal notice, and read failure retries without POST', async () => {
  const f = studioFixture({unified:true}); await f.flush(); await f.route('workbench');
  f.window.fetch = async () => ({ok:true,text:async()=>''}); f.callbacks['platform-add-project'](); await f.flush(); f.dialog.close();
  f.snapshot.workspace.projects.items.push({id:'second',name:'Second'});
  await f.onboarding().onChanged(undefined,{kind:'registered',confirmedIDs:['server-project','second'],failedCount:1});
  assert.equal(f.location.hash, '#workbench');
  const firstNotice = f.elements.findLast(node => node.className === 'ce-project-settings');
  assert.match(firstNotice.innerHTML, /已添加 2 个项目/);
  assert.match(firstNotice.innerHTML, /1 项未加入/);
  firstNotice.close();
  f.fail(); await f.onboarding().onChanged(undefined,{kind:'registered',confirmedIDs:['second']});
  const failedNotice = f.elements.findLast(node => node.className === 'ce-project-settings');
  assert.match(failedNotice.innerHTML, /无需再次创建/);
  const retry = failedNotice.descendants().find(node => node.tagName === 'button' && node.textContent === '重新读取');
  assert.ok(retry); f.recover(); retry.listeners.click[0](); await f.flush();
  assert.equal(f.location.hash, '#project/second/workspace'); assert.equal(f.posts.length, 0);
});

test('integrated Studio ignores a raw requested hash until the entry accepts it', async () => {
  const f = studioFixture({unified:true}); await f.flush(); const before = f.nodes.get('studio-content').innerHTML;
  f.location.hash = '#settings/development'; f.callbacks.hashchange();
  assert.equal(f.nodes.get('studio-content').innerHTML, before);
  f.callbacks['platform-navigation-accepted']({detail:{from:'#home',to:'#settings/development'}});
  assert.match(f.nodes.get('studio-content').innerHTML, /开发工具偏好/);
});

test('standalone asynchronous navigation guards preserve the accepted hash until all accept', async () => {
  const f = studioFixture(); await f.flush(); let resolve;
  f.callbacks['platform-before-navigate'] = event => event.detail.waitUntil(new Promise(done => {resolve=done;}));
  await f.route('project-setup'); assert.equal(f.location.hash, '#home');
  resolve(false); await f.flush(); assert.equal(f.location.hash, '#home');
  await f.route('project-setup'); resolve(true); await f.flush();
  assert.equal(f.location.hash, '#workbench'); assert.match(f.nodes.get('studio-content').innerHTML, /项目运行组件未连接/);
});

test('late registration refresh does not replace a later accepted page', async () => {
  const f = studioFixture({unified:true}); await f.flush(); await f.route('workbench');
  f.window.fetch = async () => ({ok:true,text:async()=>''}); f.callbacks['platform-add-project'](); await f.flush(); f.dialog.close();
  f.snapshot.workspace.projects.items.push({id:'saved-late',name:'Saved'});
  let resolve;
  f.client.snapshot = () => new Promise(done => {resolve=done;});
  const saved = f.onboarding().onChanged(undefined,{kind:'registered',confirmedIDs:['saved-late']});
  await f.route('settings/sources'); resolve(f.snapshot); await saved;
  assert.equal(f.location.hash, '#settings/sources');
});

test('successful reads stay quiet and a failed refresh remains visible until recovery', async () => {
  const f = studioFixture(); await f.flush();
  assert.equal(f.nodes.get('studio-status').hidden, true);
  assert.equal(f.nodes.get('studio-status').textContent, '');
  f.fail(); f.click('refresh'); await f.flush();
  assert.equal(f.nodes.get('studio-status').hidden, false);
  assert.match(f.nodes.get('studio-status').textContent, /offline.*上次读取/);
  f.recover(); f.click('refresh'); await f.flush();
  assert.equal(f.nodes.get('studio-status').hidden, true);
  assert.equal(f.nodes.get('studio-status').textContent, '');
});
