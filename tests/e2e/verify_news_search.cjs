// The capsule search field: one focus layer (no outline + border stacking), and a floating panel with recents, quick filters and a live count.
// Fixture data only. Run: node tests/e2e/verify_news_search.cjs   (CHROME=/path/to/chrome overrides the browser, PW_NO_SANDBOX=1 for containers)
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const web = path.resolve(__dirname, '../../web/workspace');
const origin = 'http://news-search.test';
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
const checks = [];
const check = (name, value) => { assert(value, name); checks.push(name); };
const hex = n => n.toString(16).padStart(24, '0');
const article = (id, title, source) => ({id: hex(id), title, summary: 'A readable summary.', source_name: source, source_id: source, url: 'https://example.com/' + id, images: [],
  published_at: new Date(Date.now() - 600000).toISOString(), fetched_at: new Date().toISOString(), body_blocks: [{type: 'p', text: 'Body.'}], completeness: 'full_text', content_kind: 'full_text'});
const items = [article(1, 'Rust compiler notes', '少数派'), article(2, 'Rust and the web', '爱范儿'), article(3, 'Quiet gardens', '爱范儿'), article(4, 'Rust async deep dive', '少数派')];
const snapshot = () => ({reader_id: 'fixture', sample: {captured_at: new Date().toISOString(), sources: [], streams: {ai: {items}, hn: {items: []}}}, covers: {items: []}});

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME, args: ['--no-sandbox']} : {channel: 'msedge', headless: true});
  const errors = [], cspErrors = [];
  const open = async (width, options = {}) => {
    const context = await browser.newContext({viewport: {width, height: 800}, ...options});
    await context.route(`${origin}/**`, route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/bootstrap') return route.fulfill({json: {csrf_token: 'fixture'}});
      if (url.pathname === '/api/workspace/news/reader') return route.fulfill({json: snapshot()});
      if (url.pathname.startsWith('/api/')) return route.fulfill({status: 404, contentType: 'application/json', body: '{}'});
      const name = {'/news': 'news-reader.html'}[url.pathname] || url.pathname.replace(/^\//, '');
      const file = path.join(web, name);
      if (!file.startsWith(web) || !fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
      return route.fulfill({status: 200, contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file)});
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /Content Security Policy|violates the following.*directive/i.test(message.text())) cspErrors.push(message.text()); });
    await page.goto(`${origin}/news`);
    await page.waitForFunction(() => window.NewsReader && window.NewsReader.inspect().items >= 4, null, {timeout: 8000});
    return {context, page};
  };
  const panelOpen = page => page.evaluate(() => document.getElementById('search-panel').dataset.open === 'true');
  const visibleRows = page => page.locator('#title-list .title-row:not([hidden])').count();

  const {context, page} = await open(1440);
  check('the panel starts closed and the field is a combobox', await page.evaluate(() => { const input = document.getElementById('search'); return input.getAttribute('role') === 'combobox' && input.getAttribute('aria-expanded') === 'false' && input.getAttribute('aria-controls') === 'search-panel' && document.getElementById('search-panel').inert; }));
  check('focusing by script does not pop the panel over the list', (await page.evaluate(() => { document.getElementById('search').focus(); return document.getElementById('search-panel').dataset.open; })) === 'false');
  await page.locator('#search').click();
  check('a click opens the floating panel', await panelOpen(page) && await page.evaluate(() => document.getElementById('search').getAttribute('aria-expanded') === 'true'));
  check('the panel shows the live count, time chips and source chips with counts', await page.evaluate(() => { const text = document.getElementById('search-panel').innerText.replace(/\s+/g, ' '); return text.includes('当前列表 4 条') && text.includes('今天') && text.includes('全部日期') && text.includes('少数派') && text.includes('爱范儿'); }));
  check('one layer: the field keeps a 1px border and a 1px inset ring, no outline', await page.evaluate(() => { const style = getComputedStyle(document.getElementById('search')); return style.outlineStyle === 'none' && style.borderTopWidth === '1px' && /inset/.test(style.boxShadow); }));
  check('the panel has one border, one shadow and no outline', await page.evaluate(() => { const style = getComputedStyle(document.getElementById('search-panel')); return style.borderTopWidth === '1px' && style.outlineStyle === 'none' && style.boxShadow !== 'none'; }));
  await page.locator('#search-panel [data-key="source:少数派"]').click();
  check('a source chip filters the list and keeps the panel and focus', await visibleRows(page) === 2 && await panelOpen(page) && await page.evaluate(() => document.activeElement.id === 'search' && window.NewsReader.inspect().sourceFilter === '少数派'));
  check('the count in the panel follows the filter', await page.evaluate(() => document.getElementById('search-panel').innerText.replace(/\s+/g, ' ').includes('当前列表 2 条')));
  await page.locator('#search-panel [data-key="reset"]').click();
  check('清除 resets the source filter', await visibleRows(page) === 4);
  await page.keyboard.press('Escape');
  check('Esc closes the panel and keeps focus in the field', !await panelOpen(page) && await page.evaluate(() => document.activeElement.id === 'search'));

  await page.locator('#search').fill('rust');
  check('typing hands the screen back to the results', !await panelOpen(page) && await visibleRows(page) === 3);
  await page.keyboard.press('Enter');
  await page.locator('#search').fill('');
  await page.locator('#search').fill('quiet');
  await page.keyboard.press('Enter');
  await page.locator('#search').click();
  check('Enter records recent searches, newest first', await page.evaluate(() => [...document.querySelectorAll('#search-panel .sr-recent .pick span')].map(node => node.textContent).join(',') === 'quiet,rust'));
  await page.locator('#search-panel [data-key="recent:rust"]').click();
  check('a recent search refills the field and filters', await page.evaluate(() => document.getElementById('search').value === 'rust') && await visibleRows(page) === 3 && !await panelOpen(page));
  await page.locator('#search').click();
  await page.locator('#search-panel [data-key="del:quiet"]').click();
  check('a recent search can be deleted', await page.evaluate(() => [...document.querySelectorAll('#search-panel .sr-recent .pick span')].map(node => node.textContent).join(',') === 'rust'));
  await page.locator('#search-panel [data-key="wipe"]').click();
  check('清除记录 empties the history', await page.evaluate(() => document.querySelector('#search-panel .sr-empty') !== null));
  await page.keyboard.press('Escape');

  await page.locator('#search').fill('');
  await page.locator('#search').focus();
  await page.keyboard.press('ArrowDown');
  check('ArrowDown opens the panel and moves into it', await panelOpen(page) && await page.evaluate(() => document.getElementById('search-panel').contains(document.activeElement)));
  await page.keyboard.press('Escape');
  check('Esc inside the panel returns focus to the field', !await panelOpen(page) && await page.evaluate(() => document.activeElement.id === 'search'));
  await page.locator('#search').click();
  await page.mouse.click(700, 700);
  check('a click outside closes the panel', !await panelOpen(page));
  await page.locator('#search').click();
  await page.keyboard.press('Tab');
  check('Tab moves into the open panel (keyboard reachable)', await panelOpen(page) && await page.evaluate(() => document.getElementById('search-panel').contains(document.activeElement)));
  await page.locator('#date-range').focus();
  check('moving focus outside the field closes the panel', !await panelOpen(page));

  // ---- no outline + border stacking on the other controls (keyboard focus) ----
  const stacked = await page.evaluate(async () => {
    const found = [];
    const ids = ['theme', 'refresh', 'date-range', 'search'];
    for (const id of ids) {
      const node = document.getElementById(id); if (!node) continue;
      node.focus({focusVisible: true});
      const style = getComputedStyle(node), outline = parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== 'none', border = parseFloat(style.borderTopWidth) > 0 && style.borderTopColor !== 'rgba(0, 0, 0, 0)';
      if (outline && border && parseFloat(style.outlineOffset) >= 0) found.push(id);
    }
    return found;
  });
  check('no focused control draws an outer outline around its own border', stacked.length === 0);
  await context.close();

  for (const dark of [false, true]) {
    const {context: narrow, page: small} = await open(390, {colorScheme: dark ? 'dark' : 'light'});
    await small.locator('#search').click();
    await small.waitForTimeout(450);
    const fit = await small.evaluate(() => { const r = document.getElementById('search-panel').getBoundingClientRect(); return {inside: r.left >= 0 && r.right <= innerWidth, page: document.documentElement.scrollWidth <= innerWidth, visible: getComputedStyle(document.getElementById('search-panel')).visibility === 'visible'}; });
    check(`the panel fits a 390px screen (${dark ? 'dark' : 'light'})`, fit.inside && fit.page && fit.visible);
    await narrow.close();
  }
  check('no page errors', errors.length === 0);
  check('no CSP violations', cspErrors.length === 0);
  await browser.close();
  console.log(JSON.stringify({checks: checks.length, ok: true}));
})().catch(error => { console.error(error); process.exit(1); });
