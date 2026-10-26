import { useEffect } from 'react'
import { buildAppFontFamily } from '@/lib/app-font-family'
import { applyDocumentTheme } from '../lib/document-theme'
import {
  fixedApplicationTheme,
  isPlatformAppearance,
  platformAppearance
} from '../web/platform-appearance'
import { useAppStore } from '../store'

/** Applies the settings-driven theme and app font to the document root. */
export function useDocumentAppearance(): void {
  const theme = useAppStore((s) => s.settings?.theme)
  const appFontFamily = useAppStore((s) => s.settings?.appFontFamily)

  const updateSettingsOrThrow = useAppStore((s) => s.updateSettingsOrThrow)
  const platform = isPlatformAppearance()
  const hydrated = theme !== undefined

  useEffect(() => {
    if (!platform || !hydrated) return
    return platformAppearance.registerWriter(
      (next) => updateSettingsOrThrow({ theme: next }),
      useAppStore.getState().settings?.theme
    )
  }, [platform, updateSettingsOrThrow, hydrated])

  useEffect(() => {
    if (!theme) return
    if (platform) {
      platformAppearance.acceptHydratedTheme(theme)
      return
    }
    const fixed = fixedApplicationTheme(theme)
    if (theme === 'system') {
      void updateSettingsOrThrow({ theme: fixed }).catch((error) =>
        console.error('Failed to save theme:', error)
      )
    }
    applyDocumentTheme(fixed)
  }, [theme, platform, updateSettingsOrThrow])

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--app-font-family',
      buildAppFontFamily(appFontFamily)
    )
  }, [appFontFamily])
}
