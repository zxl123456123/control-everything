import { z } from 'zod'

const originalEnvironment = z.object({
  XDG_DATA_HOME: z.string().nullable(),
  XDG_STATE_HOME: z.string().nullable(),
  OPENCODE_AUTH_CONTENT: z.string().nullable(),
  OPENCODE_DB: z.string().nullable(),
  inlineAuthReference: z.uuid().optional()
})
const ORIGINAL_ENV = 'ZKYQ_DATA_ACCOUNT_ORIGINAL_ENV'

/** Normalize private launch markers before selection checks or environment merges. */
export function migrateManagedDataAccountEnvironmentIdentity(
  environment: Record<string, string | undefined>,
  envToDelete?: string[]
): void {
  const currentName = (key: string) => key.replace(/^ORCA_DATA_ACCOUNT_/, 'ZKYQ_DATA_ACCOUNT_')
  const retired = Object.keys(environment).filter((key) => key.startsWith('ORCA_DATA_ACCOUNT_'))
  for (const key of retired) {
    const current = currentName(key)
    if (
      environment[key] !== undefined &&
      environment[current] !== undefined &&
      environment[key] !== environment[current]
    ) {
      throw new Error(
        `Conflicting managed account environment variables: ${key} and ${current}. Keep one value under ${current}, then restart Control Everything.`
      )
    }
  }
  for (const key of retired) {
    const current = currentName(key)
    if (environment[current] === undefined) environment[current] = environment[key]
    delete environment[key]
  }
  if (environment.WSLENV !== undefined) {
    environment.WSLENV = environment.WSLENV.split(':').map(currentName).join(':')
  }
  if (envToDelete) {
    envToDelete.splice(0, envToDelete.length, ...new Set(envToDelete.map(currentName)))
  }
}
export const MANAGED_DATA_ACCOUNT_BASELINE_ENV_KEYS = [
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'OPENCODE_AUTH_CONTENT',
  'OPENCODE_DB'
] as const

export function captureManagedDataAccountOriginalEnvironment(
  environment: Record<string, string>,
  inlineAuthReference?: string
): void {
  migrateManagedDataAccountEnvironmentIdentity(environment)
  environment[ORIGINAL_ENV] = JSON.stringify({
    ...Object.fromEntries(
      MANAGED_DATA_ACCOUNT_BASELINE_ENV_KEYS.map((key) => [key, environment[key] ?? null])
    ),
    OPENCODE_AUTH_CONTENT: environment.OPENCODE_AUTH_CONTENT === '' ? '' : null,
    ...(inlineAuthReference ? { inlineAuthReference } : {})
  })
}

export function restoreManagedDataAccountEnvironment(
  environment: Record<string, string | undefined>,
  restoreOriginal = true,
  resolveInlineAuth?: (reference: string) => string | undefined
): void {
  migrateManagedDataAccountEnvironmentIdentity(environment)
  const provider = environment.ZKYQ_DATA_ACCOUNT_PROVIDER
  const dataHome = environment.ZKYQ_DATA_ACCOUNT_DATA_HOME
  if (!dataHome || (provider !== undefined && provider !== 'opencode' && provider !== 'devin')) {
    return
  }
  let original: z.infer<typeof originalEnvironment> | undefined
  try {
    const parsed = originalEnvironment.safeParse(JSON.parse(environment[ORIGINAL_ENV] ?? 'null'))
    if (restoreOriginal && parsed.success) {
      original = parsed.data
    }
  } catch {
    // Older panes have no baseline snapshot; strip only their owned overrides.
  }
  const ownsOpenCode =
    provider === 'opencode' &&
    environment.XDG_DATA_HOME === dataHome &&
    environment.ZKYQ_DATA_ACCOUNT_STATE_HOME !== undefined &&
    environment.XDG_STATE_HOME === environment.ZKYQ_DATA_ACCOUNT_STATE_HOME
  const inlineAuth =
    ownsOpenCode && environment.OPENCODE_AUTH_CONTENT === '' && original?.inlineAuthReference
      ? resolveInlineAuth?.(original.inlineAuthReference)
      : original?.OPENCODE_AUTH_CONTENT
  function restore(
    key: (typeof MANAGED_DATA_ACCOUNT_BASELINE_ENV_KEYS)[number],
    ownedValue: string | undefined
  ): void {
    if (ownedValue === undefined || environment[key] !== ownedValue) {
      return
    }
    const value = key === 'OPENCODE_AUTH_CONTENT' ? inlineAuth : original?.[key]
    if (typeof value === 'string') {
      environment[key] = value
    } else {
      delete environment[key]
    }
  }
  restore('XDG_DATA_HOME', dataHome)
  restore('XDG_STATE_HOME', environment.ZKYQ_DATA_ACCOUNT_STATE_HOME)
  if (ownsOpenCode) {
    restore('OPENCODE_AUTH_CONTENT', '')
    restore('OPENCODE_DB', 'opencode.db')
  }
  delete environment.ZKYQ_DATA_ACCOUNT_DATA_HOME
  delete environment.ZKYQ_DATA_ACCOUNT_STATE_HOME
  delete environment.ZKYQ_DATA_ACCOUNT_PROVIDER
  delete environment[ORIGINAL_ENV]
}
