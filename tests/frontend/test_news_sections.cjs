// Pure parts of the custom-section UI: snapshot -> section list, and feed URL normalisation.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function load(file) {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'web/workspace', file), 'utf8'), {window, document: {}, console, setTimeout, clearTimeout}, {filename: file});
  return window;
}
const {NewsSections} = load('news-sections.js');
const {NewsSectionEditor} = load('news-section-editor.js');
const plain = value => JSON.parse(JSON.stringify(value));

test('without a sections envelope the stream keys become the two legacy sections', () => {
  const {sections, removed} = plain(NewsSections.fromSnapshot(undefined, ['ai', 'hn']));
  assert.deepEqual(sections.map(section => [section.id, section.name]), [['ai', 'AI 新闻'], ['hn', 'Hacker News']]);
  assert.deepEqual(removed, []);
});

test('an envelope wins over the stream keys and drops malformed sections', () => {
  const envelope = {sections: [{id: 'ai', name: '我的 AI'}, {id: 'Bad Id', name: 'x'}, {id: 'c0001', name: 3}, null, {id: 'c0002', name: '设计'}], removed_presets: ['hn']};
  const {sections, removed} = plain(NewsSections.fromSnapshot(envelope, ['ai', 'hn']));
  assert.deepEqual(sections.map(section => section.id), ['ai', 'c0002']);
  assert.deepEqual(removed, ['hn']);
});

test('an empty section list stays empty instead of falling back to the defaults', () => {
  assert.deepEqual(plain(NewsSections.fromSnapshot({sections: [], removed_presets: ['ai', 'hn']}, ['ai'])).sections, []);
});

test('feed URLs are normalised to https and other schemes are left for the server to reject', () => {
  assert.equal(NewsSectionEditor.normaliseUrl('  example.com/feed.xml '), 'https://example.com/feed.xml');
  assert.equal(NewsSectionEditor.normaliseUrl('http://example.com/rss'), 'https://example.com/rss');
  assert.equal(NewsSectionEditor.normaliseUrl('https://example.com/rss'), 'https://example.com/rss');
  assert.equal(NewsSectionEditor.normaliseUrl('ftp://example.com/rss'), 'ftp://example.com/rss');
  assert.equal(NewsSectionEditor.normaliseUrl('   '), '');
});

function editorFixture(sources) {
  // Keep the real editor and its event callbacks; only DOM and HTTP are synthetic.
  function node() {
    return {dataset: {}, style: {}, children: [], selected: new Map(), listeners: {}, value: '',
      classList: {contains() { return false; }},
      setAttribute() {}, focus() {}, remove() {}, getRootNode() { return {activeElement: null}; },
      getBoundingClientRect() { return {right: 500, bottom: 100}; },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      append(...parts) { this.children.push(...parts); },
      replaceChildren(...parts) { this.children = parts; },
      contains(target) { return this === target || this.children.some(child => child.contains?.(target)); },
      closest() { return this; },
      querySelector(selector) {
        const match = child => selector.startsWith('.') ? child.className === selector.slice(1) :
          child.dataset?.act === selector.match(/^\[data-act=(.*)\]$/)?.[1];
        return this.children.find(match) || this.children.map(child => child.querySelector?.(selector)).find(Boolean) || null;
      }};
  }
  const document = {body: node(), createElement: node, addEventListener() {}, activeElement: null};
  const window = {addEventListener() {}, matchMedia: () => ({matches: false}), innerWidth: 1280, innerHeight: 900};
  const host = node(), saved = [], requests = [];
  const section = {id: 'c000000001', name: 'Synthetic', sources, include: [], exclude: []};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'web/workspace/news-section-editor.js'), 'utf8'),
    {window, document, AbortController, URL, requestAnimationFrame() {}, setTimeout, clearTimeout});
  // Supply the fixed controls represented by build()'s HTML template.
  host.append = popover => {
    host.children.push(popover);
    popover.querySelector = selector => {
      if (!popover.selected.has(selector)) {
        const control = node(); popover.selected.set(selector, control); popover.children.push(control);
      }
      return popover.selected.get(selector);
    };
  };
  const editor = window.NewsSectionEditor.mount({host, anchor: () => document.body,
    request: async (url, init) => {
      requests.push({url, init});
      assert.equal(url, '/source-test');
      return {ok: true, json: async () => ({ok: true, url: 'https://www.example.org/feed.xml', title: '', format: 'rss', count: 0})};
    }, announce() {}, getState: () => ({sections: [section], removed: [], statuses: new Map()}),
    save: async list => { saved.push(plain(list)); return {sections: list}; }, restore() {}, select() {}});
  const control = selector => host.children[0].querySelector(selector);
  return {editor, host, control, saved, requests,
    async click(button) {
      await host.children[0].listeners.click({target: button});
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
    button(act) { const button = node(); button.dataset.act = act; host.children[0].append(button); return button; }};
}

test('existing custom sources render their domain and survive editing and saving', async () => {
  const sources = [{id: 'feed1', url: 'https://www.example.org/feed.xml', name: 'Example'}];
  const f = editorFixture(sources);
  try {
    f.editor.open('edit', 'c000000001');
    assert.equal(f.editor.isOpen(), true);
    const rows = f.control('.sp-sources').children;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].querySelector('.host').textContent, 'example.org');
    f.control('#sp-name').value = 'Renamed';
    await f.click(f.button('save'));
    assert.equal(f.saved[0][0].name, 'Renamed');
    assert.deepEqual(f.saved[0][0].sources, [{url: sources[0].url, name: 'Example'}]);
    assert.equal(f.requests.length, 0);
  } finally { f.editor.destroy(); }
});

test('an empty custom section can add a detected untitled source and save it', async () => {
  const f = editorFixture([]);
  try {
    f.editor.open('edit', 'c000000001');
    f.control('#sp-url').value = 'https://www.example.org/feed.xml';
    await f.click(f.button('probe'));
    const add = f.control('.sp-result').children.find(child => child.dataset.act === 'add-probed');
    assert.ok(add);
    assert.equal(add.dataset.name, 'example.org');
    await f.click(add);
    const rows = f.control('.sp-sources').children;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].querySelector('.host').textContent, 'example.org');
    await f.click(f.button('save'));
    assert.deepEqual(f.saved[0][0].sources, [{url: 'https://www.example.org/feed.xml', name: 'example.org'}]);
  } finally { f.editor.destroy(); }
});

test('destroy releases section observers and prevents detached controls reopening the editor', () => {
  let observed, disconnected = 0, opened = 0, disposed = 0;
  class ResizeObserver {
    observe(target) { observed = target; }
    disconnect() { disconnected++; }
  }
  const window = {ResizeObserver, NewsSectionEditor: {mount: () => ({open() {opened++;}, destroy() {disposed++;}})}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'web/workspace/news-sections.js'), 'utf8'),
    {window, document: {}, ResizeObserver, AbortController});
  const tabs = new EventTarget(), add = new EventTarget(), edit = new EventTarget();
  const handle = window.NewsSections.mount({tabs, add, edit});
  assert.equal(observed, tabs);
  add.dispatchEvent(new Event('click'));
  assert.equal(opened, 1);
  handle.destroy();
  assert.equal(disconnected, 1);
  assert.equal(disposed, 1);
  add.dispatchEvent(new Event('click'));
  assert.equal(opened, 1);
});
