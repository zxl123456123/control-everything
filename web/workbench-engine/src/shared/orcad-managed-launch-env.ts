/**
 * Set only by a client's managed launch. Enables idle exit and names the host's activation
 * fence, so an update or rollback in flight keeps the server up. User-started servers never
 * carry it. Dependency-free so the orcad launcher can read it.
 */
export const ORCAD_MANAGED_ACTIVATION_ROOT_ENV = 'ZKYQ_SERVER_MANAGED_ACTIVATION_ROOT'
export const ORCAD_VERSION_ENV = 'ZKYQ_VERSION'
export const ORCAD_MANAGED_LAUNCH_ENVIRONMENT_VERSION = 1

const renamed = [
  ['ORCA_VERSION', ORCAD_VERSION_ENV],
  ['ORCA_ORCAD_MANAGED_ACTIVATION_ROOT', ORCAD_MANAGED_ACTIVATION_ROOT_ENV],
  ['ORCA_E2E_ORCAD_IDLE_TIMEOUT_MS', 'ZKYQ_E2E_SERVER_IDLE_TIMEOUT_MS']
] as const

/** Normalize inherited inputs before reading ownership or version information. */
export function migrateOrcadManagedLaunchEnvironment(env: NodeJS.ProcessEnv): void {
  for (const [old, current] of renamed) {
    if (env[old] !== undefined && env[current] !== undefined && env[old] !== env[current]) {
      throw new Error(
        `Conflicting server environment variables: ${old} and ${current}. Keep one value under ${current}, then restart Control Everything.`
      )
    }
  }
  for (const [old, current] of renamed) {
    if (env[current] === undefined && env[old] !== undefined) env[current] = env[old]
    delete env[old]
    if (env.WSLENV !== undefined) {
      env.WSLENV = env.WSLENV.split(':')
        .map((entry) =>
          entry === old || entry.startsWith(`${old}/`) ? current + entry.slice(old.length) : entry
        )
        .join(':')
    }
  }
}

/** Only frozen installed consumers receive their retired field names. */
export function orcadLaunchEnvironmentKey(key: string, version: 0 | 1): string {
  return version === 0 ? (renamed.find(([, current]) => current === key)?.[0] ?? key) : key
}

export function orcadLaunchEnvironment(env: NodeJS.ProcessEnv, version: 0 | 1): NodeJS.ProcessEnv {
  const result = { ...env }
  migrateOrcadManagedLaunchEnvironment(result)
  if (version === 0) {
    for (const [old, current] of renamed) {
      if (result[current] !== undefined) result[old] = result[current]
      delete result[current]
      if (result.WSLENV !== undefined)
        result.WSLENV = result.WSLENV.split(':')
          .map((entry) =>
            entry === current || entry.startsWith(`${current}/`)
              ? old + entry.slice(current.length)
              : entry
          )
          .join(':')
    }
  }
  return result
}

/** Explicit launch coordinates replace inherited coordinates before alias conflict checks. */
export function applyOrcadLaunchEnvironmentOverrides(
  env: NodeJS.ProcessEnv,
  overrides: Record<string, string>
): void {
  const next = { ...env }
  for (const [old, current] of renamed) {
    if (overrides[old] !== undefined || overrides[current] !== undefined) {
      delete next[old]
      delete next[current]
    }
  }
  Object.assign(next, overrides)
  const mapped = orcadLaunchEnvironment(next, overrides[ORCAD_VERSION_ENV] !== undefined ? 1 : 0)
  for (const [old, current] of renamed) {
    delete env[old]
    delete env[current]
  }
  Object.assign(env, mapped)
}

/** Self-contained because the fixed host script embeds this parser. */
export function parseOrcadLaunchEnvironmentVersion(raw: string | null): 0 | 1 {
  if (raw === null) return 0
  const value = JSON.parse(raw).zkyqManagedLaunchEnvironment
  if (value === undefined) return 0
  if (value !== 1) throw new Error('Unsupported server launch environment version')
  return 1
}
