const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../web/workspace/ui-theme.js'), 'utf8');
function element() {
  const listeners = new Map(), attributes = new Map(), properties = new Map();
  return {
    dataset: {}, hidden: false, textContent: '', innerHTML: '',
    style: {setProperty: (key, value) => properties.set(key, value), getPropertyValue: key => properties.get(key)},
    setAttribute: (key, value) => attributes.set(key, value), getAttribute: key => attributes.get(key),
    addEventListener: (key, listener) => listeners.set(key, listener),
    removeEventListener: (key, listener) => { if (listeners.get(key) === listener) listeners.delete(key); },
    click: () => listeners.get('click')?.(), listeners
  };
}

function environment({values = {}, meta = false, fontFailure = false, decodeFailure = false, storageFailure = null, remote = null, pageKey = null} = {}) {
  const data = new Map(Object.entries(values)), accesses = [], errors = [], fontFaces = [];
  const root = element();
  let failure = storageFailure, globalReads = 0, fontResolve, fontReject;
  const fontLoad = new Promise((resolve, reject) => { fontResolve = resolve; fontReject = reject; });
  const storage = {
    getItem(key) { accesses.push(['get', key]); if (failure?.read) throw failure.read; return data.get(key) ?? null; },
    setItem(key, value) { accesses.push(['set', key, value]); if (failure?.write) throw failure.write; data.set(key, value); }
  };
  const window = {
    document: {documentElement: root, currentScript: pageKey === null ? null : {getAttribute: () => pageKey}, querySelector: () => meta ? {content: 'context marker'} : null, fonts: {add: face => fontFaces.push(face)}},
    console: {error: (...args) => errors.push(args)},
    atob(value) { if (decodeFailure) throw new Error('invalid font payload'); return Buffer.from(value, 'base64').toString('binary'); },
    FontFace: class {
      constructor(family, source, descriptors) { Object.assign(this, {family, source, descriptors}); }
      load() { return fontLoad; }
    },
    CERemoteContext: remote
  };
  Object.defineProperty(window, 'localStorage', {get() { globalReads++; if (failure?.handle) throw failure.handle; return storage; }});
  const context = vm.createContext({window, console: window.console});
  vm.runInContext(source, context);
  if (fontFailure) fontReject(new Error('CSP font-src denied'));
  else fontResolve();
  return {
    api: window.CEUITheme, window, root, storage, accesses, data, errors, fontFaces,
    globalReads: () => globalReads, setFailure: value => { failure = value; },
    rerun: () => vm.runInContext(source, context)
  };
}

test('head defaults to light, registers the font once, and never follows the OS theme', async () => {
  const env = environment();
  const theme = env.api.earlyRead('ce.sessions.theme');
  assert.equal(theme.theme, 'light');
  assert.equal(env.root.dataset.theme, 'light');
  assert.equal(env.root.style.getPropertyValue('--ce-input-border'), '#858585');
  assert.equal(env.data.size, 0);
  assert.equal((await env.api.fontReady).ok, true);
  assert.equal(env.api.getFontState().status, 'loaded');
  assert.equal(env.fontFaces[0].family, 'Geist');
  assert.equal(env.fontFaces[0].descriptors.weight, '100 900');
  assert.equal(env.fontFaces[0].descriptors.display, 'swap');
  assert.equal(Object.prototype.toString.call(env.fontFaces[0].source), '[object ArrayBuffer]');
  assert.deepEqual(Buffer.from(env.fontFaces[0].source), fs.readFileSync(path.join(__dirname, '../../web/workbench-engine/src/renderer/src/assets/fonts/Geist-Variable.woff2')));
  env.rerun();
  assert.equal(env.fontFaces.length, 1);
  theme.dispose();
});

test('mount binds roots, aliases and icons; saving applies only after storage confirms', () => {
  const env = environment({values: {'ce.account.theme': 'dark'}});
  const theme = env.api.earlyRead('ce.account.theme'), root = element(), toggle = element(), status = element();
  const unmount = theme.mount({roots: [root], toggles: [toggle], status, aliases: {'--background': '--ce-bg'}});
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.style.getPropertyValue('--background'), 'var(--ce-bg)');
  assert.equal(toggle.getAttribute('aria-label'), '切换到浅色主题');
  assert.match(toggle.innerHTML, /<circle/);
  assert.equal(status.hidden, true);
  env.setFailure({write: new Error('quota denied')});
  toggle.click();
  assert.equal(theme.theme, 'dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(env.data.get('ce.account.theme'), 'dark');
  assert.equal(status.hidden, false);
  assert.match(status.textContent, /quota denied/);
  env.setFailure(null);
  assert.equal(theme.requestTheme('light').ok, true);
  assert.equal(root.dataset.theme, 'light');
  assert.equal(toggle.getAttribute('aria-label'), '切换到深色主题');
  assert.match(toggle.innerHTML, /M20.5/);
  assert.equal(status.hidden, true);
  assert.equal(status.textContent, '');
  unmount();
  toggle.click();
  assert.equal(theme.theme, 'light');
  theme.dispose();
});

test('storage denial stays readable and an explicit retry can recover', () => {
  const env = environment({storageFailure: {handle: new Error('access denied')}});
  const theme = env.api.earlyRead('ce.news.theme'), status = element();
  theme.mount({status});
  assert.equal(theme.theme, 'light');
  assert.match(status.textContent, /access denied/);
  env.setFailure(null);
  assert.equal(theme.requestTheme('dark').ok, true);
  assert.equal(env.data.get('ce.news.theme'), 'dark');
  theme.dispose();
});

test('invalid saved values are reported without overwriting them during early read', () => {
  const env = environment({values: {'ce.progress.theme': 'system'}});
  const theme = env.api.earlyRead('ce.progress.theme');
  assert.equal(theme.theme, 'light');
  assert.match(theme.error.message, /主题偏好无效/);
  assert.equal(env.data.get('ce.progress.theme'), 'system');
  assert.equal(env.accesses.some(([operation]) => operation === 'set'), false);
  assert.throws(() => theme.requestTheme('system'), /主题必须/);
  assert.throws(() => env.api.earlyRead('orca.web.settings.v1'), /未知/);
  theme.dispose();
});

test('trusted context is captured before scoped storage and is never replaced by another account', () => {
  const accesses = [], dataA = new Map([['ce.account.theme', 'dark']]), dataB = new Map();
  const scopeA = {getItem: key => { accesses.push(['A:get', key]); return dataA.get(key) ?? null; }, setItem: (key, value) => dataA.set(key, value)};
  const remoteA = Object.freeze({assertActive() {}, storage: kind => { accesses.push(['A:storage', kind]); return scopeA; }, onInactive: () => () => {}});
  const env = environment({remote: remoteA});
  const theme = env.api.earlyRead('ce.account.theme');
  assert.equal(env.globalReads(), 0);
  assert.equal(theme.theme, 'dark');
  assert.equal(accesses[0][0], 'A:storage');
  env.window.CERemoteContext = Object.freeze({assertActive() {}, storage: () => ({setItem: (key, value) => dataB.set(key, value)})});
  theme.requestTheme('light');
  assert.equal(dataA.get('ce.account.theme'), 'light');
  assert.equal(dataB.size, 0);
  assert.equal(env.globalReads(), 0);
  theme.dispose();
});

test('the actual frozen remote helper isolates account/host scopes without importing a global preference', () => {
  const remoteSource = fs.readFileSync(path.join(__dirname, '../../web/workspace/remote-context.js'), 'utf8');
  const data = new Map([['ce.account.theme', 'dark']]), accessedKeys = [];
  const sharedStorage = {
    getItem(key) { accessedKeys.push(key); return data.get(key) ?? null; },
    setItem: (key, value) => data.set(key, value)
  };
  function page(storageScope) {
    const root = element();
    const window = {
      document: {
        documentElement: root, fonts: {add() {}},
        querySelector: selector => ({content: selector.includes('ce-remote-context') ? 'a'.repeat(32) : storageScope})
      },
      localStorage: sharedStorage, addEventListener() {}, console: {error() {}},
      atob: value => Buffer.from(value, 'base64').toString('binary'),
      FontFace: class {load() { return Promise.resolve(this); }}
    };
    const context = vm.createContext({window});
    vm.runInContext(remoteSource, context);
    vm.runInContext(source, context);
    assert.equal(Object.isFrozen(window.CERemoteContext), true);
    return window.CEUITheme.earlyRead('ce.account.theme');
  }
  const first = page('1'.repeat(64));
  assert.equal(first.theme, 'light');
  first.requestTheme('dark');
  const second = page('2'.repeat(64));
  assert.equal(second.theme, 'light');
  second.requestTheme('light');
  assert.equal(data.get('ce.remote.' + '1'.repeat(64) + '.ce.account.theme'), 'dark');
  assert.equal(data.get('ce.remote.' + '2'.repeat(64) + '.ce.account.theme'), 'light');
  assert.equal(data.get('ce.account.theme'), 'dark');
  assert.equal(accessedKeys.includes('ce.account.theme'), false);
  first.dispose(); second.dispose();
});

test('context markers or a mutable context cannot fall back to global preference storage', () => {
  for (const options of [{meta: true}, {remote: {assertActive() {}, storage() { throw new Error('must not call'); }}}]) {
    const env = environment(options);
    const theme = env.api.earlyRead('ce.product.theme');
    assert.equal(theme.theme, 'light');
    assert(theme.error);
    assert.equal(theme.requestTheme('dark').ok, false);
    assert.equal(env.globalReads(), 0);
    theme.dispose();
  }
});

test('context invalidation stops bindings and preserves the last confirmed theme', () => {
  let inactive, active = true, writes = 0;
  const remote = Object.freeze({
    assertActive() { if (!active) throw new Error('remote_context_inactive'); },
    storage: () => ({getItem: () => 'dark', setItem() { writes++; }}),
    onInactive(callback) { inactive = callback; return () => {}; }
  });
  const env = environment({remote}), theme = env.api.earlyRead('ce-studio-theme'), toggle = element(), status = element();
  theme.mount({toggles: [toggle], status});
  active = false; inactive(); toggle.click();
  assert.equal(writes, 0);
  assert.equal(toggle.listeners.size, 0);
  assert.equal(theme.theme, 'dark');
  assert.match(status.textContent, /上下文已失效/);
  theme.dispose();
});

test('an already inactive context callback cannot interrupt the readable early result', () => {
  const remote = Object.freeze({
    assertActive() { throw new Error('remote_context_inactive'); },
    storage() { throw new Error('must not call'); },
    onInactive(callback) { callback(); return () => {}; }
  });
  const env = environment({remote}), theme = env.api.earlyRead('ce.account.theme');
  assert.equal(theme.theme, 'light');
  assert.equal(env.root.dataset.theme, 'light');
  assert.equal(theme.requestTheme('dark').ok, false);
  assert.equal(env.globalReads(), 0);
});

test('font load failure remains observable while theme and form roots stay usable', async () => {
  const env = environment({fontFailure: true}), theme = env.api.earlyRead('ce.creator.theme'), root = element(), status = element(), seen = [];
  theme.mount({roots: [root], status, onError: error => seen.push(error.message)});
  assert.equal((await env.api.fontReady).ok, false);
  assert.equal(env.root.dataset.ceFontStatus, 'failed');
  assert.match(status.textContent, /CSP font-src denied/);
  assert.equal(seen.length, 1);
  assert.equal(theme.requestTheme('dark').ok, true);
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(env.api.getFontState().status, 'failed');
  assert.match(root.style.getPropertyValue('--ce-font-family'), /Microsoft YaHei/);
  theme.dispose();
});

test('distinct ordinary pages keep the approved independent preference keys', () => {
  const env = environment({values: {'ce.sessions.theme': 'dark'}});
  const sessions = env.api.earlyRead('ce.sessions.theme');
  const progress = env.api.earlyRead('ce.progress.theme');
  progress.requestTheme('light');
  assert.equal(sessions.theme, 'dark');
  assert.equal(env.data.get('ce.sessions.theme'), 'dark');
  assert.equal(env.data.get('ce.progress.theme'), 'light');
  sessions.dispose(); progress.dispose();
});

test('Studio and standalone palette tokens match, with necessary input and focus contrast on three surfaces', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../web/workspace/studio-preview.css'), 'utf8');
  const declarations = new Map([...css.matchAll(/(--ce-[\w-]+):light-dark\((#[a-f0-9]+),(#[a-f0-9]+)\)/g)].map(match => [match[1], [match[2], match[3]]]));
  function luminance(hex) {
    const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  for (const [index, selected] of ['light', 'dark'].entries()) {
    const env = environment({values: {'ce-studio-theme': selected}}), theme = env.api.earlyRead('ce-studio-theme');
    for (const token of ['--ce-bg', '--ce-panel', '--ce-soft', '--ce-hover', '--ce-text', '--ce-sub', '--ce-line', '--ce-input-border', '--ce-ring', '--ce-primary', '--ce-on-primary', '--ce-red', '--ce-green', '--ce-amber', '--ce-blue']) {
      assert.equal(env.root.style.getPropertyValue(token), declarations.get(token)[index], token);
    }
    for (const background of ['--ce-bg', '--ce-soft', '--ce-hover']) {
      for (const token of ['--ce-input-border', '--ce-ring']) assert(contrast(declarations.get(token)[index], declarations.get(background)[index]) >= 3, selected + token + background);
      for (const token of ['--ce-text', '--ce-sub']) assert(contrast(declarations.get(token)[index], declarations.get(background)[index]) >= 4.5, selected + token + background);
    }
    theme.dispose();
  }
  assert.match(css, /font-family:var\(--app-font-family,var\(--ce-font-family\)\)/);
  assert.doesNotMatch(css, /font-weight:\s*(?:550|650)/);
});

test('external head declaration initializes exactly one read-only page controller before mount',()=>{
  const env=environment({pageKey:'ce.news.theme',values:{'ce.news.theme':'dark'}});
  const controller=env.api.pageTheme;assert.equal(controller.theme,'dark');assert.equal(env.root.dataset.theme,'dark');assert.equal(env.accesses.length,1);assert.equal(Object.isFrozen(controller),true);
  assert.equal(Object.getOwnPropertyDescriptor(env.api,'pageTheme').writable,false);
  const toggle=element();controller.mount({toggles:[toggle]});assert.equal(env.accesses.length,1);env.rerun();assert.equal(env.api.pageTheme,controller);assert.equal(env.accesses.length,1);
  toggle.click();assert.equal(controller.theme,'light');assert.equal(env.data.get('ce.news.theme'),'light');controller.dispose();
});

test('head auto-read captures the frozen context, refuses invalid keys and never guesses a fallback store',()=>{
  let active=true;const calls=[];const remote=Object.freeze({assertActive(){if(!active)throw Error('inactive');},storage(kind){calls.push(kind);return{getItem:key=>{calls.push(key);return 'dark';},setItem(){}};},onInactive(){return()=>{};}});
  const env=environment({pageKey:'ce.account.theme',remote});assert.equal(env.api.pageTheme.theme,'dark');assert.equal(env.globalReads(),0);assert.deepEqual(calls,['localStorage','ce.account.theme']);env.api.pageTheme.dispose();
  const invalid=environment({pageKey:'orca.web.settings.v1'});assert.equal(invalid.api.pageTheme,null);assert.equal(invalid.globalReads(),0);assert.equal(invalid.accesses.length,0);assert.match(invalid.errors[0][1].message,/未知/);assert.equal(invalid.root.dataset.theme,'light');
  const pending=environment({pageKey:'ce.creator.theme',meta:true});assert.match(pending.api.pageTheme.error.message,/上下文尚未初始化/);assert.equal(pending.globalReads(),0);pending.api.pageTheme.dispose();
  const legacy=environment();assert.equal(legacy.api.pageTheme,null);assert.equal(legacy.accesses.length,0);const theme=legacy.api.earlyRead('ce.product.theme');assert.equal(theme.theme,'light');theme.dispose();
});

test('font byte decoding failure is observable without registering a fake face or preventing theme reads',async()=>{
  const env=environment({decodeFailure:true,pageKey:'ce.creator.theme'});assert.equal((await env.api.fontReady).ok,false);assert.equal(env.fontFaces.length,0);assert.equal(env.api.pageTheme.theme,'light');const status=element();env.api.pageTheme.mount({status});assert.match(status.textContent,/invalid font payload/);env.api.pageTheme.dispose();
});
