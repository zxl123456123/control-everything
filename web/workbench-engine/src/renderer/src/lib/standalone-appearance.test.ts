// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import { createTestStore } from '../store/slices/store-test-helpers'
import type { GlobalSettings } from '../../../shared/global-settings-types'

describe('standalone renderer appearance', () => {
  beforeEach(() => {
    vi.resetModules()
    document.documentElement.className = ''
    document.documentElement.removeAttribute('style')
  })

  it('uses light for a missing startup read without querying or following the OS', async () => {
    const matchMedia = vi.fn()
    vi.stubGlobal('matchMedia', matchMedia)
    const { applyStandaloneAppearance } = await import('./standalone-appearance')
    expect(applyStandaloneAppearance(null)).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(matchMedia).not.toHaveBeenCalled()
  })

  it('resolves legacy system once across hydration and preserves the user font', async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true })
    vi.stubGlobal('matchMedia', matchMedia)
    const { applyStandaloneAppearance } = await import('./standalone-appearance')
    const settings = {
      ...getDefaultSettings('/tmp'),
      theme: 'system' as const,
      appFontFamily: 'Monaco'
    }
    expect(applyStandaloneAppearance(settings)).toBe('dark')
    matchMedia.mockReturnValue({ matches: false })
    expect(applyStandaloneAppearance({ ...settings })).toBe('dark')
    expect(matchMedia).toHaveBeenCalledTimes(1)
    expect(document.documentElement.style.getPropertyValue('--app-font-family')).toContain('Monaco')
    expect(settings.theme).toBe('system')
  })

  it('applies later explicit settings without a second OS resolution or settings mutation', async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true })
    vi.stubGlobal('matchMedia', matchMedia)
    const { applyStandaloneAppearance } = await import('./standalone-appearance')
    const settings = getDefaultSettings('/tmp')
    applyStandaloneAppearance({ ...settings, theme: 'system' })
    expect(applyStandaloneAppearance({ ...settings, theme: 'light' })).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(applyStandaloneAppearance({ ...settings, theme: 'dark' })).toBe('dark')
    expect(document.documentElement.classList.contains('light')).toBe(false)
    expect(matchMedia).toHaveBeenCalledTimes(1)
    expect(settings.theme).toBe('system')
  })

  it('uses the original store publication fence when an older migration settles after a manual choice', async () => {
    const settings = { ...getDefaultSettings('/tmp'), theme: 'system' as const }
    let finishMigration!: (next: GlobalSettings) => void
    const migrationResult = new Promise<GlobalSettings>((resolve) => {
      finishMigration = resolve
    })
    const set = vi
      .fn()
      .mockReturnValueOnce(migrationResult)
      .mockResolvedValueOnce({ ...settings, theme: 'light' })
    Object.defineProperty(window, 'api', { configurable: true, value: { settings: { set } } })
    const store = createTestStore()
    store.setState({ settings })
    const migration = store.getState().updateSettingsOrThrow({ theme: 'dark' })
    await store.getState().updateSettingsOrThrow({ theme: 'light' })
    finishMigration({ ...settings, theme: 'dark' })
    await migration
    expect(store.getState().settings?.theme).toBe('light')
    expect(set).toHaveBeenNthCalledWith(1, { theme: 'dark' })
    expect(set).toHaveBeenNthCalledWith(2, { theme: 'light' })
  })
})
