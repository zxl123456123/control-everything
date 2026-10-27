import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPlatformAccountConfig } from './config'
import { readPlatformBrowserPortal } from './browser-portal'

const require = createRequire(import.meta.url)
const build = require('../../app.config.js')
const env = {
  CE_NATIVE_REMOTE_ORIGIN: 'https://workbench.example.test',
  CE_NATIVE_OIDC_ISSUER: 'https://identity.example.test/realms/workbench',
  CE_NATIVE_OIDC_CLIENT_ID: 'mobile-public',
  CE_NATIVE_OAUTH_SCHEME: 'com.example.workbench',
  CE_NATIVE_IOS_BUNDLE_ID: 'com.example.workbench',
  CE_NATIVE_ANDROID_PACKAGE: 'com.example.workbench'
}
function config() {
  Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value))
  return build({
    config: {
      scheme: 'orca',
      ios: {},
      android: {},
      extra: { existing: true },
      plugins: ['expo-notifications']
    }
  })
}
afterEach(() => vi.unstubAllEnvs())
describe('native public account configuration', () => {
  it('loads the real build config, preserves pairing and derives one exact callback', () => {
    const value = config()
    expect(value.scheme).toEqual(['orca', 'com.example.workbench'])
    expect(value.extra.existing).toBe(true)
    expect(readPlatformBrowserPortal(value)).toEqual({
      status: 'ready',
      origin: 'https://workbench.example.test',
      url: 'https://workbench.example.test/remote'
    })
    expect(value.plugins[0][1].enableBackgroundRemoteNotifications).toBe(true)
    expect(readPlatformAccountConfig(value, 'ios')).toMatchObject({
      status: 'ready',
      config: { redirectUri: 'com.example.workbench:/oauth/callback' }
    })
    expect(readPlatformAccountConfig(value, 'android').status).toBe('ready')
    expect(readPlatformAccountConfig(value, 'web').status).toBe('invalid')
  })
  it('missing public values are a state, never an upstream fallback', () => {
    Object.keys(env).forEach((key) => vi.stubEnv(key, ''))
    const value = build({ config: { scheme: 'orca', ios: {}, android: {} } })
    expect(readPlatformAccountConfig(value, 'ios').status).toBe('missing')
    expect(value.extra.platformAccount.redirectUri).toBe('')
    expect(readPlatformBrowserPortal(value).status).toBe('missing')
  })
  it('supports the browser workspace independently of the native OAuth client', () => {
    Object.keys(env).forEach((key) => vi.stubEnv(key, ''))
    vi.stubEnv('CE_NATIVE_REMOTE_ORIGIN', 'https://workbench.example.test')
    const value = build({ config: { scheme: 'orca', ios: {}, android: {} } })
    expect(readPlatformAccountConfig(value, 'ios').status).toBe('missing')
    expect(readPlatformBrowserPortal(value)).toMatchObject({
      status: 'ready',
      url: 'https://workbench.example.test/remote'
    })
  })
  it.each([
    ['issuer', 'http://identity.example.test/realm'],
    ['issuer', 'https://a@identity.example.test/realm'],
    ['issuer', 'https://identity.example.test/realm?x=1'],
    ['issuer', 'https://identity.example.test/realm#fragment'],
    ['issuer', 'https://identity.example.test/a/../realm'],
    ['issuer', 'https://identity.example.test/%2frealm'],
    ['issuer', 'https://identity.example.test/ realm'],
    ['clientId', ''],
    ['scheme', 'orca'],
    ['scheme', 'exp'],
    ['scheme', 'https'],
    ['scheme', 'Com.example.app'],
    ['iosBundleId', 'com.stably.orca.mobile'],
    ['androidPackage', 'com.stably.orca.mobile'],
    ['redirectUri', 'com.example.workbench://oauth/callback']
  ])('rejects invalid %s case %#', (key, value) => {
    const raw = config()
    raw.extra.platformAccount[key] = value
    expect(readPlatformAccountConfig(raw, 'ios').status).toBe('invalid')
  })
  it('requires the embedded scheme and current native identity to match', () => {
    const raw = config()
    raw.scheme = ['orca']
    expect(readPlatformAccountConfig(raw, 'ios').status).toBe('invalid')
    raw.scheme.push('com.example.workbench')
    raw.ios.bundleIdentifier = 'com.example.other'
    expect(readPlatformAccountConfig(raw, 'ios').status).toBe('invalid')
  })
})
