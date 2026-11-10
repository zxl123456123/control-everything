import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handlers,
  store,
  REPO_PATH,
  WORKTREE_FEATURE_PATH,
  resetFilesystemIpcMocks
} from './filesystem-test-harness'
const getHistory = vi.hoisted(() => vi.fn().mockResolvedValue({ items: [], allRefs: true }))
vi.mock('electron', async () => (await import('./filesystem-test-harness')).electronMock)
vi.mock('fs/promises', async () => (await import('./filesystem-test-harness')).fsPromisesMock)
vi.mock(
  '../wsl-unc-delete',
  async () => (await import('./filesystem-test-harness')).wslUncDeleteMock
)
vi.mock(
  '../crash-reporting/crash-breadcrumb-store',
  async () => (await import('./filesystem-test-harness')).crashBreadcrumbMock
)
vi.mock(
  '../git/status',
  async () => (await import('./filesystem-test-harness')).gitStatusModuleMock
)
vi.mock(
  '../git/check-ignored-paths',
  async () => (await import('./filesystem-test-harness')).gitIgnoredPathsMock
)
vi.mock('../git/worktree', async () => (await import('./filesystem-test-harness')).gitWorktreeMock)
vi.mock('../git/history', () => ({ getHistory }))
vi.mock('./local-worktree-runtime-options', () => ({
  getLocalGitOptionsForRegisteredWorktree: () => ({ wslDistro: 'Ubuntu' }),
  getLocalGitOptionsForRepo: () => ({}),
  getLocalRepoForRegisteredWorktree: () => undefined
}))
import { registerFilesystemHandlers } from './filesystem'
import {
  registerWorktreeRootsForRepo,
  invalidateAuthorizedRootsCache
} from './registered-worktree-roots-cache'
beforeEach(() => {
  resetFilesystemIpcMocks()
  invalidateAuthorizedRootsCache()
  getHistory.mockClear()
})
describe('repository graph IPC routing', () => {
  it('forwards graph options and keeps registered WSL execution options', async () => {
    registerWorktreeRootsForRepo(store as never, 'repo-1', [REPO_PATH, WORKTREE_FEATURE_PATH])
    registerFilesystemHandlers(store as never)
    await handlers.get('git:history')!(null, {
      worktreePath: WORKTREE_FEATURE_PATH,
      allRefs: true,
      limit: 200
    })
    expect(getHistory).toHaveBeenCalledWith(WORKTREE_FEATURE_PATH, {
      allRefs: true,
      limit: 200,
      baseRef: undefined,
      wslDistro: 'Ubuntu'
    })
  })
  it('rejects an unavailable remote host without reading a local repository', async () => {
    registerFilesystemHandlers(store as never)
    await expect(
      handlers.get('git:history')!(null, {
        worktreePath: '/remote/repo',
        connectionId: 'ssh-1',
        allRefs: true
      })
    ).rejects.toThrow('Remote connection dropped')
    expect(getHistory).not.toHaveBeenCalled()
  })
})
