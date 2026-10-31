import { expect, it } from 'vitest'
import {
  ORCAD_MANAGED_ACTIVATION_ROOT_ENV,
  ORCAD_VERSION_ENV,
  applyOrcadLaunchEnvironmentOverrides,
  migrateOrcadManagedLaunchEnvironment,
  orcadLaunchEnvironment,
  parseOrcadLaunchEnvironmentVersion
} from './orcad-managed-launch-env'
import { readOrcadE2EIdleTimeoutMs } from './orcad-idle-exit'
import { resolveOrcadManagedIdleExit } from '../main/orcad/orcad-managed-idle-exit'

it('migrates frozen server launch inputs and WSL flags without changing their values', () => {
  const env: NodeJS.ProcessEnv = {
    ORCA_VERSION: '0.1.0+frozen',
    ORCA_ORCAD_MANAGED_ACTIVATION_ROOT: '/owned/activation',
    ORCA_E2E_ORCAD_IDLE_TIMEOUT_MS: '1234',
    WSLENV:
      'ORCA_VERSION:ORCA_ORCAD_MANAGED_ACTIVATION_ROOT/up:ORCA_E2E_ORCAD_IDLE_TIMEOUT_MS/u:OTHER',
    USER_NOTE: 'preserved'
  }
  migrateOrcadManagedLaunchEnvironment(env)
  expect(env).toEqual({
    ZKYQ_VERSION: '0.1.0+frozen',
    ZKYQ_SERVER_MANAGED_ACTIVATION_ROOT: '/owned/activation',
    ZKYQ_E2E_SERVER_IDLE_TIMEOUT_MS: '1234',
    USER_NOTE: 'preserved',
    WSLENV:
      'ZKYQ_VERSION:ZKYQ_SERVER_MANAGED_ACTIVATION_ROOT/up:ZKYQ_E2E_SERVER_IDLE_TIMEOUT_MS/u:OTHER'
  })
  expect(resolveOrcadManagedIdleExit(env)).toEqual({
    activationRoot: '/owned/activation',
    timeoutMs: 1234
  })
  expect(readOrcadE2EIdleTimeoutMs(env)).toBe(1234)
})

it.each([
  ['ORCA_VERSION', 'ZKYQ_VERSION'],
  ['ORCA_ORCAD_MANAGED_ACTIVATION_ROOT', 'ZKYQ_SERVER_MANAGED_ACTIVATION_ROOT'],
  ['ORCA_E2E_ORCAD_IDLE_TIMEOUT_MS', 'ZKYQ_E2E_SERVER_IDLE_TIMEOUT_MS']
])('refuses conflicting %s before changing any field', (old, current) => {
  const env = {
    ORCA_VERSION: 'same-version',
    ZKYQ_VERSION: 'same-version',
    [old]: 'private-one',
    [current]: 'private-two'
  }
  const before = { ...env }
  let message = ''
  try {
    migrateOrcadManagedLaunchEnvironment(env)
  } catch (error) {
    message = String(error)
  }
  expect(message).toContain('Conflicting server environment variables')
  expect(message).not.toContain('private-one')
  expect(message).not.toContain('private-two')
  expect(env).toEqual(before)
})

it('keeps the caller environment intact while reading frozen idle settings', () => {
  const env = {
    ORCA_ORCAD_MANAGED_ACTIVATION_ROOT: '/owned/root',
    ORCA_E2E_ORCAD_IDLE_TIMEOUT_MS: '1234'
  }
  expect(resolveOrcadManagedIdleExit(env)).toEqual({
    activationRoot: '/owned/root',
    timeoutMs: 1234
  })
  expect(env).toEqual({
    ORCA_ORCAD_MANAGED_ACTIVATION_ROOT: '/owned/root',
    ORCA_E2E_ORCAD_IDLE_TIMEOUT_MS: '1234'
  })
})

it('selects only the frozen or current format named by the installed package', () => {
  expect(parseOrcadLaunchEnvironmentVersion(null)).toBe(0)
  expect(parseOrcadLaunchEnvironmentVersion('{"version":"0.1.0"}')).toBe(0)
  expect(parseOrcadLaunchEnvironmentVersion('{"zkyqManagedLaunchEnvironment":1}')).toBe(1)
  expect(() => parseOrcadLaunchEnvironmentVersion('{"zkyqManagedLaunchEnvironment":2}')).toThrow(
    'Unsupported'
  )
  expect(() => parseOrcadLaunchEnvironmentVersion('invalid')).toThrow()
  const original = {
    [ORCAD_VERSION_ENV]: '0.1.0+current',
    [ORCAD_MANAGED_ACTIVATION_ROOT_ENV]: '/root',
    WSLENV: 'ZKYQ_VERSION/u'
  }
  expect(orcadLaunchEnvironment(original, 0)).toEqual({
    ORCA_VERSION: '0.1.0+current',
    ORCA_ORCAD_MANAGED_ACTIVATION_ROOT: '/root',
    WSLENV: 'ORCA_VERSION/u'
  })
  expect(orcadLaunchEnvironment(original, 1)).toEqual(original)
})

it('replaces stale inherited Windows coordinates before publishing one identity', () => {
  const env: NodeJS.ProcessEnv = {
    ORCA_VERSION: 'old-shell',
    ORCA_ORCAD_MANAGED_ACTIVATION_ROOT: '/previous',
    USER_NOTE: 'preserved'
  }
  applyOrcadLaunchEnvironmentOverrides(env, {
    ZKYQ_VERSION: 'selected-slot',
    ZKYQ_SERVER_MANAGED_ACTIVATION_ROOT: '/selected'
  })
  expect(env).toEqual({
    ZKYQ_VERSION: 'selected-slot',
    ZKYQ_SERVER_MANAGED_ACTIVATION_ROOT: '/selected',
    USER_NOTE: 'preserved'
  })
  applyOrcadLaunchEnvironmentOverrides(env, {
    ORCA_VERSION: 'rollback-slot',
    ORCA_ORCAD_MANAGED_ACTIVATION_ROOT: '/rollback'
  })
  expect(env).toEqual({
    ORCA_VERSION: 'rollback-slot',
    ORCA_ORCAD_MANAGED_ACTIVATION_ROOT: '/rollback',
    USER_NOTE: 'preserved'
  })
})
