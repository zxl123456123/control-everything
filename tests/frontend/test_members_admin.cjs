// Admin member console (studio-members-admin.js): rendering, admin gating, confirmed writes with CSRF, cleanup.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'web/workspace/studio-members-admin.js'), 'utf8');
const tick = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };
const now = Math.floor(Date.now() / 1000);
const ME = 'sub-admin', BOB = 'sub-bob', EVE = 'sub-eve';
const device = (id, state, name = '办公室电脑') => ({ device_id: id.repeat(24).slice(0, 24), name, state, generation: 1, last_seen: now - 90, cleanup_failed: false });
const roster = () => ({ items: [
  { sub: ME, name: '林晓', membership: 'active', admin: true, sessions: 1, last_active: now - 5, devices: [device('a', 'online', 'MacBook')] },
  { sub: BOB, name: 'Bob <b>Chen</b>', membership: 'active', admin: false, sessions: 0, last_active: now - 7200, devices: [device('b', 'offline'), device('c', 'revoked', '旧电脑')] },
  { sub: EVE, name: null, membership: 'disabled', admin: false, sessions: 0, last_active: null, devices: [] },
], total: 3, limit: 25, offset: 0, names_available: true });

async function fixture(t, { admin = true, rosterStatus = 200, sessionStatus = 200, confirm = true } = {}) {
  const { Window } = await import(pathToFileURL(path.join(root, 'web/workbench-engine/node_modules/happy-dom/lib/index.js')).href);
  const w = new Window({ url: 'http://fixture.test/studio#settings/members', settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const host = w.document.createElement('div'); w.document.body.append(host);
  const calls = [], confirms = [];
  const state = { revoked: new Set(), disabled: false };
  w.CEUIDialog = { create() { return { async confirm(options) { confirms.push(options); return confirm; }, dispose() {} }; } };
  w.fetch = async (url, options = {}) => {
    const headers = options.headers || {};
    calls.push({ url, method: options.method || 'GET', csrf: headers['X-CE-CSRF'], body: options.body && JSON.parse(options.body), signal: options.signal });
    const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });
    if (url === '/remote/api/session') return reply(sessionStatus, { csrf: 'csrf-token-1', admin, account: { sub: ME }, membership: 'active', device: { state: 'online' } });
    if (url.startsWith('/remote/api/admin/roster')) {
      if (rosterStatus !== 200) return reply(rosterStatus, { error: rosterStatus === 403 ? 'admin_required' : 'unavailable' });
      const value = roster();
      if (state.disabled) value.items[1].membership = 'disabled';
      if (state.revoked.has('b'.repeat(24))) value.items[1].devices[0].state = 'revoked';
      return reply(200, value);
    }
    if (url === '/remote/api/admin/members/status') { state.disabled = JSON.parse(options.body).status === 'disabled'; return reply(200, { sub: BOB, membership: JSON.parse(options.body).status }); }
    if (/^\/remote\/api\/devices\/.+\/revoke$/.test(url)) { state.revoked.add(url.split('/')[4]); return reply(200, { state: 'revoked' }); }
    if (url === '/remote/api/invitations') return reply(200, { invitation: 'INV-1234' });
    throw new Error('unexpected ' + url);
  };
  w.eval(source);
  t.after(() => w.close());
  return { w, host, calls, confirms, state, mount: () => w.StudioMembersAdmin.mount(host),
    q: sel => host.querySelector(sel), qa: sel => [...host.querySelectorAll(sel)],
    click: async sel => { host.querySelector(sel).click(); await tick(); } };
}

test('probe is true only for an admin session and never throws', async t => {
  assert.equal(await (await fixture(t)).w.StudioMembersAdmin.probe(), true);
  assert.equal(await (await fixture(t, { admin: false })).w.StudioMembersAdmin.probe(), false);
  assert.equal(await (await fixture(t, { sessionStatus: 401 })).w.StudioMembersAdmin.probe(), false);
  const f = await fixture(t); f.w.fetch = async () => { throw new Error('offline'); };
  assert.equal(await f.w.StudioMembersAdmin.probe(), false);
});

test('renders the roster with escaped names, status chips, device state and no secrets', async t => {
  const f = await fixture(t); f.mount(); await tick();
  assert.deepEqual(f.calls.map(c => c.url), ['/remote/api/session', '/remote/api/admin/roster?limit=25&offset=0']);
  assert.equal(f.calls[1].csrf, 'csrf-token-1');
  assert.equal(f.q('[data-node="summary"]').textContent, '共 3 位成员 · 1 台电脑在线');
  const rows = f.qa('.ce-mem-item');
  assert.equal(rows.length, 3);
  assert.match(rows[0].textContent, /林晓.*管理员.*已启用.*你.*MacBook.*在线/s);
  assert.match(rows[1].textContent, /Bob <b>Chen<\/b>.*离线.*共 2 台.*2 小时前/s);
  assert.equal(rows[1].querySelector('strong').children.length, 0, 'names are text, never markup');
  assert.match(rows[2].textContent, /未命名成员.*已停用.*未绑定电脑.*从未活动/s);
  assert.doesNotMatch(f.host.innerHTML, /csrf-token-1|route_proof|token/i);
  assert.equal(f.q('[data-node="list"]').getAttribute('aria-busy'), 'false');
});

test('non-admin sessions and 403 roster replies show a blocked state without roster data', async t => {
  const plain = await fixture(t, { admin: false }); plain.mount(); await tick();
  assert.match(plain.host.textContent, /只有管理员可以管理成员/);
  assert.ok(!plain.calls.some(c => c.url.includes('/admin/')));
  assert.equal(plain.q('[data-action="invite"]').hidden, true);
  const denied = await fixture(t, { rosterStatus: 403 }); denied.mount(); await tick();
  assert.match(denied.host.textContent, /只有管理员可以管理成员/);
  assert.equal(denied.qa('.ce-mem-item').length, 0);
});

test('expired sessions and server errors are reported without leaving a stale list', async t => {
  const expired = await fixture(t, { sessionStatus: 401 }); expired.mount(); await tick();
  assert.match(expired.q('[data-node="notice"]').textContent, /登录已过期/);
  const broken = await fixture(t, { rosterStatus: 500 }); broken.mount(); await tick();
  assert.match(broken.q('[data-node="notice"]').textContent, /请求未成功/);
  assert.equal(broken.qa('.ce-mem-item').length, 0);
});

test('search and status filters narrow the list; disclosure shows devices and hides admin disable', async t => {
  const f = await fixture(t); f.mount(); await tick();
  const input = f.q('[data-node="query"]'); input.value = 'bob'; input.dispatchEvent(new f.w.Event('input')); await tick();
  assert.equal(f.qa('.ce-mem-item').length, 1);
  input.value = ''; input.dispatchEvent(new f.w.Event('input'));
  await f.click('[data-filter="disabled"]');
  assert.deepEqual(f.qa('.ce-mem-item strong').map(n => n.textContent), ['未命名成员']);
  await f.click('[data-filter="all"]');
  await f.click(`[data-action="toggle"][data-sub="${ME}"]`);
  assert.equal(f.q(`[data-action="toggle"][data-sub="${ME}"]`).getAttribute('aria-expanded'), 'true');
  assert.match(f.host.textContent, /管理员账号不能被停用/);
  assert.equal(f.q(`[data-action="status"][data-sub="${ME}"]`), null);
  await f.click(`[data-action="toggle"][data-sub="${BOB}"]`);
  assert.equal(f.qa(`[data-action="revoke"][data-sub="${BOB}"]`).length, 1, 'only live devices can be revoked');
});

test('disabling a member needs confirmation, sends CSRF, and refreshes the roster', async t => {
  const f = await fixture(t, { confirm: false }); f.mount(); await tick();
  await f.click(`[data-action="toggle"][data-sub="${BOB}"]`);
  await f.click(`[data-action="status"][data-sub="${BOB}"]`);
  assert.equal(f.confirms.length, 1); assert.match(f.confirms[0].title, /停用/);
  assert.ok(!f.calls.some(c => c.url.endsWith('/members/status')), 'declined confirmation sends nothing');
  const g = await fixture(t); g.mount(); await tick();
  await g.click(`[data-action="toggle"][data-sub="${BOB}"]`);
  await g.click(`[data-action="status"][data-sub="${BOB}"]`);
  const post = g.calls.find(c => c.url.endsWith('/members/status'));
  assert.deepEqual([post.method, post.csrf, post.body], ['POST', 'csrf-token-1', { sub: BOB, status: 'disabled' }]);
  assert.match(g.q('[data-node="notice"]').textContent, /已停用/);
  assert.equal(g.q(`[data-action="status"][data-sub="${BOB}"]`).dataset.next, 'active', 'row shows restore after the refresh');
  await g.click(`[data-action="status"][data-sub="${BOB}"]`);
  assert.equal(g.confirms.length, 1, 'restoring needs no confirmation');
  assert.deepEqual(g.calls.filter(c => c.url.endsWith('/members/status')).map(c => c.body.status), ['disabled', 'active']);
});

test('revoking a device is confirmed and posts to the device route with CSRF', async t => {
  const f = await fixture(t); f.mount(); await tick();
  await f.click(`[data-action="toggle"][data-sub="${BOB}"]`);
  await f.click('[data-action="revoke"]');
  assert.match(f.confirms[0].message, /立即断开/);
  const post = f.calls.find(c => c.url.endsWith('/revoke'));
  assert.deepEqual([post.method, post.csrf, post.body, post.url], ['POST', 'csrf-token-1', {}, '/remote/api/devices/' + 'b'.repeat(24) + '/revoke']);
  assert.equal(f.qa('[data-action="revoke"]').length, 0, 'revoked device no longer offers revoke');
  assert.match(f.q('[data-node="notice"]').textContent, /电脑已撤销/);
});

test('inviting reuses the invitation endpoint and shows the code', async t => {
  const f = await fixture(t); f.mount(); await tick();
  await f.click('[data-action="invite"]');
  const post = f.calls.find(c => c.url === '/remote/api/invitations');
  assert.deepEqual([post.method, post.csrf], ['POST', 'csrf-token-1']);
  assert.equal(f.q('[data-node="code"]').textContent, 'INV-1234');
  assert.equal(f.q('[data-node="invite"]').hidden, false);
});

test('write errors from the hub surface a readable message', async t => {
  const f = await fixture(t); f.mount(); await tick();
  const original = f.w.fetch;
  f.w.fetch = async (url, options) => url.endsWith('/members/status')
    ? { status: 409, ok: false, json: async () => ({ error: 'cannot_change_admin' }) } : original(url, options);
  await f.click(`[data-action="toggle"][data-sub="${BOB}"]`);
  await f.click(`[data-action="status"][data-sub="${BOB}"]`);
  assert.match(f.q('[data-node="notice"]').textContent, /管理员账号不能被停用/);
});

test('dispose aborts requests, clears the page, and ignores late replies', async t => {
  const f = await fixture(t); const dispose = f.mount(); await tick();
  const signal = f.calls.at(-1).signal;
  dispose();
  assert.equal(signal.aborted, true);
  assert.equal(f.host.innerHTML, '');
  const count = f.calls.length; dispose(); await tick();
  assert.equal(f.calls.length, count);
});

test('Studio shows the tab only for admins and the page carries the packaging entries', async t => {
  const shell = fs.readFileSync(path.join(root, 'web/workspace/studio-shell.js'), 'utf8');
  const w = new (await import(pathToFileURL(path.join(root, 'web/workbench-engine/node_modules/happy-dom/lib/index.js')).href)).Window({ settings: { disableJavaScriptFileLoading: true } });
  w.eval(shell); t.after(() => w.close());
  assert.doesNotMatch(w.StudioShell.renderSettingsTabs('account'), /settings\/members/);
  const tabs = w.StudioShell.renderSettingsTabs('members', { members: true });
  assert.match(tabs, /href="#settings\/members" aria-current="page">成员管理/);
  assert.ok(tabs.indexOf('settings/account') < tabs.indexOf('settings/members') && tabs.indexOf('settings/members') < tabs.indexOf('settings/sources'));
  assert.match(fs.readFileSync(path.join(root, 'web/workspace/studio-preview.html'), 'utf8'), /\/studio-members-admin\.js/);
});
