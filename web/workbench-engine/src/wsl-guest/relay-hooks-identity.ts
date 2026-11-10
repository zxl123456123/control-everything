import { randomUUID } from 'node:crypto'
import {
  lstatSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  symlinkSync,
  unlinkSync
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { hasManagedEndpoint, retireLegacyEndpoint } from './wsl-hook-endpoint-identity'
import { OMP_FRESH_CONFIG_FILENAME, OMP_FRESH_CONFIG_SOURCE } from '../shared/omp-fresh-launch'

export const RELAY_HOOKS_DIR = '.zkyq-relay'

function managedExtension(path: string): boolean {
  const stat = lstatSync(path, { throwIfNoEntry: false })
  return Boolean(
    stat?.isFile() &&
    stat.size <= 1024 * 1024 &&
    /@(?:zkyq|orca)-managed-pi-extension/.test(readFileSync(path, 'utf8'))
  )
}

function managedEndpointDirectories(root: string): string[] {
  const hooks = join(root, 'agent-hooks')
  const hookStat = lstatSync(hooks, { throwIfNoEntry: false })
  if (!hookStat?.isDirectory() || hookStat.isSymbolicLink()) return []
  const candidates = [hooks]
  for (const entry of readdirSync(hooks, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.isSymbolicLink()) candidates.push(join(hooks, entry.name))
  }
  return candidates.filter((directory) => hasManagedEndpoint(directory))
}

function managedRoot(root: string): boolean {
  if (managedEndpointDirectories(root).length > 0) return true
  const pinned = lstatSync(join(root, 'omp-managed-status-extension'), { throwIfNoEntry: false })
  if (
    pinned?.isDirectory() &&
    !pinned.isSymbolicLink() &&
    ['zkyq', 'orca'].some((prefix) =>
      managedExtension(join(root, 'omp-managed-status-extension', `${prefix}-agent-status.ts`))
    )
  )
    return true
  if (pinned?.isDirectory() && !pinned.isSymbolicLink()) {
    const file = join(root, 'omp-managed-status-extension', OMP_FRESH_CONFIG_FILENAME)
    const stat = lstatSync(file, { throwIfNoEntry: false })
    if (
      stat?.isFile() &&
      stat.size === OMP_FRESH_CONFIG_SOURCE.length &&
      readFileSync(file, 'utf8') === OMP_FRESH_CONFIG_SOURCE
    )
      return true
  }
  for (const agent of ['opencode', 'opencode2']) {
    const overlays = join(root, `${agent}-overlays`)
    const stat = lstatSync(overlays, { throwIfNoEntry: false })
    if (!stat?.isDirectory() || stat.isSymbolicLink()) continue
    for (const entry of readdirSync(overlays, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !/^[a-f0-9]{32}$/.test(entry.name))
        continue
      const plugins = join(overlays, entry.name, 'plugins')
      const pluginStat = lstatSync(plugins, { throwIfNoEntry: false })
      if (!pluginStat?.isDirectory() || pluginStat.isSymbolicLink()) continue
      for (const prefix of ['zkyq', 'orca']) {
        const prompt = lstatSync(join(plugins, `${prefix}-opencode-startup-prompt`), {
          throwIfNoEntry: false
        })
        if (
          lstatSync(join(plugins, `${prefix}-${agent}-status.js`), {
            throwIfNoEntry: false
          })?.isFile() ||
          (prompt?.isDirectory() &&
            !prompt.isSymbolicLink() &&
            lstatSync(join(plugins, `${prefix}-opencode-startup-prompt`, 'package.json'), {
              throwIfNoEntry: false
            })?.isFile())
        )
          return true
      }
    }
  }
  return false
}

function underRoot(root: string, path: string): string | null {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
    ? rel
    : null
}

/** Resolve old inputs only when their migrated data is already available. */
export function canonicalRelayHooksPath(input: string, home: string): string {
  const candidate = resolve(home, input)
  const rel = underRoot(resolve(home, '.orca-relay'), candidate)
  if (rel === null) return input
  const target = resolve(home, RELAY_HOOKS_DIR, rel)
  if (!existsSync(target)) return input
  if (existsSync(candidate) && realpathSync(candidate) !== realpathSync(target)) return input
  return target
}

/** Rewrite only references into our old root. Never descend through a user link. */
function retireReferences(
  current: string,
  retired: string,
  archives: Map<string, string>,
  directory = current
): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      const target = readlinkSync(path)
      const resolved = resolve(dirname(path), target)
      const rel = underRoot(retired, resolved)
      const canonical = rel === null ? resolved : join(current, rel)
      const mapped = archives.get(canonical) ?? (rel === null ? null : canonical)
      if (mapped === null) continue
      const next = isAbsolute(target) ? mapped : relative(dirname(path), mapped)
      const staged = join(directory, `.zkyq-link-${randomUUID()}.tmp`)
      try {
        symlinkSync(
          next,
          staged,
          lstatSync(mapped, { throwIfNoEntry: false })?.isDirectory() ? 'dir' : 'file'
        )
        renameSync(staged, path)
      } finally {
        if (lstatSync(staged, { throwIfNoEntry: false })) unlinkSync(staged)
      }
    } else if (entry.isDirectory()) {
      retireReferences(current, retired, archives, path)
    }
  }
}

function preservePinnedExtensions(current: string): Map<string, string> {
  const preserved = new Map<string, string>()
  const directory = join(current, 'omp-managed-status-extension')
  const stat = lstatSync(directory, { throwIfNoEntry: false })
  if (!stat?.isDirectory() || stat.isSymbolicLink()) return preserved
  for (const name of ['agent-status', 'prefill', 'titlebar-spinner']) {
    const previous = join(directory, `orca-${name}.ts`)
    if (!managedExtension(previous)) continue
    const archive = join(current, '.zkyq-retired-extensions')
    const archiveStat = lstatSync(archive, { throwIfNoEntry: false })
    if (archiveStat && (!archiveStat.isDirectory() || archiveStat.isSymbolicLink())) {
      throw new Error('Relay plugin archive is not a real directory')
    }
    mkdirSync(archive, { recursive: true, mode: 0o700 })
    const destination = join(archive, `zkyq-${name}-${randomUUID()}.disabled`)
    // Publish the retained inode before changing references or removing its old name.
    linkSync(previous, destination)
    preserved.set(previous, destination)
  }
  return preserved
}

/** Relocate owned plugin data without separating old readers from new writes. */
export function prepareRelayHooksDirectory(home: string, retiredReaders = false): string {
  const current = resolve(home, RELAY_HOOKS_DIR)
  const retired = resolve(home, '.orca-relay')
  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  const prior = lstatSync(retired, { throwIfNoEntry: false })
  const present = lstatSync(current, { throwIfNoEntry: false })
  const deferred = present?.isSymbolicLink()
  if (deferred) {
    if (
      resolve(dirname(current), readlinkSync(current)) !== retired ||
      !prior?.isDirectory() ||
      prior.isSymbolicLink() ||
      !managedRoot(retired)
    ) {
      throw new Error('Relay plugin migration link has an unexpected target')
    }
  } else if (present && !present.isDirectory()) {
    throw new Error('Relay plugin root is not a directory')
  }
  const retire = () => {
    const archives = preservePinnedExtensions(current)
    retireReferences(current, retired, archives)
    for (const previous of archives.keys()) unlinkSync(previous)
    for (const directory of managedEndpointDirectories(current)) retireLegacyEndpoint(directory)
  }
  if (!prior) {
    if (retiredReaders && present?.isDirectory()) retire()
    return current
  }
  if (prior.isSymbolicLink()) {
    if (
      resolve(dirname(retired), readlinkSync(retired)) !== current ||
      !present?.isDirectory() ||
      deferred
    ) {
      throw new Error('Relay plugin migration link has an unexpected target')
    }
    if (retiredReaders) {
      retire()
      unlinkSync(retired)
    }
    return current
  }
  if (!prior.isDirectory() || !managedRoot(retired)) return current
  if (present && !deferred)
    throw new Error('Both current and retired relay plugin directories exist')
  if (deferred) unlinkSync(current)
  try {
    renameSync(retired, current)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (deferred || code === 'EACCES' || code === 'EPERM' || code === 'EBUSY')
      symlinkSync(retired, current, linkType)
    if (code !== 'EACCES' && code !== 'EPERM' && code !== 'EBUSY') throw error
    console.warn('[plugin-overlay] root relocation deferred until open files close')
    return current
  }
  try {
    symlinkSync(current, retired, linkType)
  } catch (error) {
    if (!lstatSync(retired, { throwIfNoEntry: false })) renameSync(current, retired)
    throw error
  }
  if (retiredReaders) {
    retire()
    unlinkSync(retired)
  }
  return current
}
