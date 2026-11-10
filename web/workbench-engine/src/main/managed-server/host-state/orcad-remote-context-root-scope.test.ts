import { createHash } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import type * as HomeModule from './orcad-machine-home'
import type * as ExecModule from '../../ssh/remote-exec/remote-exec-command'

const fixture = vi.hoisted(() => ({ probe: Object.create(null) }))
vi.mock('./orcad-machine-home', async (original) => ({
  ...(await original<typeof HomeModule>()),
  orcadMachineHomeProbeCommand: () => 'READ_MACHINE_HOME',
  parseOrcadMachineHomeProbe: () => fixture.probe
}))
vi.mock('../../ssh/remote-exec/remote-exec-command', async (original) => ({
  ...(await original<typeof ExecModule>()),
  execCommand: vi.fn(async () => '')
}))
vi.mock('./remote-root-identity', () => ({
  prepareRemoteRootIdentity: vi.fn(async () => ({ state: 'current' }))
}))
import { prepareRemoteRootIdentity } from './remote-root-identity'
import { resolveOrcadMachineHome } from '../install/orcad-remote-context'

const key = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16)
const currentIdentity = 'a'.repeat(32),
  foreignIdentity = 'b'.repeat(32)
const currentKey = key('linux:' + currentIdentity)
beforeEach(() => {
  vi.mocked(prepareRemoteRootIdentity).mockClear()
  fixture.probe = {
    loginHome: '/shared-home',
    rootDirectoryName: '.orca-remote',
    identity: { key: currentKey, machineIdentity: currentIdentity, hostname: 'node-a' },
    claim: { state: 'absent' },
    dataRootOwners: [{ host: 'node-b', platform: 'linux', machineIdentity: foreignIdentity }],
    machineHomeKeys: [],
    homeOnLocalDisk: false,
    loginHomeInstalled: true
  }
})
async function resolve() {
  await resolveOrcadMachineHome(
    { conn: Object.create(null), host: getRemoteHostPlatform('linux-x64') },
    true,
    'linux-x64-glibc'
  )
  return vi.mocked(prepareRemoteRootIdentity).mock.calls[0][3]
}
it('requires the foreign data-root owner even before it has a claim or machine home', async () => {
  const scope = await resolve()
  expect(scope.expectedKeys).toContain(currentKey)
  expect(scope.expectedKeys).toContain(key('linux:' + foreignIdentity))
})
it('retains a hostname-only foreign owner until that host confirms exit', async () => {
  fixture.probe.dataRootOwners[0].machineIdentity = null
  const scope = await resolve()
  expect(scope.expectedKeys).toContain(key('legacy-profile-owner:linux:node-b'))
})
it('lets the attributed host acknowledge its older hostname-only lease', async () => {
  const foreignKey = key('linux:' + foreignIdentity)
  fixture.probe.identity = { key: foreignKey, machineIdentity: foreignIdentity, hostname: 'node-b' }
  fixture.probe.claim = { state: 'present', machineKey: foreignKey }
  const scope = await resolve()
  expect(scope.key).toBe(foreignKey)
  expect(scope.aliases).toContain(key('legacy-profile-owner:linux:node-b'))
})
it('uses hardware identity after an owner hostname changes', async () => {
  fixture.probe.dataRootOwners[0].host = 'previous-hostname'
  const scope = await resolve()
  expect(scope.expectedKeys).toContain(key('linux:' + foreignIdentity))
  expect(scope.expectedKeys).not.toContain(key('legacy-profile-owner:linux:previous-hostname'))
})
it('retains another operating system in the parsed owner scope', async () => {
  const actual = await vi.importActual<typeof HomeModule>('./orcad-machine-home')
  const machineIdentity = '12345678-1234-1234-1234-123456789abc'
  const output = [
    '/shared-home',
    currentIdentity,
    'node-a',
    'ABSENT',
    JSON.stringify({ host: 'node-b', platform: 'darwin', machineIdentity }),
    '',
    'INSTALLED',
    'nfs',
    'server:/home 100 1 99 1% /shared-home',
    '.orca-remote'
  ].join('\n__ORCA_MACHINE_HOME_SECTION__\n')
  const host = getRemoteHostPlatform('linux-x64')
  const probe = actual.parseOrcadMachineHomeProbe(output, host)
  expect(probe.dataRootOwners[0].platform).toBe('darwin')
  expect(actual.orcadMachineHomeRootScope(probe, host).expectedKeys).toContain(
    key('darwin:' + machineIdentity)
  )
})
