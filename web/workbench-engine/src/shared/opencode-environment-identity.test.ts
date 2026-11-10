import { describe, expect, it } from 'vitest'
import { migrateOpenCodeEnvironmentIdentity } from './opencode-environment-identity'

describe('OpenCode platform environment identity', () => {
  const suffixes = [
    'CONFIG_DIR',
    'SOURCE_CONFIG_DIR',
    'AGENT',
    'PLUGIN_API',
    'STARTUP_PROMPT_BODY',
    'STARTUP_PROMPT_ENDPOINT',
    'STARTUP_PROMPT_NONCE',
    'STARTUP_PROMPT_SHA256',
    'STARTUP_PROMPT_SHELL'
  ]

  it('migrates every owned key without changing raw values or public agent configuration', () => {
    const env: Record<string, string> = { OPENCODE_CONFIG_DIR: '/user/config', OTHER: 'kept' }
    for (const suffix of suffixes) env[`ORCA_OPENCODE_${suffix}`] = ` value\n${suffix} `
    migrateOpenCodeEnvironmentIdentity(env)
    for (const suffix of suffixes) {
      expect(env[`ZKYQ_OPENCODE_${suffix}`]).toBe(` value\n${suffix} `)
      expect(env).not.toHaveProperty(`ORCA_OPENCODE_${suffix}`)
    }
    expect(env.OPENCODE_CONFIG_DIR).toBe('/user/config')
    expect(env.OTHER).toBe('kept')
    const first = { ...env }
    migrateOpenCodeEnvironmentIdentity(env)
    expect(env).toEqual(first)
  })

  it('checks the entire group before mutating or disclosing a conflicting value', () => {
    const env = {
      ORCA_OPENCODE_CONFIG_DIR: '/original/path',
      ORCA_OPENCODE_STARTUP_PROMPT_BODY: 'private retired prompt',
      ZKYQ_OPENCODE_STARTUP_PROMPT_BODY: 'private current prompt'
    }
    const before = { ...env }
    const deletions = ['ORCA_OPENCODE_CONFIG_DIR']
    expect(() => migrateOpenCodeEnvironmentIdentity(env, deletions)).toThrow(
      'Conflicting OpenCode environment variables: ZKYQ_OPENCODE_STARTUP_PROMPT_BODY and ORCA_OPENCODE_STARTUP_PROMPT_BODY.'
    )
    try {
      migrateOpenCodeEnvironmentIdentity(env)
    } catch (error) {
      expect(String(error)).not.toContain('private')
    }
    expect(env).toEqual(before)
    expect(deletions).toEqual(['ORCA_OPENCODE_CONFIG_DIR'])
  })

  it('preserves launch-layer overrides when the layers are migrated before merging', () => {
    const inherited: Record<string, string> = { ORCA_OPENCODE_CONFIG_DIR: '/parent/overlay' }
    const launch = { ZKYQ_OPENCODE_CONFIG_DIR: '/launch/overlay' }
    migrateOpenCodeEnvironmentIdentity(inherited)
    migrateOpenCodeEnvironmentIdentity(launch)
    expect({ ...inherited, ...launch }).toEqual({ ZKYQ_OPENCODE_CONFIG_DIR: '/launch/overlay' })
  })

  it('migrates only owned WSLENV names while retaining path and direction flags', () => {
    const env = {
      WSLENV:
        'PATH/l:ORCA_OPENCODE_CONFIG_DIR/pu:ORCA_OPENCODE_PLUGIN_API:ORCA_OPENCODE_CONFIG_DIR_EXTRA/w:OPENCODE_CONFIG_DIR/p'
    }
    migrateOpenCodeEnvironmentIdentity(env)
    expect(env.WSLENV).toBe(
      'PATH/l:ZKYQ_OPENCODE_CONFIG_DIR/pu:ZKYQ_OPENCODE_PLUGIN_API:ORCA_OPENCODE_CONFIG_DIR_EXTRA/w:OPENCODE_CONFIG_DIR/p'
    )
  })

  it('accepts matching values, preserves empty values and translates deletion requests once', () => {
    const env: Record<string, string> = {
      ORCA_OPENCODE_AGENT: 'opencode2',
      ZKYQ_OPENCODE_AGENT: 'opencode2',
      ORCA_OPENCODE_SOURCE_CONFIG_DIR: ''
    }
    const deletions = ['ORCA_OPENCODE_AGENT', 'ZKYQ_OPENCODE_AGENT', 'PATH']
    migrateOpenCodeEnvironmentIdentity(env, deletions)
    expect(env).toEqual({ ZKYQ_OPENCODE_AGENT: 'opencode2', ZKYQ_OPENCODE_SOURCE_CONFIG_DIR: '' })
    expect(deletions).toEqual(['ZKYQ_OPENCODE_AGENT', 'PATH'])
    expect(() =>
      migrateOpenCodeEnvironmentIdentity({ ORCA_OPENCODE_AGENT: 'old', ZKYQ_OPENCODE_AGENT: '' })
    ).toThrow('Conflicting OpenCode environment variables')
  })
})
