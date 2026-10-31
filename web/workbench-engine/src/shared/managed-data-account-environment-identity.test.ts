import { expect, it } from 'vitest'
import {
  captureManagedDataAccountOriginalEnvironment,
  migrateManagedDataAccountEnvironmentIdentity,
  restoreManagedDataAccountEnvironment
} from './managed-data-account-environment'

it('moves opaque legacy metadata without changing its value and preserves WSL flags', () => {
  const env = {
    ORCA_DATA_ACCOUNT_PROVIDER: 'future-provider',
    ORCA_DATA_ACCOUNT_FUTURE_METADATA: '{"future":"opaque"}',
    WSLENV: 'ORCA_DATA_ACCOUNT_FUTURE_METADATA/u:PUBLIC/p'
  }
  const removed = ['ORCA_DATA_ACCOUNT_FUTURE_METADATA', 'ZKYQ_DATA_ACCOUNT_FUTURE_METADATA']
  migrateManagedDataAccountEnvironmentIdentity(env, removed)
  expect(env).toEqual({
    ZKYQ_DATA_ACCOUNT_PROVIDER: 'future-provider',
    ZKYQ_DATA_ACCOUNT_FUTURE_METADATA: '{"future":"opaque"}',
    WSLENV: 'ZKYQ_DATA_ACCOUNT_FUTURE_METADATA/u:PUBLIC/p'
  })
  expect(removed).toEqual(['ZKYQ_DATA_ACCOUNT_FUTURE_METADATA'])
  restoreManagedDataAccountEnvironment(env)
  expect(env).toHaveProperty('ZKYQ_DATA_ACCOUNT_FUTURE_METADATA', '{"future":"opaque"}')
})

it('checks every conflict before changing any marker, passthrough or deletion request', () => {
  const env = {
    ORCA_DATA_ACCOUNT_DATA_HOME: 'move-only-after-preflight',
    ORCA_DATA_ACCOUNT_ORIGINAL_ENV: 'private-old-snapshot',
    ZKYQ_DATA_ACCOUNT_ORIGINAL_ENV: 'private-current-snapshot',
    WSLENV: 'ORCA_DATA_ACCOUNT_DATA_HOME/p'
  }
  const before = structuredClone(env)
  const removed = ['ORCA_DATA_ACCOUNT_DATA_HOME']
  expect(() => migrateManagedDataAccountEnvironmentIdentity(env, removed)).toThrow(
    'Conflicting managed account'
  )
  expect(env).toEqual(before)
  expect(removed).toEqual(['ORCA_DATA_ACCOUNT_DATA_HOME'])
  try {
    migrateManagedDataAccountEnvironmentIdentity(env)
  } catch (error) {
    expect(String(error)).not.toContain('private-old-snapshot')
    expect(String(error)).not.toContain('private-current-snapshot')
  }
})

it('keeps explicit empty values and removes equivalent legacy duplicates idempotently', () => {
  const env = { ORCA_DATA_ACCOUNT_PROVIDER: '', ZKYQ_DATA_ACCOUNT_PROVIDER: '' }
  migrateManagedDataAccountEnvironmentIdentity(env)
  expect(env).toEqual({ ZKYQ_DATA_ACCOUNT_PROVIDER: '' })
  migrateManagedDataAccountEnvironmentIdentity(env)
  expect(env).toEqual({ ZKYQ_DATA_ACCOUNT_PROVIDER: '' })
})

it('captures only the current name and reads a legacy snapshot without rewriting its contents', () => {
  const env: Record<string, string> = {
    XDG_DATA_HOME: 'original-data',
    OPENCODE_DB: 'original.db',
    OPENCODE_AUTH_CONTENT: 'private-inline'
  }
  captureManagedDataAccountOriginalEnvironment(env)
  const snapshot = env.ZKYQ_DATA_ACCOUNT_ORIGINAL_ENV
  expect(snapshot).not.toContain('private-inline')
  delete env.ZKYQ_DATA_ACCOUNT_ORIGINAL_ENV
  Object.assign(env, {
    ORCA_DATA_ACCOUNT_ORIGINAL_ENV: snapshot,
    ORCA_DATA_ACCOUNT_PROVIDER: 'opencode',
    ORCA_DATA_ACCOUNT_DATA_HOME: 'selected-data',
    ORCA_DATA_ACCOUNT_STATE_HOME: 'selected-state',
    XDG_DATA_HOME: 'selected-data',
    XDG_STATE_HOME: 'selected-state',
    OPENCODE_AUTH_CONTENT: '',
    OPENCODE_DB: 'opencode.db'
  })
  restoreManagedDataAccountEnvironment(env)
  expect(env).toEqual({ XDG_DATA_HOME: 'original-data', OPENCODE_DB: 'original.db' })
})
