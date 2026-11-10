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
    this.textContent = ''; this.value = ''; this.checked = false; this.hidden = false; this.title = '';
    this.style = {setProperty(name, value) { this[name] = value; }};
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
    window.NewsPets.register('naidragon', {label: '奶龙', status: true, mount: () => ({})});
    window.NewsPets.register('tabbycat', {label: '狸花猫', status: true, mount: () => ({})});`, context);
  if (withPrefs) vm.runInContext(read('news-pet-prefs.js'), context); else delete window.NewsPetPrefs;
  vm.runInContext(read('studio-pet-settings.js'), context);
  const container = new Node('div');
  const dispose = window.StudioPetSettings.mount(container);
  const control = id => container.find(node => node.id === id);
  const cards = () => container.all(node => node.tag === 'input' && node.name === 'studio-pet-form');
  const radio = (name, value) => container.find(node => node.tag === 'input' && node.name === name && node.value === value);
  const text = className => container.find(node => node.className === className).textContent;
  return {window, storage, listeners, container, dispose, cards, radio, text, toggle: control('studio-pet-enabled'), quiet: control('studio-pet-quiet'), newsFx: control('studio-pet-news-fx')};
}

const checked = node => node.getAttribute('aria-checked');

test('renders the switches on their defaults and one card per registered pet', () => {
  const {toggle, quiet, newsFx, cards} = setup();
  assert.equal(toggle.getAttribute('role'), 'switch');
  assert.deepEqual([checked(toggle), checked(quiet), checked(newsFx)], ['false', 'false', 'true']);
  assert.deepEqual(cards().map(input => input.value), ['spider', 'naidragon', 'tabbycat']);
  assert.deepEqual(cards().map(input => input.checked), [true, false, false]);
});

test('every pet is available outside the news page', () => {
  const {container, cards} = setup();
  const note = container.find(node => node.id === 'studio-pet-news-only');
  assert.equal(note.hidden, true);
  cards()[1].choose();
  assert.equal(note.hidden, true);
  cards()[0].choose();
  assert.equal(note.hidden, true);
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

test('follows changes made elsewhere, such as the wheel hiding the pet', () => {
  const {window, toggle, quiet, cards, storage, listeners} = setup();
  storage.set('news-reader-pet', 'tabbycat'); storage.set('news-reader-pet-enabled', 'true'); storage.set('news-reader-pet-quiet', 'true');
  listeners.forEach(fn => fn({key: 'news-reader-pet-enabled'}));
  assert.equal(checked(toggle), 'true');
  assert.equal(checked(quiet), 'true');
  assert.equal(cards()[2].checked, true);
  window.NewsPetPrefs.setEnabled(false);
  assert.equal(checked(toggle), 'false');
});

test('the page keeps its helper text in tooltips', () => {
  const {container, cards} = setup();
  const visible = () => container.all(node => node.tag === 'p').filter(node => node.textContent && !node.hidden);
  assert.deepEqual(visible().map(node => node.className), []);
  cards()[1].choose();
  assert.deepEqual(visible().map(node => node.className), [], 'the note goes away on a pet that shows everywhere');
  const rows = container.all(node => /ce-pet-row/.test(node.className));
  assert.equal(rows.length, 5);
  for (const row of rows) assert.ok(row.title.length > 0, 'each row carries its tooltip');
});

test('the wheel is not configurable: no wheel card, pin switch or action picker is rendered', () => {
  const {container} = setup();
  const titles = container.all(node => node.className === 'ce-pet-title').map(node => node.textContent);
  assert.deepEqual(titles, ['宠物', '行为']);
  assert.equal(container.find(node => /dial|chip/.test(node.className + ' ' + (node.id || ''))), null);
  assert.equal(container.find(node => node.id === 'studio-pet-dial-pin'), null);
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
