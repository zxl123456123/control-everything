import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHubLogout, HUB_LOGOUT_PATH, type HubLogoutFetch } from './hub-logout'

const origin = 'https://hub.example.test'
const live = () => new AbortController().signal
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
const reply = (status: number) => ({ status, text: async () => '' })

describe('hub logout request', () => {
  it('POSTs the bearer token to the fixed path without following redirects', async () => {
    const fetch = vi.fn<HubLogoutFetch>(async () => reply(200))
    const ok = await createHubLogout({ origin, fetch })('synthetic-access', live())
    expect(ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe(origin + HUB_LOGOUT_PATH)
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: 'Bearer synthetic-access' }
    })
  })
  it.each([401, 403, 404, 500, 302])('reports a %i reply as not acknowledged', async (status) => {
    const fetch = vi.fn<HubLogoutFetch>(async () => reply(status))
    expect(await createHubLogout({ origin, fetch })('t', live())).toBe(false)
  })
  it('reports a network failure as not acknowledged instead of throwing', async () => {
    const fetch = vi.fn<HubLogoutFetch>(async () => {
      throw new Error('synthetic')
    })
    expect(await createHubLogout({ origin, fetch })('t', live())).toBe(false)
  })
  it.each([
    'http://hub.example.test',
    'https://user:pw@hub.example.test',
    'https://hub.example.test/base',
    'https://hub.example.test/?x=1',
    'https://hub.example.test/#frag',
    'not a url',
    ''
  ])('never sends the token to the unsafe origin %j', async (bad) => {
    const fetch = vi.fn<HubLogoutFetch>(async () => reply(200))
    expect(await createHubLogout({ origin: bad, fetch })('t', live())).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('does nothing without a token or with an already aborted signal', async () => {
    const fetch = vi.fn<HubLogoutFetch>(async () => reply(200))
    const logout = createHubLogout({ origin, fetch })
    expect(await logout('', live())).toBe(false)
    const controller = new AbortController()
    controller.abort()
    expect(await logout('t', controller.signal)).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('gives up at the deadline even when the connection never answers', async () => {
    let inner: AbortSignal | undefined
    const fetch = vi.fn<HubLogoutFetch>(
      (_url, init) =>
        new Promise(() => {
          inner = init.signal
        })
    )
    const pending = createHubLogout({ origin, fetch, timeoutMs: 1_000 })('t', live())
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await pending).toBe(false)
    expect(inner?.aborted).toBe(true)
  })
  it('propagates the caller abort to the request', async () => {
    let inner: AbortSignal | undefined
    const fetch = vi.fn<HubLogoutFetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          inner = init.signal
          init.signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )
    const outer = new AbortController()
    const pending = createHubLogout({ origin, fetch })('t', outer.signal)
    await Promise.resolve()
    outer.abort()
    expect(await pending).toBe(false)
    expect(inner?.aborted).toBe(true)
  })
})
