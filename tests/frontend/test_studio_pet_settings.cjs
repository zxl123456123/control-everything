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
  constructor(tag) {
    this.tag = tag; this.className = ''; this.children = []; this.attrs = {}; this.listeners = {}; this.dataset = {};
    this.textContent = ''; this.value = ''; this.checked = false; this.hidden = false;
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children.length = 0; this.children.push(...nodes); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type) { (this.listeners[type] || []).forEach(fn => fn()); }
  /** What a user does to a radio: it becomes checked, then `change` fires. */
  choose() { this.checked = true; this.fire('change'); }
  all(predicate, out = []) {
    if (predicate(this)) out.push(this);
    for (const child of this.children) child.all?.(predicate, out);
    return out;
  }
  find(predicate) { return this.all(predicate)[0] || null; }
}

function setup({withPrefs = true} = {}) {
  const storage = new Map(), listeners = new Set();
  const window = {
    localStorage: {getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => { storage.set(key, String(value)); }},
    addEventListener: (type, fn) => { if (type === 'storage') listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'storage') listeners.delete(fn); },
  };
  const document = {createElement: tag => new Node(tag), createElementNS: (ns, tag) => new Node(tag)};
  const context = vm.createContext({window, document, console});
  vm.runInContext(read('news-pets.js'), context);
  vm.runInContext(`window.NewsPets.register('spider', {label: '蜘蛛', mount: () => ({})});
    window.NewsPets.register('naidragon', {label: '奶龙', mount: () => ({})});
    window.NewsPets.register('tabbycat', {label: '狸花猫', mount: () => ({})});`, context);
  vm.runInContext(read('news-pet-dial.js'), context);
  if (withPrefs) vm.runInContext(read('news-pet-prefs.js'), context); else delete window.NewsPetPrefs;
  vm.runInContext(read('studio-pet-settings.js'), context);
  const container = new Node('div');
  const dispose = window.StudioPetSettings.mount(container);
  const control = id => container.find(node => node.id === id);
  const cards = () => container.all(node => node.tag === 'input' && node.name === 'studio-pet-form');
  const chip = id => container.find(node => node.dataset.action === id);
  const radio = (name, value) => container.find(node => node.tag === 'input' && node.name === name && node.value === value);
  const text = className => container.find(node => node.className === className).textContent;
  return {window, storage, listeners, container, dispose, cards, chip, radio, text, toggle: control('studio-pet-enabled'), quiet: control('studio-pet-quiet'), newsFx: control('studio-pet-news-fx'), reset: control('studio-pet-dial-reset')};
}

const checked = node => node.getAttribute('aria-checked');
const dialIds = storage => storage.get('news-reader-pet-dial');

test('renders the switches on their defaults and one card per registered pet', () => {
  const {toggle, quiet, newsFx, cards} = setup();
  assert.equal(toggle.getAttribute('role'), 'switch');
  assert.deepEqual([checked(toggle), checked(quiet), checked(newsFx)], ['false', 'false', 'true']);
  assert.deepEqual(cards().map(input => input.value), ['spider', 'naidragon', 'tabbycat']);
  assert.deepEqual(cards().map(input => input.checked), [true, false, false]);
});

test('the switches and the cards write the shared preference', () => {
  const {toggle, quiet, newsFx, cards, storage} = setup();
  toggle.fire('click'); quiet.fire('click'); newsFx.fire('click');
  assert.equal(storage.get('news-reader-pet-enabled'), 'true');
  assert.equal(storage.get('news-reader-pet-quiet'), 'true');
  assert.equal(storage.get('news-reader-pet-news-fx'), 'false');
  assert.deepEqual([checked(toggle), checked(quiet), checked(newsFx)], ['true', 'true', 'false']);
  cards()[1].choose();
  assert.equal(storage.get('news-reader-pet'), 'naidragon');
  toggle.fire('click');
  assert.equal(checked(toggle), 'false');
});

test('size and dock are segmented radios that store their value and move the thumb', () => {
  const {radio, container, storage} = setup();
  const seg = name => container.find(node => node.getAttribute('aria-label') === name);
  assert.equal(seg('宠物大小').dataset.index, '1');
  radio('studio-pet-size', 'large').choose();
  assert.equal(storage.get('news-reader-pet-size'), 'large');
  assert.equal(seg('宠物大小').dataset.index, '2');
  radio('studio-pet-dock', 'br').choose();
  assert.equal(storage.get('news-reader-pet-dock'), 'br');
  assert.equal(seg('宠物位置').dataset.index, '2');
});

test('follows changes made elsewhere, such as the reader dial hiding the pet', () => {
  const {window, toggle, quiet, cards, storage, listeners} = setup();
  storage.set('news-reader-pet', 'tabbycat'); storage.set('news-reader-pet-enabled', 'true'); storage.set('news-reader-pet-quiet', 'true');
  listeners.forEach(fn => fn({key: 'news-reader-pet-enabled'}));
  assert.equal(checked(toggle), 'true');
  assert.equal(checked(quiet), 'true');
  assert.equal(cards()[2].checked, true);
  window.NewsPetPrefs.setEnabled(false);
  assert.equal(checked(toggle), 'false');
});

test('the dial checklist shows the defaults, counts them and enforces three to six', () => {
  const {chip, text, reset, storage, container} = setup();
  const pressed = () => container.all(node => node.getAttribute?.('aria-pressed') === 'true').map(node => node.dataset.action);
  assert.deepEqual(pressed(), ['workspace', 'quiet', 'pet-settings', 'next', 'search', 'collect']);
  assert.equal(text('ce-dial-count'), '已选 6 / 6');
  assert.equal(reset.hidden, true, 'nothing to reset yet');
  chip('save').fire('click');
  assert.match(text('ce-pet-status'), /最多 6 个/);
  assert.equal(dialIds(storage), undefined, 'a refused change writes nothing');
  chip('collect').fire('click');
  assert.equal(dialIds(storage), 'workspace,next,search,quiet,pet-settings');
  chip('save').fire('click');
  assert.equal(dialIds(storage), 'workspace,next,search,save,quiet,pet-settings');
  assert.equal(text('ce-pet-status'), '', 'a successful change clears the note');
  assert.equal(reset.hidden, false);
  for (const id of ['search', 'save', 'quiet']) chip(id).fire('click');
  chip('next').fire('click');
  assert.match(text('ce-pet-status'), /至少保留 3 个/);
  assert.equal(text('ce-dial-count'), '已选 3 / 6');
});

test('reset restores the default dial', () => {
  const {chip, reset, storage, text} = setup();
  chip('collect').fire('click'); chip('hide-pet').fire('click');
  assert.equal(dialIds(storage), 'workspace,next,search,quiet,pet-settings,hide-pet');
  reset.fire('click');
  assert.equal(dialIds(storage), 'workspace,next,search,collect,quiet,pet-settings');
  assert.equal(reset.hidden, true);
  assert.equal(text('ce-dial-count'), '已选 6 / 6');
});

test('the dial hint explains that the spider has no dial', () => {
  const {text, cards} = setup();
  assert.match(text('ce-pet-dial-hint'), /蜘蛛没有转盘/);
  cards()[1].choose();
  assert.match(text('ce-pet-dial-hint'), /方向键/);
});

test('reports a write failure instead of pretending it was saved', () => {
  const {window, text, toggle} = setup();
  window.localStorage.setItem = () => { throw new Error('denied'); };
  toggle.fire('click');
  assert.match(text('ce-pet-status'), /无法保存/);
  assert.equal(checked(toggle), 'false');
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
