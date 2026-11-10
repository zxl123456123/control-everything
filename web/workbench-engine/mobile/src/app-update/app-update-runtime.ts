import Constants from 'expo-constants'
import { useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import {
  loadAppUpdatePreferences,
  saveAppUpdateCheck,
  saveDismissedAppUpdateVersion
} from '../storage/app-update-preferences'
import { createAppUpdateChecker, type AppUpdateState } from './app-update-checker'
import type { AppUpdateSource } from './app-update-source'

/**
 * Invariant: this app does not use expo-updates, so `expoConfig` is the manifest embedded in the
 * binary and its version is the binary's (app.json `version`, Android `versionName`). SDK 55
 * removed `Constants.nativeAppVersion`; adopting expo-updates would make this the update's version.
 */
export const installedAppVersion: string | null = Constants.expoConfig?.version ?? null

/** Platform distribution has no configured update channel. */
function resolveAppUpdateSource(): AppUpdateSource | null {
  return null
}

export const appUpdateChecker = createAppUpdateChecker({
  source: resolveAppUpdateSource(),
  installedVersion: installedAppVersion,
  now: () => Date.now(),
  setTimer: (run, delayMs) => setTimeout(run, delayMs),
  clearTimer: (handle) => clearTimeout(handle),
  subscribeForeground: (onForeground) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        onForeground()
      }
    })
    return () => subscription.remove()
  },
  loadPreferences: loadAppUpdatePreferences,
  saveCheck: saveAppUpdateCheck,
  saveDismissedVersion: saveDismissedAppUpdateVersion
})

export function useAppUpdateState(): AppUpdateState {
  return useSyncExternalStore(appUpdateChecker.subscribe, appUpdateChecker.getSnapshot)
}

/** Never open an upstream update URL in this platform distribution. */
export function openAppUpdate(_url: string): void {}
