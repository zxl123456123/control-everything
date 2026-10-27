// The shortcut wheel's pure parts (news-pet-wheel.js): ring layout and the deterministic placement beside the pet.
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

test('the first button is at the top and the rest follow clockwise at equal angles', () => {
  const spots = plain(wheel.layout(4, 100));
  assert.deepEqual(spots.map(spot => [Math.round(spot.x), Math.round(spot.y)]), [[0, -100], [100, 0], [0, 100], [-100, 0]]);
  const six = plain(wheel.layout(6, 100));
  assert.equal(six.length, 6);
  for (const spot of six) assert.ok(Math.abs(Math.hypot(spot.x, spot.y) - 100) < 0.05);
  assert.deepEqual(plain(wheel.layout(0, 100)), []);
});

test('buttons never overlap: neighbours stay at least a button plus a gap apart for 3 to 6 actions', () => {
  for (let count = 3; count <= 6; count++) for (const width of [1440, 390]) {
    const spots = plain(wheel.layout(count, wheel.ringRadius(width)));
    for (let i = 0; i < count; i++) {
      const a = spots[i], b = spots[(i + 1) % count];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= wheel.BUTTON + 8, `${count} actions at ${width}px`);
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

test('placeRail() runs a pinned rail from the pet towards the middle of the screen, inside the viewport', () => {
  const viewport = {width: 1440, height: 900};
  const corner = plain(wheel.placeRail({left: 1328, top: 780, width: 96, height: 96}, viewport, 6));
  assert.equal(corner.dir, -1, 'a pet in the lower half grows the rail upwards');
  assert.equal(corner.side, 'left', 'names appear towards the page, away from the edge');
  assert.ok(corner.x >= 12 + 34 && corner.x <= viewport.width - 12 - 34 && corner.y - corner.reach >= 12 && corner.y <= viewport.height - 12);
  assert.equal(corner.x, 1376, 'the rail hugs the pet\'s own column, clear of content that ends before it');
  const top = plain(wheel.placeRail({left: 16, top: 20, width: 96, height: 60}, viewport, 4));
  assert.equal(top.dir, 1, 'a pet in the upper half grows the rail downwards');
  assert.equal(top.side, 'right');
  assert.deepEqual(plain(wheel.placeRail({left: 16, top: 20, width: 96, height: 60}, viewport, 4)), top, 'same input, same output');
});

test('placeRail() keeps a tall rail inside a short viewport and a narrow rail width inside a thin one', () => {
  const short = plain(wheel.placeRail({left: 300, top: 300, width: 96, height: 60}, {width: 390, height: 420}, 6));
  assert.ok(short.y - short.reach >= 12 - 1e-6 || short.dir === 1, 'clamped to the top edge when it would overflow');
  const thin = plain(wheel.placeRail({left: 0, top: 500, width: 10, height: 10}, {width: 390, height: 800}, 3));
  assert.ok(thin.x >= 46, 'never pushed off the left edge: ' + thin.x);
});
