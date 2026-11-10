import { describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  call: vi.fn().mockResolvedValue({ items: [], allRefs: true }),
  resolve: vi.fn().mockResolvedValue({ id: 'owner-worktree' })
}))
vi.mock('./web-runtime-calls', () => ({ callRuntimeResult: mocks.call }))
vi.mock('./web-runtime-worktree-catalog', () => ({
  resolveRuntimeWorktreeByPath: mocks.resolve,
  resolveRuntimeFilePath: vi.fn()
}))
vi.mock('./web-runtime-session', () => ({
  requireActiveEnvironment: vi.fn(),
  updateEnvironmentFromResponse: vi.fn()
}))
import { createGitApi } from './web-git-api'

describe('web repository graph transport', () => {
  it('forwards allRefs and the bounded limit through the actual web preload API', async () => {
    await createGitApi().history({ worktreePath: '/repo', allRefs: true, limit: 200 })
    expect(mocks.resolve).toHaveBeenCalledWith('/repo')
    expect(mocks.call).toHaveBeenCalledWith('git.history', {
      worktree: 'id:owner-worktree',
      limit: 200,
      baseRef: undefined,
      allRefs: true
    })
  })
})
