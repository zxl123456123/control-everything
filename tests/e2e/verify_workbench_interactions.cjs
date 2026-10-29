'use strict';
// Coordinator-only browser acceptance against an explicitly owned synthetic profile.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  assert(index >= 0 && args[index + 1] && !args[index + 1].startsWith('--'), `required ${name}`);
  return args[index + 1];
}
assert(args.includes('--fixture'), 'explicit --fixture required; never run against a personal profile');
const origin = new URL(option('--base-url'));
assert(['127.0.0.1', 'localhost'].includes(origin.hostname) && origin.protocol === 'http:'
  && Number(origin.port) >= 1024 && origin.port !== '8766' && origin.pathname === '/'
  && !origin.username && !origin.password && !origin.search && !origin.hash, 'owned loopback origin required');
const fixturePath = path.resolve(option('--fixture-manifest'));
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8').replace(/^\uFEFF/, ''));
assert(fixture.agent_count === 0 && fixture.codex_observation_enabled === false
  && fixture.projects.length >= 2 && fixture.tasks.length >= 2, 'synthetic profile without Agent or personal observations required');
const buildRun = path.resolve(option('--build-run'));
const provenancePath = path.join(buildRun, 'build-provenance.json');
const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
assert(provenance.status === 'build_only_verified' && provenance.distribution === 'closure_verified',
  'verified complete source build and distribution notice closure required');
const root = path.resolve(__dirname, '../..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'work/ui-interaction-overhaul-20261025/acceptance', `integrated-${stamp}`);
fs.mkdirSync(output, { recursive: true });
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report = {
  owner: 'root/coordinator executing harness', scope: 'owned integrated loopback service; synthetic profile; no Agent actions',
  fixture: fixturePath, fixture_sha256: digest(fixturePath), base_url: origin.origin,
  build_run: buildRun, provenance_sha256: digest(provenancePath), source_tree_sha256: provenance.sourceTreeSha256,
  cases: [], failures: [], page_errors: [], csp_errors: [], blocked_external: [], rejected_writes: [],
  limitations: ['No real account/Keycloak/Caddy/mobile/installer or Agent operations.',
    'This harness covers normal project menu navigation and layout; full field, IME, PTY and long-content acceptance needs separate evidence.'],
};
let browser;
async function check(row, name, value) {
  assert(value, name);
  row.checks.push(name);
}
async function hashIs(page, expected) {
  await page.waitForFunction(value => location.hash === value, expected);
}
async function runCase(width, height, theme) {
  const hasTouch = width < 768;
  const row = { width, height, theme, hasTouch, checks: [], bootstrap_requests: 0, failed_requests: [], error_responses: [], stage: 'creating page' };
  report.cases.push(row);
  const context = await browser.newContext({ viewport: { width, height }, hasTouch, reducedMotion: 'reduce', serviceWorkers: 'block' });
  let page;
  try {
    page = await context.newPage();
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      row.failed_requests.push({ method: request.method(), origin: url.origin, path: url.pathname, reason: request.failure()?.errorText });
    });
    page.on('response', response => {
      if (response.status() >= 400) {
        const url = new URL(response.url());
        row.error_responses.push({ status: response.status(), origin: url.origin, path: url.pathname });
      }
    });
    page.on('pageerror', error => report.page_errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /Content Security Policy|violates the following.*directive/i.test(message.text())) {
        report.csp_errors.push(message.text());
      }
    });
    await page.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin.origin) {
        report.blocked_external.push({ origin: url.origin, path: url.pathname });
        return route.abort();
      }
      // Navigation, filters and themes must not create projects, dispatch work or pair devices.
      if (!['GET', 'HEAD'].includes(request.method())) {
        if (url.pathname === '/api/workbench/bootstrap') row.bootstrap_requests++;
        report.rejected_writes.push({ method: request.method(), path: url.pathname });
        return route.abort();
      }
      return route.continue();
    });
    row.stage = 'opening integrated document';
    const response = await page.goto(origin.origin + '/studio#home');
    row.document_response = { status: response.status(), csp: response.headers()['content-security-policy'] };
    await check(row, 'real integrated document returns 200', response.status() === 200);
    const studio = page.locator('#ce-studio:visible').first();
    row.stage = 'waiting for normal overview cards';
    await studio.locator('[data-project-card]').first().waitFor();
    await check(row, 'integrated Studio is mounted in its real Shadow host',
      await studio.evaluate(node => node.dataset.unified === 'true' && node.getRootNode() instanceof ShadowRoot));
    row.stage = 'confirming theme and actual target geometry';
    const toggle = studio.locator('[data-action="theme"]');
    if (await studio.getAttribute('data-theme') !== theme) await toggle.click();
    await studio.evaluate((node, desired) => new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000;
      function observe() {
        if (node.dataset.theme === desired) resolve();
        else if (Date.now() >= deadline) reject(new Error('theme confirmation did not arrive'));
        else requestAnimationFrame(observe);
      }
      observe();
    }), theme);
    await check(row, 'theme follows confirmed authority', await studio.getAttribute('data-theme') === theme);
    row.theme_control = await toggle.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height, coarse_pointer: matchMedia('(pointer: coarse)').matches };
    });
    await check(row, 'theme icon has actual target size', await toggle.evaluate((node, size) => {
      const rect = node.getBoundingClientRect(); return rect.width >= size && rect.height >= size;
    }, hasTouch ? 44 : 40));
    await check(row, 'document has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.evaluate(() => document.fonts.ready);
    await check(row, 'existing Geist font is loaded', await page.evaluate(() => Array.from(document.fonts).some(font => font.family === 'Geist' && font.status === 'loaded')));

    row.stage = 'retired progress surfaces remain absent';
    const project = fixture.projects[1];
    await check(row, 'Studio does not mount retired progress or task panels', await studio.locator('#studio-tasks, #studio-legacy-board, #studio-agent-board, #studio-monitor').count() === 0);
    await studio.locator(`[data-project-menu="${project.id}"]`).click();
    await check(row, 'project menu offers no progress or task management entry', await page.getByRole('menuitem', { name: /项目进展|全部事项|事项看板/ }).count() === 0);
    await page.keyboard.press('Escape');
    await check(row, 'project cards enter the native workspace', await studio.locator(`[data-project-card="${project.id}"] .ce-project-title-link`).getAttribute('href') === `#project/${encodeURIComponent(project.id)}/workspace`);
    await page.screenshot({ path: path.join(output, `${width}-${theme}.png`), fullPage: true });
    row.stage = 'completed';
  } catch (error) {
    row.failure = String(error.stack || error);
    if (page) {
      try {
        row.current_url = page.url();
        row.visible_feedback = (await page.locator('[role="alert"]:visible, [role="status"]:visible, #studio-status:visible').allTextContents())
          .map(text => text.trim()).filter(Boolean).slice(0, 24).map(text => text.slice(0, 600));
        row.studio_state = await page.locator('#ce-studio').evaluateAll(nodes => nodes.map(node => {
          const rect = node.getBoundingClientRect();
          return { dataset: { ...node.dataset }, connected: node.isConnected, display: getComputedStyle(node).display,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            cards: node.querySelectorAll('[data-project-card]').length,
            status: node.querySelector('#studio-status')?.textContent, text: node.textContent.slice(0, 4000) };
        }));
        row.failure_screenshot = `${width}-${theme}-failure.png`;
        await page.screenshot({ path: path.join(output, row.failure_screenshot), fullPage: true });
      } catch (diagnosticError) {
        row.diagnostic_error = String(diagnosticError);
      }
    }
    throw error;
  } finally {
    await context.close();
  }
}

(async () => {
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const [width, height] of [[1440, 900], [1024, 900], [768, 900], [390, 844], [360, 800]]) {
      for (const theme of ['light', 'dark']) await runCase(width, height, theme);
    }
    assert.equal(report.page_errors.length, 0, 'no page runtime errors');
    assert.equal(report.csp_errors.length, 0, 'no CSP errors');
    assert.equal(report.rejected_writes.length, 0, 'no writes requested by this read-only navigation scenario');
  } catch (error) {
    report.failures.push(String(error.stack || error));
    process.exitCode = 1;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (error) { report.failures.push('cleanup: ' + String(error)); process.exitCode = 1; }
    }
    report.exit_code = process.exitCode || 0;
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  }
})();
