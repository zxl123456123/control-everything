// Exactly one pet may be alive in the app at any time (none when the pet is off).
// Hosts: the news reader (a route-mocked fixture with the real CSP) and the Studio mascot overlay (a minimal Studio-like host page).
// Optional: PET_BASE=http://127.0.0.1:PORT also walks a running gateway's real Studio (iframe included).
// Run: node tests/e2e/verify_pet_singleton.cjs   (CHROME=/path/to/chrome overrides the browser, PW_NO_SANDBOX=1 for containers)
const {chromium} = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../../web/workspace');
const origin = 'http://127.0.0.1:55191';
const checks = [];
const check = (name, value) => { assert(value, name); checks.push(name); };
const policy = fs.readFileSync(path.resolve(__dirname, '../../src/control_everything/http/news_reader.py'), 'utf8').match(/CSP = \(([\s\S]*?)\)\r?\n/);
const newsCSP = Array.from(policy[1].matchAll(/"(?:[^"\\]|\\.)*"/g), match => JSON.parse(match[0])).join('');
const types = {'.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html'};
const item = (id, title) => ({id, title, summary: 'Fixture summary.', source_name: 'Fixture', source_id: 'fixture', url: 'https://example.com/' + id, images: [], body_blocks: [{type: 'p', text: 'Body.'}], published_at: '2025-10-22T12:00:00Z', author: 'A', references: []});
const articles = ['1', '2', '3'].map(n => item(n.repeat(24), 'Fixture article ' + n));
const snapshot = {reader_id: 'fixture', sample: {captured_at: '2026-10-22T12:00:00Z', sources: [], streams: {ai: {items: articles}, hn: {items: []}}}, covers: {items: []}};
const PETS = ['spider', 'tabbycat', 'naidragon'];

/** Counts the pet canvases a person can see right now (a canvas hidden by CSS, `hidden` or a closed dialog does not count). */
const COUNT = () => {
  const visible = node => {
    const rect = node.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    for (let el = node; el; el = el.parentElement) { const css = getComputedStyle(el); if (css.display === 'none' || css.visibility === 'hidden' || el.hidden) return false; }
    return true;
  };
  const gl = [...document.querySelectorAll('canvas[data-tc=gl],canvas[data-nd=gl]')].filter(visible);
  const spiders = [...document.querySelectorAll('#spider-canvas,#research-spider-canvas')].filter(node => visible(node) && node.dataset.painted !== 'no');
  // A spider canvas only counts as a pet when no 3D canvas shares its stage: the spider script paints into it only while it is mounted.
  return {gl: gl.length, spiders: spiders.length, owners: window.NewsReader ? [window.NewsReader.inspect().engine ? 'main' : '', window.NewsReader.inspect().researchEngine ? 'research' : ''].filter(Boolean) : []};
};

async function serve(page, html) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/api/bootstrap') return route.fulfill({json: {csrf_token: 'fixture'}});
    if (url.pathname === '/api/workspace/news/reader') return route.fulfill({json: snapshot});
    if (url.pathname === '/api/workspace/news/article') { const row = articles.find(a => a.id === url.searchParams.get('id')) || articles[0]; return route.fulfill({json: {...row, content_kind: 'full_text', blocks: row.body_blocks}}); }
    if (url.pathname === '/api/workspace/news/research/latest') return route.fulfill({json: {job: null}});
    if (url.pathname.startsWith('/api/')) return route.fulfill({json: {status: 'unavailable'}});
    if (url.pathname === '/host') return route.fulfill({contentType: 'text/html', body: html});
    const file = url.pathname === '/' ? 'news-reader.html' : url.pathname.slice(1);
    const full = path.join(root, file);
    if (!full.startsWith(root) || !fs.existsSync(full)) return route.abort();
    return route.fulfill({path: full, contentType: types[path.extname(file)] || 'application/octet-stream', headers: file === 'news-reader.html' || file.startsWith('news-') ? {'Content-Security-Policy': newsCSP} : {}});
  });
}

const settle = (page, ms = 1800) => page.waitForTimeout(ms);
/** Waits for a lazily loaded 3D pet to finish loading, then reads how many are visible. */
async function count(page, expected, label) {
  let last;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    last = await page.evaluate(COUNT);
    if (last.gl + last.spiders === expected) { await settle(page, 600); last = await page.evaluate(COUNT); break; }
    await page.waitForTimeout(400);
  }
  check(`${label}: ${expected} pet(s) visible (saw ${JSON.stringify(last)})`, last.gl + last.spiders === expected);
}

async function sequence(page, label, expectedFor) {
  const set = (fn, ...args) => page.evaluate(([name, arg]) => window.NewsPetPrefs[name](arg), [fn, args[0]]);
  await set('setEnabled', true);
  for (const pet of [...PETS, 'tabbycat', 'naidragon', 'spider']) {
    await set('setPet', pet); await count(page, expectedFor(pet), `${label} ${pet}`);
  }
  await set('setPet', 'tabbycat'); await count(page, expectedFor('tabbycat'), `${label} back to the cat`);
  await set('setEnabled', false); await count(page, 0, `${label} off`);
  await set('setEnabled', true); await count(page, expectedFor('tabbycat'), `${label} on again`);
  await set('setPet', 'naidragon'); await settle(page, 400);
  await page.reload(); await page.waitForFunction(() => window.NewsPetPrefs, null, {timeout: 20000});
  await count(page, expectedFor('naidragon'), `${label} after reload`);
}

(async () => {
  const browser = await chromium.launch(process.env.CHROME
    ? {executablePath: process.env.CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']}
    : {channel: 'msedge', headless: true});
  const errors = [];

  // News reader host.
  const news = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
  news.on('pageerror', error => errors.push(error.message));
  await news.addInitScript(() => { if (!localStorage.getItem('news-reader-pet-hint')) { localStorage.setItem('news-reader-pet-hint', '1'); localStorage.setItem('news-reader-pet', 'spider'); localStorage.setItem('news-reader-pet-enabled', 'true'); } });
  await serve(news, '');
  await news.goto(origin + '/'); await news.waitForFunction(() => window.NewsReader?.inspect().items === 3, null, {timeout: 20000});
  await sequence(news, 'news reader', () => 1);

  // The research panel mounts its own pet; the stage pet behind the modal must be hidden while it shows.
  await news.evaluate(() => window.NewsPetPrefs.setPet('tabbycat'));
  await count(news, 1, 'news reader research panel closed');
  await news.evaluate(() => {
    const panel = document.getElementById('research-panel'), details = document.getElementById('research-details');
    document.getElementById('research-archive').hidden = false; details.hidden = false; panel.showModal(); details.open = true; details.dispatchEvent(new Event('toggle'));
    window.NewsPetPrefs.setEnabled(false); window.NewsPetPrefs.setEnabled(true);
  });
  await settle(news, 2500);
  const owners = await news.evaluate(() => { const s = window.NewsReader.inspect(); return {main: Boolean(s.engine), research: Boolean(s.researchEngine)}; });
  check('the research panel mounts its own pet next to the stage pet', owners.main && owners.research);
  await count(news, 1, 'news reader research panel open');
  await news.evaluate(() => document.getElementById('research-panel').close());

  // Studio host: the overlay mascot only exists for the full 3D pets; the spider never appears on Studio routes.
  const studio = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
  studio.on('pageerror', error => errors.push(error.message));
  const scripts = ['news-pets', 'news-pet-dial', 'news-pet-wheel', 'news-pet-prefs', 'news-pet-director', 'news-pet-status', 'studio-mascot'].map(name => `<script src="/${name}.js"></script>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/studio-preview.css"></head><body data-theme="light"><div id="app" class="ce-app" data-theme="light"><main style="min-height:100vh">Studio home</main></div>${scripts}<script>
    localStorage.setItem('news-reader-pet-hint','1');
    window.studioRoute={view:'home'};
    window.studioMascot=StudioMascot.mount(document.getElementById('app'),{route:()=>window.studioRoute,navigate:hash=>{location.hash=hash}});
  </script></body></html>`;
  await serve(studio, html);
  await studio.goto(origin + '/host'); await studio.waitForFunction(() => window.studioMascot, null, {timeout: 20000});
  await sequence(studio, 'studio home', pet => (pet === 'spider' ? 0 : 1));
  await studio.evaluate(() => { window.NewsPetPrefs.setPet('tabbycat'); window.studioRoute = {view: 'news'}; window.studioMascot.setRoute(); });
  await count(studio, 0, 'studio news route (the news page owns its own pet)');
  await studio.evaluate(() => { window.studioRoute = {view: 'settings', tab: 'appearance'}; window.studioMascot.setRoute(); });
  await count(studio, 1, 'studio settings route');

  // A running gateway: the real Studio with the news iframe, counted across frames.
  if (process.env.PET_BASE) {
    const real = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
    await real.addInitScript(() => { localStorage.setItem('news-reader-pet-hint', '1'); localStorage.setItem('news-reader-pet-enabled', 'true'); });
    for (const pet of ['tabbycat', 'naidragon']) {
      await real.addInitScript(name => localStorage.setItem('news-reader-pet', name), pet);
      for (const hash of ['home', 'news', 'settings/appearance']) {
        await real.goto(`${process.env.PET_BASE}/studio#${hash}`); await real.waitForTimeout(6000);
        const total = (await Promise.all(real.frames().map(frame => frame.evaluate(COUNT).catch(() => ({gl: 0, spiders: 0}))))).reduce((sum, c) => sum + c.gl + c.spiders, 0);
        check(`real studio ${pet} #${hash}: exactly one pet across all frames (saw ${total})`, total === 1);
      }
    }
  }

  check('no page errors', errors.length === 0);
  await browser.close();
  console.log(JSON.stringify({checks: checks.length, ok: true}));
})().catch(error => { console.error(error); process.exit(1); });
