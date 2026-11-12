import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import {
  installApi,
  installBrowserGlobals,
  writeStoredRuntimeEnvironment
} from './web-preload-api-test-harness'

describe('web native chat preload API', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  it('forwards validated lifecycle metadata from reads and stream frames', async () => {
    const lifecycle = { state: 'completed', turnId: 'turn-1', timestamp: 42 } as const
    const message = {
      id: 'a-1',
      role: 'assistant' as const,
      blocks: [{ type: 'text' as const, text: 'done' }],
      timestamp: 42,
      source: 'transcript' as const
    }
    vi.doMock('./web-runtime-client', () => ({
      WebRuntimeClient: class {
        call(): Promise<RuntimeRpcResponse<unknown>> {
          return Promise.resolve({
            id: 'read-1',
            ok: true,
            result: { messages: [message], lifecycle },
            _meta: { runtimeId: 'runtime-1' }
          })
        }

        subscribe(
          _method: string,
          _params: unknown,
          callbacks: { onResponse: (response: RuntimeRpcResponse<unknown>) => void }
        ): Promise<{ unsubscribe: () => void }> {
          callbacks.onResponse({
            id: 'stream-1',
            ok: true,
            result: {
              type: 'snapshot',
              messages: [message],
              hasMore: false,
              lifecycle
            },
            _meta: { runtimeId: 'runtime-1' }
          })
          return Promise.resolve({ unsubscribe: vi.fn() })
        }

        close(): void {}
      }
    }))

    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await expect(globals.window.api.nativeChat.readSession('claude', 'session-1')).resolves.toEqual(
      {
        messages: [message],
        lifecycle
      }
    )
    const frames: unknown[] = []
    globals.window.api.nativeChat.subscribe(
      { subscriptionId: 'sub-1', agent: 'claude', sessionId: 'session-1' },
      (frame) => frames.push(frame)
    )
    await Promise.resolve()

    expect(frames).toEqual([
      {
        type: 'snapshot',
        messages: [message],
        hasMore: false,
        lifecycle
      }
    ])
  })

  it('forwards the pending flag and still treats the real snapshot as the initial frame', async () => {
    const message = {
      id: 'a-1',
      role: 'assistant' as const,
      blocks: [{ type: 'text' as const, text: 'flushed' }],
      timestamp: 7,
      source: 'transcript' as const
    }
    let deliver: (result: unknown) => void = () => {}
    let subscribeParams: unknown
    vi.doMock('./web-runtime-client', () => ({
      WebRuntimeClient: class {
        subscribe(
          _method: string,
          params: unknown,
          callbacks: { onResponse: (response: RuntimeRpcResponse<unknown>) => void }
        ): Promise<{ unsubscribe: () => void }> {
          subscribeParams = params
          deliver = (result) =>
            callbacks.onResponse({
              id: 'stream-1',
              ok: true,
              result,
              _meta: { runtimeId: 'runtime-1' }
            })
          return Promise.resolve({ unsubscribe: vi.fn() })
        }

        close(): void {}
      }
    }))

    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()
    const frames: unknown[] = []
    globals.window.api.nativeChat.subscribe(
      { subscriptionId: 'sub-1', agent: 'claude', sessionId: 'session-1', limit: 1 },
      (frame) => frames.push(frame)
    )
    await Promise.resolve()

    expect(subscribeParams).toMatchObject({ capabilities: { transcriptPending: 1 } })

    // The host's unflushed-transcript frame, then the flush that follows it.
    deliver({ type: 'snapshot', messages: [], hasMore: false, pending: true })
    deliver({ type: 'snapshot', messages: [message] })

    // Dropping `pending` would settle an empty read as the session's history.
    // hasMore proves the pending frame did not consume the initial slot — only
    // the initial branch infers a filled window from the limit.
    expect(frames).toEqual([
      { type: 'snapshot', messages: [], hasMore: false, pending: true },
      { type: 'snapshot', messages: [message], hasMore: true }
    ])
  })
})

describe('web MiniMax preload API', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps OpenCode Go credential operations local to the desktop', async () => {
    const { api } = await installApi('Linux')
    await expect(api.opencodeGoCredentials.getStatus()).resolves.toEqual({
      apiKeyConfigured: false
    })
    await expect(api.opencodeGoCredentials.saveApiKey('fake-key')).rejects.toThrow(/desktop app/i)
    await expect(api.opencodeGoCredentials.clearApiKey()).resolves.toEqual({
      apiKeyConfigured: false
    })
  })

  it('exposes desktop-only MiniMax credential reads as unconfigured and rejects saves', async () => {
    const { api } = await installApi('Linux')

    await expect(api.minimaxCredentials.getStatus()).resolves.toEqual({
      configured: false,
      cookieConfigured: false,
      apiKeyConfigured: false,
      // Null, not 'sealed': this bridge stores nothing, so it has no protection to claim.
      cookieProtection: null,
      apiKeyProtection: null
    })
    await expect(api.minimaxCredentials.saveCookie('_token=abc')).rejects.toThrow(/desktop app/i)
    await expect(api.minimaxCredentials.clearCookie()).resolves.toEqual({
      configured: false,
      cookieConfigured: false,
      apiKeyConfigured: false,
      // Null, not 'sealed': this bridge stores nothing, so it has no protection to claim.
      cookieProtection: null,
      apiKeyProtection: null
    })
    await expect(api.minimaxCredentials.saveApiKey('sk-test')).rejects.toThrow(/desktop app/i)
    await expect(api.minimaxCredentials.clearApiKey()).resolves.toEqual({
      configured: false,
      cookieConfigured: false,
      apiKeyConfigured: false,
      // Null, not 'sealed': this bridge stores nothing, so it has no protection to claim.
      cookieProtection: null,
      apiKeyProtection: null
    })
  })
})

describe('web AI Vault preload API', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  it('releases ordinary RPC capacity after eight abandoned session panels', async () => {
    const { api, registry } = await installPendingScans()
    const scans = Array.from({ length: 8 }, (_, index) =>
      api.aiVault.listSessions({ requestToken: `panel-${index}` }).catch((error: Error) => error)
    )
    await flushScanCalls()
    let ordinaryFinished = false
    const ordinary = api.runtime.call({ method: 'worktree.list' }).then(() => {
      ordinaryFinished = true
    })
    await vi.advanceTimersByTimeAsync(40_000)
    expect(ordinaryFinished).toBe(false)
    expect(registry().pending.size).toBe(8)

    for (let index = 0; index < 8; index++) {
      await api.aiVault.cancelListSessions({ requestToken: `panel-${index}` })
    }
    await flushScanCalls()
    try {
      expect(ordinaryFinished).toBe(true)
      expect(registry().pending.size).toBe(0)
      expect(await Promise.all(scans)).toEqual(
        Array.from({ length: 8 }, () => new Error('Agent Session History scan was cancelled'))
      )
    } finally {
      registry().rejectAll('test cleanup')
      await Promise.all(scans)
      await ordinary
    }
  })

  it('cancels a queued scan before sending it to the runtime', async () => {
    const { api, registry } = await installPendingScans()
    const blockers = Array.from({ length: 8 }, (_, index) =>
      api.aiVault.listSessions({ requestToken: `active-${index}` }).catch((error: Error) => error)
    )
    await flushScanCalls()
    let queuedOutcome: unknown
    const queued = api.aiVault.listSessions({ requestToken: 'queued' }).catch((error: unknown) => {
      queuedOutcome = error
    })
    await api.aiVault.cancelListSessions({ requestToken: 'queued' })
    await flushScanCalls()
    try {
      expect(queuedOutcome).toEqual(new Error('Agent Session History scan was cancelled'))
      expect(registry().pending.size).toBe(8)
    } finally {
      registry().rejectAll('test cleanup')
      await Promise.all(blockers)
      await flushScanCalls()
      registry().rejectAll('test cleanup')
      await queued
    }
  })

  it('keeps a replacement request cancellable after the older request settles', async () => {
    const { api, registry } = await installPendingScans()
    const older = api.aiVault.listSessions({ requestToken: 'panel' }).catch((error: Error) => error)
    await flushScanCalls()
    void api.aiVault.cancelListSessions({ requestToken: 'panel' })
    const newer = api.aiVault
      .listSessions({ requestToken: 'panel', force: true, scopePaths: ['/another-repo'] })
      .catch((error: Error) => error)
    await flushScanCalls()
    await api.aiVault.cancelListSessions({ requestToken: 'panel' })
    await flushScanCalls()
    try {
      expect(registry().pending.size).toBe(0)
      expect(await older).toEqual(new Error('Agent Session History scan was cancelled'))
      expect(await newer).toEqual(new Error('Agent Session History scan was cancelled'))
    } finally {
      registry().rejectAll('test cleanup')
      await Promise.all([older, newer])
    }
  })

  it('still accepts a slow scan result when its panel remains open', async () => {
    const { api, registry } = await installPendingScans()
    const scan = api.aiVault.listSessions({ requestToken: 'open-panel' })
    await vi.advanceTimersByTimeAsync(40_000)
    expect(registry().pending.size).toBe(1)
    const [id, pending] = [...registry().pending.entries()][0]
    registry().pending.delete(id)
    window.clearTimeout(pending.timeout)
    const result = { sessions: [], issues: [], scannedAt: 'slow scan completed' }
    pending.resolve({ id, ok: true, result, _meta: { runtimeId: 'test-runtime' } })
    await expect(scan).resolves.toEqual(result)
    await api.aiVault.cancelListSessions({ requestToken: 'open-panel' })
    expect(registry().pending.size).toBe(0)
  })

  it('routes session scans through the paired runtime host', async () => {
    const runtimeCalls: { method: string; params: unknown }[] = []
    const scanResult = {
      sessions: [],
      issues: [],
      scannedAt: '2026-07-04T00:00:00.000Z'
    }
    vi.doMock('./web-runtime-client', () => ({
      WebRuntimeClient: class {
        call(method: string, params?: unknown): Promise<RuntimeRpcResponse<unknown>> {
          runtimeCalls.push({ method, params })
          return Promise.resolve({
            id: `call-${runtimeCalls.length}`,
            ok: true,
            result: scanResult,
            _meta: { runtimeId: 'runtime-1' }
          })
        }

        close(): void {}
      }
    }))

    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await expect(
      globals.window.api.aiVault.listSessions({
        executionHostScope: 'all',
        limit: 25,
        force: true,
        scopePaths: ['/srv/app']
      })
    ).resolves.toEqual(scanResult)
    expect(runtimeCalls).toEqual([
      {
        method: 'aiVault.listSessions',
        params: {
          limit: 25,
          force: true,
          scopePaths: ['/srv/app'],
          executionHostId: 'runtime:web-env-1'
        }
      }
    ])
  })

  it('returns unavailable history for explicit non-runtime host scopes', async () => {
    const runtimeCalls: { method: string; params: unknown }[] = []
    vi.doMock('./web-runtime-client', () => ({
      WebRuntimeClient: class {
        call(method: string, params?: unknown): Promise<RuntimeRpcResponse<unknown>> {
          runtimeCalls.push({ method, params })
          return Promise.resolve({
            id: `call-${runtimeCalls.length}`,
            ok: true,
            result: { sessions: [], issues: [], scannedAt: '2026-07-04T00:00:00.000Z' },
            _meta: { runtimeId: 'runtime-1' }
          })
        }

        close(): void {}
      }
    }))

    const globals = installBrowserGlobals('Linux')
    writeStoredRuntimeEnvironment(globals.storage)
    const { installWebPreloadApi } = await import('./web-preload-api')
    installWebPreloadApi()

    await expect(
      globals.window.api.aiVault.listSessions({ executionHostScope: 'local' })
    ).resolves.toEqual({
      sessions: [],
      issues: [
        expect.objectContaining({
          executionHostId: 'local',
          agent: 'codex'
        })
      ],
      scannedAt: expect.any(String)
    })
    expect(runtimeCalls).toEqual([])
  })
})

async function flushScanCalls(): Promise<void> {
  for (let index = 0; index < 20; index++) await Promise.resolve()
}

async function installPendingScans() {
  vi.useFakeTimers()
  const { WebRuntimeRequestRegistry } = await import('./web-runtime-request-registry')
  let registry!: InstanceType<typeof WebRuntimeRequestRegistry>
  let sequence = 0
  vi.doMock('./web-runtime-client', () => ({
    WebRuntimeClient: class {
      constructor() {
        registry = new WebRuntimeRequestRegistry({
          deviceToken: 'token',
          nextId: () => `scan-call-${++sequence}`,
          waitForConnected: () => Promise.resolve(),
          sendEncrypted: (message) => {
            const request = message as { id: string; method: string }
            if (request.method !== 'aiVault.listSessions') {
              queueMicrotask(() => {
                const pending = registry.pending.get(request.id)!
                registry.pending.delete(request.id)
                window.clearTimeout(pending.timeout)
                pending.resolve({
                  id: request.id,
                  ok: true,
                  result: null,
                  _meta: { runtimeId: 'test-runtime' }
                })
              })
            }
            return true
          }
        })
      }

      call(...args: Parameters<InstanceType<typeof WebRuntimeRequestRegistry>['call']>) {
        return registry.call(...args)
      }

      close(): void {
        registry.rejectAll('client closed')
      }
    }
  }))
  const globals = installBrowserGlobals('Linux')
  Object.assign(globals.window, { setTimeout, clearTimeout })
  writeStoredRuntimeEnvironment(globals.storage)
  const { installWebPreloadApi } = await import('./web-preload-api')
  installWebPreloadApi()
  return { api: globals.window.api, registry: () => registry }
}
