import { dirname, join, resolve } from 'node:path'
import { SERVE_USER_DATA_PATH_ENV } from '../../shared/serve-user-data-path'
import { getPlatformUserDataPath } from './metadata'
import { assertCurrentAppLaunchEnvironment } from './app-launch-environment'
import { resolveMigratedDefaultDataRoot } from '../../main/persistence/default-data-root-record-reader'

/** An unpackaged checkout build also accepts an explicit development profile. */
function launchesDevApp(env: NodeJS.ProcessEnv): boolean {
  return env.ZKYQ_APP_EXECUTABLE_NEEDS_APP_ROOT === '1'
}

/**
 * The one profile a CLI launch both reads and hands to the app it starts.
 * Absolute, because the child runs from the app root, not the caller's cwd.
 */
export function resolveLaunchUserDataPath(env: NodeJS.ProcessEnv = process.env): string {
  assertCurrentAppLaunchEnvironment(env)
  if (env.ZKYQ_USER_DATA_PATH) {
    return resolveMigratedDefaultDataRoot(resolve(env.ZKYQ_USER_DATA_PATH))
  }
  if (env.ORCA_USER_DATA_PATH) {
    throw new Error(
      'ORCA_USER_DATA_PATH was retired. Set ZKYQ_USER_DATA_PATH to the same data directory.'
    )
  }
  if (launchesDevApp(env)) {
    if (!env.ZKYQ_DEV_USER_DATA_PATH && env.ORCA_DEV_USER_DATA_PATH) {
      throw new Error(
        'ORCA_DEV_USER_DATA_PATH was retired. Set ZKYQ_DEV_USER_DATA_PATH to the same data directory.'
      )
    }
    // Mirrors the development desktop's default.
    return resolve(
      env.ZKYQ_DEV_USER_DATA_PATH || join(dirname(getPlatformUserDataPath()), 'zkyq-dev')
    )
  }
  return getPlatformUserDataPath()
}

/** Pins a launched app to `userDataPath` in every form a packaged or dev build reads. */
export function pinLaunchUserDataPath(
  args: string[],
  env: NodeJS.ProcessEnv,
  userDataPath: string
): { args: string[]; env: NodeJS.ProcessEnv } {
  assertCurrentAppLaunchEnvironment(env)
  const pinnedEnv: NodeJS.ProcessEnv = { ...env, ZKYQ_USER_DATA_PATH: userDataPath }
  delete pinnedEnv.ORCA_APP_EXECUTABLE
  delete pinnedEnv.ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT
  delete pinnedEnv.ORCA_USER_DATA_PATH
  delete pinnedEnv.ORCA_DEV_USER_DATA_PATH
  if (launchesDevApp(env)) {
    pinnedEnv.ZKYQ_DEV_USER_DATA_PATH = userDataPath
  }
  return { args: [...args, `--user-data-dir=${userDataPath}`], env: pinnedEnv }
}

/** Serve additionally refuses to start, before the instance lock, if it lands anywhere else. */
export function pinServeUserDataPath(
  args: string[],
  env: NodeJS.ProcessEnv,
  userDataPath: string
): { args: string[]; env: NodeJS.ProcessEnv } {
  const pinned = pinLaunchUserDataPath(args, env, userDataPath)
  return { args: pinned.args, env: { ...pinned.env, [SERVE_USER_DATA_PATH_ENV]: userDataPath } }
}
