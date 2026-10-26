import { describe, expect, it, vi } from 'vitest'
import { createPlatformAppearance } from './platform-appearance'
import { SETTINGS_STORAGE_KEY } from './preload-api/web-storage'

function fixture(initial: string | null = null, dark = true) {
  let raw = initial
  let denied = false
  const storage = {
    getItem: vi.fn((key: string) => {
      expect(key).toBe(SETTINGS_STORAGE_KEY)
      return raw
    }),
    setItem: vi.fn((key: string, value: string) => {
      expect(key).toBe(SETTINGS_STORAGE_KEY)
      if (denied) throw new Error('storage denied')
      raw = value
    })
  }
  const apply = vi.fn()
  const prefersDark = vi.fn(() => dark)
  const appearance = createPlatformAppearance({ storage: () => storage, apply, prefersDark })
  return {
    appearance,
    storage,
    apply,
    prefersDark,
    raw: () => raw,
    deny: (value: boolean) => {
      denied = value
    }
  }
}

describe('platform appearance authority', () => {
  it('defaults to light and corrects the late default system hydration through one warm writer', async () => {
    const f = fixture()
    expect(f.appearance.initialize().theme).toBe('light')
    expect(f.prefersDark).not.toHaveBeenCalled()
    let finish!: () => void
    const writer = vi.fn(async (theme: string) => {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      f.storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ theme }))
    })
    const release = f.appearance.registerWriter(writer, 'system')
    await Promise.resolve()
    f.appearance.acceptHydratedTheme('system')
    f.appearance.acceptHydratedTheme('dark')
    expect(f.appearance.getSnapshot().theme).toBe('light')
    // StrictMode remount cannot create a second write while the first is pending.
    release()
    f.appearance.registerWriter(writer, 'system')
    expect(writer).toHaveBeenCalledTimes(1)
    finish()
    await f.appearance.requestTheme('light')
    expect(f.appearance.getSnapshot()).toEqual({ theme: 'light', pending: false, error: '' })
  })

  it('does not let a late fixed hydration snapshot override the current stored theme', () => {
    const f = fixture('{"theme":"dark"}')
    f.appearance.initialize()
    f.appearance.acceptHydratedTheme('light')
    expect(f.appearance.getSnapshot().theme).toBe('dark')
    expect(f.storage.setItem).not.toHaveBeenCalled()
  })

  it('migrates system once, preserving unrelated terminal/tint/font settings', async () => {
    const fields = {
      theme: 'system',
      terminalColorOverrides: { red: '#123456' },
      appFontFamily: 'Personal Font',
      leftSidebarTintColor: '#abcdef'
    }
    const f = fixture(JSON.stringify(fields))
    expect(f.appearance.initialize().theme).toBe('dark')
    f.appearance.initialize()
    await f.appearance.requestTheme('light')
    expect(f.prefersDark).toHaveBeenCalledTimes(1)
    expect(JSON.parse(f.raw()!)).toEqual({ ...fields, theme: 'light' })
  })

  it('does not overwrite malformed settings with either cold or warm writes', async () => {
    for (const raw of ['{broken', '[]', '{"theme":"invalid","other":1}']) {
      const f = fixture(raw)
      const writer = vi.fn()
      f.appearance.initialize()
      f.appearance.registerWriter(writer, 'system')
      const result = await f.appearance.requestTheme('dark')
      expect(result.error).not.toBe('')
      expect(f.raw()).toBe(raw)
      expect(writer).not.toHaveBeenCalled()
      expect(f.storage.setItem).not.toHaveBeenCalled()
    }
  })

  it('keeps a denied legacy migration fixed for the session and allows explicit retry', async () => {
    const f = fixture('{"theme":"system","terminalThemeDark":"saved"}')
    f.deny(true)
    expect(f.appearance.initialize()).toMatchObject({ theme: 'dark', error: 'storage denied' })
    await f.appearance.requestTheme('light')
    expect(f.appearance.getSnapshot().theme).toBe('dark')
    expect(f.prefersDark).toHaveBeenCalledTimes(1)
    f.deny(false)
    expect(await f.appearance.requestTheme('light')).toEqual({
      theme: 'light',
      pending: false,
      error: ''
    })
  })

  it('awaits a single warm write and never previews an unconfirmed value', async () => {
    const f = fixture('{"theme":"light","other":1}')
    let fail!: (error: Error) => void
    const writer = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject
        })
    )
    f.appearance.registerWriter(writer, 'light')
    const first = f.appearance.requestTheme('dark')
    expect(f.appearance.requestTheme('dark')).toBe(first)
    expect(f.appearance.getSnapshot().theme).toBe('light')
    expect(f.apply).not.toHaveBeenCalledWith('dark')
    await Promise.resolve()
    fail(new Error('write rejected'))
    expect(await first).toEqual({ theme: 'light', pending: false, error: 'write rejected' })
    expect(writer).toHaveBeenCalledTimes(1)
  })

  it('rereads local authority if a later runtime sync rejects and unsubscribes render listeners', async () => {
    const f = fixture('{"theme":"light"}')
    const listener = vi.fn()
    const unsubscribe = f.appearance.subscribe(listener)
    f.appearance.registerWriter(async (theme) => {
      f.storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ theme, other: 2 }))
      throw new Error('sync failed')
    }, 'light')
    expect(await f.appearance.requestTheme('dark')).toEqual({
      theme: 'dark',
      pending: false,
      error: 'sync failed'
    })
    unsubscribe()
    listener.mockClear()
    f.appearance.acceptHydratedTheme('dark')
    expect(listener).not.toHaveBeenCalled()
  })
})
