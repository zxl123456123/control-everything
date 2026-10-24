const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createRequire } = require('node:module')
const engine = path.resolve(__dirname, '../../web/workbench-engine')
const helper = import(pathToFileURL(path.join(engine, 'config/scripts/distribution-record.mjs')).href)

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'distribution-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const write = (name, value) => {
    const file = path.join(root, name)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, value)
    return file
  }
  write('package.json', JSON.stringify({ name: 'fixture', version: '1.0.0' }))
  write('LICENSE', 'MIT fixture')
  return { root, write }
}

test('module scopes retain package identity without crossing dependency or vendor boundaries', async t => {
  const { root, write } = fixture(t)
  const { sourceOwner } = await helper
  write('node_modules/parent/package.json', JSON.stringify({ name: 'parent', version: '2.0.0' }))
  write('node_modules/parent/LICENSE', 'MIT parent')
  write('node_modules/parent/lib/package.json', JSON.stringify({ type: 'module', main: './index.cjs' }))
  write('node_modules/parent/lib/index.js', 'export default 1')
  assert.equal(sourceOwner(root, 'node_modules/parent/lib/index.js').package.name, 'parent')
  write('node_modules/parent/vendor/package.json', JSON.stringify({ name: 'vendor' }))
  write('node_modules/parent/vendor/index.js', 'export default 1')
  assert.throws(() => sourceOwner(root, 'node_modules/parent/vendor/index.js'), /distribution_package_identity_incomplete/)
  write('node_modules/parent/node_modules/missing/index.js', 'export default 1')
  assert.equal(sourceOwner(root, 'node_modules/parent/node_modules/missing/index.js').unresolved, true)
  write('node_modules/@scope/missing/package.json', JSON.stringify({ type: 'module' }))
  write('node_modules/@scope/missing/index.js', 'export default 1')
  assert.throws(() => sourceOwner(root, 'node_modules/@scope/missing/index.js'), /distribution_package_identity_incomplete/)
})

test('actual noble and react-i18next typed subscopes retain their exact published identity', async t => {
  const { sourceOwner } = await helper
  for (const [name, relative, version] of [['@noble/hashes', 'esm/sha256.js', '1.8.0'],
    ['react-i18next', 'dist/es/index.js', '17.0.15']]) {
    const store = path.join(engine, 'node_modules/.pnpm')
    const prefix = name.replace('/', '+') + '@' + version
    const slot = fs.readdirSync(store).find(name => name === prefix || name.startsWith(prefix + '_'))
    assert.ok(slot, prefix)
    const metadata = path.join(store, slot, 'node_modules', name, 'package.json')
    const file = path.join(path.dirname(metadata), relative)
    assert.ok(fs.existsSync(file), file)
    const owner = sourceOwner(engine, file)
    assert.equal(owner.package.name, name)
    assert.equal(owner.package.version, version)
    assert.equal(owner.package.metadataSha256, require('node:crypto').createHash('sha256').update(fs.readFileSync(metadata)).digest('hex'))
  }
  const { root, write } = fixture(t)
  const scope = 'node_modules/@scope/pkg/esm/'
  write(scope + 'package.json', JSON.stringify({ type: 'module', version: '1.0.0', node: { './crypto': './crypto.js' } }))
  write(scope + 'index.js', 'export default 1')
  assert.equal(sourceOwner(root, scope + 'index.js').unresolved, true)
  for (const invalid of [{ type: 'module' }, { name: '@scope/pkg' }, { version: '1.0.0' }]) {
    write('node_modules/@scope/pkg/package.json', JSON.stringify(invalid))
    assert.throws(() => sourceOwner(root, scope + 'index.js'), /distribution_package_identity_incomplete/)
  }
  write('node_modules/@scope/pkg/package.json', JSON.stringify({ name: '@scope/pkg', version: '2.0.0' }))
  assert.throws(() => sourceOwner(root, scope + 'index.js'), /distribution_package_scope_version_mismatch/)
  write(scope + 'package.json', JSON.stringify({ type: 'module', name: 'incomplete-named-scope' }))
  assert.throws(() => sourceOwner(root, scope + 'index.js'), /distribution_package_identity_incomplete/)
})

test('actual esbuild dynamic chunk inputs and hashes survive recording', async t => {
  const { root, write } = fixture(t)
  write('main.js', "export const load = () => import('./lazy.js')")
  write('lazy.js', 'export default 42')
  const esbuild = createRequire(path.join(engine, 'package.json'))('esbuild')
  const result = await esbuild.build({ absWorkingDir: root, entryPoints: ['main.js'], bundle: true,
    splitting: true, format: 'esm', outdir: 'out/web', metafile: true })
  const { writeDistributionRecord } = await helper
  writeDistributionRecord(root, 'web', [result.metafile])
  const record = JSON.parse(fs.readFileSync(path.join(root, '.build/distribution/web.json')))
  assert.equal(Object.keys(record.bundles[0].outputs).length, 2)
  for (const output of Object.values(record.bundles[0].outputs)) assert.match(output.sha256, /^[a-f0-9]{64}$/)
  assert.equal(record.bundles[0].owners.length, 2)
  assert.ok(record.builtinModules.includes('node:fs'))
})

test('binary child only reuses exact version parent optional dependency notice', async t => {
  const { root, write } = fixture(t)
  write('node_modules/esbuild/package.json', JSON.stringify({ name: 'esbuild', version: '1.0.0', optionalDependencies: { '@esbuild/win32-x64': '1.0.0' } }))
  write('node_modules/esbuild/LICENSE.md', 'MIT binary fixture')
  write('node_modules/@esbuild/win32-x64/package.json', JSON.stringify({ name: '@esbuild/win32-x64', version: '1.0.0' }))
  write('node_modules/@esbuild/win32-x64/bin.exe', 'binary')
  const owner = (await helper).sourceOwner(root, 'node_modules/@esbuild/win32-x64/bin.exe')
  assert.equal(owner.package.licenseParent.version, '1.0.0')
  assert.equal(owner.package.notices[0].text, 'MIT binary fixture')
})

test('wrong version parent cannot supply a binary child license', async t => {
  const { root, write } = fixture(t)
  write('node_modules/esbuild/package.json', JSON.stringify({ name: 'esbuild', version: '2.0.0', optionalDependencies: { '@esbuild/win32-x64': '1.0.0' } }))
  write('node_modules/@esbuild/win32-x64/package.json', JSON.stringify({ name: '@esbuild/win32-x64', version: '1.0.0' }))
  write('node_modules/@esbuild/win32-x64/bin.exe', 'binary')
  const { sourceOwner } = await helper
  assert.throws(() => sourceOwner(root, 'node_modules/@esbuild/win32-x64/bin.exe'), /distribution_license_parent_version/)
})

test('nested vendor license is never borrowed for its parent package', async t => {
  const { root, write } = fixture(t)
  write('node_modules/pkg/package.json', JSON.stringify({ name: 'pkg', version: '1.0.0' }))
  write('node_modules/pkg/main.js', 'fixture')
  write('node_modules/pkg/vendor/other/LICENSE', 'unrelated')
  const owner = (await helper).sourceOwner(root, 'node_modules/pkg/main.js')
  assert.deepEqual(owner.package.notices, [])
})

test('metafile working directory preserves mobile package version and every input reference', async t => {
  const { root, write } = fixture(t)
  for (const [base, version] of [['', '1.0.0'], ['mobile/', '2.0.0']]) {
    write(base + 'node_modules/pkg/package.json', JSON.stringify({ name: 'pkg', version, main: 'index.js' }))
    write(base + 'node_modules/pkg/index.js', `export default ${JSON.stringify(version)}`)
    write(base + 'node_modules/pkg/LICENSE', 'MIT ' + version)
  }
  write('mobile/main.js', "import value from 'pkg'; console.log(value)")
  const esbuild = createRequire(path.join(engine, 'package.json'))('esbuild')
  const result = await esbuild.build({ absWorkingDir: path.join(root, 'mobile'), entryPoints: ['main.js'],
    bundle: true, format: 'esm', outfile: path.join(root, 'out/web/main.js'), metafile: true })
  const { writeDistributionRecord } = await helper
  writeDistributionRecord(root, 'mobile', [result.metafile], {}, [], { absWorkingDir: path.join(root, 'mobile') })
  const record = JSON.parse(fs.readFileSync(path.join(root, '.build/distribution/mobile.json')))
  const bundle = record.bundles[0]
  const owner = bundle.owners.find(owner => owner.package?.name === 'pkg')
  assert.equal(owner.package.version, '2.0.0')
  assert.equal(owner.package.notices[0].text, 'MIT 2.0.0')
  assert.ok(Object.hasOwn(bundle.inputs, 'mobile/main.js'))
  for (const output of Object.values(bundle.outputs)) {
    for (const input of Object.keys(output.inputs)) assert.ok(Object.hasOwn(bundle.inputs, input), input)
  }
  for (const input of Object.values(bundle.inputs)) {
    for (const imported of input.imports) if (!imported.external) assert.ok(Object.hasOwn(bundle.inputs, imported.path), imported.path)
  }
})
