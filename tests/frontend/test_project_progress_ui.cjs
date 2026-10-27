// Pure DOM/request contracts; no browser, runtime, or personal project data.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {}; this.value = ''; this.text = ''; this.scrollTop = 0; this.classList = { add() {}, toggle() {} }; }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.text = ''; this.append(...nodes); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(node => node.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  get all() { return [this, ...this.children.flatMap(node => node.all)]; }
  querySelectorAll(selector) { return this.all.filter(node => selector.startsWith('#') ? node.id === selector.slice(1) : selector.startsWith('[data-task-id=') ? node.dataset.taskId === selector.split('"')[1] : node.tagName === selector); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  focus() {} showModal() { this.open = true; } close() { this.open = false; }
}
function fixture(options = {}) {
  const root = new Element('section'), posts = [], reads = [], events = [];
  let tokens = 0;
  const window = { crypto: { randomUUID: () => 'token-' + ++tokens }, addEventListener() {}, removeEventListener() {}, dispatchEvent: event => { events.push(event); return false; } };
  const context = { window, document: { createElement: tag => new Element(tag) }, URL, URLSearchParams, console,
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } } };
  for (const file of ['project-progress-model.js', 'project-progress.js']) vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/' + file), 'utf8'), context);
  const item = { id: 'task-1', title: '修复过滤器', project_id: 'project-a', state: 'doing', revision: 4, progress_revision: 2, current_delivery_id: 'delivery-1' };
  const facts = { item, native_run: { id: 'run-1', active_slot: 1, provider_session_id: 'session-1', observation_state: 'idle' }, current_delivery: { id: 'delivery-1', summary: '过滤器已调整', material: { tests: { status: 'missing' } } }, capabilities: { can_review: true, can_feedback: true, can_send_feedback: true }, messages: [] };
  Object.assign(facts, options.facts || {});
  const fetchJson = async url => { reads.push(url); if (options.fetch) return options.fetch(url, facts); if (url.includes('/progress')) return JSON.parse(JSON.stringify(facts)); if (url.includes('/agent-tasks/')) return { item, review_material: { tests: { status: 'missing' }, sessions: options.sessions || [] } }; throw new Error('unexpected ' + url); };
  const postJson = async (url, body) => { posts.push({ url, body }); if (options.post) return options.post(url, body, facts); return { ...facts, item }; };
  const api = window.ProjectProgress.create({ root, fetchJson, postJson, onRefresh: options.onRefresh, onProject: options.onProject });
  const snapshot = { workspace: { projects: { items: [{ id: 'project-a', name: '控制面板' }, { id: 'project-b', name: '资料整理' }] } }, items: [item, { id: 'task-2', title: '整理文档', project_id: 'project-b', state: 'todo' }] };
  const node = id => { const found = root.querySelector('#' + id); assert.ok(found, id); return found; };
  const click = id => node(id).listeners.click();
  const type = (id, value) => { const input = node(id); input.value = value; input.listeners.input(); };
  return { root, api, node, click, type, facts, item, snapshot, posts, reads, events, model: window.ProjectProgressModel };
}

test('ordinary progress always displays both projects without scope, search, filters or creation', async () => {
  const f = fixture(); await f.api.update(f.snapshot); f.api.setProject('project-a');
  assert.match(f.node('pp-list').textContent, /修复过滤器/); assert.match(f.node('pp-list').textContent, /整理文档/);
  for (const tag of ['select', 'input', 'textarea', 'dialog']) assert.equal(f.root.querySelectorAll(tag).length, 0, tag);
  for (const id of ['pp-scope', 'pp-search', 'pp-new', 'pp-new-dialog']) assert.equal(f.root.querySelector('#'+id), null);
  assert.doesNotMatch(f.root.textContent, /需要我|最近交付|新建事项|事项管理|业务记录|查看范围/);
  const tags = f.root.all.filter(node => node.className === 'pp-project-tag');
  assert.deepEqual(tags.map(node => node.textContent), ['资料整理', '控制面板']);
  assert.ok(tags.every(node => node.tagName === 'span'));
  f.api.setProject('project-b'); await f.api.update(f.snapshot);
  assert.match(f.node('pp-list').textContent, /修复过滤器/); assert.match(f.node('pp-list').textContent, /整理文档/);
  assert.equal(f.posts.length, 0); assert.equal(f.events.length, 0);
});

test('even all server write capabilities only expose read-only details', async () => {
  const navigation=[];
  const f=fixture({ onProject:(...args)=>navigation.push(args), facts:{capabilities:{can_review:true,can_feedback:true,can_send_feedback:true,can_resume:true,can_start:true,can_reconcile_start:true,can_release:true,can_adopt:true}} });
  await f.api.update(f.snapshot); f.api.setProject('project-b'); await f.api.open(f.item);
  assert.match(f.node('pp-detail').textContent,/过滤器已调整.*尚无可核验的测试记录/);
  assert.deepEqual(f.node('pp-detail').querySelectorAll('button').map(node=>node.textContent),['‹ 返回','']);
  assert.equal(f.api.isEditing(),false);
  for(const tag of ['input','select','textarea','dialog']) assert.equal(f.root.querySelectorAll(tag).length,0);
  assert.doesNotMatch(f.node('pp-detail').textContent,/确认完成|提出修改|发送并继续|开始开发|恢复会话|返回会话|结束跟踪|关联已有会话|进入所属项目/);
  assert.equal(f.posts.length,0); assert.equal(f.events.length,0); assert.equal(navigation.length,0);
});

test('list and detail refresh use an SVG with an accessible name and no visible label', async () => {
  let refreshes=0;
  const f=fixture({onRefresh:async()=>{refreshes++;}}); await f.api.update(f.snapshot); await f.api.open(f.item);
  const buttons=f.root.all.filter(node=>node.className?.includes('pp-icon-button'));
  assert.equal(buttons.length,2);
  for(const button of buttons){ assert.equal(button.textContent,''); assert.equal(button.attributes['aria-label'],'刷新'); assert.equal(button.title,'刷新'); assert.match(button.innerHTML,/<svg.*aria-hidden="true"/); }
  await f.click('pp-refresh'); assert.equal(refreshes,1); assert.equal(f.posts.length,0);
});

test('source questions and missing delivery remain visible without write or session actions', async () => {
  const f=fixture({facts:{current_delivery:null,attention:{kind:'source_only',text:'需要选择执行权限'},capabilities:{can_review:true,can_feedback:true}}});
  await f.api.update(f.snapshot); await f.api.open(f.item);
  assert.match(f.node('pp-detail').textContent,/待处理记录.*需要选择执行权限.*暂无交付记录/);
  assert.deepEqual(f.node('pp-detail').querySelectorAll('button').map(node=>node.textContent),['‹ 返回','']);
  assert.equal(f.posts.length,0); assert.equal(f.events.length,0);
});

test('legacy review and attention links stay precise while ordinary tasks reset to all projects',async()=>{
  const f=fixture(); f.snapshot.items[0].state='review'; f.snapshot.items[1].state='blocked';
  await f.api.update(f.snapshot); f.api.setProject('project-a','review');
  assert.match(f.node('pp-list').textContent,/修复过滤器/); assert.doesNotMatch(f.node('pp-list').textContent,/整理文档/);
  f.api.setProject('project-b','attention'); assert.match(f.node('pp-list').textContent,/整理文档/); assert.doesNotMatch(f.node('pp-list').textContent,/修复过滤器/);
  assert.equal(f.node('pp-scope-note').textContent,'仅显示「资料整理」的事项');
  f.api.setProject('project-b'); assert.match(f.node('pp-list').textContent,/修复过滤器/); assert.match(f.node('pp-list').textContent,/整理文档/);
  assert.equal(f.node('pp-scope-note').textContent,'显示全部项目的事项');
  assert.equal(f.root.querySelectorAll('select').length,0); assert.equal(f.posts.length,0);
});

test('a row names its state only when the column does not already say it',async()=>{
  const f=fixture(); f.snapshot.items[0].state='review'; f.snapshot.items[1].state='blocked';
  await f.api.update(f.snapshot); f.api.setProject('project-a');
  const metas=f.root.all.filter(node=>node.className==='pp-meta').map(node=>node.textContent);
  assert.deepEqual(metas,['事项状态：受阻']);
});

test('three columns partition all unfinished records once and completion stays in history',async()=>{
  const f=fixture(); f.snapshot.items=[
    {id:'todo',state:'todo',project_id:'project-a'}, {id:'doing',state:'doing',project_id:'project-b'},
    {id:'review',state:'review',project_id:'project-a',progress:{native_run_id:'r',active_slot:1,observation_state:'working'}},
    {id:'blocked',state:'blocked',project_id:'project-b'}, {id:'unknown',state:'unrecognized',project_id:'project-a'},
    {id:'active',state:'todo',project_id:'project-b',progress:{native_run_id:'r2',active_slot:1,observation_state:'working'}},
    {id:'done',state:'done',project_id:'project-b'}].map(item=>({...item,title:'目标-'+item.id,origin:'todo'}));
  await f.api.update(f.snapshot); f.api.setProject('project-a');
  const ids=node=>node.all.filter(child=>child.tagName==='button'&&child.dataset.taskId).map(child=>child.dataset.taskId);
  const column=key=>f.root.all.find(node=>node.dataset.column===key);
  assert.deepEqual(ids(column('pending')),['todo','blocked','unknown']); assert.deepEqual(ids(column('doing')),['doing','active']); assert.deepEqual(ids(column('review')),['review']);
  assert.deepEqual(ids(f.node('pp-completed')),['done']); assert.equal(f.node('pp-completed').open,false);
  assert.equal(new Set(ids(f.node('pp-list'))).size,f.snapshot.items.length);
  assert.match(column('pending').textContent,/受阻/); assert.match(column('pending').textContent,/状态未确认/);
  await f.api.open('review'); f.node('pp-list').scrollTop=77; const saved=f.api.captureViewState();
  await f.api.update(f.snapshot); await f.api.restoreViewState({...saved,scope:'project-b',filter:'delivery',query:'none'});
  assert.equal(f.api.captureViewState().scope,''); assert.equal(f.api.captureViewState().filter,'all'); assert.equal(f.api.captureViewState().query,'');
  assert.equal(f.api.captureViewState().selectedTaskId,'review'); assert.equal(f.node('pp-list').scrollTop,77);
  assert.equal(ids(f.node('pp-list')).length,f.snapshot.items.length); assert.equal(f.posts.length,0); assert.equal(f.events.length,0);
});

test('deleted selection restoration clears detail without selecting a replacement',async()=>{
  const f=fixture(); await f.api.update(f.snapshot); await f.api.open(f.item); const saved=f.api.captureViewState();
  f.snapshot.items=f.snapshot.items.filter(item=>item.id!==f.item.id); await f.api.update(f.snapshot); await f.api.restoreViewState(saved);
  assert.equal(f.api.captureViewState().selectedTaskId,null); assert.equal(f.node('pp-detail').querySelector('button'),null);
  assert.match(f.node('pp-list').textContent,/整理文档/); assert.equal(f.posts.length,0);
});

test('historical todo remains readable without a native API or legacy action link',async()=>{
  const f=fixture(); f.item.origin='todo'; await f.api.update(f.snapshot); await f.api.open(f.item);
  assert.equal(f.reads.length,0); assert.match(f.node('pp-detail').textContent,/修复过滤器.*暂无交付记录/);
  assert.equal(f.node('pp-detail').querySelectorAll('a').length,0); assert.equal(f.posts.length,0);
});

test('source timestamps retain numeric and ISO clock formats',async()=>{
  for(const sourceTime of [1792886400123,'1792886400123','2026-10-25T00:00:00Z']){
    const f=fixture({facts:{source_time:sourceTime}}); await f.api.update(f.snapshot); await f.api.open(f.item); assert.match(f.node('pp-detail').textContent,/来源时间：2026/);
  }
  const f=fixture(); assert.ok(Number.isNaN(f.model.timestamp(null))); assert.ok(Number.isNaN(f.model.timestamp('not-a-time')));
});

test('external materials accept only safe URLs and do not turn reported tests into verification',async()=>{
  const f=fixture({facts:{current_delivery:{id:'delivery-1',summary:'材料',material:{files:[{path:'src/example.js',exists:false}],references:[{url:'javascript:alert(1)'},{url:'https://user:secret@example.com'},{url:'https://example.com/report',title:'报告'}],tests:{status:'passed',commands:['node --test']}}}}});
  await f.api.update(f.snapshot); await f.api.open(f.item);
  assert.match(f.node('pp-detail').textContent,/src\/example.js · 文件未找到/); assert.match(f.node('pp-detail').textContent,/来源报告测试通过，尚未经独立核验/);
  const links=f.node('pp-detail').querySelectorAll('a'); assert.equal(links.length,1); assert.equal(links[0].href,'https://example.com/report'); assert.equal(links[0].rel,'noopener noreferrer');
  assert.equal(f.model.row({state:'done'}).delivered,false);
});

test('expanded long evidence survives refresh without introducing a write control',async()=>{
  const f=fixture({facts:{current_delivery:{id:'delivery-1',summary:'长'.repeat(2000),material:{}}}}); await f.api.update(f.snapshot); await f.api.open(f.item);
  const full=f.node('pp-detail').querySelectorAll('details').find(node=>node.querySelector('summary')?.textContent==='查看完整返回'); full.open=true;
  f.facts.source_time=1792886400123; await f.api.update(f.snapshot);
  assert.equal(f.node('pp-detail').querySelectorAll('details').find(node=>node.querySelector('summary')?.textContent==='查看完整返回').open,true);
  assert.equal(f.posts.length,0);
});

test('late details cannot overwrite a new selection or a deactivated view',async()=>{
  const pending=[]; const f=fixture({fetch:url=>new Promise(resolve=>pending.push({url,resolve}))});
  f.snapshot.items[1].origin='task'; await f.api.update(f.snapshot);
  const first=f.api.open(f.item),second=f.api.open('task-2');
  pending[1].resolve({item:f.snapshot.items[1],native_run:{id:'r2'},capabilities:{}}); await second;
  pending[0].resolve(f.facts); await first; assert.equal(f.node('pp-detail').dataset.taskId,'task-2');
  const third=f.api.open(f.item); f.api.setActive(false); pending[2].resolve(f.facts); await third;
  assert.equal(f.node('pp-detail').dataset.taskId,''); assert.equal(f.posts.length,0);
});

test('real read failures retain the last board and retry clears the error',async()=>{
  const f=fixture(); await f.api.update(f.snapshot); f.api.unavailable(new Error('fixture offline'));
  assert.match(f.node('pp-status').textContent,/fixture offline/); assert.match(f.node('pp-list').textContent,/整理文档/);
  await f.api.update(f.snapshot); assert.equal(f.node('pp-status').textContent,''); assert.equal(f.posts.length,0);
});


test('unknown receipts have no resend and historical sent is explicitly manual', async () => {
  const f = fixture({ facts: { messages: [{ id: 'm1', body_text: 'feedback', native_delivery: { state: 'unknown' } }, { id: 'm2', delivery_state: 'sent' }] } });
  await f.api.update(f.snapshot); await f.api.open(f.item);
  assert.match(f.root.textContent, /送达未确认，请回会话核对/); assert.match(f.root.textContent, /人工标记已发送/);
  assert.doesNotMatch(f.root.textContent, /重试发送/);
});

test('a native idle delivery is pending continuation, while only observed working enters active', () => {
  const f = fixture(); const item = { state: 'doing', current_delivery_id: 'delivery', progress: { native_run_id: 'run', active_slot: 1, observation_state: 'idle' } };
  assert.equal(f.model.row(item).label, '待继续'); assert.equal(f.model.matches(item, { filter: 'active' }), false);
  assert.equal(f.model.matches(item, { filter: 'delivery' }), true);
  item.progress.observation_state = 'working'; assert.equal(f.model.matches(item, { filter: 'active' }), true);
  item.progress.observation_state = 'unknown'; assert.equal(f.model.matches(item, { filter: 'active' }), false);
  assert.equal(f.model.row({ state: 'doing' }).active, true);
});

test('a replaced or unavailable binding keeps receipt history separate from current activity', () => {
  const f = fixture();
  for (const bindingState of ['replaced', 'unavailable']) {
    assert.equal(f.model.messageLabel({ native_delivery: { state: 'input_accepted', receipt: { receiptState: 'completed', bindingState } } }), '此前输入已接受，当前来源需回会话核对');
    assert.equal(f.model.messageLabel({ native_delivery: { state: 'turn_started', receipt: { receiptState: 'completed', bindingState } } }), '此前已观察到继续执行，当前来源需回会话核对');
  }
  assert.equal(f.model.messageLabel({ native_delivery: { state: 'input_accepted', receipt: { receiptState: 'absent', historical_receipt: {} } } }), '此前输入已接受，当前来源需回会话核对');
  assert.equal(f.model.messageLabel({ native_delivery: { state: 'input_accepted' } }), '此前输入已接受，当前来源需回会话核对');
});

test('released working is historical and remains readable outside the active view', async () => {
  const f = fixture({ facts: { native_run: { id: 'old-run', active_slot: 0, observation_state: 'working' }, capabilities: {} } });
  f.item.progress = { native_run_id: 'old-run', active_slot: 0, observation_state: 'working', source_time: 1792886400123 };
  assert.equal(f.model.row(f.item).active, false); assert.equal(f.model.row(f.item).label, '跟踪已结束');
  assert.equal(f.model.row(f.item).time, 1792886400123); assert.equal(f.model.row(f.item).delivered, true);
  await f.api.update(f.snapshot); await f.api.open(f.item);
  assert.match(f.node('pp-detail').textContent, /跟踪已结束/); assert.match(f.node('pp-detail').textContent, /过滤器已调整/);
  assert.equal(f.posts.length, 0);
});
