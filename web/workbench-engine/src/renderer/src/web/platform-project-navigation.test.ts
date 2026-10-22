import { describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../shared/worktree/types'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import {
  choosePlatformWorktree,
  createPlatformProjectNavigator
} from './platform-project-navigation'

const data: PlatformProjectBootstrap = {
  project: { id: 'fixture', name: 'Fixture' },
  runtime: {
    environmentId: 'env-a',
    offer: {
      v: 2,
      endpoint: 'ws://127.0.0.1:1234',
      deviceToken: 'fixture',
      publicKeyB64: 'fixture',
      scope: 'runtime'
    }
  },
  target: { repoId: 'repo-a' },
  returnUrl: '/studio#project/fixture'
}
const row = (id: string, fields: Partial<Worktree> = {}): Worktree =>
  ({
    id,
    repoId: 'repo-a',
    runtimeOwnerEnvironmentId: 'env-a',
    hostId: 'local',
    isMainWorktree: false,
    ...fields
  }) as Worktree

describe('platform initial project navigation', () => {
  it('resumes a real selected worktree from the same repo and paired host', () => {
    const main = row('main', { isMainWorktree: true }),
      active = row('active')
    expect(choosePlatformWorktree([main, active], data, 'active')).toBe(active)
    expect(choosePlatformWorktree([main, active], data, 'missing')).toBe(main)
    expect(
      choosePlatformWorktree(
        [row('foreign', { runtimeOwnerEnvironmentId: 'env-b' })],
        data,
        'foreign'
      )
    ).toBeNull()
  })

  it('does not reuse a recreated instance or a prunable/retiring worktree', () => {
    const target = {
      ...data,
      target: { repoId: 'repo-a', worktreeId: 'same-path', instanceId: 'old' }
    }
    expect(
      choosePlatformWorktree([row('same-path', { instanceId: 'new' })], target, null)
    ).toBeNull()
    expect(
      choosePlatformWorktree(
        [row('removed', { removing: true }), row('pruned', { prunable: true })],
        data,
        null
      )
    ).toBeNull()
  })

  it('waits for hydration and real catalog, then navigates only once', () => {
    const activate = vi.fn(() => ({ primaryTabId: null }))
    const navigate = createPlatformProjectNavigator(data, activate)
    const state = { ready: false, hasRepo: true, worktrees: [row('first')], activeWorktreeId: null }
    navigate(state)
    expect(activate).not.toHaveBeenCalled()
    navigate({ ...state, ready: true, worktrees: [] })
    expect(activate).not.toHaveBeenCalled()
    navigate({ ...state, ready: true })
    expect(activate).toHaveBeenCalledWith('first', { executionHostId: 'runtime:env-a' })
    navigate({
      ...state,
      ready: true,
      worktrees: [row('new-user-selection')],
      activeWorktreeId: 'new-user-selection'
    })
    expect(activate).toHaveBeenCalledOnce()
  })
})
