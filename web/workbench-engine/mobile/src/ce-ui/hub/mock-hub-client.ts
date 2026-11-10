import { HubError, type HubClient, type HubDevice, type HubMe } from './hub-client'

// MOCK — invented data for UI development and previews. Nothing here talks to a server and none
// of it describes a real account or computer. Replace with a live client when the hub exposes
// mobile endpoints.

export type MockScenario = 'populated' | 'empty' | 'error' | 'inactive'

/** Any invite starting with this (and 16+ chars) is accepted; anything else is rejected. */
export const MOCK_VALID_INVITE_PREFIX = 'DEMO'
/** Test hooks for the other failure kinds. */
export const MOCK_EXPIRED_INVITE_PREFIX = 'OLD0'
export const MOCK_USED_INVITE_PREFIX = 'USED'

export type MockHubOptions = {
  scenario?: MockScenario
  /** Simulated round-trip in ms. Tests pass 0. */
  latencyMs?: number
  now?: () => number
  subject?: string
  name?: string
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function seedDevices(now: number): HubDevice[] {
  return [
    {
      id: 'mock-dev-studio',
      name: '工作室台式机',
      os: 'windows',
      state: 'online',
      lastSeenAt: now - 20_000,
      boundAt: now - 40 * DAY,
      appVersion: '0.4.2'
    },
    {
      id: 'mock-dev-laptop',
      name: 'MacBook Pro',
      os: 'macos',
      state: 'connecting',
      lastSeenAt: now - 3 * MINUTE,
      boundAt: now - 12 * DAY,
      appVersion: '0.4.2'
    },
    {
      id: 'mock-dev-nas',
      name: '家里的 Linux 主机',
      os: 'linux',
      state: 'offline',
      lastSeenAt: now - 2 * DAY,
      boundAt: now - 90 * DAY,
      appVersion: '0.4.0'
    },
    {
      id: 'mock-dev-new',
      name: '新电脑',
      os: 'windows',
      state: 'pending',
      lastSeenAt: null,
      boundAt: now - 5 * MINUTE,
      appVersion: null
    },
    {
      id: 'mock-dev-old',
      name: '旧笔记本',
      os: 'windows',
      state: 'revoked',
      lastSeenAt: now - 30 * DAY,
      boundAt: now - 200 * DAY,
      appVersion: '0.3.1'
    }
  ]
}

export function createMockHubClient(options: MockHubOptions = {}): HubClient {
  const scenario = options.scenario ?? 'populated'
  const latency = options.latencyMs ?? 650
  const now = options.now ?? Date.now
  let activated = scenario !== 'inactive'
  let devices = scenario === 'empty' || scenario === 'inactive' ? [] : seedDevices(now())
  const me = (): HubMe => ({
    subject: options.subject ?? 'mock-subject',
    name: options.name ?? '演示用户',
    email: 'demo@example.invalid',
    membership: activated ? 'active' : 'inactive',
    admin: false
  })
  const wait = <T>(value: () => T): Promise<T> =>
    new Promise((resolve, reject) => {
      const run = () => {
        try {
          resolve(value())
        } catch (error) {
          reject(error instanceof Error ? error : new HubError('network'))
        }
      }
      if (latency <= 0) run()
      else setTimeout(run, latency)
    })

  return {
    kind: 'mock',
    getMe: () =>
      wait(() => {
        if (scenario === 'error') throw new HubError('network')
        return me()
      }),
    listDevices: () =>
      wait(() => {
        if (scenario === 'error') throw new HubError('network')
        return devices.map((device) => ({ ...device }))
      }),
    activateInvite: (code) =>
      wait(() => {
        if (code.length < 16 || code.length > 128) throw new HubError('invalid-invite')
        if (code.startsWith(MOCK_EXPIRED_INVITE_PREFIX)) throw new HubError('expired-invite')
        if (code.startsWith(MOCK_USED_INVITE_PREFIX)) throw new HubError('used-invite')
        if (!code.startsWith(MOCK_VALID_INVITE_PREFIX)) throw new HubError('invalid-invite')
        activated = true
        return me()
      }),
    revokeDevice: (deviceId) =>
      wait(() => {
        const target = devices.find((device) => device.id === deviceId)
        if (!target) throw new HubError('invalid-invite')
        if (target.state === 'revoked') return
        devices = devices.map((device) =>
          device.id === deviceId ? { ...device, state: 'revoked' } : device
        )
      })
  }
}
