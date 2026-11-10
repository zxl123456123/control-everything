const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const engine = path.join(root, 'web/workbench-engine')
const req = createRequire(path.join(engine, 'package.json'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'distribution-cross-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('real mobile product producer records its actual mobile inputs and renamed output bytes', async t => {
  const directory = fixture(t)
  const out = path.join(directory, 'out/mobile-web')
  const records = path.join(directory, 'records')
  const { buildMobileWebAppBundle } = await import(pathToFileURL(path.join(engine, 'config/scripts/build-mobile-web-app-bundle.mjs')).href)
  const result = await buildMobileWebAppBundle({ outDir: out, distributionDir: records })
  const record = JSON.parse(fs.readFileSync(path.join(records, 'mobile.json')))
  const allOutputs = new Set(result.manifest.assets.map(asset => 'out/mobile-web/' + asset.path))
  allOutputs.add('out/mobile-web/manifest.json')
  let count = 0
  for (const bundle of record.bundles) {
    const owners = new Map(bundle.owners.map(owner => [owner.input, owner]))
    for (const [input, info] of Object.entries(bundle.inputs)) {
      count++
      const owner = owners.get(input)
      assert.ok(owner && (!owner.unresolved || owner.virtual), input)
      if (!owner.virtual) {
        assert.ok(owner.package?.name && owner.package?.version, input)
      }
      for (const imported of info.imports) if (!imported.external) assert.ok(Object.hasOwn(bundle.inputs, imported.path), imported.path)
    }
    for (const [inputOutput, output] of Object.entries(bundle.outputs)) {
      const actual = record.outputMap[inputOutput]
      assert.ok(allOutputs.has(actual), actual)
      assert.equal(output.sha256, hash(fs.readFileSync(path.join(directory, actual))))
      for (const input of Object.keys(output.inputs)) assert.ok(Object.hasOwn(bundle.inputs, input), input)
      for (const imported of output.imports) if (!imported.external) assert.ok(allOutputs.has(imported.path), imported.path)
    }
  }
  assert.ok(count > 1000, 'the test must consume the actual mobile graph')
  const rows = [...allOutputs].map(name => ({ path: name,
    sha256: hash(fs.readFileSync(path.join(directory, name))) }))
  const validation = path.join(directory, 'mobile-validation.json')
  function validateMobile(selected, prepared = []) {
    fs.writeFileSync(validation, JSON.stringify({ rows, records: selected, prepared }))
    return spawnSync(process.env.PYTHON || 'python', ['-X', 'utf8', '-c',
      "import importlib.util,json,sys;from pathlib import Path;s=importlib.util.spec_from_file_location('d',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);p=json.loads(Path(sys.argv[2]).read_text());m.validate(Path(sys.argv[3]),p['rows'],p['records'],[],p['prepared'])",
      path.join(root, 'tools/packaging/workbench_distribution.py'), validation, engine], { encoding: 'utf8' })
  }
  const probe = validateMobile([record])
  assert.ok(!probe.error, String(probe.error))
  if (probe.status !== 0) {
    assert.match(probe.stderr, /DistributionError: distribution_notice_missing:/)
    assert.doesNotMatch(probe.stderr, /KeyError|distribution_package_unresolved/)
    t.diagnostic(probe.stderr.trim().split('\n').at(-1))
  }
  await t.test('complete mobile graph and generated helper validate with prepared official notices',
    { skip: !process.env.PACKAGING_NOTICE_INPUTS }, () => {
      const prepared = JSON.parse(fs.readFileSync(process.env.PACKAGING_NOTICE_INPUTS, 'utf8'))
      const accepted = validateMobile([record], prepared)
      assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr)
      const findHelper = selected => Object.values(selected[0].bundles[0].outputs).find(output => output.generated)
      assert.ok(findHelper([record]))
      for (const [mutate, error] of [
        [output => { delete output.generated }, /distribution_output_without_inputs/],
        [output => { output.imports = [{ path: 'unattributed-generated-external', external: true }] }, /distribution_generated_imports/],
        [output => { output.generated.kind = 'unknown' }, /distribution_generated_identity/],
        [output => { output.generated.producer.sha256 = '0'.repeat(64) }, /distribution_generated_source/],
        [output => { output.generated.tool.package.version = '0.0.0' }, /distribution_generated_identity/],
        [output => { output.generated.tool.package.notices = [] }, /distribution_notice_missing/],
        [output => { output.generated.producer.package.notices = [] }, /distribution_notice_missing/],
        [output => { output.generated.producer.package.notices = structuredClone(output.generated.tool.package.notices) }, /distribution_generated_notice_source/],
        [output => { output.sha256 = '0'.repeat(64) }, /distribution_output_hash/]
      ]) {
        const changed = [structuredClone(record)]
        mutate(findHelper(changed))
        const rejected = validateMobile(changed, prepared)
        assert.notEqual(rejected.status, 0)
        assert.match(rejected.stderr, error)
      }
    })
})

test('real Vite worker graph validates across Python and fails without its provider or correct hash', async t => {
  const directory = fixture(t)
  const renderer = path.join(directory, 'src/renderer')
  fs.mkdirSync(renderer, { recursive: true })
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', type: 'module' }))
  fs.writeFileSync(path.join(directory, 'LICENSE'), 'MIT fixture')
  fs.writeFileSync(path.join(renderer, 'web-index.html'), '<script type="module" src="./main.js"></script>')
  fs.writeFileSync(path.join(renderer, 'main.js'), "new Worker(new URL('./worker.js',import.meta.url),{type:'module'});")
  fs.writeFileSync(path.join(renderer, 'worker.js'), "self.onmessage=()=>postMessage('ok');")
  const source = fs.readFileSync(path.join(engine, 'vite.web.config.ts'), 'utf8')
  const functionSource = source.slice(source.indexOf('export function distributionPlugin'), source.indexOf('export default defineConfig'))
  assert.ok(functionSource.startsWith('export function distributionPlugin'))
  const compiled = req('esbuild').transformSync(functionSource, { loader: 'ts', format: 'esm' }).code
  const modulePath = path.join(directory, 'actual-product-plugin.mjs')
  fs.writeFileSync(modulePath, "import {resolve} from 'node:path'; import {createHash} from 'node:crypto';\n" +
    `import {writeDistributionRecord} from '${pathToFileURL(path.join(engine, 'config/scripts/distribution-record.mjs')).href}';\n` + compiled)
  const { distributionPlugin } = await import(pathToFileURL(modulePath).href)
  const vite = await import(pathToFileURL(req.resolve('vite')).href)
  const previous = process.cwd()
  process.chdir(directory)
  try {
    await vite.build({ configFile: false, root: renderer, logLevel: 'error',
      plugins: [distributionPlugin('web')], build: { emptyOutDir: true, outDir: path.join(directory, 'out/web'),
        rollupOptions: { input: path.join(renderer, 'web-index.html') } },
      worker: { format: 'es', plugins: () => [distributionPlugin('web-worker')] } })
  } finally { process.chdir(previous) }
  const recordDir = path.join(directory, '.build/distribution')
  const names = fs.readdirSync(recordDir)
  const records = names.map(name => JSON.parse(fs.readFileSync(path.join(recordDir, name))))
  assert.ok(names.some(name => name.startsWith('web-worker-')))
  assert.ok(records.some(record => record.bundles.some(bundle => Object.values(bundle.outputs).some(output => output.sharedOutput))))
  const rows = []
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name)
      if (fs.statSync(file).isDirectory()) walk(file)
      else rows.push({ path: path.relative(directory, file).replaceAll('\\', '/'), bytes: fs.statSync(file).size, sha256: hash(fs.readFileSync(file)) })
    }
  }
  walk(path.join(directory, 'out/web'))
  const python = process.env.PYTHON || 'python'
  function validate(selected) {
    const input = path.join(directory, 'validation.json')
    fs.writeFileSync(input, JSON.stringify({ rows, records: selected }))
    return spawnSync(python, ['-c',
      "import importlib.util,json,sys;from pathlib import Path;s=importlib.util.spec_from_file_location('d',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);p=json.loads(Path(sys.argv[2]).read_text());m.validate(Path(sys.argv[3]),p['rows'],p['records'],[])",
      path.join(root, 'tools/packaging/workbench_distribution.py'), input, directory], { encoding: 'utf8' })
  }
  const accepted = validate(records)
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr)
  const missing = validate(records.filter((_record, index) => !names[index].startsWith('web-worker-')))
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /distribution_shared_output_unresolved/)
  const changed = structuredClone(records)
  const worker = changed[names.findIndex(name => name.startsWith('web-worker-'))]
  Object.values(worker.bundles[0].outputs)[0].sha256 = '0'.repeat(64)
  const tampered = validate(changed)
  assert.notEqual(tampered.status, 0)
  assert.match(tampered.stderr, /distribution_(output_hash|shared_output_unresolved)/)
})

test('copied web records follow completed PDF writes and preserve upstream build errors', async t => {
  const source = fs.readFileSync(path.join(engine, 'vite.web.config.ts'), 'utf8')
  const functions = source.slice(source.indexOf('export function distributionPlugin'), source.indexOf('export default defineConfig'))
  const compiled = req('esbuild').transformSync(functions, { loader: 'ts', format: 'esm' }).code
  const pdfSource = fs.readFileSync(path.join(engine, 'config/build-plugins/pdfjs-viewer-assets.ts'), 'utf8')
  const vite = await import(pathToFileURL(req.resolve('vite')).href)
  for (const mode of ['delayed-copy', 'missing-copy', 'upstream-error']) {
    await t.test(mode, async t => {
      const directory = fixture(t)
      const renderer = path.join(directory, 'src/renderer')
      fs.mkdirSync(renderer, { recursive: true })
      fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }))
      fs.writeFileSync(path.join(directory, 'LICENSE'), 'MIT fixture')
      fs.writeFileSync(path.join(directory, 'vite.web.config.ts'), source)
      fs.writeFileSync(path.join(renderer, 'web-index.html'), '<script type="module" src="./main.js"></script>')
      fs.writeFileSync(path.join(renderer, 'main.js'), "console.log('fixture');")
      const modulePath = path.join(directory, 'actual-product-plugins.mjs')
      fs.writeFileSync(modulePath, "import {resolve,dirname,join} from 'node:path'; import {readdirSync,statSync} from 'node:fs'; import {createHash} from 'node:crypto'; import {createRequire as nativeRequire} from 'node:module';\n" +
        `const createRequire=()=>nativeRequire(${JSON.stringify(path.join(engine, 'package.json'))});\n` +
        `import {writeDistributionRecord} from '${pathToFileURL(path.join(engine, 'config/scripts/distribution-record.mjs')).href}';\n` + compiled)
      const pdfModule = path.join(directory, 'actual-pdf-plugin.mjs')
      fs.writeFileSync(pdfModule, req('esbuild').transformSync(pdfSource, { loader: 'ts', format: 'esm' }).code)
      const { copiedWebAssetsPlugin } = await import(pathToFileURL(modulePath).href)
      const { createPdfjsViewerAssetsPlugin } = await import(pathToFileURL(pdfModule).href)
      const pdf = createPdfjsViewerAssetsPlugin(path.dirname(req.resolve('pdfjs-dist/package.json')))
      const originalCopy = pdf.writeBundle
      let copied = false
      pdf.writeBundle = async function (...args) {
        await new Promise(resolve => setImmediate(resolve))
        originalCopy.apply(this, args)
        copied = true
        if (mode === 'missing-copy') fs.unlinkSync(path.join(directory, 'out/web/cmaps/78-EUC-H.bcmap'))
      }
      const previous = process.cwd()
      process.chdir(directory)
      try {
        const build = vite.build({ configFile: false, root: renderer, logLevel: 'silent',
          plugins: [copiedWebAssetsPlugin(), pdf, {
            name: 'upstream-error-fixture',
            generateBundle() { if (mode === 'upstream-error') throw Error('original-generate-bundle-failure') }
          }], build: { manifest: true, outDir: path.join(directory, 'out/web'), emptyOutDir: true,
            rollupOptions: { input: path.join(renderer, 'web-index.html') } } })
        if (mode === 'upstream-error') {
          await assert.rejects(build, /original-generate-bundle-failure/)
          assert.equal(copied, false)
        } else if (mode === 'missing-copy') {
          await assert.rejects(build, /ENOENT.*78-EUC-H\.bcmap/s)
          assert.equal(copied, true)
        } else {
          await build
          assert.equal(copied, true)
          const record = JSON.parse(fs.readFileSync(path.join(directory, '.build/distribution/web-copies.json')))
          assert.ok(record.copies.length > 100)
          for (const row of record.copies) assert.equal(row.sha256, hash(fs.readFileSync(path.join(directory, row.output))))
          assert.ok(record.copies.some(row => row.output === 'out/web/.vite/manifest.json'))
        }
        if (mode !== 'delayed-copy') assert.equal(fs.existsSync(path.join(directory, '.build/distribution/web-copies.json')), false)
      } finally { process.chdir(previous) }
    })
  }
})

test('actual ws bundle uses product JS and Node fallbacks with no optional native imports', async t => {
  const directory = fixture(t)
  const { ORCAD_COMMONJS_MODULE_OPTIONS } = await import(pathToFileURL(path.join(engine, 'config/scripts/orcad-entry-build.mjs')).href)
  const esbuild = req('esbuild')
  const ws = req.resolve('ws')
  const input = { contents: `module.exports = require(${JSON.stringify(ws)})`, resolveDir: engine, loader: 'js' }
  const baseline = await esbuild.build({ stdin: input, bundle: true, platform: 'node', format: 'cjs', write: false, metafile: true })
  const external = result => Object.values(result.metafile.outputs).flatMap(output => output.imports.filter(i => i.external).map(i => i.path))
  assert.ok(external(baseline).includes('bufferutil'))
  assert.ok(external(baseline).includes('utf-8-validate'))
  const outfile = path.join(directory, 'ws-fallback.cjs')
  const result = await esbuild.build({ ...ORCAD_COMMONJS_MODULE_OPTIONS, stdin: input, outfile,
    bundle: true, platform: 'node', format: 'cjs', metafile: true })
  assert.ok(!external(result).includes('bufferutil'))
  assert.ok(!external(result).includes('utf-8-validate'))
  const runner = path.join(directory, 'roundtrip.cjs')
  fs.writeFileSync(runner, `
const assert = require('node:assert/strict');
const Module = require('node:module');
const { once } = require('node:events');
process.env.WS_NO_BUFFER_UTIL = '';
process.env.WS_NO_UTF_8_VALIDATE = '';
let nativeAttempts = 0;
const original = Module._load;
Module._load = function(name, ...args) {
  if (name === 'bufferutil' || name === 'utf-8-validate') { nativeAttempts++; throw Error('native provider absent'); }
  return original.call(this, name, ...args);
};
const WebSocket = require('./ws-fallback.cjs');
(async () => {
  const server = new WebSocket.WebSocketServer({ host: '127.0.0.1', port: 0 });
  try {
    await once(server, 'listening');
    const accepted = once(server, 'connection');
    const client = new WebSocket('ws://127.0.0.1:' + server.address().port);
    const [peer] = await accepted;
    peer.on('message', (data, binary) => peer.send(data, { binary }));
    await once(client, 'open');
    for (const payload of ['UTF-8: 你好 🌍'.repeat(200), Buffer.alloc(1024, 173)]) {
      const response = once(client, 'message'); client.send(payload);
      const [actual, binary] = await response;
      assert.equal(binary, Buffer.isBuffer(payload));
      assert.deepEqual(actual, Buffer.from(payload));
    }
    const closed = once(client, 'close'); client.close(); await closed;
    assert.equal(nativeAttempts, 0);
    console.log('masked text and binary roundtrips; no optional native provider loaded');
  } finally { for (const client of server.clients) client.terminate(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
`)
  const probe = spawnSync(process.execPath, [runner], { encoding: 'utf8', timeout: 15000 })
  assert.equal(probe.status, 0, probe.stdout + probe.stderr)
  assert.match(probe.stdout, /no optional native provider loaded/)
})

test('actual Vite browser external input records its exact stub and rejects lost or changed provenance', async t => {
  const directory = fixture(t)
  const renderer = path.join(directory, 'src/renderer')
  fs.mkdirSync(renderer, { recursive: true })
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }))
  fs.writeFileSync(path.join(directory, 'LICENSE'), 'MIT fixture')
  fs.writeFileSync(path.join(renderer, 'web-index.html'), '<script type="module" src="./main.js"></script>')
  fs.writeFileSync(path.join(renderer, 'main.js'), "import fs from 'node:fs'; import icon from './fixture.svg'; console.log(fs, icon);")
  fs.writeFileSync(path.join(renderer, 'fixture.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')
  const source = fs.readFileSync(path.join(engine, 'vite.web.config.ts'), 'utf8')
  fs.writeFileSync(path.join(directory, 'vite.web.config.ts'), source)
  const actualVite = path.dirname(req.resolve('vite/package.json'))
  const fixtureVite = path.join(directory, 'node_modules/vite')
  for (const name of ['package.json', 'dist/node/chunks/node.js', ...fs.readdirSync(actualVite).filter(n => /^(license|notice)/i.test(n))]) {
    const target = path.join(fixtureVite, name)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(actualVite, name), target)
  }
  const functions = source.slice(source.indexOf('export function distributionPlugin'), source.indexOf('export default defineConfig'))
  const modulePath = path.join(directory, 'actual-product-plugin.mjs')
  fs.writeFileSync(modulePath, "import {resolve} from 'node:path'; import {createHash} from 'node:crypto';\n" +
    `import {sourceOwner,writeDistributionRecord} from '${pathToFileURL(path.join(engine, 'config/scripts/distribution-record.mjs')).href}';\n` +
    req('esbuild').transformSync(functions, { loader: 'ts', format: 'esm' }).code)
  const { distributionPlugin } = await import(pathToFileURL(modulePath).href)
  const vite = await import(pathToFileURL(req.resolve('vite')).href)
  const previous = process.cwd()
  process.chdir(directory)
  try {
    await vite.build({ configFile: false, root: renderer, logLevel: 'silent', plugins: [distributionPlugin('web')],
      build: { outDir: path.join(directory, 'out/web'), assetsInlineLimit: 0, rollupOptions: { input: path.join(renderer, 'web-index.html') } } })
  } finally { process.chdir(previous) }
  const record = JSON.parse(fs.readFileSync(path.join(directory, '.build/distribution/web.json')))
  const info = record.bundles[0].inputs['__vite-browser-external']
  assert.equal(info.generated.code, 'module.exports = {}')
  assert.ok(record.bundles[0].owners.some(owner => owner.input === 'src/renderer/fixture.svg' && owner.package?.name === 'fixture'))
  const rows = Object.entries(record.bundles[0].outputs).map(([name, output]) => ({ path: name, sha256: output.sha256 }))
  function validate(selected) {
    const input = path.join(directory, 'stub-validation.json')
    fs.writeFileSync(input, JSON.stringify({ rows, records: [selected] }))
    return spawnSync(process.env.PYTHON || 'python', ['-X', 'utf8', '-c',
      "import importlib.util,json,sys;from pathlib import Path;s=importlib.util.spec_from_file_location('d',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);p=json.loads(Path(sys.argv[2]).read_text());m.validate(Path(sys.argv[3]),p['rows'],p['records'],[])",
      path.join(root, 'tools/packaging/workbench_distribution.py'), input, directory], { encoding: 'utf8' })
  }
  const accepted = validate(record)
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr)
  for (const [mutate, error] of [
    [row => { delete row.generated }, /distribution_vite_browser_identity/],
    [row => { row.generated.code = 'invented stub' }, /distribution_vite_browser_identity/],
    [row => { row.generated.sha256 = '0'.repeat(64) }, /distribution_vite_browser_identity/],
    [row => { row.imports = [{ path: 'unknown', external: true }] }, /distribution_vite_browser_identity/],
    [row => { row.generated.tool.sha256 = '0'.repeat(64) }, /distribution_vite_browser_source/],
    [row => { row.generated.tool.package.notices = [] }, /distribution_notice_missing/],
    [row => { row.generated.producer.package.notices = [] }, /distribution_notice_missing/],
    [row => { row.generated.tool.package.version = '0.0.0' }, /distribution_vite_browser_package/]
  ]) {
    const changed = structuredClone(record)
    mutate(changed.bundles[0].inputs['__vite-browser-external'])
    const rejected = validate(changed)
    assert.notEqual(rejected.status, 0)
    assert.match(rejected.stderr, error)
  }
})
