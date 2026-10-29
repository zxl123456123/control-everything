// Real ordinary modules in a local DOM; every request is synthetic and intercepted.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const root = path.resolve(__dirname, '../..');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 10)); for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
const uuid = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
async function fixture(t, { hash = '#home', unified = false, writable = true, taskModule = true, progressModule = true, registration = false, remote = false } = {}) {
  const { Window } = await import(pathToFileURL(path.join(root, 'web/workbench-engine/node_modules/happy-dom/lib/index.js')).href);
  const { default: HistoryItemList } = await import(pathToFileURL(path.join(root, 'web/workbench-engine/node_modules/happy-dom/lib/history/HistoryItemList.js')).href);
  // This pinned DOM truncates forward entries in replace(). Browser replaceState keeps them.
  // Correct only that simulator operation; product listeners and back()/forward() stay real.
  HistoryItemList.prototype.replace = function (item) {
    const index = this.items.indexOf(this.currentItem);
    if (index < 0) throw new Error('Current history item not found');
    this.currentItem = item; this.items[index] = item;
  };
  const w = new Window({ url: 'http://fixture.test/studio' + hash, settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const projects = ['p-a', 'p-b', 'p-old'].map((id, i) => ({ id, name: i === 2 ? '归档' : '同名项目', archived: i === 2, source: { kind: 'none', directory_id: null, relative_path: null }, directories: [{ id: 'main', path: 'C:/example/' + id }] }));
  const items = [
    { id: uuid(1), project_id: 'p-a', title: 'A 正在推进', state: 'doing' },
    { id: uuid(2), project_id: 'p-a', title: 'A 待推进', state: 'todo' },
    { id: uuid(3), project_id: 'p-b', title: 'B 正在推进', state: 'doing' },
    { id: uuid(4), project_id: 'p-old', title: '归档事项', state: 'review' },
    { id: uuid(5), project_id: null, title: '全局事项', state: 'todo' },
    { id: uuid(6), project_id: 'p-gone', title: '移出事项', state: 'todo' }
  ].map(item => ({ origin: 'task', revision: 1, assignment_state: 'unassigned', provider_id: null, session_key: null, ...item }));
  const reads = [], posts = [], creates = [], adapters = [], registrations = [];
  let revision = 1, failRead = false, failWrite = false, pendingRead = null;
  let pendingProjectSave = null, projectFailure = '', failWorkspaceRead = false;
  const projectFields = project => ({ name: project.name, archived: Boolean(project.archived),
    directories: project.directories.map(row => ({ id: row.id, path: row.path })), source: project.source });
  function page(query) {
    let rows = items.filter(item => !query.get('project_id') || item.project_id === query.get('project_id'));
    const scope = query.get('scope');
    if (scope === 'global') rows = rows.filter(item => !item.project_id);
    if (scope === 'archived') rows = rows.filter(item => projects.some(p => p.id === item.project_id && p.archived));
    if (scope === 'orphan') rows = rows.filter(item => item.project_id && !projects.some(p => p.id === item.project_id));
    if (scope === 'active') rows = rows.filter(item => projects.some(p => p.id === item.project_id && !p.archived));
    if (scope === 'attention') rows = rows.filter(item => ['blocked', 'review'].includes(item.state));
    if (query.get('state')) rows = rows.filter(item => item.state === query.get('state'));
    const offset = Number(query.get('offset') || 0), limit = Number(query.get('limit') || 50);
    return clone({ items: rows.slice(offset, offset + limit), total: rows.length, offset, limit, list_revision: revision });
  }
  const workspace = () => ({ projects: { status: 'available', items: clone(projects) }, sessions: { available: true, items: [] }, codex_desktop: { status: 'available' }, items_page: page(new URLSearchParams()) });
  w.fetch = async (url, options = {}) => {
    const u = new URL(url, w.location.href), route = u.pathname; reads.push(route + u.search);
    if (route === '/workspace-admin') return { ok: true, text: async () => fs.readFileSync(path.join(root, 'web/workspace/workspace.html'), 'utf8') };
    let body;
    if (options.method === 'POST') {
      const payload = JSON.parse(options.body); posts.push({ route, payload });
      if (failWrite) return { ok: false, status: 409, json: async () => ({ reason: 'item_changed' }) };
      if (route === '/api/workspace/projects/save') {
        if (pendingProjectSave) await pendingProjectSave;
        const project = projects.find(row => row.id === payload.id);
        const reason = projectFailure || (!project ? 'not_found' : project.read_only || project.source.kind === 'codex' ? 'invalid_project'
          : !isDeepStrictEqual(payload.expected, projectFields(project)) ? 'project_changed' : '');
        if (reason) return { ok: false, status: reason === 'not_found' ? 404 : 409, json: async () => ({ reason }) };
        assert.deepEqual(Object.keys(payload).sort(), ['archived', 'directories', 'expected', 'id', 'name', 'source']);
        assert.deepEqual({ ...payload.expected, archived: payload.archived }, { ...projectFields(project), archived: payload.archived });
        Object.assign(project, clone({ name: payload.name, archived: payload.archived, directories: payload.directories, source: payload.source }));
        revision++; body = { status: 'ok', project: clone(project) };
      } else {
        if (route !== '/api/workspace/items/update') throw new Error('Unexpected POST ' + route);
        const item = items.find(item => item.id === payload.id);
        const target = payload.changes.project_id;
        if (target && !projects.some(p => p.id === target && !p.archived)) return { ok: false, status: 400, json: async () => ({ reason: 'invalid_item' }) };
        assert.equal(payload.expected_revision, item.revision);
        Object.assign(item, payload.changes); item.revision++; revision++; body = { item: clone(item) };
      }
    } else if (route === '/api/bootstrap') body = { capabilities: { profile: true }, csrf_token: writable ? 'fixture-only' : '' };
    else if (route === '/api/workspace') { if (failWorkspaceRead) throw new Error('fixture workspace offline'); body = workspace(); }
    else if (route === '/api/workspace/agents') body = { revision: 0, items: [], tokens: {} };
    else if (route === '/api/workspace/items') {
      if (pendingRead && u.searchParams.get('limit') === '50') return pendingRead.promise;
      if (failRead) throw new Error('fixture read failed'); body = page(u.searchParams);
    } else if (route.includes('/agent-tasks/')) body = { item: clone(items.find(item => item.id === decodeURIComponent(route.split('/').at(-1)))), run: null, events: [], review_material: { sessions: [] } };
    else if (route.endsWith('/progress')) body = { item: clone(items.find(item => item.id === decodeURIComponent(route.split('/').at(-2)))), native_run: null, capabilities: {}, messages: [] };
    else throw new Error('Unexpected GET ' + route);
    return { ok: true, status: 200, json: async () => body };
  };
  if (remote) {
    let active = true; const listeners = new Set();
    w.CERemoteContext = { context: 'fixture-remote', get active() { return active; },
      assertActive() { if (!active) throw new Error('remote_context_inactive'); },
      fetchWith(raw, url, options) { this.assertActive(); return raw(url, options); },
      onInactive(callback) { listeners.add(callback); return () => listeners.delete(callback); },
      invalidate() { active = false; for (const callback of [...listeners]) callback(); }
    };
  }
  const html = fs.readFileSync(path.join(root, 'web/workspace/studio-preview.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '');
  w.document.write(html);
  const host = w.document.getElementById('ce-studio'); host.id = 'mount-later';
  if (unified) host.dataset.unified = 'true';
  const modules = [...(progressModule ? ['project-progress-model.js', 'project-progress.js'] : []), 'project-space.js', 'agents.js', ...(taskModule ? ['task-center.js'] : []), 'studio-data.js', 'studio-shell.js', 'studio-preview.js'];
  for (const name of modules) w.eval(fs.readFileSync(path.join(root, 'web/workspace', name), 'utf8'));
  if (registration) w.WorkspaceOnboarding = { create: options => {
    registrations.push(options);
    return { open: async () => options.dialog.showModal() };
  } };
  for (const [name, module] of [['progress', w.ProjectProgress], ['board', w.WorkspaceAgentBoard], ['items', w.WorkspaceTaskCenter]]) if (module) {
    const create = module.create;
    module.create = options => { creates.push({ name, options }); const api = create(options); adapters.push({ name, api }); return api; };
  }
  host.id = 'ce-studio';
  const dispose = w.StudioPreview.mount(host);
  t.after(() => { dispose(); w.happyDOM.abort(); w.close(); });
  await tick();
  const node = selector => { const value = host.querySelector(selector); assert.ok(value, selector); return value; };
  const change = (selector, value) => { const input = node(selector); input.value = value; input.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const input = (selector, value) => { const field = node(selector); field.value = value; field.dispatchEvent(new w.Event('input', { bubbles: true })); };
  async function route(hash) {
    if (unified) { const from = w.location.hash; w.history.pushState(null, '', hash); w.dispatchEvent(new w.CustomEvent('platform-navigation-accepted', { detail: { from, to: hash } })); }
    else w.location.hash = hash;
    await tick();
  }
  return { w, host, reads, posts, creates, adapters, registrations, items, projects, node, change, input, route,
    failRead(value) { failRead = value; }, failWrite(value) { failWrite = value; },
    projectFields, failProject(reason) { projectFailure = reason; }, failWorkspace(value) { failWorkspaceRead = value; },
    deferProjectSave() { let release; pendingProjectSave = new Promise(resolve => { release = resolve; }); return () => { const done = release; pendingProjectSave = null; done(); }; },
    deferRead() { let resolve; const promise = new Promise(r => resolve = r); pendingRead = { promise, resolve }; return value => { pendingRead = null; resolve({ ok: true, json: async () => value }); }; } };
}

function archiveMenu(f, id) {
  const trigger = f.node(`[data-project-menu="${id}"]`); trigger.click();
  const menu = f.w.document.querySelector('[role="menu"]')
    || f.w.document.querySelector('.platform-project-dialog-host')?.shadowRoot.querySelector('[role="menu"]');
  assert.ok(menu, 'visible project menu');
  const actions = [...menu.querySelectorAll('[role="menuitem"]')];
  assert.equal(actions.length, 1, 'overview only offers archive or restore');
  const action = actions[0];
  assert.equal(action.tagName, 'BUTTON'); assert.equal(action.dataset.projectArchive, id);
  assert.ok(action.querySelector('svg')); assert.equal(menu.querySelector('a'), null);
  assert.doesNotMatch(menu.textContent, /项目信息|项目管理|项目设置|项目进展/);
  return { trigger, menu, action };
}
const overviewIds = f => [...f.host.querySelectorAll('[data-project-card]')].map(node => node.dataset.projectCard).sort();

test('catalog clearing while search is focused leaves a valid empty overview without an error', async t => {
  const f = await fixture(t);
  f.node('#studio-project-search').focus();
  f.projects.length = 0;
  f.node('[data-action="refresh"]').click();
  await tick();
  assert.equal(f.host.querySelector('#studio-project-search'), null);
  assert.equal(f.w.document.activeElement, f.node('h1'));
  assert.equal(f.node('#studio-status').classList.contains('error'), false, f.node('#studio-status').textContent);
  assert.ok(f.host.querySelector('a[href="#workbench"]'));
  assert.equal(f.posts.length, 0);
});

test('overview defaults to normal and explicit all and archived filters do not read or toggle scope', async t => {
  const f = await fixture(t);
  assert.deepEqual(overviewIds(f), ['p-a', 'p-b']);
  assert.equal(f.node('[data-action="active-projects"]').getAttribute('aria-pressed'), 'true');
  assert.equal(f.host.querySelector('[data-action="attention-projects"]'), null);
  const before = f.reads.length;
  f.node('[data-action="all-projects"]').click(); assert.deepEqual(overviewIds(f), ['p-a', 'p-b', 'p-old']);
  f.node('[data-action="archived-projects"]').click(); assert.deepEqual(overviewIds(f), ['p-old']);
  f.node('[data-action="archived-projects"]').click(); assert.deepEqual(overviewIds(f), ['p-old']);
  f.node('[data-action="active-projects"]').click(); assert.deepEqual(overviewIds(f), ['p-a', 'p-b']);
  assert.equal(f.reads.length, before); assert.equal(f.posts.length, 0);
});

for (const unified of [false, true]) test(`archive and restore save original fields with CAS and leave the current filtered list (unified=${unified})`, async t => {
  const f = await fixture(t, { unified }), original = clone(f.projects[0]);
  const { action } = archiveMenu(f, original.id); assert.match(action.textContent, /归档项目/);
  action.click(); await tick();
  assert.equal(f.posts.length, 1);
  assert.deepEqual(f.posts[0], { route: '/api/workspace/projects/save', payload: {
    id: original.id, ...f.projectFields(original), archived: true, expected: f.projectFields(original)
  } });
  assert.deepEqual(overviewIds(f), ['p-b']); assert.equal(f.w.location.hash, '#home');
  assert.equal(f.node('.ce-summary-metrics dd').textContent, '1');
  assert.equal(f.w.document.activeElement, f.node('h1'), 'removed project focus falls back to the overview heading');
  f.node('[data-action="archived-projects"]').click(); assert.deepEqual(overviewIds(f), ['p-a', 'p-old']);
  const restored = archiveMenu(f, 'p-a'); assert.match(restored.action.textContent, /恢复项目/);
  restored.action.click(); await tick();
  assert.equal(f.posts.length, 2); assert.equal(f.posts[1].payload.archived, false);
  assert.equal(f.posts[1].payload.name, original.name); assert.equal(f.posts[1].payload.expected.archived, true);
  assert.deepEqual(overviewIds(f), ['p-old']);
  f.node('[data-action="active-projects"]').click(); assert.deepEqual(overviewIds(f), ['p-a', 'p-b']);
  assert.equal(f.w.document.querySelector('.ce-project-settings'), null);
});

test('pending archive is busy and double activation never sends another write or removes an unconfirmed card', async t => {
  const f = await fixture(t), release = f.deferProjectSave(), { action } = archiveMenu(f, 'p-a');
  action.click(); action.click(); await tick();
  assert.equal(action.disabled, true); assert.equal(action.getAttribute('aria-busy'), 'true'); assert.match(action.textContent, /正在归档/);
  assert.equal(f.posts.length, 1); assert.deepEqual(overviewIds(f), ['p-a', 'p-b']);
  release(); await tick(); assert.deepEqual(overviewIds(f), ['p-b']); assert.equal(f.posts.length, 1);
});

for (const reason of ['project_changed', 'native_managed_project']) test(`archive ${reason} keeps its record and reports a real failure without replay`, async t => {
  const f = await fixture(t); f.failProject(reason); archiveMenu(f, 'p-a').action.click(); await tick();
  assert.deepEqual(overviewIds(f), ['p-a', 'p-b']); assert.equal(f.projects[0].archived, false); assert.equal(f.posts.length, 1);
  assert.ok(f.node('#studio-status').textContent.trim()); assert.equal(f.node('#studio-status').classList.contains('error'), true);
  assert.equal(f.w.document.querySelector('.ce-project-settings'), null); await tick(); assert.equal(f.posts.length, 1);
});

test('another window rename makes a pending archive conflict instead of restoring the old name', async t => {
  const f = await fixture(t), release = f.deferProjectSave(); archiveMenu(f, 'p-a').action.click(); await tick();
  f.projects[0].name = '另一窗口已保存'; release(); await tick();
  assert.equal(f.posts.length, 1); assert.equal(f.posts[0].payload.expected.name, '同名项目');
  assert.equal(f.projects[0].name, '另一窗口已保存'); assert.equal(f.projects[0].archived, false);
  assert.deepEqual(overviewIds(f), ['p-a', 'p-b']); assert.match(f.node('#studio-status').textContent, /其他窗口|重新读取|变化/);
});

test('restore directory conflicts keep the archived record and explicit error', async t => {
  const f = await fixture(t); f.node('[data-action="archived-projects"]').click(); f.failProject('directory_conflict');
  archiveMenu(f, 'p-old').action.click(); await tick();
  assert.equal(f.posts.length, 1); assert.equal(f.posts[0].payload.archived, false);
  assert.equal(f.projects[2].archived, true); assert.deepEqual(overviewIds(f), ['p-old']);
  assert.ok(f.node('#studio-status').textContent.trim()); assert.equal(f.node('#studio-status').classList.contains('error'), true);
});

test('saved archive with failed confirmation keeps the old list and recovers by GET without another POST', async t => {
  const f = await fixture(t); f.failWorkspace(true); archiveMenu(f, 'p-a').action.click(); await tick();
  assert.equal(f.projects[0].archived, true); assert.deepEqual(overviewIds(f), ['p-a', 'p-b']);
  assert.match(f.node('#studio-status').textContent, /已保存.*(?:列表|读取|确认)/); assert.equal(f.posts.length, 1);
  f.failWorkspace(false); f.node('[data-action="refresh"]').click(); await tick();
  assert.deepEqual(overviewIds(f), ['p-b']); assert.equal(f.posts.length, 1);
});

test('read-only, Codex and missing write capability expose no fake archive menu', async t => {
  const f = await fixture(t); f.projects[0].read_only = true; f.projects[1].source.kind = 'codex';
  f.node('[data-action="refresh"]').click(); await tick();
  assert.deepEqual(overviewIds(f), ['p-a', 'p-b']); assert.equal(f.host.querySelector('[data-project-menu]'), null); assert.equal(f.posts.length, 0);
  const readonly = await fixture(t, { writable: false }); assert.equal(readonly.host.querySelector('[data-project-menu]'), null); assert.equal(readonly.posts.length, 0);
});

test('remote retirement during a pending archive rejects late publication and never replays', async t => {
  const f = await fixture(t, { remote: true }), release = f.deferProjectSave(); archiveMenu(f, 'p-a').action.click(); await tick();
  const reads = f.reads.length; f.w.CERemoteContext.invalidate();
  const html = f.node('#studio-content').innerHTML; release(); await tick();
  assert.equal(f.posts.length, 1); assert.equal(f.reads.length, reads); assert.equal(f.node('#studio-content').innerHTML, html);
  assert.equal(f.w.location.hash, '#home'); assert.equal(f.w.document.querySelector('[role="menu"]'), null);
});

test('archive menu keyboard focus returns to the trigger on Escape without writing', async t => {
  const f = await fixture(t), { trigger, menu, action } = archiveMenu(f, 'p-a');
  assert.equal(f.w.document.activeElement, action); assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  action.dispatchEvent(new f.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(menu.isConnected, false); assert.equal(f.w.document.activeElement, trigger);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false'); assert.equal(f.posts.length, 0);
});

test('normal and archived cards retain distinct colors and equal title size in cards and list for both themes', async t => {
  const f = await fixture(t, { unified: true });
  const sheets = ['workspace.css', 'project-progress.css', 'project-monitor.css', 'studio-preview.css'].map(name => ({
    text: fs.readFileSync(path.join(root, 'web/workspace', name), 'utf8'), style: f.w.document.createElement('style')
  }));
  for (const sheet of sheets) f.w.document.head.append(sheet.style);
  const rgb = value => {
    if (/^#[a-f0-9]{6}$/i.test(value)) return [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
    const match = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/); assert.ok(match, `computed color ${value}`); return match.slice(1).map(Number);
  };
  for (const theme of ['light', 'dark']) for (const mode of ['cards', 'list']) {
    // The pinned simulator does not evaluate light-dark(); materialize only that standard function,
    // retaining the full production cascade and custom-property inheritance for each real theme.
    for (const sheet of sheets) sheet.style.textContent = sheet.text.replace(/light-dark\(\s*(#[a-f0-9]+)\s*,\s*(#[a-f0-9]+)\s*\)/gi,
      (_match, light, dark) => theme === 'light' ? light : dark);
    f.host.dataset.theme = theme; f.node('[data-action="all-projects"]').click(); f.node(`[data-action="view-${mode}"]`).click();
    const normal = f.node('[data-project-card="p-a"]'), archived = f.node('[data-project-card="p-old"]');
    const normalTitle = f.w.getComputedStyle(normal.querySelector('.ce-project-title-link')), archivedTitle = f.w.getComputedStyle(archived.querySelector('.ce-project-title-link'));
    assert.equal(normalTitle.fontSize, '16px'); assert.equal(archivedTitle.fontSize, '16px');
    const blue = rgb(normalTitle.color), amber = rgb(archivedTitle.color);
    assert.ok(blue[2] > blue[0], `normal blue title at ${theme}/${mode}`); assert.ok(amber[0] > amber[2], `archive amber title at ${theme}/${mode}`);
    assert.notEqual(normalTitle.backgroundColor, archivedTitle.backgroundColor);
    assert.match(normal.textContent, /正常/); assert.match(archived.textContent, /已归档/);
    assert.doesNotMatch(normal.textContent + archived.textContent, /尚无事项记录|本机项目|来源项目/);
    assert.equal(normal.querySelector('.ce-project-title-link').getAttribute('href'), '#project/p-a/workspace');
  }
});

test('display-only progress retains direct legacy TaskCenter and Board routes with stable records', async t => {
  const f = await fixture(t); await f.route('#project/p-a/tasks');
  assert.equal(f.node('h1').textContent, '项目进展'); assert.equal(f.host.querySelector('[data-action="management-menu"]'), null);
  const before = f.reads.length; await f.route('#project/p-a/items');
  const scoped = f.reads.slice(before).filter(url => url.startsWith('/api/workspace/items?'));
  assert.equal(scoped.length, 1); const query = new URLSearchParams(scoped[0].split('?')[1]);
  assert.equal(query.get('project_id'), 'p-a'); assert.equal(query.get('scope'), 'all'); assert.equal(query.get('limit'), '50');
  assert.match(f.node('#items-list').textContent, /A 正在推进/); assert.doesNotMatch(f.node('#items-list').textContent, /B 正在推进/);
  assert.equal(f.node('#studio-agent-board').hidden, true);
  f.node('a[href="#project/p-a/tasks"]').click(); await tick(); await f.route('#project/p-a/board');
  const legacy = f.creates.filter(row => row.name === 'board' && row.options.unified === false);
  assert.equal(legacy.length, 1); assert.equal(legacy[0].options.root.id, 'studio-legacy-board');
  assert.match(f.node('#studio-legacy-board').textContent, /A 正在推进/); assert.doesNotMatch(f.node('#studio-legacy-board').textContent, /B 正在推进|归档事项/);
  f.node('#studio-legacy-board [data-action="manage-items"]').click(); await tick();
  assert.equal(f.creates.filter(row => row.name === 'items').length, 1); assert.equal(f.posts.length, 0);
  assert.equal(f.reads.some(url => /bootstrap.*project|worktree|runtime/.test(url)), false);
});



test('project addition enters the native workbench and delegates without loading another form', async t => {
  const f = await fixture(t, { unified: true, registration: true });
  let opens = 0; f.w.addEventListener('platform-open-add-repo', () => { opens++; });
  f.w.dispatchEvent(new f.w.Event('platform-add-project')); await tick();
  assert.equal(f.w.location.hash, '#workbench'); assert.equal(opens, 0);
  await f.route('#workbench');
  f.w.dispatchEvent(new f.w.Event('platform-add-project')); await tick();
  assert.equal(opens, 1); assert.equal(f.registrations.length, 0);
  assert.equal(f.reads.includes('/workspace-admin'), false);
  assert.equal(f.w.location.hash, '#workbench'); assert.equal(f.posts.length, 0);
});

test('native adoption publishes its catalog before confirming and leaves navigation to Orca', async t => {
  const f = await fixture(t, { hash: '#workbench', unified: true });
  f.projects.push({ id: 'p-new', name: 'New', directories: [{ id: 'main', path: 'C:/example/new' }] });
  const waits = [];
  f.w.dispatchEvent(new f.w.CustomEvent('platform-native-project-adopted', {
    detail: { projectId: 'p-new', waitUntil: value => waits.push(value) }
  }));
  assert.equal(waits.length, 1); assert.equal(await waits[0], true);
  assert.equal(f.w.location.hash, '#workbench'); assert.equal(f.posts.length, 0);
  assert.equal(f.w.document.querySelector('[data-platform-project-dialog]'), null);
});

test('a failed native adoption refresh can retry its read without replaying registration', async t => {
  const f = await fixture(t, { hash: '#workbench', unified: true });
  const confirm = () => {
    const waits = [];
    f.w.dispatchEvent(new f.w.CustomEvent('platform-native-project-adopted', {
      detail: { projectId: 'p-a', waitUntil: value => waits.push(value) }
    }));
    return waits[0];
  };
  f.failRead(true); assert.equal(await confirm(), false);
  assert.match(f.node('#studio-status').textContent, /无法连接本地工作台.*仍显示上次读取/);
  f.failRead(false); assert.equal(await confirm(), true);
  assert.equal(f.w.location.hash, '#workbench'); assert.equal(f.posts.length, 0);
});

test('retired outer project management events and selectors cannot reopen a form', async t => {
  const f = await fixture(t);
  const retired = f.w.document.createElement('button'); retired.dataset.projectSettings = 'p-a'; f.host.append(retired);
  retired.click(); f.w.dispatchEvent(new f.w.CustomEvent('platform-manage-project', { detail: { directory: 'C:/example/p-a' } }));
  await tick();
  assert.equal(f.w.document.querySelector('.ce-project-settings'), null);
  assert.equal(f.host.querySelector('[data-action="attention-projects"]'), null);
  assert.equal(f.posts.length, 0);
});

test('accepted hash/back/forward retain all-project selection and scroll without retired controls', async t => {
  const f = await fixture(t); await f.route('#project/p-a/tasks');
  f.node('[data-task-id="' + uuid(3) + '"]').click(); await tick();
  f.node('#pp-list').scrollTop = 57; f.node('#pp-detail').scrollTop = 83;
  await f.route('#project/p-a/items'); f.w.history.back(); await tick();
  assert.equal(f.w.location.hash, '#project/p-a/tasks'); assert.equal(f.host.querySelector('#pp-scope'), null); assert.equal(f.host.querySelector('#pp-search'), null);
  assert.equal(f.node('#pp-detail').dataset.taskId, uuid(3)); assert.equal(f.node('#pp-list').scrollTop, 57); assert.equal(f.node('#pp-detail').scrollTop, 83);
  assert.equal(f.w.document.activeElement.id, 'pp-detail');
  assert.match(f.node('#pp-list').textContent,/A 正在推进/); assert.match(f.node('#pp-list').textContent,/B 正在推进/);
  f.w.history.forward(); await tick(); assert.equal(f.w.location.hash, '#project/p-a/items');
  f.w.history.back(); await tick(); assert.equal(f.node('#pp-detail').dataset.taskId, uuid(3));
});


test('legacy editing veto preserves its draft and progress selection; unrelated projects retire selection', async t => {
  const f = await fixture(t); await f.route('#project/p-a/tasks'); f.node('[data-task-id="'+uuid(3)+'"]').click(); await tick(); await f.route('#project/p-a/items');
  f.node('#items-list button').click(); f.input('#item-title', '未保存');
  await f.route('#project/p-a/tasks'); assert.equal(f.w.location.hash, '#project/p-a/items'); assert.equal(f.node('#item-title').value, '未保存');
  f.change('#studio-items-scope', 'global'); assert.equal(f.node('#studio-items-scope').value, 'current'); assert.equal(f.node('#item-title').value, '未保存');
  f.node('#item-editor .form-actions .secondary').click(); await f.route('#project/p-a/tasks'); assert.equal(f.node('#pp-detail').dataset.taskId,uuid(3));
  await f.route('#project/p-a/items'); await f.route('#project/p-b/tasks'); assert.equal(f.node('#pp-detail').dataset.taskId,'');
  await f.route('#project/p-a/tasks'); assert.equal(f.node('#pp-detail').dataset.taskId,'');
  assert.match(f.node('#pp-list').textContent,/A 正在推进/); assert.match(f.node('#pp-list').textContent,/B 正在推进/);
});


test('a second async guard veto retains legacy view and restores no progress selection early', async t => {
  const f = await fixture(t); await f.route('#project/p-a/tasks'); f.node('[data-task-id="'+uuid(3)+'"]').click(); await tick(); await f.route('#project/p-a/board');
  let accept, reject; const one = new Promise(r => accept = r), two = new Promise(r => reject = r);
  const guard = e => { e.detail.waitUntil(one); e.detail.waitUntil(two); }; f.w.addEventListener('platform-before-navigate', guard);
  await f.route('#project/p-a/tasks'); accept(true); await tick(); assert.equal(f.w.location.hash, '#project/p-a/board');
  reject(false); await tick(); assert.equal(f.w.location.hash, '#project/p-a/board');
  f.w.removeEventListener('platform-before-navigate', guard); await f.route('#project/p-a/tasks'); assert.equal(f.node('#pp-detail').dataset.taskId,uuid(3));
});


test('explicit global/orphan/archived scopes are exact and a missing project never reads an unscoped page', async t => {
  const f = await fixture(t, { hash: '#project/p-a/items' });
  for (const [scope, title] of [['global', '全局事项'], ['orphan', '移出事项'], ['archived', '归档事项']]) {
    const before = f.reads.length; f.change('#studio-items-scope', scope); await tick();
    const url = f.reads.slice(before).find(url => url.startsWith('/api/workspace/items?')); const query = new URLSearchParams(url.split('?')[1]);
    assert.equal(query.get('scope'), scope); assert.equal(query.has('project_id'), false); assert.match(f.node('#items-list').textContent, new RegExp(title));
  }
  const before = f.reads.length; await f.route('#project/p-gone/items'); assert.equal(f.node('#studio-tasks').hidden, true);
  assert.equal(f.reads.slice(before).some(url => url.startsWith('/api/workspace/items?')), false);
  await f.route('#project/p-old/board'); assert.match(f.node('#studio-content').textContent, /项目已归档/); assert.equal(f.node('#studio-legacy-board').hidden, true);
  f.node('a[href="#project/p-old/items"]').click(); await tick(); assert.match(f.node('#items-list').textContent, /归档事项/);
});

test('confirmed changes propagate by item ID across both consumers; failed changes keep their draft', async t => {
  const f = await fixture(t, { hash: '#project/p-a/items' }); f.node('#items-list button').click(); f.input('#item-title', '已确认的新标题');
  f.node('#item-form').dispatchEvent(new f.w.Event('submit', { bubbles: true, cancelable: true })); await tick();
  assert.equal(f.posts.length, 1); assert.equal(f.posts[0].payload.id, uuid(1));
  await f.route('#project/p-a/board'); assert.match(f.node('#ab-groups').textContent, /已确认的新标题/);
  await f.route('#project/p-a/items'); f.node('#items-list button').click(); f.input('#item-title', '失败草稿'); f.failWrite(true);
  f.node('#item-form').dispatchEvent(new f.w.Event('submit', { bubbles: true, cancelable: true })); await tick();
  assert.equal(f.node('#item-title').value, '失败草稿'); assert.match(f.node('#item-feedback').textContent, /保留/); assert.equal(f.items[0].title, '已确认的新标题');
});

test('restored deleted selections clear detail without narrowing all-project rows', async t => {
  const f = await fixture(t); await f.route('#project/p-a/tasks'); f.node('[data-task-id="' + uuid(1) + '"]').click(); await tick();
  await f.route('#project/p-a/items'); f.items.splice(0,1); f.node('[data-action="refresh"]').click(); await tick(); await f.route('#project/p-a/tasks');
  assert.equal(f.node('#pp-detail').dataset.taskId, ''); assert.equal(f.node('#pp-detail').querySelector('button'), null);
  assert.equal(f.node('#pp-list').querySelectorAll('.pp-column').length, 3);
  assert.match(f.node('#pp-list').textContent, /A 待推进/); assert.match(f.node('#pp-list').textContent, /B 正在推进/);
});


test('missing profile or consumer shows an honest unavailable surface', async t => {
  for (const options of [{ writable: false }, { taskModule: false }]) {
    const f = await fixture(t, { hash: '#project/p-a/items', ...options });
    assert.equal(f.node('#studio-tasks').hidden, true); assert.equal(f.posts.length, 0);
    assert.match(f.node('#studio-status').textContent + f.node('#studio-content').textContent, /未就绪|未成功|初始化/);
  }
  const missingProgress = await fixture(t, { hash: '#project/p-a/tasks', progressModule: false });
  assert.equal(missingProgress.node('#studio-agent-board').hidden, true); assert.match(missingProgress.node('#studio-content').textContent, /进展资源尚未就绪/);
});

test('a newly archived Board target is rejected by the original write boundary and keeps the editor', async t => {
  const f = await fixture(t, { hash: '#project/p-a/board' }); f.node('#ab-groups .agent-task-title').click(); await tick();
  const owner = f.node('#ab-edit-project');
  assert.equal([...owner.options].some(option => option.value === 'p-old'), false);
  f.node('#ab-edit-title').closest('details').open = true; f.change('#ab-edit-project', 'p-b'); f.input('#ab-edit-title', '保留失败稿');
  f.projects.find(p => p.id === 'p-b').archived = true;
  f.node('#ab-edit-save').closest('form').dispatchEvent(new f.w.Event('submit', { bubbles: true, cancelable: true })); await tick();
  assert.equal(f.posts.length, 1); assert.equal(f.node('#ab-edit-title').value, '保留失败稿'); assert.equal(f.node('#ab-detail').open, true);
  assert.equal(f.items[0].project_id, 'p-a'); assert.equal(f.items[0].title, 'A 正在推进'); assert.match(f.node('#ab-feedback').textContent, /输入已保留/);
});

test('full stylesheet cascade keeps project tags readable and refresh controls accessible', async t => {
  const f = await fixture(t, { hash: '#project/p-a/tasks' });
  for (const name of ['workspace.css', 'project-progress.css', 'project-monitor.css', 'studio-preview.css']) {
    const style = f.w.document.createElement('style'); style.textContent = fs.readFileSync(path.join(root, 'web/workspace', name), 'utf8'); f.w.document.head.append(style);
  }
  assert.equal(f.w.getComputedStyle(f.node('h1')).fontSize, '24px'); assert.equal(f.node('h1').textContent,'项目进展');
  assert.equal(f.w.getComputedStyle(f.node('.pp-row-title')).fontSize, '15px');
  assert.equal(f.w.getComputedStyle(f.node('.pp-project-tag')).fontSize, '14px');
  assert.equal(f.w.getComputedStyle(f.node('#pp-refresh')).minHeight, '40px');
  assert.equal(f.node('#pp-refresh').textContent,''); assert.ok(f.node('#pp-refresh').querySelector('svg'));
});

test('removed advanced settings do not return through a saved deep link', async t => {
  const f = await fixture(t, { hash: '#settings/sources' });
  for (const name of ['workspace.css', 'project-progress.css', 'project-monitor.css', 'studio-preview.css']) {
    const style = f.w.document.createElement('style'); style.textContent = fs.readFileSync(path.join(root, 'web/workspace', name), 'utf8'); f.w.document.head.append(style);
  }
  for (const width of [1280, 390]) {
    f.w.happyDOM.setViewport({ width, height: 844 });
    assert.equal(f.host.querySelector('.ce-settings-group'), null);
    assert.equal(f.host.querySelector('#studio-settings-nav'), null);
    assert.doesNotMatch(f.host.textContent, /高级接入|事项 API 接入|项目与会话导入/);
    assert.equal(f.host.querySelector('.ce-creator-address'), null);
  }
});


for (const unified of [false, true]) test(`account and settings remain separate without retired access controls (unified=${unified})`, async t => {
  const f = await fixture(t, { hash: '#settings/sources', unified });
  assert.equal(f.host.querySelector('[data-action="external-access"]'), null);
  await f.route('#settings/account');
  assert.equal(f.host.querySelector('#studio-settings-nav'), null);
  assert.doesNotMatch(f.node('#studio-content').textContent, /外观|高级接入/);
  await f.route('#settings/appearance');
  assert.equal(f.host.querySelector('#studio-settings-nav'), null);
  assert.equal(f.host.querySelector('.ce-account'), null);
});

test('viewing another project keeps the current development identity and performs no writes', async t => {
  const f = await fixture(t); f.projects[1].name='项目 B'; f.node('[data-action="refresh"]').click(); await tick(); await f.route('#project/p-a/tasks');
  f.node('[data-task-id="' + uuid(3) + '"]').click(); await tick();
  assert.equal(f.w.location.hash, '#project/p-a/tasks'); assert.equal(f.node('#pp-detail').dataset.taskId,uuid(3));
  assert.equal(f.node('#pp-detail .pp-project-tag').textContent,'项目 B'); assert.equal(f.node('#pp-detail').querySelector('#pp-open-project'),null);
  assert.deepEqual([...f.node('#pp-detail').querySelectorAll('button')].map(node=>node.textContent),['‹ 返回','']);
  assert.equal(f.posts.length,0); assert.equal(f.reads.some(url=>/worktree|runtime|workbench/.test(url)),false);
});

test('items heading keeps the range select and a named back link together on one row', async t => {
  const f = await fixture(t); await f.route('#project/p-a/items');
  const actions = f.node('.ce-progress-heading .ce-heading-actions');
  assert.ok(actions.contains(f.node('#studio-items-scope')), 'range select sits with the heading actions');
  const back = actions.querySelector('a.ce-back');
  assert.equal(back.getAttribute('aria-label'), '返回项目进展'); assert.match(back.getAttribute('href'), /^#project\/p-a/);
  assert.match(f.node('h1').textContent, /事项$/);
  assert.equal(f.node('#studio-items-scope').closest('label').querySelector('.sr-only').textContent, '查看范围');
  assert.equal(f.node('#studio-items-scope').options.length, 7);
});

test('items stylesheet block keeps type at 14px or larger and honors reduced motion', () => {
  const css = fs.readFileSync(path.join(root, 'web/workspace/studio-preview.css'), 'utf8');
  const block = css.slice(css.indexOf('/* Items page: one composer'));
  assert.ok(block.length > 1000);
  for (const [, size] of block.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)) assert.ok(Number(size) >= 14, `font-size ${size}px`);
  assert.match(block, /@media\(prefers-reduced-motion:reduce\)\{[^@]*animation:none!important;transition:none!important/);
  assert.match(block, /cubic-bezier\(\.34,1\.56,\.64,1\)/);
});
