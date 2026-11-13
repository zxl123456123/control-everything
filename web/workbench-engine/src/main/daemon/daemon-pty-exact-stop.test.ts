import './mock-descendant-sweep'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { DaemonClient } from './client'
import type { DaemonAdapterHarness } from './daemon-pty-adapter-test-harness'
import { createMockSubprocess, startDaemonAdapterHarness } from './daemon-pty-adapter-test-harness'

describe('daemon exact task cancellation', () => {
  let harness: DaemonAdapterHarness
  const subprocesses: ReturnType<typeof createMockSubprocess>[] = []

  beforeEach(async () => {
    subprocesses.length = 0
    harness = await startDaemonAdapterHarness(() => {
      const subprocess = createMockSubprocess()
      subprocesses.push(subprocess)
      return subprocess
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    for (const subprocess of subprocesses) subprocess._simulateExit(0)
    harness.adapter.dispose()
    await harness.server.shutdown()
    rmSync(harness.dir, { recursive: true, force: true })
  })

  it('waits for the bound process to exit and leaves another task alive', async () => {
    const target = await harness.adapter.spawn({ cols: 80, rows: 24, sessionId: 'target' })
    const other = await harness.adapter.spawn({ cols: 80, rows: 24, sessionId: 'other' })
    vi.mocked(subprocesses[0]!.forceKill).mockImplementation(() => {})
    let resolved = false
    const stop = harness.adapter.stopExact(target.id, target.incarnationId!).then(() => {
      resolved = true
    })
    await vi.waitFor(() => expect(subprocesses[0]!.forceKill).toHaveBeenCalled())
    expect(resolved).toBe(false)
    expect(subprocesses[1]!.forceKill).not.toHaveBeenCalled()
    subprocesses[0]!._simulateExit(137)
    await stop
    expect((await harness.adapter.listProcesses()).map((entry) => entry.id)).toEqual([other.id])
  })

  it('refuses an earlier incarnation after the same terminal id is recreated', async () => {
    const old = await harness.adapter.spawn({ cols: 80, rows: 24, sessionId: 'reused' })
    subprocesses[0]!._simulateExit(0)
    await vi.waitFor(async () => expect(await harness.adapter.listProcesses()).toEqual([]))
    const current = await harness.adapter.spawn({ cols: 80, rows: 24, sessionId: old.id })
    expect(current.incarnationId).not.toBe(old.incarnationId)
    await expect(harness.adapter.stopExact(old.id, old.incarnationId!)).rejects.toThrow(
      'terminal_incarnation_changed'
    )
    expect(subprocesses[1]!.forceKill).not.toHaveBeenCalled()
    expect((await harness.adapter.listProcesses()).map((entry) => entry.id)).toEqual([current.id])
  })

  it('propagates an unsupported host response without falling back to generic kill', async () => {
    const target = await harness.adapter.spawn({ cols: 80, rows: 24, sessionId: 'legacy' })
    const request = vi.spyOn(DaemonClient.prototype, 'request').mockRejectedValue(
      new Error('Unknown request type: killExact')
    )
    await expect(harness.adapter.stopExact(target.id, target.incarnationId!)).rejects.toThrow(
      'Unknown request type: killExact'
    )
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0]?.[0]).toBe('killExact')
    expect(subprocesses[0]!.forceKill).not.toHaveBeenCalled()
  })
})
