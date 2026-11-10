// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ComponentProps, ReactNode } from 'react'
import { AppWorkspaceShell } from './AppWorkspaceShell'

const state = vi.hoisted(() => ({
  sidebarOpen: true,
  rightSidebarOpen: true,
  shellFallback: false,
  setSidebarOpen: vi.fn(),
  setRightSidebarOpen: vi.fn()
}))
vi.mock('../store', () => ({
  useAppStore: Object.assign((select: (value: typeof state) => unknown) => select(state), {
    getState: () => state
  })
}))
vi.mock('@/lib/lazy-with-retry', () => ({ lazyWithRetry: () => () => null }))
vi.mock('../components/Sidebar', () => ({ default: () => <div data-workbench-sidebar="" /> }))
vi.mock('../components/right-sidebar', () => ({ default: () => <div data-workbench-tools="" /> }))
vi.mock('../components/error-boundaries/RecoverableRenderErrorBoundary', () => ({
  RecoverableRenderErrorBoundary: ({
    children,
    boundaryId
  }: {
    children: ReactNode
    boundaryId: string
  }) => (boundaryId === 'app.workspace-shell' && state.shellFallback ? null : children)
}))
vi.mock('./TitlebarLeftControls', () => ({ TitlebarLeftControls: () => null }))
vi.mock('./TitlebarMainStrip', () => ({
  TitlebarMainStrip: () => null,
  RightSidebarToggle: () => null
}))
vi.mock('../web/PlatformWorkspaceToolbar', () => ({
  PlatformWorkspaceToolbar: () => <button>Workspace action</button>
}))
vi.mock('../components/floating-terminal/FloatingTerminalToggleButton', () => ({
  FloatingTerminalToggleButton: () => null
}))
vi.mock('../components/TerminalWorkbenchContainer', () => ({
  TerminalWorkbenchContainer: () => null
}))

let shellWidth: number
let navigationWidth: number
let toolsWidth: number
let resize: () => void
const disconnect = vi.fn()
const props = {
  layout: {
    activeView: 'terminal',
    sidebarOpen: true,
    rightSidebarOpen: true,
    showSidebar: true,
    showRightSidebarControls: true,
    workspaceChromeActive: true,
    leftTitlebarChromeLayout: { shouldMount: true }
  },
  floatingWorkspace: { showToggleButton: false }
} as ComponentProps<typeof AppWorkspaceShell>

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/studio')
  shellWidth = 799
  state.shellFallback = false
  navigationWidth = 280
  toolsWidth = 350
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    return this.hasAttribute('data-workbench-shell') ? shellWidth : 0
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const width = this.hasAttribute('data-workbench-navigation-column')
      ? navigationWidth
      : this.hasAttribute('data-workbench-tools')
        ? toolsWidth
        : 0
    return DOMRect.fromRect({ width, height: 800 })
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect = disconnect
    }
  )
  state.sidebarOpen = state.rightSidebarOpen = true
  state.setSidebarOpen.mockImplementation((open: boolean) => {
    state.sidebarOpen = open
  })
  state.setRightSidebarOpen.mockImplementation((open: boolean) => {
    state.rightSidebarOpen = open
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('reclaims the tools column without changing saved panel choices', () => {
  const view = render(<AppWorkspaceShell {...props} />)
  const shell = view.container.querySelector('[data-workbench-shell]')!
  expect(shell.getAttribute('data-workbench-panel-overlay')).toBe('tools')
  expect(state.setSidebarOpen).not.toHaveBeenCalled()
  expect(state.setRightSidebarOpen).not.toHaveBeenCalled()
  act(() => {
    shellWidth = 1280
    resize()
  })
  expect(shell.getAttribute('data-workbench-panel-overlay')).toBe('none')
  act(() => {
    shellWidth = 799
    resize()
  })
  expect(shell.getAttribute('data-workbench-panel-overlay')).toBe('tools')
  expect(state.sidebarOpen).toBe(true)
  expect(state.rightSidebarOpen).toBe(true)
  view.unmount()
  expect(disconnect).toHaveBeenCalledOnce()
})

it('responds to live panel resizing and keeps the reclaimed layout stable', () => {
  const view = render(<AppWorkspaceShell {...props} />)
  const shell = view.container.querySelector('[data-workbench-shell]')!
  act(() => {
    navigationWidth = 500
    resize()
  })
  expect(shell.getAttribute('data-workbench-panel-overlay')).toBe('both')
  act(() => {
    resize()
  })
  expect(shell.getAttribute('data-workbench-panel-overlay')).toBe('both')
  act(() => {
    navigationWidth = 280
    toolsWidth = 220
    resize()
  })
  expect(shell.getAttribute('data-workbench-panel-overlay')).toBe('tools')
})

it('dismisses only the overlaid tools panel and returns focus to the workspace', () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  const view = render(<AppWorkspaceShell {...props} />)
  const workspace = view.getByRole('button', { name: 'Workspace action' })
  act(() => workspace.focus())
  fireEvent.click(view.getByRole('button', { name: '收起侧栏，返回工作区' }))
  expect(state.setSidebarOpen).not.toHaveBeenCalled()
  expect(state.rightSidebarOpen).toBe(false)
  expect(document.activeElement).toBe(workspace)
})

it('uses phone drawers without changing preferences until the user closes them', () => {
  shellWidth = 390
  const view = render(<AppWorkspaceShell {...props} />)
  const shell = view.container.querySelector('[data-workbench-shell]')!
  expect(shell.getAttribute('data-workbench-panel-overlay')).toBe('both')
  expect(state.setSidebarOpen).not.toHaveBeenCalled()
  expect(state.setRightSidebarOpen).not.toHaveBeenCalled()
  fireEvent.keyDown(shell, { key: 'Escape' })
  expect(state.sidebarOpen).toBe(false)
  expect(state.rightSidebarOpen).toBe(false)
})

it('leaves the standalone desktop shell unchanged', () => {
  window.history.replaceState(null, '', '/index.html')
  const view = render(<AppWorkspaceShell {...props} />)
  expect(
    view.container
      .querySelector('[data-workbench-shell]')
      ?.hasAttribute('data-workbench-panel-overlay')
  ).toBe(false)
  expect(state.setSidebarOpen).not.toHaveBeenCalled()
  expect(state.setRightSidebarOpen).not.toHaveBeenCalled()
})

it('binds measurements when the existing shell error fallback is retried', () => {
  state.shellFallback = true
  const view = render(<AppWorkspaceShell {...props} />)
  expect(view.container.querySelector('[data-workbench-shell]')).toBeNull()
  state.shellFallback = false
  view.rerender(<AppWorkspaceShell {...props} />)
  const shell = view.container.querySelector('[data-workbench-shell]')!
  expect(shell.getAttribute('data-workbench-panel-overlay')).toBe('tools')
  act(() => {
    shellWidth = 1280
    resize()
  })
  expect(shell.getAttribute('data-workbench-panel-overlay')).toBe('none')
})
