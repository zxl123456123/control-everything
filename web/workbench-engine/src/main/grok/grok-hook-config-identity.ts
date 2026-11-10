import { linkSync, lstatSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs'

export const GROK_CONFIG_FILE = 'zkyq-status.json'

export function grokConfigIdentityMoves(configPath: string): { from: string; to: string }[] {
  const previous = configPath.replace(/zkyq-status\.json$/, 'orca-status.json')
  return [
    { from: previous, to: configPath },
    { from: previous + '.bak', to: configPath + '.bak' },
    { from: previous + '.orca-cleaned-symlink', to: configPath + '.zkyq-cleaned-symlink' }
  ]
}

function info(path: string) {
  try {
    return lstatSync(path, { bigint: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

export function hasPreviousGrokConfig(configPath: string): boolean {
  return grokConfigIdentityMoves(configPath).some(({ from }) => info(from) !== undefined)
}

function validateMove(from: string, to: string): void {
  const source = info(from)
  if (!source) return
  if (!source.isFile() && !source.isSymbolicLink())
    throw new Error('Grok hook identity path is not a file')
  const target = info(to)
  if (!target) return
  // An interrupted publication is retryable; independent generations are never overwritten.
  if (source.dev === target.dev && source.ino === target.ino) return
  if (source.isSymbolicLink() && target.isSymbolicLink() && readlinkSync(from) === readlinkSync(to))
    return
  throw new Error(
    'Grok hook identity migration has conflicting files; preserve both generations before retrying'
  )
}

/** Preserve raw bytes, mode and dotfiles links before the normal installer updates hook commands. */
export function migrateGrokConfigIdentity(configPath: string): void {
  const moves = grokConfigIdentityMoves(configPath).filter(({ from }) => info(from) !== undefined)
  for (const { from, to } of moves) validateMove(from, to)
  for (const { from, to } of moves) {
    validateMove(from, to)
    if (info(to)) continue
    if (info(from)!.isSymbolicLink()) symlinkSync(readlinkSync(from), to)
    else linkSync(from, to)
  }
  for (const { from, to } of moves) {
    validateMove(from, to)
    unlinkSync(from)
  }
}
