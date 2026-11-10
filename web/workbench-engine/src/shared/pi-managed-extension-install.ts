import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

export const PI_AGENT_STATUS_EXTENSION_FILE = 'zkyq-agent-status.ts'
export const PI_PREFILL_EXTENSION_FILE = 'zkyq-prefill.ts'
export const PI_TITLEBAR_EXTENSION_FILE = 'zkyq-titlebar-spinner.ts'
export const PI_MANAGED_EXTENSION_MARKER = '@zkyq-managed-pi-extension'
export const RETIRED_PI_MANAGED_EXTENSION_MARKER = '@orca-managed-pi-extension'
export const RETIRED_PI_EXTENSION_FILES = [
  'orca-agent-status.ts',
  'orca-prefill.ts',
  'orca-titlebar-spinner.ts'
] as const

export function markManagedPiExtension(source: string): string {
  source = source.replace(
    /^\/\/ @orca-managed-pi-extension(?=\r?\n|$)/,
    `// ${PI_MANAGED_EXTENSION_MARKER}`
  )
  return source.includes(PI_MANAGED_EXTENSION_MARKER)
    ? source
    : `// ${PI_MANAGED_EXTENSION_MARKER}\n${source}`
}

function readManagedExtension(path: string): string | null | false {
  const stats = lstatSync(path, { throwIfNoEntry: false })
  if (!stats) return null
  if (!stats.isFile()) return false
  const content = readFileSync(path, 'utf8')
  return content.includes(PI_MANAGED_EXTENSION_MARKER) ||
    content.includes(RETIRED_PI_MANAGED_EXTENSION_MARKER)
    ? content
    : false
}

/** Replace only owned entries; retired modules are preserved outside auto-discovery. */
export function writeManagedPiExtension(
  path: string,
  source: string,
  location: 'auto-discovered' | 'pinned' = 'auto-discovered'
): boolean {
  const name = basename(path)
  if (
    ![
      PI_AGENT_STATUS_EXTENSION_FILE,
      PI_PREFILL_EXTENSION_FILE,
      PI_TITLEBAR_EXTENSION_FILE
    ].includes(name)
  ) {
    throw new Error('Unknown managed Pi extension filename')
  }
  const directory = dirname(path)
  const previousPath = join(directory, name.replace(/^zkyq-/, 'orca-'))
  const current = readManagedExtension(path)
  const previous = readManagedExtension(previousPath)
  if (current === false || previous === false) return false
  const content = markManagedPiExtension(source)
  let archive: string | undefined
  const staged = join(directory, `.${randomUUID()}.tmp`)
  try {
    mkdirSync(directory, { recursive: true })
    // Pinned fallbacks live outside discovery; old shells still hold their original input path.
    if (previous !== null && location === 'auto-discovered') {
      const archiveDir = join(dirname(directory), '.zkyq-retired-extensions')
      mkdirSync(archiveDir, { recursive: true })
      const destination = join(archiveDir, `${name}-${randomUUID()}.disabled`)
      renameSync(previousPath, destination)
      archive = destination
    }
    if (current !== content) {
      const mode = lstatSync(path, { throwIfNoEntry: false })?.mode
      writeFileSync(staged, content, { encoding: 'utf8', mode })
      if (mode !== undefined) chmodSync(staged, mode & 0o777)
      renameSync(staged, path)
    }
    return true
  } catch (error) {
    if (archive) {
      try {
        renameSync(archive, previousPath)
      } catch (restoreError) {
        throw new Error(
          `Previous Pi extension preserved at ${archive}; restore failed: ${String(restoreError)}`,
          { cause: error }
        )
      }
    }
    throw error
  } finally {
    try {
      unlinkSync(staged)
    } catch {
      /* The staged file may already have been published. */
    }
  }
}
