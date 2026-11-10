import { join } from 'node:path'

export const PROFILE_STATE_DATABASE_FILE_NAME = 'profile-state.db'
export const PROFILE_STATE_DATA_FILE_NAME = 'zkyq-data.json'
export const PREVIOUS_PROFILE_STATE_DATA_FILE_NAME = 'orca-data.json'
export const PROFILE_INDEX_FILE_NAME = 'zkyq-profile-index.json'
export const PREVIOUS_PROFILE_INDEX_FILE_NAME = 'orca-profile-index.json'

/** Pure profile-state path helpers shared by the offline CLI and main process. */
export function profileStateDatabaseFile(profileDirectory: string): string {
  return join(profileDirectory, PROFILE_STATE_DATABASE_FILE_NAME)
}

export function getOrcaProfileDataFile(profileId: string, userDataPath: string): string {
  return join(userDataPath, 'profiles', profileId, PROFILE_STATE_DATA_FILE_NAME)
}

export function getOrcaProfileStateDatabaseFile(profileId: string, userDataPath: string): string {
  return profileStateDatabaseFile(join(userDataPath, 'profiles', profileId))
}
