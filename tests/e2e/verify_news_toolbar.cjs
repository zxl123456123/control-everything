// News toolbar (segmented channel switch, quiet refresh, one primary action) and the 采集新闻 dialog in a real browser.
// The research API is a fixture here: nothing is collected from the network.
// Run: node tests/e2e/verify_news_toolbar.cjs   (CHROME=/path/to/chrome overrides the browser, PW_NO_SANDBOX=1 for containers)
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const web = path.resolve(__dirname, '../../web/workspace');
const origin = 'http://news-toolbar.test';
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
const checks = [];
const check = (name, value) => { assert(value, name); checks.push(name); };

const iso = ago => new Date(Date.now() - ago * 1000).toISOString();
const event = (seq, ago, stage, message, extra = {}) => ({seq, time: iso(ago), stage, message, ...extra});
const article = (id, title) => ({id, title, summary: 'A readable summary.', source_name: 'Fixture source', source_id: 'fixture', url: 'https://example.com/' + id, images: [], body_blocks: [{type: 'p', text: 'A readable paragraph.'}], published_at: new Date().toISOString(), author: 'Fixture'});
const snapshot = items => ({reader_id: 'fixture', sample: {captured_at: new Date().toISOString(), sources: [], streams: {ai: {items}, hn: {items: []}}}, covers: {items: []}});
const base = ['111111111111111111111111', '222222222222222222222222', '333333333333333333333333'].map((id, i) => article(id, `Fixture article ${i + 1}`));
const progress = (completed, total) => ({phase: 'visit', completed, total});
const jobs = {
  running: () => ({job_id: 'fixture', state: 'running', query: 'q', events: [event(1, 20, 'search', '检索关键词'), event(2, 12, 'visit', '读取页面', {url: 'https://openai.com/index/agents', progress: progress(1, 3)}), event(3, 6, 'visit', '读取页面', {url: 'https://huggingface.co/blog/agents', progress: progress(1, 3)})]}),
  complete: () => ({job_id: 'fixture', state: 'complete', query: 'q', events: [event(1, 20, 'search', '检索关键词'), event(2, 12, 'visit', '读取页面', {url: 'https://openai.com/index/agents', progress: progress(1, 3)}), event(3, 6, 'visit', '读取页面', {url: 'https://huggingface.co/blog/agents', progress: progress(1, 3)}), event(4, 10, 'extract', '已提取正文', {url: 'https://openai.com/index/agents', counts: {images: 2}}), event(5, 5, 'merge', '准备合入', {counts: {articles: 1}})], result: snapshot([...base, article('444444444444444444444444', 'Fresh finding')])}),
  failed: () => ({job_id: 'fixture', state: 'failed', error: '所有来源都暂时无法访问。', query: 'q', events: [event(1, 20, 'search', '检索关键词'), event(2, 10, 'blocked', '访问受阻', {url: 'https://x.com/example'})]}),
};

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME, args: ['--no-sandbox']} : {channel: 'msedge', headless: true});
  const errors = [], cspErrors = [];
  let job = jobs.running;
  const open = async (width, height = 800, options = {}) => {
    const context = await browser.newContext({viewport: {width, height}, ...options});
    await context.route(`${origin}/**`, route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/bootstrap') return route.fulfill({json: {csrf_token: 'fixture'}});
      if (url.pathname === '/api/workspace/news/reader') return route.fulfill({json: snapshot(base)});
      if (url.pathname === '/api/workspace/news/research') return route.fulfill({json: job()});
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
    await page.waitForFunction(() => window.NewsReader && window.NewsReader.inspect().items >= 3, null, {timeout: 8000});
    return {context, page};
  };
  const fits = page => page.evaluate(() => {
    const bar = document.querySelector('.toolbar'), collect = document.getElementById('refresh');
    return {bar: bar.scrollWidth <= bar.clientWidth, page: document.documentElement.scrollWidth <= innerWidth, label: collect.scrollWidth <= collect.clientWidth && collect.getBoundingClientRect().right <= innerWidth, height: Math.round(bar.getBoundingClientRect().height)};
  });

  // ── Toolbar ────────────────────────────────────────────────────────────────
  {
    const {context, page} = await open(1440);
    check('the pet switch is gone from the toolbar', await page.locator('#pet-visible').count() === 0);
    check('the wheel entry stays out of the way while the pet is off', !(await page.locator('#pet-dial').isVisible()));
    check('the sections are a labelled tablist with both defaults visible', await page.evaluate(() => { const group = document.getElementById('stream'); const tabs = [...group.querySelectorAll('[role=tab]')]; return group.getAttribute('role') === 'tablist' && !!group.getAttribute('aria-label') && tabs.length === 2 && tabs.every(tab => tab.getBoundingClientRect().width > 40) && tabs.map(tab => tab.textContent.trim()).join('|') === 'AI 新闻|Hacker News'; }));
    check('exactly one tab is selected and only it is in the tab order (roving tabindex)', await page.evaluate(() => { const tabs = [...document.querySelectorAll('#stream [role=tab]')]; return tabs.filter(tab => tab.getAttribute('aria-selected') === 'true').length === 1 && tabs.filter(tab => tab.tabIndex === 0).length === 1 && tabs[0].tabIndex === 0; }));
    await page.locator('#stream [data-value=ai]').focus();
    await page.keyboard.press('ArrowRight');
    check('ArrowRight moves focus and selection to the next section', await page.evaluate(() => window.NewsReader.inspect().stream === 'hn' && document.activeElement.dataset.value === 'hn' && document.activeElement.getAttribute('aria-selected') === 'true' && document.activeElement.tabIndex === 0));
    await page.keyboard.press('ArrowRight');
    check('the arrows wrap around', await page.evaluate(() => window.NewsReader.inspect().stream === 'ai'));
    await page.keyboard.press('End');
    check('End jumps to the last section', await page.evaluate(() => window.NewsReader.inspect().stream === 'hn'));
    await page.keyboard.press('Home');
    check('Home jumps to the first section', await page.evaluate(() => window.NewsReader.inspect().stream === 'ai'));
    await page.locator('#stream [data-value=hn]').click();
    check('a click selects a section', await page.evaluate(() => window.NewsReader.inspect().stream === 'hn' && document.querySelector('#stream [data-value=ai]').getAttribute('aria-selected') === 'false'));
    await page.locator('#stream [data-value=ai]').click();
    check('the refresh icon is a named button with the same tooltip text', await page.evaluate(() => { const button = document.getElementById('refresh-feeds'); return button.getAttribute('aria-label') === '更新新闻' && button.dataset.tip === '更新新闻' && button.getAttribute('aria-busy') === 'false'; }));
    check('the primary action says what it does', (await page.locator('#refresh-label').innerText()) === '采集新闻' && await page.locator('#refresh').evaluate(button => button.classList.contains('primary')));
    await page.evaluate(() => window.NewsReader.setPetEnabled(true));
    await page.locator('#pet-dial').waitFor({state: 'attached'});
    check('the wheel entry is visually hidden until it is focused', await page.locator('#pet-dial').evaluate(button => { const r = button.getBoundingClientRect(); return r.width <= 2 && r.height <= 2; }));
    await page.locator('#stream [data-value=ai]').focus();
    for (let i = 0; i < 4 && !(await page.evaluate(() => document.activeElement.id === 'pet-dial')); i += 1) await page.keyboard.press('Tab');
    check('Tab reaches the wheel entry and shows it', await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return document.activeElement.id === 'pet-dial' && r.width > 40 && r.height > 20; }));
    await page.evaluate(() => window.NewsReader.setPetEnabled(false));
    await context.close();
  }
  for (const width of [1440, 1280, 900, 390, 320]) {
    const {context, page} = await open(width, 800);
    const fit = await fits(page);
    check(`the toolbar neither clips nor scrolls sideways at ${width}px`, fit.bar && fit.page && fit.label);
    await page.evaluate(() => window.NewsReader.setPetEnabled(true));
    const withPet = await fits(page);
    check(`and still fits with the pet on at ${width}px`, withPet.bar && withPet.page && withPet.label);
    await context.close();
  }

  // ── Dialog ─────────────────────────────────────────────────────────────────
  {
    const {context, page} = await open(1440, 900);
    const panel = page.locator('#research-panel');
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.getElementById('research-panel').open);
    check('the dialog is a native modal and focuses the keyword field', await page.evaluate(() => document.getElementById('research-panel').matches(':modal') && document.activeElement.id === 'research-query'));
    check('the dialog is labelled', await panel.evaluate(node => !!node.getAttribute('aria-labelledby') || !!node.getAttribute('aria-label')));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('research-panel').open);
    check('Esc closes it and gives focus back to the button that opened it', await page.evaluate(() => document.activeElement.id === 'refresh'));
    await page.locator('#refresh').click(); await page.waitForTimeout(500);
    const idle = await panel.boundingBox();
    check('on a wide screen the dialog is a centred card, not full width', idle.width >= 420 && idle.width <= 640 && Math.abs(idle.x + idle.width / 2 - 720) <= 2);
    job = jobs.running;
    await page.locator('#research-start').click();
    await page.waitForFunction(() => document.getElementById('research-panel').dataset.state === 'running');
    await page.waitForFunction(() => document.getElementById('research-meter').hasAttribute('aria-valuenow'), null, {timeout: 15000});
    check('a running collection exposes a progressbar with value, text and state', await page.evaluate(() => { const bar = document.getElementById('research-meter'); return bar.getAttribute('role') === 'progressbar' && bar.getAttribute('aria-valuemin') === '0' && bar.getAttribute('aria-valuemax') === '100' && Number(bar.getAttribute('aria-valuenow')) > 0 && !!bar.getAttribute('aria-valuetext') && bar.dataset.state === 'running'; }));
    await page.waitForTimeout(500);
    const running = await panel.boundingBox();
    check('the running view lists its sources with a state each', await page.locator('.source-row').count() >= 1 && await page.locator('.source-row [data-state], .source-row[data-state]').count() >= 1);
    check('the trigger button names the running state', await page.locator('#refresh').evaluate(button => button.dataset.running === 'true') && await page.locator('#refresh-label').innerText() === '查看采集进度');
    job = jobs.complete;
    await page.waitForFunction(() => document.getElementById('research-panel').dataset.state === 'complete', null, {timeout: 15000});
    await page.waitForTimeout(500);
    const done = await panel.boundingBox();
    check('the dialog does not jump between running and finished', Math.abs(done.x - running.x) <= 1 && Math.abs(done.width - running.width) <= 1 && Math.abs(done.height - running.height) <= 120);
    check('the finished state says how it went and offers the next step', await page.evaluate(() => document.getElementById('research-state').textContent.includes('完成') && !document.getElementById('research-again').hidden && document.getElementById('research-return').textContent.includes('阅读')));
    check('the numbers use tabular figures', await page.evaluate(() => getComputedStyle(document.getElementById('research-article-count')).fontVariantNumeric.includes('tabular-nums')));
    check('the new article arrived in the list', await page.evaluate(() => window.NewsReader.inspect().items === 4));
    await page.locator('#research-return').click();
    await page.waitForFunction(() => !document.getElementById('research-panel').open);
    await context.close();
  }
  {
    const {context, page} = await open(1440, 900);
    job = jobs.failed;
    await page.locator('#refresh').click(); await page.locator('#research-start').click();
    await page.waitForFunction(() => document.getElementById('research-panel').dataset.state === 'failed', null, {timeout: 15000});
    check('a failed collection says so, keeps the old news and offers a retry', await page.evaluate(() => { const outcome = document.getElementById('research-outcome'); return !outcome.hidden && outcome.textContent.includes('已有新闻已保留') && !document.getElementById('research-again').hidden && window.NewsReader.inspect().items === 3; }));
    check('the failed progressbar is marked failed', await page.locator('#research-meter').evaluate(bar => bar.dataset.state === 'failed'));
    await context.close();
  }
  {
    const {context, page} = await open(390, 844);
    job = jobs.running;
    await page.locator('#refresh').click(); await page.waitForTimeout(600);
    const sheet = await page.locator('#research-panel').boundingBox();
    check('on a phone the dialog is a bottom sheet that fills the width', Math.abs(sheet.width - 390) <= 1 && Math.abs(sheet.y + sheet.height - 844) <= 1);
    check('and it never scrolls sideways', await page.locator('#research-panel').evaluate(node => node.scrollWidth <= node.clientWidth));
    await context.close();
  }
  {
    const {context, page} = await open(1440, 900, {reducedMotion: 'reduce'});
    await page.locator('#refresh').click();
    check('reduced motion removes the dialog transition and the ring animation', await page.evaluate(() => { const panel = document.getElementById('research-panel'); return parseFloat(getComputedStyle(panel).transitionDuration) === 0 && getComputedStyle(document.querySelector('.ring-fill')).animationName === 'none'; }));
    await context.close();
  }
  {
    const {context, page} = await open(1440, 900);
    await page.locator('#refresh').click(); await page.waitForTimeout(500);
    check('with motion allowed the dialog has a real enter transition', await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('research-panel')).transitionDuration.split(',')[0]) > 0));
    await context.close();
  }

  check('no page runtime errors', errors.length === 0);
  check('no CSP violations', cspErrors.length === 0);
  await browser.close();
  console.log(JSON.stringify({checks: checks.length, ok: true}));
})().catch(error => { console.error(error); process.exit(1); });
