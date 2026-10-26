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
  const fetchJson = async url => { reads.push(url); if (url.includes('/progress')) return JSON.parse(JSON.stringify(facts)); if (url.includes('/agent-tasks/')) return { item, review_material: { tests: { status: 'missing' }, sessions: options.sessions || [] } }; throw new Error('unexpected ' + url); };
  const postJson = async (url, body) => { posts.push({ url, body }); if (options.post) return options.post(url, body, facts); return { ...facts, item }; };
  const api = window.ProjectProgress.create({ root, fetchJson, postJson, onRefresh: options.onRefresh, onProject: options.onProject });
  const snapshot = { workspace: { projects: { items: [{ id: 'project-a', name: '控制面板' }, { id: 'project-b', name: '资料整理' }] } }, items: [item, { id: 'task-2', title: '整理文档', project_id: 'project-b', state: 'todo' }] };
  const node = id => { const found = root.querySelector('#' + id); assert.ok(found, id); return found; };
  const click = id => node(id).listeners.click();
  const type = (id, value) => { const input = node(id); input.value = value; input.listeners.input(); };
  return { root, api, node, click, type, facts, item, snapshot, posts, reads, events, model: window.ProjectProgressModel };
}
test('one confirmation click submits the current immutable result without a reason form', async () => {
  const f = fixture(); await f.api.update(f.snapshot); await f.api.open(f.item);
  assert.match(f.node('pp-detail').textContent, /过滤器已调整.*尚无可核验的测试记录/);
  assert.equal(f.node('pp-detail').querySelectorAll('select').length, 0);
  assert.equal(f.node('pp-detail').querySelectorAll('input').length, 0);
  await f.click('pp-confirm'); assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].body.delivery_id, 'delivery-1'); assert.equal(f.posts[0].body.confirmed, true); assert.equal(f.posts[0].body.reason, '');
});
test('one opinion input and one send action requests save-and-send once', async () => {
  const f = fixture(); await f.api.update(f.snapshot); await f.api.open(f.item);
  f.click('pp-feedback-open'); f.type('pp-feedback-text', '请保留当前筛选'); await f.click('pp-feedback-send');
  assert.equal(f.posts.length, 1); assert.match(f.posts[0].url, /native-feedback$/); assert.equal(f.posts[0].body.send, true);
  assert.equal(f.posts[0].body.body_text, '请保留当前筛选'); assert.equal(f.posts[0].body.source_delivery_id, 'delivery-1');
  assert.doesNotMatch(f.root.textContent, /发送成功/);
});
test('an ambiguous feedback failure keeps text and the original token after new revisions', async () => {
  const f = fixture({ post: async (url, body, facts) => { facts.item.revision++; facts.item.progress_revision++; facts.current_delivery.id = 'new-delivery'; throw new Error('response lost'); } });
  await f.api.update(f.snapshot); await f.api.open(f.item); f.click('pp-feedback-open'); f.type('pp-feedback-text', '修改一下');
  await f.click('pp-feedback-send'); assert.equal(f.node('pp-feedback-text').value, '修改一下');
  await f.click('pp-feedback-send'); assert.equal(f.posts.length, 2);
  assert.deepEqual(f.posts[1].body, f.posts[0].body);
});
test('view switching preserves drafts and filters never navigate the development context', async () => {
  const f = fixture(); await f.api.update(f.snapshot); f.api.setProject('project-a'); await f.api.open(f.item);
  f.click('pp-feedback-open'); f.type('pp-feedback-text', '保留草稿');
  const scope = f.node('pp-scope'); scope.value = 'project-b'; scope.listeners.change();
  assert.match(f.node('pp-list').textContent, /整理文档/); assert.doesNotMatch(f.node('pp-list').textContent, /修复过滤器/);
  assert.equal(f.events.length, 0); assert.equal(f.root.querySelector('#pp-feedback-text'), null);
  scope.value = 'project-a'; scope.listeners.change(); await f.api.open(f.item); assert.equal(f.node('pp-feedback-text').value, '保留草稿');
  assert.equal(f.posts.length, 0);
});

test('ordinary progress defaults to all projects and preserves explicit browsing on refresh', async () => {
  const f = fixture(); await f.api.update(f.snapshot); f.api.setProject('project-a');
  const scope = f.node('pp-scope');
  assert.equal(scope.value, '');
  assert.match(f.node('pp-list').textContent, /修复过滤器/);
  assert.match(f.node('pp-list').textContent, /整理文档/);
  scope.value = ''; scope.listeners.change();
  assert.match(f.node('pp-list').textContent, /修复过滤器/);
  assert.match(f.node('pp-list').textContent, /整理文档/);
  await f.api.update(f.snapshot); f.api.setProject('project-a');
  assert.equal(scope.value, '', 'Refreshing the same route preserves explicit all-project browsing');
  scope.value = 'project-b'; scope.listeners.change();
  await f.api.update(f.snapshot); f.api.setProject('project-a');
  assert.equal(scope.value, 'project-b', 'Refreshing preserves another explicitly selected project');
  f.api.setProject('project-b');
  assert.equal(scope.value, '');
  assert.match(f.node('pp-list').textContent, /整理文档/);
  assert.match(f.node('pp-list').textContent, /修复过滤器/);
  f.api.setProject('project-a');
  assert.equal(scope.value, '');
  f.api.setProject('');
  assert.equal(scope.value, '', 'The inbox still defaults to all projects');
  assert.match(f.node('pp-list').textContent, /整理文档/);
  f.api.setProject('__global__');
  assert.equal(scope.value, '__global__');
});

test('two-project board partitions every unfinished state once and keeps completion in history', async () => {
  const f = fixture();
  f.snapshot.items = [
    { id: 'todo', state: 'todo', project_id: 'project-a' },
    { id: 'doing', state: 'doing', project_id: 'project-b', current_delivery_id: 'old-delivery' },
    { id: 'review', state: 'review', project_id: 'project-a', progress: { native_run_id: 'r', active_slot: 1, observation_state: 'working' } },
    { id: 'blocked', state: 'blocked', project_id: 'project-b' },
    { id: 'unknown', state: 'unrecognized', project_id: 'project-a' },
    { id: 'active', state: 'todo', project_id: 'project-b', progress: { native_run_id: 'r2', active_slot: 1, observation_state: 'working' } },
    { id: 'done', state: 'done', project_id: 'project-b', progress: { native_run_id: 'r3', active_slot: 1, observation_state: 'working' } },
  ].map(item => ({ ...item, title: '目标-' + item.id, origin: 'todo' }));
  await f.api.update(f.snapshot); f.api.setProject('project-a');
  const ids = node => node.all.filter(child => child.tagName === 'button' && child.dataset.taskId).map(child => child.dataset.taskId);
  const column = key => f.root.all.find(node => node.dataset.column === key);
  assert.deepEqual(ids(column('pending')), ['todo', 'blocked', 'unknown']);
  assert.deepEqual(ids(column('doing')), ['doing', 'active']);
  assert.deepEqual(ids(column('review')), ['review']);
  assert.deepEqual(ids(f.node('pp-completed')), ['done']);
  assert.equal(f.node('pp-completed').open, false);
  assert.equal(ids(f.node('pp-list')).length, f.snapshot.items.length);
  assert.equal(new Set(ids(f.node('pp-list'))).size, f.snapshot.items.length);
  assert.match(column('pending').textContent, /受阻/); assert.match(column('pending').textContent, /状态未确认/);
  assert.match(column('doing').textContent, /资料整理/); assert.match(column('review').textContent, /控制面板/);
  await f.api.open('review'); f.node('pp-list').scrollTop = 77;
  const saved = f.api.captureViewState(); await f.api.update(f.snapshot);
  assert.equal(f.api.captureViewState().selectedTaskId, 'review');
  f.type('pp-search', '目标-unknown'); assert.deepEqual(ids(f.node('pp-list')), ['unknown']);
  await f.api.restoreViewState(saved);
  assert.equal(f.api.captureViewState().selectedTaskId, 'review'); assert.equal(f.node('pp-list').scrollTop, 77);
  assert.equal(f.posts.length, 0); assert.equal(f.events.length, 0);
  assert.equal(f.snapshot.items.find(item => item.id === 'doing').project_id, 'project-b');
});

test('new progress items retain route ownership after explicitly browsing all projects', async () => {
  const f = fixture({ onRefresh: async () => {} });
  await f.api.update(f.snapshot); f.api.setProject('project-a');
  f.node('pp-scope').value = ''; f.node('pp-scope').listeners.change();
  f.click('pp-new'); f.type('pp-new-text', '本项目的新目标');
  const save = f.node('pp-new-dialog').querySelectorAll('button').find(node => node.textContent === '保存事项');
  await save.listeners.click();
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].url, '/api/workspace/items');
  assert.equal(f.posts[0].body.project_id, 'project-a');
  assert.equal(f.posts[0].body.title, '本项目的新目标');
});
test('missing delivery and source-only questions never invent a confirmation or an answer API', async () => {
  const f = fixture({ facts: { current_delivery: null, attention: { kind: 'source_only', text: '需要选择执行权限' }, capabilities: { can_review: true, can_feedback: true, can_send_feedback: false } } });
  await f.api.update(f.snapshot); await f.api.open(f.item);
  assert.equal(f.root.querySelector('#pp-confirm'), null); assert.match(f.root.textContent, /返回会话处理/);
  assert.equal(f.posts.length, 0); f.click('pp-feedback-open'); f.type('pp-feedback-text', '意见'); await f.click('pp-feedback-send');
  assert.equal(f.posts[0].body.send, false); assert.equal(f.events[0].type, 'platform-open-task-session'); assert.equal(f.events[0].detail.resume, false);
});
test('unknown receipts have no resend and historical sent is explicitly manual', async () => {
  const f = fixture({ facts: { messages: [{ id: 'm1', body_text: 'feedback', native_delivery: { state: 'unknown' } }, { id: 'm2', delivery_state: 'sent' }] } });
  await f.api.update(f.snapshot); await f.api.open(f.item);
  assert.match(f.root.textContent, /送达未确认，请回会话核对/); assert.match(f.root.textContent, /人工标记已发送/);
  assert.doesNotMatch(f.root.textContent, /重试发送/);
});
test('new idea cancellation retains one requirement and project inheritance', async () => {
  const f = fixture(); await f.api.update(f.snapshot); f.api.setProject('project-a'); f.click('pp-new');
  f.type('pp-new-text', '一个新目标'); f.node('pp-new-dialog').close(); f.click('pp-new');
  assert.equal(f.node('pp-new-text').value, '一个新目标'); assert.match(f.node('pp-new-dialog').textContent, /所属项目：控制面板/); assert.equal(f.posts.length, 0);
});
test('legacy review deep links remain precise and legacy done never fabricates native delivery', async () => {
  const f = fixture(); f.snapshot.items[0].state = 'review'; f.snapshot.items[1].state = 'review'; await f.api.update(f.snapshot);
  f.api.setProject('project-a', 'review'); assert.match(f.node('pp-list').textContent, /修复过滤器/); assert.doesNotMatch(f.node('pp-list').textContent, /整理文档/);
  assert.equal(f.model.row({ state: 'done' }).delivered, false);
  assert.equal(f.model.safeUrl('javascript:alert(1)'), null); assert.equal(f.model.safeUrl('https://user:secret@example.com'), null);
});
test('historical todo records remain readable without pretending to support native task APIs', async () => {
  const f = fixture(); f.item.origin = 'todo'; await f.api.update(f.snapshot); await f.api.open(f.item);
  assert.equal(f.reads.length, 0); assert.match(f.node('pp-detail').textContent, /修复过滤器.*打开历史待办管理/);
  assert.equal(f.root.querySelector('#pp-start'), null); assert.equal(f.root.querySelector('#pp-confirm'), null);
});
test('reconciling an uncertain start uses the persisted request instead of creating a new identity', async () => {
  const original = { expected_revision: 1, brief_revision: 1, client_token: 'original-start', agent: 'codex', worktree_id: 'worktree-a' };
  const f = fixture({ facts: { native_run: { id: 'run-1', launch_state: 'unknown', brief_snapshot: { request: original } }, capabilities: { can_reconcile_start: true } } });
  await f.api.update(f.snapshot); await f.api.open(f.item);
  const action = f.node('pp-detail').querySelectorAll('button').find(node => node.textContent === '核对并继续启动'); await action.listeners.click();
  assert.equal(f.posts.length, 1); assert.equal(JSON.stringify(f.posts[0].body), JSON.stringify(original)); assert.match(f.posts[0].url, /native-start$/);
});
test('adoption offers only recorded supported identities and delegates real workspace selection', async () => {
  const f = fixture({ facts: { native_run: null, current_delivery: null, capabilities: { can_adopt: true } }, sessions: [
    { id: 'session-record', title: '已有开发会话', source: 'codex', source_instance: 'environment-a' },
    { id: 'unknown-record', title: '缺少来源身份', source: 'codex' },
    { id: 'external-record', title: '其他来源', source: 'custom', source_instance: 'environment-a' }
  ] });
  await f.api.update(f.snapshot); await f.api.open(f.item);
  const action = f.node('pp-detail').querySelectorAll('button').find(node => node.textContent === '已有开发会话'); action.listeners.click();
  assert.equal(f.events[0].type, 'platform-adopt-task-session'); assert.equal(f.events[0].detail.sessionId, 'session-record');
  assert.equal(f.events[0].detail.projectId, 'project-a'); assert.equal(f.posts.length, 0);
  assert.doesNotMatch(f.node('pp-detail').textContent, /缺少来源身份|其他来源/);
});
test('host epoch milliseconds, numeric strings, and ISO evidence clocks render actual source time', async () => {
  for (const sourceTime of [1792886400123, '1792886400123', '2026-10-25T00:00:00Z']) {
    const f = fixture({ facts: { source_time: sourceTime } }); await f.api.update(f.snapshot); await f.api.open(f.item);
    assert.doesNotMatch(f.node('pp-detail').textContent, /最近来源：尚无来源记录/);
    assert.match(f.node('pp-detail').textContent, /最近来源：2026/);
  }
  const f = fixture(); assert.ok(Number.isNaN(f.model.timestamp(null))); assert.ok(Number.isNaN(f.model.timestamp('not-a-time')));
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
test('creation visibly stays locked until a confirmed write finishes its pending catalog refresh', async () => {
  let finishRefresh, refreshStarted;
  const started = new Promise(resolve => { refreshStarted = resolve; });
  const f = fixture({ onRefresh: () => { refreshStarted(); return new Promise(resolve => { finishRefresh = resolve; }); } });
  await f.api.update(f.snapshot); await f.api.open(f.item);
  const pending = f.click('pp-confirm'); await started;
  assert.equal(f.node('pp-new').disabled, true, 'A clickable action must not silently drop while refresh owns the write lock');
  const groupedCreate = f.node('pp-list').querySelectorAll('button').filter(node => node.textContent === '＋');
  assert.equal(groupedCreate.length, 2);
  assert.ok(groupedCreate.every(node => node.disabled), 'Project-group creation shares the same visible lock');
  finishRefresh(); await pending;
  assert.equal(f.node('pp-new').disabled, false); assert.ok(groupedCreate.every(node => !node.disabled));
  f.click('pp-new'); assert.equal(f.node('pp-new-dialog').open, true); assert.equal(f.posts.length, 1);
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
test('only saved or refused messages belonging to the current active run offer a send action', async () => {
  const f = fixture({ facts: { messages: [
    { id: 'old-saved', body_text: '旧保存', native_delivery: { native_run_id: 'old-run', state: 'saved' } },
    { id: 'old-refused', body_text: '旧拒绝', native_delivery: { native_run_id: 'old-run', state: 'refused' } },
    { id: 'current-saved', body_text: '当前保存', native_delivery: { native_run_id: 'run-1', state: 'saved' } },
    { id: 'current-refused', body_text: '当前拒绝', native_delivery: { native_run_id: 'run-1', state: 'refused' } }
  ] } });
  await f.api.update(f.snapshot); await f.api.open(f.item);
  const sendActions = () => f.node('pp-detail').querySelectorAll('button').filter(node => ['发送并继续', '重试发送'].includes(node.textContent));
  assert.equal(sendActions().length, 2); await sendActions()[0].listeners.click();
  assert.match(f.posts[0].url, /current-saved\/send$/);
  f.facts.native_run.active_slot = 0; await f.api.open(f.item);
  assert.equal(sendActions().length, 0); assert.match(f.node('pp-detail').textContent, /旧保存/);
});

test('cross-project actions hand off the exact task before any host operation', async () => {
  const navigation = [];
  const f = fixture({ onProject: (...args) => navigation.push(args), facts: { native_run: null, capabilities: { can_start: true } } });
  await f.api.update(f.snapshot); f.api.setProject('project-b'); await f.api.open(f.item);
  assert.equal(f.root.querySelector('#pp-start'), null);
  f.click('pp-open-project');
  assert.equal(navigation[0][0], 'project-a'); assert.equal(navigation[0][1].id, f.item.id);
  assert.equal(f.events.length, 0); assert.equal(f.posts.length, 0);
  f.api.setProject('project-a'); await f.api.open(f.item); f.click('pp-start');
  assert.equal(f.events[0].type, 'platform-start-task-agent');
  assert.equal(f.events[0].detail.projectId, 'project-a');
});

test('creation outside the target context labels navigation without promising an Agent start', async () => {
  const f = fixture({ onProject() {} }); await f.api.update(f.snapshot); f.api.setProject(''); f.click('pp-new');
  const owner = f.node('pp-new-project'); owner.value = 'project-b'; owner.listeners.change();
  assert.match(f.node('pp-new-dialog').textContent, /保存并进入项目/);
  assert.equal(f.events.length, 0);
  f.node('pp-new-dialog').close(); f.api.setProject('project-a'); f.click('pp-new');
  assert.match(f.node('pp-new-dialog').textContent, /开始开发/);
  assert.doesNotMatch(f.node('pp-new-dialog').textContent, /保存并进入项目/);
});
