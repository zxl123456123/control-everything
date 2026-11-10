import { describe, expect, it } from 'vitest'
import {
  readEchoedAgentSessionSpawnToken,
  spawnTokenFromEnvironBlock
} from './agent-session-spawn-token-readback'

const IDENTITY = {
  hostId: 'local',
  pid: process.pid,
  processStartTimeMs: null,
  spawnToken: 'spawn-a'
}

describe('spawn token read-back', () => {
  it.each(['ZKYQ_AGENT_SESSION_SPAWN_TOKEN', 'ORCA_AGENT_SESSION_SPAWN_TOKEN'])(
    'finds %s in a NUL-separated environ block',
    (variable) => {
      const block = ['PATH=/usr/bin', `${variable}=tok-123`, 'HOME=/home/dev'].join('\0')
      expect(spawnTokenFromEnvironBlock(block)).toBe('tok-123')
    }
  )

  it('answers null for an absent or empty token instead of guessing', () => {
    expect(spawnTokenFromEnvironBlock(['PATH=/usr/bin', 'HOME=/home/dev'].join('\0'))).toBeNull()
    expect(spawnTokenFromEnvironBlock('ORCA_AGENT_SESSION_SPAWN_TOKEN=')).toBeNull()
    expect(spawnTokenFromEnvironBlock('ZKYQ_AGENT_SESSION_SPAWN_TOKEN=')).toBeNull()
    // A prefix collision is not a match.
    expect(spawnTokenFromEnvironBlock('ORCA_AGENT_SESSION_SPAWN_TOKEN_EXTRA=x')).toBeNull()
    expect(spawnTokenFromEnvironBlock('ZKYQ_AGENT_SESSION_SPAWN_TOKEN_EXTRA=x')).toBeNull()
  })

  it('refuses contradictory tokens while allowing the scan to inspect each key', () => {
    const block = 'ZKYQ_AGENT_SESSION_SPAWN_TOKEN=new\0ORCA_AGENT_SESSION_SPAWN_TOKEN=old\0'
    expect(spawnTokenFromEnvironBlock(block)).toBeNull()
    expect(spawnTokenFromEnvironBlock(block, 'ZKYQ_AGENT_SESSION_SPAWN_TOKEN')).toBe('new')
    expect(spawnTokenFromEnvironBlock(block, 'ORCA_AGENT_SESSION_SPAWN_TOKEN')).toBe('old')
    expect(spawnTokenFromEnvironBlock(block, 'CUSTOM_TOKEN')).toBeNull()
  })

  it('accepts matching tokens or a legacy token beside an empty current key', () => {
    expect(
      spawnTokenFromEnvironBlock(
        'ZKYQ_AGENT_SESSION_SPAWN_TOKEN=same\0ORCA_AGENT_SESSION_SPAWN_TOKEN=same\0'
      )
    ).toBe('same')
    expect(
      spawnTokenFromEnvironBlock(
        'ZKYQ_AGENT_SESSION_SPAWN_TOKEN=\0ORCA_AGENT_SESSION_SPAWN_TOKEN=old\0'
      )
    ).toBe('old')
  })

  it('answers null on platforms that hide process environments', async () => {
    await expect(readEchoedAgentSessionSpawnToken(IDENTITY, 'darwin')).resolves.toBeNull()
    await expect(readEchoedAgentSessionSpawnToken(IDENTITY, 'win32')).resolves.toBeNull()
  })

  it('answers null when the environ file is unreadable', async () => {
    await expect(
      readEchoedAgentSessionSpawnToken({ ...IDENTITY, pid: 2 ** 30 }, 'linux')
    ).resolves.toBeNull()
  })
})
