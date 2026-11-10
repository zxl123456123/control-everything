// Actual consumers and confirmation primitive; all reads and writes are synthetic.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const source = name => fs.readFileSync(path.join(root, 'web/workspace', name), 'utf8');
const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
async function environment(t, html = 'workspace.html') {
  const { Window } = await import(pathToFileURL(path.join(root, 'web/workbench-engine/node_modules/happy-dom/lib/index.js')).href);
  const w = new Window({ url: 'http://fixture.test/studio#home', settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  w.document.write(source(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, ''));
  for (const node of w.document.querySelectorAll('[hidden]')) node.hidden = false;
  w.confirm = () => { throw new Error('native confirmation is forbidden'); };
  w.fetch = () => { throw new Error('unmapped fixture request'); };
  // CSS/CSP/top-layer geometry are verified in the coordinator's real browser fixture.
  w.eval(source('ui-dialog.js'));
  t.after(() => { w.happyDOM.abort(); w.close(); });
  const button = (text, owner = w.document) => { const node = [...owner.querySelectorAll('button')].find(node => node.textContent === text); assert.ok(node, text); return node; };
  return { w, button, input(node, value) { node.value = value; node.dispatchEvent(new w.Event('input', { bubbles: true })); },
    modal() { const node = w.document.querySelector('dialog.ce-ui-confirm[open]'); assert.ok(node, 'pending confirmation'); return node; } };
}

test('real onboarding confirmation defaults to cancel, isolates IME and rechecks changed inputs after await', async t => {
  const f = await environment(t), w = f.w, dialog = w.document.getElementById('onboarding-dialog');
  w.eval(source('onboarding.js'));
  let writes = 0;
  const api = w.WorkspaceOnboarding.create({ dialog, fetchJson: async () => { throw new Error('no discovery read'); }, postJson: async () => { writes++; }, onChanged() {}, manual() {}, manage() {} });
  await api.open();
  const input = dialog.querySelector('#onboarding-directory-path'); f.input(input, 'C:/example/A');
  const trigger = dialog.querySelector('#onboarding-new'); trigger.focus(); trigger.click(); await tick();
  const confirmation = f.modal();
  assert.equal(w.document.activeElement, confirmation.querySelector('.ce-ui-confirm-actions button:first-child'));
  confirmation.dispatchEvent(new w.Event('compositionstart', { bubbles: true }));
  confirmation.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }));
  assert.equal(confirmation.open, true); assert.equal(dialog.open, true);
  confirmation.dispatchEvent(new w.Event('compositionend', { bubbles: true }));
  confirmation.querySelector('.ce-ui-confirm-actions button:first-child').click(); await tick();
  assert.equal(dialog.querySelector('#onboarding-existing').getAttribute('aria-pressed'), 'true');
  assert.equal(input.value, 'C:/example/A'); assert.equal(w.document.activeElement, trigger); assert.equal(writes, 0);
  trigger.click(); await tick(); f.input(input, 'C:/example/B'); f.modal().querySelector('[data-confirm]').click(); await tick();
  assert.equal(dialog.querySelector('#onboarding-existing').getAttribute('aria-pressed'), 'true'); assert.equal(input.value, 'C:/example/B');
  trigger.click(); await tick(); f.modal().querySelector('[data-confirm]').click(); await tick();
  assert.equal(dialog.querySelector('#onboarding-new').getAttribute('aria-pressed'), 'true'); assert.equal(writes, 0);
});

test('real unlink waits for acceptance and rechecks current object; missing helper performs no write', async t => {
  const f = await environment(t), w = f.w; w.eval(source('project-space.js'));
  const owner = w.document.createElement('section'); w.document.body.append(owner);
  let current = true; const posts = [];
  const row = { id: 'session-a', title: '会话', project_id: 'p-a', task_id: 'task-a', updated_at: 'fixed-version' };
  const api = w.WorkspaceSessionList.create({ root: owner, taskId: 'task-a', projectId: 'p-a', isCurrent: () => current,
    read: async () => ({ item: { id: 'task-a' }, items: [row] }), postJson: async (url, body) => { posts.push({ url, body }); return { id: row.id, task_id: null }; } });
  await tick(); f.button('解除此事项关联', owner).click(); await tick(); assert.equal(posts.length, 0);
  f.modal().querySelector('.ce-ui-confirm-actions button:first-child').click(); await tick(); assert.equal(posts.length, 0);
  f.button('解除此事项关联', owner).click(); await tick(); current = false; f.modal().querySelector('[data-confirm]').click(); await tick(); assert.equal(posts.length, 0);
  current = true; const primitive = w.CEUIDialog; w.CEUIDialog = null;
  f.button('解除此事项关联', owner).click(); await tick(); assert.equal(posts.length, 0); assert.match(owner.textContent, /确认界面尚未就绪/);
  w.CEUIDialog = primitive; f.button('解除此事项关联', owner).click(); await tick(); f.modal().querySelector('[data-confirm]').click(); await tick();
  assert.equal(posts.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(posts[0].body)), { expected_task_id: 'task-a', expected_updated_at: 'fixed-version' }); api.dispose();
});

test('real message discard keeps a changed draft and unavailable helper cannot authorize it', async t => {
  const f = await environment(t), w = f.w; w.eval(source('agents.js'));
  const owner = w.document.createElement('section'); w.document.body.append(owner);
  const posts = []; w.WorkspaceTaskMessages.create({ root: owner, item: { id: 'item-a', project_id: 'p-a' }, agents: [],
    fetchJson: async () => ({ item: { id: 'item-a' }, items: [] }), postJson: async (...args) => posts.push(args) }); await tick();
  const input = owner.querySelector('#tm-body'); f.input(input, '第一份草稿');
  f.button('放弃补充草稿', owner).click(); await tick(); assert.equal(input.value, '第一份草稿');
  f.input(input, '新的草稿'); f.modal().querySelector('[data-confirm]').click(); await tick(); assert.equal(input.value, '新的草稿');
  w.CEUIDialog = null; f.button('放弃补充草稿', owner).click(); await tick(); assert.equal(input.value, '新的草稿'); assert.match(owner.textContent, /确认界面尚未就绪/); assert.equal(posts.length, 0);
});

test('real external access confirmation rejects stale context and changed scope drafts', async t => {
  const f = await environment(t), w = f.w; w.eval(source('agents.js'));
  const item = { id: 'agent-a', name: 'Agent A', kind: 'codex', enabled: true, command: 'codex', permission: 'danger-full-access', project_ids: ['p-a'] };
  let revision = 1, current = true; const posts = [];
  const options = { host: w.document.body, isCurrent: () => current,
    fetchJson: async url => url === '/api/workspace' ? { projects: { status: 'available', items: [{ id: 'p-a', name: 'A' }] } } : { revision, items: [item], tokens: {} },
    postJson: async (url, body) => { posts.push({ url, body }); return { revision: revision + 1, items: body.items || [], tokens: {} }; } };
  let api = w.WorkspaceAgents.openAccess(options); await tick();
  f.button('移除').click(); await tick(); assert.equal(posts.length, 0);
  current = false; f.modal().querySelector('[data-confirm]').click(); await tick(); assert.equal(posts.length, 0);
  api.dispose(); current = true; revision++; api = w.WorkspaceAgents.openAccess(options); await tick();
  f.button('编辑').click(); const form = w.document.querySelector('.ce-access form');
  const all = form.querySelector('.ce-access-project-options input'); all.checked = true; all.dispatchEvent(new w.Event('change', { bubbles: true }));
  form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
  f.input(form.querySelector('[name="name"]'), '更新的草稿'); f.modal().querySelector('[data-confirm]').click(); await tick(); assert.equal(posts.length, 0);
  form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(); f.modal().querySelector('[data-confirm]').click(); await tick();
  assert.equal(posts.length, 1); assert.equal(posts[0].body.expected_revision, revision); assert.equal(posts[0].body.items[0].permission, 'danger-full-access');
  assert.deepEqual([...posts[0].body.items[0].project_ids], []); api.dispose();
});

test('real Board closes one layer after accepted discard and preserves the detail on composing Escape', async t => {
  const f = await environment(t), w = f.w; w.eval(source('project-space.js')); w.eval(source('agents.js'));
  const owner = w.document.createElement('section'); w.document.body.append(owner);
  const item = { id: '00000000-0000-4000-8000-000000000001', project_id: 'p-a', title: '事项', origin: 'task', state: 'todo', revision: 1, assignment_state: 'unassigned' };
  const posts = [], api = w.WorkspaceAgentBoard.create({ root: owner, unified: false, fetchJson: async url => url.includes('/agent-tasks/') ? { item, events: [], run: null } : { item, items: [], brief: null }, postJson: async (...args) => posts.push(args) }); t.after(() => api.dispose());
  await api.update({ workspace: { projects: { items: [{ id: 'p-a', name: '项目' }] } }, items: [item], agents: [] });
  await api.open(item); await tick(); const detail = owner.querySelector('#ab-detail');
  f.input(owner.querySelector('#ab-edit-title'), '未保存');
  detail.dispatchEvent(new w.KeyboardEvent('cancel', { cancelable: true, isComposing: true })); await tick(); assert.equal(detail.open, true); assert.equal(w.document.querySelector('dialog.ce-ui-confirm'), null);
  detail.dispatchEvent(new w.Event('cancel', { cancelable: true })); await tick(); assert.equal(detail.open, true);
  f.modal().querySelector('.ce-ui-confirm-actions button:first-child').click(); await tick(); assert.equal(detail.open, true); assert.equal(owner.querySelector('#ab-edit-title').value, '未保存');
  f.button('关闭详情', detail).click(); await tick(); f.modal().querySelector('[data-confirm]').click(); await tick(); assert.equal(detail.open, false); assert.equal(posts.length, 0);
});

async function studioFixture(t) {
  const f = await environment(t, 'studio-preview.html'), w = f.w;
  const projects = ['p-a', 'p-b'].map(id => ({ id, name: '同名项目', archived: false, directories: [{ id: 'main', path: 'C:/example/' + id }], source: { kind: 'none' } }));
  let pending = null; const posts = [];
  w.fetch = async (url, options = {}) => {
    const route = new URL(url, w.location.href).pathname; let body;
    if (options.method === 'POST') {
      assert.equal(route, '/api/workspace/projects/save'); posts.push(JSON.parse(options.body));
      if (pending) return pending;
      body = { status: 'ok', project: { ...posts.at(-1) } };
    } else if (route === '/api/bootstrap') body = { capabilities: { profile: true }, csrf_token: 'fixture' };
    else if (route === '/api/workspace') body = { projects: { status: 'available', items: projects }, sessions: { available: true, items: [] } };
    else if (route === '/api/workspace/agents') body = { items: [] };
    else if (route === '/api/workspace/items') body = { items: [], total: 0, list_revision: 1 };
    else throw new Error('unmapped fixture route: ' + route);
    return { ok: true, json: async () => body };
  };
  const host = w.document.getElementById('ce-studio'); host.id = 'fixture-mount';
  for (const file of ['project-space.js', 'agents.js', 'studio-data.js', 'studio-shell.js', 'studio-preview.js']) w.eval(source(file));
  host.id = 'ce-studio'; const dispose = w.StudioPreview.mount(host); t.after(dispose); await tick();
  return { ...f, posts, projects,
    async open(id) { w.dispatchEvent(new w.CustomEvent('platform-manage-project', { detail: { directory: 'C:/example/' + id } })); await tick(); return host.querySelector('dialog.ce-project-settings[open]'); },
    defer() { let resolve; pending = new Promise(r => resolve = r); return (body, ok = true) => { pending = null; resolve({ ok, status: ok ? 200 : 409, json: async () => body }); }; } };
}

test('Studio D02 separates same-name object drafts, retains failure and clears only successful object', async t => {
  const f = await studioFixture(t), w = f.w;
  let dialog = await f.open('p-a'); f.input(dialog.querySelector('[name=name]'), 'A 草稿'); dialog.querySelector('[data-cancel-project]').click();
  dialog = await f.open('p-b'); assert.equal(dialog.querySelector('[name=name]').value, '同名项目'); f.input(dialog.querySelector('[name=name]'), 'B 草稿'); dialog.querySelector('[data-cancel-project]').click();
  dialog = await f.open('p-a'); assert.equal(dialog.querySelector('[name=name]').value, 'A 草稿');
  const failed = f.defer(); dialog.querySelector('form').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
  dialog.dispatchEvent(new w.Event('cancel', { cancelable: true })); assert.equal(dialog.open, true); failed({ reason: 'directory_conflict' }, false); await tick();
  assert.equal(dialog.open, true); assert.equal(dialog.querySelector('[name=name]').value, 'A 草稿'); assert.match(dialog.textContent, /其他活动项目/); assert.equal(w.document.activeElement, dialog.querySelector('[role=status]'));
  dialog.querySelector('form').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(); assert.equal(dialog.open, false);
  dialog = await f.open('p-a'); assert.equal(dialog.querySelector('[name=name]').value, '同名项目'); dialog.querySelector('[data-cancel-project]').click();
  dialog = await f.open('p-b'); assert.equal(dialog.querySelector('[name=name]').value, 'B 草稿'); assert.equal(f.posts.length, 2);
});

test('Studio D02 late save cannot clear or close a newer draft; pending close never resubmits', async t => {
  const f = await studioFixture(t), w = f.w;
  const original = await f.open('p-a'); f.input(original.querySelector('[name=name]'), '原提交');
  const finish = f.defer(); original.querySelector('form').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
  original.dispatchEvent(new w.Event('cancel', { cancelable: true })); original.dispatchEvent(new w.Event('cancel', { cancelable: true })); assert.equal(original.open, true);
  let dialog = await f.open('p-b'); f.input(dialog.querySelector('[name=name]'), 'B 草稿'); dialog.querySelector('[data-cancel-project]').click();
  dialog = await f.open('p-a'); f.input(dialog.querySelector('[name=name]'), '更新的 A 草稿');
  finish({ status: 'ok', project: { id: 'p-a' } }); await tick();
  assert.equal(dialog.open, true); assert.equal(dialog.querySelector('[name=name]').value, '更新的 A 草稿'); assert.equal(f.posts.length, 1);
  dialog.querySelector('[data-cancel-project]').click(); dialog = await f.open('p-a'); assert.equal(dialog.querySelector('[name=name]').value, '更新的 A 草稿');
});

test('Studio D02 rechecks the same registered directory before writing', async t => {
  const f = await studioFixture(t), w = f.w, dialog = await f.open('p-a');
  f.input(dialog.querySelector('[name=name]'), '保留的名称草稿');
  // Publish a new registry response through the real refresh action.
  f.projects[0].directories[0].path = 'C:/example/moved-a';
  w.document.querySelector('[data-action="refresh"]').click(); await tick();
  dialog.querySelector('form').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
  assert.equal(f.posts.length, 0); assert.equal(dialog.open, true); assert.match(dialog.textContent, /项目登记已变化/); assert.equal(dialog.querySelector('[name=name]').value, '保留的名称草稿');
});

test('legacy project form retains per-ID drafts and queues one close behind the original save', async t => {
  const f = await environment(t), w = f.w;
  const script = source('workspace.js');
  // Exclude only page startup; invoke the real form setup and save functions below.
  w.eval(script.slice(0, script.lastIndexOf('\nmountWorkspaceTheme();')) + `
    window.workspaceFixture = { openProject, setupProfile, mountWorkspaceTheme, disposeWorkspaceTheme,
      configure(projects, write) { app.profileMode = true; app.capabilities = {}; app.snapshot = null; setupProfile();
        app.snapshot = { projects: { items: projects } }; post = write; loadBase = async () => {}; loadProfile = async () => {}; },
      setWrite(write) { post = write; } };
  `);
  const projects = ['p-a', 'p-b'].map(id => ({ id, name: '同名', directories: [{ id: 'main', path: 'C:/example/' + id }], source: { kind: 'none' } }));
  const api = w.workspaceFixture, posts = []; let resolve;
  api.configure(projects, (url, body) => { posts.push({ url, body }); return new Promise(r => resolve = r); });
  const dialog = w.document.getElementById('project-dialog'), form = w.document.getElementById('project-form'), name = w.document.getElementById('project-name');
  api.openProject(projects[0]); f.input(name, 'A 草稿'); w.document.getElementById('cancel-project').click();
  api.openProject(projects[1]); assert.equal(name.value, '同名'); f.input(name, 'B 草稿'); w.document.getElementById('cancel-project').click();
  api.openProject(projects[0]); assert.equal(name.value, 'A 草稿'); form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
  dialog.dispatchEvent(new w.Event('cancel', { cancelable: true })); dialog.dispatchEvent(new w.Event('cancel', { cancelable: true }));
  assert.equal(dialog.open, true); assert.equal(posts.length, 1); resolve({ status: 'ok', project: projects[0] }); await tick(); assert.equal(dialog.open, false);
  api.openProject(projects[1]); assert.equal(name.value, 'B 草稿'); w.document.getElementById('cancel-project').click(); api.openProject(projects[0]); assert.equal(name.value, '同名');
  api.setWrite(async () => { throw new Error('fixture failed save'); }); f.input(name, '失败草稿'); form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
  assert.equal(dialog.open, true); assert.equal(name.value, '失败草稿'); assert.match(w.document.getElementById('project-feedback').textContent, /fixture failed save/); assert.equal(w.document.activeElement.id, 'project-feedback');
});

test('workspace theme consumes the declared head controller once and remounts with the same key', async t => {
  const f = await environment(t), w = f.w, script = source('workspace.js'), mounts = [], reads = [], disposals = [];
  const controller = label => ({ mount(options) { mounts.push({ label, options }); return () => {}; }, dispose() { disposals.push(label); } });
  w.CEUITheme = { pageTheme: controller('head'), earlyRead(key) { reads.push(key); return controller('remount'); } };
  w.eval(script.slice(0, script.lastIndexOf('\nmountWorkspaceTheme();')) + '\nwindow.themeFixture = {mountWorkspaceTheme,disposeWorkspaceTheme};');
  w.themeFixture.mountWorkspaceTheme(); w.themeFixture.mountWorkspaceTheme(); assert.equal(mounts.length, 1); assert.equal(mounts[0].label, 'head'); assert.equal(reads.length, 0);
  w.themeFixture.disposeWorkspaceTheme(); w.themeFixture.mountWorkspaceTheme(); assert.equal(mounts[1].label, 'remount'); assert.deepEqual(reads, ['ce-studio-theme']); assert.deepEqual(disposals, ['head']);
  assert.equal(mounts[1].options.toggles[0].id, 'workspace-theme-toggle'); w.themeFixture.disposeWorkspaceTheme();
});

test('collection choice keeps query separate from stable value and handles keyboard, IME and no matches', async t => {
  const f = await environment(t), w = f.w; w.eval(source('agents.js'));
  const form = w.document.createElement('form'), field = w.document.createElement('fieldset'), select = w.document.createElement('select'); select.id = 'actual-project';
  for (const [id, name] of [['p-a','同名 Alpha'],['p-b','同名 Beta'],['p-c','Gamma']]) { const option = w.document.createElement('option'); option.value = id; option.textContent = name; select.append(option); }
  select.value = 'p-b'; field.append(select); form.append(field); w.document.body.append(form);
  let changes = 0, submits = 0; select.addEventListener('change', () => changes++); form.addEventListener('submit', event => { event.preventDefault(); submits++; });
  const api = w.WorkspaceAgents.attachCollectionChoice(select, '项目'); t.after(() => api.dispose());
  const input = form.querySelector('[role=combobox]'); input.focus(); f.input(input, 'Alpha');
  const key = (value, extra = {}) => input.dispatchEvent(new w.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...extra }));
  assert.equal(select.value, 'p-b'); assert.equal(form.querySelectorAll('[role=option]').length, 1); assert.equal(changes, 0);
  key('ArrowDown'); key('Enter', { isComposing: true }); assert.equal(select.value, 'p-b'); assert.equal(submits, 0);
  key('Enter'); assert.equal(select.value, 'p-a'); assert.equal(changes, 1); assert.equal(w.document.activeElement, input); assert.equal(input.getAttribute('aria-expanded'), 'false');
  f.input(input, 'not-found'); assert.equal(select.value, 'p-a'); assert.match(form.textContent, /没有匹配/); key('Escape'); assert.equal(input.value, '同名 Alpha');
  input.click(); key('End'); key('Enter'); assert.equal(select.value, 'p-c');
  input.click(); key('Home'); key('Enter'); assert.equal(select.value, 'p-a'); assert.equal(changes, 3);
  field.disabled = true; await tick(); assert.equal(input.disabled, true); input.click(); assert.equal(input.getAttribute('aria-expanded'), 'false'); assert.equal(select.value, 'p-a');
});

test('collection choice retains removed stable IDs, updates dynamic options and disconnects on dispose', async t => {
  const f = await environment(t), w = f.w; w.eval(source('agents.js'));
  const select = w.document.createElement('select'); select.id = 'dynamic-choice'; w.document.body.append(select);
  const append = (id, name) => { const option = w.document.createElement('option'); option.value = id; option.textContent = name; select.append(option); return option; };
  append('old','原对象'); append('other','其他对象'); select.value = 'old';
  const api = w.WorkspaceAgents.attachCollectionChoice(select, '动态项目');
  select.querySelector('[value=old]').remove(); await tick();
  assert.equal(select.value, 'old'); assert.equal(select.options[select.selectedIndex].disabled, true); assert.match(select.nextElementSibling.textContent + select.nextElementSibling.querySelector('input').value, /原选项已失效/);
  const input = select.nextElementSibling.querySelector('input'); append('new','后来对象'); await tick(); f.input(input, '后来');
  select.nextElementSibling.querySelector('[role=option]').click(); assert.equal(select.value, 'new');
  const wrapper = select.nextElementSibling; api.dispose(); api.dispose(); assert.equal(wrapper.isConnected, false); assert.equal(select.hidden, false); assert.equal(select.ceCollectionChoice, undefined);
  append('last','退役后'); await tick(); assert.equal(wrapper.isConnected, false); assert.equal(select.value, 'new');
});

test('trusted context retirement removes collection listeners without changing the original value', async t => {
  const f = await environment(t), w = f.w; w.eval(source('agents.js'));
  let retire, releases = 0; w.CERemoteContext = { onInactive(callback) { retire = callback; return () => releases++; } };
  const select = w.document.createElement('select'); select.id = 'retired-choice'; const option = w.document.createElement('option'); option.value = 'stable'; option.textContent = '原项目'; select.append(option); w.document.body.append(select);
  const api = w.WorkspaceAgents.attachCollectionChoice(select, '项目'), wrapper = select.nextElementSibling, input = wrapper.querySelector('input');
  f.input(input, '原'); assert.equal(input.getAttribute('aria-expanded'), 'true'); retire();
  assert.equal(wrapper.isConnected, false); assert.equal(select.value, 'stable'); assert.equal(releases, 1); api.dispose(); assert.equal(releases, 1);
  select.dispatchEvent(new w.Event('change')); assert.equal(wrapper.isConnected, false);
});

test('actual TaskCenter collection choices preserve locked ownership and dispose their presentation', async t => {
  const f = await environment(t), w = f.w;
  for (const name of ['agents.js','task-center.js']) w.eval(source(name));
  const host = w.document.createElement('section'); w.document.body.append(host);
  const project = { id: 'p-a', name: '同名项目', archived: false }, item = { id: '00000000-0000-4000-8000-000000000009', title: '原事项', project_id: 'p-a', provider_id: null, state: 'todo', session_key: null, origin: 'task', revision: 1 };
  const api = w.WorkspaceTaskCenter.create({ root: host, fetchJson: async () => ({ item, items: [item], total: 1, list_revision: 1 }), postJson: async () => { throw new Error('no write'); }, canWrite: () => false });
  api.update({ projects: { items: [project] }, sessions: { available: true, items: [] }, items_page: { items: [item], total: 1, list_revision: 1 } }, { refresh: false }); await api.open(item); await tick();
  assert.equal(host.querySelector('#item-project_id-query').disabled, true); assert.equal(host.querySelector('#item-project_id').value, 'p-a');
  api.dispose(); assert.equal(host.querySelector('.ce-collection-choice'), null);
});
