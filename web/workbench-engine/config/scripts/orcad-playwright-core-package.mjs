import { createRequire } from 'node:module'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

export const NEWS_PLAYWRIGHT_CORE_VERSION = '1.64.0'

/** Export one locked package as ordinary files; callers record every copy's ownership. */
export function stageOrcadPlaywrightCore(root, outputRoot) {
  const declared = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies?.['playwright-core']
  const metadata = createRequire(join(root, 'package.json')).resolve('playwright-core/package.json')
  const source = realpathSync(dirname(metadata))
  const pkg = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
  if (declared !== NEWS_PLAYWRIGHT_CORE_VERSION || pkg.name !== 'playwright-core' || pkg.version !== declared ||
      Object.keys(pkg.dependencies ?? {}).length || Object.keys(pkg.optionalDependencies ?? {}).length) {
    throw new Error('news_playwright_core_identity')
  }
  for (const required of ['index.js', 'package.json', 'LICENSE', 'NOTICE']) {
    if (!existsSync(join(source, required)) || !lstatSync(join(source, required)).isFile()) {
      throw new Error(`news_playwright_core_missing:${required}`)
    }
  }
  const files = []
  function visit(directory, prefix = '') {
    for (const name of readdirSync(directory).sort()) {
      // pnpm's generated peer/bin shims are installation state, not this package's files.
      if (!prefix && name === 'node_modules') continue
      const path = join(directory, name), info = lstatSync(path), key = prefix + name
      if (info.isSymbolicLink()) throw new Error('news_playwright_core_link')
      if (info.isDirectory()) visit(path, key + '/')
      else if (info.isFile()) files.push(key)
      else throw new Error('news_playwright_core_file_type')
    }
  }
  visit(source)
  const parent = resolve(outputRoot), target = join(parent, 'node_modules', 'playwright-core')
  mkdirSync(parent, { recursive: true })
  if (lstatSync(parent).isSymbolicLink()) throw new Error('news_playwright_core_output_link')
  for (const path of [join(parent, 'node_modules'), target]) {
    if (existsSync(path) && (lstatSync(path).isSymbolicLink() || relative(realpathSync(parent), realpathSync(path)).startsWith('..'))) {
      throw new Error('news_playwright_core_output_link')
    }
  }
  // The absolute target has been checked to remain in this owned output root.
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  return files.map((name) => {
    const input = join(source, ...name.split('/')), output = join(target, ...name.split('/'))
    mkdirSync(dirname(output), { recursive: true })
    copyFileSync(input, output)
    return { source: input, output }
  })
}
