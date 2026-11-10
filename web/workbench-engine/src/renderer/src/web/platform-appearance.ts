import { applyDocumentTheme } from '../lib/document-theme'
import { browserStorage } from './remote-context'
import { SETTINGS_STORAGE_KEY } from './preload-api/web-storage'

export type ApplicationTheme = 'light' | 'dark'
export type AppearanceSnapshot = { theme: ApplicationTheme; pending: boolean; error: string }
type ThemeWriter = (theme: ApplicationTheme) => Promise<void>
type AppearanceOptions = {
  storage: () => Pick<Storage, 'getItem' | 'setItem'>
  prefersDark: () => boolean
  apply: (theme: ApplicationTheme) => void
}

export function isPlatformAppearance(): boolean {
  return ['/studio', '/workbench/web-index.html'].includes(window.location.pathname)
}

/** Legacy input is resolved once by its consumer; new choices are always fixed. */
export function fixedApplicationTheme(theme: unknown): ApplicationTheme {
  if (theme === 'dark' || theme === 'light') return theme
  if (theme === 'system') {
    if (document.documentElement.classList.contains('dark')) return 'dark'
    if (document.documentElement.classList.contains('light')) return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

/** Render state only. The scoped settings blob remains the sole durable authority. */
export function createPlatformAppearance(options: AppearanceOptions) {
  let snapshot: AppearanceSnapshot = { theme: 'light', pending: false, error: '' }
  let initialized = false
  let legacyTheme: ApplicationTheme | undefined
  let writer: ThemeWriter | undefined
  let pending: Promise<AppearanceSnapshot> | undefined
  const listeners = new Set<() => void>()
  const publish = () => {
    options.apply(snapshot.theme)
    for (const listener of listeners) listener()
  }
  const read = (): Record<string, unknown> => {
    const raw = options.storage().getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return {}
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      throw new Error('外观设置格式无效，原始设置已保留。')
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('外观设置格式无效，原始设置已保留。')
    }
    return value as Record<string, unknown>
  }
  const resolve = (value: unknown): ApplicationTheme => {
    if (value === 'system') return (legacyTheme ??= options.prefersDark() ? 'dark' : 'light')
    if (value === undefined || value === 'light') return 'light'
    if (value === 'dark') return 'dark'
    throw new Error('外观设置值无效，原始设置已保留。')
  }
  const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
  const initialize = (): AppearanceSnapshot => {
    if (initialized) return snapshot
    initialized = true
    try {
      const stored = read()
      snapshot.theme = resolve(stored.theme)
      if (stored.theme === 'system') {
        // Re-read before merging so migration never replaces unrelated settings.
        options
          .storage()
          .setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...read(), theme: snapshot.theme }))
      }
    } catch (error) {
      snapshot.error = message(error)
    }
    publish()
    return snapshot
  }
  const requestTheme = (theme: ApplicationTheme): Promise<AppearanceSnapshot> => {
    initialize()
    if (pending) return pending
    snapshot = { ...snapshot, pending: true, error: '' }
    pending = Promise.resolve()
      .then(async () => {
        try {
          // Reject malformed authority even with a warm writer: do not overwrite it.
          resolve(read().theme)
          if (writer) await writer(theme)
          else options.storage().setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...read(), theme }))
          snapshot = { theme: resolve(read().theme), pending: false, error: '' }
        } catch (error) {
          // A warm write may have persisted locally before a later sync failed.
          let confirmed = snapshot.theme
          try {
            confirmed = resolve(read().theme)
          } catch {
            /* Keep the last confirmed display. */
          }
          snapshot = { theme: confirmed, pending: false, error: message(error) }
        }
        publish()
        return snapshot
      })
      .finally(() => {
        pending = undefined
      })
    publish()
    return pending
  }
  return {
    initialize,
    getSnapshot: () => initialize(),
    requestTheme,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    registerWriter(nextWriter: ThemeWriter, hydratedTheme: unknown) {
      initialize()
      writer = nextWriter
      if (!snapshot.error && hydratedTheme !== snapshot.theme) void requestTheme(snapshot.theme)
      return () => {
        if (writer === nextWriter) writer = undefined
      }
    },
    acceptHydratedTheme(theme: unknown) {
      if (pending || snapshot.error || theme === 'system' || theme === undefined) return
      try {
        snapshot = { ...snapshot, theme: resolve(read().theme) }
      } catch (error) {
        snapshot = { ...snapshot, error: message(error) }
      }
      publish()
    }
  }
}

export const platformAppearance = createPlatformAppearance({
  storage: () => browserStorage('localStorage'),
  prefersDark: () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  apply: (theme) => applyDocumentTheme(theme, { disableTransitions: false })
})

declare global {
  interface Window {
    CEPlatformAppearance?: typeof platformAppearance
  }
}

export function initializePlatformAppearance(): void {
  window.CEPlatformAppearance = platformAppearance
  platformAppearance.initialize()
}
