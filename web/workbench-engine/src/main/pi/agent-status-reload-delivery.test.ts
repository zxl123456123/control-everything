import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createAgentStatusExtensionHarness } from './agent-status-extension-test-harness'
import { getPiAgentStatusExtensionSource } from './agent-status-extension-source'
import { agentEndCount, endTurn, posts } from './agent-status-subagent-event-fixtures'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('does not overwrite the next turn with an old completion retried across reload', async () => {
  const harness = createAgentStatusExtensionHarness({ kind: 'pi', existsSync: () => true })
  const ctx = {
    isIdle: () => true,
    sessionManager: { getSessionId: () => 'A', getSessionFile: () => '/sessions/A.jsonl' }
  }
  await harness.callHook('session_start', { reason: 'startup' }, ctx)
  await harness.callHook('agent_start', {}, ctx)
  await vi.advanceTimersByTimeAsync(0)
  harness.fetchMock.mockRejectedValueOnce(new Error('offline'))
  await endTurn(harness)
  harness.fetchMock.mockRejectedValueOnce(new Error('still offline'))
  await harness.reloadPi()
  await vi.advanceTimersByTimeAsync(0)
  await harness.callHook('session_start', { reason: 'reload' }, ctx)
  const completionCount = agentEndCount(harness)
  await harness.callHook('agent_start', {}, ctx)
  await vi.advanceTimersByTimeAsync(1_000)
  expect(agentEndCount(harness)).toBe(completionCount)

  expect(posts(harness).at(-1)).toMatchObject({ hook_event_name: 'agent_start', session_id: 'A' })
})

it.each(['failure', 'success'] as const)(
  'serializes the next turn behind an in-flight completion on reload (%s)',
  async (delivery) => {
    let globals: Record<string, unknown> = {}
    const harness = createAgentStatusExtensionHarness({
      kind: 'pi',
      existsSync: () => true,
      seedGlobals: (home) => {
        globals = home
      },
      initialSource: getPiAgentStatusExtensionSource('pi')
        .replaceAll('__zkyqPi', '__orcaPi')
        .replace('migratePiRunStateIdentity(globalThis)', '')
        .replace('migratePiRunStateIdentity(piEventBus)', '')
    })
    const ctx = {
      isIdle: () => true,
      sessionManager: { getSessionId: () => 'A', getSessionFile: () => '/sessions/A.jsonl' }
    }
    await harness.callHook('session_start', { reason: 'startup' }, ctx)
    await harness.callHook('agent_start', {}, ctx)
    await vi.advanceTimersByTimeAsync(0)
    let acknowledge: ((value: { ok: boolean }) => void) | undefined
    let fail: ((error: Error) => void) | undefined
    harness.fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          acknowledge = resolve
          fail = reject
        })
    )
    await endTurn(harness)
    const queue = globals.__orcaPiStatusPostQueue
    const roster = globals.__orcaPiSubagents
    expect(queue).toBeDefined()
    expect(roster).toBeDefined()
    await harness.reloadPi()
    expect(globals.__zkyqPiStatusPostQueue).toBe(queue)
    expect(globals.__zkyqPiSubagents).toBe(roster)
    expect(globals).not.toHaveProperty('__orcaPiStatusPostQueue')
    expect(globals).not.toHaveProperty('__orcaPiSubagents')
    await harness.callHook('session_start', { reason: 'reload' }, ctx)
    await harness.callHook('agent_start', {}, ctx)
    await vi.advanceTimersByTimeAsync(0)
    expect(posts(harness).at(-1)).toMatchObject({ hook_event_name: 'agent_end', session_id: 'A' })
    const completionCount = agentEndCount(harness)
    if (delivery === 'failure') {
      fail?.(new Error('late failure'))
    } else {
      acknowledge?.({ ok: true })
    }
    await vi.advanceTimersByTimeAsync(5_000)
    expect(agentEndCount(harness)).toBe(completionCount)
    expect(posts(harness).at(-1)).toMatchObject({ hook_event_name: 'agent_start', session_id: 'A' })
    expect(vi.getTimerCount()).toBe(0)
  }
)

it('preserves both conflicting states before attempting a runtime identity migration', () => {
  const queue = {}
  const retired = { active: new Set(['retained']) }
  const current = { active: new Set(['current']) }
  let globals: Record<string, unknown> = {}
  expect(() =>
    createAgentStatusExtensionHarness({
      kind: 'pi',
      seedGlobals: (home) => {
        globals = home
        home.__orcaPiStatusPostQueue = queue
        home.__orcaPiSubagents = retired
        home.__zkyqPiSubagents = current
      }
    })
  ).toThrow('conflicting Pi runtime state')
  expect(globals.__orcaPiStatusPostQueue).toBe(queue)
  expect(globals.__orcaPiSubagents).toBe(retired)
  expect(globals.__zkyqPiSubagents).toBe(current)
  expect(globals).not.toHaveProperty('__zkyqPiStatusPostQueue')
})

it('recovers a completion on reload without requiring a new turn', async () => {
  const harness = createAgentStatusExtensionHarness({ kind: 'pi', existsSync: () => true })
  const ctx = {
    isIdle: () => true,
    sessionManager: { getSessionId: () => 'A', getSessionFile: () => '/sessions/A.jsonl' }
  }
  await harness.callHook('session_start', { reason: 'startup' }, ctx)
  await harness.callHook('agent_start', {}, ctx)
  await vi.advanceTimersByTimeAsync(0)
  harness.fetchMock.mockRejectedValueOnce(new Error('offline'))
  await endTurn(harness)
  await harness.reloadPi()
  await harness.callHook('session_start', { reason: 'reload' }, ctx)
  await vi.advanceTimersByTimeAsync(5_000)
  expect(agentEndCount(harness)).toBe(2)
  expect(posts(harness).at(-1)).toMatchObject({ hook_event_name: 'agent_end', session_id: 'A' })
  expect(vi.getTimerCount()).toBe(0)
})
