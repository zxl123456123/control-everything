// The wheel's six fixed slots (news-pet-dial.js): which action sits where, and why a slot can be greyed.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../web/workspace/news-pet-dial.js'), 'utf8');
const window = {};
vm.runInContext(source, vm.createContext({window}));
const dial = window.NewsPetDial;
const plain = value => JSON.parse(JSON.stringify(value));

test('there are exactly six slots, in clock order from 12 o\'clock, 60 degrees apart', () => {
  assert.deepEqual(plain(dial.SLOTS.map(slot => [slot.id, slot.angle])), [
    ['workspace', 0], ['news', 60], ['search', 120], ['quiet', 180], ['pet-settings', 240], ['hide-pet', 300],
  ]);
});

test('every slot has a label and an icon, ids are unique, and the data cannot be changed', () => {
  assert.equal(new Set(dial.SLOTS.map(slot => slot.id)).size, 6);
  for (const slot of dial.SLOTS) assert.ok(slot.label && slot.icon, slot.id);
  assert.throws(() => { 'use strict'; dial.SLOTS.push({}); });
  assert.throws(() => { 'use strict'; dial.SLOTS[0].angle = 90; });
});

test('the page actions share the right half and the pet actions the left half', () => {
  const side = group => dial.SLOTS.filter(slot => slot.group === group).map(slot => slot.angle);
  assert.ok(side('page').every(angle => angle >= 0 && angle < 180));
  assert.ok(side('pet').every(angle => angle >= 180 && angle < 360));
});

test('slot() finds a slot by id and says nothing for a stranger', () => {
  assert.equal(dial.slot('quiet').angle, 180);
  assert.equal(dial.slot('collect'), undefined);
});

test('the reasons a slot can be off are short', () => {
  for (const reason of Object.values(dial.REASONS)) assert.ok(reason.length <= 6, reason);
  assert.equal(dial.REASONS.newsOnly, '仅新闻页');
});
