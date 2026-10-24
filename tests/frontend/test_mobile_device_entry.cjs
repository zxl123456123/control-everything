'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
function fixture(origin, clipboard, returnHash = '#home') {
  const elements = [];
  const element = tag => {
    const node = { tagName: tag, children: [], textContent: '', value: '', listeners: {},
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute(name, value) { this[name] = value; },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      removeEventListener(name) { delete this.listeners[name]; },
      focus() { this.focused = true; }, select() { this.selected = true; } };
    elements.push(node); return node;
  };
  const window = { location: new URL(origin + '/workbench/web-index.html?token=private#project/p/tasks') };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../web/workspace/mobile-device-entry.js'), 'utf8'),
    { window, document: { createElement: element }, navigator: { clipboard }, URL });
  const container = element('main');
  const dispose = window.StudioMobileEntry.mount(container, { returnHash });
  return { elements, dispose, input: elements.find(n => n.tagName === 'input'),
    copy: () => elements.find(n => n.tagName === 'button').listeners.click(),
    status: elements.find(n => n.role === 'status'), text: () => elements.map(n => n.textContent).join('\n') };
}
test('uses only origin and explains browser access and unconfigured capabilities', () => {
  const f = fixture('https://example.test:8443', undefined, '#project/p/review');
  assert.equal(f.input.value, 'https://example.test:8443/studio');
  assert.ok(f.elements.some(n => n.href === '#project/p/review' && n.textContent === '返回原项目'));
  assert.match(f.text(), /Safari/); assert.match(f.text(), /尚未接入/);
  assert.match(f.text(), /平台账号登录不等于电脑授权/);
  assert.match(f.text(), /iPhone 安装与真实登录尚未验证/);
  assert.match(f.text(), /配置自建身份服务并重新构建后验证/);
  assert.match(f.text(), /确认手机可访问/);
  assert.doesNotMatch(f.text(), /0 台|已连接|公网可达|private|下载|配对码/);
  assert.equal(f.elements.filter(n => n.tagName === 'button').length, 1);
  assert.ok(f.input.readOnly);
});
for (const host of ['localhost', 'app.localhost', '127.0.0.1', '127.0.0.2', '[::1]']) {
  test('warns that loopback points at the phone itself: ' + host, () => {
    const f = fixture('http://' + host + ':8772');
    assert.match(f.text(), /指向手机自身/);
    assert.ok(f.elements.some(n => n.href === '#home' && n.textContent === '返回项目总览'));
  });
}
test('reports copy success only after the receiver-bound clipboard call resolves', async () => {
  let resolve; const clipboard = { writeText(value) { assert.equal(this, clipboard); assert.equal(value, 'https://example.test/studio'); return new Promise(done => resolve = done); } };
  const f = fixture('https://example.test', clipboard); const pending = f.copy();
  assert.doesNotMatch(f.status.textContent, /已复制/); resolve(); await pending;
  assert.equal(f.status.textContent, '地址已复制');
});
for (const clipboard of [undefined, { writeText: async () => { throw new Error('denied'); } }]) {
  test('copy failure leaves a selected address and actionable feedback', async () => {
    const f = fixture('https://example.test', clipboard); await f.copy();
    assert.match(f.status.textContent, /手动复制/); assert.ok(f.input.focused && f.input.selected);
  });
}
test('dispose prevents late clipboard feedback and removes its event handler', async () => {
  let resolve; const f = fixture('https://example.test', { writeText: () => new Promise(done => resolve = done) });
  const pending = f.copy(); f.dispose(); const before = f.status.textContent;
  resolve(); await pending; assert.equal(f.status.textContent, before);
  assert.equal(f.elements.find(n => n.tagName === 'button').listeners.click, undefined);
});
