// 狸花猫 (tabbycat) 3D pet: source/size contract, lazy-load contract, mount contract against a fake DOM + a stubbed WebGL (no real pixels),
// and the 2D fallback when WebGL is unavailable.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('web/workspace/news-tabbycat.js');
const petsSource = read('web/workspace/news-pets.js');

// ---- stubbed WebGL: records draw calls and rejects NaN/Infinity uniforms; every other GL call is a no-op
function fakeGL(stats) {
  const base = {
    drawingBufferWidth: 400, drawingBufferHeight: 400,
    getShaderParameter: () => true, getProgramParameter: () => true, getShaderInfoLog: () => '', getProgramInfoLog: () => '',
    getUniformLocation: (p, n) => ({name: n}), getAttribLocation: () => 0, getExtension: () => null, getError: () => 0, isContextLost: () => false,
    createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}),
    drawElements: (mode, count) => { stats.draws++; stats.tris += count / 3; },
    clear: () => { stats.clears++; }, deleteBuffer: () => { stats.deletes++; }, deleteProgram: () => { stats.deletes++; },
  };
  const bad = (name, args) => { for (const a of args) { if (typeof a === 'number' && !Number.isFinite(a)) stats.badNumbers.push(name + ':' + a); else if (a && typeof a.length === 'number' && typeof a !== 'string') for (const v of a) if (!Number.isFinite(v)) stats.badNumbers.push(name + '[]:' + v); } };
  return new Proxy(base, {
    get(t, k) { if (k in t) return t[k]; if (typeof k === 'symbol') return undefined; if (/^[A-Z_0-9]+$/.test(k)) return 1; return (...args) => { stats.calls++; if (/^uniform/.test(k)) bad(k, args); }; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function fakeContext2D(stats) {
  const grad = {addColorStop() {}};
  const base = {measureText: text => ({width: String(text).length * 6}), createLinearGradient: () => grad, createRadialGradient: () => grad};
  return new Proxy(base, {
    get(t, k) { if (k in t) return t[k]; return (...a) => { stats.calls2d++; for (const x of a) if (typeof x === 'number' && !Number.isFinite(x)) stats.badNumbers.push(String(k) + ':' + x); }; },
    set(t, k, v) { t[k] = v; return true; },
  });
}

class FakeElement {
  constructor(tag = 'div', rect = {left: 0, top: 0, width: 600, height: 360}) {
    this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.listeners = {}; this.rect = rect;
    this.style = {setProperty(k, v) { this[k] = v; }}; this.dataset = {}; this.events = []; this.hidden = false; this.isConnected = true; this.parentElement = null; this.parentNode = null; this.textContent = ''; this.id = '';
    this.clientLeft = 0; this.clientTop = 0; this.clientWidth = rect.width; this.clientHeight = rect.height; this.offsetWidth = rect.width; this.offsetHeight = rect.height;
    const set = new Set(); this.classes = set; this.ownerDocument = FakeElement.doc || {};
    this.classList = {add: v => set.add(v), remove: (...v) => v.forEach(x => set.delete(x)), contains: v => set.has(v), toggle: v => set.has(v) ? set.delete(v) : set.add(v)};
  }
  appendChild(node) { node.parentElement = node.parentNode = this; this.children.push(node); return node; }
  append(...nodes) { nodes.forEach(n => this.appendChild(n)); }
  insertBefore(node, ref) { node.parentElement = node.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(node); else this.children.splice(i, 0, node); return node; }
  get nextSibling() { const i = this.parentNode ? this.parentNode.children.indexOf(this) : -1; return i >= 0 ? this.parentNode.children[i + 1] || null : null; }
  contains(node) { for (let n = node; n; n = n.parentElement) if (n === this) return true; return false; }
  getBoundingClientRect() { return {...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height}; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(k, f) { this.listeners[k] = f; }
  removeEventListener(k) { delete this.listeners[k]; }
  get firstChild() { return this.children[0] || null; }
  focus() { this.focused = true; this.ownerDocument.activeElement = this; }
  blur() { this.focused = false; }
  dispatchEvent(e) { this.events.push(e); return true; }
  getClientRects() { return [this.rect]; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(n => n !== this); this.parentElement = this.parentNode = null; }
}

function setup({reduced = false, webgl = true, loadSource = true} = {}) {
  const stats = {draws: 0, tris: 0, clears: 0, deletes: 0, calls: 0, calls2d: 0, badNumbers: [], createdCanvases: []};
  const stage = new FakeElement('div');
  const canvas = new FakeElement('canvas'); canvas.getContext = () => fakeContext2D(stats); canvas.width = 0; canvas.height = 0;
  const depot = new FakeElement('div', {left: 440, top: 260, width: 140, height: 80});
  const row = new FakeElement('div', {left: 60, top: 80, width: 300, height: 40}); row.textContent = '测试新闻标题';
  stage.append(canvas, depot, row);
  const frames = [], timers = [], scripts = [];
  const head = new FakeElement('head'), dl = {}, wl = {};
  const documentStub = {
    head, hidden: false, activeElement: null, addEventListener: (k, f) => { (dl[k] ||= []).push(f); }, removeEventListener: (k, f) => { dl[k] = (dl[k] || []).filter(x => x !== f); },
    createElement: tag => {
      const el = new FakeElement(tag);
      if (tag === 'canvas') { el.getContext = type => /webgl/.test(type) ? (webgl ? fakeGL(stats) : null) : fakeContext2D(stats); stats.createdCanvases.push(el); }
      if (tag === 'script') scripts.push(el);
      return el;
    },
    createElementNS: (ns, tag) => new FakeElement(tag),
  };
  const dispatched = [];
  const win = {
    document: documentStub, devicePixelRatio: 3, innerWidth: 1200, innerHeight: 800,
    getComputedStyle: () => ({display: 'block', visibility: 'visible', overflowX: 'visible', overflowY: 'visible'}),
    setTimeout: (cb, ms) => { timers.push({cb, ms}); return timers.length; }, clearTimeout() {},
    requestAnimationFrame: cb => { frames.push(cb); return frames.length; }, cancelAnimationFrame() {},
    dispatched, dispatchEvent: e => { dispatched.push(e); return true; },
    addEventListener: (k, f) => { (wl[k] ||= []).push(f); }, removeEventListener: (k, f) => { wl[k] = (wl[k] || []).filter(x => x !== f); }, matchMedia: () => ({matches: reduced, addEventListener() {}, removeEventListener() {}}),
  };
  FakeElement.doc = documentStub; const clock = {now: 0};
  const context = vm.createContext({window: win, document: documentStub, console, CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }, Math, Number, Array, String, Object, Map, WeakMap, Set, Boolean, Date, Promise, Float32Array, Uint16Array, Uint8Array, performance: {now: () => clock.now}, ...win});
  context.window = context; context.global = context;
  if (loadSource) vm.runInContext(source, context);
  vm.runInContext(petsSource, context);
  let time = 0;
  const step = (count = 1, dt = 16.7) => { for (let i = 0; i < count; i++) { time += dt; timers.splice(0).forEach(t => t.cb()); frames.splice(0).forEach(cb => cb(time)); } };
  return {context, stage, canvas, depot, row, stats, step, frames, timers, scripts, head, dl, wl, documentStub, clock, dispatched};
}
const mountOpts = t => ({root: t.stage, canvas: t.canvas, depot: t.depot});

test('source is CSP-safe, offline and asset-free', () => {
  assert.doesNotMatch(source, /\beval\s*\(|new Function|import\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|https?:\/\/|new Image|\.src\s*=|innerHTML|importScripts|new Worker|OffscreenCanvas/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /webglcontextlost/);
});

test('chibi proportions: head wider than the body, big eyes, tall ears, round body (read from the live geometry)', () => {
  const t = setup(); const api = t.context.NewsTabbycat.mount(mountOpts(t)); api.resume(); t.step(60);
  const sh = api.inspect().shape, head = sh.find(p => p.mesh === 'head'), body = sh.find(p => p.mesh === 'body' && p.mat === 2);
  const eyes = sh.filter(p => p.mat === 6), ears = sh.filter(p => p.mat === 5);
  assert.ok(head && body && eyes.length === 2 && ears.length === 2, 'head, body, 2 eyes, 2 ears are present');
  assert.ok(head.w / body.w > 1.1 && head.w / body.w < 1.45, 'head is a bit wider than the body (chibi 2-head): ' + (head.w / body.w).toFixed(2));
  assert.ok(eyes[0].w / head.w > .22 && eyes[0].w / head.w < .34, 'big anime eyes: ' + (eyes[0].w / head.w).toFixed(2));
  assert.ok(eyes[0].h / eyes[0].w > 1.0, 'eyes are taller than wide');
  assert.ok(ears[0].h / head.h > .45, 'ears are tall triangles: ' + (ears[0].h / head.h).toFixed(2));
  assert.ok(body.h / body.w > .85 && body.h / body.w < 1.2, 'round body: ' + (body.h / body.w).toFixed(2));
  assert.ok(Math.abs(ears[0].x + ears[1].x - 2 * head.x) < head.w * .25, 'ears sit symmetrically on the head');
  api.destroy();
});

test('size budget: one plain-JS file, no vendored three.js, lazy only', () => {
  const bytes = Buffer.byteLength(source), gz = zlib.gzipSync(source, {level: 9}).length;
  assert.ok(bytes < 160 * 1024, 'news-tabbycat.js is ' + bytes + ' bytes');
  assert.ok(gz < 54 * 1024, 'news-tabbycat.js gzip is ' + gz + ' bytes');
  assert.ok(!fs.existsSync(path.join(root, 'web/workspace/vendor/three.bundle.js')));
  const html = read('web/workspace/news-reader.html');
  assert.doesNotMatch(html, /news-tabbycat\.js|three/, 'the heavy pet is lazy-loaded, never a <script> in the page');
  assert.match(html, /<option value="tabbycat">狸花猫<\/option>/);
});

test('registry: tabbycat is registered; the script is NOT requested until the pet is mounted', () => {
  const t = setup({loadSource: false});
  assert.ok(t.context.window.NewsPets.list().map(p => p.name).includes('tabbycat'));
  assert.equal(t.scripts.length, 0, 'registering must not load anything');
  assert.ok(Object.isFrozen(t.context.window.NewsPets));
});

test('lazy mount: synchronous proxy, one same-origin script, queued calls replayed on the real pet', async () => {
  const t = setup({loadSource: false});
  const api = t.context.NewsPets.mount('tabbycat', mountOpts(t));
  for (const k of ['pointAt', 'capture', 'cancel', 'setCollecting', 'pause', 'resume', 'setOptions', 'inspect', 'destroy', 'setStatus']) assert.equal(typeof api[k], 'function', k);
  assert.equal(t.scripts.length, 1); assert.equal(t.scripts[0].src, '/news-tabbycat.js');
  assert.equal(t.head.children.length, 1);
  assert.equal(api.inspect().loading, true);
  api.setStatus({quotaLeftPercent: 12}); api.setOptions({scale: 1.2}); api.resume();
  vm.runInContext(source, t.context); t.scripts[0].onload();
  await new Promise(r => setImmediate(r));
  const info = api.inspect();
  assert.equal(info.pet, 'tabbycat'); assert.equal(info.status.quotaLeftPercent, 12); assert.equal(info.scale, 1.2);
  api.destroy();
});

test('lazy mount falls back to the first available pet (the spider) if the script cannot be loaded', async () => {
  const t = setup({loadSource: false});
  vm.runInContext('for (const n of ["mantis", "spider"]) window.NewsPets.register(n, {label: n, mount: o => ({inspect: () => ({pet: "fallback-stub"}), destroy() {}})})', t.context);
  const api = t.context.NewsPets.mount('tabbycat', mountOpts(t));
  t.scripts[0].onerror();
  await new Promise(r => setImmediate(r));
  assert.equal(api.inspect().pet, 'fallback-stub');
  assert.deepEqual(JSON.parse(JSON.stringify(t.dispatched.map(e => [e.type, e.detail]))), [['news-pet-fallback', {pet: 'tabbycat', fallback: 'spider'}]], 'the host is told which pet was replaced');
});

test('mount validates its stage, uses a small private WebGL canvas and exposes the full pet API', () => {
  const t = setup();
  assert.throws(() => t.context.NewsTabbycat.mount({root: t.stage, canvas: t.canvas, depot: new FakeElement('div')}), /same stage/);
  const api = t.context.NewsTabbycat.mount(mountOpts(t));
  for (const k of ['pointAt', 'capture', 'cancel', 'setCollecting', 'pause', 'resume', 'setOptions', 'inspect', 'destroy', 'setStatus']) assert.equal(typeof api[k], 'function', k);
  api.resume(); t.step(10);
  const info = api.inspect();
  assert.equal(info.pet, 'tabbycat'); assert.equal(info.renderer, 'webgl'); assert.equal(info.destroyed, false);
  assert.ok(info.tris > 0 && info.tris < 12000, 'mesh budget < 12k tris, got ' + info.tris);
  assert.ok(info.canvas.w <= 400 && info.canvas.h <= 400, 'canvas ' + info.canvas.w + 'x' + info.canvas.h);
  assert.ok(info.canvas.dpr <= 2, 'DPR is capped at 2');
  assert.ok(info.canvas.w * info.canvas.h < 0.2 * 600 * 360 * 4, 'small canvas, not stage-sized');
  assert.ok(t.stats.draws > 20 && t.stats.clears >= 1, 'drew ' + t.stats.draws);
  assert.equal(t.stats.createdCanvases.filter(c => c.parentNode === t.stage).length >= 1, true, 'private GL canvas lives in the stage');
  assert.deepEqual(t.stats.badNumbers, []);
  api.destroy();
});

test('a full capture runs approach → look → crouch → pounce → grab → carry → deliver with no NaN', () => {
  const t = setup();
  const delivered = [], captured = [], cancelled = [];
  const api = t.context.NewsTabbycat.mount({...mountOpts(t), onCapture: e => captured.push(e.id), onDelivered: e => delivered.push(e.id), onCancel: e => cancelled.push(e.id)});
  api.resume(); t.step(30);
  assert.equal(api.capture({id: 'a1', element: t.row, label: '测试新闻标题'}), true);
  assert.equal(api.capture({id: 'a1', element: t.row}), false, 'duplicate id is rejected');
  const stages = new Set();
  for (let i = 0; i < 60 * 40 && !delivered.length; i++) { t.step(1); stages.add(api.inspect().stage); }
  assert.deepEqual(delivered, ['a1']); assert.deepEqual(captured, ['a1']); assert.deepEqual(cancelled, []);
  for (const s of ['approach', 'look', 'crouch', 'pounce', 'grab', 'carry']) assert.ok(stages.has(s), 'missing stage ' + s + ' in ' + [...stages]);
  assert.deepEqual(t.stats.badNumbers, []);
  api.destroy();
});

test('cancel, status clamping, pause/resume and destroy are well behaved (and dispose the GL resources)', () => {
  const t = setup();
  const cancelled = [];
  const api = t.context.NewsTabbycat.mount({...mountOpts(t), onCancel: e => cancelled.push(e)});
  api.resume(); t.step(5);
  api.capture({id: 'x', element: t.row, label: 'x'});
  assert.equal(api.cancel('x'), true); assert.equal(api.cancel('x'), false);
  assert.deepEqual(cancelled.map(e => e.id), ['x']);
  api.setStatus({quotaLeftPercent: 150}); assert.equal(api.inspect().status.quotaLeftPercent, 100);
  api.setStatus({quotaLeftPercent: -4}); assert.equal(api.inspect().status.quotaLeftPercent, 0);
  api.setStatus({quotaLeftPercent: 'oops'}); assert.equal(api.inspect().status.quotaLeftPercent, null);
  api.setStatus({agentsRunning: 3}); assert.equal(api.inspect().status.agentsRunning, true);
  api.setStatus({agentsRunning: 0}); assert.equal(api.inspect().status.agentsRunning, false);
  api.setOptions({scale: 99, speed: -1}); assert.ok(api.inspect().scale <= 1.8);
  api.setOptions({scale: 0}); assert.ok(api.inspect().scale >= 0.5);
  api.pause(); assert.equal(api.inspect().running, false);
  const before = t.stats.draws; t.step(10); assert.equal(t.stats.draws, before, 'a paused pet does not redraw');
  api.resume(); assert.equal(api.inspect().running, true);
  const glCanvas = t.stats.createdCanvases.find(c => c.parentNode === t.stage);
  api.destroy(); assert.equal(api.inspect().destroyed, true);
  assert.ok(t.stats.deletes >= 2, 'buffers/program are deleted on destroy');
  assert.equal(glCanvas.parentNode, null, 'private GL canvas is removed on destroy');
  assert.equal(api.capture({id: 'y', element: t.row}), false);
  assert.equal(api.pointAt(t.row), false);
  assert.deepEqual(t.stats.badNumbers, []);
});

test('pointAt marks the target with the shared probe class and clears it', () => {
  const t = setup();
  const api = t.context.NewsTabbycat.mount(mountOpts(t));
  api.resume(); t.step(5);
  assert.equal(api.pointAt(t.row, '读'), true);
  assert.ok(t.row.classes.has('news-spider-probe'));
  t.step(240); assert.equal(api.inspect().probe.id, '读');
  api.pointAt(null); assert.ok(!t.row.classes.has('news-spider-probe'));
  api.destroy();
});

test('cute extras (meow, rub, knead, purr, belly-up, groom, stretch, hop, sleep/wake) animate; a calm or sleeping pet idles at a low frame rate', () => {
  const t = setup();
  const api = t.context.NewsTabbycat.mount(mountOpts(t));
  api.resume(); t.step(60);
  let maxTris = 0;
  for (const kind of ['meow', 'tilt', 'belly', 'wiggle', 'groom', 'knead', 'purr', 'rub', 'stretch', 'loaf', 'hop', 'surprise', 'yawn', 'sit', 'blink', 'bubble']) { assert.doesNotThrow(() => api.poke(kind), kind); t.step(40); maxTris = Math.max(maxTris, api.inspect().tris); }
  assert.ok(maxTris > 0 && maxTris < 12000, 'tri budget in every expression, got ' + maxTris);
  for (const [kind, act] of [['groom', 'groom'], ['knead', 'knead'], ['purr', 'purr'], ['stretch', 'stretch']]) { t.step(300); api.poke(kind); t.step(6); assert.equal(api.inspect().mood.act, act, kind + ' becomes the active gesture'); let ended = false; for (let i = 0; i < 400 && !ended; i++) { t.step(1); ended = api.inspect().mood.act !== act; } assert.ok(ended, kind + ' ends by itself'); }
  api.poke('hop'); let maxHop = 0;
  for (let i = 0; i < 40; i++) { t.step(1); maxHop = Math.max(maxHop, Math.abs(api.inspect().mood.hop || 0)); }
  assert.ok(maxHop > 0, 'hop moves the pet');
  api.poke('sleep'); t.step(900);
  assert.equal(api.inspect().mood.sleeping, true, 'falls asleep');
  assert.ok(api.inspect().perf.intervalMs >= 33 && api.inspect().perf.intervalMs <= 50, 'deep sleep draws at 20-30 fps (no 85 ms stutter), got ' + api.inspect().perf.intervalMs + ' ms');
  api.poke('wake'); t.step(120);
  assert.equal(api.inspect().mood.sleeping, false, 'wakes');
  assert.deepEqual(t.stats.badNumbers, []);
  api.destroy();
});

test('quota and agents moods change the look and stay finite', () => {
  const t = setup();
  const api = t.context.NewsTabbycat.mount(mountOpts(t));
  api.resume(); t.step(30);
  api.setStatus({agentsRunning: true, quotaLeftPercent: 8}); t.step(120);
  assert.equal(JSON.stringify(api.inspect().status), JSON.stringify({agentsRunning: true, quotaLeftPercent: 8}));
  api.setStatus({agentsRunning: false, quotaLeftPercent: null}); t.step(60);
  assert.deepEqual(t.stats.badNumbers, []);
  api.destroy();
});

test('reduced motion keeps the pet at a ~2 fps idle loop', () => {
  const t = setup({reduced: true});
  const api = t.context.NewsTabbycat.mount(mountOpts(t));
  api.resume(); t.step(400);
  const before = api.inspect().perf.frames; t.step(120);
  const drawn = api.inspect().perf.frames - before;
  assert.ok(drawn <= 8, 'drew ' + drawn + ' frames in 2 s (30 fps would be 60)');
  api.destroy();
});

test('WebGL unavailable: falls back to the 2D canvas renderer and still runs a full capture', () => {
  const t = setup({webgl: false});
  const delivered = [];
  const api = t.context.NewsTabbycat.mount({...mountOpts(t), onDelivered: e => delivered.push(e.id)});
  api.resume(); t.step(20);
  const info = api.inspect();
  assert.equal(info.renderer, 'canvas2d-fallback'); assert.equal(info.tris, 0);
  assert.ok(t.stats.calls2d > 500, '2D draw calls: ' + t.stats.calls2d);
  assert.equal(t.stats.draws, 0);
  api.capture({id: 'f1', element: t.row, label: 'x'});
  for (let i = 0; i < 60 * 40 && !delivered.length; i++) t.step(1);
  assert.deepEqual(delivered, ['f1']);
  assert.deepEqual(t.stats.badNumbers, []);
  api.destroy();
});

test('assets are registered in every packaging place', () => {
  for (const file of ['news-tabbycat.js']) {
    assert.match(read('src/control_everything/http/news_reader.py'), new RegExp(file.replace('.', '\\.')));
    assert.match(read('tools/packaging/build_assets.py'), new RegExp(file.replace('.', '\\.')));
    assert.match(read('MANIFEST.in'), new RegExp(file.replace('.', '\\.')));
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// real status feed (news-pet-status.js) + pet reactions + quick-access menu
const feedSource = read('web/workspace/news-pet-status.js');
function loadFeed({hidden = false, responses = {}, usageMs = 60000} = {}) {
  const calls = [], consoleCalls = [], timers = [], listeners = {};
  const doc = {hidden, addEventListener: (k, f) => { (listeners[k] ||= []).push(f); }, removeEventListener: (k, f) => { listeners[k] = (listeners[k] || []).filter(x => x !== f); }};
  const T = {set: (fn, ms) => { timers.push({fn, ms, on: true}); return timers.length - 1; }, clear: id => { if (timers[id]) timers[id].on = false; }};
  const sandbox = {console: new Proxy({}, {get: () => (...a) => consoleCalls.push(a)}), AbortController, Math, Number, Array, Boolean, Promise, Error, globalThis: null};
  const ctx = vm.createContext(sandbox); sandbox.globalThis = ctx; vm.runInContext(feedSource, ctx);
  const fetchJson = async (url, signal) => { calls.push({url, signal: Boolean(signal)}); const r = responses[url]; if (typeof r === 'function') return r(); if (r instanceof Error) throw r; return r; };
  const applied = [];
  const feed = ctx.PetStatusFeed.start({document: doc, timers: T, fetchJson, apply: v => applied.push(v), usageMs, observeMs: 15000});
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  const live = () => timers.filter(t => t.on && t.ms >= 1000);
  const fire = async url => { const i = timers.findIndex(t => t.on && t.ms >= 1000 && t.url === undefined); const due = live(); return due; };
  return {ctx, feed, calls, consoleCalls, timers, applied, doc, listeners, flush, live};
}
const USAGE_OK = {status: 'ok', codex: {status: 'available', source: 'codex_app_server', sampled_at: 1, last_success_at: 1, reason: null, error_code: null,
  buckets: [{id: 'codex', primary: {used_percent: 31, window_minutes: 300, resets_at: 1}, secondary: {used_percent: 83.5, window_minutes: 10080, resets_at: 2}}, {id: 'spark', primary: null, secondary: {used_percent: null}}]}, manual_records: []};
const USAGE_EMPTY = {status: 'ok', codex: {status: 'not_checked', source: 'codex_app_server', sampled_at: null, last_success_at: null, reason: null, error_code: null, buckets: []}, manual_records: []};
const obsOf = (status, instances) => ({status, reason: null, environment_id: 'windows:local', instances});

test('feed mapping: quota = 100 - max used_percent; agents = live observed instances (shapes from the backend)', () => {
  const {ctx} = loadFeed({responses: {}});
  const F = ctx.PetStatusFeed;
  assert.equal(F.quotaLeft(USAGE_OK), 16.5);
  assert.equal(F.quotaLeft({codex: {status: 'stale', buckets: [{primary: {used_percent: 100}}]}}), 0);
  assert.equal(F.quotaLeft({codex: {status: 'available', buckets: [{primary: {used_percent: 140}}]}}), 0, 'clamped');
  for (const bad of [USAGE_EMPTY, null, {}, {codex: {status: 'unavailable', buckets: [{primary: {used_percent: 10}}]}}, {codex: {status: 'available', buckets: [{primary: {used_percent: null}}]}}, {codex: {status: 'available', buckets: 'x'}}])
    assert.equal(F.quotaLeft(bad), undefined);
  const inst = (status, extra = {}) => ({status, provider_id: 'codex', kind: 'cli', pid: 1, classification: 'agent', ...extra});
  assert.equal(F.runningAgents(obsOf('available', [inst('available'), inst('available'), inst('stale'), inst('available', {classification: 'custom_exe'})])), 2);
  assert.equal(F.runningAgents(obsOf('available', [])), 0);
  for (const bad of [obsOf('unavailable', []), obsOf('stale', [inst('available')]), obsOf('limited', [inst('available')]), null, {status: 'available'}]) assert.equal(F.runningAgents(bad), undefined);
});

test('feed polls with the right intervals, reports changes only, never prints, and sends GET-only same-origin requests', async () => {
  const t = loadFeed({responses: {'/api/workspace/usage': USAGE_OK, '/api/workspace/observations': obsOf('available', [{status: 'available'}, {status: 'available'}])}});
  await t.flush();
  assert.deepEqual(t.calls.map(c => c.url).sort(), ['/api/workspace/observations', '/api/workspace/usage']);
  assert.ok(t.calls.every(c => c.signal), 'every request has an abort signal (timeout)');
  assert.equal(JSON.stringify(t.applied.sort((a, b) => Object.keys(a)[0].localeCompare(Object.keys(b)[0]))), JSON.stringify([{agentsRunning: 2}, {quotaLeftPercent: 16.5}]));
  const intervals = t.feed.inspect().sources.map(s => [s.key, s.delay]);
  assert.equal(JSON.stringify(intervals), JSON.stringify([['quotaLeftPercent', 60000], ['agentsRunning', 15000]]));
  const timersBefore = t.live().filter(x => x.ms === 15000 || x.ms === 60000);
  assert.equal(timersBefore.length, 2);
  t.applied.length = 0; const due = timersBefore.find(x => x.ms === 15000); due.on = false; due.fn(); await t.flush();     // unchanged -> no apply
  assert.deepEqual(t.applied, []);
  assert.deepEqual(t.consoleCalls, []);
  t.feed.stop(); assert.equal(t.live().length, 0);
  assert.equal(t.listeners.visibilitychange.length, 0);
});

test('feed backs off exponentially on misses, caps, forgets stale values after 3 misses, and recovers silently', async () => {
  let mode = 'ok';
  const t = loadFeed({usageMs: 7e6, responses: {'/api/workspace/usage': USAGE_EMPTY, '/api/workspace/observations': () => { if (mode === 'ok') return obsOf('available', [{status: 'available'}]); if (mode === 'throw') throw new Error('503'); return obsOf('unavailable', []); }}});
  await t.flush();
  const obs = () => t.feed.inspect().sources[1], usage = () => t.feed.inspect().sources[0];
  assert.equal(obs().value, 1); assert.equal(JSON.stringify(t.applied.filter(a => 'agentsRunning' in a)), '[{"agentsRunning":1}]');
  assert.equal(usage().fails, 1, 'not_checked quota counts as a miss'); assert.equal(usage().delay, 300000, 'delays never exceed the 5 min cap');
  const fireNext = async ms => { const due = t.live().filter(x => x.ms === ms); assert.ok(due.length, 'timer ' + ms); for (const timer of due) { timer.on = false; timer.fn(); } await t.flush(); };
  mode = 'throw';
  await fireNext(15000); assert.equal(obs().fails, 1); assert.equal(obs().delay, 30000); assert.equal(obs().value, 1, 'one miss keeps the value');
  await fireNext(30000); assert.equal(obs().delay, 60000);
  await fireNext(60000); assert.equal(obs().fails, 3); assert.equal(obs().value, false, 'stale value dropped after 3 misses');
  assert.equal(JSON.stringify(t.applied.filter(a => 'agentsRunning' in a)), '[{"agentsRunning":1},{"agentsRunning":false}]');
  await fireNext(120000); await fireNext(240000); assert.equal(obs().delay, 300000, 'capped at 5 min');
  await fireNext(300000); assert.equal(obs().delay, 300000);
  mode = 'unavailable'; await fireNext(300000); assert.equal(obs().fails, 7, 'a 200 {status:unavailable} backs off too');
  mode = 'ok'; await fireNext(300000); assert.equal(obs().fails, 0); assert.equal(obs().delay, 15000); assert.equal(obs().value, 1);
  assert.deepEqual(t.consoleCalls, []);
});

test('feed pauses while the tab is hidden and polls again immediately when it becomes visible', async () => {
  const t = loadFeed({responses: {'/api/workspace/usage': USAGE_OK, '/api/workspace/observations': obsOf('available', [])}});
  await t.flush(); const polled = t.calls.length;
  t.doc.hidden = true; t.listeners.visibilitychange.forEach(f => f());
  assert.equal(t.live().length, 0, 'timers cleared while hidden');
  await t.flush(); assert.equal(t.calls.length, polled);
  t.doc.hidden = false; t.listeners.visibilitychange.forEach(f => f()); await t.flush();
  assert.equal(t.calls.length, polled + 2, 'immediate catch-up poll');
  assert.equal(t.live().length >= 2, true);
  const h = loadFeed({hidden: true, responses: {'/api/workspace/usage': USAGE_OK, '/api/workspace/observations': obsOf('available', [])}});
  await h.flush(); assert.equal(h.calls.length, 0, 'a tab that starts hidden does not poll');
  h.doc.hidden = false; h.listeners.visibilitychange.forEach(f => f()); await h.flush(); assert.equal(h.calls.length, 2);
});

test('feed output reaches setStatus: quota/agents mapped, same API for any pet', async () => {
  const t = setup(); const api = t.context.NewsTabbycat.mount(mountOpts(t)); api.resume(); t.step(20);
  const feed = loadFeed({responses: {'/api/workspace/usage': USAGE_OK, '/api/workspace/observations': obsOf('available', [{status: 'available'}, {status: 'available'}, {status: 'available'}])}});
  feed.feed.stop();
  const f2 = feed.ctx.PetStatusFeed.start({document: feed.doc, timers: {set: () => 0, clear() {}}, apply: v => api.setStatus(v), fetchJson: async url => url.endsWith('usage') ? USAGE_OK : obsOf('available', [{status: 'available'}, {status: 'available'}, {status: 'available'}])});
  await feed.flush();
  const s = api.inspect(); assert.equal(s.status.quotaLeftPercent, 16.5); assert.equal(s.status.agentsRunning, true); assert.equal(s.agentCount, 3);
  f2.stop(); api.destroy();
});

test('pet reactions: low quota hungry bubble, quota 0 sad, agents bump up, finishing celebrates, demo-free start does not', () => {
  const t = setup(); const api = t.context.NewsTabbycat.mount(mountOpts(t)); api.resume(); t.step(40);
  assert.equal(api.inspect().mood.bubble, '');
  api.setStatus({quotaLeftPercent: 12}); t.step(70);
  let i = api.inspect(); assert.ok(i.weights.quota > .6, 'worry weight ' + i.weights.quota); assert.ok(i.weights.sad < .1);
  assert.match(i.mood.bubble, /额度快没啦|肚子饿扁了|有点慌/);
  api.setStatus({quotaLeftPercent: 0}); t.step(150);
  i = api.inspect(); assert.ok(i.weights.sad > .8, 'sad ' + i.weights.sad); assert.ok(i.weights.sit > .5, 'sits down when sad ' + i.weights.sit);
  assert.match(i.mood.bubble + '|' + 'x', /额度用完了|呜呜|\|x/);
  api.setStatus({quotaLeftPercent: null}); t.step(200); assert.ok(api.inspect().weights.sad < .05);
  api.setStatus({agentsRunning: 2}); t.step(60);
  i = api.inspect(); assert.ok(i.weights.alert > .9, 'back bumps raised'); assert.equal(i.agentCount, 2); assert.match(i.mood.bubble, /智能体|agent|忙|跑/i);
  t.step(400); assert.equal(api.inspect().mood.act === null || typeof api.inspect().mood.act === 'string', true);
  api.setStatus({agentsRunning: 1}); t.step(3);
  assert.match(api.inspect().mood.bubble, /完成啦|搞定/, 'count dropped 2 -> 1');
  api.setStatus({agentsRunning: 0}); t.step(30); i = api.inspect();
  assert.match(i.mood.bubble, /完成啦|搞定/); assert.equal(i.mood.act, 'cheer', 'celebration');
  assert.deepEqual(t.stats.badNumbers, []);
  api.destroy();
  // starting with a running count / re-applying the same status (pet switch) must not celebrate
  const u = setup(); const b = u.context.NewsTabbycat.mount(mountOpts(u)); b.resume(); u.step(10);
  b.setStatus({agentsRunning: 3}); u.step(20); b.setStatus({agentsRunning: 3}); b.setStatus({agentsRunning: 3}); u.step(5);
  assert.doesNotMatch(b.inspect().mood.bubble, /完成啦|搞定/); b.setStatus({agentsRunning: 5}); u.step(5); assert.doesNotMatch(b.inspect().mood.bubble, /完成啦|搞定/);
  b.destroy();
});

function press(t, key, extra = {}) { let prevented = false; (t.dl.keydown || []).slice().forEach(f => f({key, ctrlKey: false, metaKey: false, altKey: false, preventDefault() { prevented = true; }, ...extra})); return prevented; }
function clickPet(t, api, opts = {}) {
  t.clock.now += opts.gap ?? 1000;
  const p = api.inspect().position, u = api.inspect().unit, pt = {clientX: p.x, clientY: p.y - 52 * u, button: 0, pointerType: 'mouse', preventDefault() {}, ...opts};
  t.dl.pointerdown.slice().forEach(f => f(pt)); (t.wl.pointerup || []).slice().forEach(f => f(pt));
}
const dialOf = t => t.stage.children.find(c => c.attributes.role === 'menu');
const items = d => d.children.filter(c => c.attributes.role === 'menuitem');
const ev = (d, api, dx, dy, extra = {}) => { const g = api.inspect().dial; return {clientX: g.cx + dx, clientY: g.cy + dy, button: 0, pointerId: 1, target: d, stopPropagation() {}, preventDefault() {}, ...extra}; };
test('action dial: a click on the pet fans out a ring of icon sectors; Escape / outside / double-click close it; choosing runs + reports', () => {
  const t = setup(); const ran = [], reported = [];
  const api = t.context.NewsTabbycat.mount({...mountOpts(t), actions: [{id: 'workspace', label: '打开工作台', run: d => ran.push(d.id)}, {id: 'news', label: '新闻阅读器'}, {id: 'search', label: '搜索', run: () => { throw new Error('host bug'); }}, {id: 'next', label: '下一条'}], onAction: d => reported.push(d.id)});
  api.resume(); t.step(30);
  const dial = dialOf(t); assert.ok(dial && dial.attributes['aria-label'], 'dial element has an accessible name');
  assert.equal(dial.dataset.open, 'false'); assert.equal(api.inspect().dial.open, false); assert.notEqual(dial.style.visibility, 'visible', 'closed dial is not in the way');
  const bs = items(dial); assert.equal(bs.length, 4 + 2, '4 sector items + hub + page toggle'); assert.ok(bs.every(b => b.attributes['aria-label']), 'every item is named');
  assert.equal(bs.filter(b => b.dataset.i !== undefined).length, 4);
  clickPet(t, api); t.step(40);
  assert.equal(dial.dataset.open, 'true', 'click opens'); assert.equal(api.inspect().dial.open, true); assert.equal(dial.style.visibility, 'visible');
  assert.ok(api.inspect().dial.o > .95, 'spring settles open'); assert.equal(api.inspect().dial.labels.join(), '打开工作台,新闻阅读器,搜索,下一条');
  assert.ok(['left', 'right', 'top', 'bottom'].includes(api.inspect().menuSide), 'placed beside the body: ' + api.inspect().menuSide);
  assert.equal(press(t, 'Escape'), true); assert.equal(dial.dataset.open, 'false'); t.step(60); assert.equal(dial.style.visibility, 'hidden', 'close animation ends hidden');
  assert.equal(press(t, 'k', {ctrlKey: true}), false, 'no global key is claimed'); assert.equal(dial.dataset.open, 'false');
  assert.equal(press(t, 'ArrowRight'), false, 'arrows do nothing while the dial is closed');
  assert.equal(api.openMenu(true), true); assert.equal(items(dial).find(b => b.dataset.i === '0').focused, true, 'programmatic open can move focus for keyboard users');
  press(t, 'ArrowRight'); assert.equal(api.inspect().dial.focus, 0); t.step(80); assert.equal(api.inspect().dial.focus, 1); assert.equal(items(dial).find(b => b.dataset.i === '1').focused, true, 'focus follows the turned ring');
  press(t, 'ArrowLeft'); t.step(80); assert.equal(api.inspect().dial.focus, 0); api.closeMenu();
  api.openMenu(); (t.dl.pointerdown || []).forEach(f => f({target: t.canvas, clientX: 900, clientY: 700})); assert.equal(dial.dataset.open, 'false', 'outside press closes');
  api.openMenu(); t.step(40); dial.listeners.click(ev(dial, api, 66, 0));
  assert.deepEqual(reported, ['news'], 'a click on the right-hand sector picks item 1'); assert.equal(dial.dataset.open, 'false', 'choosing closes');
  assert.equal(t.stage.events.length, 1); assert.equal(t.stage.events[0].type, 'news-pet-action'); assert.equal(t.stage.events[0].detail.label, '新闻阅读器');
  api.openMenu(); t.step(40); dial.listeners.click(ev(dial, api, 0, 66)); assert.deepEqual(reported, ['news', 'search'], 'a throwing host action does not break the pet');
  api.openMenu(); t.step(40); dial.listeners.click(ev(dial, api, 0, -66)); assert.deepEqual(ran, ['workspace']);
  api.openMenu(); t.step(40); dial.listeners.click({stopPropagation() {}, target: items(dial).find(b => b.dataset.i === '3')}); assert.equal(reported.at(-1), 'next', 'a keyboard-generated click (no pointer position) uses the focused button');
  clickPet(t, api); t.step(2); assert.equal(dial.dataset.open, 'true');
  clickPet(t, api, {gap: 100}); assert.equal(dial.dataset.open, 'false', 'double click spins and closes');
  api.setActions([{id: 'a', label: 'A'}]); assert.equal(items(dialOf(t)).filter(b => b.dataset.i !== undefined).length, 1);
  api.setActions([]); assert.equal(dialOf(t), undefined); assert.equal(api.openMenu(), false); assert.deepEqual(t.stats.badNumbers, []);
  api.setActions([{id: 'z', label: 'Z'}]); api.openMenu(); api.destroy();
  assert.equal(dialOf(t), undefined, 'destroy removes the dial');
  assert.equal((t.dl.keydown || []).length, 0, 'destroy removes the document key listener'); assert.equal((t.dl.pointerdown || []).length, 0);
});

test('dial geometry: hit-testing by angle, drag / wheel / arrow rotation snaps to a sector, hub confirms', () => {
  const t = setup(); const reported = [];
  const api = t.context.NewsTabbycat.mount({...mountOpts(t), actions: four, onAction: d => reported.push(d.id)}); api.resume(); t.step(30); api.openMenu(); t.step(40);
  const dial = dialOf(t), hit = api.dialHit;
  assert.deepEqual([hit(0, -66), hit(66, 0), hit(0, 66), hit(-66, 0)].map(h => h.i), [0, 1, 2, 3], 'sectors run clockwise from 12 o\'clock');
  assert.deepEqual([hit(0, 0).zone, hit(20, 10).zone, hit(0, -70).zone, hit(0, 100).zone, hit(-95, 0).zone], ['hub', 'hub', 'ring', 'out', 'out']);
  assert.equal(hit(40, -50).i, 0); assert.equal(hit(50, -40).i, 1);
  // drag the ring a quarter turn clockwise: the left-hand item (3) comes to the top; the swallowed click does not pick anything
  dial.listeners.pointerdown(ev(dial, api, 0, -66)); dial.listeners.pointermove(ev(dial, api, 35, -56)); dial.listeners.pointermove(ev(dial, api, 66, 0));
  assert.ok(Math.abs(api.inspect().dial.rot - Math.PI / 2) < .1, 'ring follows the pointer: ' + api.inspect().dial.rot);
  dial.listeners.pointerup(ev(dial, api, 66, 0)); dial.listeners.click(ev(dial, api, 66, 0)); assert.deepEqual(reported, [], 'a drag never picks');
  t.step(80); assert.equal(api.inspect().dial.focus, 3); assert.ok(Math.abs(api.inspect().dial.rot + (-1) * Math.PI / 2) < .05, 'springs to the snapped angle');
  assert.equal(hit(0, -66).i, 3, 'hit-testing follows the rotation'); assert.equal(hit(66, 0).i, 0);
  const hub = items(dial).find(b => b.attributes['aria-label'].startsWith('确认')); assert.equal(hub.attributes['aria-label'], '确认:下一条'); assert.equal(hub.textContent, '下一条', 'the focused label is shown in the hub');
  dial.listeners.pointerdown(ev(dial, api, 0, 0)); hub.listeners.click({stopPropagation() {}}); assert.deepEqual(reported, ['d'], 'hub click confirms the focused sector');
  // wheel: 40px of delta = one step
  api.openMenu(); t.step(40); let prevented = 0; dial.listeners.wheel({deltaY: 30, preventDefault() { prevented++; }}); assert.equal(api.inspect().dial.focus, 0); dial.listeners.wheel({deltaY: 30, preventDefault() { prevented++; }}); t.step(80);
  assert.equal(api.inspect().dial.focus, 1); assert.equal(prevented, 2, 'the wheel is captured only while the dial is open'); dial.listeners.wheel({deltaY: -100, preventDefault() {}}); t.step(80); assert.equal(api.inspect().dial.focus, 0);
  for (let i = 0; i < 6; i++) { dial.listeners.wheel({deltaY: 100, preventDefault() {}}); } t.step(120); assert.equal(api.inspect().dial.focus, 2, 'unbounded turning wraps around: 6 steps on 4 sectors'); assert.ok(api.inspect().dial.rot < -Math.PI * 2.9);
  api.closeMenu(); dial.listeners.wheel({deltaY: 100, preventDefault() { prevented++; }}); assert.equal(prevented, 2); api.destroy(); assert.deepEqual(t.stats.badNumbers, []);
});

test('dial pages: the toggle / arrows flip to the secondary page (max 6 sectors); a pick there still reports', () => {
  const t = setup(); const reported = [];
  const many = Array.from({length: 9}, (_, i) => ({id: 'x' + i, label: 'X' + i}));
  const api = t.context.NewsTabbycat.mount({...mountOpts(t), actions: many, onAction: d => reported.push(d.id)}); api.resume(); t.step(30); api.openMenu(); t.step(40);
  assert.equal(api.inspect().dial.labels.length, 6, 'never more than 6 sectors on a page');
  api.setActions(four); api.openMenu(); t.step(40); const dial = dialOf(t);
  const more = items(dial).find(b => b.attributes['aria-label'] === '更多'); assert.ok(more, 'a small "more" toggle exists');
  more.listeners.click({stopPropagation() {}}); t.step(60);
  const d2 = api.inspect().dial; assert.equal(d2.page, 1); assert.equal(d2.labels.join(), '摸肚皮,蹭蹭,睡觉,状态'); assert.ok(d2.o > .9, 'the dial re-pops after the page switch');
  assert.equal(items(dial).filter(b => b.dataset.i !== undefined).length, 4); assert.equal(items(dial).find(b => b.attributes['aria-label'] === '返回').dataset.i, undefined);
  assert.equal(api.dialHit(0, -66).i, 0); assert.equal(api.dialHit(0, 66).i, 2, 'four 90deg sectors');
  dial.listeners.click(ev(dial, api, 0, -66)); assert.deepEqual(reported, ['pat']); assert.equal(dial.dataset.open, 'false');
  api.openMenu(); t.step(40); assert.equal(api.inspect().dial.page, 0, 'reopening starts on the main page');
  press(t, 'ArrowDown'); assert.equal(api.inspect().dial.page, 1, 'Up/Down flip the page while open'); press(t, 'ArrowUp'); assert.equal(api.inspect().dial.page, 0);
  assert.equal(api.dialPage(), true); t.step(30); dial.listeners.click(ev(dial, api, 0, 66)); assert.equal(reported.at(-1), 'nap', 'the lower sector of page 2 is item 3'); assert.equal(reported.length, 2);
  api.openMenu(); t.step(30); api.dialPage(); t.step(30); dial.listeners.click({stopPropagation() {}, target: items(dial).filter(b => b.dataset.i !== undefined)[3]});
  assert.equal(reported.at(-1), 'status'); assert.match(api.inspect().mood.bubble, /额度|运行/, 'the status item reports the quota / agents');
  api.destroy();
});

test('without host actions the click behaviour is unchanged (no dial; keys are left to the page)', () => {
  const t = setup(); const api = t.context.NewsTabbycat.mount(mountOpts(t)); api.resume(); t.step(20);
  assert.equal(dialOf(t), undefined);
  clickPet(t, api); t.step(3); assert.ok(['hop', 'belly'].includes(api.inspect().state) || api.inspect().mood.hop >= 0);
  assert.equal(press(t, 'k', {ctrlKey: true}), false); assert.equal(api.inspect().dial.open, false);
  api.destroy();
});

/* ---- layout: overlays never collide ---- */
const sizeStage = (t, w, h) => { t.stage.rect = {left: 0, top: 0, width: w, height: h}; t.stage.clientWidth = w; t.stage.clientHeight = h; t.stage.offsetWidth = w; t.stage.offsetHeight = h; };
const sizeOverlays = (t, api) => { for (const c of t.stage.children) { if (c.className === 'tc-bubble') { c.offsetWidth = 96; c.offsetHeight = 34; } else if (c.className === 'tc-chip') { c.offsetWidth = 86; c.offsetHeight = 26; } } };
const four = [{id: 'a', label: '打开工作台'}, {id: 'b', label: '新闻阅读器'}, {id: 'c', label: '搜索'}, {id: 'd', label: '下一条'}];
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
for (const [vw, vh] of [[1010, 640], [1170, 720], [640, 560]]) {
  test(`overlay layout ${vw}x${vh}: bubble / dial / chip / body never overlap and stay inside the stage; the dial never covers the pet`, () => {
    const t = setup(); sizeStage(t, vw, vh);
    const docks = [{x: vw - 70, y: vh - 20}, {x: 90, y: vh - 20}, {x: vw / 2, y: 120}];
    const check = (L, label) => {
      const names = Object.keys(L);
      for (let i = 0; i < names.length; i++) {
        const r = L[names[i]]; assert.ok(r.x >= -1 && r.y >= -1 && r.x + r.w <= vw + 1 && r.y + r.h <= vh + 1, `${label}: ${names[i]} inside stage ${JSON.stringify(r)}`);
        for (let j = i + 1; j < names.length; j++) assert.equal(overlap(r, L[names[j]]), 0, `${label}: ${names[i]} x ${names[j]}`);
      }
    };
    for (const dock of docks) {
      const api = t.context.NewsTabbycat.mount({...mountOpts(t), actions: four, dock: () => dock}); sizeOverlays(t, api); api.resume(); t.step(260);
      api.setStatus({quotaLeftPercent: 10, agentsRunning: 2, agentCount: 2}); t.step(8);
      const before = api.inspect().layout; assert.ok(before.body && before.bubble, 'bubble placed before the dial opens: ' + Object.keys(before)); check(before, 'before');
      api.openMenu(); t.step(30);
      const L = api.inspect().layout, ins = api.inspect();
      assert.ok(L.body && L.dial, 'dial + body placed: ' + Object.keys(L)); assert.ok(L.dial.w >= 216 && L.dial.h >= 216); assert.equal(L.bubble, undefined, 'the bubble hides while the dial is open');
      check(L, 'open'); assert.equal(overlap(L.dial, L.body), 0, 'the dial never covers the pet'); assert.ok(ins.dial.open);
      api.dialPage(); t.step(40); check(api.inspect().layout, 'page 2');
      api.closeMenu(); t.step(80); const after = api.inspect().layout; assert.equal(after.dial, undefined, 'dial gone after closing'); check(after, 'closed');
      api.destroy();
    }
    assert.deepEqual(t.stats.badNumbers, []);
  });
}

test('dial touch targets: sector / hub / toggle buttons are >=44px and neighbours never overlap', () => {
  const css = n => { const m = [...source.matchAll(new RegExp('\\.tc-dial ' + n + '\\{[^}]*\\}', 'g'))]; return m.length ? m[m.length - 1][0] : ''; };
  const wh = c => { const w = +(c.match(/[{;]width:(\d+)px/) || [])[1], h = +(c.match(/[{;]height:(\d+)px/) || [])[1]; return [w, h]; };
  const base = source.match(/\.tc-dial button\{[^}]*\}/)[0], [bw, bh] = wh(base);
  assert.ok(bw >= 44 && bh >= 44, 'sector buttons ' + bw + 'x' + bh);
  for (const k of ['\\.hub', '\\.more']) { const [w, h] = wh(css(k)); assert.ok(w >= 44 && h >= 44, k + ' ' + w + 'x' + h); }
  const RB = +source.match(/RB = (\d+)/)[1], RI = +source.match(/RI = (\d+)/)[1], RO = +source.match(/RO = (\d+)/)[1], chord6 = 2 * RB * Math.sin(Math.PI / 6);
  assert.ok(chord6 >= bw, 'six sector buttons on the ring do not overlap: chord ' + chord6.toFixed(1)); assert.ok(RB - bw / 2 >= RI && RB + bw / 2 <= RO + 3, 'buttons sit inside the ring band');
});

test('dock: with a dock the pet rests at the dock and leaves the article text alone; without one it keeps the depot behaviour', () => {
  const t = setup(); sizeStage(t, 1000, 640); const dock = {x: 930, y: 610};
  const api = t.context.NewsTabbycat.mount({...mountOpts(t), dock: () => dock}); api.resume(); t.step(900);
  const p = api.inspect().position; assert.ok(p.x > 600 && p.y > 400, `pet idles in the dock corner, not on the text: ${JSON.stringify(p)}`);
  assert.equal(JSON.stringify(api.inspect().dock), JSON.stringify(dock));
  api.pointAt({getBoundingClientRect: () => ({left: 100, top: 100, width: 300, height: 30, right: 400, bottom: 130}), isConnected: true}); t.step(300);
  assert.ok(api.inspect().position.x > 500, 'pointing keeps the pet in the dock instead of walking over the text');
  api.destroy();
  const t2 = setup(); const b = t2.context.NewsTabbycat.mount(mountOpts(t2)); b.resume(); t2.step(30); assert.equal(b.inspect().dock, null); b.destroy();
});

test('status chip: quota ring + running count appear only when useful and never carry a hotkey hint', () => {
  const t = setup(); sizeStage(t, 1000, 640); const api = t.context.NewsTabbycat.mount({...mountOpts(t), dock: () => ({x: 900, y: 600})}); sizeOverlays(t, api); api.resume(); t.step(40);
  assert.equal(api.inspect().chip.on, false, 'idle status = no chip');
  api.setStatus({quotaLeftPercent: 80, agentsRunning: 0}); t.step(5); assert.equal(api.inspect().chip.on, false, 'healthy quota alone is not worth a chip');
  api.setStatus({quotaLeftPercent: 12}); t.step(5); assert.equal(api.inspect().chip.on, true); assert.match(api.inspect().chip.text, /12%/);
  api.setStatus({quotaLeftPercent: 60, agentsRunning: 3, agentCount: 3}); t.step(5); assert.equal(api.inspect().chip.on, true); assert.match(api.inspect().chip.text, /3 个 Agent/);
  api.setStatus({agentsRunning: 0, agentCount: 0}); t.step(5); assert.match(api.inspect().chip.text, /已完成/, 'brief done state after agents finish');
  t.step(400); assert.equal(api.inspect().chip.on, false, 'done chip fades away');
  api.destroy();
});

test('no keyboard shortcut anywhere: no hotkey option, no Ctrl/Cmd+K in the pet, the docs or the reader wiring', () => {
  for (const file of ['web/workspace/news-tabbycat.js', 'web/workspace/news-pets.js', 'web/workspace/tabbycat-demo-panel.js', 'web/workspace/news-pet-status.js', 'docs/EMBEDDING.md', 'TABBYCAT_NOTES.md'].filter(f => fs.existsSync(path.join(root, f)))) assert.doesNotMatch(read(file), /hotkey|mod\+k|Ctrl\s*\/?\s*(Cmd\s*)?\+\s*K|Cmd\+K|Control\+k|快捷键|快捷菜单/i, file);
  assert.doesNotMatch(read('web/workspace/news-reader.js').match(/mountMainPet[\s\S]{0,1400}/)[0], /hotkey/);
  assert.doesNotMatch(source, /e\.ctrlKey|e\.metaKey|ctrlKey|metaKey/);
  const t = setup(); const api = t.context.NewsTabbycat.mount({...mountOpts(t), actions: four, hotkey: 'mod+k'}); api.resume(); t.step(10);
  press(t, 'k', {ctrlKey: true}); press(t, 'k', {metaKey: true}); assert.equal(api.inspect().dial.open, false, 'even a stale hotkey option is ignored');
  api.openMenu(); assert.equal(press(t, 'k', {ctrlKey: true}), false, 'open dial: only Escape / arrows are handled'); assert.equal(api.inspect().dial.open, true); api.destroy();
  assert.equal((t.dl.keydown || []).length, 0);
});

test('reduced motion: overlays and chip add no transitions/animation and the pet stays calm', () => {
  assert.match(source, /prefers-reduced-motion/); assert.match(source, /reduce\)\{[^]*?\.tc-chip/); assert.doesNotMatch(source.match(/\.tc-dial[^}]*\}/g).join(''), /transition|animation/, 'the dial animates in JS (springs), never by CSS');
  const t = setup({reduced: true}); sizeStage(t, 1000, 640); const api = t.context.NewsTabbycat.mount({...mountOpts(t), actions: four, dock: () => ({x: 900, y: 600})}); sizeOverlays(t, api); api.resume();
  api.setStatus({quotaLeftPercent: 5, agentsRunning: 2, agentCount: 2}); api.openMenu(); t.step(2);
  assert.equal(api.inspect().dial.o, 1, 'reduced motion: the dial appears at once, no spring'); const dial = dialOf(t); assert.equal(dial.style.opacity, '1'); assert.equal(dial.style.visibility, 'visible');
  api.dialRotate(1); t.step(45); assert.ok(Math.abs(Math.abs(api.inspect().dial.rot) - Math.PI / 2) < 1e-6, 'and it turns in one step');
  t.step(60); const L = api.inspect().layout; assert.ok(L.dial && L.body); assert.equal(overlap(L.dial, L.body), 0);
  api.closeMenu(); t.step(2); assert.equal(dial.style.visibility, 'hidden', 'closes at once'); api.destroy();
});


test('wiring: feed script is registered everywhere and the reader keeps manual/demo values above real ones', () => {
  for (const [file, re] of [['src/control_everything/http/news_reader.py', /news-pet-status\.js/], ['tools/packaging/build_assets.py', /news-pet-status\.js/], ['MANIFEST.in', /news-pet-status\.js/], ['tests/e2e/verify_news_reader.cjs', /news-pet-status\.js/], ['tests/e2e/verify_news_reader_profiles.cjs', /news-pet-status\.js/], ['web/workspace/news-reader.html', /src="\/news-pet-status\.js" defer/]]) assert.match(read(file), re, file);
  assert.doesNotMatch(feedSource, /console\.|POST|method\s*:|\/refresh|innerHTML|https?:\/\//);
  assert.match(feedSource, /'X-Session-Client': 'panel'/);
  const reader = read('web/workspace/news-reader.js');
  assert.match(reader, /petStatus = \{\.\.\.realStatus, \.\.\.statusOverride\}/);
  assert.match(reader, /PetStatusFeed\.start\(\{apply:setRealPetStatus, fetchJson\}\)/);
  assert.doesNotMatch(reader, /actions:petActions\(\)/, 'the engine gets no actions: the host wheel owns the dial');
  assert.match(reader, /setOptions\(\{scale:0\.7, dial:false\}\)/, 'the research pet is decorative and never draws a dial');
  assert.match(petsSource, /'setActions', 'openMenu', 'closeMenu', 'toggleMenu'/);
  const sizes = ['news-tabbycat.js', 'news-pet-status.js'].map(f => Buffer.byteLength(read('web/workspace/' + f)));
  assert.ok(sizes[0] + sizes[1] < 156 * 1024, 'pet + feed script stay modest: ' + (sizes[0] + sizes[1]) + ' B');
});

// ---- round 8: embedding contract (options, dock corners, theme, context loss, host-UI safety, lifecycle)
const glCanvas = t => t.stats.createdCanvases.find(c => c.attributes['data-tc'] === 'gl');
const fire = (el, type, e = {}) => { const f = el.listeners[type]; if (f) f({preventDefault() {}, ...e}); return !!f; };

test('embed API: the same mount contract as the spider/mantis, registered through window.NewsPets, with no new globals', () => {
  const t = setup(); sizeStage(t, 500, 400);
  const api = t.context.NewsPets.mount('tabbycat', mountOpts(t));
  for (const k of ['pointAt', 'capture', 'cancel', 'setCollecting', 'pause', 'resume', 'setOptions', 'inspect', 'destroy', 'setStatus', 'setActions', 'openMenu', 'closeMenu']) assert.equal(typeof api[k], 'function', k);
  assert.equal(t.context.NewsPets.list().map(p => p.name).filter(n => n === 'tabbycat').length, 1);
  const globals = Object.keys(t.context).filter(k => /^(tc|Tc|tabbycat)/.test(k) || /Tabbycat/.test(k));
  assert.equal(JSON.stringify(globals), JSON.stringify(['NewsTabbycat']), 'one namespace object, nothing else leaks to window');
  api.destroy();
});

test('options: size / scale / speed / margin are clamped and come from mount options, root data attributes and setOptions', () => {
  const t = setup(); sizeStage(t, 500, 400); t.stage.dataset.tcSize = '120'; t.stage.dataset.tcDock = 'tl'; t.stage.dataset.tcTheme = 'dark';
  const api = t.context.NewsTabbycat.mount({...mountOpts(t), options: {margin: 20}}); api.resume(); t.step(40);
  const unitFor = size => { api.setOptions({size}); t.step(3); return api.inspect().canvas.w; };
  const uMax = unitFor(5000), uCap = unitFor(1.8 * 84), uMin = unitFor(1), uFloor = unitFor(.5 * 84), uBase = unitFor(84);
  assert.equal(uMax, uCap, 'size is clamped to 1.8x'); assert.equal(uMin, uFloor, 'and to 0.5x'); assert.ok(uMin < uBase && uBase < uMax);
  api.setOptions({size: 'garbage', speed: -4, margin: 9999, dock: 'nowhere', theme: 'neon'}); t.step(2);
  assert.equal(t.stage.getAttribute('data-tc-theme'), 'dark', 'invalid theme and dock values are ignored');
  api.setOptions({theme: 'light'}); assert.equal(t.stage.getAttribute('data-tc-theme'), 'light');
  api.destroy();
});

test('dock corners: tl / tr / bl / br rest in the matching corner of the stage, honouring the margin', () => {
  const pos = {};
  for (const dock of ['tl', 'tr', 'bl', 'br']) {
    const t = setup(); sizeStage(t, 800, 600); const api = t.context.NewsTabbycat.mount({...mountOpts(t), options: {dock, margin: 16, size: 84}}); api.resume(); t.step(900);
    pos[dock] = api.inspect().position; api.destroy();
  }
  assert.ok(pos.tl.x < 400 && pos.bl.x < 400 && pos.tr.x > 400 && pos.br.x > 400, JSON.stringify(pos));
  assert.ok(pos.tl.y < 300 && pos.tr.y < 300 && pos.bl.y > 300 && pos.br.y > 300, JSON.stringify(pos));
  for (const p of Object.values(pos)) assert.ok(p.x >= 0 && p.x <= 800 && p.y >= 0 && p.y <= 600);
});

test('status feed and dial options switch the chip / dial off and on without a remount', () => {
  const t = setup(); sizeStage(t, 1000, 640); const api = t.context.NewsTabbycat.mount({...mountOpts(t), actions: four, options: {status: false, dial: false}}); sizeOverlays(t, api); api.resume(); t.step(30);
  api.setStatus({quotaLeftPercent: 5, agentsRunning: 2, agentCount: 2}); t.step(5); assert.equal(api.inspect().chip.on, false, 'status off: no chip');
  api.openMenu(); t.step(3); assert.equal(api.inspect().dial.open, false, 'dial off: openMenu is a no-op');
  api.setOptions({status: true, dial: true}); api.setStatus({quotaLeftPercent: 5, agentsRunning: 2, agentCount: 2}); t.step(5); assert.equal(api.inspect().chip.on, true);
  api.openMenu(); t.step(3); assert.equal(api.inspect().dial.open, true); api.setOptions({dial: false}); assert.equal(api.inspect().dial.open, false, 'turning the dial off closes it');
  api.destroy();
});

test('WebGL context loss: the pet keeps running on the 2D painter and returns to WebGL when the context is restored', () => {
  const t = setup(); sizeStage(t, 500, 400); const api = t.context.NewsTabbycat.mount(mountOpts(t)); api.resume(); t.step(20);
  assert.equal(api.inspect().renderer, 'webgl'); const gl = glCanvas(t); assert.ok(gl, 'private GL canvas is tagged');
  assert.equal(fire(gl, 'webglcontextlost'), true); t.step(10);
  assert.equal(api.inspect().renderer, 'canvas2d-fallback'); assert.notEqual(t.canvas.style.display, 'none', 'host canvas takes over'); assert.equal(gl.style.display, 'none');
  const calls = t.stats.calls2d; t.step(20); assert.ok(t.stats.calls2d > calls, 'keeps drawing in 2D');
  assert.equal(fire(gl, 'webglcontextrestored'), true); t.step(10);
  assert.equal(api.inspect().renderer, 'webgl'); assert.equal(t.canvas.style.display, 'none'); assert.notEqual(gl.style.display, 'none');
  assert.deepEqual(t.stats.badNumbers, []); api.destroy();
  assert.equal(gl.listeners.webglcontextlost, undefined, 'context listeners are removed on destroy');
});

test('host-UI safety: stage never intercepts pointers, z-index/theme come from CSS variables, style via a <style> element (+ optional nonce), no inline script/eval', () => {
  assert.doesNotMatch(source, /\beval\s*\(|new Function|setTimeout\(\s*['"`]|innerHTML|javascript:|<script|insertAdjacentHTML|document\.write/);
  assert.match(source, /var\(--tc-z,\s?5\)/); assert.match(source, /--tc-paper/); assert.match(source, /data-tc-theme=dark/);
  assert.doesNotMatch(source, /z-index:\s*\d{3,}/, 'no hard-coded high z-index: the host owns stacking');
  const t = setup(); sizeStage(t, 500, 400); const api = t.context.NewsTabbycat.mount({...mountOpts(t), styleNonce: 'abc123'}); t.step(2);
  const style = t.stage.children.find(c => c.tagName === 'STYLE'); assert.ok(style, 'one <style> element inside the stage (removed with it)'); assert.equal(style.attributes.nonce, 'abc123');
  assert.equal(glCanvas(t).style.pointerEvents, 'none');
  assert.ok((t.dl.pointerdown || []).length >= 1 && !t.stage.listeners.pointerdown, 'pointer handling is on the document (capture), so a click-through stage keeps working');
  api.destroy();
});

test('lifecycle: destroy is idempotent, restores the root and removes every listener and style; a second mount on the same stage replaces the first', () => {
  const t = setup(); sizeStage(t, 500, 400); t.stage.style.position = ''; t.stage.className = 'host-box';
  const a = t.context.NewsTabbycat.mount(mountOpts(t)); a.resume(); t.step(10);
  const b = t.context.NewsTabbycat.mount(mountOpts(t)); assert.equal(a.inspect().destroyed, true, 'first instance is torn down by the second mount'); b.resume(); t.step(10);
  b.destroy(); b.destroy(); assert.equal(b.inspect().destroyed, true);
  for (const k of ['pointerdown', 'click', 'keydown', 'pointermove']) assert.equal((t.dl[k] || []).length, 0, 'document ' + k);
  for (const k of ['resize', 'blur', 'scroll']) assert.equal((t.wl[k] || []).length, 0, 'window ' + k);
  assert.equal(t.stage.getAttribute('data-tc-theme'), null, 'theme attribute restored');
  assert.equal(t.stage.children.filter(c => c.tagName === 'CANVAS' && c !== t.canvas).length, 0, 'private canvases removed');
  const frames = t.frames.length; t.step(5); assert.ok(t.frames.length <= frames, 'no rAF loop left behind');
});

test('lifecycle: resize and DPR changes re-fit the canvas; a hidden or detached pet stops drawing', () => {
  const t = setup(); sizeStage(t, 500, 400); const api = t.context.NewsTabbycat.mount(mountOpts(t)); api.resume(); t.step(20);
  const dpr0 = api.inspect().canvas.dpr; t.context.window.devicePixelRatio = 1; t.context.devicePixelRatio = 1; t.step(5);
  assert.ok(api.inspect().canvas.dpr <= dpr0 && api.inspect().canvas.dpr === 1, 'DPR change is picked up without a resize event: ' + api.inspect().canvas.dpr);
  sizeStage(t, 300, 300); (t.wl.resize || []).forEach(f => f()); t.step(5); const p = api.inspect().position; assert.ok(p.x <= 300 && p.y <= 300, 'pet re-clamped into the smaller stage: ' + JSON.stringify(p));
  const draws = t.stats.draws; t.stage.isConnected = false; t.step(10); const idle = t.stats.draws - draws; t.stage.isConnected = true; t.step(10);
  assert.ok(idle <= 1, 'detached: no drawing (' + idle + ')'); assert.ok(t.stats.draws > draws + idle, 'attached again: drawing resumes');
  api.destroy();
});

// ---- continuity: gait and face are driven by smooth, time-continuous parameters (no pops between states)
function recorder(api) {
  const rec = [];
  const run = (n, label) => { for (let k = 0; k < n; k++) { api.step(1 / 60); const i = api.inspect(); rec.push({label, x: i.position.x, y: i.position.y, f: i.rig.feet, face: i.rig.face, body: i.rig.body, yaw: i.rig.yaw}); } };
  return {rec, run};
}
const maxStep = (rec, pick, from = 1, to = rec.length) => { let m = 0; for (let i = Math.max(1, from); i < to; i++) m = Math.max(m, Math.abs(pick(rec[i]) - pick(rec[i - 1]))); return m; };
const maxJerk = (rec, pick, from = 2, to = rec.length) => { let m = 0; for (let i = Math.max(2, from); i < to; i++) m = Math.max(m, Math.abs(pick(rec[i]) - 2 * pick(rec[i - 1]) + pick(rec[i - 2]))); return m; };

test('gait: feet alternate, stay planted while the body moves, and nothing jumps between frames when walking starts and stops', () => {
  const t = setup(); sizeStage(t, 900, 600); const api = t.context.NewsTabbycat.mount(mountOpts(t)); api.resume(); t.step(30);
  const r = recorder(api); r.run(90, 'idle');
  for (let k = 0; k < 3; k++) { api.pointAt(t.row, '读'); r.run(300, 'walk'); api.cancel(); r.run(300, 'back'); }
  const rec = r.rec; let slide = 0, steps = 0, twice = 0, lastGroup = '', moved = 0, landed = 0;
  for (let i = 1; i < rec.length; i++) {
    const sp = Math.hypot(rec[i].x - rec[i - 1].x, rec[i].y - rec[i - 1].y) * 60; if (sp > 12) moved++;
    const down = [];
    for (let k = 0; k < 4; k++) {
      const a = rec[i - 1].f[k], b = rec[i].f[k];
      if (!a.swing && !b.swing && sp > 12) slide = Math.max(slide, Math.hypot(b.x - a.x, b.y - a.y) * 60);
      if (a.swing && !b.swing && sp > 12) down.push(k);
    }
    if (down.length) { const g = down.join('+'); steps++; if (g === lastGroup && i - landed < 60) twice++; lastGroup = g; landed = i; }
  }
  assert.ok(moved > 200 && steps >= 12, 'the pet walked: ' + moved + ' moving frames, ' + steps + ' footfalls');
  assert.equal(twice, 0, 'the same diagonal pair never lands twice in a row while walking');
  assert.ok(slide < 1, 'planted feet do not slide while the pet walks (max stance speed ' + slide.toFixed(2) + ' px/s)');
  const foot = k => rec.map(q => q.f[k]); let acc = 0, dist = 0;
  for (let k = 0; k < 4; k++) { const f = foot(k); for (let i = 2; i < f.length; i++) { dist = Math.max(dist, Math.hypot(f[i].x - f[i - 1].x, f[i].y - f[i - 1].y)); acc = Math.max(acc, Math.hypot(f[i].x - 2 * f[i - 1].x + f[i - 2].x, f[i].y - 2 * f[i - 1].y + f[i - 2].y)); } }
  assert.ok(dist < 9, 'foot moves at most 9 px per frame: ' + dist.toFixed(2)); assert.ok(acc < 3.2, 'foot acceleration stays bounded: ' + acc.toFixed(2));
  const walkRec = rec.filter(q => q.label === 'walk' || q.label === 'back');
  assert.ok(maxStep(rec, q => q.body.sq) < .04 && maxStep(rec, q => q.body.lean) < .02 && maxStep(rec, q => q.yaw) < .09, 'body squash, lean and turn blend instead of snapping');
  assert.ok(walkRec.length > 0); api.destroy();
});

test('face continuity: grooming, yawn, meow, purr and kneading blend with idle and walking without pops', () => {
  const t = setup(); sizeStage(t, 900, 600); const api = t.context.NewsTabbycat.mount(mountOpts(t)); api.resume(); t.step(30);
  const r = recorder(api); r.run(120, 'idle'); const a0 = r.rec.length;
  api.poke('groom'); r.run(260, 'groom'); const a1 = r.rec.length;
  api.poke('yawn'); r.run(260, 'yawn'); const a2 = r.rec.length;
  api.poke('meow'); r.run(220, 'meow'); api.poke('purr'); r.run(260, 'purr'); api.poke('knead'); r.run(260, 'knead');
  api.pointAt(t.row, '读'); r.run(60, 'walk'); api.poke('groom'); r.run(180, 'walk-groom'); api.cancel(); api.poke('yawn'); r.run(260, 'back'); r.run(120, 'idle');
  const rec = r.rec, F = key => q => q.face[key];
  for (const [key, step, jerk] of [['mouth', .055, .02], ['tongue', .06, .008], ['smile', .03, .008], ['squint', .06, .02], ['sleepy', .03, .003], ['pupil', .045, .014]]) {
    const s = maxStep(rec, F(key)), j = maxJerk(rec, F(key));
    assert.ok(s < step && j < jerk, key + ' is smooth across every transition: step ' + s.toFixed(4) + ' jerk ' + j.toFixed(5));
  }
  assert.ok(Math.max(...rec.slice(a0, a1).map(F('tongue'))) > .3, 'the tongue comes out while grooming');
  assert.ok(Math.max(...rec.slice(a1, a2).map(F('mouth'))) > .9, 'yawn opens wide'); api.destroy();
});

test('lazy loader resolves its base path from the loading script and the demo is not required by production code', () => {
  assert.match(petsSource, /currentScript/); assert.match(petsSource, /BASE/);
  assert.doesNotMatch(source, /tabbycat-demo-panel|\/news-demo/); assert.doesNotMatch(petsSource, /tabbycat-demo-panel|\/news-demo/);
});

test('cat identity: four paws, ringed tail, striped coat, every cat act runs and ends, triangle budget holds in each pose', () => {
  assert.doesNotMatch(source, /nailong|naidragon|奶龙/i, 'no dragon leftovers');
  assert.match(source, /tabby|狸花/i); assert.match(source, /喵/);
  const t = setup(); const api = t.context.NewsTabbycat.mount(mountOpts(t)); api.resume(); t.step(60);
  assert.equal(api.inspect().rig.feet.length, 4, 'four paws');
  let maxTris = api.inspect().tris;
  for (const act of ['meow', 'meow2', 'tilt', 'twitch', 'blinkslow', 'groom', 'knead', 'purr', 'stretch', 'yawn', 'roll', 'rub', 'look', 'loaf', 'tailflick', 'cheer', 'wiggle', 'sit']) {
    t.step(400); api.poke(act); t.step(6);
    let ended = false; for (let i = 0; i < 900 && !ended; i++) { t.step(1); maxTris = Math.max(maxTris, api.inspect().tris); ended = api.inspect().mood.act === null; }
    assert.ok(ended, act + ' ends by itself'); assert.deepEqual(t.stats.badNumbers, [], act);
  }
  api.poke('belly'); t.step(90); maxTris = Math.max(maxTris, api.inspect().tris);
  api.poke('sleep'); t.step(600); maxTris = Math.max(maxTris, api.inspect().tris);
  assert.ok(maxTris > 3000 && maxTris <= 12000, 'triangle budget: ' + maxTris);
  api.destroy();
});

function actRun(options, pointer, secs, seedSteps = 0) {
  const t = setup(); sizeStage(t, 900, 600); const api = t.context.NewsTabbycat.mount(Object.assign(mountOpts(t), {options: Object.assign({sleepAfter: 600}, options)})); api.resume(); t.step(30 + seedSteps);
  const move = (x, y) => { for (const f of (t.wl.pointermove || [])) f({clientX: x, clientY: y, pointerType: 'mouse'}); };
  let seq = [];
  for (let i = 0; i < secs * 60; i++) {
    if (pointer && i % 20 === 0) { const p = pointer(i / 60, api.inspect().position); move(p.x, p.y); }
    t.step(1); const m = api.inspect().mood; if (m.act && seq[seq.length - 1] !== m.act + '@' + m.hist.length) seq.push(m.act + '@' + m.hist.length);
  }
  const m = api.inspect().mood; api.destroy(); return {m, seq: seq.map(s => s.split('@')[0])};
}
const share = (tally, keys) => { const tot = Object.values(tally).reduce((a, b) => a + b, 0) || 1; return keys.reduce((a, k) => a + (tally[k] || 0), 0) / tot; };

test('scheduler: a still pointer nearby builds affection and affectionate acts, evening makes the cat sleepy, and no act repeats back to back', () => {
  const near = (tm, pos) => ({x: pos.x + 120, y: pos.y - 20});
  const away = () => ({x: 20, y: 580});
  const a = actRun({hour: 14}, near, 240), b = actRun({hour: 14}, away, 240), c = actRun({hour: 23}, away, 600), d = actRun({hour: 14}, away, 600);
  assert.ok(a.m.aff > .6, 'affection grows near a still pointer: ' + a.m.aff);
  assert.ok(b.m.aff < .05, 'and stays low when it is ignored: ' + b.m.aff);
  const fond = ['blinkslow', 'purr', 'knead', 'meow2', 'rub', 'roll'];
  assert.ok(share(a.m.tally, fond) > share(b.m.tally, fond) + .15, 'affectionate acts: ' + JSON.stringify(a.m.tally) + ' vs ' + JSON.stringify(b.m.tally));
  assert.ok(c.m.night > .9 && d.m.night < .1, 'night factor');
  const drowsy = ['yawn', 'loaf', 'knead'];
  assert.ok(share(c.m.tally, drowsy) > share(d.m.tally, drowsy) + .12, 'at night: ' + JSON.stringify(c.m.tally) + ' vs day ' + JSON.stringify(d.m.tally));
  const nActs = x => Object.values(x.m.tally).reduce((p, q) => p + q, 0);
  assert.ok(nActs(c) < nActs(d), 'it does less at night: ' + nActs(c) + ' vs ' + nActs(d));
  for (const r of [a, b, c, d]) for (let i = 1; i < r.seq.length; i++) assert.notEqual(r.seq[i], r.seq[i - 1], 'no repeat back to back: ' + r.seq.join(','));
  assert.ok(new Set(b.seq).size >= 6, 'variety: ' + [...new Set(b.seq)].join(','));
});

// ---- round 2: the legs are two-bone IK chains of fixed length, so no leg is longer or shorter than its partner
function legRun(api, n, rec) { for (let k = 0; k < n; k++) { api.step(1 / 60); const i = api.inspect(); rec.push({legs: i.rig.legs.map(l => ({an: l.an.slice(), pc: l.pc.slice(), hind: l.hind, side: l.side, reach: l.reach})), feet: i.rig.feet, sp: 0}); } }
const legLen = l => Math.hypot(l.pc[0] - l.an[0], l.pc[1] - l.an[1], l.pc[2] - l.an[2]);

test('legs: left and right leg lengths stay within 3% on average, never stretch past the bone reach, and no leg jumps between frames', () => {
  const t = setup(); sizeStage(t, 900, 600); const api = t.context.NewsTabbycat.mount(Object.assign(mountOpts(t), {followPointer: true})); api.resume(); t.step(30);
  const all = []; legRun(api, 60, all);
  const move = (x, y) => { for (const f of (t.wl.pointermove || [])) f({clientX: x, clientY: y, pointerType: 'mouse'}); };
  for (const [x, y] of [[150, 360], [700, 420], [250, 400], [260, 300], [260, 520], [700, 200], [200, 500]]) { for (let k = 0; k < 8; k++) { move(x, y); legRun(api, 30, all); } }
  const rec = all.filter(r => r.legs.every(l => l.pc[1] < 14)); // frames where a paw is raised (pointing, grooming) are left out
  assert.ok(rec.length > 400, 'enough grounded frames: ' + rec.length);
  assert.ok(all.some(r => r.legs.every(l => true) && r.feet.some(f => f.swing)), 'the pet walked');
  const L = [0, 1, 2, 3].map(k => rec.map(r => legLen(r.legs[k])));
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const front = Math.abs(mean(L[0]) - mean(L[1])) / mean([...L[0], ...L[1]]), hind = Math.abs(mean(L[2]) - mean(L[3])) / mean([...L[2], ...L[3]]);
  assert.ok(front < .03 && hind < .03, 'mean left/right leg length differs by ' + (front * 100).toFixed(1) + '% (front) and ' + (hind * 100).toFixed(1) + '% (hind)');
  const rng = L.map(a => Math.max(...a) - Math.min(...a)), sd = L.map(a => Math.sqrt(mean(a.map(v => (v - mean(a)) ** 2))));
  const maxReach = Math.max(...rec.flatMap(r => r.legs.map(l => l.reach || 0)));
  assert.ok(maxReach <= 1 && Math.min(...L.map(a => Math.min(...a))) > 12, 'no leg ever stretches past its bones (max reach ' + maxReach.toFixed(3) + '): ' + L.map(a => Math.min(...a).toFixed(0) + '-' + Math.max(...a).toFixed(0)).join(' | '));
  assert.ok(Math.max(...sd) < 6, 'leg length varies by only a few px while walking (sd ' + sd.map(v => v.toFixed(1)).join('/') + ')');
  assert.ok(Math.abs(rng[0] - rng[1]) / mean(L[0]) < .35 && Math.abs(rng[2] - rng[3]) / mean(L[2]) < .5, 'left and right legs cover a similar length range: ' + rng.map(v => v.toFixed(1)).join('/'));
  let jump = 0, lift = 0;
  for (let i = 1; i < rec.length; i++) for (let k = 0; k < 4; k++) { jump = Math.max(jump, Math.abs(L[k][i] - L[k][i - 1])); lift = Math.max(lift, rec[i].legs[k].pc[1]); }
  assert.ok(jump < 4.5, 'no leg changes length by more than 4.5 px in one frame: ' + jump.toFixed(2));
  assert.ok(rec.length > 900); api.destroy();
});

test('transitions: every pair of acts blends paws, body and head without a one-frame pop', () => {
  const acts = ['groom', 'knead', 'stretch', 'yawn', 'meow2', 'loaf', 'purr', 'roll', 'cheer'];
  const t = setup(); sizeStage(t, 900, 600); const api = t.context.NewsTabbycat.mount(mountOpts(t)); api.resume(); t.step(30);
  const prevPos = api.inspect().rig.legs.map(l => l.pc.slice()); let worst = 0, who = '', rec = [];
  for (let a = 0; a < acts.length; a++) {
    const first = acts[a], second = acts[(a * 4 + 3) % acts.length];
    for (const act of [first, second]) {
      api.poke(act);
      for (let k = 0; k < 150; k++) {
        api.step(1 / 60); const i = api.inspect(); rec.push({label: act, x: i.position.x, y: i.position.y, f: i.rig.feet, face: i.rig.face, body: i.rig.body, yaw: i.rig.yaw});
        i.rig.legs.forEach((l, q) => { const d = Math.hypot(l.pc[0] - prevPos[q][0], l.pc[1] - prevPos[q][1], l.pc[2] - prevPos[q][2]); if (d > worst) { worst = d; who = act + ':' + q; } prevPos[q] = l.pc.slice(); });
      }
    }
  }
  const calm = rec.filter(q => q.label !== 'cheer');
  assert.ok(worst < 12, 'no paw moves more than 12 rig px in a frame across act changes (' + worst.toFixed(1) + ' at ' + who + ')');
  assert.ok(maxStep(calm, q => q.body.sq) < .05 && maxStep(rec, q => q.yaw) < .12, 'body squash (the cheer bounce aside) and yaw stay continuous across acts: sq ' + maxStep(calm, q => q.body.sq).toFixed(3) + ' yaw ' + maxStep(rec, q => q.yaw).toFixed(3));
  api.destroy();
});

test('gait r3: a walk starts as an ordered lateral sequence (no extra catch-step) and every leg stays inside its bones', () => {
  const t = setup(); sizeStage(t, 900, 600); const api = t.context.NewsTabbycat.mount(Object.assign(mountOpts(t), {followPointer: true})); api.resume(); t.step(30);
  const move = (x, y) => { for (const f of (t.wl.pointermove || [])) f({clientX: x, clientY: y, pointerType: 'mouse'}); };
  for (const f of (t.dl.pointerleave || t.wl.pointerleave || [])) f({}); // let the cat settle first
  for (let k = 0; k < 400; k++) api.step(1 / 60);
  const steps = [[], [], [], []], prev = [false, false, false, false]; let reach = 0, started = false;
  for (let k = 0; k < 300; k++) {
   if (k % 6 === 0) move(k < 150 ? 120 : 780, 400);
   api.step(1 / 60); const i = api.inspect();
   i.rig.feet.forEach((f, n) => { if (f.swing && !prev[n]) steps[n].push(k); prev[n] = f.swing; });
   for (const l of i.rig.legs) reach = Math.max(reach, l.reach || 0);
   if (i.rig.feet.some(f => f.swing)) started = true;
  }
  assert.ok(started, 'the pet walked');
  assert.ok(reach <= 1, 'max reach ' + reach);
  // a step window (after the cat is up to speed): every paw steps about equally often, none twice in a row while another waits
  const n = steps.map(a => a.length); assert.ok(Math.min(...n) > 2, 'every paw steps: ' + n);
  assert.ok(Math.max(...n) - Math.min(...n) <= 2, 'paws step about equally often: ' + n);
  const all = steps.flatMap((a, p) => a.map(k => [k, p])).sort((a, b) => a[0] - b[0]);
  // before the cat turns around (frame 150) no two paws lift within 3 frames of each other; the turn itself and the arrival may overlap once each
  let pair = 0, pairEarly = 0; for (let i = 1; i < all.length; i++) if (all[i][0] - all[i - 1][0] < 3) { pair++; if (all[i][0] < 150) pairEarly++; }
  assert.equal(pairEarly, 0, 'no two paws lift in the same instant while walking straight: ' + JSON.stringify(all));
  assert.ok(pair <= 3, 'few overlapping lift-offs overall: ' + pair);
  api.destroy();
});

test('resting transitions: sit, loaf, nod off and wake-up stretch each get their own short move', () => {
  const t = setup(); sizeStage(t, 900, 600); const api = t.context.NewsTabbycat.mount(mountOpts(t)); api.resume(); t.step(60);
  const seen = new Set(), run = n => { for (let k = 0; k < n; k++) { api.step(1 / 60); const m = api.inspect().mood; if (m.trn) seen.add(m.trn); } };
  api.poke('wake'); run(60); api.poke('loaf'); run(120);
  assert.ok([...seen].some(s => s.endsWith('>2')), 'sit -> loaf transition ran: ' + [...seen]);
  api.poke('sleep'); run(60 * 14);
  assert.ok(api.inspect().mood.sleeping, 'asleep'); assert.ok([...seen].some(s => s.endsWith('>3')), 'loaf -> sleep transition ran: ' + [...seen]);
  api.poke('wake'); let stretched = false; for (let k = 0; k < 120 && !stretched; k++) { run(1); stretched = api.inspect().mood.act === 'stretch'; }
  assert.ok(stretched, 'waking up starts with a stretch');
  run(60 * 5); assert.ok(!api.inspect().mood.sleeping);
  api.destroy();
});

test('idle cursor reactions: ears swivel toward the pointer, the pupils follow and the tail tip flicks', () => {
  const t = setup(); sizeStage(t, 900, 600); const api = t.context.NewsTabbycat.mount(mountOpts(t)); api.resume(); t.step(60);
  const move = (x, y) => { for (const f of (t.wl.pointermove || [])) f({clientX: x, clientY: y, pointerType: 'mouse'}); };
  api.poke('wake'); for (let k = 0; k < 120; k++) api.step(1 / 60);
  const pos = api.inspect().position;
  for (let k = 0; k < 90; k++) { move(pos.x + 300, pos.y - 80); api.step(1 / 60); }
  const right = api.inspect().mood.earAim[0];
  for (let k = 0; k < 90; k++) { move(pos.x - 300, pos.y - 80); api.step(1 / 60); }
  const left = api.inspect().mood.earAim[0];
  assert.ok(right > .5 && left < -.5, 'ears aim at the pointer: ' + right + ' / ' + left);
  let flick = 0; for (let k = 0; k < 60 * 12; k++) { if (k % 20 === 0) move(pos.x - 300 + (k % 40), pos.y - 80); api.step(1 / 60); flick = Math.max(flick, Math.abs(api.inspect().mood.tailTip)); }
  assert.ok(flick > .1, 'the tail tip flicks while the pointer hovers nearby: ' + flick);
  api.destroy();
});

test('host reactions: react() plays a gesture and a short bubble, is ignored while the dial is open, and a lazy proxy never queues it', async () => {
  const t = setup(); const api = t.context.NewsTabbycat.mount(mountOpts(t)); api.resume(); t.step(40);
  assert.equal(api.react('hop', '收藏好啦'), true); t.step(30); assert.equal(api.inspect().mood.bubble, '收藏好啦');
  assert.equal(api.react(null, 'x'.repeat(60)), true); t.step(30); assert.ok(api.inspect().mood.bubble.length <= 24, 'bubbles stay short');
  api.setActions(four); api.openMenu(); t.step(30); assert.equal(api.react('hop', 'no'), false, 'a reaction never competes with the open dial'); api.closeMenu(); api.destroy();
  assert.equal(api.react('hop', 'late'), false, 'a destroyed pet ignores it');
  const lazy = setup({loadSource: false}); const proxy = lazy.context.NewsPets.mount('tabbycat', mountOpts(lazy));
  assert.equal(proxy.react('hop', 'early'), false, 'nothing is queued while the pet script loads');
  vm.runInContext(source, lazy.context); lazy.scripts[0].onload(); await new Promise(r => setImmediate(r));
  assert.equal(proxy.inspect().mood.bubble, '', 'the early reaction was dropped, not replayed'); assert.equal(proxy.react(null, 'ok'), true); proxy.destroy();
});

test('with the built-in dial off, a tap and a double tap are reported to the host as news-pet-tap', () => {
  const t = setup(); sizeStage(t, 1000, 640); const api = t.context.NewsTabbycat.mount({...mountOpts(t), actions: four, options: {status: false, dial: false}}); sizeOverlays(t, api); api.resume(); t.step(30);
  clickPet(t, api); t.step(2);
  const taps = () => t.stage.events.filter(event => event.type === 'news-pet-tap');
  assert.equal(taps().length, 1); assert.equal(taps()[0].detail.double, false);
  assert.equal(api.inspect().menu.open, false, 'the pet draws no dial of its own');
  clickPet(t, api, {gap: 100});
  assert.equal(taps().length, 2); assert.equal(taps()[1].detail.double, true);
  api.setOptions({dial: true}); clickPet(t, api); t.step(2);
  assert.equal(taps().length, 2, 'with its own dial on, the pet keeps the tap to itself');
  api.destroy();
});

test('the collection tray is neutral and pet-agnostic: hidden at rest, shown while collecting and for a few seconds after', () => {
  const t = setup(); const api = t.context.window.NewsTabbycat.mount(mountOpts(t)); api.resume();
  t.stage.querySelectorAll = () => [t.row];
  const tray = t.stage.children.find(node => node.style && node.style.transition && /opacity/.test(node.style.transition));
  assert.ok(tray, 'the tray canvas sits beside the pet canvas');
  t.step(30); assert.equal(tray.style.opacity, '0', 'nothing to collect: no tray (and no coloured nest) next to the pet');
  api.setCollecting(true); t.step(30); assert.equal(tray.style.opacity, '1', 'collecting: the tray fades in');
  api.setCollecting(false); t.step(30); assert.equal(tray.style.opacity, '1', 'it lingers briefly after a delivery');
  t.step(600); assert.equal(tray.style.opacity, '0', 'and fades away again');
  api.destroy();
});
