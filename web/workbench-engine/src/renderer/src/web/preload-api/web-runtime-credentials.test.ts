import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredWebRuntimeEnvironment } from '../web-runtime-environment'

vi.mock('../web-device-key-support', () => ({ readWebDeviceKeySupport: () => 'persistent' }))
vi.mock('../web-device-key-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../web-device-key-store')>()
  return {
    ...actual,
    createIndexedDbWebDeviceKeyStore: vi.fn(() => actual.createMemoryWebDeviceKeyStore())
  }
})

const environment = (sessionOnly: boolean): StoredWebRuntimeEnvironment => ({
  id: 'platform-host',
  name: 'Fixture',
  createdAt: 1,
  updatedAt: 1,
  lastUsedAt: null,
  runtimeId: null,
  ...(sessionOnly ? { sessionOnly: true } : {}),
  preferredEndpointId: 'fixture-endpoint',
  endpoints: [
    {
      id: 'fixture-endpoint',
      kind: 'websocket',
      label: 'Fixture',
      endpoint: 'ws://127.0.0.1:1234',
      deviceToken: 'fixture-token',
      publicKeyB64: 'fixture-host-key'
    }
  ]
})

describe('credential store selection', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('indexedDB', {})
  })
  afterEach(() => vi.unstubAllGlobals())

  it('never opens IndexedDB for a session-only environment on a persistent-capable browser', async () => {
    const { webRuntimeCredentialFor } = await import('./web-runtime-credentials')
    const { createIndexedDbWebDeviceKeyStore } = await import('../web-device-key-store')
    const source = webRuntimeCredentialFor(environment(true), {
      forgetStoredToken: vi.fn(),
      forgetPairing: vi.fn()
    })
    expect(await source.nextPlan(true)).toMatchObject({ kind: 'migrate', ephemeral: true })
    expect(createIndexedDbWebDeviceKeyStore).not.toHaveBeenCalled()
  })

  it('does not share a persisted source with a session-only pairing of the same id and revision', async () => {
    const { webRuntimeCredentialFor } = await import('./web-runtime-credentials')
    const callbacks = { forgetStoredToken: vi.fn(), forgetPairing: vi.fn() }
    const persisted = webRuntimeCredentialFor(environment(false), callbacks)
    const session = webRuntimeCredentialFor(environment(true), callbacks)
    expect(session).not.toBe(persisted)
    expect(await session.nextPlan(true)).toMatchObject({ kind: 'migrate', ephemeral: true })
    expect(webRuntimeCredentialFor(environment(true), callbacks)).toBe(session)
  })
})
