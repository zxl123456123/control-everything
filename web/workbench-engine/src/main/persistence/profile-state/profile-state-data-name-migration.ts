import { linkSync, lstatSync, readdirSync, unlinkSync, type BigIntStats } from 'node:fs'
import { join } from 'node:path'
import { bestEffortFsyncDirectorySync, fsyncFileSync } from '../../../shared/secure-file'
import {
  assertProfileStateMaintenanceRoot,
  type ProfileStateMaintenance
} from './profile-state-access'

const OLD_DATA_NAME = 'orca-data.json'
const DATA_NAME = 'zkyq-data.json'
const PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

/** Move the managed JSON family while profile-state maintenance excludes participating processes. */
export function migrateProfileStateDataNames(
  userDataPath: string,
  maintenance: ProfileStateMaintenance
): number {
  const root = assertProfileStateMaintenanceRoot(maintenance, userDataPath)
  const directories = [root]
  const profiles = join(root, 'profiles')
  const profilesInfo = maybeStat(profiles)
  if (profilesInfo) {
    if (!profilesInfo.isDirectory()) throw new Error('Profile directory is not a directory')
    for (const name of readdirSync(profiles)) {
      if (!PROFILE_ID.test(name)) continue
      const directory = join(profiles, name)
      const info = lstatSync(directory)
      if (!info.isDirectory()) throw new Error(`Profile directory is not a directory: ${directory}`)
      directories.push(directory)
    }
  }

  const moves = directories.flatMap((directory) =>
    readdirSync(directory)
      .filter(isManagedOldName)
      .map((name) => ({
        source: join(directory, name),
        target: join(directory, DATA_NAME + name.slice(OLD_DATA_NAME.length)),
        directory
      }))
  )
  // Check the whole family before moving any file, including interrupted publications.
  for (const { source, target } of moves) validateMove(source, target)
  for (const { source, target, directory } of moves) {
    maintenance.assertActive()
    validateMove(source, target)
    fsyncFileSync(source)
    if (!maybeStat(target)) {
      // A hard link refuses an existing destination and leaves the source retryable after a crash.
      linkSync(source, target)
      bestEffortFsyncDirectorySync(directory)
    }
    validateMove(source, target)
    unlinkSync(source)
    bestEffortFsyncDirectorySync(directory)
  }
  return moves.length
}

function isManagedOldName(name: string): boolean {
  if (name === OLD_DATA_NAME || /^orca-data\.json\.bak\.[0-4]$/.test(name)) return true
  const match = /^orca-data\.json\.sqlite-export\.(\d+)\.json$/.exec(name)
  if (!match) return false
  const revision = Number(match[1])
  return Number.isSafeInteger(revision) && revision > 0
}

function maybeStat(path: string): BigIntStats | undefined {
  try {
    return lstatSync(path, { bigint: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function validateMove(source: string, target: string): void {
  const oldFile = lstatSync(source, { bigint: true })
  if (!oldFile.isFile())
    throw new Error(`Profile state migration source is not a regular file: ${source}`)
  const newFile = maybeStat(target)
  if (
    newFile &&
    (!newFile.isFile() ||
      !oldFile.ino ||
      oldFile.ino !== newFile.ino ||
      oldFile.dev !== newFile.dev)
  ) {
    throw new Error(`Profile state migration destination already exists: ${target}`)
  }
}
