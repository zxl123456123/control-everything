import type { CliInstallStatus } from '../../shared/cli-install-types'
import { CliCommandInstallation } from './cli-command-installation'
import { isMissingError, isWindowsUserPathPermissionError } from './cli-install-errors'
import { samePathEntry, splitPathEntries } from './cli-install-path-format'
import { readdir, rmdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { buildWindowsForwarder } from './cli-dev-launcher'
import { retireGeneratedCommand } from './retire-generated-command.cjs'

export class CliPathRegistration extends CliCommandInstallation {
  protected override async removeLegacyCommandsIfManaged(
    launcherPath: string | null
  ): Promise<void> {
    await super.removeLegacyCommandsIfManaged(launcherPath)
    if (this.platform !== 'win32' || this.isPackaged || this.commandPathOverride || !launcherPath)
      return
    const oldDirectory = join(this.localAppDataPath, 'Programs', 'Orca Dev', 'bin')
    const oldLauncher = join(this.userDataPath, 'cli', 'bin', 'orca-dev.cmd')
    retireGeneratedCommand(join(oldDirectory, 'orca-dev.cmd'), buildWindowsForwarder(oldLauncher))
    let entries: string[]
    try {
      entries = await readdir(oldDirectory)
    } catch (error) {
      if (!isMissingError(error)) throw error
      entries = []
    }
    if (entries.length !== 0) return
    await this.removeWindowsPathEntry(oldDirectory)
    try {
      await rmdir(oldDirectory)
      await rmdir(dirname(oldDirectory))
    } catch (error) {
      if (!isMissingError(error) && (error as NodeJS.ErrnoException).code !== 'ENOTEMPTY')
        throw error
    }
  }

  protected async probePathConfiguration(
    pathDirectory: string
  ): Promise<{ configured: boolean | null; detail: string | null }> {
    if (this.platform !== 'win32') {
      return {
        configured: splitPathEntries(this.platform, this.processPathEnv ?? '').some((entry) =>
          samePathEntry(this.platform, entry, pathDirectory)
        ),
        detail: null
      }
    }

    const result = await this.userPathReader()
    if (result.state === 'unknown') {
      return { configured: null, detail: result.detail }
    }
    return {
      configured: splitPathEntries('win32', result.value).some((entry) =>
        samePathEntry('win32', entry, pathDirectory, this.windowsEnvironment, result.expandable)
      ),
      detail: null
    }
  }

  protected withPathInfo(
    status: CliInstallStatus,
    pathDirectory: string,
    pathProbe: { configured: boolean | null; detail: string | null }
  ): CliInstallStatus {
    const { configured: pathConfigured } = pathProbe
    if (
      this.isWindowsPackagedBundledCommand(status.commandPath, status.launcherPath) &&
      status.state === 'installed' &&
      pathConfigured === false
    ) {
      return {
        ...status,
        pathDirectory,
        pathConfigured,
        state: 'not_installed',
        currentTarget: null,
        detail: `Register ${status.commandPath} to use Control Everything from Command Prompt or PowerShell.`
      }
    }

    if (pathConfigured === null) {
      return {
        ...status,
        pathDirectory,
        pathConfigured,
        detail:
          pathProbe.detail ??
          'The workbench launcher exists, but your Windows user PATH could not be checked.'
      }
    }

    if (status.state !== 'installed') {
      return {
        ...status,
        pathDirectory,
        pathConfigured
      }
    }

    if (pathConfigured) {
      return {
        ...status,
        pathDirectory,
        pathConfigured
      }
    }

    return {
      ...status,
      pathDirectory,
      pathConfigured,
      detail:
        this.platform === 'linux'
          ? `${status.commandPath} is registered, but ${pathDirectory} is not on PATH for this shell.`
          : `${status.commandPath} is registered. Restart your shell if the command is not visible yet.`
    }
  }

  protected async ensureWindowsPathEntry(pathDirectory: string): Promise<void> {
    const current = await this.readWindowsUserPathForMutation()
    const entries = splitPathEntries('win32', current.value)
    if (
      entries.some((entry) =>
        samePathEntry('win32', entry, pathDirectory, this.windowsEnvironment, current.expandable)
      )
    ) {
      return
    }
    entries.push(pathDirectory)
    await this.writeWindowsUserPathEntry(entries.join(';'), pathDirectory, 'add')
  }

  protected async removeWindowsPathEntry(pathDirectory: string): Promise<void> {
    if (this.platform !== 'win32') {
      return
    }
    const current = await this.readWindowsUserPathForMutation()
    const entries = splitPathEntries('win32', current.value)
    const nextEntries = entries.filter(
      (entry) =>
        !samePathEntry('win32', entry, pathDirectory, this.windowsEnvironment, current.expandable)
    )
    if (nextEntries.length === entries.length) {
      return
    }
    await this.writeWindowsUserPathEntry(nextEntries.join(';'), pathDirectory, 'remove')
  }

  protected async readWindowsUserPathForMutation(): Promise<{
    value: string | null
    expandable: boolean
  }> {
    const result = await this.userPathMutationReader()
    if (result.state === 'success') {
      return { value: result.value, expandable: result.expandable }
    }
    // Why: PATH is read-modify-write; continuing after a failed read could clobber the user's PATH with a partial value.
    throw new Error(`${result.detail} No PATH changes were made.`)
  }

  // Why: raw PowerShell errors reach the UI, so translate denied PATH writes (keeping the original as cause).
  protected async writeWindowsUserPathEntry(
    value: string,
    pathDirectory: string,
    action: 'add' | 'remove'
  ): Promise<void> {
    try {
      await this.userPathWriter(value)
      this.userPathCacheInvalidator()
    } catch (error) {
      if (!isWindowsUserPathPermissionError(error)) {
        throw error
      }
      const guidance =
        action === 'add'
          ? `Add this folder to your PATH manually: ${pathDirectory}. Or run Control Everything as an administrator and try again.`
          : `Remove this folder from your PATH manually: ${pathDirectory}. Or run Control Everything as an administrator and try again.`
      throw new Error(
        `Windows blocked updating your user PATH (access denied). This usually means your PATH environment variable is managed by Group Policy or your organization's device management. ${guidance}`,
        { cause: error }
      )
    }
  }
}
