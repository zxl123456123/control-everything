import type { GlobalSettings } from '../../../shared/global-settings-types'
import { buildAppFontFamily } from './app-font-family'
import { applyDocumentTheme, resolveDocumentTheme } from './document-theme'

let legacySystemTheme: 'light' | 'dark' | undefined

/** Each renderer resolves legacy system input once; settings remain the only authority. */
export function applyStandaloneAppearance(settings: GlobalSettings | null): 'light' | 'dark' {
  const preference = settings?.theme
  const theme =
    preference === 'system'
      ? (legacySystemTheme ??= resolveDocumentTheme('system') ? 'dark' : 'light')
      : preference === 'dark'
        ? 'dark'
        : 'light'
  applyDocumentTheme(theme, { disableTransitions: false })
  document.documentElement.style.setProperty(
    '--app-font-family',
    buildAppFontFamily(settings?.appFontFamily)
  )
  return theme
}
