// Reading view actions: only 已读/收藏/打开原文/复制链接; 归档 is a list-level tidy-up with undo. Fixture data only.
// Run: node tests/e2e/verify_news_reading_actions.cjs   (CHROME=/path/to/chrome overrides the browser, PW_NO_SANDBOX=1 for containers)
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const web = path.resolve(__dirname, '../../web/workspace');
const origin = 'http://news-actions.test';
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
const checks = [];
const check = (name, value) => { assert(value, name); checks.push(name); };
const hex = n => n.toString(16).padStart(24, '0');
const article = (id, title) => ({id: hex(id), title, summary: 'A readable summary.', source_name: '少数派', source_id: 'sspai', url: 'https://example.com/post/' + id, images: [],
  published_at: new Date(Date.now() - 600000).toISOString(), fetched_at: new Date().toISOString(), body_blocks: [{type: 'p', text: 'Body.'}], completeness: 'full_text', content_kind: 'full_text'});
const items = [1, 2, 3].map(n => article(n, '第 ' + n + ' 篇'));
const snapshot = () => ({reader_id: 'fixture', sample: {captured_at: new Date().toISOString(), sources: [], streams: {ai: {items}, hn: {items: []}}}, covers: {items: []}});

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME, args: ['--no-sandbox']} : {channel: 'msedge', headless: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, permissions: ['clipboard-read', 'clipboard-write'].filter(() => false)});
  const errors = [];
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
  await page.goto(`${origin}/news`);
  await page.waitForFunction(() => window.NewsReader && window.NewsReader.inspect().items >= 3, null, {timeout: 8000});
  const rows = () => page.locator('#title-list .title-row:not([hidden])').count();
  const count = view => page.locator(`[data-count="${view}"]`).innerText();

  await page.locator(`.title-row[data-id="${hex(1)}"]`).click();
  await page.waitForFunction(() => !document.getElementById('save-article').disabled);
  const actions = await page.evaluate(() => [...document.querySelectorAll('.article-actions > *')].map(node => node.textContent.trim()));
  check('the reading view offers exactly 已读, 收藏, 打开原文 and 复制链接', actions.join('|') === '标为已读|收藏|打开原文|复制链接');
  check('there is no 归档 control anywhere in the reading view', await page.locator('#archive-article').count() === 0 && !(await page.locator('#reader').innerText()).includes('归档'));
  const link = await page.evaluate(() => { const a = document.getElementById('open-original'); return {href: a.getAttribute('href'), target: a.target, rel: a.rel}; });
  check('打开原文 points at the article in a new tab without opener access', link.href === 'https://example.com/post/1' && link.target === '_blank' && /noopener/.test(link.rel) && /noreferrer/.test(link.rel));
  await page.locator('#copy-link').click();
  await page.waitForFunction(() => /已复制|无法自动复制/.test(document.getElementById('toast-text').textContent));
  check('复制链接 reports its outcome', await page.evaluate(() => !document.getElementById('toast').hidden));
  await page.waitForFunction(() => document.getElementById('toast').hidden, null, {timeout: 7000});
  check('a plain notice fades away by itself', true);
  await page.locator('#save-article').click();
  check('收藏 toggles and is counted in the 收藏 tab', await page.locator('#save-article').getAttribute('aria-pressed') === 'true' && await count('saved') === '1');
  await page.locator('#save-article').click();
  check('取消收藏 reverts it', await page.locator('#save-article').getAttribute('aria-pressed') === 'false' && await count('saved') === '0');
  await page.locator('#mark-read').click();
  check('标为已读 moves the article into 已读 but it stays in 阅读 until archived', await count('read') === '1' && await count('inbox') === '3');

  await page.locator('#back-to-list').click().catch(() => {});
  await page.locator(`.title-row[data-id="${hex(2)}"]`).click();
  await page.locator('#mark-read').click();
  await page.locator('#back-to-list').click().catch(() => {});
  check('归档已读 appears in the list tools, counting only read items', await page.locator('#list-tools').isVisible() && (await page.locator('#list-tools-text').innerText()).startsWith('2 条已读未归档'));
  await page.locator('#bulk-archive').click();
  check('archiving moves every read item at once and the archive count follows', await count('archived') === '2' && await count('inbox') === '1' && await rows() === 1);
  await page.locator('#undo').click();
  check('Undo restores all archived items', await count('archived') === '0' && await count('inbox') === '3');
  await page.locator('#bulk-archive').click();
  await page.locator('[data-view=archived]').click();
  check('the 归档 tab lists them and offers 全部移回阅读', await rows() === 2 && await page.locator('#bulk-archive').innerText() === '全部移回阅读');
  await page.locator('#bulk-archive').click();
  check('全部移回阅读 empties the archive again', await count('archived') === '0');
  await page.locator('[data-view=inbox]').click();
  let tabsWork = true;
  for (const view of ['inbox', 'read', 'saved', 'archived']) { await page.locator(`[data-view=${view}]`).click(); tabsWork = tabsWork && await page.locator(`[data-view=${view}]`).getAttribute('aria-pressed') === 'true'; }
  check('the four list tabs still work', tabsWork);
  check('no page errors', errors.length === 0);
  await browser.close();
  console.log(JSON.stringify({checks: checks.length, ok: true}));
})().catch(error => { console.error(error); process.exit(1); });
