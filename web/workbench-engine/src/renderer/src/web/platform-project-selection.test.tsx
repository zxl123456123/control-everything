// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import PlatformNavigation from './platform-project-navigation-view'

const fixture = vi.hoisted(() => ({ state: {} as Record<string, any>, activate: vi.fn() }))
vi.mock('../store', () => ({
  useAppStore: Object.assign((select: (state: any) => unknown) => select(fixture.state), {
    getState: () => fixture.state
  })
}))
vi.mock('../store/workspace-record-selectors', () => ({
  selectWorktreesByRepo: (state: any) => state.worktrees
}))
vi.mock('../lib/worktree-activation', () => ({ activateAndRevealWorktree: fixture.activate }))
const data = {
  project: { id: 'p-one', name: 'One' },
  runtime: { environmentId: 'env-a' },
  target: { repoId: 'repo-a' }
} as PlatformProjectBootstrap
const projects = [{ id: 'p-one', name: 'One', directory: 'C:/example/navigation-one' }]
beforeEach(() => {
  fixture.state = {
    hydrationSucceeded: true,
    terminalStartupRestorationReady: true,
    startupWorktreeRefreshCompleted: true,
    repos: [{ id: 'repo-a', path: 'C:/example/navigation-one', executionHostId: 'runtime:env-a' }],
    worktrees: {
      a: [
        { id: 'main', repoId: 'repo-a', runtimeOwnerEnvironmentId: 'env-a', isMainWorktree: true }
      ]
    },
    activeWorktreeId: 'main',
    runtimeStatusByEnvironmentId: new Map([
      ['env-a', { snapshot: { verification: 'verified', transport: 'ready' } }]
    ]),
    fetchRepos: vi.fn().mockResolvedValue(undefined),
    fetchWorktrees: vi.fn().mockResolvedValue(true)
  }
  fixture.activate.mockImplementation((id) => {
    fixture.state.activeWorktreeId = id
    return { primaryTabId: null }
  })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('clears the business project for a folder or missing worktree and restores an explicitly reselected target', () => {
  const selected = vi.fn()
  const ui = (target = data, active = true) => (
    <PlatformNavigation data={target} projects={projects} active={active} onSelection={selected} />
  )
  const { rerender } = render(ui())
  expect(selected).toHaveBeenLastCalledWith('p-one')
  for (const id of ['folder:unregistered', 'removed-worktree']) {
    fixture.state.activeWorktreeId = id
    rerender(ui())
    expect(selected).toHaveBeenLastCalledWith(null)
  }
  rerender(ui(data, false))
  rerender(ui({ ...data }))
  expect(fixture.state.activeWorktreeId).toBe('main')
  expect(selected).toHaveBeenLastCalledWith('p-one')
})

it('refreshes the correct host catalog for a newly registered project without replacing the runtime API', async () => {
  const target = { ...data, target: { repoId: 'repo-new' } }
  render(<PlatformNavigation data={target} projects={projects} active onSelection={() => {}} />)
  await waitFor(() =>
    expect(fixture.state.fetchWorktrees).toHaveBeenCalledWith('repo-new', {
      executionHostId: 'runtime:env-a'
    })
  )
  expect(fixture.state.fetchRepos).toHaveBeenCalledWith({
    runtimeEnvironmentId: 'env-a',
    throwOnError: true
  })
})
