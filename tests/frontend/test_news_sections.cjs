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
