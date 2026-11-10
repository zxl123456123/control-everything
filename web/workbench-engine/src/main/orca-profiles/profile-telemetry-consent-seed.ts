import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { acquireProfileStateRuntimeAdmission } from '../persistence/profile-state/profile-state-access'
import { isProfileStateSqliteAvailable } from '../persistence/profile-state/profile-state-database'
import { migrateProfileStateToSqlite } from '../persistence/profile-state/profile-state-migration'
import { profileStateDataFileForRead } from '../persistence/profile-state/profile-state-data-name-migration'
import {
  getOrcaProfileDataFile,
  getOrcaProfileStateDatabaseFile,
  getProfileUserDataPath
} from './profile-storage-paths'

// Keep the active install's consent and anonymous identity when creating another profile.
export function seedNewOrcaProfileTelemetryConsent(
  profileId: string,
  telemetry: GlobalSettings['telemetry'],
  userDataPath = getProfileUserDataPath()
): void {
  if (!telemetry) {
    return
  }
  if (!isProfileStateSqliteAvailable()) {
    throw new Error('Creating profile state requires the bundled Orca runtime.')
  }
  const admission = acquireProfileStateRuntimeAdmission(userDataPath)
  try {
    const dataFile = getOrcaProfileDataFile(profileId, userDataPath)
    if (profileStateDataFileForRead(dirname(dataFile)) !== dataFile) {
      throw new Error('Profile data must be migrated before telemetry consent is seeded')
    }
    const databaseFile = getOrcaProfileStateDatabaseFile(profileId, userDataPath)
    if (existsSync(dataFile) || existsSync(databaseFile)) {
      return
    }
    const migrated = migrateProfileStateToSqlite({
      dataFile,
      databaseFile,
      profileId,
      expectedLegacyJson: undefined,
      serializedState: JSON.stringify({ settings: { telemetry } })
    })
    migrated.authority.close()
  } finally {
    admission.release()
  }
}
