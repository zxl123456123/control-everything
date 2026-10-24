import { beforeEach, describe, expect, it, vi } from 'vitest'
const native = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7
}))
vi.mock('expo-secure-store', () => native)
import { platformAccountStore, type AccountRecovery } from './secure-store'
const record: AccountRecovery = {
  version: 1,
  issuer: 'https://identity.example.test/realm',
  clientId: 'mobile-public',
  redirectUri: 'com.example.workbench:/oauth/callback',
  nativeIdentity: 'native',
  subject: 'subject',
  authorizationNonce: 'nonce',
  refreshToken: 'synthetic-refresh'
}
const options = { keychainService: 'control-everything.platform-account.v1', keychainAccessible: 7 }
beforeEach(() => vi.resetAllMocks())
describe('native account storage', () => {
  it('uses its own key and this-device-only native service for every operation', async () => {
    native.getItemAsync.mockResolvedValue(JSON.stringify(record))
    expect(await platformAccountStore.read()).toEqual(record)
    await platformAccountStore.write(record)
    await platformAccountStore.remove()
    expect(native.getItemAsync).toHaveBeenCalledWith('platform.account.v1', options)
    expect(native.setItemAsync).toHaveBeenCalledWith(
      'platform.account.v1',
      JSON.stringify(record),
      options
    )
    expect(native.deleteItemAsync).toHaveBeenCalledWith('platform.account.v1', options)
  })
  it('only null means no saved account', async () => {
    native.getItemAsync.mockResolvedValue(null)
    expect(await platformAccountStore.read()).toBeNull()
    native.getItemAsync.mockResolvedValue('')
    await expect(platformAccountStore.read()).rejects.toBeDefined()
  })
  it.each(['read', 'write', 'remove'] as const)(
    'propagates native %s failures',
    async (operation) => {
      const error = new Error('synthetic failure')
      native[
        operation === 'read'
          ? 'getItemAsync'
          : operation === 'write'
            ? 'setItemAsync'
            : 'deleteItemAsync'
      ].mockRejectedValue(error)
      await expect(
        operation === 'write'
          ? platformAccountStore.write(record)
          : platformAccountStore[operation]()
      ).rejects.toBe(error)
    }
  )
  it.each([
    { ...record, version: 2 },
    { ...record, subject: '' },
    { ...record, accessToken: 'forbidden' },
    { ...record, optionalAuthTime: 1.5 }
  ])('rejects corrupt or expanded records %#', async (value) => {
    native.getItemAsync.mockResolvedValue(JSON.stringify(value))
    await expect(platformAccountStore.read()).rejects.toBeDefined()
  })
})
