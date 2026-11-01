import { randomUUID } from 'node:crypto'
import { renameSync } from 'node:fs'
import type { SFTPWrapper } from 'ssh2'

import type { AgentHookInstallState, AgentHookInstallStatus } from '../../shared/agent-hook-types'
import {
  hasManagedPluginDirectoryRemote,
  moveManagedPluginRemote,
  readManagedPluginFileRemote,
  readTextFileRemote,
  writeTextFileRemoteAtomic
} from '../agent-hooks/installer-utils-remote'
import type { HermesConfig } from './hermes-config-yaml'
import {
  disablePlugin,
  enablePlugin,
  getConfigEnablement,
  parseHermesConfig,
  updateConfigContent
} from './hermes-config-yaml'
import {
  archivePluginDirectory,
  getConfigPath,
  getHermesHome,
  getPluginDir,
  getPluginFilesState,
  readConfigFile,
  writeConfigFile,
  writePluginFiles
} from './hermes-home-filesystem'
import {
  HERMES_EVENTS,
  HERMES_PLUGIN_NAME,
  RETIRED_HERMES_PLUGIN_NAME,
  isManagedHermesPlugin,
  getPluginInitSource,
  getPluginManifest
} from './hermes-managed-plugin-source'

function buildStatus(configPath: string, config: HermesConfig): AgentHookInstallStatus {
  const pluginFiles = getPluginFilesState()
  const retired = getPluginFilesState(getPluginDir(RETIRED_HERMES_PLUGIN_NAME))
  const retiredEnablement = getConfigEnablement(config, RETIRED_HERMES_PLUGIN_NAME)
  const needsMigration = retired.present || retiredEnablement.enabled
  const enablement = getConfigEnablement(config)
  const details = [
    pluginFiles.detail,
    enablement.detail,
    !enablement.enabled ? 'zkyq-status is not enabled in Hermes config.yaml' : null,
    enablement.disabled ? 'zkyq-status is disabled in Hermes config.yaml' : null,
    needsMigration
      ? (retired.detail ?? 'Previous Hermes status plugin needs identity migration')
      : null
  ].filter((detail): detail is string => Boolean(detail))

  let state: AgentHookInstallState
  if (!pluginFiles.present && !enablement.enabled && !needsMigration) {
    state = 'not_installed'
  } else if (
    pluginFiles.present &&
    pluginFiles.managed &&
    enablement.enabled &&
    !enablement.disabled &&
    !needsMigration
  ) {
    state = 'installed'
  } else {
    state = 'partial'
  }

  return {
    agent: 'hermes',
    state,
    configPath,
    managedHooksPresent: pluginFiles.managed || retired.managed,
    detail: state === 'installed' || state === 'not_installed' ? null : details.join('; ')
  }
}

function stripTrailingSlash(path: string): string {
  return path.replace(/\/+$/, '')
}

async function getRemotePluginState(sftp: SFTPWrapper, path: string) {
  const present = await hasManagedPluginDirectoryRemote(sftp, path)
  if (!present) return { present: false, managed: false }
  let count = 0
  for (const name of ['plugin.yaml', '__init__.py']) {
    const file = `${path}/${name}`
    const content = await readManagedPluginFileRemote(sftp, file)
    if (content === null) continue
    if (!isManagedHermesPlugin(content))
      throw new Error(`Hermes plugin file is user-managed: ${file}`)
    count++
  }
  return { present, managed: count === 2 }
}

export class HermesHookService {
  getStatus(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const parsed = readConfigFile(configPath)
    if (!parsed.ok) {
      return {
        agent: 'hermes',
        state: 'error',
        configPath,
        managedHooksPresent: getPluginFilesState().managed,
        detail: `Could not parse Hermes config.yaml: ${parsed.detail}`
      }
    }
    return buildStatus(configPath, parsed.config)
  }

  install(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const parsed = readConfigFile(configPath)
    if (!parsed.ok) {
      return {
        agent: 'hermes',
        state: 'error',
        configPath,
        managedHooksPresent: getPluginFilesState().managed,
        detail: `Could not parse Hermes config.yaml: ${parsed.detail}`
      }
    }

    const next = updateConfigContent(parsed.content, enablePlugin)
    if (next.content === null) {
      return {
        agent: 'hermes',
        state: 'error',
        configPath,
        managedHooksPresent: getPluginFilesState().managed,
        detail: `Could not update Hermes config.yaml: ${next.detail ?? 'unknown error'}`
      }
    }
    const retiredPath = getPluginDir(RETIRED_HERMES_PLUGIN_NAME)
    const current = getPluginFilesState()
    const retired = getPluginFilesState(retiredPath)
    if (!current.writable || (retired.present && !retired.managed)) {
      return {
        agent: 'hermes',
        state: 'error',
        configPath,
        managedHooksPresent: current.managed || retired.managed,
        detail: !current.writable
          ? current.detail
          : (retired.detail ?? 'Previous Hermes plugin ownership is unknown')
      }
    }
    let archive: string | undefined
    try {
      if (retired.managed) archive = archivePluginDirectory(retiredPath)
      writePluginFiles()
      if (next.content !== parsed.content) writeConfigFile(configPath, next.content)
      return this.getStatus()
    } catch (error) {
      let detail = error instanceof Error ? error.message : String(error)
      if (archive) {
        try {
          renameSync(archive, retiredPath)
        } catch (restoreError) {
          detail += `; Previous plugin preserved at ${archive}; restore failed: ${String(restoreError)}`
          throw new Error(detail, { cause: error })
        }
      }
      throw error
    }
  }

  async installRemote(sftp: SFTPWrapper, remoteHome: string): Promise<AgentHookInstallStatus> {
    const remoteRoot = stripTrailingSlash(remoteHome)
    const remoteConfigPath = `${remoteRoot}/.hermes/config.yaml`
    const remotePluginDir = `${remoteRoot}/.hermes/plugins/${HERMES_PLUGIN_NAME}`
    const retiredPath = `${remoteRoot}/.hermes/plugins/${RETIRED_HERMES_PLUGIN_NAME}`
    let archive: string | undefined
    try {
      const existing = await readTextFileRemote(sftp, remoteConfigPath)
      const next = updateConfigContent(existing, enablePlugin)
      if (next.content === null) {
        return {
          agent: 'hermes',
          state: 'error',
          configPath: remoteConfigPath,
          managedHooksPresent: false,
          detail: `Could not parse remote Hermes config.yaml: ${next.detail ?? 'unknown error'}`
        }
      }
      await getRemotePluginState(sftp, remotePluginDir)
      const retired = await getRemotePluginState(sftp, retiredPath)
      if (retired.present && !retired.managed) {
        throw new Error('Previous Hermes plugin ownership is unknown')
      }
      if (retired.managed) {
        const destination = `${remoteRoot}/.hermes/.zkyq-retired-plugins/${HERMES_PLUGIN_NAME}-${randomUUID()}`
        await moveManagedPluginRemote(sftp, retiredPath, destination)
        archive = destination
      }
      await writeTextFileRemoteAtomic(sftp, `${remotePluginDir}/plugin.yaml`, getPluginManifest())
      await writeTextFileRemoteAtomic(sftp, `${remotePluginDir}/__init__.py`, getPluginInitSource())
      await writeTextFileRemoteAtomic(sftp, remoteConfigPath, next.content)
      return {
        agent: 'hermes',
        state: 'installed',
        configPath: remoteConfigPath,
        managedHooksPresent: true,
        detail: null
      }
    } catch (error) {
      let detail = error instanceof Error ? error.message : String(error)
      if (archive) {
        try {
          await moveManagedPluginRemote(sftp, archive, retiredPath)
        } catch (restoreError) {
          detail += `; Previous plugin preserved at ${archive}; restore failed: ${String(restoreError)}`
        }
      }
      return {
        agent: 'hermes',
        state: 'error',
        configPath: remoteConfigPath,
        managedHooksPresent: false,
        detail
      }
    }
  }

  remove(): AgentHookInstallStatus {
    const configPath = getConfigPath()
    const parsed = readConfigFile(configPath)
    if (!parsed.ok) {
      return {
        agent: 'hermes',
        state: 'error',
        configPath,
        managedHooksPresent: getPluginFilesState().managed,
        detail: `Could not parse Hermes config.yaml: ${parsed.detail}`
      }
    }
    const next = updateConfigContent(parsed.content, disablePlugin)
    if (next.content === null) {
      return {
        agent: 'hermes',
        state: 'error',
        configPath,
        managedHooksPresent: getPluginFilesState().managed,
        detail: `Could not update Hermes config.yaml: ${next.detail ?? 'unknown error'}`
      }
    }
    if (next.content !== parsed.content) {
      writeConfigFile(configPath, next.content)
    }
    for (const name of [HERMES_PLUGIN_NAME, RETIRED_HERMES_PLUGIN_NAME]) {
      const pluginDir = getPluginDir(name)
      if (getPluginFilesState(pluginDir).managed) archivePluginDirectory(pluginDir)
    }
    return this.getStatus()
  }
}

export const hermesHookService = new HermesHookService()

export const _internals = {
  HERMES_PLUGIN_NAME,
  HERMES_EVENTS,
  getHermesHome,
  getPluginManifest,
  getPluginInitSource,
  parseHermesConfig,
  enablePlugin,
  disablePlugin,
  updateConfigContent
}
