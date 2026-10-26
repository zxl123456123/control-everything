// Real ordinary modules in a local DOM; every request is synthetic and intercepted.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 10)); for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
const uuid = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
async function fixture(t, { hash = '#home', unified = false, writable = true, taskModule = true, progressModule = true } = {}) {
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
  const projects = ['p-a', 'p-b', 'p-old'].map((id, i) => ({ id, name: i === 2 ? '归档' : '同名项目', archived: i === 2, directories: [{ id: 'main', path: 'C:/example/' + id }] }));
  const items = [
    { id: uuid(1), project_id: 'p-a', title: 'A 正在推进', state: 'doing' },
    { id: uuid(2), project_id: 'p-a', title: 'A 待推进', state: 'todo' },
    { id: uuid(3), project_id: 'p-b', title: 'B 正在推进', state: 'doing' },
    { id: uuid(4), project_id: 'p-old', title: '归档事项', state: 'review' },
    { id: uuid(5), project_id: null, title: '全局事项', state: 'todo' },
    { id: uuid(6), project_id: 'p-gone', title: '移出事项', state: 'todo' }
  ].map(item => ({ origin: 'task', revision: 1, assignment_state: 'unassigned', provider_id: null, session_key: null, ...item }));
  const reads = [], posts = [], creates = [], adapters = [];
  let revision = 1, failRead = false, failWrite = false, pendingRead = null;
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
    let body;
    if (options.method === 'POST') {
      const payload = JSON.parse(options.body); posts.push({ route, payload });
      if (failWrite) return { ok: false, status: 409, json: async () => ({ reason: 'item_changed' }) };
      if (route !== '/api/workspace/items/update') throw new Error('Unexpected POST ' + route);
      const item = items.find(item => item.id === payload.id);
      const target = payload.changes.project_id;
      if (target && !projects.some(p => p.id === target && !p.archived)) return { ok: false, status: 400, json: async () => ({ reason: 'invalid_item' }) };
      assert.equal(payload.expected_revision, item.revision);
      Object.assign(item, payload.changes); item.revision++; revision++; body = { item: clone(item) };
    } else if (route === '/api/bootstrap') body = { capabilities: { profile: true }, csrf_token: writable ? 'fixture-only' : '' };
    else if (route === '/api/workspace') body = workspace();
    else if (route === '/api/workspace/agents') body = { revision: 0, items: [], tokens: {} };
    else if (route === '/api/workspace/items') {
      if (pendingRead && u.searchParams.get('limit') === '50') return pendingRead.promise;
      if (failRead) throw new Error('fixture read failed'); body = page(u.searchParams);
    } else if (route.includes('/agent-tasks/')) body = { item: clone(items.find(item => item.id === decodeURIComponent(route.split('/').at(-1)))), run: null, events: [], review_material: { sessions: [] } };
    else if (route.endsWith('/progress')) body = { item: clone(items.find(item => item.id === decodeURIComponent(route.split('/').at(-2)))), native_run: null, capabilities: {}, messages: [] };
    else throw new Error('Unexpected GET ' + route);
    return { ok: true, status: 200, json: async () => body };
  };
  const html = fs.readFileSync(path.join(root, 'web/workspace/studio-preview.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '');
  w.document.write(html);
  const host = w.document.getElementById('ce-studio'); host.id = 'mount-later';
  if (unified) host.dataset.unified = 'true';
  const modules = [...(progressModule ? ['project-progress-model.js', 'project-progress.js'] : []), 'project-space.js', 'agents.js', ...(taskModule ? ['task-center.js'] : []), 'studio-data.js', 'studio-shell.js', 'studio-preview.js'];
  for (const name of modules) w.eval(fs.readFileSync(path.join(root, 'web/workspace', name), 'utf8'));
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
  async function menu(tab) { node('[data-action="management-menu"]').click(); const link = [...w.document.querySelectorAll('[role="menuitem"]')].find(link => link.hash.endsWith('/' + tab)); assert.ok(link); link.click(); await tick(); }
  return { w, host, reads, posts, creates, adapters, items, projects, node, change, input, route, menu,
    failRead(value) { failRead = value; }, failWrite(value) { failWrite = value; },
    deferRead() { let resolve; const promise = new Promise(r => resolve = r); pendingRead = { promise, resolve }; return value => { pendingRead = null; resolve({ ok: true, json: async () => value }); }; } };
}

test('normal progress menu mounts exact TaskCenter and independent Board once with the same stable records', async t => {
  const f = await fixture(t); await f.route('#project/p-a/tasks');
  assert.match(f.node('h1').textContent, /同名项目 · 项目进展/);
  const before = f.reads.length; await f.menu('items');
  const scoped = f.reads.slice(before).filter(url => url.startsWith('/api/workspace/items?'));
  assert.equal(scoped.length, 1); const query = new URLSearchParams(scoped[0].split('?')[1]);
  assert.equal(query.get('project_id'), 'p-a'); assert.equal(query.get('scope'), 'all'); assert.equal(query.get('limit'), '50');
  assert.match(f.node('#items-list').textContent, /A 正在推进/); assert.doesNotMatch(f.node('#items-list').textContent, /B 正在推进/);
  assert.equal(f.node('#studio-agent-board').hidden, true);
  f.node('a[href="#project/p-a/tasks"]').click(); await tick(); await f.menu('board');
  const legacy = f.creates.filter(row => row.name === 'board' && row.options.unified === false);
  assert.equal(legacy.length, 1); assert.equal(legacy[0].options.root.id, 'studio-legacy-board');
  assert.match(f.node('#studio-legacy-board').textContent, /A 正在推进/); assert.doesNotMatch(f.node('#studio-legacy-board').textContent, /B 正在推进|归档事项/);
  f.node('#studio-legacy-board [data-action="manage-items"]').click(); await tick();
  assert.equal(f.creates.filter(row => row.name === 'items').length, 1); assert.equal(f.posts.length, 0);
  assert.equal(f.reads.some(url => /bootstrap.*project|worktree|runtime/.test(url)), false);
});

test('project name composition keeps the dialog open and a later cancel retains its draft', async t => {
  const f = await fixture(t);
  function open() {
    f.node('[data-project-menu="p-a"]').click();
    f.w.document.querySelector('[data-project-settings="p-a"]').click();
    return f.node('dialog.ce-project-settings');
  }
  const dialog = open();
  const name = dialog.querySelector('[name="name"]');
  name.value = '中文草稿'; name.dispatchEvent(new f.w.Event('input', {bubbles:true}));
  name.dispatchEvent(new f.w.CompositionEvent('compositionstart', {bubbles:true}));
  const escape = new f.w.KeyboardEvent('keydown', {key:'Escape',bubbles:true,cancelable:true,isComposing:true});
  name.dispatchEvent(escape); assert.equal(escape.defaultPrevented, true);
  dialog.dispatchEvent(new f.w.Event('cancel', {cancelable:true}));
  assert.equal(dialog.open, true); assert.equal(f.posts.length, 0);
  name.dispatchEvent(new f.w.CompositionEvent('compositionend', {bubbles:true}));
  dialog.dispatchEvent(new f.w.Event('cancel', {cancelable:true}));
  await tick(); assert.equal(dialog.open, false);
  assert.equal(open().querySelector('[name="name"]').value, '中文草稿');
});

test('accepted hash/back/forward restore actual Progress scope, filter, stable selection, scroll and trigger', async t => {
  const f = await fixture(t); await f.route('#project/p-a/tasks');
  f.change('#pp-scope', 'p-b'); f.input('#pp-search', 'B'); f.node('[data-task-id="' + uuid(3) + '"]').click(); await tick();
  f.node('#pp-list').scrollTop = 57; f.node('#pp-detail').scrollTop = 83;
  await f.menu('items');
  f.w.history.back(); await tick();
  assert.equal(f.w.location.hash, '#project/p-a/tasks'); assert.equal(f.node('#pp-scope').value, 'p-b'); assert.equal(f.node('#pp-search').value, 'B');
  assert.equal(f.node('#pp-detail').dataset.taskId, uuid(3)); assert.equal(f.node('#pp-list').scrollTop, 57); assert.equal(f.node('#pp-detail').scrollTop, 83);
  assert.equal(f.w.document.activeElement.dataset.action, 'management-menu');
  f.w.history.forward(); await tick(); assert.equal(f.w.location.hash, '#project/p-a/items');
  f.w.history.back(); await tick(); assert.equal(f.node('#pp-scope').value, 'p-b'); assert.equal(f.node('#pp-detail').dataset.taskId, uuid(3));
});

test('editing veto preserves return packet and scope; an unrelated accepted project retires it', async t => {
  const f = await fixture(t); await f.route('#project/p-a/tasks'); f.change('#pp-scope', 'p-b'); await f.menu('items');
  f.node('#items-list button').click(); f.input('#item-title', '未保存');
  await f.route('#project/p-a/tasks'); assert.equal(f.w.location.hash, '#project/p-a/items'); assert.equal(f.node('#item-title').value, '未保存');
  f.change('#studio-items-scope', 'global'); assert.equal(f.node('#studio-items-scope').value, 'current'); assert.equal(f.node('#item-title').value, '未保存');
  f.node('#item-editor .form-actions .secondary').click(); await f.route('#project/p-a/tasks'); assert.equal(f.node('#pp-scope').value, 'p-b');
  await f.menu('items'); await f.route('#project/p-b/tasks'); assert.equal(f.node('#pp-search').value, ''); assert.equal(f.node('#pp-scope').value, '');
  await f.route('#project/p-a/tasks'); assert.equal(f.node('#pp-scope').value, '');
});

test('a second async guard veto does not restore early or discard drafts', async t => {
  const f = await fixture(t); await f.route('#project/p-a/tasks'); f.change('#pp-scope', 'p-b'); await f.menu('board');
  let accept, reject;
  const one = new Promise(r => accept = r), two = new Promise(r => reject = r);
  const guard = e => { e.detail.waitUntil(one); e.detail.waitUntil(two); };
  f.w.addEventListener('platform-before-navigate', guard);
  await f.route('#project/p-a/tasks'); accept(true); await tick(); assert.equal(f.w.location.hash, '#project/p-a/board');
  reject(false); await tick(); assert.equal(f.w.location.hash, '#project/p-a/board');
  f.w.removeEventListener('platform-before-navigate', guard); await f.route('#project/p-a/tasks'); assert.equal(f.node('#pp-scope').value, 'p-b');
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

test('restored deleted or filtered-out selections clear detail and actions without choosing another row', async t => {
  const f = await fixture(t); await f.route('#project/p-a/tasks'); f.input('#pp-search', 'A 正在'); f.node('[data-task-id="' + uuid(1) + '"]').click(); await tick();
  await f.menu('items'); f.items[0].title = '已移出原搜索'; f.node('[data-action="refresh"]').click(); await tick(); await f.route('#project/p-a/tasks');
  assert.equal(f.node('#pp-search').value, 'A 正在'); assert.equal(f.node('#pp-detail').dataset.taskId, ''); assert.equal(f.node('#pp-detail').querySelector('button'), null);
  assert.equal(f.node('#pp-list').querySelectorAll('[data-task-id]').length, 0);
  assert.equal(f.node('#pp-list').querySelectorAll('.pp-column').length, 3);
  assert.match(f.node('#pp-list').textContent, /没有匹配的记录/);
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

test('full stylesheet cascade preserves readable progress text and actual input controls', async t => {
  const f = await fixture(t, { hash: '#project/p-a/tasks' });
  for (const name of ['workspace.css', 'project-progress.css', 'project-monitor.css', 'studio-preview.css']) {
    const style = f.w.document.createElement('style'); style.textContent = fs.readFileSync(path.join(root, 'web/workspace', name), 'utf8'); f.w.document.head.append(style);
  }
  assert.equal(f.w.getComputedStyle(f.node('h1')).fontSize, '24px');
  assert.equal(f.w.getComputedStyle(f.node('.pp-row-title')).fontSize, '15px');
  assert.equal(f.w.getComputedStyle(f.node('.pp-row-summary')).fontSize, '14px');
  assert.equal(f.w.getComputedStyle(f.node('#pp-search')).minHeight, '40px');
});


for (const unified of [false, true]) test(`external access uses the current Studio dialog host and disposes on navigation (unified=${unified})`, async t => {
  const f = await fixture(t, { hash: '#settings/sources', unified });
  const trigger = f.node('[data-action="external-access"]'); trigger.focus();
  assert.equal(f.w.document.querySelector('.ce-access'), null);
  const before = f.reads.length; trigger.click(); await tick();
  const owner = unified ? f.w.document.querySelector('.platform-project-dialog-host').shadowRoot : f.host;
  const dialog = owner.querySelector('.ce-access'); assert.ok(dialog); assert.equal(dialog.open, true);
  assert.match(dialog.textContent, /暂无接入/);
  assert.equal(f.reads.slice(before).filter(url => url === '/api/workspace/agents').length, 1);
  trigger.click(); await tick(); assert.equal(owner.querySelectorAll('.ce-access').length, 1);
  dialog.querySelector('[aria-label="关闭"]').click(); await tick(); assert.equal(owner.querySelector('.ce-access'), null);
  assert.equal(f.w.document.activeElement, trigger);
  trigger.click(); await tick(); await f.route('#home');
  assert.equal(owner.querySelector('.ce-access'), null);
});

test('cross-project progress entry changes context and keeps the exact selected task', async t => {
  const f = await fixture(t); await f.route('#project/p-a/tasks');
  f.node('[data-task-id="' + uuid(3) + '"]').click(); await tick();
  f.node('#pp-open-project').click(); await tick();
  assert.equal(f.w.location.hash, '#project/p-b/tasks');
  assert.equal(f.node('#pp-detail').dataset.taskId, uuid(3));
  assert.equal(f.node('#pp-detail').querySelector('#pp-open-project'), null);
});
