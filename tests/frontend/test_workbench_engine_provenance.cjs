'use strict';
// Isolated source-reader fixtures: no install, native build, runtime or skills launch.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const source = path.resolve(__dirname, '../../web/workbench-engine');
const commit = '32370a5e05a22935adb79f6cbf83a3228fe879ac';
let root;
const write = (name, contents) => {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
};
const run = () => spawnSync(process.execPath, ['--input-type=module', '-e',
  `import {resolveBuildSourceCommit} from ${JSON.stringify(pathToFileURL(path.join(root, 'config/scripts/build-source-commit.mjs')).href)}; console.log(resolveBuildSourceCommit());`],
  { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: '', GIT_COMMIT: 'f'.repeat(40) } });
test.beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-source-test-'));
  write('config/scripts/build-source-commit.mjs', fs.readFileSync(path.join(source, 'config/scripts/build-source-commit.mjs')));
  write('build-origin.json', JSON.stringify({ repository: 'https://github.com/stablyai/orca', upstreamCommit: commit }));
});
test.afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
test('upstream identity is read beside the module without git or cwd dependence', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), commit);
  write('.git/HEAD', 'ref: refs/heads/host\n');
  write('.git/refs/heads/host', 'f'.repeat(40) + '\n');
  assert.equal(run().stdout.trim(), commit);
  write('.git/refs/heads/host', 'a'.repeat(40) + '\n');
  assert.equal(run().stdout.trim(), commit);
});
test('missing, malformed and wrong repository provenance never falls back to host git', () => {
  fs.unlinkSync(path.join(root, 'build-origin.json'));
  assert.notEqual(run().status, 0);
  for (const origin of [{ upstreamCommit: 'short' }, { upstreamCommit: 'F'.repeat(40) },
    { repository: 'https://example.invalid/other', upstreamCommit: commit }]) {
    write('build-origin.json', JSON.stringify(origin));
    assert.notEqual(run().status, 0);
  }
  write('build-origin.json', '{');
  assert.notEqual(run().status, 0);
});

test('adapted skills use the platform commit while upstream provenance stays fixed', () => {
  const script = pathToFileURL(path.join(source, 'config/scripts/build-source-commit.mjs')).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import {resolveBuildSourceCommit, resolveWorkbenchBuildCommit} from ${JSON.stringify(script)}; console.log(JSON.stringify({upstream:resolveBuildSourceCommit(),workbench:resolveWorkbenchBuildCommit()}));`],
    { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const expected = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' });
  assert.equal(expected.status, 0, expected.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { upstream: commit, workbench: expected.stdout.trim() });
  assert.notEqual(expected.stdout.trim(), commit);
});

async function nativeFixture() {
  for (const name of ['config/scripts/build-windows-process-tree-addon.mjs',
    'config/scripts/native-build-entry.cjs', 'config/scripts/windows-process-tree-prepared-addon.mjs',
    'config/scripts/windows-process-tree-gyp-rebuild.mjs', 'config/scripts/windows-pe-machine.cjs',
    'src/shared/orcad-artifacts.ts']) write(name, fs.readFileSync(path.join(source, name)));
  write('node_modules/@orca/process-host/package.json', JSON.stringify({ type: 'module', exports: './index.js' }));
  write('node_modules/@orca/process-host/index.js', 'export function runProcessSync() { throw new Error("native process must not run"); }');
  return import(pathToFileURL(path.join(root, 'config/scripts/build-windows-process-tree-addon.mjs')).href);
}
test('native scratch always copies patched source into a fresh child and excludes old build', async () => {
  const build = await nativeFixture();
  write('installed/binding.gyp', 'patched binding');
  write('installed/src/process.cc', 'patched source');
  write('installed/build/Release/stale.node', 'stale binary');
  write('short/pt-existing/keep.txt', 'belongs to an earlier run');
  const result = build.prepareScratch(path.join(root, 'short'), path.join(root, 'installed'));
  assert.notEqual(result.scratch, path.join(root, 'short/pt-existing'));
  assert.equal(path.dirname(result.scratch), fs.realpathSync(path.join(root, 'short')));
  assert.equal(fs.readFileSync(path.join(result.packageDir, 'src/process.cc'), 'utf8'), 'patched source');
  assert.equal(fs.existsSync(path.join(result.packageDir, 'build')), false);
  assert.equal(fs.readFileSync(path.join(root, 'short/pt-existing/keep.txt'), 'utf8'), 'belongs to an earlier run');
  assert.equal(fs.readFileSync(path.join(root, 'installed/build/Release/stale.node'), 'utf8'), 'stale binary');
});
test('native scratch rejects relative paths and linked parents without running a compiler', async () => {
  const build = await nativeFixture();
  assert.throws(() => build.parseArgs(['--scratch-root=relative']), /absolute/);
  assert.throws(() => build.parseArgs(['--scratch-root']), /unknown_build_argument/);
  assert.throws(() => build.prepareScratch('relative'), /absolute/);
  fs.mkdirSync(path.join(root, 'actual'));
  fs.symlinkSync(path.join(root, 'actual'), path.join(root, 'linked'), 'junction');
  assert.throws(() => build.prepareScratch(path.join(root, 'linked')), /linked_scratch_root/);
  assert.deepEqual(fs.readdirSync(path.join(root, 'actual')), []);
});

// These lock-reader cases use the same installed YAML parser as the output probe.
const yamlPath = path.join(source, 'node_modules/yaml/package.json');
function lockPackages(text) {
  const builder = fs.readFileSync(path.resolve(__dirname, '../../tools/packaging/workbench_engine.py'), 'utf8');
  const code = builder.match(/LOCK_PACKAGES_READER = r"""([\s\S]*?)"""/)[1];
  const yaml = createRequire(path.join(source, 'package.json'))('yaml');
  return new Function('source', 'yaml', code + '\nreturn readLockPackages(source,yaml);')(text, yaml);
}
// A minimal copy of the real PNPM 12 two-document shape; these values are never installed.
const managerLock = "---\nlockfileVersion: '9.0'\nimporters:\n  .:\n    packageManagerDependencies:\n      pnpm: {specifier: 12.14.0, version: 12.14.0}\npackages:\n  pnpm@12.14.0:\n    resolution: {integrity: sha512-fixture-manager}\nsnapshots: {}\n";
const workspaceLock = "---\nlockfileVersion: '9.0'\nsettings: {autoInstallPeers: true}\nimporters:\n  .:\n    dependencies:\n      yaml: {specifier: 2.9.1, version: 2.9.1}\npackages:\n  yaml@2.9.1:\n    resolution: {integrity: sha512-fixture-workspace}\nsnapshots: {}\n";
const lockTestOptions = { skip: !fs.existsSync(yamlPath) && 'Install the fixed engine dependencies for YAML parser tests' };
test('PNPM 12 package-manager and workspace documents both contribute provenance', lockTestOptions, () => {
  const packages = lockPackages(managerLock + workspaceLock);
  assert.deepEqual(Object.keys(packages), ['pnpm@12.14.0', 'yaml@2.9.1']);
  assert.equal(packages['yaml@2.9.1'].resolution.integrity, 'sha512-fixture-workspace');
});
test('malformed later lock documents and repeated YAML keys retain parser errors', lockTestOptions, () => {
  for (const broken of ["---\npackages: [broken\n", "---\nlockfileVersion: '9.0'\npackages: {}\npackages: {}\n"]) {
    assert.throws(() => lockPackages(managerLock + broken), error => error instanceof AggregateError && error.errors.length > 0);
  }
});
test('duplicate packages across lock documents cannot overwrite an earlier definition', lockTestOptions, () => {
  assert.throws(() => lockPackages(managerLock + managerLock), /duplicate_lock_package:pnpm@12.14.0/);
  assert.throws(() => lockPackages(managerLock + workspaceLock.replaceAll('yaml@2.9.1', 'pnpm@12.14.0')), /duplicate_lock_package/);
});
test('lock documents need the frozen version and a packages mapping', lockTestOptions, () => {
  for (const invalid of ['', "---\nlockfileVersion: '9.0'\n", "---\nlockfileVersion: '9.0'\npackages: []\n",
    workspaceLock.replace("'9.0'", "'10.0'")]) {
    assert.throws(() => lockPackages(invalid), /lock_(documents_missing|packages_document_invalid)/);
  }
});
