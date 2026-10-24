// Build evidence lives outside shipped output trees and never changes artifact hashes.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { builtinModules, createRequire } from 'node:module'
import { basename } from 'node:path'

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
export function sourceOwner(root, input) {
  const clean = input.replace(/^\0/, '').split('?')[0]
  const file = resolve(root, clean)
  if (!existsSync(file) || !statSync(file).isFile()) return { input, virtual: input.startsWith('\0') || input.startsWith('<') || ['orcad-parcel-watcher-entry.js', 'orcad-linear-sdk-entry.js'].includes(input), unresolved: true }
  const physical = realpathSync(file)
  let directory = dirname(physical)
  while (true) {
    const packageRoot = basename(dirname(directory)) === 'node_modules' ||
      (basename(dirname(directory)).startsWith('@') && basename(dirname(dirname(directory))) === 'node_modules')
    const metadata = join(directory, 'package.json')
    if (existsSync(metadata)) {
      const pkg = JSON.parse(readFileSync(metadata, 'utf8'))
      if (typeof pkg.name !== 'string' || !pkg.name || typeof pkg.version !== 'string' || !pkg.version) {
        const scopeFields = ['type', 'main', 'module', 'types', 'typings', 'exports', 'imports', 'browser', 'react-native', 'sideEffects']
        if (!packageRoot && !Object.hasOwn(pkg, 'name') && !Object.hasOwn(pkg, 'version') &&
            Object.keys(pkg).length && Object.keys(pkg).every(key => scopeFields.includes(key))) {
          directory = dirname(directory)
          continue
        }
        throw Error('distribution_package_identity_incomplete:' + relative(root, metadata).replaceAll('\\', '/'))
      }
      const local = !relative(root, physical).startsWith('..') && !physical.replaceAll('\\', '/').includes('/node_modules/')
      let noticeRoot = local && !existsSync(join(directory, 'LICENSE')) ? root : directory
      let licenseParent
      const parents = { '@esbuild/win32-x64': 'esbuild', '@napi-rs/canvas-win32-x64-msvc': '@napi-rs/canvas' }
      if (parents[pkg.name]) {
        const parentMetadata = createRequire(join(root, 'package.json')).resolve(parents[pkg.name] + '/package.json')
        const parent = JSON.parse(readFileSync(parentMetadata, 'utf8'))
        if (parent.version !== pkg.version || parent.optionalDependencies?.[pkg.name] !== pkg.version) {
          throw Error('distribution_license_parent_version:' + pkg.name)
        }
        noticeRoot = dirname(parentMetadata)
        licenseParent = { name: parent.name, version: parent.version, metadataSha256: hash(readFileSync(parentMetadata)) }
      }
      const notices = readdirSync(noticeRoot).filter(name => /^(licen[sc]e|notice|copying)(\.|$|-)/i.test(name))
        .filter(name => statSync(join(noticeRoot, name)).isFile()).map(name => {
          const text = readFileSync(join(noticeRoot, name), 'utf8')
          return { source: relative(root, join(noticeRoot, name)).replaceAll('\\', '/'), text, sha256: hash(Buffer.from(text)) }
        })
      return { input, sha256: hash(readFileSync(file)), package: { name: pkg.name, version: pkg.version, local,
        metadataSha256: hash(readFileSync(metadata)), source: pkg.repository ?? pkg.homepage ?? null, notices,
        ...(licenseParent ? { licenseParent } : {}) } }
    }
    const parent = dirname(directory)
    if (packageRoot || parent === directory) return { input, sha256: hash(readFileSync(file)), unresolved: true }
    directory = parent
  }
}

export function writeDistributionRecord(root, label, metafiles, outputMap = {}, copies = [], options = {}) {
  const workingDirectory = options.absWorkingDir ?? root
  const virtual = name => name.startsWith('\0') || name.startsWith('<') ||
    ['orcad-parcel-watcher-entry.js', 'orcad-linear-sdk-entry.js'].includes(name)
  const inputPath = name => virtual(name) ? name : relative(root, resolve(workingDirectory, name)).replaceAll('\\', '/')
  const mappedOutputs = {}
  for (const meta of metafiles) for (const name of Object.keys(meta.outputs)) {
    mappedOutputs[inputPath(name)] = outputMap[name] ?? outputMap[basename(name)] ?? inputPath(name)
  }
  const imports = entries => (entries ?? []).map(entry => ({ ...entry,
    path: entry.external ? entry.path : (mappedOutputs[inputPath(entry.path)] ?? inputPath(entry.path)) }))
  const bundles = metafiles.map(meta => ({
    inputs: Object.fromEntries(Object.entries(meta.inputs).map(([name, info]) =>
      [inputPath(name), { ...info, imports: imports(info.imports) }])),
    outputs: Object.fromEntries(Object.entries(meta.outputs).map(([name, output]) => {
      const mapped = mappedOutputs[inputPath(name)]
      const file = resolve(root, mapped)
      return [inputPath(name), { ...output,
        ...(output.entryPoint ? { entryPoint: inputPath(output.entryPoint) } : {}),
        inputs: Object.fromEntries(Object.entries(output.inputs ?? {}).map(([name, info]) => [inputPath(name), info])),
        imports: imports(output.imports),
        sha256: output.sha256 ?? (existsSync(file) ? hash(readFileSync(file)) : null) }]
    })), owners: Object.keys(meta.inputs).map(input => sourceOwner(root, inputPath(input))) }))
  const directory = options.recordDirectory ?? join(root, '.build', 'distribution')
  mkdirSync(directory, { recursive: true })
  const rootPrefix = resolve(root).replaceAll('\\', '/') + '/'
  const portablePath = value => value.replaceAll('\\', '/').startsWith(rootPrefix)
    ? value.replaceAll('\\', '/').slice(rootPrefix.length) : value
  function portable(value, field) {
    if (field === 'text') return value
    if (typeof value === 'string') return portablePath(value)
    if (Array.isArray(value)) return value.map(item => portable(item))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [portablePath(key), portable(item, key)]))
    return value
  }
  writeFileSync(join(directory, label + '.json'), JSON.stringify(portable({ schema: 1, bundles, outputMap: mappedOutputs,
    builtinModules: [...builtinModules, ...builtinModules.map(name => 'node:' + name)],
    copies: copies.map(({ source, output, sha256 }) => ({ output,
      sha256: sha256 ?? hash(readFileSync(resolve(root, output))), owner: sourceOwner(root, source) })) }), null, 2) + '\n')
}
