import { createHash } from 'node:crypto'
import type { PlatformProgressBinding } from '../../shared/platform-task-progress-contract'
import { mintAgentStatusFleetEvidence } from '../ipc/agent-status-ipc-boundary'
import { getPublishedHostDescriptor } from './host-descriptor'
import type { OrcaRuntimeService } from './orca-runtime'
import { normalizeAgentProviderSession, agentProviderSessionsEqual } from '../../shared/agent-session-resume'

/** Same UUIDv5 name as the platform's registered environment; never caller asserted. */
export function platformProgressEnvironmentId(runtimeId: string): string {
  const installation = getPublishedHostDescriptor(runtimeId)?.installationId
  if (!installation) throw new Error('runtime_identity_unavailable')
  const namespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex')
  const bytes = createHash('sha1').update(namespace)
    .update(`control-everything:workbench:${installation.toLowerCase()}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h = bytes.toString('hex')
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
}

export function platformBindingState(runtime: OrcaRuntimeService, binding: PlatformProgressBinding): 'current' | 'replaced' | 'unavailable' {
  try {
    if (runtime.getRuntimeId() !== binding.runtimeId || platformProgressEnvironmentId(runtime.getRuntimeId()) !== binding.environmentId)
      return 'replaced'
    const live = runtime.resolveLiveLeafForHandle(binding.terminalHandle)
    const prompt = runtime.getTerminalPromptRequestBinding(binding.terminalHandle)
    if (!live) return 'unavailable'
    return live.ptyId === binding.ptyId && runtime.getTerminalWorktreeIdForHandle(binding.terminalHandle) === binding.worktreeId &&
      runtime.getTerminalPaneKey(binding.terminalHandle) === binding.paneKey &&
      runtime.getTerminalProcessIncarnation(binding.terminalHandle) === binding.statusProcessIncarnation &&
      prompt.ptyId === binding.ptyId && prompt.processIncarnation === binding.processIncarnation &&
      prompt.generation === binding.generation ? 'current' : 'replaced'
  } catch { return 'unavailable' }
}

/** Read the text and ingestion identity from the same row, synchronously. */
export function readPlatformTaskProgressSnapshot(runtime: OrcaRuntimeService, binding: PlatformProgressBinding) {
  const unknown = (reason: string) => ({ contractVersion: 1 as const, available: false as const,
    reason, binding, readAt: Date.now() })
  if (platformBindingState(runtime, binding) !== 'current') return unknown('binding_changed')
  const rows = (runtime.getAgentStatusSnapshotFn?.() ?? []).filter(row => row.paneKey === binding.paneKey)
  if (rows.length !== 1) return unknown('status_unavailable')
  const row = rows[0]
  const observed = runtime.readObservedAgentStatusPaneIdentityFn(row.paneKey)
  if (observed.kind !== 'observed') return unknown('identity_unobserved')
  const evidence = mintAgentStatusFleetEvidence(row, runtime, observed)
  if (evidence.binding.kind === 'unresolved') return unknown(evidence.binding.reason)
  if (observed.terminalHandle !== binding.terminalHandle || observed.processIncarnation !== binding.statusProcessIncarnation ||
      evidence.binding.terminalHandle !== binding.terminalHandle || evidence.binding.processIncarnation !== binding.statusProcessIncarnation ||
      row.connectionId !== null || row.worktreeId !== binding.worktreeId || row.agentType !== binding.agent ||
      row.providerSessionOnly || row.programStatusOnly || row.restoredUnconfirmed || row.isReplay)
    return unknown('identity_changed')
  const provider = normalizeAgentProviderSession(row.providerSession)
  if (!provider || (binding.providerSession && !agentProviderSessionsEqual(binding.agent, binding.providerSession, provider)))
    return unknown('provider_unavailable')
  const actualBinding = { ...binding, providerSession: provider }
  if (platformBindingState(runtime, binding) !== 'current') return unknown('identity_changed')
  return { contractVersion: 1 as const, available: true as const, binding: actualBinding,
    evidenceTime: evidence.clock, deliveredAt: evidence.deliveredAt, readAt: Date.now(),
    status: { state: row.state, providerSession: actualBinding.providerSession,
      turnStartedAt: row.turnStartedAt, turnEndedAt: row.turnEndedAt, turnEndDisposition: row.turnEndDisposition,
      lastAssistantMessage: row.lastAssistantMessage?.slice(0, 16384),
      lastAssistantMessageIsToolOutput: row.lastAssistantMessageIsToolOutput,
      interrupted: row.interrupted, sessionBoundary: row.sessionBoundary,
      interactivePrompt: row.interactivePrompt?.slice(0, 4096) }
  }
}
