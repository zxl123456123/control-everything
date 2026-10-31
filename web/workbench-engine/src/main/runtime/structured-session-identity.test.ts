import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { readInjectedAgentSessionId } from '../../shared/agent-session-caller-env'
import { piRpcSessionlessEnvironment } from '../pi/rpc-launch'
import { getInheritedAgentSessionStampEnvKeysToDelete } from '../ipc/pty/host-env/pi-agent'
import { resolveProviderChildEnv } from '../provider-process/provider-process-launch'
import { sealStructuredSessionChild } from './structured-session-child-env'

describe('structured session caller identity', () => {
  it('spawns a child with its own new identity and no inherited legacy caller', () => {
    const sealed = sealStructuredSessionChild({
      sessionId: 'fixture-new',
      spawnToken: 'fixture-token',
      env: {
        ORCA_AGENT_SESSION_ID: 'fixture-old',
        ZKYQ_AGENT_SESSION_ID: 'fixture-parent',
        ORCA_STRUCTURED_SESSION: 'inherited',
        ZKYQ_STRUCTURED_SESSION: 'inherited',
        ORCA_AGENT_SESSION_SPAWN_TOKEN: 'inherited',
        ZKYQ_AGENT_SESSION_SPAWN_TOKEN: 'inherited'
      },
      inheritedEnvToDelete: ['ZKYQ_AGENT_SESSION_SPAWN_TOKEN']
    })
    const env = resolveProviderChildEnv(sealed, {
      ...process.env,
      ORCA_AGENT_SESSION_ID: 'fixture-parent',
      ORCA_STRUCTURED_SESSION: 'inherited',
      ORCA_AGENT_SESSION_SPAWN_TOKEN: 'inherited'
    })
    const child = spawnSync(
      process.execPath,
      [
        '-e',
        'process.stdout.write(JSON.stringify([process.env.ZKYQ_AGENT_SESSION_ID, process.env.ORCA_AGENT_SESSION_ID ?? null, process.env.ZKYQ_STRUCTURED_SESSION, process.env.ORCA_STRUCTURED_SESSION ?? null, process.env.ZKYQ_AGENT_SESSION_SPAWN_TOKEN, process.env.ORCA_AGENT_SESSION_SPAWN_TOKEN ?? null]))'
      ],
      { env, encoding: 'utf8', timeout: 10000, windowsHide: true }
    )
    expect(child.status, child.stderr).toBe(0)
    expect(JSON.parse(child.stdout)).toEqual([
      'fixture-new',
      null,
      '1',
      null,
      'fixture-token',
      null
    ])
    expect(sealed.commandEnv.ZKYQ_AGENT_SESSION_ID).toBe('fixture-new')
    expect(sealed.commandEnv.ZKYQ_STRUCTURED_SESSION).toBe('1')
    expect(sealed.commandEnv).not.toHaveProperty('ORCA_STRUCTURED_SESSION')
    expect(sealed.commandEnv).not.toHaveProperty('ORCA_AGENT_SESSION_SPAWN_TOKEN')
    expect(sealed.commandEnv).not.toHaveProperty('ZKYQ_AGENT_SESSION_SPAWN_TOKEN')
  })

  it('strips both generations of identity from sessionless Pi children', () => {
    const result = piRpcSessionlessEnvironment({
      ZKYQ_AGENT_SESSION_ID: 'fixture-new',
      ORCA_AGENT_SESSION_ID: 'fixture-old',
      ZKYQ_STRUCTURED_SESSION: '1',
      ORCA_STRUCTURED_SESSION: '1',
      ORCA_AGENT_SESSION_SPAWN_TOKEN: 'inherited',
      ZKYQ_AGENT_SESSION_SPAWN_TOKEN: 'inherited'
    })
    expect(result.env).not.toHaveProperty('ZKYQ_AGENT_SESSION_ID')
    expect(result.env).not.toHaveProperty('ORCA_AGENT_SESSION_ID')
    expect(result.envToDelete).toContain('ZKYQ_AGENT_SESSION_ID')
    expect(result.envToDelete).toContain('ORCA_AGENT_SESSION_ID')
    expect(result.env).not.toHaveProperty('ZKYQ_STRUCTURED_SESSION')
    expect(result.env).not.toHaveProperty('ORCA_STRUCTURED_SESSION')
    expect(result.envToDelete).toContain('ZKYQ_STRUCTURED_SESSION')
    expect(result.envToDelete).toContain('ORCA_STRUCTURED_SESSION')
    for (const key of ['ZKYQ_AGENT_SESSION_SPAWN_TOKEN', 'ORCA_AGENT_SESSION_SPAWN_TOKEN']) {
      expect(result.env).not.toHaveProperty(key)
      expect(result.envToDelete).toContain(key)
    }
    const terminalDeletes = getInheritedAgentSessionStampEnvKeysToDelete({
      ZKYQ_AGENT_SESSION_ID: 'fixture-new',
      ORCA_AGENT_SESSION_ID: 'fixture-old'
    })
    expect(terminalDeletes).toContain('ZKYQ_AGENT_SESSION_ID')
    expect(terminalDeletes).toContain('ORCA_AGENT_SESSION_ID')
    expect(terminalDeletes).toContain('ZKYQ_STRUCTURED_SESSION')
    expect(terminalDeletes).toContain('ORCA_STRUCTURED_SESSION')
    expect(terminalDeletes).toContain('ZKYQ_AGENT_SESSION_SPAWN_TOKEN')
    expect(terminalDeletes).toContain('ORCA_AGENT_SESSION_SPAWN_TOKEN')
  })

  it('rejects conflicting identities before creating a caller', () => {
    expect(() =>
      readInjectedAgentSessionId({
        ZKYQ_AGENT_SESSION_ID: 'fixture-new',
        ORCA_AGENT_SESSION_ID: 'fixture-old'
      })
    ).toThrow('Conflicting agent session identities')
  })
})
