import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareOrcadDefaultDataRoots } from './orcad-app-paths'

const calls = vi.hoisted(() => ({ shared: vi.fn(), profile: vi.fn(), explicitCredentials: false }))
vi.mock('../credentials/credential-root', () => ({
  hasExplicitPlatformCredentialRoot: () => calls.explicitCredentials
}))
vi.mock('../persistence/default-data-root-migration', () => ({
  migrateDefaultCredentialDataRoot: calls.shared,
  migrateDefaultProfileDataRootBeforeStartup: calls.profile,
  resolveMigratedDefaultDataRoot: (path: string) => path
}))
vi.mock('../persistence/default-data-root-record', () => ({
  readDefaultDataRootRecord: () => null
}))

beforeEach(() => {
  calls.shared.mockReset()
  calls.profile.mockReset().mockImplementation(async (_previous, current) => current)
  calls.explicitCredentials = false
  for (const key of ['ZKYQ_USER_DATA', 'ORCA_USER_DATA', 'XDG_DATA_HOME'])
    vi.stubEnv(key, undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('Node default directory startup gate', () => {
  it('prepares the shared home before publishing its canonical default', async () => {
    calls.shared.mockImplementation(async () => expect(process.env.ZKYQ_USER_DATA).toBeUndefined())
    expect(await prepareOrcadDefaultDataRoots()).toBe(join(homedir(), '.zkyq'))
    expect(calls.shared).toHaveBeenCalledWith(join(homedir(), '.orca'), join(homedir(), '.zkyq'))
    expect(calls.profile).not.toHaveBeenCalled()
    expect(process.env.ZKYQ_USER_DATA).toBe(join(homedir(), '.zkyq'))
  })

  it('prepares XDG business data separately from the shared credential home', async () => {
    const xdg = join(homedir(), 'fixture-xdg')
    vi.stubEnv('XDG_DATA_HOME', xdg)
    expect(await prepareOrcadDefaultDataRoots()).toBe(join(xdg, 'zkyq'))
    expect(calls.profile).toHaveBeenCalledWith(join(xdg, 'Orca'), join(xdg, 'zkyq'))
    expect(calls.shared.mock.invocationCallOrder[0]).toBeLessThan(
      calls.profile.mock.invocationCallOrder[0]
    )
  })

  it('preserves an explicitly selected custom profile while preparing its shared credentials', async () => {
    const explicit = join(homedir(), 'custom-profile')
    vi.stubEnv('ZKYQ_USER_DATA', explicit)
    expect(await prepareOrcadDefaultDataRoots()).toBe(explicit)
    expect(calls.profile).not.toHaveBeenCalled()
    expect(calls.shared).toHaveBeenCalledOnce()
  })

  it('leaves the host home untouched for an explicit platform profile credential root', async () => {
    const explicit = join(homedir(), 'fixture-platform-profile')
    vi.stubEnv('ZKYQ_USER_DATA', explicit)
    calls.explicitCredentials = true
    expect(await prepareOrcadDefaultDataRoots()).toBe(explicit)
    expect(calls.shared).not.toHaveBeenCalled()
    expect(calls.profile).not.toHaveBeenCalled()
  })

  it('refuses a retired override before attempting any directory migration', async () => {
    vi.stubEnv('ORCA_USER_DATA', join(homedir(), 'existing-profile'))
    await expect(prepareOrcadDefaultDataRoots()).rejects.toThrow('ORCA_USER_DATA was retired')
    expect(calls.shared).not.toHaveBeenCalled()
    expect(calls.profile).not.toHaveBeenCalled()
  })
})
