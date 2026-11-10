import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const sockets: TestSocket[] = []
class TestSocket {
  static readonly CONNECTING = 0
  readyState = 0
  close = vi.fn()
  constructor(readonly url: string) { sockets.push(this) }
}
let transport: import('./web-runtime-connection-transport').WebRuntimeConnectionTransport
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const response = (status = 200) => ({ status, ok: status === 200, json: vi.fn(), text: vi.fn() }) as unknown as Response

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  sockets.length = 0
  vi.stubGlobal('document', { querySelector: (selector: string) => ({ content: selector.includes('ce-remote-context') ? 'A'.repeat(32) : 'a'.repeat(64) }) })
  vi.stubGlobal('window', { setTimeout, clearTimeout, setInterval, clearInterval, addEventListener: vi.fn(),
    localStorage: { getItem: () => null }, location: { href: 'https://workbench.example.test/studio', origin: 'https://workbench.example.test' } })
  vi.stubGlobal('WebSocket', TestSocket)
  vi.doMock('./web-paired-e2ee-primitives', () => ({ WEB_PAIRED_E2EE_PRIMITIVES: { publicKeyFromBase64: () => new Uint8Array(32) } }))
})
afterEach(() => {
  transport?.close()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.doUnmock('./web-paired-e2ee-primitives')
})
async function start(local = false) {
  if (local) vi.stubGlobal('document', { querySelector: () => null })
  const { WebRuntimeConnectionTransport } = await import('./web-runtime-connection-transport')
  transport = new WebRuntimeConnectionTransport({ endpoint: 'wss://workbench.example.test/workbench-runtime',
    hostPublicKeyB64: 'synthetic', credential: { kind: 'token', deviceToken: 'synthetic' } }, { now: () => Date.now(), isDocumentVisible: () => true })
  return import('./remote-context')
}
function disconnect() { transport.handleSocketClosed(transport.ws!) }

it('keeps the first connection unchanged and checks the immutable context only before remote reconnect', async () => {
  const reply = response()
  const fetcher = vi.fn<typeof fetch>(async (_path, options) =>
    new Headers(options?.headers).get('X-Session-Client') === 'panel' ? reply : response(403))
  vi.stubGlobal('fetch', fetcher)
  await start()
  expect(sockets).toHaveLength(1); expect(fetcher).not.toHaveBeenCalled()
  disconnect(); await vi.advanceTimersByTimeAsync(500)
  expect(sockets).toHaveLength(2); expect(fetcher).toHaveBeenCalledTimes(1)
  const [path, options] = fetcher.mock.calls[0]
  expect(path).toBe('/api/bootstrap')
  expect(options!.cache).toBe('no-store'); expect(options!.credentials).toBe('same-origin')
  expect(new Headers(options!.headers).get('X-Session-Client')).toBe('panel')
  expect(new Headers(options!.headers).get('X-CE-Context')).toBe('A'.repeat(32))
  expect(reply.json).not.toHaveBeenCalled(); expect(reply.text).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(12_000)
  expect(sockets[1].close).toHaveBeenCalledTimes(1)
})
it.each([401, 403])('stops remote reconnect permanently when admission returns %s', async status => {
  const fetcher = vi.fn().mockResolvedValue(response(status)); vi.stubGlobal('fetch', fetcher)
  const api = await start()
  disconnect(); await vi.advanceTimersByTimeAsync(500)
  expect(() => api.assertContextActive()).toThrow('remote_context_inactive')
  await vi.advanceTimersByTimeAsync(60_000)
  expect(fetcher).toHaveBeenCalledTimes(1); expect(sockets).toHaveLength(1)
})
it.each([500, 503, 'network'])('preserves reconnect after %s and recovers without creating a new session', async status => {
  const fetcher = vi.fn()
  if (status === 'network') fetcher.mockRejectedValueOnce(new TypeError('offline'))
  else fetcher.mockResolvedValueOnce(response(status as number))
  fetcher.mockResolvedValue(response()); vi.stubGlobal('fetch', fetcher)
  const api = await start()
  disconnect(); await vi.advanceTimersByTimeAsync(500)
  expect(sockets).toHaveLength(1); expect(() => api.assertContextActive()).not.toThrow()
  await vi.advanceTimersByTimeAsync(1_000)
  expect(sockets).toHaveLength(2); expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/bootstrap', '/api/bootstrap'])
})
it('bounds a stalled check at twelve seconds and ignores its late denial after recovery', async () => {
  const late = deferred<Response>()
  const fetcher = vi.fn().mockReturnValueOnce(late.promise).mockResolvedValue(response()); vi.stubGlobal('fetch', fetcher)
  const api = await start()
  disconnect(); await vi.advanceTimersByTimeAsync(500)
  const signal = fetcher.mock.calls[0][1]!.signal as AbortSignal
  await vi.advanceTimersByTimeAsync(11_999); expect(signal.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1); expect(signal.aborted).toBe(true)
  await vi.advanceTimersByTimeAsync(1_000); expect(sockets).toHaveLength(2)
  late.resolve(response(401)); await vi.advanceTimersByTimeAsync(0)
  expect(() => api.assertContextActive()).not.toThrow(); expect(sockets).toHaveLength(2)
})
it.each(['close', 'inactive'])('cancels a pending check on %s and never opens a late socket', async action => {
  const late = deferred<Response>(), fetcher = vi.fn<typeof fetch>(() => late.promise); vi.stubGlobal('fetch', fetcher)
  const api = await start()
  disconnect(); await vi.advanceTimersByTimeAsync(500)
  const signal = fetcher.mock.calls[0][1]!.signal as AbortSignal
  if (action === 'close') transport.close()
  else api.invalidateContext()
  expect(signal.aborted).toBe(true)
  late.resolve(response(action === 'close' ? 401 : 200)); await vi.advanceTimersByTimeAsync(60_000)
  expect(sockets).toHaveLength(1); expect(fetcher).toHaveBeenCalledTimes(1)
  if (action === 'close') expect(() => api.assertContextActive()).not.toThrow()
})
it('never checks browser admission for local page reconnects', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
  await start(true)
  disconnect(); await vi.advanceTimersByTimeAsync(500)
  expect(fetcher).not.toHaveBeenCalled(); expect(sockets).toHaveLength(2)
})
