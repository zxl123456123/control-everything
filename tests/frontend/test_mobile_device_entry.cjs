'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
function fixture(origin, clipboard, returnHash = '#home', remote = false) {
  const elements = [];
  const element = tag => {
    const node = { tagName: tag, children: [], textContent: '', value: '', listeners: {},
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute(name, value) { this[name] = value; },
      removeAttribute(name) { delete this[name]; },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      removeEventListener(name) { delete this.listeners[name]; },
      focus() { this.focused = true; }, select() { this.selected = true; } };
    elements.push(node); return node;
  };
  const accountMounts = [], accountDisposals = [];
  const window = { CERemoteContext: remote ? { context: 'fixture' } : null, StudioAccountDevice: { mount(container, options) { accountMounts.push({ container, options }); return () => accountDisposals.push(options); } }, location: new URL(origin + '/workbench/web-index.html?token=private#project/p/tasks') };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/mobile-device-entry.js'), 'utf8'),
    { window, document: { createElement: element }, navigator: { clipboard }, URL });
  const container = element('main');
  const dispose = window.StudioMobileEntry.mount(container, { returnHash });
  return { elements, dispose, accountMounts, accountDisposals, input: elements.find(n => n.tagName === 'input'),
    portal:value=>accountMounts[0].options.onPortal(value),
    copy: () => elements.find(n => n.tagName === 'button').listeners.click(),
    status: elements.find(n => n.role === 'status'), text: () => elements.map(n => n.textContent).join('\n') };
}
test('local phone access waits for its configured account portal without exposing a localhost address', () => {
  const f = fixture('https://example.test:8443', undefined, '#project/p/review');
  assert.equal(f.input.value, '');
  assert.ok(f.elements.some(n => n.href === '#project/p/review' && n.textContent === '返回原项目'));
  assert.equal(f.elements.filter(node => node.tagName === 'h1').length, 0);
  const guide=f.elements.find(n=>n.tagName==='details'); assert.equal(guide.open,undefined);assert.equal(guide.hidden,true);
  assert.equal(guide.children[0].textContent,'手机访问');
  assert.equal(f.elements.filter(n=>n.tagName==='h2').length,0);
  assert.equal(f.accountMounts.length, 1);
  assert.deepEqual(f.accountMounts[0].options.mode, 'local');
  assert.equal(f.accountMounts[0].options.returnHash, '#project/p/review');
  assert.doesNotMatch(f.text(), /0 台|已连接|公网可达|private|下载|配对码/);
  assert.equal(f.elements.filter(n => n.tagName === 'button').length, 1);
  assert.equal(f.elements.find(n=>n.tagName==='button').disabled,true);
  assert.ok(f.input.readOnly);
  f.portal('https://portal.example.test/remote');
  assert.equal(guide.hidden,false);assert.equal(f.input.value,'https://portal.example.test/remote');
  const open=f.elements.find(n=>n.textContent==='网页登录 / 注册');assert.equal(open.href,f.input.value);assert.equal(open.target,'_blank');assert.equal(open.rel,'noopener noreferrer');
});
for (const host of ['localhost', 'app.localhost', '127.0.0.1', '127.0.0.2', '[::1]']) {
  test('does not offer loopback as a phone portal: ' + host, () => {
    const f = fixture('http://' + host + ':8772');
    f.portal('http://'+host+':8772/remote');
    assert.equal(f.input.value,'');assert.equal(f.elements.find(n=>n.tagName==='details').hidden,true);
    assert.ok(f.elements.some(n => n.href === '#home' && n.textContent === '返回项目总览'));
  });
}
test('reports copy success only after the receiver-bound clipboard call resolves', async () => {
  let resolve; const clipboard = { writeText(value) { assert.equal(this, clipboard); assert.equal(value, 'https://portal.example.test/remote'); return new Promise(done => resolve = done); } };
  const f = fixture('https://example.test', clipboard);f.portal('https://portal.example.test/remote'); const pending = f.copy();
  assert.doesNotMatch(f.status.textContent, /已复制/); resolve(); await pending;
  assert.equal(f.status.textContent, '地址已复制');
});
for (const clipboard of [undefined, { writeText: async () => { throw new Error('denied'); } }]) {
  test('copy failure leaves a selected address and actionable feedback', async () => {
    const f = fixture('https://example.test', clipboard);f.portal('https://portal.example.test/remote'); await f.copy();
    assert.match(f.status.textContent, /手动复制/); assert.ok(f.input.focused && f.input.selected);
  });
}
test('dispose prevents late clipboard feedback and removes its event handler', async () => {
  let resolve; const f = fixture('https://example.test', { writeText: () => new Promise(done => resolve = done) });
  f.portal('https://portal.example.test/remote');
  const pending = f.copy(); f.dispose(); const before = f.status.textContent;
  resolve(); await pending; assert.equal(f.status.textContent, before);
  assert.equal(f.elements.find(n => n.tagName === 'button').listeners.click, undefined);
});

test('remote management is mounted inline and disposed with its host', () => {
  const f = fixture('https://example.test', undefined, '#home', true);
  assert.equal(f.accountMounts[0].options.mode, 'remote');
  assert.equal(f.input.value,'https://example.test/remote');
  assert.ok(f.elements.some(node => node.children.includes(f.accountMounts[0].container)));
  assert.ok(!f.elements.some(node => node.href === '/remote' || node.href === '/desktop'));
  f.dispose(); assert.equal(f.accountDisposals.length, 1);
});

test('copy waits once, exposes busy semantics and permits retry after rejection', async () => {
  let reject,calls=0;const f=fixture('https://example.test',{writeText(){calls++;return new Promise((_,fail)=>{reject=fail;});}});
  f.portal('https://portal.example.test/remote');
  const button=f.elements.find(n=>n.tagName==='button');const first=f.copy();await f.copy();assert.equal(calls,1);assert.equal(button.disabled,true);assert.equal(button['aria-busy'],'true');
  reject(new Error('denied'));await first;assert.equal(button.disabled,false);assert.equal(button['aria-busy'],'false');assert.ok(f.input.selected);
});

test('portal removal or replacement rejects old copy feedback and does not disclose credential-bearing URLs',async()=>{
  let resolve;const f=fixture('http://127.0.0.1:8772',{writeText:()=>new Promise(done=>resolve=done)});
  f.portal('https://first.example.test/remote');const pending=f.copy();f.portal('https://second.example.test/remote');resolve();await pending;
  assert.equal(f.status.textContent,'');assert.equal(f.input.value,'https://second.example.test/remote');
  for(const invalid of ['javascript:alert(1)','https://name:synthetic@portal.example.test/remote','https://portal.example.test/remote?token=synthetic','https://portal.example.test/remote#token','https://portal.example.test/studio','']){
    f.portal(invalid);assert.equal(f.input.value,'');assert.equal(f.elements.find(n=>n.tagName==='details').hidden,true);
    assert.equal(f.elements.find(n=>n.textContent==='网页登录 / 注册').href,undefined);
  }
  f.dispose();f.portal('https://late.example.test/remote');assert.equal(f.input.value,'');
});
