// Studio and news-reader polish in a real browser: failed reads, skip link, settings switcher, hit areas and the 390px news toolbar.
// Run: node tests/e2e/verify_ui_polish.cjs   (CHROME=/path/to/chrome overrides the browser, PW_NO_SANDBOX=1 for containers)
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const web = path.resolve(__dirname, '../../web/workspace');
const origin = 'http://ui-polish.test';
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
const checks = [];
const check = (name, value) => { assert(value, name); checks.push(name); };

/** Serves web/workspace the way the gateway does; `api` answers everything under /api. */
async function serve(context, api) {
  await context.route(`${origin}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) return api(route, url);
    const name = {'/studio': 'studio-preview.html', '/news': 'news-reader.html'}[url.pathname] || url.pathname.replace(/^\/(?:remote\/)?/, '');
    const file = path.join(web, name);
    if (!file.startsWith(web) || !fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({status: 200, contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)});
  });
}

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME, args: ['--no-sandbox']} : {channel: 'msedge', headless: true});
  const errors = [];
  const open = async (width, hash, api) => {
    const context = await browser.newContext({viewport: {width, height: 800}});
    await serve(context, api);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/studio${hash}`);
    return {context, page};
  };

  // A workbench that never answers: the first read fails and the page offers a way forward instead of contradicting itself.
  let reads = 0;
  const down = route => { reads += 1; return route.fulfill({status: 503, contentType: 'application/json', body: '{"error":"unavailable"}'}); };
  {
    const {context, page} = await open(1280, '#home', down);
    await page.locator('.ce-state-panel[data-tone=error]').waitFor();
    const panel = await page.locator('.ce-state-panel').innerText();
    check('a failed first read names the failure and offers a retry', /无法读取项目与事项/.test(panel) && /重试/.test(panel));
    check('the failed first read never claims a draft was kept', !/草稿保留/.test(await page.locator('body').innerText()));
    check('the failed first read does not keep saying it is still reading', !/正在读取真实项目/.test(await page.locator('#studio-content').innerText()));
    const before = reads;
    await page.getByRole('button', {name: '重试'}).click();
    await page.waitForTimeout(400);
    check('the retry button reads again', reads > before);
    await context.close();
  }

  // Keyboard and hit areas.
  {
    const {context, page} = await open(1280, '#settings/sources', down);
    await page.locator('#studio-settings-nav a').first().waitFor();
    await page.keyboard.press('Tab');
    check('the first Tab stop is the skip link', await page.evaluate(() => document.activeElement?.classList.contains('ce-skip')));
    await page.waitForFunction(() => document.activeElement.getBoundingClientRect().top >= 0);
    await page.keyboard.press('Enter');
    check('the skip link moves focus into the main region', await page.evaluate(() => document.activeElement?.matches('main.ce-content')));
    const tabs = await page.$$eval('#studio-settings-nav a', links => links.map(link => [link.textContent, link.getAttribute('aria-current')]));
    check('settings pages offer appearance, account and advanced access, marking the current one', JSON.stringify(tabs) === JSON.stringify([['外观', null], ['账号与设备', null], ['高级接入', 'page']]));
    check('a narrow section tab can be hit just outside its text', await page.evaluate(() => { const link = document.querySelector('#studio-settings-nav a').getBoundingClientRect(); return document.elementFromPoint(link.left - 8, link.top + link.height / 2) === document.querySelector('#studio-settings-nav a'); }));
    const crumb = await page.locator('.ce-crumbs a').first().boundingBox();
    check('the breadcrumb link is at least 32px tall', crumb.height >= 32);
    await page.locator('#studio-settings-nav a', {hasText: '账号与设备'}).click();
    await page.waitForFunction(() => location.hash === '#settings/account');
    await page.waitForFunction(() => document.querySelector('#studio-settings-nav a[aria-current=page]')?.textContent === '账号与设备');
    check('the account tab navigates and takes the current mark', true);
    await context.close();
  }

  // The settings page leaves the sidebar's gear for the settings entry and no longer shows sliders.
  {
    const {context, page} = await open(1280, '#settings/appearance', down);
    await page.locator('.ce-pet-settings').waitFor();
    const note = page.locator('#studio-pet-news-only');
    check('the spider card says in one visible line that it only lives on the news page', await note.isVisible() && /只在新闻页出现/.test(await note.innerText()));
    await context.close();
  }

  // News reader on a phone: nothing is clipped and the pet bar is one row.
  {
    const context = await browser.newContext({viewport: {width: 390, height: 800}});
    await serve(context, route => route.fulfill({status: 200, contentType: 'application/json', body: '{}'}));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/news`);
    await page.locator('#refresh').waitFor();
    const fit = await page.evaluate(() => { const bar = document.querySelector('.toolbar'); return {scroll: bar.scrollWidth, client: bar.clientWidth, refresh: document.getElementById('refresh').getBoundingClientRect().width, label: document.getElementById('refresh').scrollWidth <= document.getElementById('refresh').clientWidth}; });
    check('the news toolbar does not overflow at 390px', fit.scroll <= fit.client);
    check('the collect button shows its whole label', fit.refresh >= 100 && fit.label);
    check('the breadcrumb link back to the overview can be hit well above its text', await page.evaluate(() => { const node = document.querySelector('.workspace-name'), link = node.getBoundingClientRect(); return link.height >= 44 || document.elementFromPoint(link.left + link.width / 2, link.top - 10) === node; }));
    for (const width of [320, 360]) {
      await page.setViewportSize({width, height: 800});
      const fit = await page.evaluate(() => {
        const bar = document.querySelector('.toolbar'), collect = document.getElementById('refresh');
        return bar.scrollWidth <= bar.clientWidth && collect.scrollWidth <= collect.clientWidth;
      });
      check(`the news toolbar and collect label also fit at ${width}px`, fit);
    }
    await page.setViewportSize({width: 320, height: 800});
    await page.evaluate(() => { document.documentElement.style.scrollbarGutter = 'stable'; });
    check('the narrow toolbar also fits with space reserved for a scrollbar', await page.evaluate(() => {
      const bar = document.querySelector('.toolbar'), collect = document.getElementById('refresh');
      return bar.scrollWidth <= bar.clientWidth && collect.scrollWidth <= collect.clientWidth;
    }));
    await context.close();
  }

  await browser.close();
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`verify_ui_polish: ${checks.length} checks passed`);
  for (const name of checks) console.log(' -', name);
})().catch(error => { console.error(error); process.exit(1); });
