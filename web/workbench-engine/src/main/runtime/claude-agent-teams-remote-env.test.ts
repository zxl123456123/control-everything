import { describe, expect, it } from 'vitest'
import { ClaudeAgentTeamsService } from './claude-agent-teams-service'

describe('agent team remote selection', () => {
  const launch = (baseEnv: Record<string, string>) =>
    new ClaudeAgentTeamsService().createLaunchEnv({
      leaderHandle: 'terminal-fixture',
      baseEnv,
      shimDir: '/fixture/bin',
      shimBin: null
    })

  it.each(['ZKYQ_ENVIRONMENT', 'ZKYQ_PAIRING_CODE', 'ZKYQ_REMOTE_PAIRING'])(
    'passes %s to the team',
    (key) => {
      expect(launch({ [key]: 'selection' }).env[key]).toBe('selection')
    }
  )

  it.each(['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING'])(
    'refuses the retired %s instead of dropping its selection',
    (key) => {
      const service = new ClaudeAgentTeamsService()
      expect(() =>
        service.createLaunchEnv({
          leaderHandle: 'terminal-fixture',
          baseEnv: { [key]: 'private-value' },
          shimDir: '/fixture/bin',
          shimBin: null
        })
      ).toThrow(key.replace('ORCA_', 'ZKYQ_'))
      expect(service.getActiveTeamCount()).toBe(0)
    }
  )
})
