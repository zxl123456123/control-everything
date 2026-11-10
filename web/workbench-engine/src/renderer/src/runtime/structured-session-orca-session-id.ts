import { isOrcaSessionId } from '../../../shared/orca-session-address'
import { LEGACY_SESSION_ADDRESS_PREFIX } from '../../../shared/orca-session-address-prefix'
import type { OrchestrationSessionAddressResult } from '../../../shared/orchestration-caller-status'
import { sessionIdentityFromRpc } from '../../../shared/orchestration-caller-status'
import { callRuntimeRpc } from './runtime-rpc-client'
import { RuntimeRpcCallError } from './runtime-rpc-result'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'

/**
 * A chat's Orca session ID: its `/clear` root's, which the host derives from the session records.
 * Null for an id that is not an Orca session id.
 */
export async function resolveStructuredSessionOrcaSessionId(
  target: RuntimeClientTarget,
  sessionId: string
): Promise<string | null> {
  if (!isOrcaSessionId(sessionId)) {
    return null
  }
  try {
    const result = await callRuntimeRpc<OrchestrationSessionAddressResult>(
      target,
      'orchestration.sessionAddress',
      { sessionId, responseFormat: 'workbench' }
    )
    return sessionIdentityFromRpc(result)
  } catch (error) {
    // Why: a host that predates the method routes the current session's ID to the same chat.
    if (error instanceof RuntimeRpcCallError && error.code === 'method_not_found') {
      return `${LEGACY_SESSION_ADDRESS_PREFIX}${sessionId}`
    }
    throw error
  }
}
