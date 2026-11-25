// node-gyp rebuild of one staged addon against the pinned Node headers, shared by every slot addon.
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { prebuildCompileGypi } from './orcad-prebuild-slot-contents.mjs'

const require = createRequire(import.meta.url)
const ROOT = join(import.meta.dirname, '..', '..')

/** Copies node-addon-api beside a staged addon, since scratch copies leave the pnpm tree behind. */
export function stageNodeAddonApi(sourceDir, stagedDir) {
  const addonApiDir = dirname(
    require.resolve('node-addon-api/package.json', { paths: [sourceDir] })
  )
  cpSync(addonApiDir, join(stagedDir, 'node_modules', 'node-addon-api'), {
    recursive: true,
    dereference: true
  })
}

export async function nodeGypRebuild({
  stagedDir,
  workDir,
  nodeDir,
  staticCxxRuntime,
  runProcess
}) {
  if (process.platform === 'win32' && basename(stagedDir) === 'node-pty') {
    // Keep assertion filenames stable without changing their source line numbers.
    const sourcePath = join(stagedDir, 'src', 'win', 'conpty.cc')
    const marker = '#line 1 "/source/node-pty/src/win/conpty.cc"\n'
    const source = readFileSync(sourcePath, 'utf8')
    if (!source.startsWith(marker)) writeFileSync(sourcePath, marker + source)
  }
  const compileGypi = join(workDir, 'prebuild-compile.gypi')
  writeFileSync(compileGypi, prebuildCompileGypi({ staticCxxRuntime }))
  const execute = runProcess ?? (await import('@orca/process-host')).runProcessSync
  let environment = process.env
  if (process.platform === 'win32') {
    const { initializeWindowsNativeToolchain, mergeWindowsCompilerEnvironment } =
      await import('./initialize-windows-native-toolchain.mjs')
    const compilerEnvironment = initializeWindowsNativeToolchain()
    if (compilerEnvironment) {
      environment = mergeWindowsCompilerEnvironment(environment, compilerEnvironment)
    }
  }
  const result = execute({
    program: process.execPath,
    args: [
      join(ROOT, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js'),
      'rebuild',
      `--nodedir=${nodeDir}`,
      '--',
      '-I',
      compileGypi
    ],
    cwd: stagedDir,
    env: environment,
    stdio: 'inherit',
    timeoutMs: null
  })
  if (result.code !== 0) {
    throw new Error(`[orcad-prebuilds] node-gyp rebuild failed (status ${result.code})`)
  }
  return join(stagedDir, 'build', 'Release')
}
