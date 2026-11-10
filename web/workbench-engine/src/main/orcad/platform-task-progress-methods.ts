import { z } from 'zod'
import { defineMethod, type RpcContext } from '../runtime/rpc/core'
import {
  PlatformProgressAgent, PlatformProgressBinding, PlatformProgressCreate, PlatformProgressObserve,
  PlatformProgressReceipt, PlatformProgressResume, PlatformProgressSend
} from '../../shared/platform-task-progress-contract'
import { CreateAgentSessionParams, EnsureAgentSessionParams } from '../../shared/rpc-contract/agent-session-params'
import { platformBindingState, platformProgressEnvironmentId } from '../runtime/platform-task-progress-snapshot'
import { hashCanonical, readPromptBasePayloadHash, readPromptBindingPayloadHash,
  replayStableCallerParams } from '../runtime/rpc/orchestration-mutation-receipt'
import { assertTerminalAgentSendable } from '../runtime/rpc/terminal-agent-send-guard'
import { assertTerminalSendExactPtyBinding, assertTerminalSendTextWithinLimit,
  isTerminalInputLockedForClient } from '../runtime/rpc/methods/terminal/terminal-input-delivery'
import { observeReplayedTerminalPrompt } from '../runtime/rpc/methods/terminal/terminal-prompt-receipt'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { parsePaneKey } from '../../shared/stable-pane-id'
import { splitWorktreeId } from '../../shared/worktree/id'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { TuiAgent } from '../../shared/tui-agent'
import { agentProviderSessionsEqual } from '../../shared/agent-session-resume'

function requireOwner(context: RpcContext): void {
  if (context.caller?.kind !== 'local-cli' || context.orchestrationCaller)
    throw new Error('platform_owner_required')
}

function requireHost(runtime: OrcaRuntimeService, params: { runtimeId: string; environmentId: string }): void {
  if (params.runtimeId !== runtime.getRuntimeId() || params.environmentId !== platformProgressEnvironmentId(runtime.getRuntimeId()))
    throw new Error('binding_changed')
}

async function requireScope(runtime: OrcaRuntimeService, params: z.infer<typeof PlatformProgressResume> | z.infer<typeof PlatformProgressCreate>) {
  requireHost(runtime, params)
  const scope = await runtime.resolveTerminalWorkspaceLaunchScope(`id:${params.worktreeId}`)
  if (scope.id !== params.worktreeId || scope.connectionId !== null || scope.repo?.id !== params.repoId)
    throw new Error('project_directory_mismatch')
  const settings = runtime.getClientSettings()
  if (settings.disabledTuiAgents.includes(params.agent)) throw new Error('agent_disabled')
  return scope
}

function captureBinding(runtime: OrcaRuntimeService, handle: string, params: {
  runtimeId: string; environmentId: string; worktreeId: string; agent: TuiAgent
}, providerSession: PlatformProgressBinding['providerSession'] = null): PlatformProgressBinding {
  const live = runtime.resolveLiveLeafForHandle(handle)
  const paneKey = runtime.getTerminalPaneKey(handle)
  const prompt = runtime.getTerminalPromptRequestBinding(handle)
  const incarnation = runtime.getTerminalProcessIncarnation(handle)
  if (!live || live.ptyId !== prompt.ptyId || runtime.getTerminalWorktreeIdForHandle(handle) !== params.worktreeId || !paneKey || !incarnation)
    throw new Error('binding_unavailable')
  return { runtimeId: params.runtimeId, environmentId: params.environmentId,
    worktreeId: params.worktreeId, agent: params.agent, providerSession,
    terminalHandle: handle, paneKey, ...prompt, statusProcessIncarnation: incarnation,
    ...(parsePaneKey(paneKey) ? { tabId: parsePaneKey(paneKey)!.tabId } : {}) }
}

const ReceiptSend = z.object({
  handle: z.string(), accepted: z.boolean(), bytesWritten: z.number().int().nonnegative(),
  refusedReason: z.enum(['no-agent', 'permission', 'source-only', 'input-locked', 'binding-changed']).optional(),
  prompt: z.object({ requestId: z.string(), stages: z.array(z.enum(['input_accepted', 'turn_started'])),
    provider: z.union([PlatformProgressAgent, z.enum(['unsupported', 'old-host'])]),
    observation: z.enum(['supported', 'unsupported', 'incarnation_replaced', 'permission']),
    processIncarnation: z.string(), generation: z.number().int(), baselineWorkingSequence: z.number(),
    baselineExplicitWorkingStartedAt: z.number().nullable().optional(), baselinePermissionSequence: z.number().optional()
  }).strict(),
  writeSettlement: z.unknown().optional()
}).strict()
const ReceiptEnvelope = z.object({ send: ReceiptSend,
  mutation: z.object({ requestId: z.string(), replayed: z.boolean() }).strict().optional()
}).strict()

/** This path only reads the local caller identity and the fixed send ledger. */
export function readPlatformProgressReceipt(params: z.infer<typeof PlatformProgressReceipt>, context: RpcContext) {
  requireOwner(context)
  const runtime = context.runtime
  let bindingState = platformBindingState(runtime, params.expectedBinding)
  if (bindingState === 'current' && !runtime.getPlatformTaskProgressSnapshot(params.expectedBinding).available)
    bindingState = 'unavailable'
  const invalid = (reason: string) => ({ receiptState: 'invalid' as const, bindingState, reason })
  if (params.requestId !== params.expectedSendParams.origin.requestId ||
      hashCanonical(params.expectedBinding) !== hashCanonical(params.expectedSendParams.expectedBinding))
    return invalid('request_mismatch')
  let stored: ReturnType<OrcaRuntimeService['readPlatformTaskProgressReceiptRecord']>
  try { stored = runtime.readPlatformTaskProgressReceiptRecord(params.requestId) }
  catch { return invalid('receipt_unavailable') }
  const { fingerprint, row } = stored
  if (!fingerprint) return { receiptState: 'absent' as const, bindingState, reason: 'caller_identity_missing' }
  if (!row) return { receiptState: 'absent' as const, bindingState, reason: 'not_found' }
  const binding = params.expectedBinding
  const stable = replayStableCallerParams({ getTerminalPaneKey: handle =>
    handle === binding.terminalHandle ? binding.paneKey : null }, params.expectedSendParams)
  const base = hashCanonical({ method: 'platform.taskProgress.send', params: stable })
  const bindingHash = hashCanonical({ ptyId: binding.ptyId, processIncarnation: binding.processIncarnation, generation: binding.generation })
  if (row.method !== 'platform.taskProgress.send' || readPromptBasePayloadHash(row.payload_hash) !== base ||
      readPromptBindingPayloadHash(row.payload_hash) !== bindingHash) return invalid('request_mismatch')
  if (row.state === 'pending') return { receiptState: 'pending' as const, bindingState }
  try {
    const receipt = ReceiptEnvelope.parse(JSON.parse(row.receipt ?? 'null'))
    const prompt = receipt.send.prompt
    if (receipt.send.handle !== binding.terminalHandle || prompt.requestId !== params.requestId ||
        prompt.processIncarnation !== binding.processIncarnation || prompt.generation !== binding.generation ||
        prompt.provider !== binding.agent ||
        (receipt.send.accepted ? !prompt.stages.includes('input_accepted') :
          receipt.send.bytesWritten !== 0 || prompt.stages.length !== 0 || !receipt.send.refusedReason) ||
        (receipt.mutation && receipt.mutation.requestId !== params.requestId)) return invalid('request_mismatch')
    return { receiptState: 'completed' as const, bindingState, receipt }
  } catch { return invalid('receipt_invalid') }
}

export const PLATFORM_TASK_PROGRESS_METHODS = [
  defineMethod({ name: 'platform.taskProgress.create', permission: 'workspace', params: PlatformProgressCreate,
    handler: async (params, context) => {
      requireOwner(context)
      const scope = await requireScope(context.runtime, params)
      const cwd = context.runtime.resolveWorkspaceTerminalStartupCwd(scope, params.cwd)
      const result = await context.runtime.createAgentSession(CreateAgentSessionParams.parse({
        clientOperationId: params.operationId, worktree: `id:${params.worktreeId}`, agent: params.agent,
        prompt: params.prompt, promptDelivery: 'auto-submit', startupCwd: cwd, presentation: 'background', viewMode: 'terminal'
      }), { signal: context.signal })
      return { contractVersion: 1, ...result, binding: captureBinding(context.runtime, result.terminal.handle, params) }
    }
  }),
  defineMethod({ name: 'platform.taskProgress.resume', permission: 'workspace', params: PlatformProgressResume,
    handler: async (params, context) => {
      requireOwner(context)
      await requireScope(context.runtime, params)
      const result = await context.runtime.ensureAgentSession(EnsureAgentSessionParams.parse({
        kind: 'explicit', worktree: `id:${params.worktreeId}`, agent: params.agent,
        providerSession: params.providerSession, presentation: 'background'
      }), { signal: context.signal })
      return { contractVersion: 1, ...result, binding: captureBinding(context.runtime, result.terminal.handle, params, params.providerSession) }
    }
  }),
  defineMethod({ name: 'platform.taskProgress.observe', permission: 'workspace', params: PlatformProgressObserve,
    handler: async (params, context) => {
      requireOwner(context)
      let binding: PlatformProgressBinding
      if ('bindingQuery' in params) {
        const query = params.bindingQuery
        requireHost(context.runtime, query)
        // A launch-scope resolution can materialize Git configuration. Reads use the
        // registered repo and the exact worktree identity carried by the live pane.
        const repos = context.runtime.listRepos().filter(repo => repo.id === query.repoId &&
          getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID)
        if (repos.length !== 1 || splitWorktreeId(query.worktreeId)?.repoId !== query.repoId)
          throw new Error('project_directory_mismatch')
        const candidates = (context.runtime.getAgentStatusSnapshotFn?.() ?? []).filter(row =>
          row.connectionId === null && row.worktreeId === query.worktreeId && row.agentType === query.agent &&
          agentProviderSessionsEqual(query.agent, row.providerSession, query.providerSession))
        if (candidates.length !== 1) return { contractVersion: 1, available: false, canSendFeedback: false,
          reason: candidates.length ? 'session_conflict' : 'provider_unavailable', readAt: Date.now() }
        const row = candidates[0]
        const observed = context.runtime.readObservedAgentStatusPaneIdentityFn(row.paneKey)
        if (observed.kind !== 'observed') return { contractVersion: 1, available: false, canSendFeedback: false,
          reason: 'identity_unobserved', readAt: Date.now() }
        binding = captureBinding(context.runtime, observed.terminalHandle, query, query.providerSession)
        if (binding.statusProcessIncarnation !== observed.processIncarnation || binding.paneKey !== row.paneKey)
          return { contractVersion: 1, available: false, canSendFeedback: false, reason: 'stale_incarnation', readAt: Date.now() }
      } else binding = params.expectedBinding
      const snapshot = context.runtime.getPlatformTaskProgressSnapshot(binding)
      if (!snapshot.available) return { ...snapshot, canSendFeedback: false }
      const settled = await context.runtime.isTerminalRunningSettledPromptAgent(binding.terminalHandle)
      const current = context.runtime.getPlatformTaskProgressSnapshot(snapshot.binding)
      const canResume = current.available && EnsureAgentSessionParams.safeParse({ kind: 'explicit',
        worktree: `id:${binding.worktreeId}`, agent: binding.agent, providerSession: current.binding.providerSession }).success
      return { ...current, canResume, canSendFeedback: current.available && settled && !current.status.interactivePrompt &&
        current.status.state !== 'blocked' && !isTerminalInputLockedForClient(context.runtime,
          snapshot.binding.ptyId, { type: 'desktop', id: 'platform-progress' }) }
    }
  }),
  defineMethod({ name: 'platform.taskProgress.receipt', permission: 'workspace', params: PlatformProgressReceipt,
    handler: readPlatformProgressReceipt
  }),
  defineMethod({ name: 'platform.taskProgress.send', permission: 'workspace', params: PlatformProgressSend,
    handler: async (params, context) => {
      requireOwner(context)
      const { runtime, orchestrationMutation: mutation } = context
      if (!mutation || mutation.requestId !== params.origin.requestId || mutation.method !== 'platform.taskProgress.send' ||
          mutation.callerFingerprint !== runtime.getOrchestrationDb().getLocalMutationCallerFingerprint() ||
          !context.markMutationEffectPossible || !context.recordMutationReceipt) throw new Error('durable_context_required')
      if (context.replayedMutationReceipt) return await observeReplayedTerminalPrompt(
        runtime, params.terminal, context.replayedMutationReceipt, 1000, context.signal) ?? context.replayedMutationReceipt
      let effectPossible = false
      try {
        const assertWritable = () => {
          if (platformBindingState(runtime, params.expectedBinding) !== 'current') throw new Error('binding_changed')
          assertTerminalSendExactPtyBinding(runtime, params.terminal, params.expectedBinding.ptyId)
          if (isTerminalInputLockedForClient(runtime, params.expectedBinding.ptyId, { type: 'desktop', id: 'platform-progress' }))
            throw new Error('input_locked')
          const snapshot = runtime.getPlatformTaskProgressSnapshot(params.expectedBinding)
          if (!snapshot.available || !agentProviderSessionsEqual(params.expectedBinding.agent,
            snapshot.binding.providerSession ?? undefined, params.expectedBinding.providerSession ?? undefined))
            throw new Error('source_only')
          if (snapshot.status.interactivePrompt || snapshot.status.state === 'blocked') throw new Error('terminal_guard_permission')
        }
        assertWritable()
        if (!(await runtime.isTerminalRunningSettledPromptAgent(params.terminal))) throw new Error('source_only')
        await assertTerminalSendTextWithinLimit(params.text)
        const guard = async () => {
          await assertTerminalAgentSendable({ runtime, handle: params.terminal, assertWritable })
          assertWritable()
        }
        await guard()
        const send = await runtime.sendTerminalAgentPrompt(params.terminal, params.text, {
          inputKind: 'driving', requestId: mutation.requestId, acceptQueued: true, observationTimeoutMs: 1000,
          signal: context.signal,
          beforeWrite: async () => { await guard(); effectPossible = true; context.markMutationEffectPossible!() },
          onInputAccepted: send => context.recordMutationReceipt!({ send })
        })
        return { send }
      } catch (error) {
        const reasons = { source_only: 'source-only', input_locked: 'input-locked', binding_changed: 'binding-changed',
          terminal_guard_not_writable: 'binding-changed', terminal_guard_permission: 'permission', terminal_guard_no_agent: 'no-agent' } as const
        const code = error instanceof Error ? error.message : ''
        if (effectPossible || !Object.hasOwn(reasons, code)) throw error
        return { send: { handle: params.terminal, accepted: false, bytesWritten: 0,
          refusedReason: reasons[code as keyof typeof reasons], prompt: {
            requestId: mutation.requestId, stages: [], provider: params.expectedBinding.agent,
            observation: code === 'source_only' ? 'unsupported' : code === 'terminal_guard_permission' ? 'permission' : 'supported',
            processIncarnation: params.expectedBinding.processIncarnation, generation: params.expectedBinding.generation,
            baselineWorkingSequence: 0 } } }
      }
    }
  })
]
