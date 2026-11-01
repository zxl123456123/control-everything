import {
  buildManagedCommandHook,
  createManagedCommandMatcher,
  hookDefinitionHasManagedCommand,
  MANAGED_HOOK_TIMEOUT_SECONDS,
  removeManagedCommands,
  type HookDefinition,
  type HooksConfig
} from '../agent-hooks/installer-utils'
import {
  ANTIGRAVITY_EVENTS,
  ANTIGRAVITY_HOOK_BUNDLE_NAME,
  RETIRED_ANTIGRAVITY_HOOK_BUNDLE_NAME,
  ANTIGRAVITY_MANAGED_SCRIPT_FILE_NAMES,
  type AntigravityEvent
} from './hook-events'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getBundle(config: HooksConfig): Record<string, unknown> {
  const existing = config[ANTIGRAVITY_HOOK_BUNDLE_NAME]
  return isRecord(existing) ? { ...existing } : {}
}

export function hasManagedCommand(definitions: HookDefinition[], command: string): boolean {
  return definitions.some(
    (definition) =>
      definition.command === command ||
      (Array.isArray(definition.hooks) && definition.hooks.some((hook) => hook.command === command))
  )
}

export function createAntigravityManagedCommandMatcher(): (command: string | undefined) => boolean {
  const matchers = ANTIGRAVITY_MANAGED_SCRIPT_FILE_NAMES.map((scriptFileName) =>
    createManagedCommandMatcher(scriptFileName)
  )
  return (command) => matchers.some((matcher) => matcher(command))
}

export function bundleHasStaleManagedCommand(
  bundle: Record<string, unknown>,
  isManagedCommand: (command: string | undefined) => boolean,
  currentCommands: ReadonlySet<string>
): boolean {
  for (const definitions of Object.values(bundle)) {
    if (!Array.isArray(definitions)) {
      continue
    }
    for (const definition of definitions as HookDefinition[]) {
      if (!hookDefinitionHasManagedCommand(definition, isManagedCommand)) {
        continue
      }
      const commands = [
        definition.command,
        definition.bash,
        definition.powershell,
        ...(Array.isArray(definition.hooks) ? definition.hooks.map((hook) => hook.command) : [])
      ]
      if (
        commands.some(
          (command) =>
            command !== undefined && isManagedCommand(command) && !currentCommands.has(command)
        )
      ) {
        return true
      }
    }
  }
  return false
}

function buildEventDefinition(event: AntigravityEvent, command: string): HookDefinition {
  if (event.schema === 'tool') {
    return {
      matcher: '*',
      hooks: [buildManagedCommandHook(command)]
    }
  }
  // Antigravity's direct-command event schema carries the command on the
  // definition; add the host-level timeout backstop alongside it.
  return { type: 'command', command, timeout: MANAGED_HOOK_TIMEOUT_SECONDS }
}

function removeManagedCommandsFromBundle(
  bundle: Record<string, unknown>,
  isManagedCommand: (command: string | undefined) => boolean
): Record<string, unknown> {
  const next = { ...bundle }
  for (const [eventName, definitions] of Object.entries(next)) {
    if (!Array.isArray(definitions)) {
      continue
    }
    const cleaned = removeManagedCommands(definitions as HookDefinition[], isManagedCommand)
    if (cleaned.length === 0) {
      delete next[eventName]
    } else {
      next[eventName] = cleaned
    }
  }
  return next
}

function migrateBundleIdentity(config: HooksConfig): void {
  const current = config[ANTIGRAVITY_HOOK_BUNDLE_NAME]
  const previous = config[RETIRED_ANTIGRAVITY_HOOK_BUNDLE_NAME]
  for (const bundle of [current, previous]) {
    if (bundle !== undefined && !isRecord(bundle))
      throw new Error('Invalid Antigravity hook bundle; preserve its contents before retrying')
  }
  if (previous === undefined) return
  if (
    isRecord(current) &&
    isRecord(previous) &&
    (current.enabled === undefined ? true : current.enabled) !==
      (previous.enabled === undefined ? true : previous.enabled)
  ) {
    throw new Error('Control Everything: conflicting Antigravity hook bundle enablement')
  }
  const next = {
    ...(previous as Record<string, unknown>),
    ...(current as Record<string, unknown> | undefined)
  }
  for (const [key, value] of Object.entries(previous as Record<string, unknown>)) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, key)) continue
    const existing = current[key]
    if (Array.isArray(existing) && Array.isArray(value)) next[key] = [...value, ...existing]
    else if (JSON.stringify(existing) !== JSON.stringify(value))
      throw new Error(
        'Control Everything: conflicting Antigravity hook bundle metadata (' + key + ')'
      )
  }
  // Publish only after all metadata conflicts have been checked; neither input is mutated above.
  config[ANTIGRAVITY_HOOK_BUNDLE_NAME] = next
  delete config[RETIRED_ANTIGRAVITY_HOOK_BUNDLE_NAME]
}

export function buildInstalledConfig(
  config: HooksConfig,
  commandForEvent: (event: AntigravityEvent) => string,
  isManagedCommand: (command: string | undefined) => boolean
): void {
  migrateBundleIdentity(config)
  const bundle = removeManagedCommandsFromBundle(getBundle(config), isManagedCommand)

  for (const event of ANTIGRAVITY_EVENTS) {
    const current = Array.isArray(bundle[event.eventName])
      ? (bundle[event.eventName] as HookDefinition[])
      : []
    const cleaned = removeManagedCommands(current, isManagedCommand)
    bundle[event.eventName] = [...cleaned, buildEventDefinition(event, commandForEvent(event))]
  }

  config[ANTIGRAVITY_HOOK_BUNDLE_NAME] = bundle
}

export function removeInstalledConfig(config: HooksConfig): void {
  migrateBundleIdentity(config)
  const isManagedCommand = createAntigravityManagedCommandMatcher()
  const bundle = removeManagedCommandsFromBundle(getBundle(config), isManagedCommand)
  if (Object.keys(bundle).length === 0) {
    delete config[ANTIGRAVITY_HOOK_BUNDLE_NAME]
    return
  }
  config[ANTIGRAVITY_HOOK_BUNDLE_NAME] = bundle
}
