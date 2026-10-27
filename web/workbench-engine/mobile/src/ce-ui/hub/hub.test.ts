import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-constants', () => ({ default: { expoConfig: {} } }))

import { HubError } from './hub-client'
import { createMockHubClient } from './mock-hub-client'
import { resolveHubClient } from './hub-context'
import { presentDeviceState } from '../status/device-status'

const fast = (
  scenario?: Parameters<typeof createMockHubClient>[0] extends infer O
    ? O extends { scenario?: infer S }
      ? S
      : never
    : never
) => createMockHubClient({ latencyMs: 0, now: () => 1_800_000_000_000, scenario })

describe('mock hub client', () => {
  it('is labelled as a mock so screens can say so', () => {
    expect(fast().kind).toBe('mock')
  })

  it('lists devices covering every display state without leaking its internal objects', async () => {
    const client = fast()
    const devices = await client.listDevices()
    expect(devices.map((d) => d.state)).toEqual([
      'online',
      'connecting',
      'offline',
      'pending',
      'revoked'
    ])
    devices[0]!.name = 'tampered'
    expect((await client.listDevices())[0]!.name).not.toBe('tampered')
    for (const device of devices)
      expect(presentDeviceState(device.state).label).not.toBe('状态未知')
  })

  it('returns no devices for the empty scenario and fails for the error scenario', async () => {
    expect(await fast('empty').listDevices()).toEqual([])
    await expect(fast('error').listDevices()).rejects.toMatchObject({ kind: 'network' })
    await expect(fast('error').getMe()).rejects.toBeInstanceOf(HubError)
  })

  it('activates only valid invites and reports the right failure otherwise', async () => {
    const client = fast('inactive')
    expect((await client.getMe()).membership).toBe('inactive')
    await expect(client.activateInvite('short')).rejects.toMatchObject({ kind: 'invalid-invite' })
    await expect(client.activateInvite('x'.repeat(20))).rejects.toMatchObject({
      kind: 'invalid-invite'
    })
    await expect(client.activateInvite('OLD0' + 'a'.repeat(20))).rejects.toMatchObject({
      kind: 'expired-invite'
    })
    await expect(client.activateInvite('USED' + 'a'.repeat(20))).rejects.toMatchObject({
      kind: 'used-invite'
    })
    expect((await client.getMe()).membership).toBe('inactive')
    const me = await client.activateInvite('DEMO-' + 'a'.repeat(20))
    expect(me.membership).toBe('active')
    expect((await client.getMe()).membership).toBe('active')
  })

  it('revokes a device once and is idempotent', async () => {
    const client = fast()
    await client.revokeDevice('mock-dev-studio')
    await client.revokeDevice('mock-dev-studio')
    const studio = (await client.listDevices()).find((d) => d.id === 'mock-dev-studio')
    expect(studio?.state).toBe('revoked')
    await expect(client.revokeDevice('nope')).rejects.toBeInstanceOf(HubError)
  })

  it('simulates latency only when asked to', async () => {
    vi.useFakeTimers()
    const client = createMockHubClient({ latencyMs: 500 })
    let done = false
    void client.listDevices().then(() => (done = true))
    await vi.advanceTimersByTimeAsync(499)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(done).toBe(true)
    vi.useRealTimers()
  })
})

describe('resolveHubClient', () => {
  it('serves labelled mock data in development or when a build opts in', () => {
    expect(resolveHubClient({ dev: true, extra: undefined }).kind).toBe('mock')
    expect(resolveHubClient({ dev: false, extra: { ceHubMock: true } }).kind).toBe('mock')
  })
  it('never invents computers in a plain release build', async () => {
    const client = resolveHubClient({ dev: false, extra: { ceHubMock: 'true' } })
    expect(client.kind).toBe('unavailable')
    await expect(client.listDevices()).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(client.revokeDevice('x')).rejects.toMatchObject({ kind: 'unavailable' })
  })
})
