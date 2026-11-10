import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from './store-test-helpers'
import type { Repo } from '../../../../shared/repo-types'
import { isPlatformProjectActionMode, preparePlatformProjectRename, capturePlatformProjectActionGuard } from '@/web/platform-project-actions'
import { toast } from 'sonner'
const platform = { mode: vi.mocked(isPlatformProjectActionMode), prepare: vi.mocked(preparePlatformProjectRename),
  capture: vi.mocked(capturePlatformProjectActionGuard), error: vi.mocked(toast.error) }

export function registerReposUpdateSerializationTests(): void {
  const localRepo: Repo = {
    id: 'local-repo',
    path: '/local',
    displayName: 'Local',
    badgeColor: '#000',
    addedAt: 1
  }

  const secondRepo: Repo = {
    id: 'second-repo',
    path: '/second',
    displayName: 'Second',
    badgeColor: '#111',
    addedAt: 2
  }

  const reposUpdate = vi.fn()

  function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  beforeEach(() => {
    reposUpdate.mockReset()
    platform.mode.mockReturnValue(false)
    platform.prepare.mockReset()
    platform.capture.mockReset().mockReturnValue(() => undefined)
    platform.error.mockClear()
    vi.stubGlobal('window', {
      api: {
        repos: {
          update: reposUpdate
        }
      }
    })
  })

  describe('repo update serialization', () => {
    it('keeps platform prepare, native echo and confirmation inside the original name queue', async () => {
      platform.mode.mockReturnValue(true)
      const confirmed = deferred<void>()
      const firstConfirm = vi.fn(() => {
        expect(store.getState().repos[0]?.displayName).toBe('First')
        return confirmed.promise
      })
      const firstPrepared = { confirm: firstConfirm, cancel: vi.fn(), assertCurrent: vi.fn() }
      const secondPrepared = { confirm: vi.fn(async () => undefined), cancel: vi.fn(), assertCurrent: vi.fn() }
      platform.prepare.mockResolvedValueOnce(firstPrepared).mockResolvedValueOnce(secondPrepared)
      reposUpdate.mockResolvedValue(undefined)
      const store = createTestStore()
      store.setState({ repos: [localRepo] })
      const first = store.getState().updateRepo(localRepo.id, { displayName: 'First' })
      const second = store.getState().updateRepo(localRepo.id, { displayName: 'Second' })
      expect(platform.prepare).toHaveBeenCalledTimes(1)
      await vi.waitFor(() => expect(firstConfirm).toHaveBeenCalledOnce())
      expect(reposUpdate).toHaveBeenCalledTimes(1)
      expect(platform.prepare).toHaveBeenCalledTimes(1)
      confirmed.resolve()
      await expect(Promise.all([first, second])).resolves.toEqual([true, true])
      expect(store.getState().repos[0]?.displayName).toBe('Second')
      expect(firstPrepared.cancel).toHaveBeenCalledOnce()
      expect(secondPrepared.cancel).toHaveBeenCalledOnce()
    })

    it('cancels platform preparation on native failure and reports partial success', async () => {
      platform.mode.mockReturnValue(true)
      const prepared = { confirm: vi.fn(), cancel: vi.fn(), assertCurrent: vi.fn() }
      platform.prepare.mockResolvedValue(prepared)
      reposUpdate.mockRejectedValue(new Error('native update failed'))
      const store = createTestStore()
      store.setState({ repos: [localRepo] })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try { await expect(store.getState().updateRepo(localRepo.id, { displayName: 'Renamed' })).resolves.toBe(false) }
      finally { errorSpy.mockRestore() }
      expect(prepared.cancel).toHaveBeenCalledOnce()
      expect(prepared.confirm).not.toHaveBeenCalled()
      expect(store.getState().repos[0]?.displayName).toBe('Local')
      expect(platform.error.mock.calls[0][0]).toContain('项目名称已保存')
    })

    it('does not rebind a queued old name to a replacement runtime', async () => {
      platform.mode.mockReturnValue(true)
      let epoch = 1
      platform.capture.mockImplementation(() => {
        const captured = epoch
        return () => { if (epoch !== captured) throw Error('runtime changed') }
      })
      platform.prepare.mockResolvedValue({ confirm: async () => { epoch++ }, cancel: vi.fn(), assertCurrent: vi.fn() })
      reposUpdate.mockResolvedValue(undefined)
      const store = createTestStore()
      store.setState({ repos: [localRepo] })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try {
        const first = store.getState().updateRepo(localRepo.id, { displayName: 'First' })
        const oldQueued = store.getState().updateRepo(localRepo.id, { displayName: 'Old queued' })
        await expect(Promise.all([first, oldQueued])).resolves.toEqual([true, false])
      } finally { errorSpy.mockRestore() }
      expect(platform.prepare).toHaveBeenCalledTimes(1)
      expect(reposUpdate).toHaveBeenCalledTimes(1)
      expect(store.getState().repos[0]?.displayName).toBe('First')
    })
    it('refuses a native echo after the prepared connection changes', async () => {
      platform.mode.mockReturnValue(true)
      const prepared = { confirm: vi.fn(), cancel: vi.fn(), assertCurrent: vi.fn()
        .mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw Error('connection changed') }) }
      platform.prepare.mockResolvedValue(prepared)
      reposUpdate.mockResolvedValue(undefined)
      const store = createTestStore()
      store.setState({ repos:[localRepo] })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try { await expect(store.getState().updateRepo(localRepo.id, {displayName:'Late'})).resolves.toBe(false) }
      finally { errorSpy.mockRestore() }
      expect(store.getState().repos[0]?.displayName).toBe('Local')
      expect(prepared.confirm).not.toHaveBeenCalled()
      expect(prepared.cancel).toHaveBeenCalledOnce()
    })

    it('serializes local repo updates for the same repo before applying state', async () => {
      const firstUpdate = deferred<void>()
      const secondUpdate = deferred<void>()
      const firstHookSettings: NonNullable<Repo['hookSettings']> = {
        mode: 'override',
        setupRunPolicy: 'ask',
        commandSourcePolicy: 'local-only',
        scripts: { setup: 'first setup', archive: '' }
      }
      const secondHookSettings: NonNullable<Repo['hookSettings']> = {
        mode: 'override',
        setupRunPolicy: 'skip-by-default',
        commandSourcePolicy: 'run-both',
        scripts: { setup: 'second setup', archive: 'second archive' }
      }
      reposUpdate.mockImplementationOnce(() => firstUpdate.promise)
      reposUpdate.mockImplementationOnce(() => secondUpdate.promise)
      const store = createTestStore()
      store.setState({ repos: [localRepo] })

      const first = store.getState().updateRepo(localRepo.id, { hookSettings: firstHookSettings })
      const second = store.getState().updateRepo(localRepo.id, { hookSettings: secondHookSettings })

      expect(reposUpdate).toHaveBeenCalledTimes(1)
      expect(store.getState().repos[0]?.hookSettings).toBeUndefined()

      firstUpdate.resolve()
      await first
      await Promise.resolve()

      expect(reposUpdate).toHaveBeenCalledTimes(2)
      expect(store.getState().repos[0]?.hookSettings).toEqual(firstHookSettings)

      secondUpdate.resolve()
      await second

      expect(store.getState().repos[0]?.hookSettings).toEqual(secondHookSettings)
    })

    it('does not serialize updates for different repos', async () => {
      const slowLocalUpdate = deferred<void>()
      reposUpdate.mockImplementationOnce(() => slowLocalUpdate.promise)
      reposUpdate.mockResolvedValueOnce(undefined)
      const store = createTestStore()
      store.setState({ repos: [localRepo, secondRepo] })

      const local = store.getState().updateRepo(localRepo.id, { displayName: 'Local slow' })
      const second = store.getState().updateRepo(secondRepo.id, { displayName: 'Second fast' })

      expect(reposUpdate).toHaveBeenCalledTimes(2)
      await second
      expect(store.getState().repos.find((repo) => repo.id === secondRepo.id)?.displayName).toBe(
        'Second fast'
      )
      expect(store.getState().repos.find((repo) => repo.id === localRepo.id)?.displayName).toBe(
        'Local'
      )

      slowLocalUpdate.resolve()
      await local

      expect(store.getState().repos.find((repo) => repo.id === localRepo.id)?.displayName).toBe(
        'Local slow'
      )
    })

    it('runs same-ID updates on different hosts independently', async () => {
      const slowLocalUpdate = deferred<void>()
      reposUpdate.mockImplementationOnce(() => slowLocalUpdate.promise)
      reposUpdate.mockResolvedValueOnce(undefined)
      const sshRepo: Repo = {
        ...localRepo,
        path: '/ssh/repo',
        displayName: 'SSH',
        executionHostId: 'ssh:connection-1'
      }
      const store = createTestStore()
      store.setState({ repos: [localRepo, sshRepo] })

      const local = store
        .getState()
        .updateRepo(localRepo.id, { displayName: 'Local slow' }, { hostId: 'local' })
      const ssh = store
        .getState()
        .updateRepo(sshRepo.id, { displayName: 'SSH fast' }, { hostId: 'ssh:connection-1' })

      expect(reposUpdate).toHaveBeenCalledTimes(2)
      await ssh
      expect(store.getState().repos).toEqual([localRepo, { ...sshRepo, displayName: 'SSH fast' }])

      slowLocalUpdate.resolve()
      await local
      expect(store.getState().repos).toEqual([
        { ...localRepo, displayName: 'Local slow' },
        { ...sshRepo, displayName: 'SSH fast' }
      ])
      expect(reposUpdate).toHaveBeenNthCalledWith(1, {
        repoId: localRepo.id,
        updates: { displayName: 'Local slow' },
        hostId: 'local'
      })
      expect(reposUpdate).toHaveBeenNthCalledWith(2, {
        repoId: sshRepo.id,
        updates: { displayName: 'SSH fast' },
        hostId: 'ssh:connection-1'
      })
    })

    it('continues a repo update chain after a failed update', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try {
        reposUpdate.mockRejectedValueOnce(new Error('update failed'))
        reposUpdate.mockResolvedValueOnce(undefined)
        const store = createTestStore()
        store.setState({ repos: [localRepo] })

        const failed = store.getState().updateRepo(localRepo.id, { displayName: 'Failed' })
        const recovered = store.getState().updateRepo(localRepo.id, { displayName: 'Recovered' })

        await expect(Promise.all([failed, recovered])).resolves.toEqual([false, true])

        expect(reposUpdate).toHaveBeenCalledTimes(2)
        expect(store.getState().repos[0]?.displayName).toBe('Recovered')
      } finally {
        errorSpy.mockRestore()
      }
    })

    it('clears nullable fallback fields when local IPC returns no authoritative repo', async () => {
      reposUpdate.mockResolvedValueOnce(undefined)
      const repo: Repo = {
        ...localRepo,
        externalWorktreeVisibility: 'show',
        agentWorktreeVisibility: 'hide',
        sourceControlAi: {},
        externalWorktreeDiscoverySuppressedAt: 123
      }
      const store = createTestStore()
      store.setState({ repos: [repo] })

      await store.getState().updateRepo(repo.id, {
        externalWorktreeVisibility: null,
        agentWorktreeVisibility: null,
        sourceControlAi: null,
        externalWorktreeDiscoverySuppressedAt: null
      })

      expect(reposUpdate).toHaveBeenCalledWith({
        repoId: repo.id,
        updates: {
          externalWorktreeVisibility: null,
          agentWorktreeVisibility: null,
          sourceControlAi: null,
          externalWorktreeDiscoverySuppressedAt: null
        }
      })
      expect(store.getState().repos[0]).toMatchObject({
        externalWorktreeVisibilityLegacy: false
      })
      expect(store.getState().repos[0]?.externalWorktreeVisibility).toBeUndefined()
      expect(store.getState().repos[0]?.agentWorktreeVisibility).toBeUndefined()
      expect(store.getState().repos[0]?.sourceControlAi).toBeUndefined()
      expect(store.getState().repos[0]?.externalWorktreeDiscoverySuppressedAt).toBeUndefined()
    })

    it('does not apply repo icons that fail shared sanitization', async () => {
      reposUpdate.mockResolvedValueOnce(undefined)
      const store = createTestStore()
      store.setState({ repos: [localRepo] })

      await store.getState().updateRepo(localRepo.id, {
        repoIcon: {
          type: 'image',
          source: 'upload',
          src: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
        } as never
      })

      expect(reposUpdate).toHaveBeenCalledWith({ repoId: localRepo.id, updates: {} })
      expect(store.getState().repos[0]?.repoIcon).toBeUndefined()
    })
  })
}
