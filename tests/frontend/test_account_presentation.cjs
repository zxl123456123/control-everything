const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('web/workspace/account-device.js', 'utf8');
const css = fs.readFileSync('web/workspace/remote-account.css', 'utf8');
const window = {};
vm.runInNewContext(source, {window, AbortController, FormData});
const api = window.StudioAccountDevice;
const expectedTone = {
  pending: 'warning', provisioned: 'neutral', enrolling: 'warning', connecting: 'warning', online: 'success', offline: 'neutral',
  revoking: 'danger', revoked: 'danger', unbound: 'neutral', authorizing: 'warning', awaiting_local_confirmation: 'warning'
};

test('presentState gives every device state the same tone as the mobile status model', () => {
  for (const [state, tone] of Object.entries(expectedTone)) assert.equal(api.presentState(state).tone, tone, state);
});

test('presentState pairs each state with a label, an icon and a pulse mode, and falls back safely', () => {
  for (const state of Object.keys(expectedTone)) {
    const view = api.presentState(state);
    assert.ok(view.label && view.icon && ['none', 'slow', 'fast'].includes(view.pulse), state);
  }
  for (const state of ['online', 'connecting', 'enrolling']) assert.notEqual(api.presentState(state).pulse, 'none');
  for (const state of ['offline', 'revoked', 'pending']) assert.equal(api.presentState(state).pulse, 'none');
  for (const value of ['', 'nope', undefined, null, 'constructor', '__proto__']) {
    assert.deepEqual({...api.presentState(value)}, {label: '状态未知', tone: 'neutral', icon: 'help', pulse: 'none'});
  }
});

test('every icon used by presentState has a matching CSS mask rule', () => {
  for (const state of Object.keys(expectedTone)) {
    const icon = api.presentState(state).icon;
    assert.ok(css.includes(`[data-icon="${icon}"]`) || css.includes(`[data-icon=${icon}]`), icon);
  }
});

test('staggerDelay steps by 55ms, caps at the eighth row and ignores invalid indexes', () => {
  assert.equal(api.staggerDelay(0), 0);
  assert.equal(api.staggerDelay(1), 55);
  assert.equal(api.staggerDelay(7), 385);
  assert.equal(api.staggerDelay(8), 385);
  assert.equal(api.staggerDelay(500), 385);
  for (const value of [-1, -50, NaN, undefined, null, 'x', Infinity * -1]) assert.equal(api.staggerDelay(value), 0, String(value));
  assert.equal(api.staggerDelay(3, 100, 4), 300);
  assert.equal(api.staggerDelay(9, 100, 4), 300);
});

test('the stylesheet respects reduced motion and keeps type and touch targets at the accessible floor', () => {
  assert.match(css, /@media \(prefers-reduced-motion: ?reduce\)/);
  assert.match(css, /--ca-hit: ?44px/);
  const sizes = [...css.matchAll(/font-size: ?(\d+(?:\.\d+)?)px/g)].map(match => Number(match[1]));
  assert.ok(sizes.length > 5);
  assert.ok(Math.min(...sizes) >= 13, 'no text below 13px');
});
