'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const Creator = require('../../web/workspace/creator.js');
const html = fs.readFileSync(path.join(__dirname, '../../web/workspace/creator.html'), 'utf8');
const A = '1'.repeat(32), B = '2'.repeat(32), C = '3'.repeat(32);

class Element {
  constructor(tag = 'div') { this.tagName = tag; this.listeners = {}; this.dataset = {}; this.attributes = {}; this.children = []; this._text = ''; this.value = ''; this.hidden = false; this.disabled = false; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  removeEventListener(name) { delete this.listeners[name]; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'href') delete this.href; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = children; }
  set textContent(value) { this._text = value; this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  set innerHTML(_) { throw new Error('Remote text must never be rendered as HTML'); }
}
function project(id = A, name = '合成工程', kind = '3d') { return {id, name, kind, project_path: `fixture/${id}/project`, user_data_key: `ControlEverythingCreator/${id}`}; }
function detail(projectValue) { return {project: projectValue, files: [{path: 'main.tscn', kind: 'scene'}, {path: 'game.gd', kind: 'script'}], files_truncated: false, brief: `${projectValue.name}的说明`}; }
function state(projects = []) {
  return {version: 2, csrf_token: 'synthetic-csrf-do-not-copy', library_path: 'fixture/library', projects,
    agent: {mode: 'workbench_client', client_url: '', connection_state: 'unverified', can_submit: false},
    capabilities: {create: true, edit: true, play: true, check: true}, busy_project_ids: [], operations: {edit: null, play: null, check: null}};
}
function operation(action = 'play', projectId = A, fields = {}) {
  return {run_id: `${action}-fixture-run`, project_id: projectId, action, state: 'running', pid: 123, exit_code: null, verified: null, reason: '', result: null, ...fields};
}
function checkResult(fields = {}) {
  return {scope: 'godot_import', passed: true, checks: [{name: 'engine_log', passed: true, detail: 'No errors'}], log_path: 'fixture/runs/check/engine.log', checked_at: '2026-10-23T00:00:00Z', ...fields};
}
function response(body, status = 200) { return {ok: status < 400, status, json: async () => structuredClone(body)}; }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; }

async function fixture(initial = state()) {
  const keys = [...html.matchAll(/data-creator="([^"]+)"/g)].map(match => match[1]);
  const elements = Object.fromEntries(keys.map(key => [key, new Element()]));
  elements['project-kind'].value = '3d'; elements['context-panel'].hidden = true;
  const root = new Element(); root.dataset.theme = 'light'; root.querySelector = selector => elements[selector.match(/"(.+)"/)[1]];
  const document = {hidden: false, listeners: {}, createElement: tag => new Element(tag), addEventListener(name, handler) { this.listeners[name] = handler; }, removeEventListener(name) { delete this.listeners[name]; }};
  const requests = [], timers = new Map(), copied = []; let nextTimer = 0;
  const themeKeys = [], themeMounts = [], themeDisposals = [];
  const appearance = {earlyRead(key) { themeKeys.push(key); return {mount(options) { themeMounts.push(options); options.roots[0].dataset.theme = 'light'; const toggle = options.toggles[0]; toggle.addEventListener('click', () => { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; }); return () => toggle.removeEventListener('click'); }, dispose() { themeDisposals.push(key); }}; }};
  const f = {elements, root, document, requests, timers, copied, themeKeys, themeMounts, themeDisposals, state: initial, details: new Map(initial.projects.map(value => [value.id, detail(value)]))};
  f.controller = Creator.create({root, document, appearance, serviceOrigin: 'http://127.0.0.1:8770', clipboard: {writeText: async text => { if (f.copyHandler) return f.copyHandler(text); copied.push(text); }},
    fetch: async (url, request) => {
      requests.push({url, ...request});
      if (request.method === 'POST') {
        const body = JSON.parse(request.body);
        if (f.post) return f.post(url, body);
        if (url === '/api/creator/projects') {
          const value = project(C, body.name, body.kind); f.state.projects.push(value); f.details.set(C, detail(value)); return response({project: value}, 201);
        }
        if (url === '/api/creator/brief') { f.details.get(body.project_id).brief = body.text; return response({project_id: body.project_id, saved: true}); }
        f.state.operations[body.action] = operation(body.action, body.project_id); f.state.capabilities[body.action] = false; f.state.busy_project_ids = [body.project_id];
        return response({run_id: `${body.action}-fixture-run`, state: 'starting'}, 202);
      }
      if (url === '/api/creator/state') {
        if (f.stateHandler) return f.stateHandler();
        if (f.stateError) return response({error: 'unavailable', message: f.stateError}, 503);
        return response(f.state);
      }
      const id = url.split('/').at(-1);
      return f.detailHandler ? f.detailHandler(id) : response(f.details.get(id));
    },
    setTimeout: (handler, delay) => { const id = ++nextTimer; timers.set(id, {handler, delay}); return id; }, clearTimeout: id => timers.delete(id)
  });
  await f.controller.ready;
  f.typeBrief = text => { elements.brief.value = text; elements.brief.listeners.input(); };
  f.visibility = hidden => { document.hidden = hidden; document.listeners.visibilitychange(); };
  f.poll = async () => { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.handler(); await f.controller.refreshState(); };
  return f;
}

test('validates v2 projects, ownership, capabilities and unconfigured workbench client strictly', () => {
  assert.equal(Creator.validateState(state()).version, 2);
  const corruptions = [
    value => { value.version = 1; }, value => { value.csrf_token = ''; }, value => { value.projects = [project(), project()]; },
    value => { value.projects = [project('../escape')]; }, value => { value.busy_project_ids = ['not-id']; },
    value => { value.capabilities.check = 'true'; }, value => { delete value.operations.edit; },
    value => { value.operations.check = operation('check', A, {verified: 'true'}); },
    value => { value.operations.play = operation('play', A, {verified: true}); },
    value => { value.operations.play = operation('play', A, {pid: '123'}); },
    value => { value.agent.can_submit = true; }, value => { value.agent.client_url = 'javascript:alert(1)'; },
    value => { value.agent.client_url = 'https://example.test/?token=synthetic'; }
  ];
  for (const corrupt of corruptions) { const value = state(); corrupt(value); assert.throws(() => Creator.validateState(value)); }
  assert.throws(() => Creator.validateDetail(detail(project()), B));
});

test('empty library is real, reads once, does not create or launch and hides missing Agent URL', async () => {
  const f = await fixture();
  assert.equal(f.requests.length, 1); assert.equal(f.timers.size, 0);
  assert.equal(f.elements.projects.children.length, 0);
  assert.match(f.elements['library-empty'].textContent, /空/);
  assert.equal(f.elements.create.disabled, false); assert.equal(f.elements.edit.disabled, true);
  assert.equal(f.elements['agent-open'].hidden, true);
  assert.match(f.elements['agent-status'].textContent, /项目工作区接入待配置/);
  assert.equal(f.requests.filter(item => item.method === 'POST').length, 0);
});

test('creates only requested name and 2D/3D kind, then opens the returned managed project', async () => {
  for (const kind of ['2d', '3d']) {
    const f = await fixture(); await f.controller.createProject('名字 "quoted" \\ path', kind);
    const post = f.requests.find(item => item.method === 'POST');
    assert.equal(post.url, '/api/creator/projects');
    assert.deepEqual(JSON.parse(post.body), {name: '名字 "quoted" \\ path', kind});
    assert.equal(post.headers['X-Creator-CSRF'], 'synthetic-csrf-do-not-copy');
    assert.equal(f.elements.name.textContent, '名字 "quoted" \\ path');
    assert.equal(f.elements.kind.textContent, `${kind.toUpperCase()} · GODOT 工程`);
    assert.equal(f.requests.some(item => item.url === '/api/creator/action'), false);
  }
  const f = await fixture(); await f.controller.createProject('bad\nname', '3d');
  assert.equal(f.requests.length, 1); assert.match(f.elements.message.textContent, /换行/);
});

test('switches managed projects without mixing unsaved briefs or selected resource paths', async () => {
  const f = await fixture(state([project(A, '工程甲'), project(B, '工程乙')]));
  await f.controller.selectProject(A); f.typeBrief('甲的新草稿');
  const input = f.elements.files.children[0].children[0]; input.checked = true; input.listeners.change();
  await f.controller.selectProject(B); assert.equal(f.elements.brief.value, '工程乙的说明'); f.typeBrief('乙的新草稿');
  await f.controller.selectProject(A);
  assert.equal(f.elements.brief.value, '甲的新草稿'); assert.equal(f.elements.files.children[0].children[0].checked, true);
  await f.controller.copyContext(); assert.match(f.copied[0], /甲的新草稿/); assert.doesNotMatch(f.copied[0], /乙的新草稿/);
  await f.controller.selectProject(B); assert.equal(f.elements.brief.value, '乙的新草稿'); assert.equal(f.elements.files.children[0].children[0].checked, false);
});

test('late project detail cannot replace a newer selection', async () => {
  const f = await fixture(state([project(A, '甲'), project(B, '乙')])); const delayed = deferred();
  f.detailHandler = id => id === A ? delayed.promise : response(f.details.get(id));
  const first = f.controller.selectProject(A); await f.controller.selectProject(B);
  delayed.resolve(response(f.details.get(A))); await first;
  assert.equal(f.elements.name.textContent, '乙'); assert.equal(f.elements.brief.value, '乙的说明');
});

test('brief saves bind the original project, preserve later edits and reject mismatched receipts', async () => {
  const f = await fixture(state([project(A, '甲'), project(B, '乙')]));
  await f.controller.selectProject(A); f.typeBrief('保存甲');
  const delayed = deferred(); f.post = () => delayed.promise;
  const saving = f.controller.saveBrief(); f.typeBrief('甲的后续草稿'); await f.controller.selectProject(B);
  delayed.resolve(response({project_id: A, saved: true})); await saving;
  assert.deepEqual(JSON.parse(f.requests.find(item => item.method === 'POST').body), {project_id: A, text: '保存甲'});
  assert.equal(f.elements.brief.value, '乙的说明'); await f.controller.selectProject(A); assert.equal(f.elements.brief.value, '甲的后续草稿');
  assert.match(f.elements['draft-state'].textContent, /未保存/);
  f.post = () => response({project_id: B, saved: true}); await f.controller.saveBrief();
  assert.match(f.elements.message.textContent, /不匹配/); assert.match(f.elements['draft-state'].textContent, /未保存/);
});

test('native actions use the selected project and require both global availability and project admission', async () => {
  const input = state([project(A, '甲'), project(B, '乙')]); input.busy_project_ids = [A]; input.capabilities.check = false;
  input.operations.check = operation('check', A);
  const f = await fixture(input); await f.controller.selectProject(A);
  for (const key of ['edit', 'play', 'check']) assert.equal(f.elements[key].disabled, true);
  await f.controller.selectProject(B); assert.equal(f.elements.edit.disabled, false); assert.equal(f.elements.play.disabled, false); assert.equal(f.elements.check.disabled, true);
  await f.controller.sendAction('edit');
  assert.deepEqual(JSON.parse(f.requests.find(item => item.method === 'POST').body), {project_id: B, action: 'edit'});
  assert.match(f.elements.message.textContent, /请求已发送/); assert.equal(f.elements.edit.disabled, true);
  assert.match(f.elements.operations.textContent, /甲 · 资源导入检查/); assert.match(f.elements.operations.textContent, /乙 · Godot 编辑器/);
  assert.equal(f.elements.name.textContent, '乙'); f.controller.dispose();
});

test('pending action receipts prevent repeated requests without claiming launch or checks succeeded', async () => {
  const f = await fixture(state([project()])); await f.controller.selectProject(A);
  const pending = deferred(); f.post = () => pending.promise;
  const start = f.controller.sendAction('play'); await f.controller.sendAction('play');
  assert.equal(f.requests.filter(item => item.method === 'POST').length, 1);
  pending.resolve(response({run_id: 'pending-run', state: 'starting'}, 202)); await start;
  assert.equal(f.elements.play.disabled, false); assert.equal(f.elements.edit.disabled, false); assert.equal(f.timers.size, 0);
  assert.match(f.elements.message.textContent, /请求已发送/); assert.doesNotMatch(f.elements.message.textContent, /检查通过|已启动/);
  f.controller.dispose();
});

test('authoritative state reconciles an accepted run superseded by another caller', async () => {
  const f = await fixture(state([project(A, '甲'), project(B, '乙')])); await f.controller.selectProject(A);
  f.post = () => {
    f.state.operations.play = operation('play', B, {run_id: 'later-run'});
    f.state.busy_project_ids = [B]; f.state.capabilities.play = false;
    return response({run_id: 'accepted-run', state: 'starting'}, 202);
  };
  await f.controller.sendAction('play');
  assert.equal(f.elements.play.disabled, true, 'The later owned play still occupies the global action');
  assert.equal(f.elements.edit.disabled, false, 'The original project must no longer be marked pending');
  assert.equal(f.elements.check.disabled, false);
  f.state.operations.play = operation('play', B, {run_id: 'later-run', state: 'exited', exit_code: 0});
  f.state.busy_project_ids = []; f.state.capabilities.play = true;
  await f.controller.refresh();
  assert.equal(f.elements.play.disabled, false); assert.equal(f.timers.size, 0);
  assert.equal(f.elements.name.textContent, '甲');
});

test('a state GET already in flight before POST acceptance cannot clear a new pending run', async () => {
  const f = await fixture(state([project()])); await f.controller.selectProject(A);
  const oldState = structuredClone(f.state), stale = deferred();
  f.stateHandler = () => stale.promise;
  const olderRead = f.controller.refreshState();
  f.post = () => response({run_id: 'accepted-run', state: 'starting'}, 202);
  const starting = f.controller.sendAction('play');
  await new Promise(resolve => setImmediate(resolve));
  stale.resolve(response(oldState)); await olderRead; await starting;
  assert.equal(f.elements.play.disabled, true); assert.equal(f.elements.edit.disabled, true); assert.equal(f.timers.size, 1);
  delete f.stateHandler;
  f.state.operations.play = operation('play', A, {run_id: 'later-run', state: 'exited', exit_code: 0});
  await f.poll();
  assert.equal(f.elements.play.disabled, false); assert.equal(f.elements.edit.disabled, false); assert.equal(f.timers.size, 0);
});

test('reports only completed godot_import checks as passing and never invents game save results', () => {
  const passed = operation('check', A, {state: 'exited', exit_code: 0, verified: true, result: checkResult()});
  assert.equal(Creator.describe('check', passed), '本次资源导入检查通过');
  for (const fields of [{state: 'failed'}, {exit_code: 1}, {verified: 'true'}, {result: checkResult({scope: 'gameplay'})}, {result: checkResult({passed: 'true'})}, {result: checkResult({checks: []})}, {result: checkResult({checks: [{name: 'log', passed: false, detail: 'bad'}]})}]) {
    assert.notEqual(Creator.describe('check', {...passed, ...fields}), '本次资源导入检查通过');
  }
  assert.equal(Creator.describe('play', operation('play', A, {state: 'exited', exit_code: 0, result: {saved: true}})), '进程已退出');
});

test('polls only visible activity every two seconds without repeatedly scanning project files', async () => {
  const input = state([project()]); input.operations.play = operation(); input.busy_project_ids = [A]; input.capabilities.play = false;
  const f = await fixture(input); await f.controller.selectProject(A);
  assert.equal(f.timers.values().next().value.delay, 2000); await f.poll();
  assert.equal(f.requests.filter(item => item.url.includes('/projects/')).length, 1);
  f.visibility(true); assert.equal(f.timers.size, 0); f.visibility(false); await f.controller.refreshState();
  assert.equal(f.requests.filter(item => item.url.includes('/projects/')).length, 1);
  f.state.operations.play = operation('play', A, {state: 'exited', exit_code: 0}); f.state.busy_project_ids = []; f.state.capabilities.play = true;
  await f.poll(); assert.equal(f.timers.size, 0);
  f.controller.dispose(); assert.equal(f.requests.filter(item => item.method === 'POST').length, 0); assert.deepEqual(Object.keys(f.document.listeners), []);
});

test('failed operations with owned busy projects continue observation until the service releases them', async () => {
  const input = state([project()]); input.operations.check = operation('check', A, {state: 'failed', verified: false}); input.busy_project_ids = [A]; input.capabilities.check = false;
  const f = await fixture(input); assert.equal(f.timers.size, 1);
  f.state.busy_project_ids = []; f.state.capabilities.check = true; await f.poll(); assert.equal(f.timers.size, 0);
});

test('copies true project context with a token-free local check contract and selected paths', async () => {
  const f = await fixture(state([project()])); await f.controller.selectProject(A); f.typeBrief('增加可编辑场景');
  const input = f.elements.files.children[1].children[0]; input.checked = true; input.listeners.change(); await f.controller.copyContext();
  const text = f.copied[0]; assert.match(text, new RegExp(`项目 ID：${A}`)); assert.match(text, /fixture\/111.*\/project/);
  assert.match(text, /增加可编辑场景/); assert.match(text, /- game.gd/); assert.doesNotMatch(text, /- main.tscn/);
  assert.match(text, /http:\/\/127.0.0.1:8770/); assert.match(text, /GET \/api\/creator\/state/); assert.match(text, /X-Creator-CSRF/);
  assert.match(text, new RegExp(`"project_id":"${A}","action":"check"`)); assert.doesNotMatch(text, /synthetic-csrf-do-not-copy/);
  assert.match(f.elements.message.textContent, /已复制/); assert.doesNotMatch(f.elements.message.textContent, /已发送|已连接/);
});

test('clipboard rejection reveals selectable manual text and late failure does not leak another project context', async () => {
  const f = await fixture(state([project(A, '甲'), project(B, '乙')])); await f.controller.selectProject(A);
  f.copyHandler = () => Promise.reject(new Error('denied')); await f.controller.copyContext();
  assert.equal(f.elements['context-panel'].open, true); assert.equal(f.elements.context.selected, true); assert.match(f.elements.message.textContent, /手动复制/);
  const pending = deferred(); f.copyHandler = () => pending.promise;
  const copying = f.controller.copyContext(); await f.controller.selectProject(B); pending.reject(new Error('late denial')); await copying;
  assert.equal(f.elements['context-panel'].hidden, true); assert.equal(f.elements.name.textContent, '乙');
});

test('configured Agent entry is only the supplied ordinary URL and never claims a connected session', async () => {
  const input = state([project()]); input.agent.client_url = 'https://workbench.example.test/projects/';
  const f = await fixture(input); await f.controller.selectProject(A);
  assert.equal(f.elements['agent-open'].hidden, false); assert.equal(f.elements['agent-open'].href, input.agent.client_url);
  assert.match(f.elements['agent-status'].textContent, /尚未自动发送或绑定/); assert.doesNotMatch(f.elements['agent-status'].textContent, /已连接/);
});

test('remote names, paths, briefs, errors and check logs remain bounded text; scan truncation stays visible', async () => {
  const input = state([project(A, '<img onerror=alert(1)>')]); input.operations.check = operation('check', A, {state: 'failed', exit_code: 0, verified: false, reason: '<b>bad import</b>', result: checkResult({passed: false, checks: [{name: 'error', passed: false, detail: '<script>error</script>'}]})});
  const f = await fixture(input); f.details.get(A).brief = '<b>brief</b>'; f.details.get(A).files = [{path: '<img>.tscn', kind: 'scene'}]; f.details.get(A).files_truncated = true;
  await f.controller.selectProject(A); assert.equal(f.elements.name.textContent, input.projects[0].name); assert.equal(f.elements.brief.value, '<b>brief</b>');
  assert.match(f.elements.files.textContent, /<img>.tscn/); assert.match(f.elements['files-note'].textContent, /部分结果/);
  assert.match(f.elements.operations.textContent, /<script>error<\/script>/);
  f.stateError = '<b>library unavailable</b>' + 'x'.repeat(3000); await f.controller.refreshState();
  assert.equal(f.elements.create.disabled, true); assert.equal(f.elements.edit.disabled, true); assert.equal(f.elements.help.hidden, false);
  assert.match(f.elements['library-empty'].textContent, /尚未读取成功/); assert.ok(f.elements.message.textContent.length <= 1200); assert.equal(f.timers.size, 0);
});

test('manual refresh rereads selected files but keeps unsaved text; state-only updates preserve selection', async () => {
  const f = await fixture(state([project()])); await f.controller.selectProject(A); f.typeBrief('保留这段草稿');
  f.details.get(A).files.push({path: 'new.tscn', kind: 'scene'}); await f.controller.refresh();
  assert.equal(f.elements.brief.value, '保留这段草稿'); assert.equal(f.elements.files.children.length, 3);
  assert.equal(f.requests.filter(item => item.url.includes('/projects/')).length, 2);
  f.elements.theme.listeners.click(); assert.equal(f.root.dataset.theme, 'dark');
  await f.controller.refreshState(); assert.equal(f.elements.brief.value, '保留这段草稿'); assert.equal(f.requests.filter(item => item.url.includes('/projects/')).length, 2);
});

test('page includes actual project controls and standalone resources without fake editor or old game protocol', () => {
  assert.deepEqual([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]), ['/ui-theme.js', '/creator.js']);
  assert.deepEqual([...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map(match => match[1]), ['/studio-preview.css', '/creator.css']);
  assert.match(html, /<h1 id="creator-title">游戏创作<\/h1>/); assert.match(html, /data-creator="create-form"/);
  assert.match(html, /data-creator="message" role="status"/); assert.match(html, /data-creator="context" readonly/);
  assert.doesNotMatch(html, /<iframe|<canvas|Orca|save_exit|体素|海岸|花园|一键生成/);
  const script = fs.readFileSync(path.join(__dirname, '../../web/workspace/creator.js'), 'utf8');
  assert.doesNotMatch(script, /innerHTML|save_exit|ce-mode|verify_write|verify_read/);
});

test('four real panels use manual tabs, arrow keys move focus and activation keeps the current project draft',async()=>{
  const f=await fixture(state([project()]));await f.controller.selectProject(A);f.typeBrief('切换时保留说明');
  const tab=f.elements['tab-engine'];let prevented=0;
  tab.listeners.keydown({key:'ArrowRight',preventDefault(){prevented++;}});
  assert.equal(prevented,1);assert.equal(f.elements['tab-brief'].focused,true);assert.equal(tab.attributes['aria-selected'],'true');assert.equal(f.elements['panel-brief'].hidden,true);
  f.elements['tab-brief'].listeners.keydown({key:'Enter',preventDefault(){}});
  assert.equal(f.elements['tab-brief'].attributes['aria-selected'],'true');assert.equal(f.elements['panel-brief'].hidden,false);assert.equal(f.elements['panel-engine'].hidden,true);assert.equal(f.elements.brief.value,'切换时保留说明');
  f.elements['tab-resources'].disabled=true;f.elements['tab-brief'].listeners.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(f.elements['tab-runs'].focused,true);
  f.elements['tab-runs'].listeners.keydown({key:' ',preventDefault(){}});assert.equal(f.elements['panel-runs'].hidden,false);assert.equal(f.elements['panel-brief'].hidden,true);
  f.elements['tab-runs'].listeners.keydown({key:'Home',preventDefault(){}});assert.equal(tab.focused,true);
  f.elements['tab-brief'].listeners.click();assert.equal(f.elements.brief.value,'切换时保留说明');assert.equal(f.requests.filter(r=>r.method==='POST').length,0);
  for(const name of ['engine','brief','resources','runs']){
    assert.match(html,new RegExp(`role="tab" id="creator-tab-${name}"[^>]*aria-controls="creator-panel-${name}"`));
    assert.match(html,new RegExp(`id="creator-panel-${name}" role="tabpanel" aria-labelledby="creator-tab-${name}"`));
  }
  f.controller.dispose();assert.deepEqual(f.themeKeys,['ce.creator.theme']);assert.equal(f.themeMounts[0].roots[0],f.root);assert.equal(f.themeDisposals.length,1);assert.equal(f.elements['tab-brief'].listeners.click,undefined);
});

test('failed project reads cannot overwrite another saved draft or selected resources',async()=>{
  const f=await fixture(state([project(A,'甲'),project(B,'乙')]));await f.controller.selectProject(B);f.typeBrief('乙的保留草稿');
  const input=f.elements.files.children[0].children[0];input.checked=true;input.listeners.change();
  await f.controller.selectProject(A);f.typeBrief('甲的新稿');
  f.detailHandler=id=>id===B?response({message:'合成读取失败'},503):response(f.details.get(id));
  await f.controller.selectProject(B);assert.equal(f.elements['project-panel'].hidden,true);assert.match(f.elements.message.textContent,/读取失败/);
  await f.controller.selectProject(A);assert.equal(f.elements.brief.value,'甲的新稿');delete f.detailHandler;await f.controller.selectProject(B);
  assert.equal(f.elements.brief.value,'乙的保留草稿');assert.equal(f.elements.files.children[0].children[0].checked,true);
});

test('brief rejection leaves the draft visible in its panel with field error and no successful receipt',async()=>{
  const f=await fixture(state([project()]));await f.controller.selectProject(A);f.typeBrief('服务拒绝也保留');
  f.elements['tab-resources'].listeners.click();f.post=()=>response({message:'合成保存失败'},409);await f.controller.saveBrief();
  assert.equal(f.elements.brief.value,'服务拒绝也保留');assert.match(f.elements['draft-state'].textContent,/未保存/);assert.equal(f.elements['panel-brief'].hidden,false);assert.equal(f.elements.brief.attributes['aria-invalid'],'true');assert.equal(f.elements.brief.attributes['aria-describedby'],'creator-message');assert.equal(f.elements.brief.focused,true);
});

test('library search and kind filter remain local and do not replace the selected project or its draft',async()=>{
  const f=await fixture(state([project(A,'甲工程','2d'),project(B,'乙工程','3d')]));await f.controller.selectProject(A);f.typeBrief('筛选中保留');
  const before=f.requests.length;f.elements['project-search'].value='乙';f.elements['project-search'].listeners.input();assert.equal(f.elements.projects.children.length,1);assert.equal(f.elements.projects.children[0].dataset.projectId,B);assert.equal(f.elements.brief.value,'筛选中保留');
  f.elements['project-filter'].value='2d';f.elements['project-filter'].listeners.change();assert.equal(f.elements.projects.children.length,0);assert.equal(f.elements['project-no-match'].hidden,false);assert.equal(f.requests.length,before);
  f.elements['project-search'].value='';f.elements['project-filter'].value='';f.elements['project-filter'].listeners.change();assert.equal(f.elements.projects.children.length,2);assert.equal(f.elements.name.textContent,'甲工程');
});

test('returning to the card library keeps the project draft and creation cancel keeps its input', async () => {
  const f = await fixture(state([project(A), project(B, '另一工程', '2d')]));
  assert.equal(f.root.dataset.view, 'library');
  assert.equal(f.elements['run-history'].open, false);
  assert.equal(f.elements['run-history'].hidden, false);
  await f.controller.selectProject(A); f.typeBrief('保留的创作草稿');
  const requests = f.requests.length;
  f.elements['back-library'].listeners.click();
  assert.equal(f.root.dataset.view, 'library');
  assert.equal(f.requests.length, requests);
  assert.equal(f.elements['project-search'].focused, true);
  f.elements.new.listeners.click(); f.elements['project-name'].value = '未提交的工程名';
  assert.equal(f.elements.new.attributes['aria-expanded'], 'true');
  f.elements['cancel-create'].listeners.click();
  assert.equal(f.elements['create-form'].hidden, true);
  assert.equal(f.elements.new.attributes['aria-expanded'], 'false');
  assert.equal(f.elements['project-name'].value, '未提交的工程名');
  assert.equal(f.elements.new.focused, true);
  await f.controller.selectProject(A);
  assert.equal(f.root.dataset.view, 'project');
  assert.equal(f.elements.brief.value, '保留的创作草稿');
  f.elements['tab-runs'].listeners.click();
  assert.equal(f.elements['run-history'].open, true);
  assert.equal(f.elements['run-history'].hidden, false);
  assert.equal(f.elements['panel-runs'].hidden, false);
});

test('returning to the library retires an in-flight project read', async () => {
  const f = await fixture(state([project(A)]));
  const pending = deferred(); f.detailHandler = () => pending.promise;
  const selecting = f.controller.selectProject(A);
  f.elements['back-library'].listeners.click();
  pending.resolve(response(detail(project(A)))); await selecting;
  assert.equal(f.root.dataset.view, 'library');
  assert.equal(f.elements['project-panel'].hidden, true);
  assert.equal(f.requests.filter(request => request.method === 'POST').length, 0);
});
