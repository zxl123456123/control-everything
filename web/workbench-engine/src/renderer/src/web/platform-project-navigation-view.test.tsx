// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import type { Worktree } from '../../../shared/worktree/types'
import PlatformNavigation from './platform-project-navigation-view'

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
    runtimeStatusByEnvironmentId: new Map([['env-a', { snapshot: { verification: 'verified', transport: 'ready' } }]]),
    fetchRepos: vi.fn().mockResolvedValue(undefined), fetchWorktrees: vi.fn().mockResolvedValue(undefined)
  }
})
afterEach(cleanup)

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
