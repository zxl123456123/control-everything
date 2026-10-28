import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (x: Record<string, unknown>) => x.default },
  AppState: { addEventListener: vi.fn(() => ({ remove() {} })) }
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
vi.mock('expo-constants', () => ({ default: { expoConfig: {} }, ExecutionEnvironment: {} }))
vi.mock('expo-linking', () => ({
  createURL: () => 'com.example.workbench:/',
  resolveScheme: () => 'com.example.workbench'
}))
vi.mock('expo-web-browser', () => ({ openAuthSessionAsync: vi.fn(), dismissAuthSession: vi.fn() }))
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }))
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn()
}))
import { createPlatformAccountController } from './controller'
import { AccountError, type AccountCandidate, type RevocationOutcome } from './oidc'
import type { PlatformAccountConfig } from './config'
import type { AccountRecovery } from './secure-store'

const config: PlatformAccountConfig = {
  issuer: 'https://identity.example.test/realms/workbench',
  clientId: 'mobile-public',
  scheme: 'com.example.workbench',
  iosBundleId: 'com.example.workbench',
  androidPackage: 'com.example.workbench',
  redirectUri: 'com.example.workbench:/oauth/callback',
  nativeIdentity: 'native-identity'
}
const record: AccountRecovery = {
  version: 1,
  issuer: config.issuer,
  clientId: config.clientId,
  redirectUri: config.redirectUri,
  nativeIdentity: config.nativeIdentity,
  subject: 'subject',
  authorizationNonce: 'nonce',
  refreshToken: 'synthetic-refresh'
}
const value = (): AccountCandidate => ({
  session: {
    issuer: config.issuer,
    subject: 'subject',
    accessToken: 'synthetic-access',
    expiresAt: Date.now() + 60_000
  },
  recovery: { ...record }
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function harness() {
  let stored: AccountRecovery | null = null
  const store = {
    read: vi.fn(async () => stored),
    write: vi.fn(async (next: AccountRecovery) => {
      stored = next
    }),
    remove: vi.fn(async () => {
      stored = null
    })
  }
  const oidc = {
    login: vi.fn(async () => value()),
    restore: vi.fn(async () => value()),
    revoke: vi.fn(async (): Promise<RevocationOutcome> => 'unsupported')
  }
  const controller = createPlatformAccountController({
    configuration: { status: 'ready', config },
    store,
    oidc
  })
  return {
    controller,
    store,
    oidc,
    stored: () => stored,
    seed: (next: AccountRecovery) => {
      stored = next
    }
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_800_000_000_000)
})
afterEach(() => vi.useRealTimers())
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

describe('one account controller owns authentication and serialized persistence', () => {
  it('root cleanup followed by start can restore instead of remaining in restoring', async () => {
    const h = harness()
    h.seed(record)
    const first = deferred<AccountCandidate>()
    h.oidc.restore.mockImplementationOnce(async () => first.promise)
    const old = h.controller.restore()
    await flush()
    h.controller.stop()
    await h.controller.restore()
    expect(h.oidc.restore).toHaveBeenCalledTimes(2)
    first.resolve({ ...value(), session: { ...value().session, subject: 'old' } })
    await old
    expect(h.controller.getSnapshot().account?.subject).toBe('subject')
  })
  it('cleanup removes the signed-in presentation before restarting a session', async () => {
    const h = harness()
    await h.controller.login()
    h.controller.stop()
    expect(h.controller.getSnapshot().status).toBe('signed-out')
    expect(h.controller.getSnapshot().account).toBeUndefined()
    await h.controller.restore()
    expect(h.controller.getSnapshot().status).toBe('signed-in')
  })
  it('publishes success only after secure persistence and never exposes tokens', async () => {
    const h = harness()
    const write = deferred<void>()
    h.store.write.mockImplementation(async () => write.promise)
    const login = h.controller.login()
    await flush()
    expect(h.controller.getSnapshot().status).toBe('authorizing')
    write.resolve()
    await login
    expect(h.controller.getSnapshot()).toMatchObject({
      status: 'signed-in',
      account: { persistence: 'refresh' }
    })
    expect(JSON.stringify(h.controller.getSnapshot())).not.toMatch(
      /synthetic-access|synthetic-refresh|nonce/
    )
  })
  it.each(['missing', 'invalid'] as const)(
    'never reads or authenticates %s configurations',
    async (status) => {
      const h = harness()
      h.seed(record)
      h.controller.configure({ status, message: 'configuration unavailable' })
      await h.controller.restore()
      await h.controller.login()
      expect(h.store.read).not.toHaveBeenCalled()
      expect(h.oidc.login).not.toHaveBeenCalled()
      expect(h.oidc.restore).not.toHaveBeenCalled()
      expect(h.stored()).toEqual(record)
      await h.controller.logout()
      expect(h.stored()).toBeNull()
      expect(h.controller.getSnapshot().status).toBe(
        status === 'missing' ? 'unconfigured' : 'invalid-config'
      )
      expect(h.store.read).not.toHaveBeenCalled()
      expect(h.oidc.login).not.toHaveBeenCalled()
      expect(h.oidc.restore).not.toHaveBeenCalled()
    }
  )
  it('restores by refreshing rather than trusting cached account metadata', async () => {
    const h = harness()
    h.seed(record)
    const pending = deferred<AccountCandidate>()
    h.oidc.restore.mockImplementation(async () => pending.promise)
    const restore = h.controller.restore()
    await flush()
    expect(h.controller.getSnapshot().status).toBe('restoring')
    await h.controller.login()
    expect(h.oidc.login).not.toHaveBeenCalled()
    pending.resolve(value())
    await restore
    expect(h.controller.getSnapshot().status).toBe('signed-in')
  })
  it('read failures preserve credentials and block overwrite until retry or logout', async () => {
    const h = harness()
    h.seed(record)
    h.store.read.mockRejectedValueOnce(new Error('synthetic read failure'))
    await h.controller.restore()
    await h.controller.login()
    expect(h.controller.getSnapshot()).toMatchObject({
      status: 'recovery-error',
      message: '无法读取此 App 的安全账号记录，请重试恢复或退出清除。'
    })
    expect(h.stored()).toEqual(record)
    expect(h.oidc.login).not.toHaveBeenCalled()
    expect(h.store.write).not.toHaveBeenCalled()
    await h.controller.restore()
    expect(h.controller.getSnapshot().status).toBe('signed-in')
  })
  it('network recovery failures retain the previous refresh credential', async () => {
    const h = harness()
    h.seed(record)
    h.oidc.restore.mockRejectedValue(new AccountError('network'))
    await h.controller.restore()
    expect(h.controller.getSnapshot().status).toBe('recovery-error')
    expect(h.stored()).toEqual(record)
    expect(h.store.remove).not.toHaveBeenCalled()
  })
  it('invalid grant expires without an automatic retry loop', async () => {
    const h = harness()
    h.seed(record)
    h.oidc.restore.mockRejectedValue(new AccountError('expired'))
    await h.controller.restore()
    await vi.advanceTimersByTimeAsync(100_000)
    expect(h.controller.getSnapshot().status).toBe('expired')
    expect(h.oidc.restore).toHaveBeenCalledTimes(1)
    expect(h.stored()).toEqual(record)
  })
  it('rotation save failure retries the same verified candidate without using the old refresh token again', async () => {
    const h = harness()
    h.seed(record)
    const rotated = value()
    rotated.recovery!.refreshToken = 'synthetic-rotated'
    h.oidc.restore.mockResolvedValue(rotated)
    h.store.write.mockRejectedValueOnce(new Error('synthetic storage rejection'))
    await h.controller.restore()
    expect(h.controller.getSnapshot().status).toBe('recovery-error')
    expect(h.stored()?.refreshToken).toBe(record.refreshToken)
    await h.controller.restore()
    expect(h.oidc.restore).toHaveBeenCalledTimes(1)
    expect(h.stored()?.refreshToken).toBe('synthetic-rotated')
    expect(h.controller.getSnapshot().status).toBe('signed-in')
  })
  it('session-only sign-in removes any previous persistent account', async () => {
    const h = harness()
    h.seed(record)
    h.oidc.login.mockResolvedValue({ ...value(), recovery: null })
    await h.controller.login()
    expect(h.stored()).toBeNull()
    expect(h.controller.getSnapshot().account?.persistence).toBe('session-only')
  })
  it('failed session-only deletion cannot publish success', async () => {
    const h = harness()
    h.seed(record)
    h.oidc.login.mockResolvedValue({ ...value(), recovery: null })
    h.store.remove.mockRejectedValue(new Error('synthetic delete failure'))
    await h.controller.login()
    expect(h.controller.getSnapshot().status).toBe('recovery-error')
    expect(h.stored()).toEqual(record)
  })
  it('clears the memory session at expiry and on foreground clock checks', async () => {
    const h = harness()
    await h.controller.login()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.controller.getSnapshot().status).toBe('expired')
    expect(h.controller.getSnapshot().account).toBeUndefined()
    await h.controller.restore()
    vi.setSystemTime(Date.now() + 100_000)
    h.controller.checkExpiry()
    expect(h.controller.getSnapshot().status).toBe('expired')
  })
  it('cancelled login returns a truthful signed-out notice', async () => {
    const h = harness()
    h.oidc.login.mockRejectedValue(new AccountError('cancelled'))
    await h.controller.login()
    expect(h.controller.getSnapshot()).toMatchObject({
      status: 'signed-out',
      message: '已取消登录'
    })
  })
  it.each([false, true])(
    'retains an expired account after cancelled login until explicit cleanup (delete failure: %s)',
    async (deleteFails) => {
      const h = harness()
      await h.controller.login()
      expect(h.controller.getSnapshot().account?.persistence).toBe('refresh')
      await vi.advanceTimersByTimeAsync(60_000)
      expect(h.controller.getSnapshot().status).toBe('expired')
      h.oidc.login.mockRejectedValueOnce(new AccountError('cancelled'))
      await h.controller.login()
      expect(h.controller.getSnapshot()).toMatchObject({
        status: 'signed-out',
        message: '已取消登录'
      })
      expect(h.stored()).toEqual(record)
      expect(h.store.remove).not.toHaveBeenCalled()
      if (deleteFails) h.store.remove.mockRejectedValueOnce(new Error('synthetic delete failure'))
      await h.controller.logout()
      if (deleteFails) {
        expect(h.controller.getSnapshot()).toMatchObject({
          status: 'logout-error',
          message: expect.stringContaining('重启后可能恢复')
        })
        expect(h.stored()).toEqual(record)
        await h.controller.restore()
        await h.controller.login()
        expect(h.oidc.login).toHaveBeenCalledTimes(2)
        expect(h.oidc.restore).not.toHaveBeenCalled()
        expect(h.store.read).not.toHaveBeenCalled()
        expect(h.store.write).toHaveBeenCalledTimes(1)
        await h.controller.logout()
      }
      expect(h.stored()).toBeNull()
      expect(h.controller.getSnapshot().status).toBe('signed-out')
    }
  )
  it('logout invalidates a late login and leaves final credentials deleted', async () => {
    const h = harness()
    const pending = deferred<AccountCandidate>()
    h.oidc.login.mockImplementation(async () => pending.promise)
    const login = h.controller.login()
    await h.controller.logout()
    pending.resolve(value())
    await login
    expect(h.controller.getSnapshot().status).toBe('signed-out')
    expect(h.stored()).toBeNull()
    expect(h.store.write).not.toHaveBeenCalled()
  })
  it('logout invalidates a late restore response', async () => {
    const h = harness()
    h.seed(record)
    const pending = deferred<AccountCandidate>()
    h.oidc.restore.mockImplementation(async () => pending.promise)
    const restore = h.controller.restore()
    await flush()
    await h.controller.logout()
    pending.resolve(value())
    await restore
    expect(h.controller.getSnapshot().status).toBe('signed-out')
    expect(h.stored()).toBeNull()
  })
  it('serializes logout deletion after a set already executing', async () => {
    const h = harness()
    const pending = deferred<void>()
    const events: string[] = []
    h.store.write.mockImplementation(async (next) => {
      events.push('set-start')
      await pending.promise
      h.seed(next)
      events.push('set-end')
    })
    const remove = h.store.remove.getMockImplementation()!
    h.store.remove.mockImplementation(async () => {
      events.push('delete')
      await remove()
    })
    const login = h.controller.login()
    await flush()
    const logout = h.controller.logout()
    await flush()
    expect(events).toEqual(['set-start'])
    pending.resolve()
    await Promise.all([login, logout])
    expect(events).toEqual(['set-start', 'set-end', 'delete'])
    expect(h.stored()).toBeNull()
    expect(h.controller.getSnapshot().status).toBe('signed-out')
  })
  it('delete failure blocks every automatic or login recovery until a successful explicit logout', async () => {
    const h = harness()
    h.seed(record)
    h.store.remove.mockRejectedValueOnce(new Error('synthetic delete failure'))
    await h.controller.logout()
    await h.controller.restore()
    await h.controller.login()
    expect(h.controller.getSnapshot()).toMatchObject({
      status: 'logout-error',
      message: expect.stringContaining('重启后可能恢复')
    })
    expect(h.oidc.login).not.toHaveBeenCalled()
    expect(h.store.read).not.toHaveBeenCalled()
    await h.controller.logout()
    expect(h.stored()).toBeNull()
    expect(h.controller.getSnapshot().status).toBe('signed-out')
  })
  it('a new login owns the result when the previous operation returns late', async () => {
    const h = harness()
    const first = deferred<AccountCandidate>()
    h.oidc.login.mockImplementationOnce(async () => first.promise)
    const old = h.controller.login()
    await h.controller.login()
    first.resolve({ ...value(), session: { ...value().session, subject: 'old' } })
    await old
    expect(h.controller.getSnapshot().account?.subject).toBe('subject')
    expect(h.store.write).toHaveBeenCalledTimes(1)
  })
  it('configuration changes invalidate a late response without deleting the old stored record', async () => {
    const h = harness()
    h.seed(record)
    const pending = deferred<AccountCandidate>()
    h.oidc.login.mockImplementation(async () => pending.promise)
    const old = h.controller.login()
    h.controller.configure({ status: 'ready', config: { ...config, clientId: 'other' } })
    pending.resolve(value())
    await old
    expect(h.controller.getSnapshot().status).toBe('signed-out')
    expect(h.store.write).not.toHaveBeenCalled()
    expect(h.stored()).toEqual(record)
  })
})

describe('logout also asks the identity service to revoke the refresh credential', () => {
  async function signedIn() {
    const h = harness()
    h.seed(record)
    await h.controller.restore()
    expect(h.controller.getSnapshot().status).toBe('signed-in')
    return h
  }
  it('revokes the credential it last saw, clears locally, and says so', async () => {
    const h = await signedIn()
    h.oidc.revoke.mockResolvedValue('revoked')
    await h.controller.logout()
    expect(h.oidc.revoke).toHaveBeenCalledTimes(1)
    expect(h.oidc.revoke).toHaveBeenCalledWith(config, record, expect.any(AbortSignal))
    expect(h.stored()).toBeNull()
    expect(h.controller.getSnapshot()).toMatchObject({
      status: 'signed-out',
      message: expect.stringContaining('撤销本机授权')
    })
  })
  it('keeps the local clear and reports honestly when the service cannot confirm revocation', async () => {
    const h = await signedIn()
    h.oidc.revoke.mockResolvedValue('failed')
    await h.controller.logout()
    expect(h.stored()).toBeNull()
    expect(h.controller.getSnapshot()).toMatchObject({
      status: 'signed-out',
      message: expect.stringContaining('未能确认撤销')
    })
  })
  it('treats a throwing revocation as failed instead of leaving the user signed in', async () => {
    const h = await signedIn()
    h.oidc.revoke.mockRejectedValue(new Error('synthetic'))
    await h.controller.logout()
    expect(h.stored()).toBeNull()
    expect(h.controller.getSnapshot().status).toBe('signed-out')
  })
  it('keeps the plain message when the service offers no revocation endpoint', async () => {
    const h = await signedIn()
    await h.controller.logout()
    expect(h.controller.getSnapshot().message).toBe(
      '已退出此 App。浏览器会话与已配对电脑的权限保持独立。'
    )
  })
  it('does not call the service when there is no refresh credential to revoke', async () => {
    const h = harness()
    await h.controller.logout()
    expect(h.oidc.revoke).not.toHaveBeenCalled()
    expect(h.controller.getSnapshot().status).toBe('signed-out')
  })
  it('does not revoke when the local delete failed, so a retry still has the credential', async () => {
    const h = await signedIn()
    h.store.remove.mockRejectedValueOnce(new Error('synthetic delete failure'))
    await h.controller.logout()
    expect(h.oidc.revoke).not.toHaveBeenCalled()
    expect(h.controller.getSnapshot().status).toBe('logout-error')
    h.oidc.revoke.mockResolvedValue('revoked')
    await h.controller.logout()
    expect(h.oidc.revoke).toHaveBeenCalledTimes(1)
    expect(h.controller.getSnapshot().status).toBe('signed-out')
  })
  it('revokes a rotated credential, not the stale one', async () => {
    const h = await signedIn()
    const rotated = { ...value(), recovery: { ...record, refreshToken: 'rotated-refresh' } }
    h.oidc.restore.mockResolvedValue(rotated)
    await h.controller.restore()
    await h.controller.logout()
    expect(h.oidc.revoke.mock.calls[0]?.[1]).toMatchObject({ refreshToken: 'rotated-refresh' })
  })
})

describe('hub requests borrow the account session without showing a restoring screen', () => {
  async function signedIn() {
    const h = harness()
    h.seed(record)
    await h.controller.restore()
    h.oidc.restore.mockClear()
    return h
  }
  it('hands out the access token only while it is comfortably valid', async () => {
    const h = await signedIn()
    expect(h.controller.getAccessToken()).toBe('synthetic-access')
    await vi.advanceTimersByTimeAsync(56_000)
    expect(h.controller.getAccessToken()).toBeNull()
    expect(JSON.stringify(h.controller.getSnapshot())).not.toContain('synthetic-access')
  })
  it('has no token before sign-in and refuses to refresh when signed out', async () => {
    const h = harness()
    h.seed(record)
    expect(h.controller.getAccessToken()).toBeNull()
    expect(await h.controller.refreshAccessToken()).toBeNull()
    expect(h.oidc.restore).not.toHaveBeenCalled()
  })
  it('refreshes once for concurrent callers, rotates the credential and stays signed in', async () => {
    const h = await signedIn()
    const pending = deferred<AccountCandidate>()
    h.oidc.restore.mockImplementationOnce(async () => pending.promise)
    const states: string[] = []
    h.controller.subscribe(() => states.push(h.controller.getSnapshot().status))
    const a = h.controller.refreshAccessToken()
    const b = h.controller.refreshAccessToken()
    await flush()
    pending.resolve({
      session: { ...value().session, accessToken: 'fresh-access' },
      recovery: { ...record, refreshToken: 'rotated-refresh' }
    })
    expect(await a).toBe('fresh-access')
    expect(await b).toBe('fresh-access')
    expect(h.oidc.restore).toHaveBeenCalledTimes(1)
    expect(h.oidc.restore.mock.calls[0]?.[1]).toMatchObject({ refreshToken: 'synthetic-refresh' })
    expect(h.stored()).toMatchObject({ refreshToken: 'rotated-refresh' })
    expect(h.controller.getAccessToken()).toBe('fresh-access')
    expect(states).not.toContain('restoring')
    expect(h.controller.getSnapshot().status).toBe('signed-in')
  })
  it('recovers a lapsed session silently', async () => {
    const h = await signedIn()
    await vi.advanceTimersByTimeAsync(61_000)
    expect(h.controller.getSnapshot().status).toBe('expired')
    expect(await h.controller.refreshAccessToken()).toBe('synthetic-access')
    expect(h.controller.getSnapshot().status).toBe('signed-in')
  })
  it('a rejected refresh credential expires the session once and is not retried', async () => {
    const h = await signedIn()
    h.oidc.restore.mockRejectedValue(new AccountError('expired'))
    expect(await h.controller.refreshAccessToken()).toBeNull()
    expect(h.controller.getSnapshot().status).toBe('expired')
    expect(h.controller.getAccessToken()).toBeNull()
    expect(await h.controller.refreshAccessToken()).toBeNull()
    expect(h.oidc.restore).toHaveBeenCalledTimes(1)
  })
  it('a network failure leaves the session and the stored credential untouched', async () => {
    const h = await signedIn()
    h.oidc.restore.mockRejectedValue(new AccountError('network'))
    expect(await h.controller.refreshAccessToken()).toBeNull()
    expect(h.controller.getSnapshot().status).toBe('signed-in')
    expect(h.controller.getAccessToken()).toBe('synthetic-access')
    expect(h.stored()).toEqual(record)
  })
  it('a session-only login cannot refresh and asks for a new login', async () => {
    const h = harness()
    h.oidc.login.mockResolvedValue({ session: value().session, recovery: null })
    await h.controller.login()
    expect(await h.controller.refreshAccessToken()).toBeNull()
    expect(h.oidc.restore).not.toHaveBeenCalled()
    expect(h.controller.getSnapshot().status).toBe('expired')
  })
  it('logout during a refresh discards the late token', async () => {
    const h = await signedIn()
    const pending = deferred<AccountCandidate>()
    h.oidc.restore.mockImplementationOnce(async () => pending.promise)
    const refreshed = h.controller.refreshAccessToken()
    await flush()
    await h.controller.logout()
    pending.resolve(value())
    expect(await refreshed).toBeNull()
    expect(h.controller.getAccessToken()).toBeNull()
    expect(h.controller.getSnapshot().status).toBe('signed-out')
    expect(h.stored()).toBeNull()
  })
})
