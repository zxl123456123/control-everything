/** Migrate platform-owned OpenCode keys before combining inherited and launch environments. */
export function migrateOpenCodeEnvironmentIdentity(
  env: Record<string, string | undefined>,
  envToDelete?: string[]
): void {
  // Keep this function self-contained: installed plugins embed its JavaScript source.
  const suffixes = [
    'CONFIG_DIR',
    'SOURCE_CONFIG_DIR',
    'AGENT',
    'PLUGIN_API',
    'STARTUP_PROMPT_BODY',
    'STARTUP_PROMPT_ENDPOINT',
    'STARTUP_PROMPT_NONCE',
    'STARTUP_PROMPT_SHA256',
    'STARTUP_PROMPT_SHELL'
  ]
  for (const suffix of suffixes) {
    const current = `ZKYQ_OPENCODE_${suffix}`
    const retired = `ORCA_OPENCODE_${suffix}`
    if (env[retired] !== undefined && env[current] !== undefined && env[retired] !== env[current]) {
      throw new Error(
        `Conflicting OpenCode environment variables: ${current} and ${retired}. Keep one value under ${current}, then restart Control Everything.`
      )
    }
  }
  for (const suffix of suffixes) {
    const current = `ZKYQ_OPENCODE_${suffix}`
    const retired = `ORCA_OPENCODE_${suffix}`
    if (env[current] === undefined && env[retired] !== undefined) env[current] = env[retired]
    delete env[retired]
    if (env.WSLENV !== undefined) {
      env.WSLENV = env.WSLENV.split(':')
        .map((entry) =>
          entry === retired || entry.startsWith(`${retired}/`)
            ? current + entry.slice(retired.length)
            : entry
        )
        .join(':')
    }
    if (envToDelete) {
      for (let index = 0; index < envToDelete.length; index++) {
        if (envToDelete[index] === retired) envToDelete[index] = current
      }
    }
  }
  if (envToDelete) envToDelete.splice(0, envToDelete.length, ...new Set(envToDelete))
}
