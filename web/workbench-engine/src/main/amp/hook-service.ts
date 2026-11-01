import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SFTPWrapper } from 'ssh2'

import type { AgentHookInstallStatus } from '../../shared/agent-hook-types'
import {
  readManagedPluginFileRemote,
  moveManagedPluginRemote,
  writeTextFileRemoteAtomic
} from '../agent-hooks/installer-utils-remote'
import {
  AMP_PLUGIN_FILE,
  AMP_PLUGIN_MARKER,
  RETIRED_AMP_PLUGIN_FILE,
  getAmpPluginSource
} from './agent-status-plugin-source'
import {
  getPluginPath,
  getRemotePluginPath,
  isManagedPlugin,
  readLocalPluginState,
  statusFromState
} from './managed-plugin-install-status'

function retireLocalPlugin(path: string): string {
  const directory = join(dirname(dirname(path)), '.zkyq-retired-plugins')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const target = join(directory, `zkyq-agent-status-${randomUUID()}.ts.disabled`)
  renameSync(path, target)
  return target
}

function writeTextFileAtomic(filePath: string, content: string): void {
  const dir = dirname(filePath)
  mkdirSync(dir, { recursive: true })
  if (existsSync(filePath)) {
    try {
      if (readFileSync(filePath, 'utf-8') === content) {
        return
      }
    } catch {
      // Fall through to the atomic write path.
    }
  }

  const tmpPath = join(dir, `.${Date.now()}-${randomUUID()}.tmp`)
  try {
    writeFileSync(tmpPath, content, 'utf-8')
    renameSync(tmpPath, filePath)
  } finally {
    if (existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath)
      } catch {
        // best effort
      }
    }
  }
}

export class AmpHookService {
  getStatus(): AgentHookInstallStatus {
    const pluginPath = getPluginPath()
    const current = readLocalPluginState(pluginPath)
    if (current.kind === 'unmanaged' || current.kind === 'error')
      return statusFromState(pluginPath, current)
    const previousPath = getPluginPath(RETIRED_AMP_PLUGIN_FILE)
    const previous = readLocalPluginState(previousPath)
    if (previous.kind === 'absent') return statusFromState(pluginPath, current)
    const status = statusFromState(previousPath, previous)
    return previous.kind === 'managed'
      ? { ...status, state: 'partial', detail: 'Managed Amp plugin identity needs migration' }
      : status
  }

  install(): AgentHookInstallStatus {
    const pluginPath = getPluginPath()
    const state = readLocalPluginState(pluginPath)
    if (state.kind === 'unmanaged' || state.kind === 'error') {
      return statusFromState(pluginPath, state)
    }
    const previousPath = getPluginPath(RETIRED_AMP_PLUGIN_FILE)
    const previous = readLocalPluginState(previousPath)
    if (previous.kind === 'unmanaged' || previous.kind === 'error')
      return statusFromState(previousPath, previous)
    const archived = previous.kind === 'managed' ? retireLocalPlugin(previousPath) : undefined
    try {
      writeTextFileAtomic(pluginPath, getAmpPluginSource())
    } catch (error) {
      if (archived) renameSync(archived, previousPath)
      throw error
    }
    return this.getStatus()
  }

  async installRemote(sftp: SFTPWrapper, remoteHome: string): Promise<AgentHookInstallStatus> {
    const remotePluginPath = getRemotePluginPath(remoteHome)
    const previousPath = getRemotePluginPath(remoteHome, RETIRED_AMP_PLUGIN_FILE)
    let archived: string | undefined
    try {
      const existing = await readManagedPluginFileRemote(sftp, remotePluginPath)
      if (existing !== null && !isManagedPlugin(existing)) {
        return statusFromState(remotePluginPath, { kind: 'unmanaged' })
      }
      const previous = await readManagedPluginFileRemote(sftp, previousPath)
      if (previous !== null && !isManagedPlugin(previous))
        return statusFromState(previousPath, { kind: 'unmanaged' })
      if (previous !== null) {
        const archivePath = `${remoteHome.replace(/\/$/, '')}/.config/amp/.zkyq-retired-plugins/zkyq-agent-status-${randomUUID()}.ts.disabled`
        await moveManagedPluginRemote(sftp, previousPath, archivePath)
        archived = archivePath
      }
      await writeTextFileRemoteAtomic(sftp, remotePluginPath, getAmpPluginSource())
      return {
        agent: 'amp',
        state: 'installed',
        configPath: remotePluginPath,
        managedHooksPresent: true,
        detail: null
      }
    } catch (error) {
      let detail = error instanceof Error ? error.message : String(error)
      if (archived) {
        try {
          await moveManagedPluginRemote(sftp, archived, previousPath)
        } catch (restoreError) {
          detail += `; Previous plugin preserved at ${archived}; restoration failed: ${String(restoreError)}`
        }
      }
      return {
        agent: 'amp',
        state: 'error',
        configPath: remotePluginPath,
        managedHooksPresent: false,
        detail
      }
    }
  }

  remove(): AgentHookInstallStatus {
    const pluginPath = getPluginPath()
    const state = readLocalPluginState(pluginPath)
    if (state.kind === 'managed') {
      unlinkSync(pluginPath)
    }
    const previousPath = getPluginPath(RETIRED_AMP_PLUGIN_FILE)
    if (readLocalPluginState(previousPath).kind === 'managed') retireLocalPlugin(previousPath)
    return this.getStatus()
  }
}

export const ampHookService = new AmpHookService()

export const _internals = {
  AMP_PLUGIN_FILE,
  AMP_PLUGIN_MARKER,
  getAmpPluginSource,
  getPluginPath,
  getRemotePluginPath,
  isManagedPlugin
}
