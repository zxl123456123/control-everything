import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const native = vi.hoisted(() => ({ fetch: vi.fn(), browser: vi.fn() }))
vi.mock('expo/fetch', () => ({ fetch: native.fetch }))
vi.mock('expo-web-browser', () => ({
  openAuthSessionAsync: native.browser,
  dismissAuthSession: vi.fn()
}))
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (x: Record<string, unknown>) => x.ios ?? x.default }
}))
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  CodedError: class extends Error {
    constructor(
      readonly code: string,
      message: string
    ) {
      super(message)
    }
  }
}))
vi.mock('expo-linking', () => ({
  createURL: () => 'com.example.workbench:/',
  resolveScheme: () => 'com.example.workbench'
}))
vi.mock('expo-constants', () => ({ default: { expoConfig: {} }, ExecutionEnvironment: {} }))
import { platformAccountOidc } from './oidc'
import type { PlatformAccountConfig } from './config'
import type { AccountRecovery } from './secure-store'

const config: PlatformAccountConfig = {
  issuer: 'https://identity.example.test/realms/workbench',
  clientId: 'mobile-public',
  scheme: 'com.example.workbench',
  iosBundleId: 'com.example.workbench',
  androidPackage: 'com.example.workbench',
  redirectUri: 'com.example.workbench:/oauth/callback',
  nativeIdentity: 'com.example.workbench|com.example.workbench|com.example.workbench'
}
const now = 1_800_000_000_000
const recovery: AccountRecovery = {
  version: 1,
  issuer: config.issuer,
  clientId: config.clientId,
  redirectUri: config.redirectUri,
  nativeIdentity: config.nativeIdentity,
  subject: 'subject-1',
  authorizationNonce: 'original-nonce',
  refreshToken: 'synthetic-refresh'
}
const discovery = {
  issuer: config.issuer,
  authorization_endpoint: config.issuer + '/authorize',
  token_endpoint: config.issuer + '/token',
  userinfo_endpoint: config.issuer + '/userinfo',
  id_token_signing_alg_values_supported: ['RS256']
}
function jwt(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256' }) {
  return (
    [header, claims].map((x) => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.') +
    '.c2lnbmF0dXJl'
  )
}
const claims = (nonce: string) => ({
  iss: config.issuer,
  aud: config.clientId,
  sub: 'subject-1',
  nonce,
  iat: now / 1000,
  exp: now / 1000 + 300
})
function response(url: string, body: unknown, status = 200) {
  return { url, ok: status >= 200 && status < 300, status, json: async () => body }
}
let authorization: URL
let tokenBody: Record<string, unknown>
let claimChanges: Record<string, unknown>
let headerChanges: Record<string, unknown>
let callback: (url: URL) => string
let discoveryChanges: Record<string, unknown>
let profile: Record<string, unknown>
function login(signal = new AbortController().signal) {
  return platformAccountOidc.login(config, signal, () => now)
}
beforeEach(() => {
  vi.stubGlobal('__DEV__', false)
  vi.clearAllMocks()
  authorization = undefined as never
  claimChanges = {}
  headerChanges = {}
  discoveryChanges = {}
  profile = { sub: 'subject-1', name: 'Synthetic User' }
  tokenBody = {
    access_token: 'synthetic-access',
    token_type: 'Bearer',
    expires_in: 300,
    refresh_token: 'synthetic-refresh'
  }
  callback = (url) =>
    `${config.redirectUri}?code=synthetic-code&state=${url.searchParams.get('state')}`
  native.browser.mockImplementation(async (url: string) => {
    authorization = new URL(url)
    return { type: 'success', url: callback(authorization) }
  })
  native.fetch.mockImplementation(async (url: string) => {
    if (url.endsWith('openid-configuration'))
      return response(url, { ...discovery, ...discoveryChanges })
    if (url.endsWith('/token'))
      return response(url, {
        id_token: jwt(
          {
            ...claims(authorization?.searchParams.get('nonce') ?? 'original-nonce'),
            ...claimChanges
          },
          { alg: 'RS256', ...headerChanges }
        ),
        ...tokenBody
      })
    return response(url, profile)
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('real SDK code flow over the narrow native transport', () => {
  it('uses system AuthRequest Code/S256, random state/nonce and the public token request model', async () => {
    const result = await login()
    expect(authorization.searchParams.get('response_type')).toBe('code')
    expect(authorization.searchParams.get('scope')).toBe('openid profile')
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorization.searchParams.get('state')!.length).toBeGreaterThanOrEqual(22)
    expect(authorization.searchParams.get('nonce')!.length).toBeGreaterThanOrEqual(22)
    expect(native.browser.mock.calls[0][1]).toBe(config.redirectUri)
    const request = new URLSearchParams(native.fetch.mock.calls[1][1].body)
    expect(request.get('grant_type')).toBe('authorization_code')
    expect(request.get('redirect_uri')).toBe(config.redirectUri)
    expect(request.get('client_secret')).toBeNull()
    const expectedChallenge = createHash('sha256')
      .update(request.get('code_verifier')!)
      .digest('base64url')
    expect(authorization.searchParams.get('code_challenge')).toBe(expectedChallenge)
    for (const [, init] of native.fetch.mock.calls)
      expect(init).toMatchObject({
        redirect: 'error',
        credentials: 'omit',
        signal: expect.any(AbortSignal)
      })
    expect(result.session.subject).toBe('subject-1')
    expect(result.recovery).not.toHaveProperty('accessToken')
    expect(result.recovery).not.toHaveProperty('idToken')
    const firstState = authorization.searchParams.get('state')
    await login()
    expect(authorization.searchParams.get('state')).not.toBe(firstState)
  })
  it.each([
    (url: URL) => `${config.redirectUri}?code=x&state=wrong`,
    () => `${config.redirectUri}?code=x`,
    (url: URL) =>
      `com.example.workbench://evil/oauth/callback?code=x&state=${url.searchParams.get('state')}`,
    (url: URL) => `${config.redirectUri}/other?code=x&state=${url.searchParams.get('state')}`,
    (url: URL) =>
      `${config.redirectUri}?code=x&state=${url.searchParams.get('state')}&state=${url.searchParams.get('state')}`,
    (url: URL) => `${config.redirectUri}?code=x&code=y&state=${url.searchParams.get('state')}`,
    (url: URL) => `${config.redirectUri}?code=x&error=oops&state=${url.searchParams.get('state')}`,
    (url: URL) =>
      `${config.redirectUri}?code=x&state=${url.searchParams.get('state')}&access_token=x`,
    (url: URL) => `${config.redirectUri}?code=x&state=${url.searchParams.get('state')}&id_token=x`,
    (url: URL) =>
      `${config.redirectUri}?code=x&state=${url.searchParams.get('state')}&iss=https://other.example.test/`,
    (url: URL) => `${config.redirectUri}?state=${url.searchParams.get('state')}`,
    (url: URL) => `${config.redirectUri}?code=x&state=${url.searchParams.get('state')}#anything`
  ])('rejects callback case %# before token exchange', async (make) => {
    callback = make
    await expect(login()).rejects.toMatchObject({ kind: 'callback' })
    expect(native.fetch).toHaveBeenCalledTimes(1)
  })
  it.each(['cancel', 'dismiss'])('reports browser %s without exchanging', async (type) => {
    native.browser.mockResolvedValue({ type })
    await expect(login()).rejects.toMatchObject({ kind: 'cancelled' })
    expect(native.fetch).toHaveBeenCalledTimes(1)
  })
  it.each([
    ['issuer', 'https://other.example.test/'],
    ['token_endpoint', 'https://other.example.test/token'],
    ['authorization_endpoint', 'http://identity.example.test/authorize'],
    ['userinfo_endpoint', config.issuer + '/userinfo?forward=x'],
    ['id_token_signing_alg_values_supported', ['HS256']]
  ])('rejects discovery %s before browser', async (key, value) => {
    discoveryChanges[key] = value
    await expect(login()).rejects.toMatchObject({ kind: 'incompatible' })
    expect(native.browser).not.toHaveBeenCalled()
  })
  it.each([
    ['iss', 'https://other.example.test/'],
    ['sub', ''],
    ['aud', 'other'],
    ['aud', ['mobile-public', 'other']],
    ['azp', 'other'],
    ['exp', now / 1000],
    ['exp', Number.NaN],
    ['iat', now / 1000 + 61],
    ['iat', 1.5],
    ['nbf', now / 1000 + 61],
    ['nonce', undefined],
    ['nonce', 'wrong'],
    ['auth_time', now / 1000 + 61],
    ['at_hash', 'wrong']
  ])('rejects initial claim %s case %#', async (key, value) => {
    claimChanges[key] = value
    await expect(login()).rejects.toMatchObject({ kind: 'identity' })
    expect(native.fetch).toHaveBeenCalledTimes(2)
  })
  it.each([
    { alg: 'none' },
    { alg: 'HS256' },
    { crit: ['unknown'] },
    { b64: false },
    { jku: 'https://other.example.test/' },
    { x5u: 'https://other.example.test/' }
  ])('rejects unsupported header %#', async (change) => {
    headerChanges = change
    await expect(login()).rejects.toMatchObject({ kind: 'identity' })
  })
  it.each([undefined, '', 'a.b.c', 'e30=.e30.c2ln', 'e30.e30.', 'a.b.c.d.e', '_w.e30.c2ln'])(
    'rejects missing or malformed ID token %#',
    async (id_token) => {
      tokenBody.id_token = id_token
      await expect(login()).rejects.toMatchObject({ kind: 'identity' })
    }
  )
  it.each([
    { expires_in: undefined },
    { expires_in: 0 },
    { expires_in: '300' },
    { token_type: 'MAC' },
    { access_token: '' },
    { refresh_token: '' }
  ])('rejects token response %#', async (change) => {
    Object.assign(tokenBody, change)
    await expect(login()).rejects.toMatchObject({ kind: 'incompatible' })
  })
  it('requires UserInfo to match the validated ID token subject', async () => {
    profile.sub = 'other'
    await expect(login()).rejects.toMatchObject({ kind: 'identity' })
  })
  it('supports single audience arrays, valid at_hash and session-only responses', async () => {
    claimChanges.aud = [config.clientId]
    claimChanges.at_hash = createHash('sha256')
      .update('synthetic-access')
      .digest()
      .subarray(0, 16)
      .toString('base64url')
    delete tokenBody.refresh_token
    expect((await login()).recovery).toBeNull()
  })
  it.each(['redirect', 'wrong-url', 'bad-json', 'array', 'tls'])(
    'rejects transport %s',
    async (mode) => {
      native.fetch.mockImplementation(async (url: string) => {
        if (mode === 'tls') throw new Error('synthetic transport rejection')
        if (mode === 'bad-json')
          return {
            ...response(url, null),
            json: async () => {
              throw new Error('invalid JSON')
            }
          }
        return response(
          mode === 'wrong-url' ? url + '/other' : url,
          mode === 'array' ? [] : {},
          mode === 'redirect' ? 302 : 200
        )
      })
      await expect(login()).rejects.toBeDefined()
      expect(native.browser).not.toHaveBeenCalled()
    }
  )
  it('bounds a non-cooperating request at 15 seconds', async () => {
    vi.useFakeTimers()
    native.fetch.mockImplementation(() => new Promise(() => {}))
    const pending = expect(login()).rejects.toMatchObject({ kind: 'network' })
    await vi.advanceTimersByTimeAsync(15_000)
    await pending
    expect(native.fetch.mock.calls[0][1].signal.aborted).toBe(true)
  })
  it('aborts before opening the browser and does not log raw failures', async () => {
    const abort = new AbortController()
    abort.abort()
    await expect(login(abort.signal)).rejects.toMatchObject({ kind: 'network', message: 'network' })
    expect(native.fetch).not.toHaveBeenCalled()
    expect(native.browser).not.toHaveBeenCalled()
  })
})
describe('refresh grant identity binding', () => {
  it('accepts an ID token with the original nonce and unchanged auth_time', async () => {
    claimChanges.auth_time = 10
    const result = await platformAccountOidc.restore(
      config,
      { ...recovery, optionalAuthTime: 10 },
      new AbortController().signal,
      () => now
    )
    expect(result.recovery).toMatchObject({
      authorizationNonce: 'original-nonce',
      optionalAuthTime: 10
    })
  })
  it('permits omitted ID token only with the stored identity and confirms UserInfo', async () => {
    tokenBody.id_token = undefined
    const result = await platformAccountOidc.restore(
      config,
      recovery,
      new AbortController().signal,
      () => now
    )
    expect(result.recovery?.subject).toBe(recovery.subject)
    expect(native.browser).not.toHaveBeenCalled()
    const body = new URLSearchParams(native.fetch.mock.calls[1][1].body)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe(recovery.refreshToken)
  })
  it('permits omitted refresh nonce and retains the original authorization context', async () => {
    claimChanges.nonce = undefined
    tokenBody.refresh_token = 'rotated-synthetic-refresh'
    const result = await platformAccountOidc.restore(
      config,
      recovery,
      new AbortController().signal,
      () => now
    )
    expect(result.recovery).toMatchObject({
      refreshToken: 'rotated-synthetic-refresh',
      authorizationNonce: 'original-nonce'
    })
  })
  it('preserves the existing refresh token when the response omits it', async () => {
    tokenBody.id_token = undefined
    delete tokenBody.refresh_token
    const result = await platformAccountOidc.restore(
      config,
      recovery,
      new AbortController().signal,
      () => now
    )
    expect(result.recovery?.refreshToken).toBe(recovery.refreshToken)
  })
  it.each([
    { sub: 'other' },
    { nonce: 'wrong' },
    { iss: 'other' },
    { aud: 'other' },
    { auth_time: 20 }
  ])('rejects refreshed identity case %#', async (change) => {
    claimChanges = { nonce: undefined, ...change }
    await expect(
      platformAccountOidc.restore(
        config,
        { ...recovery, optionalAuthTime: 10 },
        new AbortController().signal,
        () => now
      )
    ).rejects.toMatchObject({ kind: 'identity' })
  })
  it('rejects a mismatched stored configuration before requests', async () => {
    await expect(
      platformAccountOidc.restore(
        config,
        { ...recovery, clientId: 'other' },
        new AbortController().signal
      )
    ).rejects.toMatchObject({ kind: 'identity' })
    expect(native.fetch).not.toHaveBeenCalled()
  })
  it('maps invalid_grant without exposing server response content', async () => {
    native.fetch.mockImplementation(async (url: string) =>
      url.endsWith('/token')
        ? response(url, { error: 'invalid_grant', error_description: 'synthetic secret' }, 400)
        : response(url, discovery)
    )
    await expect(
      platformAccountOidc.restore(config, recovery, new AbortController().signal)
    ).rejects.toMatchObject({ kind: 'expired', message: 'expired' })
  })
})
