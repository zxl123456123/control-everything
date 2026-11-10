import { afterEach, expect, it, vi } from 'vitest'
import type { WslRunningDistrosRead } from '../wsl-background-distro-gate'
import { WslHookRelayManager } from './wsl-hook-relay-manager'
import type { WslHookRelayManagerDeps } from './wsl-hook-relay-deps'
import { WSL_HOOK_RELAY_RETIRED_READERS_ENV } from '../../shared/wsl-hook-relay-contract'

const managers: WslHookRelayManager[] = []
afterEach(() => {
  for (const manager of managers.splice(0)) manager.disposeAll()
})

function fixture(read: () => Promise<WslRunningDistrosRead>) {
  let stopped: Parameters<WslHookRelayManagerDeps['onDistrosStopped']>[0] = () => {}
  const unsubscribe = vi.fn()
  const spawn = vi.fn<WslHookRelayManagerDeps['spawnRelay']>(() => {
    // Only kill is reached: the injected handshake closes before any IPC setup.
    return { kill: vi.fn() } as unknown as ReturnType<WslHookRelayManagerDeps['spawnRelay']>
  })
  const manager = new WslHookRelayManager({
    platform: () => 'win32',
    remoteHooksEnabled: () => true,
    hookCoordsEnv: () => ({ ZKYQ_AGENT_HOOK_PORT: '43117', ZKYQ_AGENT_HOOK_TOKEN: 'fixture' }),
    instanceKey: () => 'fixture',
    resolveBundle: () => ({ jsPath: 'fixture.js', version: 'fixture' }),
    readRunningDistros: read,
    onDistrosStopped: (listener) => {
      stopped = listener
      return unsubscribe
    },
    spawnRelay: spawn,
    waitForSentinel: async () => {
      throw new Error('fixture closes before handshake')
    },
    warn: vi.fn()
  })
  managers.push(manager)
  return { manager, spawn, unsubscribe, stop: (names: string[]) => stopped(names, []) }
}

it.each([
  ['unknown', { status: 'unavailable' }, '0'],
  ['running with normalized name', { status: 'confirmed', distros: [' ubuntu '] }, '0'],
  ['confirmed stopped', { status: 'confirmed', distros: ['Debian'] }, '1']
] as const)('uses %s evidence before the first guest launch', async (_name, result, expected) => {
  const f = fixture(async () =>
    result.status === 'confirmed' ? { status: 'confirmed', distros: [...result.distros] } : result
  )
  await f.manager.ensureForDistro('Ubuntu')
  expect(f.spawn).toHaveBeenCalledOnce()
  expect(f.spawn.mock.calls[0][1][WSL_HOOK_RELAY_RETIRED_READERS_ENV]).toBe(expected)
})

it('waits for the confirmed-list probe and coalesces concurrent launch requests', async () => {
  const probe = Promise.withResolvers<WslRunningDistrosRead>()
  const read = vi.fn(() => probe.promise)
  const f = fixture(read)
  const first = f.manager.ensureForDistro('Ubuntu')
  const second = f.manager.ensureForDistro('Ubuntu')
  expect(f.spawn).not.toHaveBeenCalled()
  probe.resolve({ status: 'confirmed', distros: [] })
  await Promise.all([first, second])
  expect(read).toHaveBeenCalledOnce()
  expect(f.spawn).toHaveBeenCalledOnce()
  expect(f.spawn.mock.calls[0][1][WSL_HOOK_RELAY_RETIRED_READERS_ENV]).toBe('1')
})

it('consumes only the same distro stop, including when another terminal already rebooted it', async () => {
  const f = fixture(async () => ({ status: 'confirmed', distros: ['Ubuntu'] }))
  f.stop(['Debian'])
  await f.manager.ensureForDistro('Ubuntu')
  expect(f.spawn.mock.calls[0][1][WSL_HOOK_RELAY_RETIRED_READERS_ENV]).toBe('0')
  f.manager.disposeAll({ permanent: false })
  expect(f.unsubscribe).not.toHaveBeenCalled()
  f.stop([' UBUNTU '])
  await f.manager.ensureForDistro('Ubuntu')
  expect(f.spawn.mock.calls[1][1][WSL_HOOK_RELAY_RETIRED_READERS_ENV]).toBe('1')
  f.manager.disposeAll({ permanent: false })
  await f.manager.ensureForDistro('Ubuntu')
  expect(f.spawn.mock.calls[2][1][WSL_HOOK_RELAY_RETIRED_READERS_ENV]).toBe('0')
  f.manager.disposeAll()
  expect(f.unsubscribe).toHaveBeenCalledOnce()
})

it('does not launch or install when disposed during the probe', async () => {
  const probe = Promise.withResolvers<WslRunningDistrosRead>()
  const f = fixture(() => probe.promise)
  const pending = f.manager.ensureForDistro('Ubuntu')
  f.manager.disposeAll()
  probe.resolve({ status: 'confirmed', distros: [] })
  await pending
  expect(f.spawn).not.toHaveBeenCalled()
})
