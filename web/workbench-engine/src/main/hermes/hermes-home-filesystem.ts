import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { ConfigParseResult, HermesConfig } from './hermes-config-yaml'
import { parseHermesConfig } from './hermes-config-yaml'
import { resolveHooksJsonWritePath } from '../agent-hooks/hook-config-write-path'
import { writeHooksJson } from '../agent-hooks/installer-utils'
import {
  HERMES_PLUGIN_NAME,
  isManagedHermesPlugin,
  getPluginInitSource,
  getPluginManifest
} from './hermes-managed-plugin-source'

export function getHermesHome(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.HERMES_HOME?.trim()
  return explicit ? explicit : join(homedir(), '.hermes')
}

export function getConfigPath(): string {
  return join(getHermesHome(), 'config.yaml')
}

export function getPluginDir(name = HERMES_PLUGIN_NAME): string {
  return join(getHermesHome(), 'plugins', name)
}

function getManifestPath(pluginDir = getPluginDir()): string {
  return join(pluginDir, 'plugin.yaml')
}

function getInitPath(pluginDir = getPluginDir()): string {
  return join(pluginDir, '__init__.py')
}

type ConfigFileReadResult =
  | { ok: true; config: HermesConfig; content: string }
  | Extract<ConfigParseResult, { ok: false }>

export function readConfigFile(configPath: string): ConfigFileReadResult {
  const readPath = resolveHooksJsonWritePath(configPath)
  const content = existsSync(readPath) ? readFileSync(readPath, 'utf-8') : ''
  const parsed = parseHermesConfig(content)
  return parsed.ok ? { ...parsed, content } : parsed
}

export function writeConfigFile(configPath: string, content: string): void {
  writeHooksJson(configPath, {}, { serialized: content, preserveMode: true, defaultMode: 0o600 })
}

export function getPluginFilesState(pluginDir = getPluginDir()): {
  present: boolean
  managed: boolean
  writable: boolean
  detail: string | null
} {
  const manifestPath = getManifestPath(pluginDir)
  const initPath = getInitPath(pluginDir)
  try {
    const directory = lstatSync(pluginDir, { throwIfNoEntry: false })
    if (!directory) return { present: false, managed: false, writable: true, detail: null }
    if (!directory.isDirectory())
      throw new Error(`Hermes plugin path is not a directory: ${pluginDir}`)
    let count = 0
    for (const path of [manifestPath, initPath]) {
      const file = lstatSync(path, { throwIfNoEntry: false })
      if (!file) continue
      if (!file.isFile() || !isManagedHermesPlugin(readFileSync(path, 'utf-8'))) {
        throw new Error(`Hermes plugin file is user-managed: ${path}`)
      }
      count++
    }
    return {
      present: true,
      managed: count === 2,
      writable: true,
      detail: count === 2 ? null : 'Managed Hermes plugin files are missing'
    }
  } catch (error) {
    return {
      present: true,
      managed: false,
      writable: false,
      detail: error instanceof Error ? error.message : String(error)
    }
  }
}

export function writePluginFiles(pluginDir = getPluginDir()): void {
  const state = getPluginFilesState(pluginDir)
  if (!state.writable) throw new Error(state.detail ?? 'Hermes plugin is user-managed')
  mkdirSync(pluginDir, { recursive: true })
  for (const [path, content] of [
    [getManifestPath(pluginDir), getPluginManifest()],
    [getInitPath(pluginDir), getPluginInitSource()]
  ]) {
    if (!existsSync(path) || readFileSync(path, 'utf-8') !== content) {
      writeFileSync(path, content, 'utf-8')
    }
  }
}

export function archivePluginDirectory(pluginDir: string): string {
  const archive = join(
    getHermesHome(),
    '.zkyq-retired-plugins',
    `${HERMES_PLUGIN_NAME}-${randomUUID()}`
  )
  mkdirSync(join(getHermesHome(), '.zkyq-retired-plugins'), { recursive: true })
  renameSync(pluginDir, archive)
  return archive
}
