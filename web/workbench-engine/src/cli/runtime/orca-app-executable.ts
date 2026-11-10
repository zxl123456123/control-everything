import { resolve } from 'node:path'
import { ELECTRON_NO_SANDBOX_REQUEST_ENV } from '../../shared/electron-no-sandbox-request'
import { needsElectronNoSandbox } from './electron-sandbox-switch'
import { serverOnlyServeMessage } from './serve-app-launcher'
import { SERVE_SUPERVISOR_APP_ROOT_ENV } from './serve-supervisor-relocation'
import { RuntimeClientError } from './types'
import { assertCurrentAppLaunchEnvironment } from './app-launch-environment'

/** Which application zkyq runs, from where, and with what environment. */

export function getExecutableAppArgs(executable: string): string[] {
  assertCurrentAppLaunchEnvironment(process.env)
  const args = process.env.ZKYQ_APP_EXECUTABLE_NEEDS_APP_ROOT === '1' ? [resolveAppRoot()] : []
  if (needsElectronNoSandbox(executable)) {
    args.push('--no-sandbox')
  }
  return args
}

export function resolveAppRoot(): string {
  // Why: dev-mode resource resolution in the Electron child may consult
  // process.cwd(). Pin it to the app root so `orca serve` behaves the same
  // regardless of the shell directory it was launched from. A supervisor re-run from its copy
  // outside the app must still start the app's own files.
  return process.env[SERVE_SUPERVISOR_APP_ROOT_ENV] || resolve(__dirname, '../../..')
}

export function resolveForegroundOrcaExecutable(): string {
  assertCurrentAppLaunchEnvironment(process.env)
  const overrideExecutable = process.env.ZKYQ_APP_EXECUTABLE
  if (typeof overrideExecutable === 'string' && overrideExecutable.trim().length > 0) {
    return overrideExecutable
  }
  if (process.env.ELECTRON_RUN_AS_NODE === '1') {
    return process.execPath
  }
  throw new RuntimeClientError('runtime_serve_failed', serverOnlyServeMessage())
}

export function stripElectronRunAsNode(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env }
  delete next.ELECTRON_RUN_AS_NODE
  delete next.ORCA_APP_EXECUTABLE
  delete next.ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT
  // Why: the request is applied as a switch; the server's terminals must not inherit it.
  delete next[ELECTRON_NO_SANDBOX_REQUEST_ENV]
  // Why: only the relocated supervisor itself may resolve its app root this way.
  delete next[SERVE_SUPERVISOR_APP_ROOT_ENV]
  return next
}
