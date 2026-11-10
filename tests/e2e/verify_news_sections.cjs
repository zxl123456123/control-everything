// 自定义专栏 (user-defined sections) in a real browser: switcher, floating editor, curated picker, URL probe, overflow, keyboard.
// The backend is a fixture: nothing is fetched from the network. Run: node tests/e2e/verify_news_sections.cjs
// (CHROME=/path/to/chrome overrides the browser, PW_NO_SANDBOX=1 for containers)
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const web = path.resolve(__dirname, '../../web/workspace');
const origin = 'http://news-sections.test';
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
const checks = [];
const check = (name, value) => { assert(value, name); checks.push(name); };
const hex = n => n.toString(16).padStart(24, '0');
const iso = ago => new Date(Date.now() - ago * 1000).toISOString();

const PRESETS = [{id: 'ai', name: 'AI 新闻', emoji: '', color: 'teal', preset: 'ai', sources: [], include: [], exclude: []},
  {id: 'hn', name: 'Hacker News', emoji: '', color: 'orange', preset: 'hn', sources: [], include: [], exclude: []}];
const CATALOG = {categories: [{id: 'tech', name: '科技'}, {id: 'dev', name: '开发'}],
  sources: [{id: 'sspai', name: '少数派', url: 'https://sspai.com/feed', category: 'tech', language: 'zh', note: ''},
    {id: 'ifanr', name: '爱范儿', url: 'https://www.ifanr.com/feed', category: 'tech', language: 'zh', note: ''},
    {id: 'rust_blog', name: 'Rust Blog', url: 'https://blog.rust-lang.org/feed.xml', category: 'dev', language: 'en', note: ''}]};
const article = (id, title, source) => ({id: hex(id), title, summary: 'A readable summary.', source_name: source, source_id: source, url: 'https://example.com/' + id,
  images: [], published_at: iso(600), fetched_at: iso(30), body_blocks: [{type: 'p', text: 'Body.'}], completeness: 'full_text', content_kind: 'full_text'});

/** Mutable fixture backend shared by one page. */
function backend() {
  const state = {sections: structuredClone(PRESETS), removed: [], posts: [], tests: []};
  const snapshot = () => ({reader_id: 'fixture', sections: {sections: state.sections, removed_presets: state.removed}, covers: {items: []}, sample: {captured_at: iso(10), sources: [],
    streams: Object.fromEntries(state.sections.map((s, i) => [s.id, {items: [article(100 + i * 10 + 1, `${s.name} 示例一`, 'sspai'), article(100 + i * 10 + 2, `${s.name} 示例二`, 'ifanr'), article(100 + i * 10 + 3, `${s.name} 示例三`, 'rust_blog')], sources: [], refresh: {state: 'idle'}}]))}});
  const handle = async (route, url) => {
    const name = url.pathname.replace('/api/workspace/news/', '');
    if (url.pathname === '/api/bootstrap') return route.fulfill({json: {csrf_token: 'fixture'}});
    if (name === 'reader' || name === 'reader/refresh') return route.fulfill({json: snapshot()});
    if (name === 'catalog') return route.fulfill({json: CATALOG});
    if (name === 'sections') {
      const body = JSON.parse(route.request().postData() || '{}'); state.posts.push(body);
      if (body.restore) { for (const preset of PRESETS) if (!state.sections.some(s => s.id === preset.id)) state.sections.push(structuredClone(preset)); }
      else state.sections = body.sections.map((s, i) => ({emoji: '', color: 'teal', sources: [], include: [], exclude: [], ...s, id: s.id || 'c' + String(state.posts.length * 20 + i).padStart(6, '0')}));
      state.removed = PRESETS.map(s => s.id).filter(id => !state.sections.some(s => s.id === id));
      return route.fulfill({json: {sections: state.sections, removed_presets: state.removed}});
    }
    if (name === 'source-test') {
      const {url: target} = JSON.parse(route.request().postData() || '{}'); state.tests.push(target);
      if (/bad/.test(target)) return route.fulfill({json: {ok: false, error: {code: 'http_404', message: '订阅地址不存在（404）', hint: '地址可能已变更，请在站点首页查找 RSS 图标。'}}});
      return route.fulfill({json: {ok: true, url: target, title: '示例订阅', format: 'rss2', count: 12, discovered: false, latest: {title: '最新一篇文章', published_at: iso(3600)}}});
    }
    if (name === 'research/latest') return route.fulfill({json: {job: null}});
    return route.fulfill({status: 404, contentType: 'application/json', body: '{}'});
  };
  return {state, handle};
}

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME, args: ['--no-sandbox']} : {channel: 'msedge', headless: true});
  const errors = [], cspErrors = [];
  const open = async (width, height = 800, options = {}) => {
    const api = backend();
    const context = await browser.newContext({viewport: {width, height}, ...options});
    await context.route(`${origin}/**`, route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) return api.handle(route, url);
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
    return {context, page, api};
  };
  const tabs = page => page.evaluate(() => [...document.querySelectorAll('#stream [role=tab]')].map(tab => tab.textContent.trim()));
  const popoverOpen = page => page.evaluate(() => document.getElementById('sections-popover')?.dataset.open === 'true');

  // ---- defaults, accessibility, creation ----
  const {context, page, api} = await open(1440);
  check('the two presets are the default sections', (await tabs(page)).join('|') === 'AI 新闻|Hacker News');
  check('the switcher is a labelled tablist with a roving tabindex', await page.evaluate(() => {
    const list = document.getElementById('stream'), all = [...list.querySelectorAll('[role=tab]')];
    return list.getAttribute('role') === 'tablist' && !!list.getAttribute('aria-label') && all.filter(t => t.tabIndex === 0).length === 1 && all.filter(t => t.getAttribute('aria-selected') === 'true').length === 1
      && all.every(t => t.id.startsWith('tab-'));
  }));
  await page.locator('#section-add').click();
  await page.waitForFunction(() => document.getElementById('sections-popover').dataset.open === 'true');
  check('the + button opens a floating dialog with the name field focused', await page.evaluate(() => { const p = document.getElementById('sections-popover'); return p.getAttribute('role') === 'dialog' && document.activeElement.id === 'sp-name' && p.getAttribute('aria-labelledby') === 'sp-title'; }));
  check('the popover has one border and no outline (single layer)', await page.evaluate(() => { const style = getComputedStyle(document.getElementById('sections-popover')); return style.borderTopWidth === '1px' && style.outlineStyle === 'none' && style.boxShadow !== 'none'; }));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('sections-popover').dataset.open === 'false');
  check('Esc closes the popover and returns focus to the + button', await page.evaluate(() => document.activeElement.id === 'section-add'));
  await page.locator('#section-add').click();
  await page.locator('#sp-name').fill('科技早报');
  await page.locator('#sp-emoji').fill('📰');
  await page.locator('[data-act=toggle-picker]').click();
  await page.locator('.sp-catalog [data-act=add][data-url="https://sspai.com/feed"]').click();
  check('a curated source is added from the picker and marked as added', await page.evaluate(() => document.querySelector('.sp-sources').children.length === 1 && document.querySelector('.sp-catalog [data-act=add][data-url="https://sspai.com/feed"]').innerText.trim() === '已添加'));
  await page.locator('#sp-url').fill('https://good.example/feed.xml');
  await page.locator('[data-act=probe]').click();
  await page.waitForFunction(() => document.querySelector('.sp-result')?.dataset.state === 'ok');
  check('a valid feed URL shows its title, format, count and latest item', await page.evaluate(() => { const text = document.querySelector('.sp-result').innerText; return text.includes('示例订阅') && text.includes('12') && text.includes('最新一篇文章'); }));
  await page.locator('[data-act=add-probed]').click();
  await page.locator('#sp-url').fill('https://bad.example/feed.xml');
  await page.locator('[data-act=probe]').click();
  await page.waitForFunction(() => document.querySelector('.sp-result')?.dataset.state === 'bad');
  check('a failing URL shows a clear reason and a fix hint', await page.evaluate(() => { const text = document.querySelector('.sp-result').innerText; return text.includes('404') && text.includes('RSS'); }));
  await page.locator('#sp-include').fill('rust, ai');
  await page.locator('[data-act=save]').click();
  await page.waitForFunction(() => document.querySelectorAll('#stream [role=tab]').length === 3);
  const post = api.state.posts.at(-1).sections.at(-1);
  check('saving posts the new section with its sources and keywords', post.name === '科技早报' && post.emoji === '📰' && post.sources.length === 2 && post.include.join(',') === 'rust,ai');
  check('the new section is appended, selected and shown', (await tabs(page)).at(-1).includes('科技早报') && await page.evaluate(() => document.querySelector('#stream [aria-selected=true]').textContent.includes('科技早报')));

  // ---- keyboard ----
  await page.locator('#stream [role=tab]').first().focus();
  await page.keyboard.press('End');
  check('End selects the last section', await page.evaluate(() => document.querySelector('#stream [aria-selected=true]').textContent.includes('科技早报')));
  await page.keyboard.press('ArrowRight');
  check('arrows wrap around from the last to the first section', await page.evaluate(() => document.querySelector('#stream [aria-selected=true]').textContent.includes('AI 新闻')));

  // ---- rename, reorder ----
  await page.locator('#stream [role=tab]').nth(2).click();
  await page.locator('#section-edit').click();
  await page.locator('#sp-name').fill('科技精选');
  await page.locator('[data-act=earlier]').click();
  await page.locator('[data-act=earlier]').click();
  await page.locator('[data-act=save]').click();
  await page.waitForFunction(() => document.querySelector('#stream [role=tab]')?.textContent.includes('科技精选'));
  check('rename and reorder persist (the section moved to the front)', (await tabs(page))[0].includes('科技精选') && api.state.sections[0].name === '科技精选');

  // ---- delete a preset and restore ----
  await page.locator('#stream [role=tab]').nth(2).click();
  await page.locator('#section-edit').click();
  await page.locator('[data-act=delete]').click();
  check('delete asks for a second confirming click', await page.locator('[data-act=delete]').innerText() === '确认删除' && api.state.sections.length === 3);
  await page.locator('[data-act=delete]').click();
  await page.waitForFunction(() => document.querySelectorAll('#stream [role=tab]').length === 2);
  check('a preset can be deleted', api.state.sections.every(s => s.id !== 'hn') && api.state.removed.includes('hn'));
  await page.locator('#section-add').click();
  await page.locator('[data-act=restore]').click();
  await page.waitForFunction(() => document.querySelectorAll('#stream [role=tab]').length === 3);
  check('deleted presets can be restored from the popover', api.state.sections.some(s => s.id === 'hn') && api.state.removed.length === 0);

  // ---- overflow: many sections never clip the toolbar ----
  api.state.sections = [...PRESETS.map(p => structuredClone(p)), ...Array.from({length: 8}, (_, i) => ({id: 'c' + String(900 + i), name: `很长的专栏名称 ${i + 1}`, emoji: '', color: 'blue', sources: [], include: [], exclude: []}))];
  await page.reload();
  await page.waitForFunction(() => window.NewsReader && window.NewsReader.inspect().items >= 3);
  const overflow = await page.evaluate(() => { const list = document.getElementById('stream'); return {scrolls: list.scrollWidth > list.clientWidth, page: document.documentElement.scrollWidth <= innerWidth, add: document.getElementById('section-add').getBoundingClientRect().right <= innerWidth}; });
  check('many sections scroll inside the switcher while + stays visible and the page does not overflow', overflow.scrolls && overflow.page && overflow.add);
  await page.locator('#stream [role=tab]').last().focus();
  await page.keyboard.press('Home');
  check('Home selects the first section even when it is scrolled out of view', await page.evaluate(() => { const tab = document.querySelector('#stream [role=tab][aria-selected=true]'); const list = document.getElementById('stream'), a = tab.getBoundingClientRect(), b = list.getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1; }));
  await context.close();

  // ---- narrow layout: the editor becomes a bottom sheet inside the viewport; dark theme keeps one border ----
  for (const dark of [false, true]) {
    const {context: narrow, page: small} = await open(390, 800, {colorScheme: dark ? 'dark' : 'light'});
    await small.locator('#section-add').click();
    await small.waitForFunction(() => document.getElementById('sections-popover').dataset.open === 'true');
    await small.waitForTimeout(450);
    const box = await small.evaluate(() => { const r = document.getElementById('sections-popover').getBoundingClientRect(); return {left: r.left, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight, sheet: document.getElementById('sections-popover').dataset.sheet, page: document.documentElement.scrollWidth <= innerWidth}; });
    check(`the editor is a bottom sheet that fits a 390px screen (${dark ? 'dark' : 'light'})`, box.sheet === 'true' && box.left >= 0 && box.right <= box.width && box.bottom <= box.height + 1 && box.page);
    await narrow.close();
  }

  check('no page errors', errors.length === 0);
  check('no CSP violations', cspErrors.length === 0);
  await browser.close();
  console.log(JSON.stringify({checks: checks.length, ok: true}));
})().catch(error => { console.error(error); process.exit(1); });
