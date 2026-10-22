'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const OrcaSurface = require('../../web/workspace/orca-surface.js');

class Element {
  constructor() { this.listeners = {}; this.attributes = {}; this.children = []; this.dataset = {}; this.srcWrites = []; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  append(child) { this.children.push(child); }
  set src(value) { this.srcWrites.push(value); }
  get src() { return this.srcWrites.at(-1); }
  focus() {}
  setSelectionRange() {}
  insertAdjacentHTML(_position, value) { this.innerHTML += value; }
  querySelector() { return new Element(); }
}

function fixture(saved = null) {
  const elements = Object.fromEntries(['url', 'error', 'status', 'open', 'frame-host', 'form', 'reload'].map(key => [key, new Element()]));
  const root = new Element();
  root.querySelector = selector => elements[selector.match(/"(.+)"/)[1]];
  root.ownerDocument = {createElement: () => new Element()};
  const writes = [], removed = [];
  const storage = {getItem: () => saved, setItem: (...args) => writes.push(args), removeItem: key => removed.push(key)};
  const controller = OrcaSurface.create({root, storage});
  const submit = value => { elements.url.value = value; elements.form.listeners.submit({preventDefault() {}}); };
  return {root, elements, controller, writes, removed, submit};
}

test('accepts ordinary HTTP(S) page URLs and rejects credentials or pairing material', () => {
  assert.equal(OrcaSurface.validateClientUrl(' http://127.0.0.1:8767/web-index.html '), 'http://127.0.0.1:8767/web-index.html');
  assert.equal(OrcaSurface.validateClientUrl('https://orca.example.test/client/'), 'https://orca.example.test/client/');
  for (const value of ['javascript:alert(1)', 'file:///C:/example/config', '//example.test', 'http://name:secret@example.test/',
    'https://example.test/?pairing=secret', 'https://example.test/#token', 'https://example.test/?',
    'https://example.test/#', 'https://example.test/a b', 'https:\\example.test', 'https://exam\nple.test']) {
    assert.throws(() => OrcaSurface.validateClientUrl(value), Error, value);
  }
});

test('loads only on first entry and keeps the same iframe through hide/show', () => {
  const f = fixture();
  assert.equal(f.elements['frame-host'].children.length, 0);
  f.controller.show(false);
  assert.equal(f.elements['frame-host'].children.length, 0);
  f.controller.show(true);
  const frame = f.elements['frame-host'].children[0];
  frame.inputDraft = 'persistent local draft';
  f.controller.show(false); f.controller.show(true); f.controller.show(true);
  assert.equal(f.elements['frame-host'].children.length, 1);
  assert.equal(f.elements['frame-host'].children[0], frame);
  assert.equal(frame.inputDraft, 'persistent local draft');
  assert.equal(frame.srcWrites.length, 1);
  frame.listeners.load();
  assert.match(f.elements.status.textContent, /已尝试打开客户端；连接情况请以 Orca 页面为准/);
  assert.doesNotMatch(f.elements.status.textContent, /已响应|已连接|runtime.*ready/);
});

test('only explicit changed addresses or reloads navigate the mounted client', () => {
  const f = fixture(); f.controller.show(true);
  const frame = f.elements['frame-host'].children[0];
  f.submit('https://orca.example.test/web-index.html');
  assert.equal(frame.srcWrites.length, 2);
  assert.equal(f.elements.open.href, 'https://orca.example.test/web-index.html');
  assert.equal(f.writes.length, 1);
  f.submit('https://orca.example.test/web-index.html');
  assert.equal(frame.srcWrites.length, 2);
  f.submit('https://orca.example.test/?pairing=synthetic-secret');
  assert.equal(frame.srcWrites.length, 2);
  assert.equal(f.writes.length, 1);
  assert.equal(f.elements.error.hidden, false);
  assert.equal(f.elements.url.attributes['aria-invalid'], 'true');
  f.elements.reload.listeners.click();
  assert.equal(frame.srcWrites.length, 3);
  assert.equal(frame.src, 'https://orca.example.test/web-index.html');
});

test('invalid stored pairing URLs are discarded without loading or echoing them', () => {
  const f = fixture('https://orca.example.test/#synthetic-secret');
  assert.equal(f.removed.length, 1);
  assert.equal(f.elements.url.value, 'http://127.0.0.1:8767/web-index.html');
  assert.equal(f.elements['frame-host'].children.length, 0);
});

test('outer navigation, theme and example approvals do not recreate or navigate Orca', () => {
  const f = fixture();
  const app = new Element();
  // A full-root render would remove the mounted client and fail this contract.
  Object.defineProperty(app, 'innerHTML', {set() { throw new Error('Stable shell must not be replaced'); }});
  const nodes = {'ce-studio': app, 'studio-rail': new Element(), 'studio-topbar': new Element(),
    'studio-examples': new Element(), 'studio-orca': f.root};
  const context = vm.createContext({window: {OrcaSurface: {create: () => f.controller}}, document: {getElementById: id => nodes[id]}});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../web/workspace/studio-preview.js'), 'utf8'), context);
  const click = (action, id) => app.listeners.click({target: {closest: () => ({dataset: {action, id}})}});
  click('project');
  const frame = f.elements['frame-host'].children[0];
  click('theme'); click('tools'); click('home'); click('task', 'test'); click('approve', 'test'); click('project');
  assert.equal(f.elements['frame-host'].children[0], frame);
  assert.equal(frame.srcWrites.length, 1);
  assert.equal(app.dataset.theme, 'dark');
  assert.equal(nodes['studio-examples'].hidden, true);
  assert.equal(f.root.hidden, false);
  assert.doesNotMatch(nodes['studio-rail'].innerHTML, /data-id="ce"|data-id="tank"|data-id="docs"/);
});
