// Optional code-host connection (studio-code-host.js): GitHub-only strip, settings card, dismissal, copy/deep-link, no secrets.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

class Node {
  constructor(tag) {
    this.tag = tag; this.className = ''; this.children = []; this.attrs = {}; this.listeners = {}; this.dataset = {};
    this.textContent = ''; this.hidden = false; this.disabled = false; this.title = ''; this.id = ''; this.href = ''; this.parent = null;
  }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children.length = 0; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  async click() { for (const fn of this.listeners.click || []) await fn(); }
  all(predicate, out = []) { if (predicate(this)) out.push(this); for (const child of this.children) child.all(predicate, out); return out; }
  find(predicate) { return this.all(predicate)[0] || null; }
  get text() { return this.textContent + this.children.map(child => child.text).join(' '); }
}
const byText = text => node => node.textContent === text || node.textContent.startsWith(text);

function setup({unified = false, storageOk = true, clipboard = true} = {}) {
  const store = new Map(), copied = [];
  const storage = storageOk ? {getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => { store.set(key, String(value)); }} : null;
  const window = {};
  const navigator = clipboard === 'fail' ? {clipboard: {writeText: async () => { throw new Error('denied'); }}}
    : clipboard ? {clipboard: {writeText: async text => { copied.push(text); }}} : {};
  const context = vm.createContext({window, document: {createElement: tag => new Node(tag)}, navigator, console, encodeURIComponent});
  window.window = window; context.globalThis = window;
  vm.runInContext(read('web/workspace/studio-code-host.js'), context);
  const calls = [];
  let answer = {project: {provider: 'github'}, tools: {github: {installed: true, authenticated: true, user: 'octocat', host: 'github.com'}}};
  const api = async url => { calls.push(url); if (answer instanceof Error) throw answer; return typeof answer === 'function' ? answer(url) : answer; };
  return {CodeHost: window.StudioCodeHost, store, copied, calls, storage, unified, api, set: value => { answer = value; }};
}
const github = tool => ({project: {provider: 'github'}, tools: {github: {host: 'github.com', installed: true, authenticated: false, user: null, ...tool}}});
const settle = () => new Promise(resolve => setImmediate(resolve));

test('describe covers the three states and keeps non-GitHub projects out', () => {
  const {CodeHost} = setup();
  assert.deepEqual({...CodeHost.describe(github({authenticated: true, user: 'octocat'}))}, {state: 'connected', user: 'octocat'});
  assert.equal(CodeHost.describe(github({})).state, 'signed-out');
  assert.equal(CodeHost.describe(github({installed: false})).state, 'missing');
  assert.equal(CodeHost.describe(github({unavailable: true})).state, 'unknown');
  assert.equal(CodeHost.describe({project: {provider: 'gitlab'}, tools: {github: {installed: true}}}), null);
  assert.equal(CodeHost.describe({project: {provider: null}, tools: {}}), null);
  assert.equal(CodeHost.describe(null), null);
  assert.equal(CodeHost.describe(github({}), {needProject: false}).state, 'signed-out');
});

test('connected GitHub project shows the account name, the scope note and no connect button', async () => {
  const env = setup(), host = new Node('div'); host.hidden = true;
  const strip = env.CodeHost.mountStrip(host, env);
  await strip.show('p1');
  assert.equal(host.hidden, false);
  assert.equal(env.calls[0], '/api/workspace/code-host?project_id=p1');
  const text = host.text;
  assert.match(text, /代码托管（可选）/);
  assert.match(text, /已连接 @octocat/);
  assert.match(text, /只用于 PR、Issue 和检查结果；不连接也能完整使用/);
  assert.equal(host.find(node => node.tag === 'button' && /复制|连接/.test(node.textContent)), null);
  assert.equal(host.find(node => node.tag === 'a'), null);
  assert.ok(host.find(node => node.attrs['aria-label'] === '关闭代码托管提示'));
});

test('signed-out: embedded in Orca the button opens Orca integrations, standalone it copies gh auth login', async () => {
  const embedded = setup({unified: true}); embedded.set(github({}));
  const hostA = new Node('div');
  await embedded.CodeHost.mountStrip(hostA, embedded).show('p1');
  assert.match(hostA.text, /未连接/);
  const link = hostA.find(node => node.tag === 'a');
  assert.equal(link.href, '#settings/integrations');
  assert.equal(link.textContent, '连接');

  const plain = setup(); plain.set(github({}));
  const hostB = new Node('div');
  await plain.CodeHost.mountStrip(hostB, plain).show('p1');
  assert.equal(hostB.find(node => node.tag === 'a'), null);
  const copy = hostB.find(node => node.tag === 'button' && node.textContent === '复制 gh auth login');
  await copy.click();
  assert.deepEqual(plain.copied, ['gh auth login']);
  assert.match(hostB.text, /已复制/);
});

test('copy failure is reported instead of pretending success', async () => {
  const env = setup({clipboard: 'fail'}); env.set(github({}));
  const host = new Node('div');
  await env.CodeHost.mountStrip(host, env).show('p1');
  await host.find(node => node.textContent === '复制 gh auth login').click();
  assert.match(host.text, /无法复制，请手动运行 gh auth login/);
});

test('gh missing says so and offers the install page standalone', async () => {
  const env = setup(); env.set(github({installed: false}));
  const host = new Node('div');
  await env.CodeHost.mountStrip(host, env).show('p1');
  assert.match(host.text, /未安装 gh/);
  const link = host.find(node => node.tag === 'a');
  assert.equal(link.href, 'https://cli.github.com/');
  assert.equal(link.rel, 'noopener noreferrer');
});

test('non-GitHub projects, no project, unknown state and failed reads render nothing', async () => {
  for (const answer of [{project: {provider: 'gitlab'}, tools: {github: {installed: true, authenticated: true, user: 'x'}}}, {project: {provider: null}, tools: {}},
    github({unavailable: true}), new Error('network')]) {
    const env = setup(); env.set(answer);
    const host = new Node('div');
    await env.CodeHost.mountStrip(host, env).show('p1');
    assert.equal(host.hidden, true); assert.equal(host.children.length, 0);
  }
  const env = setup(), host = new Node('div'), strip = env.CodeHost.mountStrip(host, env);
  await strip.show(null);
  assert.equal(env.calls.length, 0);
  await strip.show('p1'); await strip.show(null);
  assert.equal(host.hidden, true);
});

test('dismissal is remembered under its own key and survives a reload', async () => {
  const env = setup(); env.set(github({}));
  const host = new Node('div'), strip = env.CodeHost.mountStrip(host, env);
  await strip.show('p1');
  await host.find(node => node.attrs['aria-label'] === '关闭代码托管提示').click();
  assert.equal(host.hidden, true);
  assert.equal(env.store.get('ce-studio-code-host-dismissed'), '1');
  assert.deepEqual([...env.store.keys()], ['ce-studio-code-host-dismissed'], 'only the Studio key is written, never Orca keys');
  const reloaded = setup(); reloaded.store.set('ce-studio-code-host-dismissed', '1');
  const second = new Node('div'); second.hidden = true;
  await reloaded.CodeHost.mountStrip(second, reloaded).show('p1');
  assert.equal(second.hidden, true);
  assert.equal(reloaded.calls.length, 0, 'a dismissed strip does not even ask the backend');
});

test('dismissal still hides the strip when storage is unavailable', async () => {
  const env = setup({storageOk: false}); env.set(github({}));
  const host = new Node('div');
  await env.CodeHost.mountStrip(host, env).show('p1');
  await host.find(node => node.attrs['aria-label'] === '关闭代码托管提示').click();
  assert.equal(host.hidden, true);
});

test('repeated renders of the same project reuse the answer; a late answer for an old project is dropped', async () => {
  const env = setup(), host = new Node('div'), strip = env.CodeHost.mountStrip(host, env);
  await strip.show('p1'); await strip.show('p1');
  assert.equal(env.calls.length, 1);
  let release;
  env.set(() => new Promise(resolve => { release = () => resolve(github({authenticated: true, user: 'late'})); }));
  const slow = strip.show('p2');
  await settle();
  await strip.show(null);
  release(); await slow; await settle();
  assert.equal(host.hidden, true);
  strip.dispose();
  await strip.show('p3');
  assert.equal(env.calls.length, 2, 'a disposed strip stays silent');
});

test('settings card explains scope and separation, shows the state, copies the command and re-checks on demand', async () => {
  const env = setup(); env.set(github({}));
  const container = new Node('div');
  const dispose = env.CodeHost.mountSettings(container, env);
  assert.match(container.text, /代码托管连接（可选）/);
  assert.match(container.text, /PR、Issue 和检查结果/);
  assert.match(container.text, /只在你的电脑上读取，不会上传/);
  assert.match(container.text, /账号登录（Keycloak）/);
  assert.match(container.text, /成员、设备与邀请/);
  assert.match(container.text, /互不相通/);
  await settle();
  assert.equal(env.calls[0], '/api/workspace/code-host');
  assert.match(container.text, /未连接/);
  assert.equal(container.find(node => node.tag === 'a'), null, 'standalone has no Orca link');
  await container.find(node => node.textContent === '复制 gh auth login').click();
  assert.deepEqual(env.copied, ['gh auth login']);
  env.set(github({authenticated: true, user: 'octocat'}));
  await container.find(node => node.textContent === '重新检测').click(); await settle();
  assert.equal(env.calls[1], '/api/workspace/code-host?refresh=1');
  assert.match(container.text, /已连接 @octocat/);
  assert.equal(container.find(node => node.textContent === '复制 gh auth login'), null, 'no copy button once connected');
  dispose();
  assert.equal(container.children.length, 0);
});

test('settings card inside Orca links to the integrations pane, missing gh and failed reads degrade quietly', async () => {
  const env = setup({unified: true}); env.set(github({installed: false}));
  const container = new Node('div');
  env.CodeHost.mountSettings(container, env); await settle();
  assert.match(container.text, /未安装 gh/);
  assert.equal(container.find(node => node.tag === 'a').href, '#settings/integrations');
  const broken = setup(); broken.set(new Error('offline'));
  const other = new Node('div');
  broken.CodeHost.mountSettings(other, broken); await settle();
  assert.match(other.text, /暂时读取不到/);
  assert.ok(other.find(node => node.textContent === '重新检测' && !node.disabled));
});

test('the module never stores or prints a token and only calls the read-only status route', () => {
  const source = read('web/workspace/studio-code-host.js');
  assert.doesNotMatch(source, /token|password|innerHTML|eval\(|new Function/i);
  assert.deepEqual([...new Set(source.match(/\/api\/[a-z/-]+/g))], ['/api/workspace/code-host']);
  assert.doesNotMatch(source, /method:\s*['"]POST|localStorage\.setItem\([^)]*orca/i);
});

test('styles stay light: no blur, small text only at 13px or above, spring and glide are motion-safe', () => {
  const css = read('web/workspace/studio-preview.css');
  const block = css.slice(css.indexOf('/* Optional code-host connection'));
  assert.ok(block.length > 500);
  assert.doesNotMatch(block, /backdrop-filter|blur\(/);
  for (const size of block.match(/font-size:(\d+)px/g)) assert.ok(Number(size.match(/\d+/)[0]) >= 13, size);
  assert.match(block, /cubic-bezier\(\.34,1\.56,\.64,1\)/);
  assert.match(block, /prefers-reduced-motion:reduce\)\{[^}]*\.ce-code-host\{animation:none\}/);
  assert.match(block, /max-width:760px/);
});

test('wiring: the strip lives outside the page content, settings mount beside the pet settings, scripts are registered everywhere', () => {
  const html = read('web/workspace/studio-preview.html');
  assert.match(html, /<div id="studio-code-host" class="ce-code-host-slot" hidden><\/div>\s*<div id="studio-content"/);
  assert.ok(html.indexOf('/studio-code-host.js') > html.indexOf('/studio-pet-settings.js') && html.indexOf('/studio-code-host.js') < html.indexOf('/studio-preview.js'));
  const studio = read('web/workspace/studio-preview.js');
  assert.match(studio, /StudioCodeHost\?\.mountStrip\(\$\('studio-code-host'\)/);
  assert.match(studio, /codeHostStrip\?\.show\(null\)/);
  assert.match(studio, /codeHostStrip\?\.show\(current\.view === 'project' && chosen && !chosen\.archived \? chosen\.id : null\)/);
  assert.match(studio, /StudioCodeHost\?\.mountSettings\(content/);
  const surface = read('web/workbench-engine/src/renderer/src/web/platform-studio-surface.tsx');
  assert.ok(surface.indexOf("'/studio-code-host.js'") > surface.indexOf("'/studio-pet-settings.js'"));
  for (const file of ['MANIFEST.in', 'tools/packaging/build_assets.py']) assert.match(read(file), /studio-code-host\.js/);
});

test('the account page states that account login and code hosting are separate', () => {
  const source = read('web/workspace/account-device.js');
  assert.match(source, /账号登录用于成员、设备与邀请/);
  assert.match(source, /代码托管连接/);
  assert.match(source, /互不相通/);
});
