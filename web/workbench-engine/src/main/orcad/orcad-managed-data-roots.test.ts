import { homedir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
const calls = vi.hoisted(() => ({ shared: vi.fn(), profile: vi.fn(), handoff: vi.fn() }))
vi.mock('../persistence/default-data-root-migration', () => ({
  migrateDefaultCredentialDataRoot: calls.shared,
  migrateDefaultProfileDataRootBeforeStartup: calls.profile,
  handOffDefaultDataRootToPreviousBuild: calls.handoff
}))
import { runManagedDataRootOperation } from './orcad-managed-data-roots'
beforeEach(() => vi.clearAllMocks())

it('refuses relative protocol coordinates before touching either directory', async () => {
  await expect(runManagedDataRootOperation('prepare', '.zkyq')).rejects.toThrow('Invalid')
  expect(calls.shared).not.toHaveBeenCalled()
})

it('prepares the shared default before exposing the canonical launch path', async () => {
  const current = join(homedir(), '.zkyq')
  expect(await runManagedDataRootOperation('prepare', current)).toEqual({
    version: 1,
    userDataDir: current,
    launchUserDataDir: current
  })
  expect(calls.shared).toHaveBeenCalledWith(join(homedir(), '.orca'), current)
  expect(calls.profile).not.toHaveBeenCalled()
})
it('prepares the short machine default separately after shared credentials', async () => {
  const current = join(homedir(), '.zkyq-1234abcd')
  await runManagedDataRootOperation('prepare', current)
  expect(calls.profile).toHaveBeenCalledWith(join(homedir(), '.orca-1234abcd'), current)
  expect(calls.shared.mock.invocationCallOrder[0]).toBeLessThan(
    calls.profile.mock.invocationCallOrder[0]
  )
})
it('publishes both old entrances for an older consumer and keeps management on the canonical root', async () => {
  const current = join(homedir(), '.zkyq-1234abcd')
  const previous = join(homedir(), '.orca-1234abcd')
  expect(await runManagedDataRootOperation('previous-build', current)).toEqual({
    version: 1,
    userDataDir: current,
    launchUserDataDir: previous
  })
  expect(calls.handoff.mock.calls).toEqual([
    [join(homedir(), '.orca'), join(homedir(), '.zkyq')],
    [previous, current]
  ])
  expect(calls.profile.mock.invocationCallOrder[0]).toBeLessThan(
    calls.handoff.mock.invocationCallOrder[0]
  )
})
it.each([
  join(homedir(), 'custom'),
  join(homedir(), 'custom', '.zkyq'),
  join(homedir(), '.zkyq-notahash')
])('refuses a custom directory %s before any migration', async (path) => {
  await expect(runManagedDataRootOperation('prepare', path)).rejects.toThrow('not a default')
  expect(calls.shared).not.toHaveBeenCalled()
})
