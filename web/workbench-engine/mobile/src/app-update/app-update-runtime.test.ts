import { expect, it, vi } from 'vitest'
const native = vi.hoisted(() => ({ load: vi.fn(), foreground: vi.fn(), openURL: vi.fn() }))
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '0.0.1' } } }))
vi.mock('react-native', () => ({
  AppState: { addEventListener: native.foreground },
  Platform: { OS: 'ios' }
}))
vi.mock('expo-linking', () => ({ openURL: native.openURL }))
vi.mock('../storage/app-update-preferences', () => ({
  EMPTY_APP_UPDATE_PREFERENCES: { lastCheckedAt: null, latest: null, dismissedVersion: null },
  loadAppUpdatePreferences: native.load,
  saveAppUpdateCheck: vi.fn(),
  saveDismissedAppUpdateVersion: vi.fn()
}))
import { appUpdateChecker, openAppUpdate } from './app-update-runtime'
it('fixed platform distribution never starts upstream update work or opens upstream links', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const stop = appUpdateChecker.start()
  expect(await appUpdateChecker.checkNow()).toBe('failed')
  openAppUpdate('https://example.test/upstream')
  expect(native.load).not.toHaveBeenCalled()
  expect(native.foreground).not.toHaveBeenCalled()
  expect(native.openURL).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  stop()
  vi.unstubAllGlobals()
})
