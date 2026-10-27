// Studio pet settings page (studio-pet-settings.js): rendering, writes through NewsPetPrefs, live sync and cleanup.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, 'web/workspace', file), 'utf8');

class Node {
  constructor(tag) { this.tag = tag; this.className = ''; this.children = []; this.attrs = {}; this.listeners = {}; this.options = this.children; this.textContent = ''; this.value = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children.length = 0; this.children.push(...nodes); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  fire(type) { this.listeners[type]?.(); }
  find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) { const hit = child.find?.(predicate); if (hit) return hit; }
    return null;
  }
}

function setup({withPrefs = true} = {}) {
  const storage = new Map(), listeners = new Set();
  const window = {
    localStorage: {getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => { storage.set(key, String(value)); }},
    addEventListener: (type, fn) => { if (type === 'storage') listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'storage') listeners.delete(fn); },
  };
  const document = {createElement: tag => new Node(tag)};
  const context = vm.createContext({window, document, console});
  vm.runInContext(read('news-pets.js'), context);
  vm.runInContext(`window.NewsPets.register('spider', {label: '蜘蛛', mount: () => ({})});
    window.NewsPets.register('naidragon', {label: '奶龙', mount: () => ({})});`, context);
  if (withPrefs) vm.runInContext(read('news-pet-prefs.js'), context); else delete window.NewsPetPrefs;
  vm.runInContext(read('studio-pet-settings.js'), context);
  const container = new Node('div');
  const dispose = window.StudioPetSettings.mount(container);
  const control = id => container.find(node => node.id === id);
  return {window, storage, listeners, container, dispose, toggle: control('studio-pet-enabled'), select: control('studio-pet-form')};
}

test('renders the switch off and the picker on the default form', () => {
  const {toggle, select} = setup();
  assert.equal(toggle.getAttribute('role'), 'switch');
  assert.equal(toggle.getAttribute('aria-checked'), 'false');
  assert.deepEqual(select.options.map(option => option.value), ['spider', 'naidragon', 'tabbycat']);
  assert.equal(select.value, 'spider');
});

test('the switch and the picker write the shared preference', () => {
  const {toggle, select, storage} = setup();
  toggle.fire('click');
  assert.equal(storage.get('news-reader-pet-enabled'), 'true');
  assert.equal(toggle.getAttribute('aria-checked'), 'true');
  select.value = 'naidragon'; select.fire('change');
  assert.equal(storage.get('news-reader-pet'), 'naidragon');
  toggle.fire('click');
  assert.equal(toggle.getAttribute('aria-checked'), 'false');
});

test('follows changes made elsewhere, such as the reader dial hiding the pet', () => {
  const {window, toggle, select, storage, listeners} = setup();
  storage.set('news-reader-pet', 'naidragon'); storage.set('news-reader-pet-enabled', 'true');
  listeners.forEach(fn => fn({key: 'news-reader-pet-enabled'}));
  assert.equal(toggle.getAttribute('aria-checked'), 'true');
  assert.equal(select.value, 'naidragon');
  window.NewsPetPrefs.setEnabled(false);
  assert.equal(toggle.getAttribute('aria-checked'), 'false');
});

test('the dial hint explains that the spider has no dial', () => {
  const {container, select} = setup();
  const hint = () => container.find(node => node.className === 'ce-pet-dial-hint').textContent;
  assert.match(hint(), /蜘蛛没有转盘/);
  select.value = 'naidragon'; select.fire('change');
  assert.match(hint(), /方向键/);
});

test('reports a write failure instead of pretending it was saved', () => {
  const {window, container, toggle} = setup();
  window.localStorage.setItem = () => { throw new Error('denied'); };
  toggle.fire('click');
  assert.match(container.find(node => node.className === 'ce-pet-status').textContent, /无法保存/);
  assert.equal(toggle.getAttribute('aria-checked'), 'false');
});

test('dispose stops listening and empties the container', () => {
  const {container, dispose, listeners} = setup();
  assert.equal(listeners.size, 1);
  dispose();
  assert.equal(listeners.size, 0);
  assert.equal(container.children.length, 0);
});

test('shows a notice when the pet modules are missing', () => {
  const {container, toggle} = setup({withPrefs: false});
  assert.equal(toggle, null);
  assert.ok(container.find(node => node.className === 'ce-empty' && /未加载/.test(node.textContent)));
});
