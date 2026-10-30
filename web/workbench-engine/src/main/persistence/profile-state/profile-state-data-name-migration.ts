import { linkSync, lstatSync, readdirSync, unlinkSync, type BigIntStats } from 'node:fs'
import { dirname, join } from 'node:path'
import { bestEffortFsyncDirectorySync, fsyncFileSync } from '../../../shared/secure-file'
import {
  PREVIOUS_PROFILE_STATE_DATA_FILE_NAME,
  PROFILE_STATE_DATA_FILE_NAME
} from '../../../shared/profile-state-storage-paths'
import {
  acquireProfileStateMaintenance,
  acquireProfileStateRuntimeAdmission,
  assertProfileStateMaintenance,
  assertProfileStateMaintenanceRoot,
  type ProfileStateMaintenance,
  type ProfileStateRuntimeAdmission
} from './profile-state-access'

const OLD_DATA_NAME = PREVIOUS_PROFILE_STATE_DATA_FILE_NAME
const DATA_NAME = PROFILE_STATE_DATA_FILE_NAME
const PROFILE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

/** Move the managed JSON family while profile-state maintenance excludes participating processes. */
export function migrateProfileStateDataNames(
  userDataPath: string,
  maintenance: ProfileStateMaintenance
): number {
  const root = assertProfileStateMaintenanceRoot(maintenance, userDataPath)
  const moves = findMoves(root)
  executeMoves(moves, maintenance)
  return moves.length
}

function executeMoves(
  moves: readonly { source: string; target: string; directory: string }[],
  maintenance: ProfileStateMaintenance
): void {
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
}

/** An explicit downgrade hands JSON to an older build; the next upgraded startup migrates it back. */
export function handOffProfileJsonToPreviousBuild(
  profile: { profileId: string; dataFile: string; databasePath: string },
  maintenance: ProfileStateMaintenance
): string {
  assertProfileStateMaintenance(maintenance, profile)
  const directory = dirname(profile.dataFile)
  const previous = join(directory, OLD_DATA_NAME)
  if (!lstatSync(profile.dataFile).isFile()) throw new Error('Profile JSON is not a regular file')
  const moves = readdirSync(directory)
    .filter(
      (name) =>
        name.startsWith(DATA_NAME) && isManagedOldName(OLD_DATA_NAME + name.slice(DATA_NAME.length))
    )
    .map((name) => ({
      source: join(directory, name),
      target: join(directory, OLD_DATA_NAME + name.slice(DATA_NAME.length)),
      directory
    }))
  executeMoves(moves, maintenance)
  return previous
}

/** Migrate before a runtime reads state, retaining its shared admission after the final check. */
export function acquireProfileStateAdmissionWithDataMigration(
  userDataPath: string
): ProfileStateRuntimeAdmission {
  for (let attempt = 0; attempt < 3; attempt++) {
    const admission = acquireProfileStateRuntimeAdmission(userDataPath)
    let pending: boolean
    try {
      pending = findMoves(userDataPath).length > 0
    } catch (error) {
      admission.release()
      throw error
    }
    if (!pending) return admission
    admission.release()
    const maintenance = acquireProfileStateMaintenance(userDataPath)
    try {
      migrateProfileStateDataNames(userDataPath, maintenance)
    } finally {
      maintenance.release()
    }
  }
  throw new Error('Profile state data migration could not obtain a stable runtime admission')
}

/** Resolve old files for read-only commands before migration, but reject a split family. */
export function profileStateDataFileForRead(directory: string): string {
  const info = maybeStat(directory)
  if (!info) return join(directory, DATA_NAME)
  if (!info.isDirectory()) throw new Error(`Profile directory is not a directory: ${directory}`)
  const names = readdirSync(directory)
  const old = names.some(isManagedOldName)
  const current = names.some(
    (name) =>
      isManagedOldName(OLD_DATA_NAME + name.slice(DATA_NAME.length)) && name.startsWith(DATA_NAME)
  )
  if (old && current)
    throw new Error(
      'Profile state data name migration is incomplete or conflicting; stop Control Everything and retry startup or recovery'
    )
  return join(directory, old ? OLD_DATA_NAME : DATA_NAME)
}

function findMoves(root: string): { source: string; target: string; directory: string }[] {
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

  return directories.flatMap((directory) =>
    readdirSync(directory)
      .filter(isManagedOldName)
      .map((name) => ({
        source: join(directory, name),
        target: join(directory, DATA_NAME + name.slice(OLD_DATA_NAME.length)),
        directory
      }))
  )
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
