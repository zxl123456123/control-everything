'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag, ownerDocument) { this.tag = tag; this.ownerDocument = ownerDocument; this.children = []; this.listeners = {}; this.attributes = {}; this.text = ''; }
  append(...values) { for (const value of values) { if (value.parentElement) value.parentElement.children = value.parentElement.children.filter(row => row !== value); value.parentElement = this; this.children.push(value); } }
  replaceChildren(...values) { if (this.contains(this.ownerDocument?.activeElement)) this.ownerDocument.activeElement = null; for (const value of this.children) value.parentElement = null; this.children = []; this.text = ''; this.append(...values); }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(row => row.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key] || null; }
  contains(value) { return this.all.includes(value); }
  querySelectorAll() { return this.all.filter(row => row.attributes['data-monitor-control']); }
  focus() { this.ownerDocument.activeElement = this; }
  addEventListener(key, action) { this.listeners[key] = action; }
  get all() { return [this, ...this.children.flatMap(row => row.all)]; }
}
const snapshot = () => ({ project: { id: 'project', name: 'Fixture' }, sampled_at: '2026-10-23T00:00:00Z',
  items: [{ task: { id: 'task', title: '<img src=x> 真实事项', state: 'review' },
    claim: { id: 'claim', agent_id: 'agent', agent_name: 'Same name', agent_kind: 'codex', status: 'waiting_review' },
    execution: { id: 'execution', project_id: 'project', state: 'completed', cleanup_state: 'verified' },
    sessions: { items: [{ id: 'session', source: 'claude', source_instance: 'one', external_id: 'native' }], total: 1, has_more: false }, binding_state: 'linked' }],
  pagination: { offset: 0, limit: 20, total: 1, has_more: false },
  events: [{ id: 'e1', task_id: 'task', run_id: 'claim', kind: 'claimed' }],
  events_page: { total: 1, limit: 200, has_more: false }, coverage: { structured_runtime: 'unavailable' } });
function fixture(reader = async () => snapshot()) {
  const timers = new Map(), listeners = new Map(), draws = [], activation = [], reads = [];
  let timerId = 0, destroyed = 0;
  const document = { hidden: false, createElement: tag => new Element(tag, document),
    addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  const context = vm.createContext({ window: {}, document, URLSearchParams, AbortController,
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) });
  context.window.WorkspaceMonitorScene = { create: () => ({ update: value => draws.push(value),
    setActive: value => activation.push(value), destroy: () => destroyed++ }) };
  for (const name of ['monitor-model.js', 'project-monitor.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../web/workspace', name), 'utf8'), context);
  const root = new Element('section', document);
  const monitor = context.window.WorkspaceProjectMonitor.create({ root, projectId: 'project',
    fetchJson: (url, options) => { reads.push({ url, options }); return reader(url, options); } });
  return { root, document, monitor, model: context.window.WorkspaceMonitorModel, timers, draws, activation, reads,
    destroyed: () => destroyed, click: label => { const value = root.all.find(row => row.tag === 'button' && row.textContent === label); assert.ok(value, label); value.listeners.click(); },
    hidden(value) { document.hidden = value; listeners.get('visibilitychange')?.(); },
    tick() { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); }, listeners };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('business progress names its records separately from native runtime activity', () => {
  const f = fixture();
  assert.match(f.root.textContent, /业务进度/);
  assert.match(f.root.textContent, /事项、交接与人工验收记录/);
  assert.doesNotMatch(f.root.textContent, /内部 Agent 活动尚未接通/);
});

test('execution completion remains pending human acceptance and metadata stays unknown', () => {
  const f = fixture(), data = snapshot();
  const view = f.model.project(data);
  assert.equal(view.agents[0].status, 'waiting'); assert.equal(view.tasks[0].state, 'review');
  assert.equal(view.agents[1].status, 'unknown'); assert.equal(view.agents[1].evidence, '会话元数据');
  data.items[0].binding_state = 'conflict'; data.items[0].execution.state = 'running';
  assert.equal(f.model.project(data).agents[0].status, 'unknown');
  assert.match(f.model.project(data).agents[0].stateLabel, /活动未知/);
  data.items.push({ ...data.items[0], task: { id: 'other', state: 'doing' }, claim: { ...data.items[0].claim, id: 'other-claim' }, sessions: { items: [] } });
  assert.equal(new Set(f.model.project(data).agents.map(row => row.id)).size, 3);
});
test('only new current-claim business transfers animate, with reset on coverage gaps', () => {
  const { model } = fixture(), before = snapshot(), after = snapshot();
  after.events.push({ id: 'e2', task_id: 'task', run_id: 'claim', kind: 'waiting_review' },
    { id: 'e3', task_id: 'task', run_id: 'old-claim', kind: 'completed' }); after.events_page.total = 3;
  assert.equal(model.changes(null, after).flows.length, 0);
  const change = model.changes(before, after);
  assert.equal(change.flows.length, 1); assert.equal(change.flows[0].to, '$review');
  assert.equal(model.changes(after, after).flows.length, 0);
  after.events = [{ id: 'new-window', kind: 'claimed' }]; assert.equal(model.changes(before, after).gap, true);
  after.pagination.offset = 20; assert.equal(model.changes(before, after).flows.length, 0);
});
test('mount is inert; polling is serial and invisible views abort and ignore late reads', async () => {
  let resolve;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  assert.equal(f.reads.length, 0); f.monitor.setActive(true); assert.equal(f.reads.length, 1);
  f.click('刷新'); assert.equal(f.reads.length, 1);
  f.hidden(true); assert.equal(f.reads[0].options.signal.aborted, true); assert.equal(f.timers.size, 0);
  resolve(snapshot()); await flush(); assert.equal(f.draws.length, 0);
  f.hidden(false); assert.equal(f.reads.length, 2); resolve(snapshot()); await flush();
  assert.equal(f.draws.length, 1); assert.equal(f.draws[0].flows.length, 0); assert.equal(f.timers.size, 1);
  f.monitor.destroy(); assert.equal(f.timers.size, 0); assert.equal(f.listeners.size, 0); assert.equal(f.destroyed(), 1);
});
test('unchanged polling updates its timestamp without rebuilding controls or redrawing the scene', async () => {
  let stamp = 0;
  const f = fixture(async () => ({ ...snapshot(), sampled_at: `2026-10-23T00:00:0${stamp++}Z` }));
  f.monitor.setActive(true); await flush();
  const control = f.root.all.find(row => row.attributes['data-monitor-control'] === 'task:task');
  control.focus();
  f.tick(); await flush();
  assert.equal(f.reads.length, 2); assert.equal(f.draws.length, 1);
  assert.equal(f.document.activeElement, control);
  assert.equal(f.root.all.find(row => row.attributes['data-monitor-control'] === 'task:task'), control);
  f.monitor.destroy();
});

test('failed reads preserve facts as stale and recovery does not replay history', async () => {
  let fail = false; const f = fixture(async () => { if (fail) throw new Error('offline'); return snapshot(); });
  f.monitor.setActive(true); await flush(); fail = true; f.tick(); await flush();
  assert.match(f.root.textContent, /读取中断/); assert.equal(f.draws.at(-1).stale, true);
  assert.ok(f.draws.at(-1).agents.every(row => row.status === 'unknown'));
  fail = false; f.tick(); await flush(); assert.equal(f.draws.at(-1).flows.length, 0);
  assert.equal(f.root.all.filter(row => row.tag === 'img').length, 0);
});
test('details use the existing read API only on selection and preserve gap/continuation', async () => {
  const f = fixture(async url => url.includes('/execution/') ? { run: { id: 'execution', task_id: 'task' },
    events: [{ seq: 12, kind: 'command', payload: { command: '<script>bad</script>' } }], gap: true, next_cursor: 12, has_more: true } : snapshot());
  f.monitor.setActive(true); await flush(); assert.equal(f.reads.length, 1);
  f.click('<img src=x> 真实事项'); f.click('读取执行活动'); await flush();
  assert.match(f.reads.at(-1).url, /\/api\/workspace\/execution\/runs\/execution\?after=0$/);
  assert.match(f.root.textContent, /较早事件已被裁剪/); assert.equal(f.root.all.filter(row => row.tag === 'script').length, 0);
  const event = f.root.all.find(row => row.tag === 'details'); event.open = true;
  f.tick(); await flush(); assert.equal(f.root.all.find(row => row.tag === 'details'), event);
  f.click('下一页活动'); await flush(); assert.match(f.reads.at(-1).url, /after=12$/);
});
test('a mismatched project response is not rendered as this project', async () => {
  const data = snapshot(); data.project.id = 'wrong'; const f = fixture(async () => data);
  f.monitor.setActive(true); await flush(); assert.match(f.root.textContent, /读取中断/);
  assert.equal(f.draws.at(-1).agents.length, 0);
});

test('changing workstation pages clears old global flows and reestablishes the activity baseline', async () => {
  const data = snapshot();
  data.items[0].sessions.items = Array.from({length: 13}, (_, i) => ({id: 's' + i, source:'claude'}));
  const f = fixture(async () => data); f.monitor.setActive(true); await flush();
  f.click('下一组工位'); assert.deepEqual(f.activation.slice(-2), [false, true]);
  assert.equal(f.draws.at(-1).flows.length, 0); assert.equal(f.draws.at(-1).agents.length, 2);
  data.events.push({id:'new',task_id:'task',run_id:'claim',kind:'completed'}); data.events_page.total++;
  f.tick(); await flush(); assert.equal(f.draws.at(-1).flows.length, 0);
});

test('polling retains keyboard focus by stable identity even when an Agent label changes', async () => {
  const data = snapshot(), f = fixture(async () => data); f.monitor.setActive(true); await flush();
  const before = f.root.all.find(row => row.attributes['data-monitor-control'] === 'claim:claim'); before.focus();
  data.items[0].execution.state = 'cancelled_before_send'; f.tick(); await flush();
  assert.notEqual(f.document.activeElement, before);
  assert.equal(f.document.activeElement.getAttribute('data-monitor-control'), 'claim:claim');
  assert.match(f.document.activeElement.textContent, /发送前取消/);
});

test('a shrinking project produces an honest empty page rather than a reversed range', async () => {
  const f = fixture(async url => {
    const data = snapshot(); data.pagination.total = 21; data.pagination.has_more = true;
    if (url.includes('offset=20')) { data.items = []; data.events = []; data.pagination = {offset:20,limit:20,total:1,has_more:false}; }
    return data;
  });
  f.monitor.setActive(true); await flush(); f.click('下一页事项'); await flush();
  assert.match(f.root.textContent, /当前页已无事项/); assert.match(f.root.textContent, /本页 0 \/ 1 项/);
  assert.doesNotMatch(f.root.textContent, /此项目暂无事项|21–20/);
});
