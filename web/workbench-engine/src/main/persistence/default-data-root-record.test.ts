import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { orcadSecretStatePath } from '../orcad/orcad-secret-key-resolution'

const fixture = vi.hoisted(() => ({ identity: null as string | null, run: vi.fn() }))
vi.mock('@orca/process-host', () => ({ runProcess: fixture.run }))
vi.mock('./profile-state/profile-state-access-identity', () => ({
  profileStateAccessMachineIdentity: () => fixture.identity
}))

beforeEach(() => {
  vi.resetModules()
  fixture.identity = null
  fixture.run.mockReset()
  vi.stubEnv('SystemRoot', join(tmpdir(), 'fixture-system-root'))
})
afterEach(() => vi.unstubAllEnvs())

describe.skipIf(process.platform !== 'win32')('default root migration identity', () => {
  it('uses the existing native identity without spawning a registry query', async () => {
    fixture.identity = 'existing-machine-identity'
    const api = await import('./default-data-root-record')
    await api.prepareDefaultDataRootMigrationIdentity()
    expect(fixture.run).not.toHaveBeenCalled()
    expect(api.defaultDataRootMachineTag()).toBe(
      createHash('sha256').update(fixture.identity).digest('hex').slice(0, 16)
    )
  })

  it('attributes the move without changing the existing unbound secret-store key path', async () => {
    fixture.run.mockResolvedValue({
      code: 0,
      stdout: '    MachineGuid    REG_SZ    aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\r\n'
    })
    const before = orcadSecretStatePath({ keyDir: 'fixture-keys' })
    const api = await import('./default-data-root-record')
    await api.prepareDefaultDataRootMigrationIdentity()
    expect(api.defaultDataRootMachineTag()).toBe(
      createHash('sha256')
        .update('win32-machine-guid:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
        .digest('hex')
        .slice(0, 16)
    )
    expect(orcadSecretStatePath({ keyDir: 'fixture-keys' })).toBe(before)
    expect(fixture.identity).toBeNull()
    expect(fixture.run.mock.calls[0][0]).toMatchObject({
      program: join(process.env.SystemRoot!, 'System32', 'reg.exe'),
      args: ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64']
    })
  })

  it.each(['invalid', '00000000-0000-0000-0000-000000000000'])(
    'keeps an invalid machine identity %s unproven',
    async (value) => {
      fixture.run.mockResolvedValue({ code: 0, stdout: `    MachineGuid    REG_SZ    ${value}\n` })
      const api = await import('./default-data-root-record')
      await api.prepareDefaultDataRootMigrationIdentity()
      expect(api.defaultDataRootMachineTag()).toBeNull()
    }
  )

  it('keeps an unsuccessful query unproven even if it printed a GUID', async () => {
    fixture.run.mockResolvedValue({
      code: 1,
      stdout: '    MachineGuid    REG_SZ    aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\n'
    })
    const api = await import('./default-data-root-record')
    await api.prepareDefaultDataRootMigrationIdentity()
    expect(api.defaultDataRootMachineTag()).toBeNull()
  })
})
