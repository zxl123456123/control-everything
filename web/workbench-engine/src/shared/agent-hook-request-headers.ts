export type AgentHookRequestHeaders = Readonly<Record<string, string | string[] | undefined>>

/** Normalize only platform-owned headers; conflicting aliases never select an identity. */
export function normalizeAgentHookRequestHeaders(
  headers: AgentHookRequestHeaders
): Record<string, string | string[] | undefined> | null {
  const result = { ...headers }
  for (const suffix of [
    'agent-hook-token',
    'agent-hook-meta-encoding',
    'agent-hook-meta',
    'agent-process',
    'pane-key',
    'tab-id',
    'launch-token',
    'worktree-id',
    'agent-hook-env',
    'agent-hook-version'
  ]) {
    const current = `x-zkyq-${suffix}`
    const retired = `x-orca-${suffix}`
    if (
      headers[current] !== undefined &&
      headers[retired] !== undefined &&
      JSON.stringify(headers[current]) !== JSON.stringify(headers[retired])
    )
      return null
    if (result[current] === undefined && headers[retired] !== undefined)
      result[current] = headers[retired]
    delete result[retired]
  }
  return result
}
