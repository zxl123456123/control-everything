'use strict';
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const script = name => import(pathToFileURL(path.join(root, 'web/workbench-engine/config/scripts', name)));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-news-runtime-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
    assert(path.basename(temporary).startsWith('ce-news-runtime-'));
    fs.rmSync(temporary, {recursive:true, force:true});
  });
  const core = path.join(temporary, 'node_modules/playwright-core');
  fs.mkdirSync(path.join(core, 'lib'), {recursive:true});
  fs.writeFileSync(path.join(temporary, 'package.json'), JSON.stringify({name:'export-fixture', version:'1.0.0', devDependencies:{'playwright-core':'1.64.0'}}));
  fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({name:'playwright-core', version:'1.64.0', license:'Apache-2.0'}));
  for (const [name, text] of Object.entries({'index.js':'module.exports = {};', LICENSE:'Fixture Apache-2.0 notice', NOTICE:'Fixture third-party notice', 'lib/browser.js':'exports.browser = true;'})) {
    fs.writeFileSync(path.join(core, name), text);
  }
  return {temporary, core, out:path.join(temporary, 'out')};
}

test('one locked core package is exported as regular files with complete existing ownership records', async t => {
  const {stageOrcadPlaywrightCore} = await script('orcad-playwright-core-package.mjs');
  const {writeDistributionRecord} = await script('distribution-record.mjs');
  const {temporary, core, out} = fixture(t);
  fs.mkdirSync(path.join(core, 'node_modules/.bin'), {recursive:true});
  fs.writeFileSync(path.join(core, 'node_modules/.bin/electron.cmd'), 'local pnpm installation shim');
  const copies = stageOrcadPlaywrightCore(temporary, out);
  assert.equal(copies.length, 5);
  assert(!fs.existsSync(path.join(out, 'node_modules/playwright-core/node_modules')));
  for (const row of copies) {
    assert(fs.lstatSync(row.output).isFile());
    assert(!fs.lstatSync(row.output).isSymbolicLink());
    assert.equal(hash(row.source), hash(row.output));
    assert.equal(path.relative(core, row.source), path.relative(path.join(out, 'node_modules/playwright-core'), row.output));
  }
  writeDistributionRecord(temporary, 'runtime', [], {}, copies);
  const record = JSON.parse(fs.readFileSync(path.join(temporary, '.build/distribution/runtime.json')));
  assert.equal(record.copies.length, copies.length);
  for (const row of record.copies) {
    assert.equal(row.owner.package.name, 'playwright-core');
    assert.equal(row.owner.package.version, '1.64.0');
    assert.equal(row.owner.package.local, false);
    assert.equal(row.owner.unresolved, undefined);
    assert.equal(row.sha256, hash(path.join(temporary, row.output)));
    assert.equal(row.owner.package.notices.length, 2);
  }
});

test('re-export replaces only this package and preserves unrelated output', async t => {
  const {stageOrcadPlaywrightCore} = await script('orcad-playwright-core-package.mjs');
  const {temporary, out} = fixture(t);
  stageOrcadPlaywrightCore(temporary, out);
  const stale = path.join(out, 'node_modules/playwright-core/stale.js');
  const sibling = path.join(out, 'node_modules/unrelated.txt');
  fs.writeFileSync(stale, 'stale');
  fs.writeFileSync(sibling, 'keep');
  stageOrcadPlaywrightCore(temporary, out);
  assert(!fs.existsSync(stale));
  assert.equal(fs.readFileSync(sibling, 'utf8'), 'keep');
});

test('wrong package identity or missing notices fails before replacing a prior export', async t => {
  const {stageOrcadPlaywrightCore} = await script('orcad-playwright-core-package.mjs');
  const {temporary, core, out} = fixture(t);
  stageOrcadPlaywrightCore(temporary, out);
  const existing = path.join(out, 'node_modules/playwright-core/index.js');
  const before = hash(existing);
  const metadata = path.join(core, 'package.json');
  const original = fs.readFileSync(metadata);
  fs.writeFileSync(metadata, JSON.stringify({name:'playwright-core', version:'1.63.0'}));
  assert.throws(() => stageOrcadPlaywrightCore(temporary, out), /news_playwright_core_identity/);
  fs.writeFileSync(metadata, original);
  fs.unlinkSync(path.join(core, 'NOTICE'));
  assert.throws(() => stageOrcadPlaywrightCore(temporary, out), /news_playwright_core_missing:NOTICE/);
  assert.equal(hash(existing), before);
});

test('a transitive runtime dependency cannot be silently omitted', async t => {
  const {stageOrcadPlaywrightCore} = await script('orcad-playwright-core-package.mjs');
  const {temporary, core, out} = fixture(t);
  fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({name:'playwright-core', version:'1.64.0', dependencies:{other:'1.0.0'}}));
  assert.throws(() => stageOrcadPlaywrightCore(temporary, out), /news_playwright_core_identity/);
  assert(!fs.existsSync(out));
});

test('output junctions are refused without modifying their target', async t => {
  const {stageOrcadPlaywrightCore} = await script('orcad-playwright-core-package.mjs');
  const {temporary, out} = fixture(t);
  const external = path.join(temporary, 'do-not-touch');
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'keep.txt'), 'keep');
  fs.mkdirSync(out);
  fs.symlinkSync(external, path.join(out, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => stageOrcadPlaywrightCore(temporary, out), /news_playwright_core_output_link/);
  assert.equal(fs.readFileSync(path.join(external, 'keep.txt'), 'utf8'), 'keep');
});
