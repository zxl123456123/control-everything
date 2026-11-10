import { RuntimeClientError } from './types'

/** Refuse retired overrides before a default executable or profile can be selected. */
export function assertCurrentAppLaunchEnvironment(env: NodeJS.ProcessEnv): void {
  if (
    !env.ZKYQ_APP_EXECUTABLE?.trim() &&
    env.ZKYQ_APP_EXECUTABLE_NEEDS_APP_ROOT === undefined &&
    (env.ORCA_APP_EXECUTABLE || env.ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT)
  ) {
    throw new RuntimeClientError(
      'runtime_serve_failed',
      'The app launch settings were renamed. Set ZKYQ_APP_EXECUTABLE and, for a checkout build, ZKYQ_APP_EXECUTABLE_NEEDS_APP_ROOT instead of the retired ORCA_APP_EXECUTABLE settings.'
    )
  }
}
