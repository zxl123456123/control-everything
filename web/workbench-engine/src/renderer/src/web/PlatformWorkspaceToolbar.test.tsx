// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlatformWorkspaceToolbar } from './PlatformWorkspaceToolbar'

const state = vi.hoisted(() => ({
  activeWorktreeId: 'workspace-1',
  activeWorkspaceExecutionHostId: 'runtime:host-1',
  sidebarOpen: true,
  toggleSidebar: vi.fn(),
  getKnownWorktreeById: vi.fn()
}))
vi.mock('../store', () => ({
  useAppStore: Object.assign((select: (value: typeof state) => unknown) => select(state), {
    getState: () => state
  })
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.sidebarOpen = true
  state.getKnownWorktreeById.mockReturnValue({ displayName: '导航优化', branch: 'feature/navigation' })
})
afterEach(cleanup)

it('uses the active workspace owner and keeps its name and branch distinct', () => {
  render(<PlatformWorkspaceToolbar />)
  expect(screen.getByRole('heading', { name: '导航优化' })).toBeTruthy()
  expect(screen.getByText('feature/navigation')).toBeTruthy()
  expect(state.getKnownWorktreeById).toHaveBeenCalledWith('workspace-1', 'runtime:host-1')
})

it('never presents a stale workspace title when the selected record is unavailable', () => {
  state.getKnownWorktreeById.mockReturnValue(null)
  render(<PlatformWorkspaceToolbar />)
  expect(screen.getByRole('heading', { name: '工作区' })).toBeTruthy()
  expect(screen.queryByText('feature/navigation')).toBeNull()
})

it.each([true, false])('routes the overview action to the existing board when the sidebar is %s', (open) => {
  state.sidebarOpen = open
  const listener = vi.fn()
  window.addEventListener('orca:toggle-workspace-board', listener)
  try {
    render(<PlatformWorkspaceToolbar />)
    fireEvent.click(screen.getByRole('button', { name: '工作区总览' }))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(state.toggleSidebar).toHaveBeenCalledTimes(open ? 0 : 1)
  } finally {
    window.removeEventListener('orca:toggle-workspace-board', listener)
  }
})
