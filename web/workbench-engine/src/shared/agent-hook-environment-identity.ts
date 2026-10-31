export const AGENT_HOOK_IDENTITY_SUFFIXES = [
  'ANTIGRAVITY_EVENT',
  'HOOK_AGENT_PID',
  'PANE_KEY',
  'TAB_ID',
  'WORKTREE_ID',
  'AGENT_LAUNCH_TOKEN',
  'AGENT_PANE',
  'AGENT_LAUNCH',
  'WORKSPACE_ID',
  'PROJECT_GROUP_ID',
  'WORKSPACE_ROOT',
  'AGENT_HOOK_ENDPOINT',
  'AGENT_HOOK_ENV',
  'AGENT_HOOK_NODE',
  'AGENT_HOOK_OPENCODE_TUI',
  'AGENT_HOOK_PORT',
  'AGENT_HOOK_ROOT',
  'AGENT_HOOK_TOKEN',
  'AGENT_HOOK_TRANSPORT',
  'AGENT_HOOK_VERSION',
  'OMP_CODING_AGENT_DIR',
  'OMP_FRESH_CONFIG',
  'OMP_PREFILL',
  'OMP_SOURCE_AGENT_DIR',
  'OMP_STATUS_EXTENSION',
  'PI_CODING_AGENT_DIR',
  'PI_PREFILL',
  'PI_SOURCE_AGENT_DIR',
  'PI_STATUS_OWNED',
  'PI_TITLE_MARKER_OWNED',
  'PRIME_AGENT_SOURCE_AGENT_DIR',
  'PRIME_AGENT_STATUS_EXTENSION',
  'PRIME_AGENT_STATUS_OWNED'
] as const

/** Migrate platform-owned Hook keys before merging inherited and explicit environments. */
export function migrateAgentHookEnvironmentIdentity(
  env: Record<string, string | undefined>,
  envToDelete?: string[]
): void {
  // Installed plugins embed this function, so it must not reference module-level values.
  const suffixes = [
    'ANTIGRAVITY_EVENT',
    'HOOK_AGENT_PID',
    'PANE_KEY',
    'TAB_ID',
    'WORKTREE_ID',
    'AGENT_LAUNCH_TOKEN',
    'AGENT_PANE',
    'AGENT_LAUNCH',
    'WORKSPACE_ID',
    'PROJECT_GROUP_ID',
    'WORKSPACE_ROOT',
    'AGENT_HOOK_ENDPOINT',
    'AGENT_HOOK_ENV',
    'AGENT_HOOK_NODE',
    'AGENT_HOOK_OPENCODE_TUI',
    'AGENT_HOOK_PORT',
    'AGENT_HOOK_ROOT',
    'AGENT_HOOK_TOKEN',
    'AGENT_HOOK_TRANSPORT',
    'AGENT_HOOK_VERSION',
    'OMP_CODING_AGENT_DIR',
    'OMP_FRESH_CONFIG',
    'OMP_PREFILL',
    'OMP_SOURCE_AGENT_DIR',
    'OMP_STATUS_EXTENSION',
    'PI_CODING_AGENT_DIR',
    'PI_PREFILL',
    'PI_SOURCE_AGENT_DIR',
    'PI_STATUS_OWNED',
    'PI_TITLE_MARKER_OWNED',
    'PRIME_AGENT_SOURCE_AGENT_DIR',
    'PRIME_AGENT_STATUS_EXTENSION',
    'PRIME_AGENT_STATUS_OWNED'
  ]
  for (const suffix of suffixes) {
    const current = `ZKYQ_${suffix}`
    const retired = `ORCA_${suffix}`
    if (env[current] !== undefined && env[retired] !== undefined && env[current] !== env[retired]) {
      throw new Error(
        `Conflicting Hook environment variables: ${current} and ${retired}. Keep one value under ${current}, then restart Control Everything.`
      )
    }
  }
  for (const suffix of suffixes) {
    const current = `ZKYQ_${suffix}`
    const retired = `ORCA_${suffix}`
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
