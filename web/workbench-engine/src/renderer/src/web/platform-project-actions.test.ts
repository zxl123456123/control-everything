// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../shared/repo-types'

const session = vi.hoisted(() => ({
  state: { activeEnvironment: { id: 'env-1', createdAt: 1, pairingRevision: 2, runtimeId: 'runtime-1' },
    activeClient: { connectionEpoch: 1 }, activeClientEnvironmentId: 'env-1' },
  disconnected: new Set<string>(), inactive: undefined as (() => void) | undefined,
  active: true
}))
vi.mock('./remote-context', () => ({
  assertContextActive: () => { if (!session.active) throw Error('inactive') },
  onContextInactive: (callback: () => void) => { session.inactive = callback; return () => { session.inactive = undefined } }
}))
import { archivePlatformProject, preparePlatformProjectRename, setPlatformProjectActionHost } from './platform-project-actions'
const runtime = { webRuntimeState: session.state, manuallyDisconnectedEnvironmentIds: session.disconnected } as unknown as
  NonNullable<Parameters<typeof setPlatformProjectActionHost>[1]>

const repo: Repo = { id: 'repo-1', path: 'C:/example/project', displayName: 'Example',
  executionHostId: 'runtime:env-1', connectionId: null, badgeColor: '#000', addedAt: 1 }
const listeners: EventListener[] = []
function receive(callback: (detail: any) => void) {
  const listener: EventListener = event => callback((event as CustomEvent).detail)
  listeners.push(listener)
  window.addEventListener('platform-native-project-action', listener)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(ready => { resolve = ready })
  return { promise, resolve }
}
beforeEach(() => {
  window.history.replaceState(null, '', '/studio')
  session.state.activeEnvironment = { id: 'env-1', createdAt: 1, pairingRevision: 2, runtimeId: 'runtime-1' }
  session.state.activeClient = { connectionEpoch: 1 }
  session.state.activeClientEnvironmentId = 'env-1'
  session.disconnected.clear()
  session.active = true
  setPlatformProjectActionHost('runtime:env-1', runtime)
})
afterEach(() => {
  setPlatformProjectActionHost(null)
  for (const listener of listeners.splice(0)) window.removeEventListener('platform-native-project-action', listener)
  vi.useRealTimers()
})
describe('platform project actions', () => {
  it('prepares a name once and confirms only after its caller has synchronized native state', async () => {
    const confirm = vi.fn(async () => undefined)
    let detail: any
    receive(value => { detail = value; value.waitUntil(Promise.resolve(confirm)) })
    const prepared = await preparePlatformProjectRename(repo, 'Renamed')
    expect(confirm).not.toHaveBeenCalled()
    expect(detail).toMatchObject({ action: 'rename', repoId: repo.id, directory: repo.path,
      executionHostId: repo.executionHostId, name: 'Renamed' })
    expect(detail.signal.aborted).toBe(false)
    await prepared.confirm()
    expect(confirm).toHaveBeenCalledOnce()
    expect(detail.signal.aborted).toBe(true)
  })
  it('archives through the platform only and retires its signal after confirmation', async () => {
    let detail: any
    receive(value => { detail = value; value.waitUntil(Promise.resolve()) })
    await archivePlatformProject(repo)
    expect(detail.action).toBe('archive')
    expect(detail).not.toHaveProperty('name')
    expect(detail.signal.aborted).toBe(true)
  })
  it('preserves the existing safe managed-project reason instead of replacing it with a generic error', async () => {
    receive(detail => detail.waitUntil(Promise.reject(Object.assign(Error('已有托管任务，暂不能归档。'), { reason:'native_managed_project' }))))
    await expect(archivePlatformProject(repo)).rejects.toMatchObject({
      message:'已有托管任务，暂不能归档。', reason:'native_managed_project'
    })
  })
  it('refuses a missing trusted host, foreign host or SSH namespace before sending any event', async () => {
    const received = vi.fn()
    receive(received)
    setPlatformProjectActionHost(null)
    await expect(archivePlatformProject(repo)).rejects.toThrow('尚未确认')
    setPlatformProjectActionHost('runtime:env-1', runtime)
    for (const value of [{ ...repo, executionHostId: 'runtime:foreign' as const }, { ...repo, connectionId: 'ssh-target' }]) {
      await expect(archivePlatformProject(value)).rejects.toThrow('尚未确认')
    }
    expect(received).not.toHaveBeenCalled()
  })
  it('fails closed when a host was installed without its trusted runtime session', async () => {
    setPlatformProjectActionHost('runtime:env-1')
    await expect(archivePlatformProject(repo)).rejects.toThrow('尚未确认')
  })
  it.each(['environment', 'pairing', 'runtime', 'client', 'epoch', 'disconnect', 'owned-host'])('rejects a late prepare after %s changes', async kind => {
    const reply = deferred<() => Promise<void>>()
    let signal!: AbortSignal
    receive(value => { signal = value.signal; value.waitUntil(reply.promise) })
    const preparing = preparePlatformProjectRename(repo, 'Renamed')
    if (kind === 'environment') session.state.activeEnvironment.id = 'foreign'
    if (kind === 'pairing') session.state.activeEnvironment.pairingRevision++
    if (kind === 'runtime') session.state.activeEnvironment.runtimeId = 'runtime-other'
    if (kind === 'client') session.state.activeClient = { connectionEpoch: 1 }
    if (kind === 'epoch') session.state.activeClient.connectionEpoch++
    if (kind === 'disconnect') session.disconnected.add('env-1')
    if (kind === 'owned-host') setPlatformProjectActionHost('runtime:foreign')
    reply.resolve(async () => undefined)
    await expect(preparing).rejects.toThrow(/保存未确认|已变化/)
    expect(signal.aborted).toBe(true)
  })
  it('cancels a prepared rename after native RPC failure so Studio can release its busy lock', async () => {
    const busy = new Set<string>()
    receive(detail => {
      busy.add(detail.repoId)
      detail.signal.addEventListener('abort', () => busy.delete(detail.repoId), { once:true })
      detail.waitUntil(Promise.resolve(async () => undefined))
    })
    const prepared = await preparePlatformProjectRename(repo, 'Renamed')
    expect(busy.size).toBe(1)
    prepared.cancel()
    expect(busy.size).toBe(0)
    expect(() => prepared.assertCurrent()).toThrow('已变化')
  })
  it('does not queue archive behind a pending rename', async () => {
    const busy = new Set<string>()
    receive(detail => {
      if (busy.has(detail.repoId)) { detail.waitUntil(Promise.reject(Error('项目正在保存，请稍后重试。'))); return }
      busy.add(detail.repoId)
      detail.signal.addEventListener('abort', () => busy.delete(detail.repoId), { once:true })
      detail.waitUntil(Promise.resolve(async () => undefined))
    })
    const prepared = await preparePlatformProjectRename(repo, 'Renamed')
    await expect(archivePlatformProject(repo)).rejects.toThrow('项目正在保存')
    expect(busy.size).toBe(1)
    prepared.cancel()
    expect(busy.size).toBe(0)
  })
  it('times out and aborts the same signal supplied to Studio', async () => {
    vi.useFakeTimers()
    let signal!: AbortSignal
    receive(detail => { signal = detail.signal; detail.waitUntil(new Promise(() => {})) })
    const request = expect(preparePlatformProjectRename(repo, 'Renamed')).rejects.toThrow('保存未确认')
    await vi.advanceTimersByTimeAsync(30_000)
    await request
    expect(signal.aborted).toBe(true)
  })
  it('uses that same timeout while waiting for post-RPC list confirmation', async () => {
    vi.useFakeTimers()
    let signal!: AbortSignal
    receive(detail => {
      signal = detail.signal
      detail.waitUntil(Promise.resolve(() => new Promise<void>(() => {})))
    })
    const prepared = await preparePlatformProjectRename(repo, 'Renamed')
    const confirming = expect(prepared.confirm()).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(30_000)
    await confirming
    expect(signal.aborted).toBe(true)
  })
  it('retires pending confirmation when the page context becomes inactive', async () => {
    let signal!: AbortSignal
    receive(detail => { signal = detail.signal; detail.waitUntil(Promise.resolve(async () => undefined)) })
    const prepared = await preparePlatformProjectRename(repo, 'Renamed')
    session.active = false
    session.inactive?.()
    expect(signal.aborted).toBe(true)
    await expect(prepared.confirm()).rejects.toThrow('inactive')
  })
  it('rejects an unconnected Studio action instead of invoking native removal', async () => {
    await expect(archivePlatformProject(repo)).rejects.toThrow('尚未连接')
  })
})
