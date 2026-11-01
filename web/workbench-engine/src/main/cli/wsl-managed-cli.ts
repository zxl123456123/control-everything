import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getAppEnvironment, hasAppEnvironment } from '../../shared/app-environment'
import { windowsPowerShellPath } from '@orca/process-host/windows-system-binary'
import { writeShellWrapperFiles } from '../shell-wrapper-file-writer'
import { getBundledLauncherPath } from './bundled-cli-launcher-path'
import { DEV_COMMAND_NAME } from './cli-install-constants'
import { buildColocatedWslLauncher, buildWslBridgeScript, WSL_CLI_COMMAND_NAME } from './wsl-cli-scripts'

/** Packaged builds share the command with guest registration; dev builds get their own name. */
export function getWslCliCommandName(isPackaged: boolean): string {
  return isPackaged ? WSL_CLI_COMMAND_NAME : DEV_COMMAND_NAME
}

let warnedMissingRuntime = false

/**
 * Directory holding this app's WSL launcher and bridge, or null when the CLI runtime is
 * missing or unwritable. Content-addressed like shell-ready wrappers: builds sharing userData
 * never overwrite each other, and a present file is complete because each one lands by rename.
 */
export function getManagedWslCliDir(opts: {
  isPackaged: boolean
  userDataPath: string
  resourcesPath?: string
}): string | null {
  const cliEntryPath = opts.isPackaged
    ? undefined
    : join(getAppEnvironment().getAppPath(), 'out', 'cli', 'index.js')
  const hostLauncher = hasAppEnvironment() ? getAppEnvironment().getCliLauncherPath?.() : null
  const launcherPath = opts.isPackaged
    ? hostLauncher ?? (opts.resourcesPath && getBundledLauncherPath('win32', opts.resourcesPath))
    : process.execPath
  if (!launcherPath || !existsSync(cliEntryPath ?? launcherPath)) {
    if (!warnedMissingRuntime) {
      warnedMissingRuntime = true
      console.warn('[WSL CLI] The workbench command runtime is missing; WSL terminals will not provide it.')
    }
    return null
  }
  const launcher = buildColocatedWslLauncher(launcherPath, windowsPowerShellPath())
  const bridge = buildWslBridgeScript({ userDataPath: opts.userDataPath, cliEntryPath })
  const commandName = getWslCliCommandName(opts.isPackaged)
  const digest = createHash('sha256').update(commandName).update(launcher).update(bridge).digest('hex').slice(0, 20)
  const directory = join(opts.userDataPath, 'wsl-managed-cli', digest)
  const files = [
    [join(directory, commandName), launcher],
    [join(directory, 'orca-wsl-bridge.ps1'), bridge]
  ] as const
  const ready =
    files.every(([path]) => existsSync(path)) ||
    writeShellWrapperFiles(files, '[WSL CLI]', 'WSL terminals will start without the workbench command')
  return ready ? directory : null
}
