import type {
  OrchestrationCallerShowResult,
  OrchestrationPartyLocationResult,
  OrchestrationSessionAddressResult
} from '../../../../../shared/orchestration-caller-status'
import {
  formatOrcaSessionAddress,
  isOrcaSessionId
} from '../../../../../shared/orca-session-address'
import { LEGACY_SESSION_ADDRESS_PREFIX } from '../../../../../shared/orca-session-address-prefix'
import { ORCHESTRATION_SESSION_CALLER_ERROR_CODES as CODES } from '../../../../../shared/orchestration-session-caller-codes'
import {
  CallerShowParams,
  PartyLocationParams,
  SessionAddressParams
} from '../../../../../shared/rpc-contract/orchestration-params'
import { OrchestrationError } from '../../../orchestration/orchestration-error'
import { resolveOrcaSessionParty } from '../../../orchestration/orchestration-party'
import { locateOrchestrationParty } from '../../../orchestration/orchestration-party-location'
import { readAgentSessionRecordStore } from '../../../orchestration/structured-session-lineage'
import { defineMethod } from '../../core'

export const ORCHESTRATION_CALLER_METHODS = [
  defineMethod({
    name: 'orchestration.callerShow',
    permission: 'workspace',
    params: CallerShowParams,
    // The entry already resolved the session; the option only selects the response field.
    handler: (params, { orchestrationCaller }): OrchestrationCallerShowResult => ({
      caller: orchestrationCaller
        ? {
            ...(params.responseFormat === 'workbench'
              ? { sessionId: formatOrcaSessionAddress(orchestrationCaller.orcaSessionId) }
              : {
                  orcaSessionId: `${LEGACY_SESSION_ADDRESS_PREFIX}${orchestrationCaller.orcaSessionId}`
                }),
            live: true
          }
        : null
    })
  }),
  defineMethod({
    name: 'orchestration.sessionAddress',
    permission: 'workspace',
    params: SessionAddressParams,
    // Why host-side: only the host's session records know a chat's `/clear` root.
    handler: (params, { runtime }): OrchestrationSessionAddressResult => {
      if (!isOrcaSessionId(params.sessionId)) {
        throw new OrchestrationError(
          CODES.unknown,
          `${params.sessionId} is not a workbench session ID.`,
          { effectsApplied: false }
        )
      }
      const party = resolveOrcaSessionParty(params.sessionId, runtime.getOrchestrationDb())
      const address = formatOrcaSessionAddress(party.orcaSessionId)
      return params.responseFormat === 'workbench'
        ? { sessionId: address }
        : { orcaSessionId: `${LEGACY_SESSION_ADDRESS_PREFIX}${party.orcaSessionId}` }
    }
  }),
  defineMethod({
    name: 'orchestration.partyLocation',
    permission: 'workspace',
    params: PartyLocationParams,
    // Why host-side: a chat sender's live session follows its `/clear` lineage on this host.
    handler: (params, { runtime }): OrchestrationPartyLocationResult =>
      locateOrchestrationParty(
        params.address,
        {
          db: runtime.getOrchestrationDb(),
          records: readAgentSessionRecordStore(),
          terminalPaneKey: (handle) => runtime.getTerminalPaneKey(handle),
          terminalHandleForPaneKey: (paneKey) => runtime.getTerminalHandleForPaneKey(paneKey)
        },
        params.messageIds
      )
  })
]
