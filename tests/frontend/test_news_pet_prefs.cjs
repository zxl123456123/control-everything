// Shared pet preferences (news-pet-prefs.js): defaults, validation, writes, change notification and storage failures.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, 'web/workspace', file), 'utf8');

function setup({storage = new Map(), remote = null} = {}) {
  const listeners = new Set();
  const localStorage = {getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => { storage.set(key, String(value)); }};
  const window = {
    localStorage,
    addEventListener: (type, fn) => { if (type === 'storage') listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'storage') listeners.delete(fn); },
    ...(remote ? {CERemoteContext: {storage: () => remote}} : {}),
  };
  const context = vm.createContext({window, console});
  vm.runInContext(read('news-pets.js'), context);
  vm.runInContext(`window.NewsPets.register('spider', {label: '蜘蛛', mount: () => ({})});
    window.NewsPets.register('naidragon', {label: '奶龙', mount: () => ({})});`, context);
  vm.runInContext(read('news-pet-prefs.js'), context);
  return {prefs: window.NewsPetPrefs, storage, listeners, emit: event => [...listeners].forEach(fn => fn(event))};
}

test('defaults to the default pet, hidden', () => {
  const {prefs} = setup();
  assert.deepEqual({...prefs.read()}, {pet: 'spider', enabled: false});
});

test('stores the pet form and the switch under their documented keys', () => {
  const {prefs, storage} = setup();
  assert.equal(prefs.setPet('naidragon'), true);
  assert.equal(prefs.setEnabled(true), true);
  assert.equal(storage.get('news-reader-pet'), 'naidragon');
  assert.equal(storage.get('news-reader-pet-enabled'), 'true');
  assert.deepEqual({...prefs.read()}, {pet: 'naidragon', enabled: true});
  prefs.setEnabled(false);
  assert.equal(storage.get('news-reader-pet-enabled'), 'false');
});

test('an unknown stored or requested pet resolves to the default form', () => {
  const {prefs, storage} = setup({storage: new Map([['news-reader-pet', 'dodo']])});
  assert.equal(prefs.read().pet, 'spider');
  assert.equal(prefs.setPet('dodo'), false);
  assert.equal(storage.get('news-reader-pet'), 'dodo', 'a rejected name is not written');
});

test('subscribers hear about local changes once, and only real changes', () => {
  const {prefs} = setup();
  const seen = [];
  const stop = prefs.subscribe(next => seen.push({...next}));
  prefs.setEnabled(true); prefs.setEnabled(true); prefs.setPet('naidragon');
  assert.deepEqual(seen, [{pet: 'spider', enabled: true}, {pet: 'naidragon', enabled: true}]);
  stop(); prefs.setPet('spider');
  assert.equal(seen.length, 2, 'unsubscribed listeners stay quiet');
});

test('changes made in another document arrive through the storage event, without a reload', () => {
  const {prefs, storage, emit} = setup();
  const seen = [];
  prefs.subscribe(next => seen.push({...next}));
  storage.set('news-reader-pet-enabled', 'true'); emit({key: 'news-reader-pet-enabled'});
  storage.set('news-reader-pet', 'naidragon'); emit({key: 'news-reader-pet'});
  emit({key: 'unrelated'});
  storage.clear(); emit({key: null});
  assert.deepEqual(seen, [{pet: 'spider', enabled: true}, {pet: 'naidragon', enabled: true}, {pet: 'spider', enabled: false}]);
});

test('the storage listener exists only while somebody subscribes', () => {
  const {prefs, listeners} = setup();
  const stopA = prefs.subscribe(() => {}), stopB = prefs.subscribe(() => {});
  assert.equal(listeners.size, 1);
  stopA(); assert.equal(listeners.size, 1);
  stopB(); assert.equal(listeners.size, 0);
});

test('remote accounts use the scoped storage and match its prefixed event keys', () => {
  const scoped = new Map();
  const remote = {getItem: key => scoped.get('ce.remote.a.' + key) ?? null, setItem: (key, value) => { scoped.set('ce.remote.a.' + key, String(value)); }};
  const {prefs, emit} = setup({remote});
  const seen = [];
  prefs.subscribe(next => seen.push({...next}));
  scoped.set('ce.remote.a.news-reader-pet-enabled', 'true'); emit({key: 'ce.remote.a.news-reader-pet-enabled'});
  assert.deepEqual(seen, [{pet: 'spider', enabled: true}]);
});

test('blocked storage reads defaults and reports a failed write instead of pretending', () => {
  const blocked = {getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }};
  const {prefs} = setup({remote: blocked});
  assert.deepEqual({...prefs.read()}, {pet: 'spider', enabled: false});
  assert.equal(prefs.setEnabled(true), false);
  assert.equal(prefs.setPet('naidragon'), false);
});
