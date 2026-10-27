// Behaviour of the shared pet wheel (web/workspace/news-pet-wheel.js) in a real browser, on a stand-alone page.
// Run: node tests/e2e/verify_pet_wheel.cjs   (CHROME=/path/to/chrome overrides the browser, PW_NO_SANDBOX=1 for containers)
const {chromium} = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');

const checks = [];
const check = (name, value) => { assert(value, name); checks.push(name); };
const icon = 'M4 4h6v6H4z M14 4h6v6h-6z';
const actions = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => `{id:'${id}',label:'动作 ${id}',icon:'${icon}',run:()=>{window.ran.push('${id}')}}`).join(',');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME, args: ['--no-sandbox']} : {channel: 'msedge', headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<!doctype html><body style="margin:0;height:100vh"><div id="pet" style="position:fixed;left:24px;bottom:24px;width:96px;height:64px"></div><button id="key">key</button><p id="content" style="margin:200px">content</p></body>');
  await page.addScriptTag({path: path.resolve(__dirname, '../../web/workspace/news-pet-wheel.js')});
  await page.evaluate(`window.ran=[];window.pins=[];window.w=NewsPetWheel.create({tapTarget:document.getElementById('pet'),anchor:()=>document.getElementById('pet'),actions:()=>[${actions}],ignore:'#key',returnFocus:()=>document.getElementById('key'),onPinChange:value=>{window.pins.push(value);window.w.setPinned(value)}});document.body.append(window.w.element)`);
  const state = () => page.evaluate(() => ({...window.w.inspect(), ran: window.ran.slice(), pins: window.pins.slice()}));
  const tap = () => page.evaluate(() => document.getElementById('pet').dispatchEvent(new CustomEvent('news-pet-tap', {detail: {double: false}})));
  const settle = () => page.waitForTimeout(700);

  await tap(); await settle();
  let s = await state();
  check('a pet tap opens the wheel with every action', s.open && s.count === 6);
  const first = await page.evaluate(() => JSON.stringify([window.w.inspect().x, window.w.inspect().y]));
  await tap(); await settle(); await tap(); await settle();
  check('the same anchor gives the same place every time', first === await page.evaluate(() => JSON.stringify([window.w.inspect().x, window.w.inspect().y])));
  const boxes = await page.$$eval('.pw-wheel .pw-item button', nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }));
  check('every button is at least 40px and stays inside the viewport', boxes.every(([l, t, w, h]) => w >= 40 && h >= 40 && l >= 0 && t >= 0 && l + w <= 1440 && t + h <= 900));
  const pet = await page.$eval('#pet', node => { const r = node.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
  check('no button covers the pet', boxes.every(([l, t, w, h]) => l + w <= pet[0] || l >= pet[2] || t + h <= pet[1] || t >= pet[3]));

  await page.click('.pw-wheel button[data-id=b]'); await settle();
  s = await state();
  check('choosing runs the action and closes an unpinned wheel', s.ran.join() === 'b' && !s.open);

  await tap(); await settle(); await page.mouse.click(700, 300); await settle();
  check('a click elsewhere closes an unpinned wheel', !(await state()).open);

  await tap(); await settle(); await page.keyboard.press('Escape'); await settle();
  check('Esc closes the wheel', !(await state()).open);

  await tap(); await settle(); await page.click('.pw-pin'); await settle();
  s = await state();
  check('the pin switch pins the wheel through the host', s.pinned && s.pins.join() === 'true' && await page.$eval('.pw-pin', node => node.getAttribute('aria-checked')) === 'true');
  await page.click('.pw-wheel button[data-id=c]'); await settle();
  check('a pinned wheel stays open after an action', (await state()).open && (await state()).ran.join() === 'b,c');
  await page.mouse.click(700, 300); await settle();
  check('a pinned wheel ignores clicks elsewhere', (await state()).open);
  check('a pinned wheel never blocks the content under it (empty ring is click-through)', await page.evaluate(() => { const r = window.w.element.getBoundingClientRect(); const plate = document.querySelector('.pw-plate'); return getComputedStyle(plate).pointerEvents === 'none' && getComputedStyle(window.w.element).pointerEvents === 'none' && r.width === 0; }));
  const pinnedSpot = JSON.stringify([(await state()).x, (await state()).y]);
  check('a pinned wheel is a rail beside the pet, not the ring', await page.evaluate(() => window.w.element.dataset.layout === 'rail'));
  check('an open rail tells the page which edge it hugs (html[data-pw-rail])', await page.evaluate(() => ['left', 'right'].includes(document.documentElement.dataset.pwRail)));
  await page.keyboard.press('Escape'); await settle();
  check('and the gutter hint goes away when the rail collapses', await page.evaluate(() => !document.documentElement.dataset.pwRail));
  s = await state();
  check('Esc collapses a pinned wheel without unpinning it', !s.open && s.pinned);
  await tap(); await settle();
  check('the pinned wheel reopens at the same spot', JSON.stringify([(await state()).x, (await state()).y]) === pinnedSpot);
  await page.click('.pw-pin'); await settle();
  check('unpinning clears the gutter hint', await page.evaluate(() => !document.documentElement.dataset.pwRail));
  check('unpinning restores the click-outside close', !(await state()).pinned && (await state()).pins.join() === 'true,false');
  await page.mouse.click(700, 300); await settle();
  check('and the wheel closes on an outside click again', !(await state()).open);

  // The pet is hit-tested by the engine on pointerup, so the press that closes the wheel and the tap that follows are one gesture.
  await tap(); await settle();
  await page.mouse.move(700, 300); await page.mouse.down(); await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 60)));
  await tap(); await page.mouse.up(); await settle();
  check('pressing the pet while the wheel is open closes it and does not reopen it', !(await state()).open);

  await tap(); await settle(); await page.keyboard.press('ArrowRight'); await page.evaluate(() => window.w.close());
  await page.click('#key'); await page.evaluate(() => window.w.open(true)); await settle();
  check('keyboard open puts focus on the first action', await page.evaluate(() => document.activeElement.dataset.id === 'a'));
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('End');
  check('arrow and End keys move between actions', await page.evaluate(() => document.activeElement.dataset.id === 'f'));
  await page.keyboard.press('Tab');
  check('Tab after the last action reaches the pin switch', await page.evaluate(() => document.activeElement.classList.contains('pw-pin')));
  await page.keyboard.press('Escape'); await settle();
  check('Esc from the keyboard path gives focus back to the trigger', !(await state()).open && await page.evaluate(() => document.activeElement.id === 'key'));

  const duration = () => page.evaluate(() => getComputedStyle(document.querySelector('.pw-item')).transitionDuration);
  await page.emulateMedia({reducedMotion: 'reduce'}); await tap(); await settle();
  check('reduced motion shortens every transition to a fade', /^0\.12s/.test(await duration()));
  await tap(); await settle();

  await page.setViewportSize({width: 390, height: 780}); await tap(); await settle();
  const narrow = await page.$$eval('.pw-wheel .pw-item button', nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, r.width]; }));
  check('on a 390px screen the buttons stay on screen and at least 40px', narrow.every(([l, t, r, b, w]) => l >= 0 && t >= 0 && r <= 390 && b <= 780 && w >= 40));
  check('no runtime errors', errors.length === 0);
  await browser.close();
  console.log(JSON.stringify({checks: checks.length, ok: true}));
})().catch(error => { console.error(error); process.exit(1); });
