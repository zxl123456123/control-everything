// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import { i18n, setRendererUiLanguage } from '../i18n/i18n'
import { TelemetryFirstLaunchSurface } from './TelemetryFirstLaunchSurface'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  acknowledgeBanner: vi.fn(),
  setOptIn: vi.fn(),
  fetchSettings: vi.fn()
}))

vi.mock('../store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector(mocks.state)
}))
vi.mock('../lib/telemetry', () => ({
  PRIVACY_URL: 'https://example.com/privacy',
  acknowledgeBanner: mocks.acknowledgeBanner,
  setOptIn: mocks.setOptIn
}))

beforeEach(async () => {
  vi.clearAllMocks()
  mocks.acknowledgeBanner.mockResolvedValue(undefined)
  mocks.setOptIn.mockResolvedValue(undefined)
  mocks.fetchSettings.mockResolvedValue(undefined)
  mocks.state = {
    settings: {
      ...getDefaultSettings('/tmp'),
      telemetry: { existedBeforeTelemetryRelease: true, optedIn: null }
    },
    fetchSettings: mocks.fetchSettings
  }
  await i18n.changeLanguage('en')
})

afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

describe('first-launch telemetry presentation', () => {
  it.each([false, true])('preserves the original cohort gate (existing: %s)', (existing) => {
    const settings = mocks.state.settings as ReturnType<typeof getDefaultSettings>
    mocks.state.settings = {
      ...settings,
      telemetry: { ...settings.telemetry, existedBeforeTelemetryRelease: existing, optedIn: true }
    }
    render(<TelemetryFirstLaunchSurface />)
    expect(screen.queryByRole('region')).toBeNull()
    expect(mocks.acknowledgeBanner).not.toHaveBeenCalled()
    expect(mocks.setOptIn).not.toHaveBeenCalled()
  })

  it('discloses that dismissing enables statistics and keeps opt-out on its original action', async () => {
    await setRendererUiLanguage('zh')
    render(<TelemetryFirstLaunchSurface />)
    expect(screen.getByText('匿名使用统计')).toBeTruthy()
    expect(screen.getByText(/继续或关闭本通知将启用统计/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭统计' }))
    await waitFor(() => expect(mocks.fetchSettings).toHaveBeenCalledOnce())
    expect(mocks.setOptIn).toHaveBeenCalledWith(false)
    expect(mocks.acknowledgeBanner).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
  })

  it('keeps close on the original acknowledgment path and blocks a second pending write', async () => {
    let finish!: () => void
    mocks.acknowledgeBanner.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve
      })
    )
    render(<TelemetryFirstLaunchSurface />)
    const close = screen.getByRole('button', { name: 'Acknowledge and close notice' })
    fireEvent.click(close)
    fireEvent.click(close)
    expect(mocks.acknowledgeBanner).toHaveBeenCalledOnce()
    expect(mocks.setOptIn).not.toHaveBeenCalled()
    expect(mocks.fetchSettings).not.toHaveBeenCalled()
    finish()
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull())
    expect(mocks.fetchSettings).toHaveBeenCalledOnce()
  })
})
