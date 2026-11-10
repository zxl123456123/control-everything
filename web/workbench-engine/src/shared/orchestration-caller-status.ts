/**
 * The calling agent's session ID (`agent_session:<id>`), as the host resolved it from the
 * session id injected into the caller's environment; never from a flag. Terminal agents have none
 * yet. `zkyq status --json` reports it as `caller`.
 */
export type SessionIdentityResult = { sessionId: string } | { orcaSessionId: string }
export type OrchestrationCallerSession = SessionIdentityResult & { live: boolean }

/** Read an older host's field until independently updated clients and hosts have converged. */
export function sessionIdentityFromRpc(result: SessionIdentityResult): string {
  const current = 'sessionId' in result ? result.sessionId : undefined
  const legacy = 'orcaSessionId' in result ? result.orcaSessionId : undefined
  if (current !== undefined && legacy !== undefined && current !== legacy) {
    throw new Error('Conflicting session identities in runtime response')
  }
  const value = current ?? legacy
  if (typeof value !== 'string' || !value)
    throw new Error('Missing session identity in runtime response')
  return value
}

/** The host refused the session this process names, so it cannot act as it right now. */
export type OrchestrationCallerRefusal = {
  live: false
  refusal: { code: string; message: string }
}

/**
 * Absent from a status result when there is nothing to show: not a session, an unreachable
 * runtime, or a host that predates `orchestration.callerShow`.
 */
export type CliStatusCaller = { sessionId: string; live: boolean } | OrchestrationCallerRefusal

/** `null`: the caller is not an agent session. */
export type OrchestrationCallerShowResult = { caller: OrchestrationCallerSession | null }

/** `orchestration.sessionAddress`: a conversation's `/clear` root session ID. */
export type OrchestrationSessionAddressResult = SessionIdentityResult

/** Where a party is now: a chat at its `/clear` lineage's live session, or a terminal. */
export type OrchestrationPartyLocation =
  | { kind: 'chat'; sessionId: string; worktreeId: string }
  | { kind: 'terminal'; handle: string }

/** `orchestration.partyLocation`: a null location is a party this host does not find. `lost` says
 *  it proved that party gone, and what it was; absent, the host cannot tell (one it does not run). */
export type OrchestrationPartyLocationResult = {
  location: OrchestrationPartyLocation | null
  lost?: 'chat' | 'terminal'
}
