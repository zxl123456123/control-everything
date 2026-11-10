import { lstatSync, readdirSync, realpathSync, renameSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { bestEffortFsyncDirectorySync } from '../../../shared/secure-file'
import { PROFILE_STATE_DATA_FILE_NAME } from '../../../shared/profile-state-storage-paths'
import {
  ProfileStateAccessError,
  hasCode,
  profileStateAccessPaths,
  publishAccessOwner,
  reclaimExitedOwner
} from './profile-state-access-owner'
export { ProfileStateAccessError } from './profile-state-access-owner'

export type ProfileStateRuntimeAdmission = {
  assertActive(): void
  release(): void
}

export type ProfileStateMaintenance = ProfileStateRuntimeAdmission & {
  assertProfile(profileId: string, dataFile: string, databasePath: string): void
}

const maintenanceRoots = new WeakMap<
  ProfileStateMaintenance,
  { root: string; relocate: (target: string) => void }
>()

/** Bind a root-wide migration to the genuine, live maintenance owner for that root. */
export function assertProfileStateMaintenanceRoot(
  maintenance: ProfileStateMaintenance,
  userDataPath: string
): string {
  const root = maintenanceRoots.get(maintenance)?.root
  if (root === undefined) {
    throw new ProfileStateAccessError(
      'Profile state migration requires an acquired maintenance owner'
    )
  }
  maintenance.assertActive()
  if (!samePath(realpathSync(userDataPath), root)) {
    throw new ProfileStateAccessError(
      'Profile state migration root does not belong to the maintenance owner'
    )
  }
  return root
}

/** Bind destructive operations to a genuine, live maintenance owner for these exact profile paths. */
export function assertProfileStateMaintenance(
  maintenance: ProfileStateMaintenance,
  profile: { profileId: string; dataFile: string; databasePath: string }
): void {
  const root = maintenanceRoots.get(maintenance)?.root
  if (root === undefined || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(profile.profileId)) {
    throw new ProfileStateAccessError(
      'Profile state recovery requires an acquired maintenance owner'
    )
  }
  maintenance.assertActive()
  const expectedDirectory = join(root, 'profiles', profile.profileId)
  for (const [path, expectedName] of [
    [profile.dataFile, PROFILE_STATE_DATA_FILE_NAME],
    [profile.databasePath, 'profile-state.db']
  ] as const) {
    if (
      !samePath(realpathSync(dirname(path)), expectedDirectory) ||
      !samePath(basename(path), expectedName)
    ) {
      throw new ProfileStateAccessError(
        'Profile state recovery paths do not belong to the maintenance root'
      )
    }
    try {
      if (lstatSync(path).isSymbolicLink()) {
        throw new ProfileStateAccessError('Profile state recovery cannot replace a symbolic link')
      }
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) {
        throw error
      }
    }
  }
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

/** Admit before any profile read, and retain until every Store and worker has stopped. */
export function acquireProfileStateRuntimeAdmission(
  userDataPath: string
): ProfileStateRuntimeAdmission {
  const paths = profileStateAccessPaths(userDataPath)
  const owner = publishAccessOwner(paths, false)
  try {
    reclaimExitedOwner(paths.maintenance)
    return owner
  } catch (error) {
    owner.release()
    throw error
  }
}

/** Exclude startup and all participating readers/writers through durable recovery publication. */
export function acquireProfileStateMaintenance(userDataPath: string): ProfileStateMaintenance {
  const paths = profileStateAccessPaths(userDataPath)
  const owner = publishAccessOwner(paths, true)
  try {
    for (const entry of readdirSync(paths.participants)) {
      reclaimExitedOwner(join(paths.participants, entry))
    }
    const maintenance: ProfileStateMaintenance = {
      ...owner,
      assertProfile(profileId, dataFile, databasePath): void {
        assertProfileStateMaintenance(maintenance, { profileId, dataFile, databasePath })
      }
    }
    maintenanceRoots.set(maintenance, { root: dirname(paths.root), relocate: owner.relocate })
    return maintenance
  } catch (error) {
    owner.release()
    throw error
  }
}

/** Move an exclusively held data root without losing the maintenance fence or its release path. */
export function moveProfileStateMaintenanceRoot(
  maintenance: ProfileStateMaintenance,
  destination: string
): void {
  const held = maintenanceRoots.get(maintenance)
  if (!held) throw new ProfileStateAccessError('Data root move requires acquired maintenance')
  maintenance.assertActive()
  const target = resolve(destination)
  if (lstatSync(target, { throwIfNoEntry: false })) {
    throw new ProfileStateAccessError('Data root move destination already exists')
  }
  const previous = held.root
  renameSync(previous, target)
  const movedRoot = realpathSync(target)
  held.relocate(join(movedRoot, '.profile-state-access', 'maintenance'))
  held.root = movedRoot
  bestEffortFsyncDirectorySync(dirname(previous))
  bestEffortFsyncDirectorySync(dirname(target))
}
