import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HubError } from './hub-client'
import {
  createLiveHubClient,
  hubOrigin,
  type HubTokenSource,
  type LiveFetchInit,
  type LiveFetchResponse
} from './live-hub-client'

const ORIGIN = 'https://hub.example.test'
const NOW_S = 1_800_000_000

const me = (over: Record<string, unknown> = {}) => ({
  account: { sub: 'sub-1', name: 'alice', display_name: 'Alice Liddell', email: 'a@example.test' },
  membership: 'active',
  admin: false,
  ...over
})
const device = (over: Record<string, unknown> = {}) => ({
  device_id: 'a'.repeat(24),
  name: 'Studio PC',
  state: 'online',
  last_seen: NOW_S + 0.4,
  created_at: NOW_S - 86_400,
  os_name: 'Windows',
  os_version: '11',
  app_version: '1.2.3',
  cleanup_failed: false,
  ...over
})

type Call = { url: string; init: LiveFetchInit }
type Reply = { status: number; body?: unknown; raw?: string } | Error | 'hang'

function harness(
  replies: Reply[],
  tokens: Partial<HubTokenSource> & { current?: string | null } = {}
) {
  const calls: Call[] = []
  const queue = [...replies]
  const fetchMock = vi.fn(async (url: string, init: LiveFetchInit): Promise<LiveFetchResponse> => {
    calls.push({ url, init })
    const next = queue.shift()
    if (next === undefined) throw new Error('unexpected request')
    if (next === 'hang')
      return new Promise<LiveFetchResponse>((_resolve, reject) =>
        init.signal.addEventListener('abort', () => reject(new Error('aborted')))
      )
    if (next instanceof Error) throw next
    return { status: next.status, text: async () => next.raw ?? JSON.stringify(next.body ?? {}) }
  })
  let current = tokens.current === undefined ? 'access-1' : tokens.current
  const source: HubTokenSource = {
    getAccessToken: tokens.getAccessToken ?? (() => current),
    refreshAccessToken:
      tokens.refreshAccessToken ??
      vi.fn(async () => {
        current = 'access-2'
        return current
      })
  }
  const client = createLiveHubClient({ origin: ORIGIN, tokens: source, fetch: fetchMock })
  return { client, calls, fetchMock, source }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW_S * 1000)
})
afterEach(() => vi.useRealTimers())

describe('live hub client requests', () => {
  it('is labelled live and sends Bearer-only JSON requests to the mobile API', async () => {
    const h = harness([
      { status: 200, body: me() },
      { status: 200, body: { items: [] } }
    ])
    expect(h.client.kind).toBe('live')
    await h.client.getMe()
    await h.client.listDevices()
    expect(h.calls.map((c) => [c.init.method, c.url])).toEqual([
      ['GET', `${ORIGIN}/remote/mobile/me`],
      ['GET', `${ORIGIN}/remote/mobile/devices`]
    ])
    for (const { init } of h.calls) {
      expect(init.headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer access-1' })
      expect(init.redirect).toBe('error')
      expect(init.body).toBeUndefined()
      expect(Object.keys(init)).not.toContain('credentials')
    }
  })

  it('posts the invite and an empty revoke body with a JSON content type', async () => {
    const h = harness([
      { status: 200, body: me() },
      { status: 200, body: { device_id: 'a'.repeat(24), state: 'revoked' } }
    ])
    await h.client.activateInvite('code-' + 'x'.repeat(20))
    await h.client.revokeDevice('a'.repeat(24))
    expect(h.calls[0]!.url).toBe(`${ORIGIN}/remote/mobile/activate`)
    expect(JSON.parse(h.calls[0]!.init.body!)).toEqual({ invite: 'code-' + 'x'.repeat(20) })
    expect(h.calls[0]!.init.headers['Content-Type']).toBe('application/json')
    expect(h.calls[1]!.url).toBe(`${ORIGIN}/remote/mobile/devices/${'a'.repeat(24)}/revoke`)
    expect(h.calls[1]!.init.method).toBe('POST')
    expect(h.calls[1]!.init.body).toBe('{}')
  })

  it('never builds a URL from an id the hub could not have issued', async () => {
    const h = harness([])
    for (const id of ['', '../me', 'a/b', 'a?x=1', 'a'.repeat(65)])
      await expect(h.client.revokeDevice(id)).rejects.toMatchObject({ kind: 'not-found' })
    expect(h.fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes an unusable token before the first request', async () => {
    const h = harness([{ status: 200, body: me() }], { current: null })
    await h.client.getMe()
    expect(h.source.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(h.calls[0]!.init.headers.Authorization).toBe('Bearer access-2')
  })

  it('reports an expired session when there is no token and no refresh', async () => {
    const h = harness([], { current: null, refreshAccessToken: async () => null })
    await expect(h.client.listDevices()).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(h.fetchMock).not.toHaveBeenCalled()
  })
})

describe('live hub client token refresh', () => {
  it('refreshes once on 401 and retries the request exactly once', async () => {
    const h = harness([
      { status: 401, body: { error: 'invalid_token' } },
      { status: 200, body: { items: [device()] } }
    ])
    expect(await h.client.listDevices()).toHaveLength(1)
    expect(h.source.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(h.calls.map((c) => c.init.headers.Authorization)).toEqual([
      'Bearer access-1',
      'Bearer access-2'
    ])
  })

  it('a second 401 means the session is expired and does not loop', async () => {
    const h = harness([{ status: 401 }, { status: 401 }])
    await expect(h.client.getMe()).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(h.fetchMock).toHaveBeenCalledTimes(2)
    expect(h.source.refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('a failed refresh after a 401 surfaces unauthorized without a retry', async () => {
    const h = harness([{ status: 401 }], { refreshAccessToken: async () => null })
    await expect(h.client.getMe()).rejects.toMatchObject({ kind: 'unauthorized' })
    expect(h.fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reuses a token another request already rotated instead of refreshing again', async () => {
    let current = 'access-1'
    const refresh = vi.fn(async () => 'never')
    const h = harness([{ status: 200, body: me() }], {
      getAccessToken: () => current,
      refreshAccessToken: refresh
    })
    h.fetchMock.mockImplementationOnce(async (url, init) => {
      h.calls.push({ url, init })
      current = 'access-rotated'
      return { status: 401, text: async () => '{}' }
    })
    await h.client.getMe()
    expect(refresh).not.toHaveBeenCalled()
    expect(h.calls[1]!.init.headers.Authorization).toBe('Bearer access-rotated')
  })

  it('does not refresh for non-401 failures', async () => {
    const h = harness([{ status: 500 }])
    await expect(h.client.getMe()).rejects.toMatchObject({ kind: 'network' })
    expect(h.source.refreshAccessToken).not.toHaveBeenCalled()
  })
})

describe('live hub client response mapping', () => {
  it('maps the account, preferring the display name', async () => {
    expect(await harness([{ status: 200, body: me() }]).client.getMe()).toEqual({
      subject: 'sub-1',
      name: 'Alice Liddell',
      email: 'a@example.test',
      membership: 'active',
      admin: false
    })
    const bare = me({ account: { sub: 'sub-2', name: 'bob', display_name: null, email: null } })
    expect(await harness([{ status: 200, body: bare }]).client.getMe()).toMatchObject({
      name: 'bob',
      email: null
    })
    const nameless = me({ account: { sub: 'sub-3' }, membership: 'inactive', admin: true })
    expect(await harness([{ status: 200, body: nameless }]).client.getMe()).toMatchObject({
      name: 'sub-3',
      membership: 'inactive',
      admin: true
    })
  })

  it('returns the refreshed account from activate', async () => {
    const h = harness([{ status: 200, body: me({ membership: 'active' }) }])
    expect((await h.client.activateInvite('x'.repeat(20))).membership).toBe('active')
  })

  it('converts epoch seconds to milliseconds and maps devices', async () => {
    const devices = await harness([
      {
        status: 200,
        body: {
          items: [
            device(),
            device({
              device_id: 'b'.repeat(24),
              last_seen: null,
              os_name: 'Darwin',
              app_version: null
            }),
            device({
              device_id: 'c'.repeat(24),
              os_name: 'Linux',
              state: 'cleanup_failed',
              created_at: null
            }),
            device({ device_id: 'd'.repeat(24), os_name: null, name: '', state: 'something-new' })
          ]
        }
      }
    ]).client.listDevices()
    expect(devices[0]).toEqual({
      id: 'a'.repeat(24),
      name: 'Studio PC',
      os: 'windows',
      state: 'online',
      lastSeenAt: NOW_S * 1000 + 400,
      boundAt: (NOW_S - 86_400) * 1000,
      appVersion: '1.2.3'
    })
    expect(devices[1]).toMatchObject({ os: 'macos', lastSeenAt: null, appVersion: null })
    expect(devices[2]).toMatchObject({ os: 'linux', state: 'cleanup_failed', boundAt: null })
    expect(devices[3]).toMatchObject({
      os: 'unknown',
      name: 'd'.repeat(24),
      state: 'something-new'
    })
  })

  it('treats unreadable replies as a retryable network problem, never as data', async () => {
    const bad: Reply[] = [
      { status: 200, raw: '<html>login</html>' },
      { status: 200, body: { items: 'nope' } },
      { status: 200, body: { items: [{ name: 'no id' }] } },
      { status: 200, body: me({ membership: 'owner' }) },
      { status: 200, body: [] }
    ]
    const h = harness(bad)
    await expect(h.client.getMe()).rejects.toMatchObject({ kind: 'network' })
    await expect(h.client.listDevices()).rejects.toMatchObject({ kind: 'network' })
    await expect(h.client.listDevices()).rejects.toMatchObject({ kind: 'network' })
    await expect(h.client.getMe()).rejects.toMatchObject({ kind: 'network' })
    await expect(h.client.getMe()).rejects.toMatchObject({ kind: 'network' })
  })
})

describe('live hub client typed errors', () => {
  const kindFor = async (status: number, error?: string, raw?: string) => {
    const h = harness([{ status, body: error ? { error } : {}, raw }])
    const failure = await h.client.activateInvite('x'.repeat(20)).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(HubError)
    return (failure as HubError).kind
  }
  it('maps hub error codes to the kinds the UI has copy for', async () => {
    expect(await kindFor(400, 'invalid_invitation')).toBe('invalid-invite')
    expect(await kindFor(403, 'member_disabled')).toBe('member-disabled')
    expect(await kindFor(404, 'device_not_found')).toBe('not-found')
    expect(await kindFor(429, 'rate_limited')).toBe('rate-limited')
    expect(await kindFor(429)).toBe('rate-limited')
    expect(await kindFor(403, 'identity_scope_rejected')).toBe('unavailable')
  })
  it('treats a missing route as an unsupported hub and other faults as retryable', async () => {
    expect(await kindFor(404, undefined, '<html>not found</html>')).toBe('unavailable')
    expect(await kindFor(405)).toBe('unavailable')
    expect(await kindFor(503, 'identity_unavailable')).toBe('network')
    expect(await kindFor(502, undefined, 'Bad Gateway')).toBe('network')
    expect(await kindFor(400, 'invalid_json')).toBe('network')
  })
  it('turns transport failures and refused redirects into network errors', async () => {
    const h = harness([new TypeError('Network request failed'), new Error('redirect')])
    await expect(h.client.getMe()).rejects.toMatchObject({ kind: 'network' })
    await expect(h.client.getMe()).rejects.toMatchObject({ kind: 'network' })
  })
  it('never leaks the token through an error', async () => {
    const h = harness([new Error('failed for Bearer access-1')])
    const error = await h.client.getMe().catch((e: unknown) => e)
    expect(JSON.stringify(error)).not.toContain('access-1')
    expect(String((error as Error).message)).not.toContain('access-1')
  })
})

describe('live hub client timeouts', () => {
  it('aborts a stalled request and reports a network error', async () => {
    const h = harness(['hang'])
    const result = h.client.getMe().catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(14_999)
    expect(h.calls[0]!.init.signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(h.calls[0]!.init.signal.aborted).toBe(true)
    expect(await result).toMatchObject({ kind: 'network' })
  })
  it('times out even when fetch ignores the abort signal', async () => {
    const fetchMock = vi.fn(() => new Promise<LiveFetchResponse>(() => undefined))
    const client = createLiveHubClient({
      origin: ORIGIN,
      tokens: { getAccessToken: () => 't', refreshAccessToken: async () => null },
      fetch: fetchMock,
      timeoutMs: 1_000
    })
    const result = client.listDevices().catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1_001)
    expect(await result).toMatchObject({ kind: 'network' })
  })
  it('does not leave a timer behind after a normal reply', async () => {
    const h = harness([{ status: 200, body: me() }])
    await h.client.getMe()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('hub origin validation', () => {
  it('accepts only a bare https origin', () => {
    expect(hubOrigin('https://hub.example.test')).toBe(ORIGIN)
    expect(hubOrigin('https://hub.example.test/')).toBe(ORIGIN)
    for (const bad of [
      'http://hub.example.test',
      'https://hub.example.test/remote',
      'https://u:p@hub.example.test',
      'https://hub.example.test?x=1',
      'not a url',
      '',
      null,
      42
    ])
      expect(hubOrigin(bad)).toBeNull()
  })
  it('refuses to build a client for an unsafe origin', () => {
    expect(() =>
      createLiveHubClient({
        origin: 'http://hub.example.test',
        tokens: { getAccessToken: () => 't', refreshAccessToken: async () => null },
        fetch: vi.fn()
      })
    ).toThrow('invalid hub origin')
  })
})
