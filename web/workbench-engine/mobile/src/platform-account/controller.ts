import Constants from 'expo-constants'
import { useSyncExternalStore } from 'react'
import { AppState, Platform } from 'react-native'
import {
  accountConfigBinding,
  readPlatformAccountConfig,
  type PlatformAccountConfiguration
} from './config'
import {
  AccountError,
  platformAccountOidc,
  type AccountCandidate,
  type AccountSession
} from './oidc'
import { platformAccountStore } from './secure-store'
import type { AccountRecovery } from './secure-store'

export type AccountStatus =
  | 'unconfigured'
  | 'invalid-config'
  | 'restoring'
  | 'signed-out'
  | 'authorizing'
  | 'signed-in'
  | 'expired'
  | 'recovery-error'
  | 'login-error'
  | 'logging-out'
  | 'logout-error'
export type AccountSnapshot = {
  status: AccountStatus
  message?: string
  issuer?: string
  account?: Omit<AccountSession, 'accessToken'> & { persistence: 'session-only' | 'refresh' }
}
type Dependencies = {
  configuration: PlatformAccountConfiguration
  store: typeof platformAccountStore
  oidc: typeof platformAccountOidc
  now?: () => number
}
const errors = {
  network: '无法连接身份服务，请检查网络后重试。',
  incompatible: '身份服务配置不兼容，请联系发行者。',
  callback: '授权回调无效，请重新登录。',
  identity: '身份验证失败，请重新登录。',
  expired: '账号凭据已过期，请重新登录。',
  cancelled: '已取消登录'
}

export function createPlatformAccountController(deps: Dependencies) {
  let configuration = deps.configuration
  let generation = 0
  let abortController = new AbortController()
  let storageQueue: Promise<unknown> = Promise.resolve()
  let session: AccountSession | null = null
  let candidate: AccountCandidate | null = null
  let logoutFailed = false
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()
  const now = deps.now ?? Date.now
  const initial = (): AccountSnapshot =>
    configuration.status === 'ready'
      ? { status: 'signed-out', issuer: configuration.config.issuer }
      : {
          status: configuration.status === 'missing' ? 'unconfigured' : 'invalid-config',
          message: configuration.message
        }
  let snapshot = initial()
  function publish(value: AccountSnapshot) {
    snapshot = {
      ...(configuration.status === 'ready' ? { issuer: configuration.config.issuer } : {}),
      ...value
    }
    for (const listener of listeners) listener()
  }
  function invalidate() {
    generation += 1
    abortController.abort()
    abortController = new AbortController()
    session = null
    candidate = null
    clearTimeout(expiryTimer)
    return {
      generation,
      binding: configuration.status === 'ready' ? accountConfigBinding(configuration.config) : '',
      signal: abortController.signal
    }
  }
  type Operation = ReturnType<typeof invalidate>
  const owns = (op: Operation) =>
    op.generation === generation &&
    configuration.status === 'ready' &&
    op.binding === accountConfigBinding(configuration.config)
  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = storageQueue.then(action)
    storageQueue = result.catch(() => {})
    return result
  }
  function checkExpiry() {
    if (session && session.expiresAt <= now()) {
      session = null
      clearTimeout(expiryTimer)
      publish({ status: 'expired', message: '本次账号会话已过期，请重新验证或登录。' })
    }
  }
  async function commit(op: Operation, value: AccountCandidate, restoring: boolean) {
    if (!owns(op)) return
    candidate = value
    try {
      await enqueue(async () => {
        if (!owns(op)) return
        if (value.recovery) await deps.store.write(value.recovery)
        else await deps.store.remove()
      })
      if (!owns(op)) return
      candidate = null
      if (value.session.expiresAt <= now()) {
        publish({ status: 'expired', message: errors.expired })
        return
      }
      session = value.session
      const { accessToken: _token, ...account } = value.session
      publish({
        status: 'signed-in',
        account: { ...account, persistence: value.recovery ? 'refresh' : 'session-only' }
      })
      const schedule = () => {
        if (!owns(op) || !session) return
        checkExpiry()
        if (session)
          expiryTimer = setTimeout(
            schedule,
            Math.min(2_147_483_647, Math.max(1, session.expiresAt - now()))
          )
      }
      schedule()
    } catch {
      if (owns(op))
        publish({
          status: 'recovery-error',
          message: restoring
            ? '账号已重新验证，但新凭据保存失败。请重试保存；旧凭据可能已失效。'
            : '账号凭据保存失败，请重试保存或退出此 App。'
        })
    }
  }
  function errorState(op: Operation, error: unknown, restoring: boolean) {
    if (!owns(op)) return
    const kind = error instanceof AccountError ? error.kind : 'network'
    publish({
      status:
        kind === 'cancelled'
          ? 'signed-out'
          : kind === 'expired'
            ? 'expired'
            : restoring
              ? 'recovery-error'
              : 'login-error',
      message: errors[kind]
    })
  }
  async function login() {
    if (
      configuration.status !== 'ready' ||
      logoutFailed ||
      ['restoring', 'recovery-error', 'logging-out'].includes(snapshot.status)
    )
      return
    const config = configuration.config
    const op = invalidate()
    publish({ status: 'authorizing' })
    try {
      const value = await deps.oidc.login(config, op.signal, now)
      if (owns(op)) await commit(op, value, false)
    } catch (error) {
      errorState(op, error, false)
    }
  }
  async function restore() {
    if (
      configuration.status !== 'ready' ||
      logoutFailed ||
      ['logging-out', 'authorizing', 'restoring'].includes(snapshot.status)
    )
      return
    // A rotated credential awaiting persistence must never trigger a second refresh.
    if (candidate) {
      const op = {
        generation,
        binding: accountConfigBinding(configuration.config),
        signal: abortController.signal
      }
      publish({ status: 'restoring' })
      await commit(op, candidate, true)
      return
    }
    const config = configuration.config
    const op = invalidate()
    publish({ status: 'restoring' })
    let record: AccountRecovery | null
    try {
      record = await enqueue(() => deps.store.read())
    } catch {
      if (owns(op))
        publish({
          status: 'recovery-error',
          message: '无法读取此 App 的安全账号记录，请重试恢复或退出清除。'
        })
      return
    }
    if (!owns(op)) return
    if (record === null) {
      publish({ status: 'signed-out' })
      return
    }
    try {
      const value = await deps.oidc.restore(config, record, op.signal, now)
      if (owns(op)) await commit(op, value, true)
    } catch (error) {
      errorState(op, error, true)
    }
  }
  async function logout() {
    const op = invalidate()
    // Also gate attempts while delete is pending or has failed.
    logoutFailed = true
    publish({ status: 'logging-out' })
    try {
      await enqueue(() => deps.store.remove())
    } catch {
      if (op.generation === generation)
        publish({
          status: 'logout-error',
          message: '本机凭据未能清除，重启后可能恢复，请重试退出。'
        })
      return
    }
    if (op.generation !== generation) return
    logoutFailed = false
    publish({ ...initial(), message: '已退出此 App。浏览器会话与已配对电脑的权限保持独立。' })
  }
  return {
    login,
    restore,
    logout,
    checkExpiry,
    configure(value: PlatformAccountConfiguration) {
      const prior =
        configuration.status === 'ready'
          ? accountConfigBinding(configuration.config)
          : configuration.status
      const next = value.status === 'ready' ? accountConfigBinding(value.config) : value.status
      if (prior === next) return
      invalidate()
      configuration = value
      publish(
        logoutFailed
          ? { status: 'logout-error', message: '本机凭据未能清除，重启后可能恢复，请重试退出。' }
          : initial()
      )
    },
    stop() {
      invalidate()
      publish(
        logoutFailed
          ? { status: 'logout-error', message: '本机凭据未能清除，重启后可能恢复，请重试退出。' }
          : initial()
      )
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

export const platformAccountController = createPlatformAccountController({
  configuration: readPlatformAccountConfig(Constants.expoConfig, Platform.OS),
  store: platformAccountStore,
  oidc: platformAccountOidc
})
export function usePlatformAccount(): AccountSnapshot {
  return useSyncExternalStore(
    platformAccountController.subscribe,
    platformAccountController.getSnapshot
  )
}
export function startPlatformAccount(): () => void {
  void platformAccountController.restore()
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') platformAccountController.checkExpiry()
  })
  return () => {
    sub.remove()
    platformAccountController.stop()
  }
}
