// A leaf with no imports, so the CLI entry can spell a session address without the codec's zod graph.
export const ORCA_SESSION_ADDRESS_PREFIX = 'agent_session:'
// Accepted only while sessions started by older builds may still be running.
export const LEGACY_SESSION_ADDRESS_PREFIX = 'orca_session_id:'

export function hasSessionAddressPrefix(value: string): boolean {
  return (
    value.startsWith(ORCA_SESSION_ADDRESS_PREFIX) || value.startsWith(LEGACY_SESSION_ADDRESS_PREFIX)
  )
}
