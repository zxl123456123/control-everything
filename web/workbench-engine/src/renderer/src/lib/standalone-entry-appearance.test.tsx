// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach } from 'vitest'

const probe = vi.hoisted(() => ({
  getSync: vi.fn(),
  setState: vi.fn(),
  render: vi.fn(),
  state: {} as Record<string, unknown>
}))

vi.mock('../store', () => ({
  useAppStore: Object.assign((selector: (state: unknown) => unknown) => selector(probe.state), {
    getState: () => probe.state,
    setState: (updates: Record<string, unknown>) => {
      Object.assign(probe.state, updates)
      probe.setState(updates)
    }
  })
}))
vi.mock('../lib/react-renderer-root', () => ({
  getOrCreateRendererRoot: () => ({ render: probe.render })
}))
vi.mock('../App', () => ({ default: () => null }))
vi.mock('../lib/react-devtools-commit-hook-shim', () => ({}))
vi.mock('../lib/react-commit-cascade-observer', () => ({}))
vi.mock('../lib/react-commit-cascade-telemetry', () => ({
  setReactCommitCascadeRendererSurface: vi.fn()
}))
vi.mock('../lib/crash-diagnostics', () => ({
  installRendererCrashDiagnostics: vi.fn(),
  recordRendererCrashBreadcrumb: vi.fn()
}))
vi.mock('../lib/typing-latency/diagnostic', () => ({ installTypingLatencyDiagnostic: vi.fn() }))
vi.mock('../lib/app-keyboard-router', () => ({ installAppKeyboardRouter: vi.fn() }))
vi.mock('../lib/react-grab-dev-gate', () => ({ shouldEnableReactGrab: () => false }))
vi.mock('../lib/os-file-drop-cancellation-guard', () => ({
  installOsFileDropCancellationGuard: () => () => {}
}))
vi.mock('../lib/pane-manager/pane-webgl-renderer', () => ({
  primeTerminalWebglAddon: async () => {}
}))
vi.mock('../components/automations/automation-host-diagnostics', () => ({
  installAutomationHostDiagnostic: vi.fn()
}))
vi.mock('../components/browser-pane/browser-client-page-renderer-installation', () => ({
  installBrowserClientPageRenderer: () => null
}))
vi.mock('../components/skills/SkillWarningPreviewLauncher', () => ({
  SkillWarningPreviewLauncher: () => null
}))
vi.mock('../components/dashboard-popout/DashboardPopoutRoot', () => ({
  DashboardPopoutRoot: () => null
}))
vi.mock('../components/workspace-space/WorkspaceSpacePage', () => ({ default: () => null }))
vi.mock('../components/sidebar/DeleteWorktreeDialog', () => ({ default: () => null }))
vi.mock('../components/sidebar/PreservedBranchBatchReviewModal', () => ({ default: () => null }))
vi.mock('../components/confirmation-dialog', () => ({
  ConfirmationDialogProvider: ({ children }: { children: ReactNode }) => children
}))
vi.mock('../components/error-boundaries/RecoverableRenderErrorBoundary', () => ({
  RecoverableRenderErrorBoundary: ({ children }: { children: ReactNode }) => children
}))
vi.mock('../components/ui/sonner', () => ({ Toaster: () => null }))
vi.mock('../components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children
}))
vi.mock('../i18n/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: ReactNode }) => children
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback })
}))
vi.mock('../i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

const entries = [
  ['main', () => import('../main')],
  ['space', () => import('../space')],
  ['popout', () => import('../popout')]
] as const

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  probe.state = {}
  document.body.innerHTML = '<div id="root"></div>'
  document.documentElement.className = ''
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { settings: { getSync: probe.getSync } }
  })
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
})
afterEach(cleanup)

describe.each(entries)('%s startup appearance', (name, load) => {
  it('applies the original synchronous setting before rendering, including the user font', async () => {
    const settings = {
      ...getDefaultSettings('/tmp'),
      theme: 'dark' as const,
      appFontFamily: 'Monaco'
    }
    probe.getSync.mockReturnValue(settings)
    probe.render.mockImplementation(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(probe.state.settings).toBe(name === 'popout' ? settings : undefined)
      expect(document.documentElement.style.getPropertyValue('--app-font-family')).toContain(
        'Monaco'
      )
    })
    await load()
    expect(probe.getSync).toHaveBeenCalledOnce()
    expect(probe.render).toHaveBeenCalledOnce()
  })

  it('renders a light first frame when the original authority cannot be read', async () => {
    probe.getSync.mockImplementation(() => {
      throw new Error('unavailable')
    })
    probe.render.mockImplementation(() =>
      expect(document.documentElement.classList.contains('light')).toBe(true)
    )
    await load()
    expect(probe.setState).not.toHaveBeenCalled()
    expect(probe.render).toHaveBeenCalledOnce()
  })
})

describe.each(entries.slice(1))('%s legacy appearance hydration', (_name, load) => {
  it('keeps its first resolved theme through hydration and requests one original settings write', async () => {
    const settings = { ...getDefaultSettings('/tmp'), theme: 'system' as const }
    const updateSettingsOrThrow = vi.fn().mockResolvedValue(undefined)
    const addEventListener = vi.fn()
    const media = { matches: false, addEventListener, removeEventListener: vi.fn() }
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(media))
    probe.getSync.mockReturnValue(settings)
    probe.state.settings = settings
    probe.render.mockReset()
    Object.assign(probe.state, {
      updateSettingsOrThrow,
      fetchKeybindings: vi.fn().mockResolvedValue(undefined),
      hydrateWorkspaceSpaceFromCache: vi.fn().mockResolvedValue(undefined)
    })
    Object.assign(window.api, {
      settings: {
        getSync: probe.getSync,
        get: vi.fn().mockResolvedValue(settings),
        onChanged: vi.fn().mockReturnValue(() => {})
      },
      workspaceSpace: {
        onWindowState: vi.fn().mockReturnValue(() => {}),
        onProgress: vi.fn().mockReturnValue(() => {}),
        requestWindowState: vi.fn()
      }
    })
    await load()
    media.matches = true
    render(probe.render.mock.calls[0]![0])
    await waitFor(() => expect(updateSettingsOrThrow).toHaveBeenCalledOnce())
    expect(updateSettingsOrThrow).toHaveBeenCalledWith({ theme: 'light' })
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(addEventListener).not.toHaveBeenCalled()
  })
})

it('keeps the Space first frame while its original window-state hydration is pending', async () => {
  probe.getSync.mockReturnValue({ ...getDefaultSettings('/tmp'), theme: 'dark' })
  probe.render.mockReset()
  const updateSettingsOrThrow = vi.fn()
  const requestWindowState = vi.fn()
  Object.assign(probe.state, {
    updateSettingsOrThrow,
    hydrateWorkspaceSpaceFromCache: vi.fn().mockResolvedValue(undefined)
  })
  Object.assign(window.api, {
    workspaceSpace: {
      onWindowState: vi.fn().mockReturnValue(() => {}),
      onProgress: vi.fn().mockReturnValue(() => {}),
      requestWindowState
    }
  })
  await entries[1][1]()
  render(probe.render.mock.calls[0]![0])
  expect(requestWindowState).toHaveBeenCalled()
  expect(probe.state.settings).toBeUndefined()
  expect(probe.setState).not.toHaveBeenCalled()
  expect(updateSettingsOrThrow).not.toHaveBeenCalled()
  expect(document.documentElement.classList.contains('dark')).toBe(true)
})
