// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import type { Worktree } from '../../../shared/worktree/types'
import PlatformNavigation, { PlatformRuntimeNavigation } from './platform-project-navigation-view'

const fixture = vi.hoisted(() => ({ state: {} as Record<string, any>, activate: vi.fn() }))
vi.mock('../store', () => ({
  useAppStore: Object.assign((selector: (state: any) => unknown) => selector(fixture.state), {
    getState: () => fixture.state
  })
}))
vi.mock('../store/workspace-record-selectors', () => ({ selectWorktreesByRepo: (state: any) => state.worktrees }))
vi.mock('../lib/worktree-activation', () => ({ activateAndRevealWorktree: fixture.activate }))
const data = {
  project: { id: 'p-one', name: 'One' }, runtime: { environmentId: 'env-a' }, target: { repoId: 'repo-a' }
} as PlatformProjectBootstrap
const projects = [{ id: 'p-one', name: 'One', directory: 'C:/example/one' }]
const worktree = {
  id: 'main', repoId: 'repo-a', runtimeOwnerEnvironmentId: 'env-a', hostId: 'local',
  isMainWorktree: true, displayName: 'Main'
} as Worktree
beforeEach(() => {
  window.history.replaceState(null, '', '#project/p-one/workspace')
  fixture.activate.mockReset().mockReturnValue(false)
  fixture.state = {
    hydrationSucceeded: true, terminalStartupRestorationReady: true, startupWorktreeRefreshCompleted: true,
    repos: [{ id: 'repo-a', executionHostId: 'runtime:env-a', path: 'C:/example/one', displayName: 'One' }],
    worktrees: {}, activeWorktreeId: null, activeView: 'terminal',
    activeWorkspaceKey: null, activeWorkspaceExecutionHostId: null,
    runtimeStatusByEnvironmentId: new Map([['env-a', { snapshot: { verification: 'verified', transport: 'ready' } }]]),
    fetchRepos: vi.fn().mockResolvedValue(undefined), fetchWorktrees: vi.fn().mockResolvedValue(undefined),
    openSettingsPage: vi.fn(), closeSettingsPage: vi.fn(),
    setActiveView: vi.fn((view: string) => { fixture.state.activeView = view }),
    setActiveWorktree: vi.fn(() => Object.assign(fixture.state, {
      activeWorktreeId: null, activeWorkspaceKey: null, activeWorkspaceExecutionHostId: null, activePendingCreationId: null
    })),
    getKnownWorktreeById: vi.fn((id: string) => Object.values(fixture.state.worktrees).flat().find((row: any) => row.id === id))
  }
})

it('enters the native landing once after hydration without clearing tabs or jumping to the restored project', () => {
  window.history.replaceState(null, '', '#workbench')
  const tabs = { main: [{ id: 'editor', text: 'unsaved' }] }, session = { panes: ['pty-existing'] }
  fixture.state.unifiedTabsByWorktree = tabs
  fixture.state.workspaceSession = session
  fixture.state.worktrees = { 'repo-a': [worktree] }
  fixture.state.activeWorktreeId = 'main'
  fixture.state.activeWorkspaceExecutionHostId = 'runtime:env-a'
  fixture.state.hydrationSucceeded = false
  const onReady = vi.fn()
  const props = { data, projects, active: true, workbench: true, entryRevision: 1, onReady }
  const view = render(<PlatformRuntimeNavigation {...props} />)
  expect(fixture.state.setActiveWorktree).not.toHaveBeenCalled()
  fixture.state.hydrationSucceeded = true
  view.rerender(<PlatformRuntimeNavigation {...props} />)
  expect(fixture.state.setActiveWorktree).toHaveBeenCalledExactlyOnceWith(null)
  expect(fixture.state.setActiveView).toHaveBeenCalledWith('terminal')
  expect(fixture.state.unifiedTabsByWorktree).toBe(tabs)
  expect(fixture.state.workspaceSession).toBe(session)
  expect(window.location.hash).toBe('#workbench')
  view.rerender(<PlatformRuntimeNavigation {...props} />)
  expect(fixture.state.setActiveWorktree).toHaveBeenCalledOnce()
  expect(onReady).toHaveBeenLastCalledWith(1)
  fixture.state.activeWorktreeId = 'main'
  fixture.state.activeWorkspaceExecutionHostId = 'runtime:env-a'
  view.rerender(<PlatformRuntimeNavigation {...props} />)
  expect(window.location.hash).toBe('#project/p-one/workspace')
  expect(fixture.state.setActiveWorktree).toHaveBeenCalledOnce()
})

it('does not promote an unregistered or wrong-host worktree into a platform project', () => {
  window.history.replaceState(null, '', '#workbench')
  const props = { data, projects: [], active: true, workbench: true, entryRevision: 1, onReady: vi.fn() }
  const view = render(<PlatformRuntimeNavigation {...props} />)
  fixture.state.worktrees = { 'repo-a': [worktree] }
  fixture.state.activeWorktreeId = 'main'
  fixture.state.activeWorkspaceExecutionHostId = 'runtime:other'
  view.rerender(<PlatformRuntimeNavigation {...props} projects={projects} />)
  expect(window.location.hash).toBe('#workbench')
  fixture.state.activeWorkspaceExecutionHostId = 'runtime:env-a'
  view.rerender(<PlatformRuntimeNavigation {...props} />)
  expect(window.location.hash).toBe('#workbench')
})

it('keeps native appearance reachable without taking the Studio appearance route', () => {
  window.history.replaceState(null, '', '#workbench')
  const props = { data, projects, active: true, workbench: true, entryRevision: 1, onReady: vi.fn() }
  const view = render(<PlatformRuntimeNavigation {...props} />)
  fixture.state.activeView = 'settings'
  fixture.state.settingsNavigationTarget = { pane: 'appearance', repoId: null }
  view.rerender(<PlatformRuntimeNavigation {...props} />)
  expect(window.location.hash).toBe('#settings/workbench-appearance')
  expect(fixture.state.settingsNavigationTarget.pane).toBe('appearance')
})

it('closes native settings after navigation to Studio appearance is accepted', () => {
  fixture.state.activeView = 'settings'
  render(<PlatformNavigation data={data} projects={projects} active selectionOnly
    settingsScope={{ kind: 'global', contextKey: 'trusted', entry: 'appearance' }} onSelection={vi.fn()} />)
  window.dispatchEvent(new CustomEvent('platform-navigation-accepted', {
    detail: { from: '#settings/workbench-appearance', to: '#settings/appearance' }
  }))
  expect(fixture.state.closeSettingsPage).toHaveBeenCalledOnce()
})

it('opens exact project Settings after existing readiness gates without activating a worktree', () => {
  window.history.replaceState(null, '', '#project/p-one/settings')
  const scope = { kind: 'project' as const, contextKey: 'trusted', platformId: 'p-one', repoId: 'repo-a',
    hostId: 'runtime:env-a' as const, setupId: '', name: 'One', path: 'C:/example/one' }
  const onScope = vi.fn()
  const view = render(<PlatformNavigation data={data} projects={projects} active selectionOnly
    settingsScope={scope} onSettingsScope={onScope} onSelection={vi.fn()} />)
  expect(onScope.mock.calls.at(-1)?.[0]).toMatchObject({ ...scope, setupId: expect.any(String) })
  expect(fixture.state.openSettingsPage).toHaveBeenCalledOnce()
  expect(fixture.activate).not.toHaveBeenCalled()
  fixture.state.terminalStartupRestorationReady = false
  view.rerender(<PlatformNavigation data={data} projects={projects} active selectionOnly
    settingsScope={scope} onSettingsScope={onScope} onSelection={vi.fn()} />)
  expect(onScope).toHaveBeenLastCalledWith(null)
  expect(fixture.state.openSettingsPage).toHaveBeenCalledOnce()
})

it('rejects a same-id repo on another host or a renamed project before opening Settings', () => {
  const scope = { kind: 'project' as const, contextKey: 'trusted', platformId: 'p-one', repoId: 'repo-a',
    hostId: 'runtime:env-a' as const, setupId: '', name: 'One', path: 'C:/example/one' }
  fixture.state.repos[0].executionHostId = 'runtime:other'
  const onScope = vi.fn()
  render(<PlatformNavigation data={data} projects={projects} active selectionOnly
    settingsScope={scope} onSettingsScope={onScope} onSelection={vi.fn()} />)
  expect(onScope).toHaveBeenLastCalledWith(null)
  expect(fixture.state.openSettingsPage).not.toHaveBeenCalled()
  expect(fixture.activate).not.toHaveBeenCalled()
})
afterEach(cleanup)

it('restores the requested workspace before reflecting a later settings action', () => {
  fixture.state.worktrees = { 'repo-a': [worktree] }
  fixture.state.activeWorktreeId = 'main'
  fixture.state.activeView = 'settings'
  fixture.state.settingsNavigationTarget = { pane: 'appearance', repoId: null }
  fixture.activate.mockImplementation(() => { fixture.state.activeView = 'terminal'; return true })
  const props = { data, projects, active: true, onSelection: vi.fn() }
  const view = render(<PlatformNavigation {...props} />)
  expect(window.location.hash).toBe('#project/p-one/workspace')
  expect(fixture.state.activeView).toBe('terminal')
  view.rerender(<PlatformNavigation {...props} />)
  fixture.state.activeView = 'settings'
  view.rerender(<PlatformNavigation {...props} />)
  expect(window.location.hash).toBe('#settings/workbench-appearance')
})

it.each(['empty', 'disconnected', 'activation'] as const)('keeps %s recovery reachable without showing the app', (mode) => {
  if (mode === 'disconnected') fixture.state.runtimeStatusByEnvironmentId.set('env-a', {
    snapshot: { verification: 'verified', transport: 'disconnected' }
  })
  if (mode === 'activation') {
    fixture.state.worktrees = { 'repo-a': [worktree] }
    fixture.state.activeWorktreeId = 'main'
  }
  const onReady = vi.fn()
  const view = render(<PlatformNavigation data={data} projects={projects} active pending onSelection={vi.fn()} onReady={onReady} />)
  expect(screen.getByRole('status').textContent).toContain(
    mode === 'empty' ? '尚无可定位的工作区' : mode === 'disconnected' ? '连接已中断' : '工作区暂不可定位'
  )
  expect(screen.getByRole('button', { name: '重新加载工作区' })).toBeTruthy()
  expect(screen.getByRole('link', { name: '返回项目' }).getAttribute('href')).toBe('#home')
  expect(view.container.firstElementChild?.getAttribute('data-pending')).toBe('true')
  expect(view.container.firstElementChild?.hasAttribute('hidden')).toBe(false)
  expect(onReady).toHaveBeenLastCalledWith(null)
  view.rerender(<PlatformNavigation data={data} projects={projects} active={false} onSelection={vi.fn()} onReady={onReady} />)
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
})

it('reports source navigation ready without activating or waking a workspace', () => {
  fixture.state.worktrees = { 'repo-a': [worktree] }
  const onReady = vi.fn(), onSelection = vi.fn()
  render(<PlatformNavigation data={data} projects={projects} active selectionOnly onSelection={onSelection} onReady={onReady} />)
  expect(onReady).toHaveBeenLastCalledWith(data)
  expect(fixture.activate).not.toHaveBeenCalled()
  expect(onSelection).not.toHaveBeenCalled()
})
