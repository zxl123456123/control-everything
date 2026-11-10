/**
 * Marks a structured session's child. It names nothing — no handle, no pane key, no token.
 *
 * Every structured child now also carries its injected session id, and a current CLI checks the id
 * first, so for it the marker only matters when the id is absent. Read the retired marker for
 * children already running when the host was upgraded; new children receive only the current
 * marker. Either way the answer is refuse, never guess: a structured session has
 * no pane, so every implicit-terminal guess resolves to a sibling, and `orchestration check` is
 * destructive by default.
 *
 * The reader answers only "does this process carry the marker": a current CLI reaches it after the
 * id check has already returned, which is what makes a marked child with an id act as its session.
 */
export const ZKYQ_STRUCTURED_SESSION_ENV = 'ZKYQ_STRUCTURED_SESSION'
export const ORCA_STRUCTURED_SESSION_ENV = 'ORCA_STRUCTURED_SESSION'

export function hasStructuredSessionMarker(env: NodeJS.ProcessEnv = process.env): boolean {
  return [ZKYQ_STRUCTURED_SESSION_ENV, ORCA_STRUCTURED_SESSION_ENV].some(
    (key) => (env[key] ?? '').length > 0
  )
}
