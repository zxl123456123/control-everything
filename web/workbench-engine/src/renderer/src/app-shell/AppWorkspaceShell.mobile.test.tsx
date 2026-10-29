// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ComponentProps, ReactNode } from 'react'
import { AppWorkspaceShell } from './AppWorkspaceShell'

const state = vi.hoisted(() => ({
  persistedUIReady: false,
  sidebarOpen: true,
  rightSidebarOpen: true,
  setSidebarOpen: vi.fn(),
  setRightSidebarOpen: vi.fn()
}))
vi.mock('../store', () => ({ useAppStore: Object.assign(
  (select: (value: typeof state) => unknown) => select(state), { getState: () => state }
) }))
vi.mock('@/lib/lazy-with-retry', () => ({ lazyWithRetry: () => () => null }))
vi.mock('../components/Sidebar', () => ({ default: () => null }))
vi.mock('../components/right-sidebar', () => ({ default: () => null }))
vi.mock('../components/error-boundaries/RecoverableRenderErrorBoundary', () => ({
  RecoverableRenderErrorBoundary: ({ children }: { children: ReactNode }) => children
}))
vi.mock('./TitlebarLeftControls', () => ({ TitlebarLeftControls: () => null }))
vi.mock('./TitlebarMainStrip', () => ({ TitlebarMainStrip: () => null, RightSidebarToggle: () => null }))
vi.mock('../web/PlatformWorkspaceToolbar', () => ({ PlatformWorkspaceToolbar: () => null }))
vi.mock('../components/floating-terminal/FloatingTerminalToggleButton', () => ({ FloatingTerminalToggleButton: () => null }))
vi.mock('../components/TerminalWorkbenchContainer', () => ({ TerminalWorkbenchContainer: () => null }))

let media: EventTarget & { matches: boolean }
const props = {
  layout: { activeView: 'terminal', leftTitlebarChromeLayout: { shouldMount: false } },
  floatingWorkspace: { showToggleButton: false }
} as ComponentProps<typeof AppWorkspaceShell>

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/studio')
  media = Object.assign(new EventTarget(), { matches: true })
  vi.stubGlobal('matchMedia', () => media)
  state.persistedUIReady = false
  state.sidebarOpen = state.rightSidebarOpen = true
  state.setSidebarOpen.mockImplementation((open: boolean) => { state.sidebarOpen = open })
  state.setRightSidebarOpen.mockImplementation((open: boolean) => { state.rightSidebarOpen = open })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('waits for saved preferences, then closes both phone panels without undoing a later user choice', () => {
  const view = render(<AppWorkspaceShell {...props} />)
  expect(state.setSidebarOpen).not.toHaveBeenCalled()
  state.persistedUIReady = true
  view.rerender(<AppWorkspaceShell {...props} />)
  expect(state.sidebarOpen).toBe(false)
  expect(state.rightSidebarOpen).toBe(false)
  state.sidebarOpen = true
  view.rerender(<AppWorkspaceShell {...props} />)
  expect(state.sidebarOpen).toBe(true)
})

it('preserves wide-screen choices, collapses on entering phone width, and removes the listener', () => {
  media.matches = false
  state.persistedUIReady = true
  const view = render(<AppWorkspaceShell {...props} />)
  expect(state.setSidebarOpen).not.toHaveBeenCalled()
  media.matches = true
  act(() => { media.dispatchEvent(new Event('change')) })
  expect(state.sidebarOpen).toBe(false)
  expect(state.rightSidebarOpen).toBe(false)
  view.unmount()
  state.sidebarOpen = true
  media.dispatchEvent(new Event('change'))
  expect(state.sidebarOpen).toBe(true)
})

it('leaves the standalone desktop shell unchanged', () => {
  window.history.replaceState(null, '', '/index.html')
  state.persistedUIReady = true
  render(<AppWorkspaceShell {...props} />)
  expect(state.setSidebarOpen).not.toHaveBeenCalled()
  expect(state.setRightSidebarOpen).not.toHaveBeenCalled()
})
