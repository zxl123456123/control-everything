import { pairedRuntimeConnectionFromOffer } from '../../../shared/paired-runtime-connection'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebRuntimeClient } from './web-runtime-client'
import { WebRuntimeRequestRegistry } from './web-runtime-request-registry'

class TimeoutBudgetWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  readyState = TimeoutBudgetWebSocket.CONNECTING
  binaryType = 'arraybuffer'
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()
  send = vi.fn()
}

describe('WebRuntimeClient timeout budget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
      btoa: (value: string) => Buffer.from(value, 'binary').toString('base64')
    })
    vi.stubGlobal('WebSocket', TimeoutBudgetWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('starts a fresh request timeout after the connection wait completes', async () => {
    const client = new WebRuntimeClient(
      pairedRuntimeConnectionFromOffer({
        v: 2,
        endpoint: 'ws://127.0.0.1:6768',
        deviceToken: 'token',
        publicKeyB64: Buffer.alloc(32).toString('base64')
      })
    )
    client.close()
    let resolveConnection!: () => void
    const connection = new Promise<void>((resolve) => {
      resolveConnection = resolve
    })
    // Test seam: isolate call's connection and request phases from socket handshaking.
    // Both phases live on the transport the client delegates call() to.
    const internals = client as unknown as {
      transport: {
        connectionWaiters: { wait: (timeoutMs?: number) => Promise<void> }
        sendEncrypted: (message: unknown) => boolean
      }
    }
    const waitForConnected = vi.fn(() => connection)
    internals.transport.connectionWaiters.wait = waitForConnected
    internals.transport.sendEncrypted = vi.fn(() => true)

    const call = client.call('runtime.two-phase-timeout', undefined, { timeoutMs: 25 })
    let settled = false
    void call.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )

    await vi.advanceTimersByTimeAsync(60_000)
    expect(settled).toBe(false)
    expect(waitForConnected).toHaveBeenCalledWith(25, undefined)

    resolveConnection()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(24)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(call).rejects.toThrow('Request timed out: runtime.two-phase-timeout')
  })

  it('keeps a session scan pending beyond the ordinary RPC deadline and accepts its result', async () => {
    const registry = connectedRegistry()
    const call = registry.call('aiVault.listSessions')
    const settled = vi.fn()
    void call.then(settled, settled)

    await vi.advanceTimersByTimeAsync(40_000)
    expect(settled).not.toHaveBeenCalled()
    const result = { id: 'request', ok: true as const, result: { sessions: [], issues: [] } }
    registry.pending.get('request')!.resolve(result)
    await expect(call).resolves.toEqual(result)
  })

  it.each(['runtime.ordinary', 'aiVault.listSessions'])(
    'retains an explicit request deadline for %s',
    async (method) => {
      const registry = connectedRegistry()
      const call = registry.call(method, undefined, { timeoutMs: 25 })
      const rejected = expect(call).rejects.toThrow(`Request timed out: ${method}`)
      await vi.advanceTimersByTimeAsync(25)
      await rejected
      expect(registry.pending.size).toBe(0)
    }
  )

  it('retains the default deadline for ordinary RPC requests', async () => {
    const registry = connectedRegistry()
    const call = registry.call('runtime.ordinary')
    const rejected = expect(call).rejects.toThrow('Request timed out: runtime.ordinary')
    await vi.advanceTimersByTimeAsync(30_000)
    await rejected
    expect(registry.pending.size).toBe(0)
  })

  it('still cancels a long session scan when its caller aborts', async () => {
    const registry = connectedRegistry()
    const controller = new AbortController()
    const call = registry.call('aiVault.listSessions', undefined, { signal: controller.signal })
    const outcome = call.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(40_000)
    controller.abort(new Error('scan superseded'))
    expect(await outcome).toEqual(new Error('scan superseded'))
    expect(registry.pending.size).toBe(0)
  })

  it('still rejects a long session scan when the runtime disconnects', async () => {
    const registry = connectedRegistry()
    const call = registry.call('aiVault.listSessions')
    const outcome = call.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(40_000)
    registry.rejectAll('runtime disconnected')
    expect(await outcome).toEqual(new Error('runtime disconnected'))
    expect(registry.pending.size).toBe(0)
  })
})

function connectedRegistry(): WebRuntimeRequestRegistry {
  return new WebRuntimeRequestRegistry({
    deviceToken: 'token',
    nextId: () => 'request',
    waitForConnected: () => Promise.resolve(),
    sendEncrypted: () => true
  })
}
