// Studio mascot (studio-mascot.js): per-route policy, quiet/reduced motion, first-run hint, dial actions, failure handling and cleanup.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, 'web/workspace', file), 'utf8');

class Node {
  constructor(tag, doc) {
    this.tag = tag; this.ownerDocument = doc; this.className = ''; this.children = []; this.attrs = {}; this.listeners = {};
    this.dataset = {}; this.style = {}; this.textContent = ''; this.hidden = false; this.parent = null; this.focused = false;
  }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { (this.listeners.click || []).forEach(fn => fn()); }
  focus() { this.focused = true; }
  getBoundingClientRect() { return {left: 0, right: this.width || 0, width: this.width || 0}; }
  all(predicate, out = []) { if (predicate(this)) out.push(this); for (const child of this.children) child.all(predicate, out); return out; }
  querySelector(selector) { const cls = selector.slice(1); return this.all(node => node.className.split(' ').includes(cls))[0] || null; }
}

function setup({prefs = {}, route = {view: 'home', tab: ''}, compact = false, reduced = false, withFeed = true, hinted = false, mountThrows = false} = {}) {
  const storage = new Map(Object.entries({'news-reader-pet-enabled': 'true', ...prefs}));
  if (hinted) storage.set('news-reader-pet-hint', '1');
  const listeners = {};
  const docListeners = {};
  const doc = {createElement: tag => new Node(tag, doc), addEventListener: (type, fn) => { (docListeners[type] ||= []).push(fn); }, removeEventListener: (type, fn) => { docListeners[type] = (docListeners[type] || []).filter(item => item !== fn); }};
  doc.defaultView = {addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); }, removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter(item => item !== fn); }};
  const host = new Node('section', doc); host.dataset.theme = 'light';
  const rail = new Node('nav', doc); rail.className = 'ce-rail'; rail.width = 240; host.append(rail);
  const window = {
    localStorage: {getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => { storage.set(key, String(value)); }},
    addEventListener: () => {}, removeEventListener: () => {},
  };
  const engines = [], wheels = [];
  const wheelFactory = {create(config) {
    const wheel = {config, open: false, pinned: config.pinned, destroyed: false, refreshed: 0,
      toggle(keyboard) { wheel.open = !wheel.open; wheel.keyboard = keyboard; }, isOpen: () => wheel.open, setPinned(value) { wheel.pinned = value; },
      refresh() { wheel.refreshed++; }, close() { wheel.open = false; }, destroy() { wheel.destroyed = true; }};
    wheels.push(wheel); return wheel;
  }};
  const pets = {
    list: () => [{name: 'spider', label: '蜘蛛', status: false}, {name: 'naidragon', label: '奶龙', status: true}, {name: 'tabbycat', label: '狸花猫', status: true}],
    mount(name, options) {
      if (mountThrows) throw new Error('boom');
      const engine = {name, options, calls: [], destroyed: false, menu: {open: false}, reactReturns: true,
        pause() { this.calls.push('pause'); }, resume() { this.calls.push('resume'); },
        setStatus(value) { this.status = value; }, setOptions(value) { this.options = {...this.options, ...value}; },
        setActions(value) { this.actions = value; }, openMenu(keyboard) { this.opened = keyboard; },
        react(kind, text) { this.calls.push('react:' + text); return this.reactReturns; },
        inspect() { return {menu: this.menu}; }, destroy() { this.destroyed = true; }};
      engine.actions = options.actions; engines.push(engine); return engine;
    },
  };
  window.NewsPets = {...pets, defaultName: () => 'spider'};
  const context = vm.createContext({window, console});
  for (const file of ['news-pet-dial.js', 'news-pet-prefs.js', 'news-pet-director.js', 'studio-mascot.js']) vm.runInContext(read(file), context);
  let feedApply = null, current = route, navigations = [], envListener = null, feedStarts = 0, feedStops = 0, timers = [];
  const feed = withFeed ? {start: ({apply}) => { feedStarts++; feedApply = apply; return {stop() { feedStops++; }}; }} : undefined;
  const flags = {compact, reduced};
  const env = {compact: () => flags.compact, reduced: () => flags.reduced, onChange: fn => { envListener = fn; return () => { envListener = null; }; }};
  const mascot = context.window.StudioMascot.create({
    host, route: () => current, navigate: hash => navigations.push(hash), prefs: window.NewsPetPrefs, dial: window.NewsPetDial,
    director: window.NewsPetDirector, wheel: wheelFactory, pets, feed, env, storage: window.localStorage,
    setTimer: (fn, ms) => { const timer = {fn, ms}; timers.push(timer); return timer; }, clearTimer: timer => { timers = timers.filter(item => item !== timer); },
  });
  const api = {
    window, storage, host, mascot, engines, wheels, liveWheel: () => wheels.filter(item => !item.destroyed)[0], navigations, listeners, docListeners,
    engine: () => engines[engines.length - 1], live: () => engines.filter(item => !item.destroyed),
    go(next) { current = next; mascot.setRoute(); },
    set(patch) { return window.NewsPetPrefs.set(patch); },
    flags, feedApply: value => feedApply(value),
    fireEnv: () => envListener?.(), timers: () => timers, runTimers() { const due = timers; timers = []; due.forEach(timer => timer.fn()); },
    feed: () => ({starts: feedStarts, stops: feedStops}), parts: () => host.all(node => node.className.startsWith('ce-mascot') && node.className !== 'ce-mascot-note'),
  };
  return api;
}

const ids = engine => JSON.parse(JSON.stringify(engine.actions.map(item => item.id)));

test('policy shows the mascot on workbench pages and hides it on focused or self-owned surfaces', () => {
  const {policy} = setup().window.StudioMascot;
  for (const view of ['home', 'inbox', 'tools']) assert.equal(policy({view}).show, true, view);
  assert.equal(policy({view: 'settings', tab: 'appearance'}).show, true);
  assert.equal(policy({view: 'settings', tab: 'account'}).reason, 'pairing-page');
  assert.equal(policy({view: 'news'}).reason, 'news-owns-pet');
  for (const view of ['project', 'workbench', 'mobile']) assert.equal(policy({view}).reason, 'focused-surface', view);
  assert.equal(policy({view: 'home'}, {compact: true}).reason, 'compact-viewport');
});

test('mounts the stored 3D pet on a workbench page and follows the route', () => {
  const t = setup({prefs: {'news-reader-pet': 'tabbycat'}});
  assert.equal(t.engine().name, 'tabbycat');
  assert.equal(t.engine().options.options.dock, 'br');
  t.go({view: 'project', id: 'a', tab: 'workspace'});
  assert.equal(t.live().length, 0);
  assert.equal(t.parts().length, 0, 'the overlay leaves no DOM behind');
  t.go({view: 'news'});
  assert.equal(t.live().length, 0);
  t.go({view: 'inbox'});
  assert.equal(t.live().length, 1);
});

test('the spider, a disabled pet and a compact viewport never mount an engine', () => {
  assert.equal(setup().engines.length, 0, 'default pet is the spider');
  assert.equal(setup({prefs: {'news-reader-pet': 'naidragon', 'news-reader-pet-enabled': 'false'}}).engines.length, 0);
  assert.equal(setup({prefs: {'news-reader-pet': 'naidragon'}, compact: true}).engines.length, 0);
});

test('size and dock preferences reach the engine; a bottom-left pet sits beside the rail', () => {
  const t = setup({prefs: {'news-reader-pet': 'naidragon', 'news-reader-pet-size': 'large', 'news-reader-pet-dock': 'bl'}});
  assert.equal(t.engine().options.options.scale, 1.25);
  assert.equal(t.engine().options.options.dock, 'bl');
  assert.equal(t.host.querySelector('.ce-mascot').style.left, '240px');
  t.set({size: 'small', dock: 'auto'});
  assert.equal(t.engine().options.scale, 0.8);
  assert.equal(t.engine().options.dock, 'br');
  assert.equal(t.host.querySelector('.ce-mascot').style.left, '0px');
});

test('switching the pet remounts, switching to the spider or off removes the overlay', () => {
  const t = setup({prefs: {'news-reader-pet': 'naidragon'}});
  t.set({pet: 'tabbycat'});
  assert.deepEqual(t.engines.map(item => [item.name, item.destroyed]), [['naidragon', true], ['tabbycat', false]]);
  t.set({pet: 'spider'});
  assert.equal(t.live().length, 0);
  t.set({pet: 'naidragon'});
  assert.equal(t.live().length, 1);
  t.set({enabled: false});
  assert.equal(t.live().length, 0);
  assert.equal(t.parts().length, 0);
});

test('quiet mode and reduced motion pause the pet and stop status polling', () => {
  const t = setup({prefs: {'news-reader-pet': 'naidragon'}});
  assert.equal(t.mascot.inspect().polling, true);
  t.set({quiet: true});
  assert.equal(t.engine().calls.at(-1), 'pause');
  assert.equal(t.mascot.inspect().polling, false);
  assert.equal(t.feed().stops, 1);
  t.set({quiet: false});
  assert.equal(t.engine().calls.at(-1), 'resume');
  assert.equal(t.mascot.inspect().polling, true);
  const reduced = setup({prefs: {'news-reader-pet': 'naidragon'}, reduced: true});
  assert.equal(reduced.engine().calls.at(-1), 'pause');
  assert.equal(reduced.feed().starts, 0);
  assert.equal(setup({prefs: {'news-reader-pet': 'naidragon'}, withFeed: false}).mascot.inspect().polling, false);
});

test('status updates accumulate and reach the engine', () => {
  const t = setup({prefs: {'news-reader-pet': 'naidragon'}});
  t.feedApply({usage: 'busy'});
  t.feedApply({agents: 2});
  assert.deepEqual(JSON.parse(JSON.stringify(t.engine().status)), {usage: 'busy', agents: 2});
});

test('the first-run hint shows once, never in quiet mode, and retries while the pet is loading', () => {
  const t = setup({prefs: {'news-reader-pet': 'naidragon'}});
  assert.equal(t.timers().length, 1);
  t.engine().reactReturns = false;
  t.runTimers();
  assert.equal(t.storage.get('news-reader-pet-hint'), undefined, 'not marked seen while the pet could not speak');
  assert.equal(t.timers().length, 1, 'retries');
  t.engine().reactReturns = true;
  t.runTimers();
  assert.equal(t.engine().calls.filter(call => call.startsWith('react:')).length, 2);
  assert.equal(t.storage.get('news-reader-pet-hint'), '1');
  assert.equal(setup({prefs: {'news-reader-pet': 'naidragon'}, hinted: true}).timers().length, 0);
  assert.equal(setup({prefs: {'news-reader-pet': 'naidragon', 'news-reader-pet-quiet': 'true'}}).timers().length, 0);
  const quietLater = setup({prefs: {'news-reader-pet': 'naidragon'}});
  quietLater.set({quiet: true});
  assert.equal(quietLater.timers().length, 0, 'turning quiet mode on cancels the pending hint');
});

test('the dial uses the studio surface, hides the useless home entry and navigates through hashes', () => {
  const t = setup({prefs: {'news-reader-pet': 'naidragon'}});
  assert.deepEqual(ids(t.engine()), ['quiet', 'pet-settings', 'news']);
  t.engine().actions.find(item => item.id === 'news').run();
  t.engine().actions.find(item => item.id === 'pet-settings').run();
  assert.deepEqual(t.navigations, ['#news', '#settings/appearance']);
  t.go({view: 'tools'});
  assert.deepEqual(ids(t.engine()), ['workspace', 'quiet', 'pet-settings']);
  t.engine().actions.find(item => item.id === 'workspace').run();
  assert.equal(t.navigations.at(-1), '#home');
});

test('dial quiet and hide entries write preferences and announce through the live region', () => {
  const t = setup({prefs: {'news-reader-pet': 'naidragon'}});
  const note = t.host.querySelector('.ce-mascot-note');
  assert.equal(note.hidden, true);
  t.engine().actions.find(item => item.id === 'quiet').run();
  assert.equal(t.window.NewsPetPrefs.read().quiet, true);
  assert.match(note.textContent, /安静模式已开启/);
  assert.equal(note.hidden, false);
  t.engine().actions.find(item => item.id === 'hide-pet')?.run();
  t.set({dial: ['quiet', 'hide-pet', 'pet-settings']});
  t.engine().actions.find(item => item.id === 'hide-pet').run();
  assert.equal(t.window.NewsPetPrefs.read().enabled, false);
  assert.equal(t.live().length, 0);
  assert.match(note.textContent, /重新打开/);
});

test('the key button toggles the wheel; keyboard activation (detail 0) asks it to take focus', () => {
  const t = setup({prefs: {'news-reader-pet': 'naidragon'}});
  const key = t.host.querySelector('.ce-mascot-key'), wheel = t.liveWheel();
  key.listeners.click[0]({detail: 0});
  assert.equal(wheel.open, true);
  assert.equal(wheel.keyboard, true);
  key.listeners.click[0]({detail: 1});
  assert.equal(wheel.open, false);
  assert.equal(wheel.config.returnFocus(), key, 'Escape returns focus to the key button');
  assert.equal(t.engine().options.options.dial, false, 'the pet itself no longer draws a dial');
});

test('the wheel is anchored to the depot, follows the dial setting and the pin preference, and dies with the pet', () => {
  const t = setup({prefs: {'news-reader-pet': 'naidragon'}});
  const wheel = t.liveWheel();
  assert.equal(wheel.config.tapTarget.className, 'ce-mascot');
  assert.equal(wheel.config.anchor().className, 'ce-mascot-depot');
  assert.equal(wheel.config.pinned, false);
  wheel.config.onPinChange(true);
  assert.equal(t.window.NewsPetPrefs.read().dialPin, true, 'the pin goes through the shared preference');
  assert.equal(wheel.pinned, true);
  t.set({dial: ['quiet', 'hide-pet', 'pet-settings']});
  assert.equal(wheel.refreshed, 1);
  t.go({view: 'news'});
  assert.equal(wheel.destroyed, true);
  assert.equal(t.liveWheel(), undefined);
});

test('a failing mount or the lazy fallback event removes the pet quietly and does not retry until the pet changes', () => {
  const thrown = setup({prefs: {'news-reader-pet': 'naidragon'}, mountThrows: true});
  assert.equal(thrown.mascot.inspect().failedPet, 'naidragon');
  assert.equal(thrown.parts().filter(node => node.className === 'ce-mascot').length, 0);
  assert.match(thrown.host.querySelector('.ce-mascot-note').textContent, /暂时无法加载/);
  thrown.go({view: 'tools'});
  assert.equal(thrown.engines.length, 0, 'no retry loop on route changes');

  const t = setup({prefs: {'news-reader-pet': 'naidragon'}});
  t.listeners['news-pet-fallback'][0]({detail: {pet: 'tabbycat', fallback: 'spider'}});
  assert.equal(t.live().length, 1, 'events for another pet are ignored');
  t.listeners['news-pet-fallback'][0]({detail: {pet: 'naidragon', fallback: 'spider'}});
  assert.equal(t.live().length, 0);
  t.set({pet: 'tabbycat'});
  assert.equal(t.live().length, 1, 'picking another pet clears the failure');
});

test('viewport changes through the environment listener hide and restore the pet', () => {
  const t = setup({prefs: {'news-reader-pet': 'naidragon'}});
  assert.equal(t.live().length, 1);
  t.flags.compact = true; t.fireEnv();
  assert.equal(t.live().length, 0);
  t.flags.compact = false; t.fireEnv();
  assert.equal(t.live().length, 1);
  t.flags.reduced = true; t.fireEnv();
  assert.equal(t.engine().calls.at(-1), 'pause');
});

test('dispose removes everything and later preference changes do nothing', () => {
  const t = setup({prefs: {'news-reader-pet': 'naidragon'}});
  const engine = t.engine();
  t.mascot.dispose();
  assert.equal(engine.destroyed, true);
  assert.equal(t.parts().length, 0);
  assert.equal((t.listeners['news-pet-fallback'] || []).length, 0);
  assert.equal((t.docListeners.keydown || []).length, 0);
  assert.equal(t.feed().stops, 1);
  t.set({pet: 'tabbycat'});
  assert.equal(t.engines.length, 1);
  t.mascot.dispose();
});
