import '../runtime/rpc/unused-default-rpc-methods.test-fixture'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, existsSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildRegistry, type RpcContext, type RpcMethod, type RpcRequest } from '../runtime/rpc/core'
import { RpcDispatcher } from '../runtime/rpc/dispatcher'
import { PLATFORM_TASK_PROGRESS_METHODS } from './platform-task-progress-methods'
import { OrchestrationDb } from '../runtime/orchestration/db'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { OrcaRuntimeWithAutomationOperations } from '../runtime/workspaces/persisted-surfaces/automation-operations'
import { platformProgressEnvironmentId, readPlatformTaskProgressSnapshot } from '../runtime/platform-task-progress-snapshot'
import { publishHostDescriptor } from '../runtime/host-descriptor'
import { ORCHESTRATION_CONTRACT_VERSION } from '../../shared/protocol-version'
import type { PlatformProgressBinding } from '../../shared/platform-task-progress-contract'
import { hashCanonical, replayStableCallerParams } from '../runtime/rpc/orchestration-mutation-receipt'
import { isDurableMutation, isTerminalPromptMutation } from '../../shared/orchestration-rpc-contract'
import { OrcaRuntimeWithGetTerminalInteractiveWait } from '../runtime/terminal/wait/terminal-interactive-wait'
import { OrcaRuntimeWithAgentPromptRequestCorrelation } from '../runtime/orca-runtime-agent-prompt-request-correlation'

const registry = buildRegistry(PLATFORM_TASK_PROGRESS_METHODS)
const method = (name: string) => registry.get(`platform.taskProgress.${name}`) as RpcMethod
let db: OrchestrationDb
let runtime: OrcaRuntimeService
let binding: PlatformProgressBinding
let row: any
let observed: any
const directories: string[] = []
const sendParams = () => ({ contractVersion: 1 as const, terminal: binding.terminalHandle, text: 'Please refine this result',
  expectedBinding: binding, origin: { taskId: 'task', nativeRunId: 'native', messageId: 'message', requestId: 'request' } })
const receiptParams = () => ({ contractVersion: 1 as const, requestId: 'request', expectedBinding: binding, expectedSendParams: sendParams() })
const receipt = () => ({ send: { handle: binding.terminalHandle, accepted: true, bytesWritten: 25,
  prompt: { requestId: 'request', stages: ['input_accepted'], provider: 'codex', observation: 'supported',
    processIncarnation: binding.processIncarnation, generation: binding.generation, baselineWorkingSequence: 0 } } })
const call = (name: string, params: unknown, context: Partial<RpcContext> = {}) => {
  const m = method(name)
  return m.handler(m.params!.parse(params), { runtime, caller: { kind: 'local-cli' }, ...context })
}
function seed(state: 'pending' | 'completed' = 'completed', raw: string = JSON.stringify(receipt())) {
  const fp = db.getOrCreateLocalMutationCallerFingerprint()
  const base = hashCanonical({ method: 'platform.taskProgress.send', params: replayStableCallerParams(runtime, sendParams()) })
  const bh = hashCanonical(runtime.getTerminalPromptRequestBinding(binding.terminalHandle))
  const identity = { callerFingerprint: fp, requestId: 'request', method: 'platform.taskProgress.send', payloadHash: `${base}:${bh}` }
  db.beginMutationReceipt(identity)
  if (state === 'completed') db.completeMutationReceipt({ ...identity, receipt: raw })
  return identity
}
beforeEach(() => {
  publishHostDescriptor('runtime', { installationId: '11111111-1111-4111-8111-111111111111' })
  binding = { runtimeId: 'runtime', environmentId: platformProgressEnvironmentId('runtime'), terminalHandle: 'terminal',
    paneKey: 'tab:22222222-2222-4222-8222-222222222222', worktreeId: 'worktree', agent: 'codex',
    providerSession: { key: 'session_id', id: 'provider' }, ptyId: 'pty', processIncarnation: 'incarnation', statusProcessIncarnation: 'pty:incarnation', generation: 1, tabId: 'tab' }
  row = { paneKey: binding.paneKey, connectionId: null, worktreeId: 'worktree', agentType: 'codex',
    providerSession: binding.providerSession, state: 'done', receivedAt: 100, evidenceObservedAt: 90,
    stateStartedAt: 90, turnStartedAt: 20, turnEndedAt: 90, turnEndDisposition: 'identified', lastAssistantMessage: 'Result' }
  observed = { kind: 'observed', terminalHandle: 'terminal', processIncarnation: 'pty:incarnation', dispatchId: null }
  db = new OrchestrationDb(':memory:')
  runtime = {
    getRuntimeId: () => 'runtime', listRepos: () => [{ id: 'repo', path: 'C:/example/repo' }], getOrchestrationDb: vi.fn(() => db),
    readPlatformTaskProgressReceiptRecord: vi.fn((id: string) => { const fingerprint = db.getLocalMutationCallerFingerprint();
      return { fingerprint, row: fingerprint ? db.getMutationReceipt(fingerprint, id) : undefined } }),
    resolveLiveLeafForHandle: vi.fn(() => ({ ptyId: 'pty' })), getTerminalWorktreeIdForHandle: () => 'worktree',
    getTerminalPaneKey: vi.fn(() => binding.paneKey), getTerminalProcessIncarnation: vi.fn(() => 'pty:incarnation'),
    getTerminalPromptRequestBinding: vi.fn(() => ({ ptyId: 'pty', processIncarnation: 'incarnation', generation: 1 })),
    getAgentStatusTerminalHandleForPaneKey: () => 'terminal', getAgentStatusOrchestrationContextForPaneKey: () => null,
    getAgentStatusSnapshotFn: () => [row], readObservedAgentStatusPaneIdentityFn: () => observed,
    getPlatformTaskProgressSnapshot: (b: PlatformProgressBinding) => readPlatformTaskProgressSnapshot(runtime, b),
    isTerminalRunningSettledPromptAgent: vi.fn(async () => true),
    getTerminalAgentStatus: vi.fn(async () => ({ handle: 'terminal', isRunningAgent: true, status: 'idle' })),
    getDriver: vi.fn(() => ({ kind: 'desktop' })), observeTerminalAgentPrompt: vi.fn(),
    sendTerminalAgentPrompt: vi.fn(async (_handle: string, _text: string, opts: any) => {
      await opts.beforeWrite('pty'); const value = receipt().send; opts.onInputAccepted(value); return value
    }),
    resolveTerminalWorkspaceLaunchScope: vi.fn(async () => ({ id: 'worktree', path: 'C:/example/repo', connectionId: null, repo: { id: 'repo' } })),
    resolveWorkspaceTerminalStartupCwd: vi.fn((_s: any, cwd: string) => cwd),
    getClientSettings: () => ({ disabledTuiAgents: [] }),
    createAgentSession: vi.fn(async () => ({ terminal: { handle: 'terminal' }, disposition: 'created' })),
    ensureAgentSession: vi.fn(async () => ({ terminal: { handle: 'terminal' }, disposition: 'adopted' }))
  } as unknown as OrcaRuntimeService
})
afterEach(() => { db.close(); publishHostDescriptor('runtime', null); vi.restoreAllMocks();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('bounded owner operations', () => {
  it.each(['grok', 'dsh'])('routes %s through the existing owner launch', async agent => {
    const result = await call('create', { contractVersion: 1, runtimeId: 'runtime', environmentId: binding.environmentId,
      repoId: 'repo', worktreeId: 'worktree', agent, cwd: 'C:/example/repo', prompt: 'work',
      operationId: '1793000000000-11111111111111111111111111111111' })
    expect(result).toMatchObject({ binding: { agent } })
    expect(runtime.createAgentSession).toHaveBeenCalledWith(expect.objectContaining({ agent }), expect.anything())
  })
  it.each(['unknown-agent', 'grok;exit'])('refuses unsupported agent %s before spawning', async agent => {
    expect(() => call('create', { contractVersion: 1, runtimeId: 'runtime', environmentId: binding.environmentId,
      repoId: 'repo', worktreeId: 'worktree', agent, cwd: 'C:/example/repo', prompt: 'work',
      operationId: '1793000000000-11111111111111111111111111111111' })).toThrow()
    expect(runtime.createAgentSession).not.toHaveBeenCalled()
  })
  it('retains conversation keys and Pi paths and refuses an incomplete Pi resume', async () => {
    const scope = { contractVersion: 1, runtimeId: 'runtime', environmentId: binding.environmentId,
      repoId: 'repo', worktreeId: 'worktree' }
    const provider = { key: 'session_id', id: 'pi-session', transcriptPath: '/example/pi.jsonl' }
    expect(await call('resume', { ...scope, agent: 'pi', providerSession: provider }))
      .toMatchObject({ binding: { agent: 'pi', providerSession: provider } })
    expect(runtime.ensureAgentSession).toHaveBeenCalledWith(expect.objectContaining({ providerSession: provider }), expect.anything())
    await expect(call('resume', { ...scope, agent: 'pi', providerSession: { key: 'session_id', id: 'pi-session' } })).rejects.toThrow()
    expect(await call('resume', { ...scope, agent: 'cursor', providerSession: { key: 'conversation_id', id: 'conversation' } }))
      .toMatchObject({ binding: { providerSession: { key: 'conversation_id', id: 'conversation' } } })
  })
  it('preserves the actual runtime getter identity shapes without string conversion', () => {
    const host = { getLivePtyForHandle: () => ({ pty: { ptyId: 'pty-real', incarnationId: 'birth' },
      record: { ptyId: 'pty-real', ptyGeneration: 7 } }), getPtyLifecycleGeneration: () => 7,
      getOrchestrationDbIfAvailable: () => null, runtimeId: 'runtime' }
    expect(OrcaRuntimeWithGetTerminalInteractiveWait.prototype.getTerminalProcessIncarnation.call(host as never, 'terminal'))
      .toBe('pty-real:birth')
    expect(OrcaRuntimeWithAgentPromptRequestCorrelation.prototype.getTerminalPromptRequestBinding.call(host as never, 'terminal'))
      .toEqual({ ptyId: 'pty-real', processIncarnation: 'birth', generation: 7 })
  })
  it('captures distinct status and prompt incarnations from the host getters', async () => {
    vi.mocked(runtime.getTerminalProcessIncarnation).mockReturnValue('pty:incarnation')
    const input = { contractVersion: 1, runtimeId: 'runtime', environmentId: binding.environmentId, repoId: 'repo',
      worktreeId: 'worktree', cwd: 'C:/example/repo', agent: 'codex', prompt: 'One goal', operationId: `${Date.now()}-${'b'.repeat(32)}` }
    await expect(call('create', input)).resolves.toMatchObject({ disposition: 'created', binding: {
      processIncarnation: 'incarnation', statusProcessIncarnation: 'pty:incarnation' } })
  })
  it('uses only the selected repo/worktree and host agent defaults', async () => {
    const input = { contractVersion: 1, runtimeId: 'runtime', environmentId: binding.environmentId, repoId: 'repo',
      worktreeId: 'worktree', cwd: 'C:/example/repo', agent: 'codex', prompt: 'One goal', operationId: `${Date.now()}-${'a'.repeat(32)}` }
    await expect(call('create', input)).resolves.toMatchObject({ disposition: 'created', binding: { providerSession: null, tabId: 'tab' } })
    expect(runtime.createAgentSession).toHaveBeenCalledWith(expect.objectContaining({ presentation: 'background', viewMode: 'terminal', prompt: 'One goal' }), expect.anything())
    expect(() => call('create', { ...input, agentArgs: 'arbitrary' })).toThrow()
    await expect(call('create', { ...input, repoId: 'other' })).rejects.toThrow('project_directory_mismatch')
    await expect(call('create', { ...input, runtimeId: 'old' })).rejects.toThrow('binding_changed')
  })
  it('resumes only a verified explicit provider identity', async () => {
    await call('resume', { contractVersion: 1, runtimeId: 'runtime', environmentId: binding.environmentId, repoId: 'repo',
      worktreeId: 'worktree', agent: 'codex', providerSession: binding.providerSession })
    expect(runtime.ensureAgentSession).toHaveBeenCalledWith(expect.objectContaining({ kind: 'explicit', providerSession: binding.providerSession }), expect.anything())
  })
  it.each(['desktop', 'paired-device'])('rejects %s before durable metadata in both transports', async kind => {
    const dispatcher = new RpcDispatcher({ runtime, methods: PLATFORM_TASK_PROGRESS_METHODS })
    const request: RpcRequest = { id: 'frame', authToken: 'test', method: 'platform.taskProgress.send', params: sendParams(),
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION, orchestrationRequestId: 'request' }
    const caller = (kind === 'desktop' ? { kind } : { kind, deviceId: 'device' }) as RpcContext['caller']
    expect((await dispatcher.dispatch(request, { caller })).ok).toBe(false)
    const replies: string[] = []
    await dispatcher.dispatchStreaming(request, value => replies.push(value), { caller })
    expect(JSON.parse(replies[0]).ok).toBe(false)
    expect(runtime.getOrchestrationDb).not.toHaveBeenCalled()
    expect(runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
  })
})

describe('same-row ingestion fence', () => {
  it('projects complete provider metadata and refuses key or required path changes', () => {
    binding.agent = 'pi'; row.agentType = 'pi'
    binding.providerSession = { key: 'session_id', id: 'provider', transcriptPath: '/example/pi.jsonl' }
    row.providerSession = { ...binding.providerSession }
    expect(readPlatformTaskProgressSnapshot(runtime, binding)).toMatchObject({ available: true,
      binding: { providerSession: binding.providerSession } })
    row.providerSession.transcriptPath = '/example/other.jsonl'
    expect(readPlatformTaskProgressSnapshot(runtime, binding).available).toBe(false)
    binding.agent = 'cursor'; row.agentType = 'cursor'
    binding.providerSession = { key: 'conversation_id', id: 'provider' }; row.providerSession = { ...binding.providerSession }
    expect(readPlatformTaskProgressSnapshot(runtime, binding).available).toBe(true)
    row.providerSession.key = 'session_id'
    expect(readPlatformTaskProgressSnapshot(runtime, binding).available).toBe(false)
  })
  it('advertises resume separately from guarded feedback for Grok', async () => {
    binding.agent = 'grok'; row.agentType = 'grok'
    vi.mocked(runtime.isTerminalRunningSettledPromptAgent).mockResolvedValue(false)
    expect(await call('observe', { contractVersion: 1, expectedBinding: binding }))
      .toMatchObject({ available: true, canResume: true, canSendFeedback: false })
  })
  it('keeps evidence time distinct from read time and projects the exact row', () => {
    expect(readPlatformTaskProgressSnapshot(runtime, binding)).toMatchObject({ available: true, evidenceTime: { kind: 'observed', at: 90 }, deliveredAt: 100,
      status: { lastAssistantMessage: 'Result', turnEndDisposition: 'identified' } })
  })
  it.each(['unobserved', 'incarnation', 'replay', 'restored', 'provider-only', 'program-only', 'remote', 'wrong-provider', 'wrong-worktree'])('rejects %s', reason => {
    if (reason === 'unobserved') observed = { kind: 'unobserved' }
    if (reason === 'incarnation') observed.processIncarnation = 'old'
    if (reason === 'replay') row.isReplay = true
    if (reason === 'restored') row.restoredUnconfirmed = true
    if (reason === 'provider-only') row.providerSessionOnly = true
    if (reason === 'program-only') row.programStatusOnly = true
    if (reason === 'remote') row.connectionId = 'remote'
    if (reason === 'wrong-provider') row.providerSession = { key: 'session_id', id: 'other' }
    if (reason === 'wrong-worktree') row.worktreeId = 'other'
    expect(readPlatformTaskProgressSnapshot(runtime, binding).available).toBe(false)
  })
  it('adopts only one exact live provider without invoking launch-scope or execution', async () => {
    binding.worktreeId = 'repo::C:/example/repo'; row.worktreeId = binding.worktreeId
    runtime.getTerminalWorktreeIdForHandle = () => binding.worktreeId
    const query = { contractVersion: 1, runtimeId: 'runtime', environmentId: binding.environmentId,
      repoId: 'repo', worktreeId: binding.worktreeId, agent: 'codex', providerSession: binding.providerSession }
    expect(await call('observe', { contractVersion: 1, bindingQuery: query })).toMatchObject({ available: true, binding })
    expect(runtime.resolveTerminalWorkspaceLaunchScope).not.toHaveBeenCalled()
    expect(runtime.createAgentSession).not.toHaveBeenCalled()
    expect(runtime.ensureAgentSession).not.toHaveBeenCalled()
    Object.assign(runtime, { getAgentStatusSnapshotFn: () => [row, { ...row }] })
    expect(await call('observe', { contractVersion: 1, bindingQuery: query })).toMatchObject({ available: false, reason: 'session_conflict' })
    Object.assign(runtime, { getAgentStatusSnapshotFn: () => [row] })
    observed = { kind: 'unobserved' }
    expect(await call('observe', { contractVersion: 1, bindingQuery: query })).toMatchObject({ available: false, reason: 'identity_unobserved' })
    expect(() => call('observe', { contractVersion: 1, bindingQuery: query, expectedBinding: binding })).toThrow()
  })
  it('accepts a delayed provider only after exact live ingestion', () => {
    expect(readPlatformTaskProgressSnapshot(runtime, { ...binding, providerSession: null })).toMatchObject({ available: true, binding: { providerSession: binding.providerSession } })
  })
})

describe('read-only receipt inspection', () => {
  it('does not mint absent caller metadata, including stale in-memory identity', () => {
    db.localMutationCallerFingerprint = 'old-cache'
    expect(call('receipt', receiptParams())).toMatchObject({ receiptState: 'absent', reason: 'caller_identity_missing' })
    expect(db.db.prepare('SELECT count(*) AS n FROM mutation_caller_identities').get()).toEqual({ n: 0 })
  })
  it.each(['pending', 'completed'] as const)('keeps %s facts and writes nothing on repeated reads', state => {
    seed(state)
    const changes = db.db.prepare('SELECT total_changes() AS n').get()
    for (let i = 0; i < 3; i++) expect(call('receipt', receiptParams())).toMatchObject({ receiptState: state, bindingState: 'current' })
    expect(db.db.prepare('SELECT total_changes() AS n').get()).toEqual(changes)
    expect(runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
    expect(runtime.observeTerminalAgentPrompt).not.toHaveBeenCalled()
    expect(runtime.getOrchestrationDb).not.toHaveBeenCalled()
  })
  it.each(['bad-json', 'wrong-text', 'wrong-origin', 'wrong-method', 'wrong-binding', 'missing-prompt'])('marks %s invalid, never absent', reason => {
    const identity = seed('completed', reason === 'bad-json' ? '{' : reason === 'missing-prompt' ? '{"send":{"accepted":true}}' : JSON.stringify(receipt()))
    const params = receiptParams()
    if (reason === 'wrong-text') params.expectedSendParams.text = 'other'
    if (reason === 'wrong-origin') params.expectedSendParams.origin.messageId = 'other'
    if (reason === 'wrong-method') db.db.prepare('UPDATE mutation_receipts SET method=? WHERE request_id=?').run('terminal.send', identity.requestId)
    if (reason === 'wrong-binding') params.expectedBinding = { ...binding, generation: 2 }
    expect(call('receipt', params)).toMatchObject({ receiptState: 'invalid' })
  })
  it('retains historical acceptance after current incarnation changes', () => {
    seed()
    vi.mocked(runtime.getTerminalProcessIncarnation).mockReturnValue('replacement')
    expect(call('receipt', receiptParams())).toMatchObject({ receiptState: 'completed', bindingState: 'replaced',
      receipt: { send: { prompt: { stages: ['input_accepted'] } } } })
  })
  it('reads a cold existing ledger without schema or caller writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'progress-ledger-')); directories.push(dir)
    const path = join(dir, 'orchestration.db')
    const persisted = new OrchestrationDb(path)
    const fingerprint = persisted.getOrCreateLocalMutationCallerFingerprint()
    persisted.beginMutationReceipt({ callerFingerprint: fingerprint, requestId: 'request', method: 'platform.taskProgress.send', payloadHash: 'frozen' })
    persisted.close()
    const before = readFileSync(path)
    const host = Object.assign(Object.create(OrcaRuntimeWithAutomationOperations.prototype), {
      orchestrationDbPath: () => path, ensureOrchestrationFederationRelay: vi.fn(), scheduleRestoredMessageRepoints: vi.fn()
    }) as OrcaRuntimeService
    expect(host.readPlatformTaskProgressReceiptRecord('request')).toMatchObject({ fingerprint, row: { state: 'pending' } })
    expect(readFileSync(path)).toEqual(before)
    expect(host.ensureOrchestrationFederationRelay).not.toHaveBeenCalled()
  })
  it('uses a read-only cold path without creating a missing database or starting relays', () => {
    const dir = mkdtempSync(join(tmpdir(), 'progress-ledger-')); directories.push(dir)
    const path = join(dir, 'orchestration.db')
    const host = Object.assign(Object.create(OrcaRuntimeWithAutomationOperations.prototype), {
      orchestrationDbPath: () => path, ensureOrchestrationFederationRelay: vi.fn(), scheduleRestoredMessageRepoints: vi.fn()
    }) as OrcaRuntimeService
    expect(host.readPlatformTaskProgressReceiptRecord('request')).toEqual({ fingerprint: undefined, row: undefined })
    expect(existsSync(path)).toBe(false)
    writeFileSync(path, 'corrupt')
    expect(() => host.readPlatformTaskProgressReceiptRecord('request')).toThrow()
    expect(host.ensureOrchestrationFederationRelay).not.toHaveBeenCalled()
  })
})

describe('durable settled send', () => {
  it('classifies only fixed send, not receipt, as a prompt mutation', () => {
    expect(isTerminalPromptMutation('platform.taskProgress.send', sendParams())).toBe(true)
    expect(isDurableMutation('platform.taskProgress.receipt', receiptParams())).toBe(false)
  })
  it('persists the same send envelope, replays without a second write, and refuses changed text', async () => {
    const dispatcher = new RpcDispatcher({ runtime, methods: PLATFORM_TASK_PROGRESS_METHODS })
    const request: RpcRequest = { id: 'frame', authToken: 'test', method: 'platform.taskProgress.send', params: sendParams(),
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION, orchestrationRequestId: 'request' }
    expect(await dispatcher.dispatch(request)).toMatchObject({ ok: true, result: { send: { accepted: true } } })
    expect(await dispatcher.dispatch(request)).toMatchObject({ ok: true, result: { send: { accepted: true }, mutation: { replayed: true } } })
    expect(runtime.sendTerminalAgentPrompt).toHaveBeenCalledOnce()
    expect(await dispatcher.dispatch({ ...request, params: { ...sendParams(), text: 'changed' } })).toMatchObject({ ok: false, error: { code: 'request_mismatch' } })
    expect(call('receipt', receiptParams())).toMatchObject({ receiptState: 'completed' })
  })
  it.each(['unsupported', 'grok', 'dsh', 'mobile-lock', 'permission', 'unobserved'])('refuses %s before writing', async reason => {
    if (reason === 'unsupported') vi.mocked(runtime.isTerminalRunningSettledPromptAgent).mockResolvedValue(false)
    if (reason === 'grok' || reason === 'dsh') {
      binding.agent = reason; row.agentType = reason
      vi.mocked(runtime.isTerminalRunningSettledPromptAgent).mockResolvedValue(false)
    }
    if (reason === 'mobile-lock') vi.mocked(runtime.getDriver).mockReturnValue({ kind: 'mobile', clientId: 'phone' } as any)
    if (reason === 'permission') row.interactivePrompt = 'Confirm permission'
    if (reason === 'unobserved') observed = { kind: 'unobserved' }
    const dispatcher = new RpcDispatcher({ runtime, methods: PLATFORM_TASK_PROGRESS_METHODS })
    const result = await dispatcher.dispatch({ id: 'f', authToken: 'test', method: 'platform.taskProgress.send', params: sendParams(),
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION, orchestrationRequestId: 'request' })
    expect(result).toMatchObject({ ok: true, result: { send: { accepted: false, bytesWritten: 0, prompt: { stages: [] } } } })
    expect(call('receipt', receiptParams())).toMatchObject({ receiptState: 'completed' })
    expect(runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
  })
  it('keeps the accepted checkpoint when the host loses its response', async () => {
    vi.mocked(runtime.sendTerminalAgentPrompt).mockImplementation(async (_h, _t, opts) => {
      await opts.beforeWrite?.('pty'); opts.onInputAccepted?.(receipt().send as any); throw new Error('lost_response')
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: PLATFORM_TASK_PROGRESS_METHODS })
    const request: RpcRequest = { id: 'f', authToken: 'test', method: 'platform.taskProgress.send', params: sendParams(),
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION, orchestrationRequestId: 'request' }
    expect((await dispatcher.dispatch(request)).ok).toBe(false)
    expect(call('receipt', receiptParams())).toMatchObject({ receiptState: 'completed', receipt: { send: { accepted: true } } })
    expect(await dispatcher.dispatch(request)).toMatchObject({ ok: true, result: { mutation: { replayed: true } } })
    expect(runtime.sendTerminalAgentPrompt).toHaveBeenCalledOnce()
  })
  it('rejects a changed incarnation at the final write guard', async () => {
    const writes = vi.fn()
    vi.mocked(runtime.sendTerminalAgentPrompt).mockImplementation(async (_h, _t, opts) => {
      vi.mocked(runtime.getTerminalProcessIncarnation).mockReturnValue('new')
      await opts.beforeWrite?.('pty'); writes(); return receipt().send as any
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: PLATFORM_TASK_PROGRESS_METHODS })
    expect(await dispatcher.dispatch({ id: 'f', authToken: 'test', method: 'platform.taskProgress.send', params: sendParams(),
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION, orchestrationRequestId: 'request' })).toMatchObject({ ok: true, result: { send: { accepted: false, refusedReason: 'binding-changed' } } })
    expect(writes).not.toHaveBeenCalled()
  })
  it('requires the wire version and matching request origin even on replay', async () => {
    seed()
    const dispatcher = new RpcDispatcher({ runtime, methods: PLATFORM_TASK_PROGRESS_METHODS })
    expect((await dispatcher.dispatch({ id: 'f', authToken: 'test', method: 'platform.taskProgress.send', params: sendParams(),
      orchestrationRequestId: 'request' })).ok).toBe(false)
    expect((await dispatcher.dispatch({ id: 'f', authToken: 'test', method: 'platform.taskProgress.receipt', params: receiptParams(),
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION, orchestrationRequestId: 'request' })).ok).toBe(false)
    expect(runtime.getOrchestrationDb).not.toHaveBeenCalled()
  })
  it('never reissues an unknown pending write after restart', async () => {
    seed('pending')
    const dispatcher = new RpcDispatcher({ runtime, methods: PLATFORM_TASK_PROGRESS_METHODS })
    expect(await dispatcher.dispatch({ id: 'f', authToken: 'test', method: 'platform.taskProgress.send', params: sendParams(),
      orchestrationContractVersion: ORCHESTRATION_CONTRACT_VERSION, orchestrationRequestId: 'request' })).toMatchObject({ ok: false, error: { code: 'operation_unknown' } })
    expect(runtime.sendTerminalAgentPrompt).not.toHaveBeenCalled()
  })
})
