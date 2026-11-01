import { expect, it } from 'vitest'
import {
  buildInstalledConfig,
  createAntigravityManagedCommandMatcher,
  removeInstalledConfig
} from './hooks-json-bundle'
import { ANTIGRAVITY_EVENTS } from './hook-events'
import type { HooksConfig } from '../agent-hooks/installer-utils'
import { AntigravityHookService } from './hook-service'
import { createAgentHookMemorySftp } from '../agent-hooks/agent-hook-memory-sftp.test-fixture'

const command = () => '/example/.zkyq/agent-hooks/antigravity-hook.sh'
const managed = { type: 'command', command: '/example/.orca/agent-hooks/antigravity-hook.sh' }
const user = { type: 'command', command: 'user-hook', timeout: 17 }
const install = (config: HooksConfig) =>
  buildInstalledConfig(config, command, createAntigravityManagedCommandMatcher())

it('moves a disabled legacy bundle and preserves user handlers and metadata', () => {
  const config: HooksConfig = {
    other: { enabled: false },
    'orca-status': { enabled: false, note: 'retained', Stop: [managed, user] }
  }
  install(config)
  expect(config).not.toHaveProperty('orca-status')
  expect(config.other).toEqual({ enabled: false })
  const bundle = config['zkyq-status'] as Record<string, unknown>
  expect(bundle).toMatchObject({
    enabled: false,
    note: 'retained',
    Stop: [user, expect.anything()]
  })
  for (const { eventName } of ANTIGRAVITY_EVENTS) expect(bundle[eventName]).toBeDefined()
})

it('merges both bundles without losing either user hook or duplicating managed hooks', () => {
  const second = { ...user, command: 'second-user-hook' }
  const config: HooksConfig = {
    'orca-status': { enabled: true, Stop: [managed, user] },
    'zkyq-status': { enabled: true, Stop: [second, managed] }
  }
  install(config)
  const once = JSON.stringify(config)
  install(config)
  expect(JSON.stringify(config)).toBe(once)
  expect(config).not.toHaveProperty('orca-status')
  expect((config['zkyq-status'] as Record<string, unknown>).Stop).toEqual([
    user,
    second,
    expect.objectContaining({ command: command() })
  ])
})

it('validates conflicting metadata before changing either bundle', () => {
  const config: HooksConfig = {
    'orca-status': { enabled: false, Stop: [user] },
    'zkyq-status': { enabled: true, Stop: [managed] }
  }
  const before = JSON.stringify(config)
  expect(() => install(config)).toThrow('conflicting Antigravity hook bundle')
  expect(JSON.stringify(config)).toBe(before)
})

it('preserves metadata named __proto__ as an own JSON field', () => {
  const config: HooksConfig = JSON.parse('{"orca-status":{"__proto__":{"fixture":true}}}')
  install(config)
  const bundle = config['zkyq-status'] as Record<string, unknown>
  expect(Object.prototype.hasOwnProperty.call(bundle, '__proto__')).toBe(true)
  expect(bundle.__proto__).toEqual({ fixture: true })
  expect(Object.getPrototypeOf(bundle)).toBe(Object.prototype)
})

it.each(['orca-status', 'zkyq-status'])('does not replace a malformed %s value', (name) => {
  const config: HooksConfig = { [name]: 'user-owned-value' }
  expect(() => install(config)).toThrow('Antigravity hook bundle')
  expect(config).toEqual({ [name]: 'user-owned-value' })
})

it('removes both generations of managed hooks while retaining the user bundle', () => {
  const config: HooksConfig = {
    'orca-status': { enabled: false, Stop: [managed, user] },
    'zkyq-status': { enabled: false, Stop: [managed] }
  }
  removeInstalledConfig(config)
  expect(config).toEqual({ 'zkyq-status': { enabled: false, Stop: [user] } })
})

it.each(['previous', 'current'] as const)(
  'treats an omitted enabled flag as active when the %s bundle is disabled',
  (disabled) => {
    const config: HooksConfig = {
      'orca-status': { ...(disabled === 'previous' ? { enabled: false } : {}), Stop: [user] },
      'zkyq-status': { ...(disabled === 'current' ? { enabled: false } : {}), Stop: [managed] }
    }
    const before = JSON.stringify(config)
    expect(() => install(config)).toThrow('conflicting Antigravity hook bundle')
    expect(JSON.stringify(config)).toBe(before)
  }
)

it('migrates the remote bundle while preserving unrelated hooks and its disabled state', async () => {
  const path = '/example/remote/.gemini/config/hooks.json'
  const config = {
    other: { enabled: false },
    'orca-status': { enabled: false, Stop: [managed, user] }
  }
  const fixture = createAgentHookMemorySftp({ [path]: JSON.stringify(config) })
  expect(
    (await new AntigravityHookService().installRemote(fixture.sftp, '/example/remote')).state
  ).toBe('installed')
  const actual = JSON.parse(fixture.fs.files.get(path)!)
  expect(actual).not.toHaveProperty('orca-status')
  expect(actual.other).toEqual(config.other)
  expect(actual['zkyq-status']).toMatchObject({ enabled: false, Stop: [user, expect.anything()] })
})

it('does not publish remote scripts or change settings when bundle metadata conflicts', async () => {
  const path = '/example/remote/.gemini/config/hooks.json'
  const raw = JSON.stringify({
    'orca-status': { enabled: false },
    'zkyq-status': { enabled: true }
  })
  const fixture = createAgentHookMemorySftp({ [path]: raw })
  expect(
    (await new AntigravityHookService().installRemote(fixture.sftp, '/example/remote')).state
  ).toBe('error')
  expect(Object.fromEntries(fixture.fs.files)).toEqual({ [path]: raw })
})
