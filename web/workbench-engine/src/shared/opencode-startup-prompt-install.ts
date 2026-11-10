import { join } from 'node:path'
import { writeOpenCodeTuiPluginDirectory } from './opencode-tui-plugin-install'
import { migrateOpenCodePluginIdentity } from './opencode-plugin-identity'

export const OPENCODE_STARTUP_PROMPT_PLUGIN_DIRECTORY = 'zkyq-opencode-startup-prompt'

export function writeOpenCodeStartupPromptPlugin(
  configDir: string,
  source: string,
  ownership: 'canonical' | 'overlay' = 'canonical'
): void {
  migrateOpenCodePluginIdentity(
    configDir,
    `${OPENCODE_STARTUP_PROMPT_PLUGIN_DIRECTORY}.js`,
    source,
    ownership
  )
  writeOpenCodeTuiPluginDirectory(
    join(configDir, 'plugins'),
    OPENCODE_STARTUP_PROMPT_PLUGIN_DIRECTORY,
    source,
    ownership
  )
}
