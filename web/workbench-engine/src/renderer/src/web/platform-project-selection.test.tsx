import { createElement } from 'react'
import { useVisibleSidebarWorktrees } from '../components/sidebar/worktree-list/listing/use-visible-worktrees'
// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import PlatformNavigation from './platform-project-navigation-view'
import {
  PlatformProjectScopeContext,
  filterPlatformProjectRepos,
  isPlatformProjectPathVisible
} from './platform-project-context'
import type { Repo } from '../../../shared/repo-types'

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
    openModal: vi.fn(),
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

it.each([false, true])(
  'waits for the clicked project and respects navigation away: %s',
  (navigateAway) => {
    window.history.replaceState(null, '', '/studio#project/p-one/workspace')
    const second = { id: 'p-two', name: 'Two', directory: 'C:/example/navigation-two' }
    fixture.state.repos.push({
      id: 'repo-b',
      displayName: 'Two',
      path: second.directory,
      executionHostId: 'runtime:env-a'
    })
    fixture.state.worktrees.b = [
      {
        id: 'second-main',
        repoId: 'repo-b',
        runtimeOwnerEnvironmentId: 'env-a',
        isMainWorktree: true
      }
    ]
    const secondData = {
      ...data,
      project: { id: 'p-two', name: 'Two' },
      target: { repoId: 'repo-b' }
    }
    const allProjects = [...projects, second]
    const ui = (target: PlatformProjectBootstrap, canCreateWorkspace: boolean) => (
      <PlatformNavigation
        data={target}
        projects={allProjects}
        active
        canCreateWorkspace={canCreateWorkspace}
        onSelection={() => {}}
      />
    )
    const { rerender } = render(ui(data, true))
    act(() =>
      window.dispatchEvent(
        new CustomEvent('platform-create-workspace', {
          detail: { repoId: 'repo-b', executionHostId: 'runtime:env-a' }
        })
      )
    )
    expect(window.location.hash).toBe('#project/p-two/workspace')
    expect(fixture.state.openModal).not.toHaveBeenCalled()
    rerender(ui(data, false))
    expect(fixture.state.openModal).not.toHaveBeenCalled()
    if (navigateAway) {
      act(() => {
        window.history.replaceState(null, '', '/studio#home')
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      })
      window.history.replaceState(null, '', '/studio#project/p-two/workspace')
    }
    rerender(ui(secondData, true))
    if (navigateAway) {
      expect(fixture.state.openModal).not.toHaveBeenCalled()
      return
    }
    expect(fixture.state.openModal).toHaveBeenCalledExactlyOnceWith('new-workspace-composer', {
      initialRepoId: 'repo-b',
      telemetrySource: 'sidebar'
    })
  }
)

it('does not reinterpret a clicked row from another host as the local project', () => {
  window.history.replaceState(null, '', '/studio#project/p-one/workspace')
  render(
    <PlatformNavigation
      data={data}
      projects={projects}
      active
      canCreateWorkspace
      onSelection={() => {}}
    />
  )
  act(() =>
    window.dispatchEvent(
      new CustomEvent('platform-create-workspace', {
        detail: { repoId: 'repo-a', executionHostId: 'runtime:other-host' }
      })
    )
  )
  expect(fixture.state.openModal).not.toHaveBeenCalled()
  expect(window.location.hash).toBe('#project/p-one/workspace')
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

it('projects only active registered directories on their runtime host and restores without deleting native records', () => {
  const active = fixture.state.repos[0] as Repo
  const archived = { ...active, id: 'archived', path: 'C:/example/archived' }
  const twin = { ...active, executionHostId: 'runtime:other' } as Repo
  const all = [active, archived, twin]
  const scope = { projects, executionHostId: 'runtime:env-a' as const }
  expect(filterPlatformProjectRepos(all, scope)).toEqual([active])
  expect(filterPlatformProjectRepos(all, { ...scope, projects: [] })).toEqual([])
  expect(filterPlatformProjectRepos(all, undefined)).toBe(all)
  expect(
    filterPlatformProjectRepos(all, {
      ...scope,
      projects: [...projects, { id: 'p-archived', name: 'Archived', directory: archived.path }]
    })
  ).toEqual([active, archived])
  expect(all).toEqual([active, archived, twin])
  expect(
    isPlatformProjectPathVisible('C:/example/navigation-one/sub', 'runtime:env-a', scope)
  ).toBe(false)
  expect(
    isPlatformProjectPathVisible('C:/example/navigation-one-extra', 'runtime:env-a', scope)
  ).toBe(false)
  expect(isPlatformProjectPathVisible(active.path, 'runtime:other', scope)).toBe(false)
})

it('filters the store-backed worktree stream before grouping, including a forced archived agent target', () => {
  const archived = {
    ...fixture.state.repos[0],
    id: 'archived',
    path: 'C:/example/navigation-one/archived'
  }
  fixture.state.worktrees.b = [
    { id: 'hidden', repoId: 'archived', runtimeOwnerEnvironmentId: 'env-a' }
  ]
  fixture.state.worktrees.other = [
    { id: 'twin', repoId: 'repo-a', runtimeOwnerEnvironmentId: 'other' }
  ]
  const native = fixture.state.worktrees
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(
      PlatformProjectScopeContext.Provider,
      { value: { projects, executionHostId: 'runtime:env-a' } },
      children
    )
  const { result, rerender } = renderHook(
    ({ rows }: { rows: Repo[] }) =>
      useVisibleSidebarWorktrees({
        filterState: { showSleepingWorkspaces: true, filterRepoIds: new Set() } as any,
        sortBy: 'manual',
        sortedIds: ['main', 'hidden', 'twin'],
        repoMap: new Map(rows.map((row) => [row.id, row])),
        worktreeLineageById: {},
        defaultHostId: 'runtime:env-a',
        agentSendTargetWorktreeId: 'hidden'
      }),
    { wrapper, initialProps: { rows: [fixture.state.repos[0]] } }
  )
  expect(result.current.visibleWorktrees.map((row) => row.id)).toEqual(['main'])
  rerender({ rows: [] })
  expect(result.current.visibleWorktrees).toEqual([])
  rerender({ rows: [fixture.state.repos[0], archived] })
  expect(result.current.visibleWorktrees.map((row) => row.id)).toEqual(['main', 'hidden'])
  expect(fixture.state.worktrees).toBe(native)
  expect(native.b[0].id).toBe('hidden')
})
