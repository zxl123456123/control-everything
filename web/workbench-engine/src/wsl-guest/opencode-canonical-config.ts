import { existsSync, mkdirSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { RELAY_HOOKS_DIR } from './relay-hooks-identity'
import { resolveOpenCodeConfigDirectory } from '../shared/opencode-config-directory'
import { isInstalledOpenCodePluginCurrent } from '../shared/opencode-installed-plugin'
import { writeCanonicalOpenCodePluginAtomically } from '../shared/opencode-plugin-atomic-write'
import { writeOpenCodeTuiPlugin } from '../shared/opencode-tui-plugin-install'
import {
  migrateOpenCodePluginIdentity,
  retiredOpenCodePluginFileName
} from '../shared/opencode-plugin-identity'

export type OpenCodeAgent = 'opencode' | 'opencode2'

export function installOpenCodePluginInCanonicalConfig(
  source: string,
  agent: OpenCodeAgent,
  environment: NodeJS.ProcessEnv | Record<string, string>,
  homeDir: string,
  onlyIfInstalled = false
): boolean {
  try {
    const configDir = resolveOpenCodeConfigDirectory(environment, homeDir)
    const pluginFileName =
      agent === 'opencode2' ? 'zkyq-opencode2-status.js' : 'zkyq-opencode-status.js'
    const pluginPath = join(configDir, 'plugins', pluginFileName)
    if (
      onlyIfInstalled &&
      !existsSync(pluginPath) &&
      !existsSync(join(configDir, 'plugins', retiredOpenCodePluginFileName(pluginFileName)!))
    ) {
      return false
    }
    mkdirSync(join(configDir, 'plugins'), { recursive: true })
    migrateOpenCodePluginIdentity(configDir, pluginFileName, source, 'canonical')
    writeOpenCodeTuiPlugin(join(configDir, 'plugins'), pluginFileName, source)
    if (!isInstalledOpenCodePluginCurrent(pluginPath, source)) {
      writeCanonicalOpenCodePluginAtomically(pluginPath, source)
    }
    return true
  } catch (err) {
    process.stderr.write(
      `[plugin-overlay] failed to install ${agent} plugin: ${err instanceof Error ? err.message : String(err)}\n`
    )
    return false
  }
}

export function isRelayOpenCodeOverlayPath(path: string, homeDir: string): boolean {
  const candidate = resolve(isAbsolute(path) ? path : join(homeDir, path))
  return [RELAY_HOOKS_DIR, '.orca-relay'].some((name) => {
    const relativePath = relative(resolve(homeDir, name), candidate)
    return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  })
}
