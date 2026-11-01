import { lstatSync, readlinkSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve, toNamespacedPath } from 'node:path'
import { readDefaultDataRootRecord } from './default-data-root-record'

/** Preserve a live daemon's endpoint while its default root is reached through the new name. */
export function defaultDataRootProcessIdentityPath(userDataPath: string): string {
  const name = basename(userDataPath)
  const previousNames =
    name === '.zkyq'
      ? ['.orca']
      : name === 'zkyq'
        ? ['orca', 'Orca']
        : name === 'zkyq-dev'
          ? ['orca-dev']
          : /^\.zkyq-[a-f0-9]{8}$/.test(name)
            ? [name.replace('.zkyq-', '.orca-')]
            : []
  if (previousNames.length === 0) return userDataPath
  if (!lstatSync(userDataPath, { throwIfNoEntry: false })?.isSymbolicLink()) {
    const record = readDefaultDataRootRecord(userDataPath)
    if (record && record.phase !== 'complete' && previousNames.includes(record.previousName)) {
      const previous = join(dirname(userDataPath), record.previousName)
      if (lstatSync(previous, { throwIfNoEntry: false })?.isSymbolicLink()) {
        const target = resolve(dirname(previous), readlinkSync(previous))
        const same =
          process.platform === 'win32'
            ? toNamespacedPath(target).toLowerCase() ===
              toNamespacedPath(resolve(userDataPath)).toLowerCase()
            : target === resolve(userDataPath)
        if (same) return previous
      }
    }
    return userDataPath
  }
  const target = resolve(dirname(userDataPath), readlinkSync(userDataPath))
  if (!previousNames.includes(basename(target))) return userDataPath
  // Preserve the original spelling: Windows named-pipe hashes are case-sensitive strings.
  const previous = join(dirname(userDataPath), basename(target))
  const sameTarget =
    process.platform === 'win32'
      ? toNamespacedPath(target).toLowerCase() === toNamespacedPath(previous).toLowerCase()
      : target === resolve(previous)
  if (!sameTarget) return userDataPath
  const entry = lstatSync(previous, { throwIfNoEntry: false })
  if (entry?.isDirectory() && !entry.isSymbolicLink()) return previous
  if (
    entry?.isSymbolicLink() &&
    readDefaultDataRootRecord(userDataPath)?.phase !== undefined &&
    statSync(previous).isDirectory()
  )
    return previous
  return userDataPath
}
