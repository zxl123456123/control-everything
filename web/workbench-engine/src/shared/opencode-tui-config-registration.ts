import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser'
import {
  writeCanonicalOpenCodePluginAtomically,
  writeOverlayOpenCodePluginAtomically
} from './opencode-plugin-atomic-write'

export class InvalidOpenCodeTuiConfigError extends Error {}

/** Register 1.x's explicit TUI entry without changing other settings or overlay targets. */
export function registerOpenCodeTuiPlugin(
  configDir: string,
  entry: string,
  ownership: 'canonical' | 'overlay'
): void {
  prepareOpenCodeTuiPluginRegistration(configDir, entry, ownership)()
}

/** Validate before renaming an installed plugin; apply the config edit after the move. */
export function prepareOpenCodeTuiPluginRegistration(
  configDir: string,
  entry: string,
  ownership: 'canonical' | 'overlay',
  previousEntry?: string
): () => void {
  const configPath =
    ['tui.jsonc', 'tui.json'].map((name) => join(configDir, name)).find(existsSync) ??
    join(configDir, 'tui.json')
  const text = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '{}\n'
  const errors: ParseError[] = []
  const config: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length || typeof config !== 'object' || !config || Array.isArray(config)) {
    throw new InvalidOpenCodeTuiConfigError('Cannot register OpenCode TUI plugin in invalid config')
  }
  const previous = 'plugin' in config ? config.plugin : undefined
  if (previous !== undefined && !Array.isArray(previous)) {
    throw new InvalidOpenCodeTuiConfigError(
      'Cannot register OpenCode TUI plugin in invalid plugin list'
    )
  }
  const sourceDir = existsSync(configPath) ? dirname(realpathSync(configPath)) : configDir
  const entries: unknown[] = previous ?? []
  const plugin = pathToFileURL(entry).href
  const rebase = (item: unknown): unknown =>
    ownership === 'overlay' && typeof item === 'string' && /^\.{1,2}[\\/]/.test(item)
      ? pathToFileURL(resolve(sourceDir, item)).href
      : item
  let plugins = entries.map((item) =>
    Array.isArray(item) && typeof item[0] === 'string'
      ? [rebase(item[0]), ...item.slice(1)]
      : rebase(item)
  )
  if (previousEntry) {
    const retired = new Set([
      pathToFileURL(previousEntry).href,
      pathToFileURL(resolve(sourceDir, relative(configDir, previousEntry))).href
    ])
    const normalize = (value: unknown): unknown =>
      typeof value === 'string' && (isAbsolute(value) || /^\.{1,2}[\\/]/.test(value))
        ? pathToFileURL(resolve(sourceDir, value)).href
        : value
    let found: string | undefined
    let changed = false
    plugins = plugins.flatMap((item) => {
      const value = Array.isArray(item) ? item[0] : item
      const url = normalize(value)
      if (!retired.has(url as string) && url !== plugin) return [item]
      changed ||= retired.has(url as string)
      const options = JSON.stringify(Array.isArray(item) ? item.slice(1) : [])
      if (found !== undefined) {
        if (found !== options) {
          throw new InvalidOpenCodeTuiConfigError('Conflicting OpenCode TUI plugin registrations')
        }
        return []
      }
      found = options
      return [Array.isArray(item) ? [plugin, ...item.slice(1)] : plugin]
    })
    if (!changed) return () => {}
  } else if (!plugins.some((item) => (Array.isArray(item) ? item[0] : item) === plugin)) {
    plugins.push(plugin)
  }
  const updated = applyEdits(
    text,
    modify(text, ['plugin'], plugins, {
      formattingOptions: { tabSize: 2, insertSpaces: true }
    })
  )
  if (updated === text) {
    return () => {}
  }
  const write =
    ownership === 'canonical'
      ? writeCanonicalOpenCodePluginAtomically
      : writeOverlayOpenCodePluginAtomically
  return () => write(configPath, updated)
}
