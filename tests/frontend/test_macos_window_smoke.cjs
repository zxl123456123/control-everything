const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const engineRequire = createRequire(path.join(root, 'web/workbench-engine/package.json'));
const swift = fs.readFileSync(path.join(root, 'native/macos/main.swift'), 'utf8').replace(/\r/g, '');
const script = name => swift.match(new RegExp('let ' + name + ' = #"""\\n([\\s\\S]*?)\\n"""#'))[1];

async function page() {
  const { Window } = await import(pathToFileURL(engineRequire.resolve('happy-dom')).href);
  const window = new Window({ url: 'http://127.0.0.1:8766/studio' });
  Object.defineProperty(window.document, 'readyState', { value: 'complete' });
  window.performance.getEntriesByType = () => [];
  window.Element.prototype.getBoundingClientRect = () => ({ width: 100, height: 30, top: 0, left: 0, bottom: 30, right: 100 });
  window.document.body.innerHTML = '<div id="root"></div>';
  window.eval(script('smokeDiagnosticsScript'));
  const probe = () => JSON.parse(window.eval(script('smokePageProbe')));
  const mount = () => {
    window.document.getElementById('root').innerHTML = '<section class="platform-studio-surface" style="opacity:1"><div class="platform-studio-host" style="opacity:1"></div></section>';
    const host = window.document.querySelector('.platform-studio-host');
    host.attachShadow({ mode: 'open' }).innerHTML = '<section id="ce-studio"><input id="studio-project-search" style="opacity:1" type="search"></section>';
    return host;
  };
  return { window, probe, mount };
}

test('waits for the real shadow Studio input rather than document body text', async () => {
  const { window, probe, mount } = await page();
  try {
    assert.equal(probe().ready, false);
    window.document.getElementById('root').textContent = 'Loading';
    assert.equal(probe().ready, false);
    mount();
    const loaded = probe();
    assert.equal(loaded.studioMounted, true);
    assert.equal(loaded.searchFocused, true);
    assert.equal(loaded.ready, true);
  } finally { await window.happyDOM.close(); }
});

test('hidden or disabled controls and an error page cannot pass', async () => {
  const { window, probe, mount } = await page();
  try {
    const host = mount();
    host.hidden = true;
    assert.equal(probe().ready, false);
    host.hidden = false;
    host.shadowRoot.querySelector('input').disabled = true;
    assert.equal(probe().ready, false);
    window.document.getElementById('root').innerHTML = '<div role="alert">Application failed</div>';
    assert.equal(probe().ready, false);
  } finally { await window.happyDOM.close(); }
});

test('records error categories without leaking messages or gating a usable input', async () => {
  const { window, probe, mount } = await page();
  try {
    mount();
    window.dispatchEvent(new window.ErrorEvent('error', { error: new window.TypeError('fixture-private-message') }));
    const result = probe();
    assert.equal(result.scriptErrors, 1);
    assert.deepEqual(result.errorKinds, ['TypeError']);
    assert.equal(JSON.stringify(result).includes('fixture-private-message'), false);
    assert.equal(result.ready, true);
  } finally { await window.happyDOM.close(); }
});
