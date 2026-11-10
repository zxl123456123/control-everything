import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findAgentSessionSpawnTokenProcesses,
  scanAgentSessionSpawnTokenProcesses
} from './agent-session-spawn-token-process-scan'
import { probeAgentSessionReservation } from './agent-session-process-identity-probe'

const fs = vi.hoisted(() => ({
  readFile: vi.fn<(path: string) => Promise<string>>(),
  readdir: vi.fn<() => Promise<string[]>>()
}))
vi.mock('node:fs/promises', () => fs)

beforeEach(() => {
  fs.readFile.mockReset()
  fs.readdir.mockReset()
})

describe('agent-session spawn token process scan', () => {
  it('answers null on platforms that cannot read another process environment', async () => {
    // macOS and Windows have no `/proc/<pid>/environ`. Answering "none" there would free a
    // reservation whose child is alive and mint a second writer on the same provider session.
    expect(await scanAgentSessionSpawnTokenProcesses('darwin')).toBeNull()
    expect(await scanAgentSessionSpawnTokenProcesses('win32')).toBeNull()
  })

  it('propagates the host non-answer rather than reporting an empty pid list', async () => {
    expect(await findAgentSessionSpawnTokenProcesses('token-1', async () => null)).toBeNull()
  })

  it('reports the pids carrying one token', async () => {
    const scan = async () => new Map([['token-1', [11, 12]]])

    expect(await findAgentSessionSpawnTokenProcesses('token-1', scan)).toEqual([11, 12])
    expect(await findAgentSessionSpawnTokenProcesses('token-2', scan)).toEqual([])
  })

  it('keeps both generations and conflicting tokens live during reservation recovery', async () => {
    const blocks = new Map([
      ['/proc/11/environ', 'ZKYQ_AGENT_SESSION_SPAWN_TOKEN=new'],
      ['/proc/12/environ', 'ORCA_AGENT_SESSION_SPAWN_TOKEN=old'],
      [
        '/proc/13/environ',
        'ZKYQ_AGENT_SESSION_SPAWN_TOKEN=same\0ORCA_AGENT_SESSION_SPAWN_TOKEN=same'
      ],
      [
        '/proc/14/environ',
        'ZKYQ_AGENT_SESSION_SPAWN_TOKEN=conflict-new\0ORCA_AGENT_SESSION_SPAWN_TOKEN=conflict-old'
      ],
      [
        '/proc/16/environ',
        'ZKYQ_AGENT_SESSION_SPAWN_TOKEN=\0ORCA_AGENT_SESSION_SPAWN_TOKEN_EXTRA=x'
      ]
    ])
    fs.readdir.mockResolvedValue(['self', '11', '12', '13', '14', '15', '16'])
    fs.readFile.mockImplementation(async (path) => {
      const block = blocks.get(path)
      if (block === undefined) throw new Error('process unavailable')
      return block
    })
    const observed = await scanAgentSessionSpawnTokenProcesses('linux')
    expect(observed).toEqual(
      new Map([
        ['new', [11]],
        ['old', [12]],
        ['same', [13]],
        ['conflict-new', [14]],
        ['conflict-old', [14]]
      ])
    )
    const providerActivity = vi.fn(async () => false)
    for (const token of ['new', 'old', 'conflict-new', 'conflict-old']) {
      await expect(
        probeAgentSessionReservation({
          spawnToken: token,
          findProcessesWithSpawnToken: (value) =>
            findAgentSessionSpawnTokenProcesses(value, async () => observed),
          hasProviderActivitySinceReservation: providerActivity
        })
      ).resolves.toMatchObject({ outcome: 'indeterminate' })
    }
    expect(providerActivity).not.toHaveBeenCalled()
  })

  it('honors an explicit variable and cannot turn a failed host scan into an empty result', async () => {
    fs.readdir.mockResolvedValue(['11'])
    fs.readFile.mockResolvedValue('CUSTOM_TOKEN=custom\0ZKYQ_AGENT_SESSION_SPAWN_TOKEN=current')
    expect(await scanAgentSessionSpawnTokenProcesses('linux', 'CUSTOM_TOKEN')).toEqual(
      new Map([['custom', [11]]])
    )
    fs.readdir.mockRejectedValue(new Error('host unavailable'))
    expect(await scanAgentSessionSpawnTokenProcesses('linux')).toBeNull()
  })
})
