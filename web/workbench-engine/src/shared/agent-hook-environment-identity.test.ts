import { expect, it } from 'vitest'
import {
  AGENT_HOOK_IDENTITY_SUFFIXES,
  migrateAgentHookEnvironmentIdentity
} from './agent-hook-environment-identity'
import { parseAgentHookEndpointFile } from './agent-hook-endpoint-file'

it('moves an inherited Antigravity event and its WSL flags to the current identity', () => {
  const env = { ORCA_ANTIGRAVITY_EVENT: 'PreToolUse', WSLENV: 'ORCA_ANTIGRAVITY_EVENT/u' }
  migrateAgentHookEnvironmentIdentity(env)
  expect(env).toEqual({ ZKYQ_ANTIGRAVITY_EVENT: 'PreToolUse', WSLENV: 'ZKYQ_ANTIGRAVITY_EVENT/u' })
})

it('moves Pi-family paths, drafts and WSL flags without changing public agent settings', () => {
  const env = {
    ORCA_PI_SOURCE_AGENT_DIR: '/fixture/用户 config',
    ORCA_OMP_PREFILL: 'Keep the draft\nwith details',
    ORCA_PRIME_AGENT_STATUS_OWNED: '123',
    PI_CODING_AGENT_DIR: '/fixture/public',
    WSLENV: 'ORCA_PI_SOURCE_AGENT_DIR/p:ORCA_OMP_PREFILL/u:PI_CODING_AGENT_DIR/u'
  }
  const deleted = ['ORCA_PRIME_AGENT_STATUS_OWNED', 'ZKYQ_PRIME_AGENT_STATUS_OWNED']
  migrateAgentHookEnvironmentIdentity(env, deleted)
  expect(env).toEqual({
    ZKYQ_PI_SOURCE_AGENT_DIR: '/fixture/用户 config',
    ZKYQ_OMP_PREFILL: 'Keep the draft\nwith details',
    ZKYQ_PRIME_AGENT_STATUS_OWNED: '123',
    PI_CODING_AGENT_DIR: '/fixture/public',
    WSLENV: 'ZKYQ_PI_SOURCE_AGENT_DIR/p:ZKYQ_OMP_PREFILL/u:PI_CODING_AGENT_DIR/u'
  })
  expect(deleted).toEqual(['ZKYQ_PRIME_AGENT_STATUS_OWNED'])
})

it.each(AGENT_HOOK_IDENTITY_SUFFIXES)(
  'migrates the declared %s key in its embedded implementation',
  (suffix) => {
    const embedded = new Function(
      `return (${migrateAgentHookEnvironmentIdentity.toString()})`
    )() as typeof migrateAgentHookEnvironmentIdentity
    const env = { [`ORCA_${suffix}`]: 'fixture-value' }
    embedded(env)
    expect(env).toEqual({ [`ZKYQ_${suffix}`]: 'fixture-value' })
  }
)

it('migrates ownership, coordinates, deletion keys and WSL flags without touching public variables', () => {
  const env: Record<string, string | undefined> = {
    ORCA_PANE_KEY: 'tab:leaf',
    ORCA_AGENT_HOOK_TOKEN: 'fixture-token',
    ORCA_AGENT_PANE: 'tab:leaf',
    ORCA_WORKSPACE_ROOT: '/fixture/space 中文',
    WSLENV:
      'ORCA_PANE_KEY/u:ORCA_WORKSPACE_ROOT/p:ORCA_AGENT_HOOK_TOKEN/w:PUBLIC/l:ORCA_PANE_KEY_EXTRA/p',
    PUBLIC: 'keep',
    OPENCODE_CONFIG_DIR: '/fixture/config'
  }
  const deleted = ['ORCA_PANE_KEY', 'ZKYQ_PANE_KEY', 'PUBLIC']
  migrateAgentHookEnvironmentIdentity(env, deleted)
  expect(env).toEqual({
    ZKYQ_PANE_KEY: 'tab:leaf',
    ZKYQ_AGENT_HOOK_TOKEN: 'fixture-token',
    ZKYQ_AGENT_PANE: 'tab:leaf',
    ZKYQ_WORKSPACE_ROOT: '/fixture/space 中文',
    WSLENV:
      'ZKYQ_PANE_KEY/u:ZKYQ_WORKSPACE_ROOT/p:ZKYQ_AGENT_HOOK_TOKEN/w:PUBLIC/l:ORCA_PANE_KEY_EXTRA/p',
    PUBLIC: 'keep',
    OPENCODE_CONFIG_DIR: '/fixture/config'
  })
  expect(deleted).toEqual(['ZKYQ_PANE_KEY', 'PUBLIC'])
  const snapshot = { ...env }
  migrateAgentHookEnvironmentIdentity(env, deleted)
  expect(env).toEqual(snapshot)
})

it('validates all conflicts before changing environment values or exposing their content', () => {
  const env = {
    ORCA_PANE_KEY: 'old-pane',
    ORCA_AGENT_HOOK_TOKEN: 'older-secret',
    ZKYQ_AGENT_HOOK_TOKEN: 'current-secret'
  }
  const before = { ...env }
  const deleted = ['ORCA_PANE_KEY']
  expect(() => migrateAgentHookEnvironmentIdentity(env, deleted)).toThrow(
    'ZKYQ_AGENT_HOOK_TOKEN and ORCA_AGENT_HOOK_TOKEN'
  )
  expect(env).toEqual(before)
  expect(deleted).toEqual(['ORCA_PANE_KEY'])
  try {
    migrateAgentHookEnvironmentIdentity(env)
  } catch (error) {
    expect(String(error)).not.toContain('older-secret')
    expect(String(error)).not.toContain('current-secret')
  }
})

it('keeps explicit launch values ahead of migrated inheritance and embeds without module dependencies', () => {
  const embedded = new Function(
    `return (${migrateAgentHookEnvironmentIdentity.toString()})`
  )() as typeof migrateAgentHookEnvironmentIdentity
  const inherited = { ORCA_AGENT_HOOK_PORT: '10001' }
  const explicit = { ZKYQ_AGENT_HOOK_PORT: '10002' }
  embedded(inherited)
  embedded(explicit)
  expect({ ...inherited, ...explicit }).toEqual({ ZKYQ_AGENT_HOOK_PORT: '10002' })
})

it.each(['ORCA', 'ZKYQ'])(
  'reads surviving %s endpoint files without changing their values',
  (prefix) => {
    const file = ['PORT=10001', 'TOKEN=fixture-token', 'ENV=production', 'VERSION=1']
      .map((line) => `set ${prefix}_AGENT_HOOK_${line}`)
      .join('\r\n')
    expect(parseAgentHookEndpointFile(file)).toEqual({
      port: '10001',
      token: 'fixture-token',
      env: 'production',
      version: '1'
    })
    expect(() =>
      parseAgentHookEndpointFile(
        file + `\nset ${prefix === 'ORCA' ? 'ZKYQ' : 'ORCA'}_AGENT_HOOK_TOKEN=other`
      )
    ).toThrow('Conflicting agent hook endpoint fields')
  }
)
