// The shortcut wheel's pure parts (news-pet-wheel.js): slot geometry and the deterministic placement beside the pet.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../web/workspace/news-pet-wheel.js'), 'utf8');
const context = vm.createContext({window: {}, document: {}});
vm.runInContext(source, context);
const wheel = context.window.NewsPetWheel;
const plain = value => JSON.parse(JSON.stringify(value));

test('a slot angle puts its button on the ring: 0 is the top and angles grow clockwise', () => {
  const at = angle => plain(wheel.slotPosition(angle, 100));
  assert.deepEqual(at(0), {x: 0, y: -100});
  assert.deepEqual(at(180), {x: 0, y: 100});
  assert.deepEqual(at(90), {x: 100, y: 0});
  assert.deepEqual(at(270), {x: -100, y: 0});
  const two = at(60);
  assert.ok(two.x > 80 && two.y < 0, 'the 2 o\'clock slot is up and to the right');
});

test('the position belongs to the angle, so it never depends on how many slots are shown', () => {
  assert.deepEqual(plain(wheel.slotPosition(120, 100)), plain(wheel.slotPosition(120, 100)));
  for (const angle of [0, 60, 120, 180, 240, 300]) assert.ok(Math.abs(Math.hypot(wheel.slotPosition(angle, 84).x, wheel.slotPosition(angle, 84).y) - 84) < 0.05);
});

test('six buttons never overlap: neighbours stay at least a button plus a gap apart, narrow or wide', () => {
  for (const width of [1440, 390]) {
    const spots = [0, 60, 120, 180, 240, 300].map(angle => plain(wheel.slotPosition(angle, wheel.ringRadius(width))));
    for (let i = 0; i < 6; i++) {
      const a = spots[i], b = spots[(i + 1) % 6];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= wheel.BUTTON + 8, `at ${width}px`);
    }
  }
});

test('narrow screens get a tighter ring', () => {
  assert.equal(wheel.ringRadius(1440), 100);
  assert.equal(wheel.ringRadius(390), 84);
});

test('place() opens toward the side with room, level with the slot, and is deterministic', () => {
  const viewport = {width: 1440, height: 900}, radius = 100, half = radius + wheel.PLATE_PAD;
  const left = plain(wheel.place({left: 28, top: 800, width: 96, height: 60}, viewport, radius));
  assert.equal(left.side, 'right');
  assert.ok(left.x - half >= 28 + 96, 'the plate starts after the pet');
  const right = plain(wheel.place({left: 1300, top: 800, width: 96, height: 60}, viewport, radius));
  assert.equal(right.side, 'left');
  assert.ok(right.x + half <= 1300, 'the plate ends before the pet');
  assert.deepEqual(plain(wheel.place({left: 1300, top: 800, width: 96, height: 60}, viewport, radius)), right);
});

test('place() keeps the whole plate inside the viewport, even in a tiny one', () => {
  const radius = 84, half = radius + wheel.PLATE_PAD;
  for (const viewport of [{width: 390, height: 700}, {width: 320, height: 480}, {width: 1440, height: 900}]) {
    for (const slot of [{left: 0, top: 0, width: 96, height: 60}, {left: viewport.width - 96, top: viewport.height - 60, width: 96, height: 60}, {left: viewport.width / 2, top: 10, width: 96, height: 60}]) {
      const spot = plain(wheel.place(slot, viewport, radius));
      if (viewport.width >= 2 * half + 24) assert.ok(spot.x - half >= 0 && spot.x + half <= viewport.width, JSON.stringify([viewport, slot, spot]));
      if (viewport.height >= 2 * half + 24) assert.ok(spot.y - half >= 0 && spot.y + half <= viewport.height, JSON.stringify([viewport, slot, spot]));
    }
  }
});
