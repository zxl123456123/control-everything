// The news-page pet director (news-pet-director.js): the shared wheel actions, size/dock options and the throttled reactor.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.resolve(__dirname, '../../web/workspace', name), 'utf8');
const window = {};
const context = vm.createContext({window});
vm.runInContext(read('news-pet-dial.js'), context);
vm.runInContext(read('news-pet-director.js'), context);
const director = window.NewsPetDirector;
const plain = value => JSON.parse(JSON.stringify(value));

function setup({enabled = true, engineHasReact = true} = {}) {
  const state = {enabled, time: 0, timers: [], calls: []};
  const engine = engineHasReact ? {react: (gesture, text) => { state.calls.push([gesture, text]); return true; }} : {};
  const reactor = director.createReactor({
    engine: () => engine, enabled: () => state.enabled, now: () => state.time,
    setTimer: (fn, ms) => { state.timers.push({fn, ms}); return state.timers.length; }, clearTimer: id => { if (state.timers[id - 1]) state.timers[id - 1].fn = null; },
  });
  return {state, reactor};
}

function host(overrides = {}) {
  const log = {went: [], told: [], hid: 0, searched: 0}, stored = {quiet: false, enabled: true};
  const prefs = {
    read: () => ({...stored}),
    set: patch => { if (overrides.refuse) return false; Object.assign(stored, patch); return true; },
    setEnabled: value => { if (overrides.refuse) return false; stored.enabled = value; return true; },
  };
  const actions = director.createActions({
    here: 'news', go: hash => log.went.push(hash), search: () => { log.searched++; }, prefs, notify: text => log.told.push(text), afterHide: () => { log.hid++; }, ...overrides,
  });
  return {log, stored, actions, by: id => actions.find(action => action.id === id)};
}

test('buildActions always returns all six slots in clock order, with a noop and a reason for a missing handler', () => {
  const actions = director.buildActions({});
  assert.deepEqual(plain(actions.map(a => [a.id, a.angle])), [['workspace', 0], ['news', 60], ['search', 120], ['quiet', 180], ['pet-settings', 240], ['hide-pet', 300]]);
  assert.ok(actions.every(a => a.label && a.icon && typeof a.run === 'function' && a.enabled === false && a.reason));
  let ran = 0;
  const some = director.buildActions({news: {run: () => { ran++; }}, quiet: {run: () => {}, checked: true}});
  assert.equal(some.find(a => a.id === 'news').enabled, true);
  some.find(a => a.id === 'news').run(); assert.equal(ran, 1);
  assert.equal(some.find(a => a.id === 'quiet').checked, true);
  assert.equal(some.find(a => a.id === 'workspace').enabled, false);
  assert.equal('checked' in some.find(a => a.id === 'news'), false, 'only the quiet switch has a state');
});

test('on the news page: the news slot is greyed as 当前页 and search works', () => {
  const {by, log} = host();
  assert.equal(by('news').enabled, false); assert.equal(by('news').reason, '当前页');
  assert.equal(by('workspace').enabled, true);
  by('workspace').run(); assert.deepEqual(plain(log.went), ['#home']);
  assert.equal(by('search').enabled, true);
  by('search').run(); assert.equal(log.searched, 1);
});

test('in the Studio: the page you are on is greyed and search says 仅新闻页', () => {
  const home = host({here: 'home', search: null});
  assert.equal(home.by('workspace').enabled, false); assert.equal(home.by('workspace').reason, '当前页');
  assert.equal(home.by('news').enabled, true);
  assert.equal(home.by('search').enabled, false); assert.equal(home.by('search').reason, '仅新闻页');
  const inbox = host({here: 'inbox', search: null});
  assert.equal(inbox.by('workspace').enabled, true, 'any other page can go home');
  inbox.by('news').run(); assert.deepEqual(plain(inbox.log.went), ['#news']);
  inbox.by('pet-settings').run(); assert.deepEqual(plain(inbox.log.went), ['#news', '#settings/appearance']);
});

test('quiet mode toggles through the preference, shows its state and tells the user', () => {
  const {by, stored, log} = host();
  assert.equal(by('quiet').checked, false);
  by('quiet').run(); assert.equal(stored.quiet, true);
  by('quiet').run(); assert.equal(stored.quiet, false);
  assert.deepEqual(plain(log.told), ['安静模式已开启，宠物不再有动作和提示。', '安静模式已关闭。']);
  const refused = host({refuse: true});
  refused.by('quiet').run(); assert.deepEqual(plain(refused.log.told), [], 'nothing is announced when nothing was saved');
});

test('hiding the pet stores the switch, says how to bring it back, and lets the page move focus', () => {
  const {by, stored, log} = host();
  by('hide-pet').run();
  assert.equal(stored.enabled, false); assert.equal(log.hid, 1);
  assert.match(log.told[0], /设置 → 外观 → 宠物/);
  const refused = host({refuse: true});
  refused.by('hide-pet').run();
  assert.equal(refused.log.hid, 0); assert.match(refused.log.told[0], /无法保存/);
});

test('petOptions maps size and dock for full pets only', () => {
  assert.deepEqual(plain(director.petOptions({size: 'small', dock: 'br'}, true)), {scale: 0.8, dock: 'br', dial: false});
  assert.deepEqual(plain(director.petOptions({size: 'large', dock: 'auto'}, true)), {scale: 1.25, dock: 'auto', dial: false});
  assert.deepEqual(plain(director.petOptions({size: 'medium', dock: 'tl'}, true)), {scale: 1, dock: 'auto', dial: false});
  assert.deepEqual(plain(director.petOptions({size: 'small', dock: 'br'}, false)), {});
});

test('every reaction has a gesture, a gap and text', () => {
  for (const [kind, spec] of Object.entries(director.REACTIONS)) {
    assert.ok(spec.gesture && spec.gap > 0 && spec.text, kind);
    assert.ok((typeof spec.text === 'function' ? spec.text({count: 2}) : spec.text).length <= 24, kind);
  }
});

test('a reaction reaches the pet once, then the global and per-kind gaps hold it back', () => {
  const {state, reactor} = setup();
  assert.equal(reactor.react('saved'), true);
  assert.equal(reactor.react('archived'), false, 'global gap');
  state.time = 3100;
  assert.equal(reactor.react('archived'), true);
  state.time = 6200;
  assert.equal(reactor.react('saved'), true, 'per-kind gap of saved already passed');
  assert.equal(reactor.react('saved'), false);
  assert.deepEqual(plain(state.calls.map(c => c[1])), ['收藏好啦', '已读归档', '收藏好啦']);
});

test('the arrival text counts the new articles', () => {
  const {state, reactor} = setup();
  reactor.react('arrival', {count: 3});
  assert.equal(state.calls[0][1], '来了 3 条新文章');
});

test('a refresh failure is urgent and ignores the global gap', () => {
  const {state, reactor} = setup();
  reactor.react('saved');
  assert.equal(reactor.react('refresh-failed'), true);
  assert.equal(state.calls.length, 2);
});

test('nothing happens while disabled, with an unknown kind, or for a pet without react()', () => {
  const off = setup({enabled: false});
  assert.equal(off.reactor.react('saved'), false);
  assert.equal(off.reactor.observeUnread(2), false);
  assert.equal(setup().reactor.react('nope'), false);
  assert.equal(setup({engineHasReact: false}).reactor.react('saved'), false);
});

test('a keyed reaction fires once per key', () => {
  const {state, reactor} = setup();
  assert.equal(reactor.react('read-end', {key: 'a'}), true);
  state.time = 20000;
  assert.equal(reactor.react('read-end', {key: 'a'}), false);
  assert.equal(reactor.react('read-end', {key: 'b'}), true);
});

test('all-read fires only when unread drops from some to none', () => {
  const {state, reactor} = setup();
  assert.equal(reactor.observeUnread(0), false, 'first reading is not an event');
  assert.equal(reactor.observeUnread(3), false);
  assert.equal(reactor.observeUnread(0), true);
  assert.equal(reactor.observeUnread(0), false);
  assert.equal(state.calls[0][1], '未读都看完啦');
});

test('read-end needs a long article and fires once at the bottom', () => {
  const {reactor} = setup();
  assert.equal(reactor.observeScroll({top: 100, height: 900, client: 600, key: 'a'}), false, 'not at the end');
  assert.equal(reactor.observeScroll({top: 300, height: 900, client: 600, key: 'a'}), false, 'article is too short to count');
  assert.equal(reactor.observeScroll({top: 1600, height: 2000, client: 400, key: 'a'}), true);
  assert.equal(reactor.observeScroll({top: 1610, height: 2000, client: 400, key: 'a'}), false, 'still at the end');
});

test('later() waits, re-checks the condition and can be cancelled', () => {
  const {state, reactor} = setup();
  let empty = true;
  reactor.later('search-empty', {}, 700, () => empty);
  reactor.later('search-empty', {}, 700, () => empty);
  assert.equal(state.timers[0].fn, null, 'the first timer was replaced');
  empty = false; state.timers[1].fn();
  assert.equal(state.calls.length, 0, 'the search is no longer empty');
  empty = true; reactor.later('search-empty', {}, 700, () => empty); state.timers[2].fn();
  assert.equal(state.calls.length, 1);
  reactor.later('list-empty', {}, 700, () => true); reactor.cancelPending();
  assert.equal(state.timers[3].fn, null);
});
