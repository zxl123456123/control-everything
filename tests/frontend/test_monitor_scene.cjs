'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const directory = path.resolve(__dirname, '../../web/workspace');
const sources = ['monitor-art.js', 'monitor-scene.js'].map(name => fs.readFileSync(path.join(directory, name), 'utf8'));

function harness({ width = 1024, reduced = false, ratio = 1 } = {}) {
  let time = 0, sequence = 0, available = width, draws = 0, glyphs = [];
  const scheduled = new Map(), observers = [], selections = [];
  const events = value => Object.assign(value, {
    listeners: new Map(),
    addEventListener(type, callback) { const list = this.listeners.get(type) || new Set(); list.add(callback); this.listeners.set(type, list); },
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); },
    emit(type, value = {}) { for (const callback of this.listeners.get(type) || []) callback(value); },
    count() { return [...this.listeners.values()].reduce((sum, list) => sum + list.size, 0); },
  });
  const document = events({ hidden: false }), media = events({ matches: reduced });
  const parent = { getBoundingClientRect: () => ({ width: available }) };
  const canvas = events({ width: 0, height: 0, style: {}, attrs: {}, parentElement: parent,
    setAttribute(name, value) { this.attrs[name] = value; },
    getBoundingClientRect() { return { width: available, height: parseFloat(this.style.height) || 0, left: 12, top: 20 }; },
  });
  const ctx = { setTransform() {}, fillRect(x, y, w, h) {
    if (x === 0 && y === 0 && w === available && h === parseFloat(canvas.style.height)) { draws++; glyphs = []; }
  }, fillText(text, x, y) { glyphs.push({ text, x, y }); } };
  canvas.getContext = () => ctx;
  const schedule = (callback, delay, kind) => { const id = ++sequence; scheduled.set(id, { callback, at: time + delay, kind }); return id; };
  const context = vm.createContext({ window: { matchMedia: () => media, devicePixelRatio: ratio }, document,
    performance: { now: () => time },
    setTimeout: (callback, delay) => schedule(callback, delay, 'timer'), clearTimeout: id => scheduled.delete(id),
    requestAnimationFrame: callback => schedule(callback, 16, 'raf'), cancelAnimationFrame: id => scheduled.delete(id),
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
      observe() { this.connected = true; }
      disconnect() { this.connected = false; }
    },
    fetch() { throw new Error('Scene must not access HTTP'); },
  });
  sources.forEach(source => vm.runInContext(source, context));
  const scene = context.window.WorkspaceMonitorScene.create({ canvas, onSelect: selection => selections.push(selection) });
  function advance(milliseconds) {
    const end = time + milliseconds; let count = 0;
    while (true) {
      const next = [...scheduled.entries()].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      assert.ok(++count < 10000, 'scheduler must make progress');
      scheduled.delete(next[0]); time = next[1].at; next[1].callback(time);
    }
    time = end;
  }
  return { scene, canvas, document, media, observers, selections, advance,
    art: context.window.WorkspaceMonitorArt, layout: context.window.WorkspaceMonitorScene.layout,
    createScene: target => context.window.WorkspaceMonitorScene.create({ canvas: target }),
    get draws() { return draws; }, get text() { return glyphs.map(value => value.text).join(''); },
    get blocks() { return glyphs.filter(value => value.text === '▣'); },
    get pending() { return scheduled.size; }, get kinds() { return [...scheduled.values()].map(item => item.kind); },
    resize(value) { available = value; observers.filter(item => item.connected).forEach(item => item.callback()); },
    clickCell(x, y, agents) {
      const layout = this.layout(agents, available), rect = canvas.getBoundingClientRect();
      canvas.emit('click', { clientX: rect.left + x * rect.width / layout.cols, clientY: rect.top + y * rect.height / layout.rows });
    },
  };
}
const agent = (id = 'a', status = 'unknown') => ({ id, label: '同名 Agent', provider: 'Codex', status, taskId: 't', taskTitle: '真实事项', evidence: '执行记录' });
const view = (agents = [agent()], flows = []) => ({ agents, tasks: [{ id: 't', title: '真实事项', state: 'doing' }], flows, stale: false, notice: '' });
const flow = id => ({ id, taskId: 't', label: '真实事项', from: '$tasks', to: 'a' });

test('upstream poses, monitor rhythm, identities and both complete notices remain available', () => {
  const { art } = harness();
  assert.deepEqual(Array.from(art.pose('working', 0).rows), ['    ▄▄▄▄▄   ', '    (·_·)   ', '   ╭──┴──╮  ', '  ╱│ ███ │╲ ']);
  assert.equal(art.pose('working', 6).rows[1], '    (-_-)   ');
  assert.equal(art.pose('blocked', 1).rows[0], '    ▄▄▄▄▄  o');
  assert.equal(art.pose('done', 0).rows[1], '  │ (^_^) │ ');
  assert.equal(art.pose('unknown', 0).rows[1], '    (o_O)   ');
  assert.equal(art.runningScreen('', 1)[1], '▄▅▆▇▆▅▄▃▂▁▂▃');
  assert.deepEqual(art.identity('a'), art.identity('a'));
  assert.notDeepEqual(art.identity('a'), art.identity('b'));
  assert.equal((sources[0].match(/Permission is hereby granted/g) || []).length, 2);
  assert.equal((sources[0].match(/THE SOFTWARE IS PROVIDED "AS IS"/g) || []).length, 2);
  for (const value of ['Copyright (c) 2026 JosssphZhou', 'Copyright (c) 2026 Mike Landi', '12ca55cf4de63223c61d5025b62a09ed23547a4b']) assert.ok(sources[0].includes(value));
});

test('cell widths, CJK replacement and original minimum desk preserve the person and monitor', () => {
  const { art } = harness(), grid = art.grid(30, 15);
  assert.equal(art.width('A中文'), 5); assert.equal(art.truncate('中文标题', 5), '中文…');
  grid.put(0, 0, '中文'); grid.put(1, 0, 'A');
  assert.equal(grid.get(0, 0).ch, ' '); assert.equal(grid.get(1, 0).ch, 'A');
  grid.put(2, 0, 'B'); assert.equal(grid.get(3, 0).ch, ' ');
  art.card(grid, agent('a', 'working'), { x: 1, y: 1, w: 25, h: 13 }, 0, false);
  assert.equal(grid.get(15, 6).ch, '┌');
  assert.equal(grid.get(2, 10).ch, '▀');
  const text = grid.cells.map(row => row.map(cell => cell.ch).join('')).join('\n');
  assert.match(text, /\(·_·\)/); assert.match(text, /┴/);
  assert.ok(grid.cells.every(row => art.width(row.map(cell => cell.ch).join('')) <= 30));
});

test('explicit cancellation labels are retained on the monitor and desk instead of implying failure', () => {
  const { art } = harness(), grid = art.grid(44, 17);
  art.card(grid, { ...agent('a', 'error'), stateLabel: '发送前取消' }, { x: 1, y: 1, w: 40, h: 14 }, 0, false);
  const text = grid.cells.map(row => row.map(cell => cell.ch).join('')).join('\n');
  assert.equal((text.match(/发送前取消/g) || []).length, 2); assert.doesNotMatch(text, /执行失败/);
});

test('0, 1 and 12 same-named instances have bounded non-overlapping responsive cards', () => {
  const { layout } = harness();
  for (const width of [240, 320, 720, 1024, 1440]) for (const count of [0, 1, 12, 20]) {
    const agents = Array.from({ length: count }, (_, i) => agent(`agent-${i}`)), result = layout(agents, width);
    assert.equal(result.cards.length, Math.min(count, 12));
    for (const box of result.cards) {
      assert.ok(box.w >= 25 && box.h >= 13);
      assert.ok(box.x >= 0 && box.x + box.w <= result.cols && box.y + box.h <= result.rows);
      for (const other of result.nodes.values()) {
        if (box.id === other.id) continue;
        assert.ok(box.x + box.w <= other.x || other.x + other.w <= box.x || box.y + box.h <= other.y || other.y + other.h <= box.y, `${width}: ${box.id} overlaps ${other.id}`);
      }
    }
    assert.equal(new Set(result.cards.map(box => box.id)).size, Math.min(count, 12));
    if (width <= 320) assert.equal(new Set(result.cards.map(box => box.x)).size, count ? 1 : 0);
  }
});

test('inactive, static and unknown states have no scheduled animation; selection uses stable IDs', () => {
  const h = harness(), agents = [agent('first'), agent('second')];
  h.scene.update(view(agents)); assert.equal(h.draws, 0); assert.equal(h.pending, 0);
  h.scene.setActive(true); assert.equal(h.draws, 1); assert.equal(h.pending, 0);
  const box = h.layout(agents, 1024).cards[1]; h.clickCell(box.x + 2, box.y + 5, agents);
  assert.equal(h.selections[0].kind, 'agent'); assert.equal(h.selections[0].id, 'second');
  h.advance(10000); assert.equal(h.draws, 1);
  h.scene.update(view([agent('a', 'working')])); assert.equal(h.pending, 1);
  h.advance(350); assert.ok(h.draws > 2);
  h.scene.setActive(false); const before = h.draws;
  assert.equal(h.pending, 0); assert.equal(h.observers[0].connected, false);
  h.advance(10000); assert.equal(h.draws, before);
});

test('task blocks move once, are selectable, and parallel overflow is explicit', () => {
  const h = harness(), agents = [agent('a', 'idle')]; h.scene.update(view(agents)); h.scene.setActive(true);
  h.scene.update(view(agents, [flow('event-1')])); assert.match(h.text, /▣/);
  const box = h.layout(agents, 1024).nodes.get('$tasks'); h.clickCell(box.x + Math.floor(box.w / 2), box.y + box.h + 0.5, agents);
  assert.equal(h.selections[0].kind, 'task'); assert.equal(h.selections[0].id, 't');
  const start = h.blocks[0]; h.advance(600); assert.notDeepEqual(h.blocks[0], start);
  const point = h.blocks[0], rect = h.canvas.getBoundingClientRect();
  h.canvas.emit('click', { clientX: rect.left + point.x + 1, clientY: rect.top + point.y });
  assert.equal(h.selections[1].kind, 'task'); assert.equal(h.selections[1].id, 't');
  h.advance(2100); assert.doesNotMatch(h.text, /▣/);
  h.scene.update(view(agents, [flow('event-1')])); assert.doesNotMatch(h.text, /▣/);
  h.advance(5500); assert.equal(h.pending, 0);
  h.scene.update(view(agents, Array.from({ length: 20 }, (_, i) => flow(`parallel-${i}`))));
  assert.match(h.canvas.attrs['aria-label'], /8 条流转已合并展示/);
  assert.ok(h.pending <= 1);
});

test('hidden documents cancel RAF as well as timers, clear flows and never replay on resume', () => {
  const h = harness(), agents = [agent('a', 'idle')]; h.scene.update(view(agents)); h.scene.setActive(true);
  h.scene.update(view(agents, [flow('event-1')])); h.advance(40); assert.deepEqual(h.kinds, ['raf']);
  h.document.hidden = true; h.document.emit('visibilitychange');
  assert.equal(h.pending, 0); assert.equal(h.observers[0].connected, false);
  const before = h.draws; h.scene.update(view(agents, [flow('event-2')])); h.advance(10000); assert.equal(h.draws, before);
  h.document.hidden = false; h.document.emit('visibilitychange');
  assert.equal(h.pending, 0); assert.doesNotMatch(h.text, /▣/);
  h.scene.update(view(agents, [flow('event-1'), flow('event-2')])); assert.equal(h.pending, 0);
});

test('reduced motion and stale data stop movement while preserving records and repainting snapshots', () => {
  const h = harness({ reduced: true, ratio: 3 }), agents = [agent('a', 'working')], original = view(agents);
  h.scene.update(original); h.scene.setActive(true);
  assert.equal(h.canvas.width, 2048); assert.equal(h.pending, 0);
  h.scene.update(view(agents, [flow('e-1')])); assert.equal(h.pending, 0); assert.doesNotMatch(h.text, /▣/);
  h.media.matches = false; h.media.emit('change'); assert.equal(h.pending, 1);
  h.scene.update({ ...original, stale: true, flows: [flow('e-2')] });
  assert.equal(h.pending, 0); assert.match(h.text, /活动未知/); assert.equal(original.agents[0].status, 'working');
  h.resize(320); assert.equal(h.canvas.width, 640); assert.equal(h.pending, 0);
  assert.match(h.canvas.attrs['aria-label'], /来源陈旧/);
});

test('destroy removes its listeners and callbacks without affecting a scene on the same document', () => {
  const h = harness(), peer = { ...h.canvas, listeners: new Map(), style: {}, attrs: {} }, other = h.createScene(peer);
  h.scene.update(view([agent('a', 'working')])); h.scene.setActive(true);
  other.update(view([agent('b', 'working')])); other.setActive(true);
  h.scene.destroy(); const before = h.draws;
  assert.equal(h.pending, 1); assert.equal(h.document.count(), 1); assert.equal(h.media.count(), 1); assert.equal(h.canvas.count(), 0); assert.equal(peer.count(), 1);
  assert.equal(h.observers[0].connected, false);
  h.scene.update(view()); h.scene.setActive(true); assert.equal(h.draws, before);
  h.advance(350); assert.ok(h.draws > before);
  other.destroy(); assert.equal(h.pending, 0); assert.equal(h.document.count(), 0); assert.equal(h.media.count(), 0); assert.equal(peer.count(), 0);
  const stopped = h.draws; h.document.emit('visibilitychange'); h.advance(10000); assert.equal(h.draws, stopped);
});
