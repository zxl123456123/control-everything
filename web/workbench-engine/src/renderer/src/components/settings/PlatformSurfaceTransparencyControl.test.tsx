// @vitest-environment happy-dom
import type { ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Slider } from '../ui/slider'
import { PlatformSurfaceTransparencyControl } from './PlatformSurfaceTransparencyControl'
import { createWebSettingsApi } from '../../web/preload-api/web-settings-api'

const mocks = vi.hoisted(() => ({
  updateSettingsOrThrow: vi.fn()
}))

vi.mock('../../store', () => ({
  useAppStore: { getState: () => mocks }
}))
vi.mock('../../web/remote-context', () => ({
  browserStorage: (kind: 'localStorage' | 'sessionStorage') => window[kind]
}))
vi.mock('../../web/preload-api/web-runtime-session', () => ({
  webRuntimeState: { activeEnvironment: null },
  requireActiveEnvironmentOrNull: () => null,
  resolveEnvironment: vi.fn()
}))
vi.mock('../../web/web-runtime-environment', () => ({
  readStoredWebRuntimeEnvironment: () => null
}))
vi.mock('../ui/slider', () => ({
  Slider: ({ value, onValueChange, onValueCommit, disabled }: ComponentProps<typeof Slider>) => (
    <input
      aria-label="Interface Transparency"
      type="range"
      min={0}
      max={45}
      disabled={disabled}
      value={value?.[0]}
      onChange={(event) => onValueChange?.([Number(event.target.value)])}
      onPointerUp={(event) => onValueCommit?.([Number(event.currentTarget.value)])}
    />
  )
}))

beforeEach(() => {
  mocks.updateSettingsOrThrow.mockReset()
  localStorage.clear()
  document.documentElement.style.setProperty('--ce-workbench-opacity', '0.82')
})
afterEach(() => {
  cleanup()
  document.documentElement.style.removeProperty('--ce-workbench-opacity')
})

describe('platform surface transparency', () => {
  it('previews the workspace while dragging, then persists once for reload', async () => {
    const settings = createWebSettingsApi().settings!
    const initial = await settings.get()
    expect(initial.workbenchSurfaceOpacity).toBe(0.82)
    mocks.updateSettingsOrThrow.mockImplementation((updates) => settings.set(updates))
    const view = render(
      <PlatformSurfaceTransparencyControl opacity={initial.workbenchSurfaceOpacity} />
    )
    const slider = screen.getByRole('slider')
    for (const value of [20, 30, 45]) {
      fireEvent.change(slider, { target: { value } })
    }
    expect(document.documentElement.style.getPropertyValue('--ce-workbench-opacity')).toBe('0.55')
    expect(screen.getByText('45%')).toBeTruthy()
    expect(mocks.updateSettingsOrThrow).not.toHaveBeenCalled()
    expect((await settings.get()).workbenchSurfaceOpacity).toBe(0.82)

    fireEvent.pointerUp(slider)
    await waitFor(() =>
      expect(mocks.updateSettingsOrThrow).toHaveBeenCalledExactlyOnceWith({
        workbenchSurfaceOpacity: 0.55
      })
    )
    const reloaded = await createWebSettingsApi().settings!.get()
    view.rerender(<PlatformSurfaceTransparencyControl opacity={reloaded.workbenchSurfaceOpacity} />)
    expect(reloaded.workbenchSurfaceOpacity).toBe(0.55)
    expect(screen.getByText('45%')).toBeTruthy()
    expect(reloaded.terminalBackgroundOpacity).toBe(initial.terminalBackgroundOpacity)
  })

  it('restores the previous surface and reports a failed save', async () => {
    mocks.updateSettingsOrThrow.mockRejectedValue(new Error('Storage unavailable'))
    render(<PlatformSurfaceTransparencyControl opacity={0.82} />)
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: 40 } })
    fireEvent.pointerUp(slider)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(document.documentElement.style.getPropertyValue('--ce-workbench-opacity')).toBe('0.82')
    expect(screen.getByText('18%')).toBeTruthy()
  })

  it('discards an uncommitted preview when the settings panel is closed', () => {
    const { unmount } = render(<PlatformSurfaceTransparencyControl opacity={0.74} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: 45 } })
    unmount()
    expect(document.documentElement.style.getPropertyValue('--ce-workbench-opacity')).toBe('0.74')
    expect(mocks.updateSettingsOrThrow).not.toHaveBeenCalled()
  })

  it('can save opaque surfaces and reset to the default', async () => {
    mocks.updateSettingsOrThrow.mockResolvedValue(undefined)
    const view = render(<PlatformSurfaceTransparencyControl opacity={0.55} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: 0 } })
    await act(async () => {
      fireEvent.pointerUp(screen.getByRole('slider'))
    })
    expect(mocks.updateSettingsOrThrow).toHaveBeenLastCalledWith({ workbenchSurfaceOpacity: 1 })
    view.rerender(<PlatformSurfaceTransparencyControl opacity={1} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset to 18%' }))
    })
    expect(mocks.updateSettingsOrThrow).toHaveBeenLastCalledWith({ workbenchSurfaceOpacity: 0.82 })
  })
})
