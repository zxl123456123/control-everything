import { lstatSync, readlinkSync } from 'node:fs'
import { basename, dirname, join, resolve, toNamespacedPath } from 'node:path'

/** Preserve a live daemon's endpoint while its default root is reached through the new name. */
export function defaultDataRootProcessIdentityPath(userDataPath: string): string {
  if (!lstatSync(userDataPath, { throwIfNoEntry: false })?.isSymbolicLink()) return userDataPath
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
  return userDataPath
}
