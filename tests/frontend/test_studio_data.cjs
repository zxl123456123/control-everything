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
test('product page omits retired management modules and has no iframe pairing control', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.html'), 'utf8');
  assert.ok(html.indexOf('/studio-data.js') < html.indexOf('/studio-preview.js'));
  for (const script of ['/task-center.js', '/agents.js', '/project-space.js', '/monitor-art.js', '/monitor-scene.js', '/monitor-model.js', '/project-monitor.js', '/project-progress.js']) assert.ok(!html.includes(script));
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
  for (const id of ['ce-studio', 'studio-content', 'studio-status', 'studio-tasks', 'studio-agent-board', 'studio-monitor', 'studio-monitor-content', 'studio-rail', 'studio-topbar', 'studio-settings-nav', 'studio-project-search', 'studio-project-sort']) {
    nodes.set(id, { dataset: {}, innerHTML: '', textContent: '', hidden: false, listeners: {},
      focus() {}, setSelectionRange() {}, addEventListener(name, callback) { this.listeners[name] = callback; }, classList: { remove() {}, add() {} } });
  }
  const storageReads = [], writes = [], removed = [], mounts = [], monitorCalls = [];
  if (unified) { nodes.get('ce-studio').dataset.unified = 'true'; nodes.get('ce-studio').dataset.theme = 'dark'; }
  nodes.get('ce-studio').querySelector = selector => selector === '[data-action="navigation"]' ? menu : selector === 'dialog[open]' ? body.children.find(node => node.tagName === 'dialog' && node.open) : nodes.get(selector.slice(1));
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
  const localStorage = { getItem: key => { storageReads.push(key); return key === 'ce-studio-creator-url' ? savedCreatorUrl : null; },
    setItem: (...args) => writes.push(args), removeItem: key => removed.push(key) };
  const window = { history: { replaceState(_state, _title, hash) { location.hash = hash; } }, CEUITheme: { earlyRead: () => ({ theme: 'light', mount: () => () => {}, requestTheme(next) { this.theme = next; return {ok: true}; }, dispose() {} }) }, localStorage, addEventListener(name, callback) { callbacks[name] = callback; },
    removeEventListener(name) { delete callbacks[name]; }, dispatchEvent(event) { callbacks[event.type]?.(event); },
    StudioData: { create: () => client },
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
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-shell.js'), 'utf8') + '\n' + fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.js'), 'utf8'), {
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
  let runtimeHost = unified ? 'runtime:owned-environment' : null;
  dispose = window.StudioPreview.mount(nodes.get('ce-studio'), {
    onProjects: (rows, metadata) => projectSnapshots.push({ rows, metadata }), runtimeHost: () => runtimeHost
  });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { nodes, menu, scrollHost, snapshot, client, location, storageReads, writes, removed, mounts, monitorCalls, callbacks, window, body, elements, dialog, active, boardProjects, projectSnapshots, posts, mobileMounts, mobileDisposals, boardSnapshots, snapshotReads, timers, document,
    replaceMenu() { menu.isConnected = false; menu = element('button'); return menu; },
    onboarding: () => onboardingOptions, dispose: () => dispose(),
    editorMounts: () => editorMounts, updates: () => updates,
    fail() { failed = true; }, recover() { failed = false; }, flush,
    setRuntimeHost(value) { runtimeHost = value; },
    async advance(ms) { clock += ms; const callbacks = [...timers.values()]; timers.clear(); for (const callback of callbacks) callback(); await flush(); },
    async hidden(value) { document.hidden = value; callbacks['document:visibilitychange'](); await flush(); },
    async route(value) { const from = location.hash; location.hash = '#' + value; if (unified) callbacks['platform-navigation-accepted']({detail: {from, to: location.hash}}); else callbacks.hashchange(); await flush(); },
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
  for (const initialUrl of ['http://example.test/studio#project/p/review', 'http://example.test/studio?project_id=p', 'http://example.test/studio#workbench']) {
    const f = studioFixture({ initialUrl, unified: true }); await f.flush();
    const expected = initialUrl.endsWith('#workbench') ? '#workbench' : initialUrl.includes('#') ? '#project/p/workspace' : '#project/p/workspace';
    for (const account of ['settings/account', 'mobile', 'settings/mobile']) {
      const before = f.mobileDisposals.length;
      await f.route(account); assert.equal(f.mobileMounts.at(-1).returnHash, expected);
      const mounts = f.mobileMounts.length;
      for (const alias of ['mobile', 'settings/mobile', 'settings/account']) {
        await f.route(alias); assert.equal(f.mobileMounts.length, mounts);
        assert.equal(f.mobileMounts.at(-1).returnHash, expected);
      }
      await f.route(expected.slice(1)); assert.equal(f.mobileDisposals.length, before + 1);
    }
    await f.route('home'); await f.route('mobile'); assert.equal(f.mobileMounts.at(-1).returnHash, '#home');
    f.dispose();
  }
});

test('account routes identify their page and leave refresh to the account panel', async () => {
  for (const unified of [false, true]) {
    const f = studioFixture({ unified }); await f.flush();
    for (const route of ['settings/account', 'mobile', 'settings/mobile']) {
      await f.route(route);
      const chrome = f.nodes.get('studio-topbar').innerHTML;
      assert.match(chrome, /<span> \/ 账号与设备<\/span>/);
      assert.match(chrome, /href="#settings\/account" aria-current="page"/);
      assert.doesNotMatch(chrome, /data-action="refresh"/);
    }
    await f.route('home');
    assert.match(f.nodes.get('studio-topbar').innerHTML, /data-action="refresh"/);
    assert.equal(f.posts.length, 0);
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
test('Studio refresh renders only server projects without mounting retired editors', async () => {
  const f = studioFixture(); await f.flush();
  assert.match(f.nodes.get('studio-content').innerHTML, /&lt;Real project&gt;/);
  assert.match(f.nodes.get('studio-content').innerHTML, /project_id=server-project/);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /Tank Frontline|local-session|iframe/);
  f.fail(); f.click('refresh'); await f.flush();
  assert.equal(f.editorMounts(), 0); assert.equal(f.updates(), 0);
  assert.match(f.nodes.get('studio-status').textContent, /offline.*上次读取/);
  assert.match(f.nodes.get('studio-content').innerHTML, /&lt;Real project&gt;/);
});

test('routine desktop, mobile topbar and drawer navigation omit the source-only creator', async () => {
  const f = studioFixture(); await f.flush();
  f.click('navigation');
  const drawer = f.body.children.find(node => node.id === 'studio-navigation');
  assert.equal(drawer.open, true);
  for (const html of [f.nodes.get('studio-rail').innerHTML, f.nodes.get('studio-topbar').innerHTML, drawer.innerHTML]) {
    assert.doesNotMatch(html, /ce-creator-link|游戏创作|127\.0\.0\.1:8770/);
    assert.equal((html.match(/href="#news"/g) || []).length, 1);
    assert.equal((html.match(/href="#settings\/account"/g) || []).length, 1);
  }
  f.nodes.get('ce-studio').listeners.click({ target: { closest: () => null } });
  assert.equal(f.location.hash, '#home'); assert.equal(f.editorMounts(), 0);
  f.click('theme'); assert.equal(f.nodes.get('ce-studio').dataset.theme, 'dark');
  assert.equal(f.editorMounts(), 0);
});

test('retired creator addresses are neither consumed nor changed in local and remote Studio', async () => {
  for (const remote of [false, true]) for (const unified of [false, true]) {
    for (const savedCreatorUrl of [null, 'https://creator.example.test/workbench/', 'https://example.test/#synthetic-creator-secret']) {
      const f = studioFixture({ remote, unified, savedCreatorUrl }); await f.flush();
      f.click('navigation');
      const drawer = f.body.children.find(node => node.id === 'studio-navigation');
      for (const html of [f.nodes.get('studio-rail').innerHTML, f.nodes.get('studio-topbar').innerHTML, drawer.innerHTML]) {
        assert.doesNotMatch(html, /游戏创作|ce-creator-link|127\.0\.0\.1:8770|creator\.example\.test|synthetic-creator-secret/);
        assert.equal((html.match(/href="#news"/g) || []).length, 1);
        assert.equal((html.match(/href="#settings\/account"/g) || []).length, 1);
      }
      assert.ok(!f.storageReads.includes('ce-studio-creator-url'));
      assert.deepEqual(f.writes, []); assert.deepEqual(f.removed, []);
      f.dispose();
    }
  }
});

test('retired advanced deep links cannot restore management controls', async () => {
  for (const remote of [false, true]) {
    const f = studioFixture({ remote, savedCreatorUrl: 'https://creator.example.test/' }); await f.flush();
    for (const route of ['tools', 'settings/sources']) {
      await f.route(route);
      assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /游戏创作|data-creator|studio-creator|ce-creator-address|creator\.example\.test/);
      assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /workspace-admin|external-access|高级接入/);
    }
    assert.equal((f.nodes.get('studio-content').innerHTML.match(/data-action="external-access"/g) || []).length, 0);
    assert.equal(f.nodes.get('ce-studio').listeners.submit, undefined);
    assert.ok(!f.storageReads.includes('ce-studio-creator-url'));
    assert.deepEqual(f.writes, []); assert.deepEqual(f.removed, []);
    f.dispose();
  }
});

test('unified project opens as a view action and retains the overview until the native surface takes over', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  assert.match(f.nodes.get('studio-content').innerHTML, /<a[^>]+class="ce-project-title-link"[^>]+href="#project\/server-project\/workspace"[^>]+data-open-project="server-project"/);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /尚无事项记录/);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /打开开发|ce-development-shortcut/);
  assert.equal(f.nodes.get('ce-studio').dataset.theme, 'dark');
  const overview = f.nodes.get('studio-content').innerHTML;
  assert.equal(f.openProject('server-project'), true);
  assert.equal(f.location.pathname, '/studio');
  assert.equal(f.location.hash, '#project/server-project/workspace');
  assert.equal(f.editorMounts(), 0);
  f.location.search = '?project_id=server-project';
  await f.route('');
  assert.equal(f.nodes.get('ce-studio').dataset.projectSurface, 'false');
  assert.equal(f.nodes.get('studio-content').innerHTML, overview);
  assert.equal(f.boardProjects.length, 0);
});

test('project title always enters workspace even when review is pending', () => {
  const context = vm.createContext({ window: {}, document: { getElementById() {} } });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.js'), 'utf8'), context);
  assert.equal(context.window.StudioPreview.projectEntryTab([{ state: 'doing' }, { state: 'review' }]), 'workspace');
  assert.equal(context.window.StudioPreview.projectEntryTab([{ state: 'doing', title: '继续' }]), 'workspace');
  assert.equal(context.window.StudioPreview.projectEntryTab([]), 'workspace');
});

test('overview filters default to normal and explicit all and archive remain in memory', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  f.snapshot.workspace.projects.items.push({ id: 'alpha', name: 'Alpha', updated_at: '2026-10-21T10:00:00Z' }, { id: 'zeta', name: 'Zeta', updated_at: '2026-10-23T10:00:00Z' }, { id: 'old', name: 'Archived', archived: true });
  f.snapshot.items.push({ id: 'a', project_id: 'alpha', state: 'doing', updated_at: '2026-10-21T10:00:00Z' },
    { id: 'z', project_id: 'zeta', state: 'review', updated_at: '2026-10-23T10:00:00Z' });
  await f.route('home');
  let reads = 0; const read = f.client.snapshot; f.client.snapshot = async () => { reads++; return read(); };
  const html = () => f.nodes.get('studio-content').innerHTML;
  assert.ok(html().indexOf('data-project-card="zeta"') < html().indexOf('data-project-card="alpha"'));
  assert.doesNotMatch(html(), /data-project-card="old"|attention-projects/);
  f.sort('name'); assert.ok(html().indexOf('data-project-card="alpha"') < html().indexOf('data-project-card="zeta"'));
  f.click('all-projects'); assert.match(html(), /data-project-card="old"/); assert.match(html(), /data-project-card="alpha"/);
  f.search('missing'); assert.match(html(), /没有匹配的项目/); assert.match(html(), /data-action="clear-project-filters"/);
  f.click('clear-project-filters'); assert.match(html(), /data-project-card="alpha"/); assert.doesNotMatch(html(), /data-project-card="old"/);
  f.search('  ALPHA  '); assert.match(html(), /data-project-card="alpha"/); assert.doesNotMatch(html(), /data-project-card="zeta"/);
  f.click('clear-project-filters'); f.click('archived-projects');
  assert.match(html(), /data-project-card="old"/); assert.doesNotMatch(html(), /data-project-card="alpha"/);
  assert.match(html(), /href="#project\/old\/workspace"/);
  f.click('active-projects'); assert.doesNotMatch(html(), /data-project-card="old"/);
  assert.equal(reads, 0);
});


test('native project requests keep the existing page and never load a replacement form', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  let opens = 0, fetches = 0;
  f.window.addEventListener('platform-open-add-repo', () => { opens++; });
  f.window.fetch = async () => { fetches++; throw new Error('replacement form forbidden'); };
  for (const page of ['workbench', 'project/server-project/workspace', 'project/server-project/activity']) {
    await f.route(page);
    f.callbacks['platform-add-project'](); await f.flush();
    assert.equal(f.location.hash, '#' + page);
    assert.equal(f.dialog.open, false);
  }
  assert.equal(opens, 3); assert.equal(fetches, 0); assert.equal(f.onboarding(), undefined);
  f.dispose();
});


test('native adoption waits for a published active project without navigating or writing again', async () => {
  const f = studioFixture({ unified: true }); await f.flush(); await f.route('workbench');
  f.snapshot.workspace.projects.items.push({ id: 'new-project', name: 'New' });
  const waits = [];
  f.callbacks['platform-native-project-adopted']({ detail: { projectId: 'new-project', waitUntil: value => waits.push(value) } });
  assert.equal(waits.length, 1); assert.equal(await waits[0], true);
  assert.ok(f.projectSnapshots.at(-1).rows.some(project => project.id === 'new-project'));
  assert.equal(f.location.hash, '#workbench'); assert.equal(f.posts.length, 0);
  f.dispose();
});

test('retired native manage events cannot redirect an unregistered directory or open another form', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  await f.route('project/server-project/workspace');
  f.window.dispatchEvent({ type: 'platform-manage-project', detail: { directory: 'C:/example/unregistered' } });
  assert.equal(f.location.hash, '#project/server-project/workspace');
  assert.equal(f.elements.some(node => node.tagName === 'dialog' && node.open), false);
  assert.equal(f.posts.length, 0);
});

test('retired outer project management hooks cannot open a form or save project fields', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  f.manage('server-project');
  f.window.dispatchEvent({ type: 'platform-manage-project', detail: { directory: 'C:/example/fixture' } });
  assert.equal(f.elements.some(node => node.tagName === 'dialog' && node.className === 'ce-project-settings'), false);
  assert.equal(f.posts.length, 0);
  assert.equal(f.location.hash, '#home');
});

test('archived task views show a recovery state without exposing active task actions', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  f.snapshot.workspace.projects.items[0].archived = true;
  await f.route('project/server-project/review');
  assert.equal(f.boardProjects.length, 0);
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

test('quiet refresh pauses in development and hidden documents, then rechecks stale data on return', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  await f.route('project/server-project/workspace');
  assert.equal(f.boardProjects.length, 0); assert.equal(f.timers.size, 0);
  await f.advance(16000); assert.equal(f.snapshotReads.length, 1);
  await f.route('home'); assert.equal(f.snapshotReads.length, 2);
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
  await f.route('project/server-project/tasks'); assert.equal(f.boardSnapshots.length, 0); f.dispose();
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

test('drawer links close before routing and retired project forms cannot be opened', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  const drawer = f.elements.find(node => node.id === 'studio-navigation');
  f.click('navigation');
  f.nodes.get('ce-studio').listeners.click({ target: { closest: selector => selector === 'a[href]' ? { href: '#mobile' } : null } });
  assert.equal(drawer.open, false); assert.equal(f.scrollHost.style.overflow, 'auto');
  f.manage('server-project');
  assert.equal(f.elements.some(node => node.className === 'ce-project-settings'), false);
  assert.equal(f.posts.length, 0);
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


test('first-level project requests enter the native workbench and delegate to its existing dialog', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  let opens = 0; f.window.addEventListener('platform-open-add-repo', () => { opens++; });
  f.callbacks['platform-add-project'](); await f.flush();
  assert.equal(f.location.hash, '#workbench'); assert.equal(opens, 0);
  await f.route('workbench');
  f.callbacks['platform-add-project'](); await f.flush();
  assert.equal(opens, 1); assert.equal(f.dialog.open, false);
  assert.doesNotMatch(f.nodes.get('studio-content').innerHTML, /data-action="open-project-dialog"|项目配置/);
  f.dispose();
});


test('native adoption refuses missing or archived catalog entries and permits a read-only retry', async () => {
  const f = studioFixture({ unified: true }); await f.flush(); await f.route('workbench');
  const adopt = async () => {
    const waits = [];
    f.callbacks['platform-native-project-adopted']({ detail: { projectId: 'new-project', waitUntil: value => waits.push(value) } });
    return waits[0];
  };
  assert.equal(await adopt(), false);
  const project = { id: 'new-project', name: 'New', archived: true };
  f.snapshot.workspace.projects.items.push(project);
  assert.equal(await adopt(), false);
  project.archived = false; f.fail(); assert.equal(await adopt(), false);
  f.recover(); assert.equal(await adopt(), true);
  assert.equal(f.posts.length, 0); assert.equal(f.location.hash, '#workbench');
  f.dispose();
});


test('native adoption waits through an older in-flight read before confirming the new project', async () => {
  const f = studioFixture({ unified: true }); await f.flush(); await f.route('workbench');
  const old = JSON.parse(JSON.stringify(f.snapshot));
  const resolvers = [];
  f.client.snapshot = () => new Promise(resolve => resolvers.push(resolve));
  f.click('refresh'); await f.flush();
  const waits = [];
  f.callbacks['platform-native-project-adopted']({ detail: { projectId: 'new-project', waitUntil: value => waits.push(value) } });
  let confirmed = false; waits[0].then(() => { confirmed = true; });
  resolvers[0](old); await f.flush();
  assert.equal(resolvers.length, 2); assert.equal(confirmed, false);
  f.snapshot.workspace.projects.items.push({ id: 'new-project', name: 'New' });
  resolvers[1](f.snapshot);
  assert.equal(await waits[0], true); assert.equal(f.posts.length, 0);
  f.dispose();
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


test('late native adoption does not replace a later accepted page or confirm after disposal', async () => {
  const f = studioFixture({ unified: true }); await f.flush(); await f.route('workbench');
  let resolve;
  f.client.snapshot = () => new Promise(done => { resolve = done; });
  const waits = [];
  f.callbacks['platform-native-project-adopted']({ detail: { projectId: 'new-project', waitUntil: value => waits.push(value) } });
  await f.route('settings/sources');
  f.snapshot.workspace.projects.items.push({ id: 'new-project', name: 'New' });
  resolve(f.snapshot); assert.equal(await waits[0], true);
  assert.equal(f.location.hash, '#settings/sources');
  f.callbacks['platform-native-project-adopted']({ detail: { projectId: 'new-project', waitUntil: value => waits.push(value) } });
  f.dispose(); resolve(f.snapshot); assert.equal(await waits[1], false);
  assert.equal(f.callbacks['platform-native-project-adopted'], undefined);
});

test('native adoption ignores malformed and standalone events', async () => {
  for (const unified of [true, false]) {
    const f = studioFixture({ unified }); await f.flush();
    const reads = f.snapshotReads.length, waits = [];
    for (const detail of [undefined, {}, { projectId: '../outside', waitUntil: value => waits.push(value) },
      ...(unified ? [] : [{ projectId: 'server-project', waitUntil: value => waits.push(value) }])]) {
      f.callbacks['platform-native-project-adopted']({ detail });
    }
    assert.equal(waits.length, 0); assert.equal(f.snapshotReads.length, reads);
    f.dispose();
  }
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

function projectAction(f, action, changes = {}) {
  const controller = new AbortController(), waits = [];
  f.callbacks['platform-native-project-action']({ detail: {
    action, repoId: 'native-repo', directory: 'C:/example/fixture', executionHostId: 'runtime:owned-environment',
    signal: controller.signal, waitUntil: value => waits.push(value), ...changes
  } });
  return { controller, result: waits[0] };
}

test('native name edits preserve the complete registered project and confirm after its native echo', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  const row = f.snapshot.workspace.projects.items[0];
  row.directories.push({ id: 'assets', path: 'C:/example/assets' }); row.source = { kind: 'none' };
  const edit = projectAction(f, 'rename', { name: 'Renamed' });
  const confirm = await edit.result;
  assert.equal(typeof confirm, 'function'); assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].value.id, row.id); assert.equal(f.posts[0].value.name, 'Renamed');
  assert.deepEqual(Array.from(f.posts[0].value.directories, entry => entry.id), ['main', 'assets']);
  assert.equal(f.posts[0].value.archived, false); assert.equal(f.posts[0].value.source.kind, 'none');
  assert.equal(f.posts[0].value.expected.name, '<Real project>');
  assert.equal(f.posts[0].value.expected.archived, false);
  assert.equal(f.posts[0].value.expected.directories.length, 2);
  const other = projectAction(f, 'archive');
  await assert.rejects(other.result, /项目正在保存/); assert.equal(f.posts.length, 1);
  row.name = 'Renamed'; await confirm(); edit.controller.abort();
  const archive = projectAction(f, 'archive'); row.archived = true;
  await archive.result; archive.controller.abort();
  assert.equal(f.posts.length, 2); assert.equal(f.posts[1].value.name, 'Renamed');
  assert.equal(f.posts[1].value.archived, true); assert.equal(f.location.hash, '#home');
  f.dispose();
});

test('native project actions reject wrong hosts, stale context, ambiguous and read-only directories before a write', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  const row = f.snapshot.workspace.projects.items[0];
  await assert.rejects(projectAction(f, 'archive', { executionHostId: 'runtime:foreign' }).result, /电脑已变化/);
  row.read_only = true; await assert.rejects(projectAction(f, 'archive').result, /登记已变化/); delete row.read_only;
  f.snapshot.workspace.projects.items.push({ ...row, id: 'duplicate' });
  await assert.rejects(projectAction(f, 'archive').result, /登记已变化/); f.snapshot.workspace.projects.items.pop();
  await assert.rejects(projectAction(f, 'rename', { name: ' ' }).result, /1 至 80/);
  assert.equal(f.posts.length, 0);
  let resolve;
  f.client.post = () => new Promise(done => { resolve = done; });
  const late = projectAction(f, 'rename', { name: 'Late' });
  f.setRuntimeHost('runtime:another'); resolve({ status: 'ok', project: { id: row.id } });
  await assert.rejects(late.result, /电脑已变化/); late.controller.abort();
  f.dispose();
});

test('failed and cancelled native project actions release their exact busy owner without replaying writes', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  const row = f.snapshot.workspace.projects.items[0];
  const first = projectAction(f, 'rename', { name: 'First' }); await first.result; first.controller.abort();
  const second = projectAction(f, 'rename', { name: 'Second' }); const confirm = await second.result;
  first.controller.abort();
  await assert.rejects(projectAction(f, 'archive').result, /正在保存/);
  row.name = 'Second'; f.fail(); await assert.rejects(confirm(), /列表尚未确认/);
  second.controller.abort(); f.recover();
  const third = projectAction(f, 'rename', { name: 'Third' }); const finalConfirm = await third.result;
  row.name = 'Third'; await finalConfirm(); third.controller.abort();
  assert.equal(f.posts.length, 3); f.dispose();
});

test('native project conflicts preserve the current input and never retry an old save', async () => {
  const f = studioFixture({ unified: true }); await f.flush();
  let writes = 0;
  f.client.post = async () => { writes++; throw Object.assign(new Error('project changed'), { reason: 'project_changed' }); };
  const edit = projectAction(f, 'rename', { name: 'Retained input' });
  await assert.rejects(edit.result, error => error.reason === 'project_changed');
  edit.controller.abort(); assert.equal(writes, 1);
  assert.equal(f.snapshot.workspace.projects.items[0].name, '<Real project>');
  assert.equal(f.location.hash, '#home'); f.dispose();
});

test('a failed first read shows one error panel with a retry that recovers, and loading shows a skeleton', async () => {
  const f = studioFixture({ initialUrl: 'http://example.test/studio#home', initialFailure: 'snapshot' });
  const content = () => f.nodes.get('studio-content').innerHTML;
  assert.match(content(), /ce-skeleton/);
  await f.flush();
  assert.match(content(), /role="alert"[^>]*>.*无法读取项目/s);
  assert.match(content(), /data-action="refresh"[^>]*>重试</);
  assert.doesNotMatch(content(), /草稿保留|ce-skeleton/);
  assert.equal(f.nodes.get('studio-status').hidden, true, 'the banner must not repeat the panel');
  f.recover(); f.click('refresh');
  assert.match(content(), /ce-skeleton/, 'retrying shows loading again');
  await f.flush();
  assert.doesNotMatch(content(), /无法读取项目|ce-skeleton/);
});

test('the project workspace explains a missing engine and an unknown project offers a way back', async () => {
  const f = studioFixture({ initialUrl: 'http://example.test/studio#project/server-project/workspace' });
  await f.flush();
  const html = f.nodes.get('studio-content').innerHTML;
  assert.match(html, /项目运行组件未连接/);
  assert.doesNotMatch(html, /查看项目进展|\/tasks/);
  assert.match(html, /href="#home">返回项目总览/);
  await f.route('project/missing/workspace');
  assert.match(f.nodes.get('studio-content').innerHTML, /未找到这个项目.*href="#home"/s);
  assert.match(f.nodes.get('studio-topbar').innerHTML, /未找到项目/);
});

test('settings and account have no cross-page section switcher', async () => {
  const f = studioFixture({ initialUrl: 'http://127.0.0.1:8772/studio#settings/sources' }); await f.flush();
  const nav = f.nodes.get('studio-settings-nav');
  assert.equal(nav.innerHTML, '');
  await f.route('home');
  assert.equal(nav.innerHTML, '');
  await f.route('settings/account');
  assert.equal(nav.innerHTML, '');
});
test('the page opens with a skip link that moves focus into the main region', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.html'), 'utf8');
  assert.match(html, /<section id="ce-studio"[^>]*>\s*<button type="button" class="ce-skip" data-action="skip-to-content">/);
  assert.match(html, /<main class="ce-content"[^>]*tabindex="-1"/);
  assert.match(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.js'), 'utf8'), /skip-to-content'\) root\.querySelector\('main\.ce-content'\)\?\.focus\(\)/);
});

test('Studio snapshot reads only project catalog and rejects unavailable catalogs', async () => {
  const f = fixture(url => {
    assert.equal(url, '/api/workspace');
    return {body:{projects:{status:'available',items:[]}}};
  });
  const snapshot = await f.client.snapshot();
  assert.deepEqual(Object.keys(snapshot), ['workspace']);
  assert.equal(f.calls.length, 1);
  const failed = fixture(() => ({body:{projects:{status:'unavailable',items:[]}}}));
  await assert.rejects(failed.client.snapshot(), error => error.reason === 'workspace_unavailable');
});
