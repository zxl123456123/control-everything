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
    repos: [
      {
        id: 'repo-a',
        displayName: 'One',
        path: 'C:/example/navigation-one',
        executionHostId: 'runtime:env-a'
      }
    ],
    worktrees: {
      a: [
        { id: 'main', repoId: 'repo-a', runtimeOwnerEnvironmentId: 'env-a', isMainWorktree: true }
      ]
    },
    activeWorktreeId: 'main',
    activeView: 'terminal',
    openActivityPage: vi.fn(() => {
      fixture.state.activeView = 'activity'
    }),
    closeActivityPage: vi.fn(() => {
      fixture.state.activeView = 'terminal'
    }),
    runtimeStatusByEnvironmentId: new Map([
      ['env-a', { snapshot: { verification: 'verified', transport: 'ready' } }]
    ]),
    fetchRepos: vi.fn().mockResolvedValue(undefined),
    fetchWorktrees: vi.fn().mockResolvedValue(true)
  }
  fixture.activate.mockImplementation((id) => {
    fixture.state.activeWorktreeId = id
    fixture.state.activeView = 'terminal'
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

it('does not retain a project association after the authoritative project list archives it', () => {
  const selected = vi.fn()
  const { rerender } = render(
    <PlatformNavigation data={data} projects={projects} active onSelection={selected} />
  )
  expect(selected).toHaveBeenLastCalledWith('p-one')
  rerender(<PlatformNavigation data={data} projects={[]} active onSelection={selected} />)
  expect(selected).toHaveBeenLastCalledWith(null)
})

it('refreshes existing native metadata when the platform name changes', async () => {
  render(
    <PlatformNavigation
      data={{ ...data, project: { ...data.project, name: 'Renamed' } }}
      projects={[{ ...projects[0], name: 'Renamed' }]}
      active
      onSelection={() => {}}
    />
  )
  await waitFor(() => expect(fixture.state.fetchRepos).toHaveBeenCalledTimes(1))
})

it('opens activity after hydration and activation, and returns to the existing terminal', () => {
  window.history.replaceState(null, '', '/studio#project/p-one/activity')
  fixture.state.hydrationSucceeded = false
  const ui = (surface: 'workspace' | 'activity') => (
    <PlatformNavigation
      data={data}
      projects={projects}
      active
      surface={surface}
      onSelection={() => {}}
    />
  )
  const { rerender } = render(ui('activity'))
  expect(fixture.state.openActivityPage).not.toHaveBeenCalled()
  fixture.state.hydrationSucceeded = true
  rerender(ui('activity'))
  expect(fixture.activate).toHaveBeenCalledWith('main', { executionHostId: 'runtime:env-a' })
  expect(fixture.state.openActivityPage).toHaveBeenCalledTimes(1)
  expect(fixture.activate.mock.invocationCallOrder[0]).toBeLessThan(
    fixture.state.openActivityPage.mock.invocationCallOrder[0]
  )
  window.history.replaceState(null, '', '/studio#project/p-one/workspace')
  rerender(ui('workspace'))
  expect(fixture.state.closeActivityPage).toHaveBeenCalledTimes(1)
  expect(fixture.state.activeWorktreeId).toBe('main')
  expect(fixture.state.activeView).toBe('terminal')
})

it('follows the native open-terminal action out of activity without reopening activity', () => {
  window.history.replaceState(null, '', '/studio#project/p-one/activity')
  const ui = () => (
    <PlatformNavigation
      data={data}
      projects={projects}
      active
      surface="activity"
      onSelection={() => {}}
    />
  )
  const { rerender } = render(ui())
  fixture.state.activeView = 'terminal'
  rerender(ui())
  expect(window.location.hash).toBe('#project/p-one/workspace')
  expect(fixture.state.openActivityPage).toHaveBeenCalledTimes(1)
})
