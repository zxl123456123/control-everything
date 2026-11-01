import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSourceControlEnvironment } from './source-control-environment'

const originalEnv = process.env
beforeEach(() => {
  process.env = {}
})
afterEach(() => {
  process.env = originalEnv
})

describe('source control environment migration', () => {
  it('moves a provider token and destination together without changing their values', () => {
    process.env.ORCA_GITEA_TOKEN = ' fixture-token '
    process.env.ORCA_GITEA_API_BASE_URL = 'https://git.example.test/code'
    process.env.ORCA_AZURE_DEVOPS_TOKEN = 'another-provider'
    expect(readSourceControlEnvironment('ZKYQ_GITEA_TOKEN')).toBe('fixture-token')
    expect(process.env.ZKYQ_GITEA_TOKEN).toBe(' fixture-token ')
    expect(process.env.ZKYQ_GITEA_API_BASE_URL).toBe('https://git.example.test/code')
    expect(process.env).not.toHaveProperty('ORCA_GITEA_TOKEN')
    expect(process.env).not.toHaveProperty('ORCA_GITEA_API_BASE_URL')
    expect(process.env.ORCA_AZURE_DEVOPS_TOKEN).toBe('another-provider')
  })

  it('migrates every supported provider setting and remains stable on later reads', () => {
    const settings = {
      ZKYQ_AZURE_DEVOPS_TOKEN: 'pat',
      ZKYQ_AZURE_DEVOPS_PAT: 'fallback-pat',
      ZKYQ_AZURE_DEVOPS_ACCESS_TOKEN: 'bearer',
      ZKYQ_AZURE_DEVOPS_USERNAME: 'fixture-user',
      ZKYQ_AZURE_DEVOPS_API_BASE_URL: 'https://ado.example.test/collection',
      ZKYQ_BITBUCKET_ACCESS_TOKEN: 'access',
      ZKYQ_BITBUCKET_EMAIL: 'fixture@example.test',
      ZKYQ_BITBUCKET_API_TOKEN: 'api',
      ZKYQ_BITBUCKET_API_BASE_URL: 'https://bb.example.test/api'
    } as const
    for (const [key, value] of Object.entries(settings))
      process.env[key.replace('ZKYQ_', 'ORCA_')] = value
    for (const key of Object.keys(settings) as (keyof typeof settings)[]) {
      expect(readSourceControlEnvironment(key)).toBe(settings[key])
      expect(readSourceControlEnvironment(key)).toBe(settings[key])
      expect(process.env).not.toHaveProperty(key.replace('ZKYQ_', 'ORCA_'))
    }
  })

  it('keeps canonical values and removes matching or empty retired settings', () => {
    process.env.ZKYQ_GITEA_TOKEN = 'current'
    process.env.ORCA_GITEA_TOKEN = ' current '
    process.env.ORCA_GITEA_API_BASE_URL = ''
    expect(readSourceControlEnvironment('ZKYQ_GITEA_TOKEN')).toBe('current')
    expect(process.env).not.toHaveProperty('ORCA_GITEA_TOKEN')
    expect(readSourceControlEnvironment('ZKYQ_GITEA_API_BASE_URL')).toBeNull()
  })

  it.each(['different-token', ''])(
    'refuses conflicting configuration atomically: %s',
    (current) => {
      process.env.ZKYQ_GITEA_TOKEN = current
      process.env.ORCA_GITEA_TOKEN = 'fixture-retired-token'
      process.env.ORCA_GITEA_API_BASE_URL = 'https://old.example.test/api'
      const before = { ...process.env }
      let message = ''
      try {
        readSourceControlEnvironment('ZKYQ_GITEA_TOKEN')
      } catch (error) {
        message = (error as Error).message
      }
      expect(message).toContain('Conflicting source control environment variables')
      expect(message).toContain('ZKYQ_GITEA_TOKEN')
      expect(message).not.toContain('fixture-retired-token')
      if (current) expect(message).not.toContain(current)
      expect(process.env).toEqual(before)
    }
  )
})
