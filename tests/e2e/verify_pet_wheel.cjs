// Behaviour of the shared pet wheel (web/workspace/news-pet-wheel.js) in a real browser, on a stand-alone page.
// Run: node tests/e2e/verify_pet_wheel.cjs   (CHROME=/path/to/chrome overrides the browser, PW_NO_SANDBOX=1 for containers)
const {chromium} = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const checks = [];
const check = (name, value) => { assert(value, name); checks.push(name); };
const icon = 'M4 4h6v6H4z M14 4h6v6h-6z';
// Six fixed slots at 60° steps from 12 o'clock; window.off lists the ids the host greys out for the current page.
const actions = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => `{id:'${id}',label:'动作 ${id}',icon:'${icon}',angle:${i * 60},enabled:!window.off.includes('${id}'),reason:'仅新闻页',run:()=>{window.ran.push('${id}')}}`).join(',');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME, args: ['--no-sandbox']} : {channel: 'msedge', headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<!doctype html><body style="margin:0;height:100vh"><div id="pet" style="position:fixed;left:24px;bottom:24px;width:96px;height:64px"></div><button id="key">key</button><p id="content" style="margin:200px">content</p></body>');
  await page.addScriptTag({path: path.resolve(__dirname, '../../web/workspace/news-pet-wheel.js')});
  await page.evaluate(`window.ran=[];window.off=[];window.w=NewsPetWheel.create({tapTarget:document.getElementById('pet'),anchor:()=>document.getElementById('pet'),actions:()=>[${actions}],ignore:'#key',returnFocus:()=>document.getElementById('key')});document.body.append(window.w.element)`);
  const state = () => page.evaluate(() => ({...window.w.inspect(), ran: window.ran.slice()}));
  const tap = () => page.evaluate(() => document.getElementById('pet').dispatchEvent(new CustomEvent('news-pet-tap', {detail: {double: false}})));
  const settle = () => page.waitForTimeout(700);

  check('a closed wheel does not block native page navigation', await page.locator('.pw-wheel').getAttribute('data-state') === 'closed');
  await tap(); await settle();
  let s = await state();
  check('a pet tap opens the wheel with every action', s.open && s.count === 6);
  check('an open wheel exposes its popup state to native navigation', await page.locator('.pw-wheel').getAttribute('data-state') === 'open');
  const first = await page.evaluate(() => JSON.stringify([window.w.inspect().x, window.w.inspect().y]));
  await tap(); await settle(); await tap(); await settle();
  check('the same anchor gives the same place every time', first === await page.evaluate(() => JSON.stringify([window.w.inspect().x, window.w.inspect().y])));
  const boxes = await page.$$eval('.pw-wheel .pw-item button', nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }));
  check('every button is at least 40px and stays inside the viewport', boxes.every(([l, t, w, h]) => w >= 40 && h >= 40 && l >= 0 && t >= 0 && l + w <= 1440 && t + h <= 900));
  const pet = await page.$eval('#pet', node => { const r = node.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
  check('no button covers the pet', boxes.every(([l, t, w, h]) => l + w <= pet[0] || l >= pet[2] || t + h <= pet[1] || t >= pet[3]));

  await page.click('.pw-wheel button[data-id=b]'); await settle();
  s = await state();
  check('choosing runs the action and closes the wheel', s.ran.join() === 'b' && !s.open);
  check('closing releases native navigation', await page.locator('.pw-wheel').getAttribute('data-state') === 'closed');

  await tap(); await settle(); await page.mouse.click(700, 300); await settle();
  check('a click elsewhere closes the wheel', !(await state()).open);

  await tap(); await settle(); await page.keyboard.press('Escape'); await settle();
  check('Esc closes the wheel', !(await state()).open);

  // Fixed slots (Blender pie-menu rule): the same action sits at the same angle whatever is available.
  const slotAt = () => page.$$eval('.pw-wheel .pw-item button', nodes => Object.fromEntries(nodes.map(node => { const r = node.getBoundingClientRect(); return [node.dataset.id, [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]]; })));
  await tap(); await settle();
  const all = await slotAt();
  check('six slots keep their ids in clockwise order', (await state()).ids.join() === 'a,b,c,d,e,f');
  const spots = Object.values(all), cx = spots.reduce((sum, [x]) => sum + x, 0) / 6, cy = spots.reduce((sum, [, y]) => sum + y, 0) / 6;
  const angles = spots.map(([x, y]) => Math.round(((Math.atan2(x - cx, cy - y) * 180 / Math.PI) + 360) % 360));
  check('the slots sit at 0°, 60° … 300° clockwise from twelve o\'clock', angles.every((angle, i) => Math.abs(angle - i * 60) <= 2 || Math.abs(angle - i * 60) >= 358));
  await page.keyboard.press('Escape'); await settle();
  await page.evaluate(() => { window.off = ['b', 'e']; }); await tap(); await settle();
  const greyed = await slotAt();
  check('greying slots moves nothing: every slot keeps its place (±2px, a hovered button scales)', Object.keys(all).every(id => Math.abs(all[id][0] - greyed[id][0]) <= 2 && Math.abs(all[id][1] - greyed[id][1]) <= 2));
  check('greyed slots stay in the ring, marked aria-disabled with their reason', await page.$$eval('.pw-wheel button[aria-disabled=true]', nodes => nodes.map(node => node.dataset.id).join() === 'b,e' && nodes.every(node => node.getAttribute('aria-label').endsWith('，仅新闻页'))));
  await page.click('.pw-wheel button[data-id=b]', {force: true}); await settle();
  s = await state();
  check('choosing a greyed slot does nothing and keeps the wheel open', s.open && s.ran.join() === 'b');
  await page.hover('.pw-wheel button[data-id=e]');
  check('hovering a greyed slot names it and says why', (await state()).label === '动作 e' && (await state()).reason === '仅新闻页');
  await page.$eval('.pw-wheel button[data-id=a]', node => node.focus()); await page.keyboard.press('3'); await settle();
  s = await state();
  check('a number key inside the open wheel runs that slot and closes it', s.ran.join() === 'b,c' && !s.open);
  await tap(); await settle(); await page.$eval('.pw-wheel button[data-id=a]', node => node.focus()); await page.keyboard.press('5'); await settle();
  s = await state();
  check('a number key on a greyed slot is refused in place', s.open && s.ran.join() === 'b,c');
  await page.keyboard.press('Escape'); await settle();
  await page.evaluate(() => { window.off = []; });

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
  await page.keyboard.press('Escape'); await settle();
  check('Esc from the keyboard path gives focus back to the trigger', !(await state()).open && await page.evaluate(() => document.activeElement.id === 'key'));

  const duration = () => page.evaluate(() => getComputedStyle(document.querySelector('.pw-item')).transitionDuration);
  await page.emulateMedia({reducedMotion: 'reduce'}); await tap(); await settle();
  check('reduced motion shortens every transition to a fade', /^0\.12s/.test(await duration()));
  await tap(); await settle();

  await page.setViewportSize({width: 390, height: 780}); await tap(); await settle();
  const narrow = await page.$$eval('.pw-wheel .pw-item button', nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, r.width]; }));
  check('on a 390px screen the buttons stay on screen and at least 40px', narrow.every(([l, t, r, b, w]) => l >= 0 && t >= 0 && r <= 390 && b <= 780 && w >= 40));

  // Studio lives in a ShadowRoot; document listeners receive a retargeted event target.
  await page.evaluate(() => window.w.destroy());
  await page.setViewportSize({width: 900, height: 900});
  await page.setContent('<!doctype html><body><div id="studio-host"></div></body>');
  await page.evaluate(css => {
    const shadow = document.getElementById('studio-host').attachShadow({mode: 'open'});
    const style = document.createElement('style'); style.textContent = css; shadow.append(style);
    const root = document.createElement('section'); root.id = 'ce-studio';
    root.innerHTML = '<main class="ce-content"><div id="shadow-pet" style="position:fixed;right:24px;bottom:24px;width:96px;height:64px"></div><button id="shadow-key">宠物转盘</button></main>';
    shadow.append(root);
  }, fs.readFileSync(path.resolve(__dirname, '../../web/workspace/studio-preview.css'), 'utf8'));
  await page.evaluate(`window.ran=[];window.off=[];window.w=NewsPetWheel.create({tapTarget:document.getElementById('studio-host').shadowRoot.querySelector('#shadow-pet'),anchor:()=>document.getElementById('studio-host').shadowRoot.querySelector('#shadow-pet'),actions:()=>[${actions}],ignore:'#shadow-key',returnFocus:()=>document.getElementById('studio-host').shadowRoot.querySelector('#shadow-key')});document.getElementById('studio-host').shadowRoot.querySelector('#shadow-key').addEventListener('click',event=>window.w.toggle(event.detail===0))`);
  const shadowKey = page.locator('#shadow-key');
  await shadowKey.click(); await settle();
  check('a trigger inside the Studio shadow opens the wheel', (await state()).open);
  await shadowKey.focus();
  check('focusing a shadow trigger does not close the wheel', (await state()).open);
  await shadowKey.click(); await settle();
  check('clicking the shadow trigger again closes the wheel', !(await state()).open);
  await shadowKey.focus(); await page.keyboard.press('Enter'); await settle();
  check('keyboard opening from a shadow trigger focuses the first action', (await state()).open && await page.evaluate(() => document.activeElement.dataset.id === 'a'));
  await page.keyboard.press('Escape'); await settle();
  check('Esc returns focus to the original shadow trigger', !(await state()).open && await page.evaluate(() => document.getElementById('studio-host').shadowRoot.activeElement.id === 'shadow-key'));
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { delete document.documentElement.dataset.theme; document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.classList.toggle('light', theme === 'light'); }, theme);
    await page.waitForFunction(theme => document.querySelector('.pw-wheel').dataset.theme === theme, theme);
    check(`the wheel follows the native ${theme} document class`, await page.$eval('.pw-wheel', node => node.dataset.theme) === theme);
  }
  await page.evaluate(() => window.w.destroy());
  check('no runtime errors', errors.length === 0);
  await browser.close();
  console.log(JSON.stringify({checks: checks.length, ok: true}));
})().catch(error => { console.error(error); process.exit(1); });
