import * as SecureStore from 'expo-secure-store'

export type AccountRecovery = {
  version: 1
  issuer: string
  clientId: string
  redirectUri: string
  nativeIdentity: string
  subject: string
  authorizationNonce: string
  optionalAuthTime?: number
  refreshToken: string
}
const KEY = 'platform.account.v1'
const OPTIONS = {
  keychainService: 'control-everything.platform-account.v1',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
}

export function parseAccountRecovery(value: string): AccountRecovery {
  const record: unknown = JSON.parse(value)
  if (!record || typeof record !== 'object' || Array.isArray(record))
    throw new Error('Invalid account record')
  const raw = record as Record<string, unknown>
  const keys = [
    'issuer',
    'clientId',
    'redirectUri',
    'nativeIdentity',
    'subject',
    'authorizationNonce',
    'refreshToken'
  ]
  if (
    raw.version !== 1 ||
    keys.some((key) => typeof raw[key] !== 'string' || !(raw[key] as string).trim()) ||
    Object.keys(raw).some((key) => !['version', ...keys, 'optionalAuthTime'].includes(key)) ||
    (raw.optionalAuthTime !== undefined &&
      (!Number.isSafeInteger(raw.optionalAuthTime) || (raw.optionalAuthTime as number) < 0))
  ) {
    throw new Error('Invalid account record')
  }
  return raw as AccountRecovery
}

export const platformAccountStore = {
  async read(): Promise<AccountRecovery | null> {
    const value = await SecureStore.getItemAsync(KEY, OPTIONS)
    return value === null ? null : parseAccountRecovery(value)
  },
  async write(record: AccountRecovery): Promise<void> {
    const value = JSON.stringify(record)
    parseAccountRecovery(value)
    await SecureStore.setItemAsync(KEY, value, OPTIONS)
  },
  async remove(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY, OPTIONS)
  }
}
