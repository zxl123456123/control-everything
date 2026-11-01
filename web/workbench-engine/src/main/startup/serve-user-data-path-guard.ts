import { SERVE_USER_DATA_PATH_ENV, isSameUserDataPath } from '../../shared/serve-user-data-path'
import { resolveMigratedDefaultDataRoot } from '../persistence/default-data-root-record-reader'

/**
 * Returns the refusal message when this serve launch landed on a profile other than the one
 * `orca serve` resolved, or null when it may continue to the instance lock.
 *
 * Why before the lock: losing another profile's lock delivers a second-instance request to
 * whatever app owns that profile, often the user's own desktop.
 */
export function checkServeUserDataPath(options: {
  isServeMode: boolean
  userDataPath: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}): string | null {
  const env = options.env ?? process.env
  const expected = env[SERVE_USER_DATA_PATH_ENV]
  // Why consume: serve-hosted terminals must not inherit a stale expectation into a later launch.
  delete env[SERVE_USER_DATA_PATH_ENV]
  if (!options.isServeMode || !expected) {
    return null
  }
  if (
    isSameUserDataPath(
      resolveMigratedDefaultDataRoot(expected),
      options.userDataPath,
      options.platform
    )
  ) {
    return null
  }
  return `[serve] zkyq serve chose the profile at ${expected}, but this launch resolved ${options.userDataPath}; refusing to start so it cannot touch another profile's running Control Everything.`
}
