// External access controller with a local DOM and synthetic API responses.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'web/workspace/agents.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'web/workspace/workspace.html'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const first = { id: 'external-a', name: 'Daily checker', kind: 'codex', command: 'codex', enabled: true,
  project_ids: ['p-a'], adapter: 'future-adapter', connection: { args: '--legacy', custom: true },
  permission: 'danger-full-access', network: 'allowed', approval: 'never' };
async function fixture(t, rows = []) {
  const { Window } = await import(pathToFileURL(path.join(root, 'web/workbench-engine/node_modules/happy-dom/lib/index.js')).href);
  const w = new Window({ url: 'http://fixture.test/studio#settings/sources', settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const host = w.document.createElement('div'); host.id = 'ce-studio'; w.document.body.append(host);
  const state = { rows: clone(rows), revision: 2, tokens: {}, projects: [{ id: 'p-a', name: 'Project A' }, { id: 'p-b', name: 'Project B' }], failProjects: false, failSave: false, failRegistry: false, current: true, response: null, confirm: true, restored: 0, confirmCalls: [] };
  const reads = [], writes = [], inactive = new Set();
  w.CERemoteContext = { context: 'fixture', storageScope: 'fixture', active: true, onInactive(fn) { inactive.add(fn); return () => inactive.delete(fn); } };
  w.CEUIDialog = { create() { return { async confirm(options) { state.confirmCalls.push(options.message); return typeof state.confirm === 'function' ? state.confirm(options) : state.confirm; }, dispose() {} }; } };
  w.eval(source);
  const fetchJson = async url => {
    reads.push(url);
    if (state.response) await state.response;
    if (url === '/api/workspace/agents') { if (state.failRegistry) throw new Error('Registry unavailable'); return { revision: state.revision, items: clone(state.rows), tokens: clone(state.tokens) }; }
    assert.equal(url, '/api/workspace'); if (state.failProjects) throw new Error('Projects unavailable');
    return { projects: { status: 'available', items: clone(state.projects) } };
  };
  const postJson = async (url, body) => {
    writes.push({ url, body: clone(body) }); if (state.response) await state.response;
    if (state.failSave) throw new Error('409 config_conflict');
    if (url === '/api/workspace/agents/token') { state.revision++; state.tokens[body.id] = { has_token: true }; return { token: 'synthetic-secret-once', agents: { revision: state.revision, items: clone(state.rows), tokens: clone(state.tokens) } }; }
    assert.equal(url, '/api/workspace/agents'); assert.equal(body.expected_revision, state.revision);
    state.rows = clone(body.items).map((item, index) => ({ ...item, id: item.id || 'new-' + index })); state.revision++;
    return { revision: state.revision, items: clone(state.rows), tokens: clone(state.tokens) };
  };
  let controller;
  const open = () => controller = w.WorkspaceAgents.openAccess({ host, fetchJson, postJson, isCurrent: () => state.current, restoreFocus: () => state.restored++ });
  const el = selector => host.querySelector(selector);
  const click = async text => { const button = [...host.querySelectorAll('button')].find(node => node.textContent === text); assert.ok(button, text); button.click(); await tick(); };
  const change = (selector, checked) => { const input = el(selector); assert.ok(input, selector); input.checked = checked; input.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const submit = async () => { el('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick(); };
  t.after(() => { controller?.dispose(); w.happyDOM.abort(); });
  return { w, host, state, reads, writes, open, el, click, change, submit, deactivate() { w.CERemoteContext.active = false; for (const fn of [...inactive]) fn(); } };
}

test('legacy page has only a link and latest settings has one optional access row', () => {
  assert.doesNotMatch(html, /id="agent-form"|id="agent-kind"|id="agent-adapter"|旧执行配置/);
  assert.match(html, /href="\/studio#settings\/sources">外部程序接入/);
  const shell = fs.readFileSync(path.join(root, 'web/workspace/studio-shell.js'), 'utf8');
  assert.equal((shell.match(/data-action="external-access"/g) || []).length, 1);
  assert.doesNotMatch(shell, /id="agent-form"|agent-command|agent-permission/);
});

test('opens immediately, loads only on demand, and has one modal instance', async t => {
  const f = await fixture(t); assert.equal(f.reads.length, 0);
  let resolve; f.state.response = new Promise(done => resolve = done);
  const first = f.open(); assert.equal(f.el('dialog').open, true); assert.match(f.host.textContent, /正在读取/);
  assert.equal(f.open(), first); assert.equal(f.host.querySelectorAll('dialog').length, 1);
  resolve(); await tick(); assert.match(f.host.textContent, /暂无接入/);
  assert.deepEqual(f.reads.sort(), ['/api/workspace', '/api/workspace/agents']);
});

test('new access has name and project only and an empty scope never means all projects', async t => {
  const f = await fixture(t); f.open(); await tick(); await f.click('添加');
  assert.equal(f.el('[name="name"]').value, ''); assert.equal(f.el('form').querySelectorAll('input:not([type="checkbox"])').length, 1);
  assert.doesNotMatch(f.host.textContent, /兼容|联网|审批|命令|模型|启用/);
  f.el('[name="name"]').value = 'Checker'; await f.submit(); assert.equal(f.writes.length, 0); assert.match(f.host.textContent, /请选择项目/);
  f.change('[data-project-id="p-a"]', true); await f.submit();
  assert.deepEqual(f.writes[0].body.items[0], { id: null, kind: 'custom', command: null, enabled: true, name: 'Checker', project_ids: ['p-a'] });
});

test('name-only edit preserves old parameters, unknown projects, and token state', async t => {
  const row = { ...first, project_ids: ['unknown-project'] };
  const f = await fixture(t, [row]); f.state.tokens[row.id] = { has_token: true, prefix: 'synthetic' }; f.state.failProjects = true;
  f.open(); await tick(); await f.click('编辑'); assert.match(f.host.textContent, /unknown-project/);
  f.el('[name="name"]').value = 'Renamed'; await f.submit();
  assert.deepEqual(f.writes[0].body.items[0], { ...row, name: 'Renamed' });
  assert.equal(f.state.tokens[row.id].has_token, true); assert.equal(f.state.confirmCalls.length, 0);
});

test('explicit all-project access confirms and cancellation preserves draft', async t => {
  const f = await fixture(t, [first]); f.open(); await tick(); await f.click('编辑');
  f.el('[name="name"]').value = 'Draft'; f.change('.ce-access-project-options input', true); f.state.confirm = false;
  await f.submit(); assert.equal(f.writes.length, 0); assert.match(f.state.confirmCalls[0], /包括以后新增/); assert.equal(f.el('[name="name"]').value, 'Draft');
  f.state.confirm = true; await f.submit(); assert.deepEqual(f.writes[0].body.items[0].project_ids, []);
});

test('stale confirmation cannot submit changed authorization or a changed context', async t => {
  const f = await fixture(t, [first]); f.open(); await tick(); await f.click('编辑'); f.change('[data-project-id="p-b"]', true);
  let resolve; f.state.confirm = () => new Promise(done => resolve = done);
  const save = f.submit(); await tick(); f.el('[name="name"]').value = 'Changed while confirming'; resolve(true); await save; assert.equal(f.writes.length, 0);
  const second = f.submit(); await tick(); f.state.current = false; resolve(true); await second; assert.equal(f.writes.length, 0);
});

test('failed save keeps original revision and draft for explicit correction', async t => {
  const f = await fixture(t, [first]); f.open(); await tick(); await f.click('编辑'); f.state.failSave = true;
  f.el('[name="name"]').value = 'Draft'; await f.submit(); assert.equal(f.writes[0].body.expected_revision, 2);
  assert.equal(f.el('[name="name"]').value, 'Draft'); assert.match(f.host.textContent, /409/);
});

test('row actions stop access and rotate credentials through existing APIs only', async t => {
  const f = await fixture(t, [first]); f.open(); await tick(); await f.click('停用');
  assert.equal(f.writes[0].body.items[0].enabled, false); assert.equal(f.writes[0].body.items[0].command, first.command);
  await f.click('生成凭据'); assert.equal(f.writes[1].url, '/api/workspace/agents/token'); assert.equal(f.el('[data-access-token]').value, 'synthetic-secret-once');
  assert.match(f.host.textContent, /仅显示一次/); await f.click('完成'); assert.equal(f.el('[data-access-token]'), null);
  await f.click('更换凭据'); assert.match(f.state.confirmCalls.at(-1), /旧凭据立即失效/);
  const tokenInput = f.el('[data-access-token]'); f.deactivate(); assert.equal(tokenInput.value, ''); assert.equal(f.el('dialog'), null);
});

test('close clears secrets and late responses cannot recreate the modal', async t => {
  const f = await fixture(t, [first]); let resolve; f.state.response = new Promise(done => resolve = done);
  const controller = f.open(); await controller.requestClose(); assert.equal(f.el('dialog'), null);
  resolve(); await tick(); assert.equal(f.el('dialog'), null); assert.equal(f.state.restored, 1);
});

test('dirty close asks once, preserves declined draft, and busy write blocks closure', async t => {
  const f = await fixture(t); const controller = f.open(); await tick(); await f.click('添加'); f.el('[name="name"]').value = 'Draft';
  f.state.confirm = false; assert.equal(await controller.requestClose(), false); assert.equal(f.el('[name="name"]').value, 'Draft');
  f.change('[data-project-id="p-a"]', true); let resolve; f.state.response = new Promise(done => resolve = done);
  const saving = f.submit(); await tick(); assert.equal(await controller.requestClose(), false); resolve(); await saving; await tick();
  assert.equal(await controller.requestClose(), true);
});

test('legacy initialization remains safe without the retired form and keeps shared choice helpers', async t => {
  const f = await fixture(t); f.w.WorkspaceAgentBoard = { mount: () => null };
  let reads = 0; const controller = f.w.WorkspaceAgents.init({ fetchJson: async () => { reads++; return { revision: 0, items: [] }; }, postJson: async () => {} });
  await controller.load(); assert.equal(reads, 1); assert.equal(typeof f.w.WorkspaceAgents.attachCollectionChoice, 'function'); assert.equal(f.el('form'), null);
});


test('a credential response from a retired context never exposes its secret', async t => {
  const f = await fixture(t, [first]); f.open(); await tick();
  let resolve; f.state.response = new Promise(done => resolve = done);
  await f.click('生成凭据'); assert.equal(f.writes.length, 1);
  f.deactivate(); resolve(); await tick();
  assert.equal(f.el('dialog'), null); assert.doesNotMatch(f.host.textContent, /synthetic-secret/);
});
