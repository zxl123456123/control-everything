// Shared pet preferences (news-pet-prefs.js): defaults, validation, writes, change notification and storage failures.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, 'web/workspace', file), 'utf8');

const BASE = {pet: 'spider', enabled: false, quiet: false, newsFx: true, size: 'medium', dock: 'auto'};
const snap = prefs => JSON.parse(JSON.stringify(prefs));

function setup({storage = new Map(), remote = null} = {}) {
  const listeners = new Set();
  const localStorage = {getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => { storage.set(key, String(value)); }, removeItem: key => { storage.delete(key); }};
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
  assert.deepEqual(snap(prefs.read()), BASE);
});

test('stores the pet form and the switch under their documented keys', () => {
  const {prefs, storage} = setup();
  assert.equal(prefs.setPet('naidragon'), true);
  assert.equal(prefs.setEnabled(true), true);
  assert.equal(storage.get('news-reader-pet'), 'naidragon');
  assert.equal(storage.get('news-reader-pet-enabled'), 'true');
  assert.deepEqual(snap(prefs.read()), {...BASE, pet: 'naidragon', enabled: true});
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
  const stop = prefs.subscribe(next => seen.push(snap(next)));
  prefs.setEnabled(true); prefs.setEnabled(true); prefs.setPet('naidragon');
  assert.deepEqual(seen, [{...BASE, enabled: true}, {...BASE, enabled: true, pet: 'naidragon'}]);
  stop(); prefs.setPet('spider');
  assert.equal(seen.length, 2, 'unsubscribed listeners stay quiet');
});

test('changes made in another document arrive through the storage event, without a reload', () => {
  const {prefs, storage, emit} = setup();
  const seen = [];
  prefs.subscribe(next => seen.push(snap(next)));
  storage.set('news-reader-pet-enabled', 'true'); emit({key: 'news-reader-pet-enabled'});
  storage.set('news-reader-pet', 'naidragon'); emit({key: 'news-reader-pet'});
  emit({key: 'unrelated'});
  storage.clear(); emit({key: null});
  assert.deepEqual(seen, [{...BASE, enabled: true}, {...BASE, enabled: true, pet: 'naidragon'}, BASE]);
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
  prefs.subscribe(next => seen.push(snap(next)));
  scoped.set('ce.remote.a.news-reader-pet-enabled', 'true'); emit({key: 'ce.remote.a.news-reader-pet-enabled'});
  assert.deepEqual(seen, [{...BASE, enabled: true}]);
});

test('blocked storage reads defaults and reports a failed write instead of pretending', () => {
  const blocked = {getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }};
  const {prefs} = setup({remote: blocked});
  assert.deepEqual(snap(prefs.read()), BASE);
  assert.equal(prefs.setEnabled(true), false);
  assert.equal(prefs.setPet('naidragon'), false);
});

test('quiet, news interactions, size and dock are validated, stored under their keys and reported once', () => {
  const {prefs, storage} = setup();
  const seen = [];
  prefs.subscribe(next => seen.push(snap(next)));
  assert.equal(prefs.set({quiet: true, newsFx: false, size: 'large', dock: 'br'}), true);
  assert.equal(storage.get('news-reader-pet-quiet'), 'true');
  assert.equal(storage.get('news-reader-pet-news-fx'), 'false');
  assert.equal(storage.get('news-reader-pet-size'), 'large');
  assert.equal(storage.get('news-reader-pet-dock'), 'br');
  assert.equal(seen.length, 1, 'one patch is one notification');
  assert.deepEqual(seen[0], {...BASE, quiet: true, newsFx: false, size: 'large', dock: 'br'});
});

test('an invalid patch writes nothing at all', () => {
  const {prefs, storage} = setup();
  assert.equal(prefs.set({quiet: true, size: 'huge'}), false);
  assert.equal(prefs.set({dock: 'tl'}), false);
  assert.equal(prefs.set({newsFx: 'no'}), false);
  assert.equal(prefs.set({}), false);
  assert.equal(storage.size, 0);
});

test('unknown stored values fall back to the defaults', () => {
  const {prefs} = setup({storage: new Map([['news-reader-pet-size', 'xl'], ['news-reader-pet-dock', 'tl'], ['news-reader-pet-news-fx', 'maybe']])});
  assert.deepEqual(snap(prefs.read()), BASE);
});


test('the keys of the retired wheel settings are deleted on the first read and nothing is migrated', () => {
  const storage = new Map([['news-reader-pet-dial', 'workspace,next,quiet'], ['news-reader-pet-dial-pin', 'true'], ['news-reader-pet-size', 'large']]);
  const {prefs} = setup({storage});
  assert.deepEqual(snap(prefs.read()), {...BASE, size: 'large'});
  assert.equal(storage.has('news-reader-pet-dial'), false);
  assert.equal(storage.has('news-reader-pet-dial-pin'), false);
  assert.equal(storage.get('news-reader-pet-size'), 'large', 'the live keys stay');
  assert.equal('dial' in prefs.read() || 'dialPin' in prefs.read(), false);
  assert.equal(prefs.set({dial: ['quiet']}), false, 'the retired fields are no longer accepted');
});

test('the legacy cleanup uses the remote-scoped storage, retries while storage refuses, and stops once done', () => {
  const scoped = new Map([['news-reader-pet-dial', 'x'], ['news-reader-pet-dial-pin', 'true']]);
  const remote = {getItem: key => scoped.get(key) ?? null, setItem: () => {}, removeItem: key => scoped.delete(key)};
  setup({remote}).prefs.read();
  assert.equal(scoped.size, 0, 'the keys are removed through the context storage, not the bare localStorage');
  let calls = 0, refuse = true;
  const flaky = {getItem: () => null, setItem: () => {}, removeItem: () => { calls++; if (refuse) throw new Error('read-only'); }};
  const {prefs} = setup({remote: flaky});
  prefs.read(); prefs.read();
  assert.equal(calls, 2, 'a read-only store is tried again on the next read');
  refuse = false; prefs.read(); prefs.read();
  assert.equal(calls, 4, 'two keys removed once, then the cleanup stops');
});
