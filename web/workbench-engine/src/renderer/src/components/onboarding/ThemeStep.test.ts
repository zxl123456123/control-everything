import { describe, expect, it, vi } from 'vitest'
import { applyOnboardingThemeSelection } from './ThemeStep'

describe('applyOnboardingThemeSelection', () => {
  it('waits for persistence before changing the selected theme', async () => {
    const onThemeChange = vi.fn()
    let finish!: () => void
    const updateSettings = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const selection = applyOnboardingThemeSelection('light', onThemeChange, updateSettings)
    expect(onThemeChange).not.toHaveBeenCalled()
    expect(updateSettings).toHaveBeenCalledWith({ theme: 'light' })
    finish()
    await selection
    expect(onThemeChange).toHaveBeenCalledWith('light')
  })

  it('keeps the confirmed selection when saving fails', async () => {
    const onThemeChange = vi.fn()
    const updateSettings = vi.fn().mockRejectedValue(new Error('denied'))
    await expect(
      applyOnboardingThemeSelection('dark', onThemeChange, updateSettings)
    ).rejects.toThrow('denied')
    expect(onThemeChange).not.toHaveBeenCalled()
  })
})
