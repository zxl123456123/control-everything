// The dial's action pool (news-pet-dial.js): defaults, limits, toggling and what each surface may show.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../web/workspace/news-pet-dial.js'), 'utf8');
const window = {};
vm.runInContext(source, vm.createContext({window}));
const dial = window.NewsPetDial;
const plain = value => JSON.parse(JSON.stringify(value));
const eq = (actual, expected) => assert.deepEqual(plain(actual), plain(expected));
const ids = list => list.map(item => item.id);

test('the pool has unique ids, labels and icons, and the defaults fit the limits', () => {
  assert.equal(new Set(dial.POOL.map(a => a.id)).size, dial.POOL.length);
  for (const action of dial.POOL) { assert.ok(action.label && action.icon, action.id); assert.ok(['any', 'news', 'studio'].includes(action.scope)); }
  assert.ok(dial.DEFAULTS.length >= dial.MIN && dial.DEFAULTS.length <= dial.MAX);
  assert.ok(dial.DEFAULTS.every(id => dial.POOL.some(a => a.id === id)));
  eq([dial.MIN, dial.MAX], [3, 6]);
});

test('normalize keeps valid ids in pool order and resets nonsense to the defaults', () => {
  eq(dial.normalize(['quiet', 'next', 'next', 'bogus', 'workspace']), ['workspace', 'next', 'quiet']);
  eq(dial.normalize(['next', 'search']), dial.DEFAULTS, 'two actions are too few');
  eq(dial.normalize(null), dial.DEFAULTS);
  eq(dial.parse('workspace,next,search,collect,save,archive,quiet,hide-pet'), ['workspace', 'next', 'search', 'collect', 'save', 'archive'], 'cut to six');
  eq(dial.parse(null), dial.DEFAULTS);
});

test('toggle refuses to drop under three or climb over six, and says why', () => {
  eq(dial.toggle(['workspace', 'next', 'quiet'], 'next'), {ids: ['workspace', 'next', 'quiet'], ok: false, reason: 'min'});
  eq(dial.toggle(dial.DEFAULTS, 'save'), {ids: dial.DEFAULTS, ok: false, reason: 'max'});
  eq(dial.toggle(dial.DEFAULTS, 'bogus').reason, 'unknown');
  const added = dial.toggle(['workspace', 'next', 'quiet'], 'save');
  eq(added, {ids: ['workspace', 'next', 'save', 'quiet'], ok: true});
  eq(dial.toggle(added.ids, 'save').ids, ['workspace', 'next', 'quiet']);
});

test('the news page may use news and general actions, never the Studio-only one', () => {
  const list = ids(dial.forSurface(dial.POOL.map(a => a.id).slice(0, 6), 'news'));
  assert.ok(!list.includes('news'));
  eq(ids(dial.forSurface(dial.DEFAULTS, 'news')), dial.DEFAULTS);
});

test('the Studio drops news-only actions but never shows fewer than three', () => {
  eq(ids(dial.forSurface(dial.DEFAULTS, 'studio')), ['workspace', 'quiet', 'pet-settings']);
  eq(ids(dial.forSurface(dial.DEFAULTS, 'studio', ['workspace'])), ['quiet', 'pet-settings', 'news']);
  eq(ids(dial.forSurface(['next', 'search', 'collect', 'quiet'], 'studio')), ['quiet', 'workspace', 'news']);
  assert.ok(dial.forSurface(['workspace', 'news', 'quiet'], 'studio').every(a => a.scope !== 'news'));
});
