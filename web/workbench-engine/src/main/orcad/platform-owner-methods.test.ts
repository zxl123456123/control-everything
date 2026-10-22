import { describe, expect, it, vi } from 'vitest'
import { buildRegistry, type RpcContext, type RpcMethod } from '../runtime/rpc/core'
import { platformOwnerMethods } from './platform-owner-methods'
import { DeviceRegistry } from '../runtime/device-registry'
import { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import { decodePairingOffer } from '../../shared/pairing'

describe('platform owner methods', () => {
  const context = (caller: RpcContext['caller']) => ({ caller } as RpcContext)
  function fixture() {
    const createPairingOffer = vi.fn((_args: unknown) => ({ available: true as const,
      pairingUrl: 'fixture', endpoint: 'ws://127.0.0.1:24001', deviceId: 'device', webClientUrl: null }))
    const revokeRuntimeAccess = vi.fn((_deviceId: string) => true)
    const methods = buildRegistry(platformOwnerMethods(() => ({ createPairingOffer, revokeRuntimeAccess })))
    return { methods, createPairingOffer, revokeRuntimeAccess }
  }
  it('mints only loopback runtime scope with no extra grants', () => {
    const { methods, createPairingOffer } = fixture()
    const mint = methods.get('platform.bootstrapDevice') as RpcMethod
    expect(mint.permission).toBe('pairing-admin')
    mint.handler(mint.params!.parse({ name: 'Platform fixture' }), context({ kind: 'local-cli' }))
    expect(createPairingOffer).toHaveBeenCalledWith({ name: 'Platform fixture', scope: 'runtime', reach: 'this-computer', grants: [], freshDevice: true })
    expect(() => mint.params!.parse({ name: 'fixture', scope: 'mobile', grants: ['desktop-control'] })).toThrow()
  })
  it('rejects absent, desktop and paired-device callers before mint or revoke', () => {
    const { methods, createPairingOffer, revokeRuntimeAccess } = fixture()
    for (const caller of [undefined, { kind: 'desktop' } as const, { kind: 'paired-device', deviceId: 'phone' } as const]) {
      for (const [name, params] of [['platform.bootstrapDevice', { name: 'fixture' }],
        ['platform.revokeDevice', { deviceId: 'device' }]] as const) {
        expect(() => (methods.get(name) as RpcMethod).handler(params, context(caller))).toThrow('platform_owner_required')
      }
    }
    expect(createPairingOffer).not.toHaveBeenCalled()
    expect(revokeRuntimeAccess).not.toHaveBeenCalled()
  })
  it('owner revocation uses the existing runtime device mechanism', () => {
    const { methods, revokeRuntimeAccess } = fixture()
    const result = (methods.get('platform.revokeDevice') as RpcMethod).handler({ deviceId: 'device' }, context({ kind: 'local-cli' }))
    expect(result).toEqual({ revoked: true })
    expect(revokeRuntimeAccess).toHaveBeenCalledWith('device')
  })
})

// Exercise the production mint/revoke/registry logic without starting a server or writing a profile.
function pairingFixture() {
  const registry = Object.assign(Object.create(DeviceRegistry.prototype) as DeviceRegistry,
    { devices: [], save: vi.fn() })
  const server = Object.assign(Object.create(OrcaRuntimeRpcServer.prototype) as OrcaRuntimeRpcServer, {
    deviceRegistry: registry,
    runtime: { forgetClientNavigationState: vi.fn() },
    getWebSocketEndpoint: () => 'ws://127.0.0.1:24001',
    getE2EEPublicKey: () => Buffer.alloc(32, 7).toString('base64')
  })
  return { registry, server }
}

it('isolates two unconnected Web offers and revokes only the discarded one', () => {
  const { registry, server } = pairingFixture()
  const methods = buildRegistry(platformOwnerMethods(() => server))
  const owner = { caller: { kind: 'local-cli' } } as RpcContext
  const mint = methods.get('platform.bootstrapDevice') as RpcMethod
  const first = mint.handler({ name: 'Same project' }, owner) as ReturnType<OrcaRuntimeRpcServer['createPairingOffer']>
  const second = mint.handler({ name: 'Same project' }, owner) as ReturnType<OrcaRuntimeRpcServer['createPairingOffer']>
  if (!first.available || !second.available) throw new Error('fixture_pairing_unavailable')
  const firstOffer = decodePairingOffer(first.pairingUrl), secondOffer = decodePairingOffer(second.pairingUrl)
  expect(firstOffer.pairedDeviceId).not.toBe(secondOffer.pairedDeviceId)
  expect(firstOffer.deviceToken).not.toBe(secondOffer.deviceToken)
  expect(registry.getDevice(first.deviceId)?.lastSeenAt).toBe(0)
  expect(registry.getDevice(second.deviceId)?.lastSeenAt).toBe(0)
  const revoke = methods.get('platform.revokeDevice') as RpcMethod
  expect(revoke.handler({ deviceId: first.deviceId }, owner)).toEqual({ revoked: true })
  expect(registry.getDevice(first.deviceId)).toBeNull()
  expect(registry.getDevice(second.deviceId)?.lastSeenAt).toBe(0)
})

it('retains upstream pending-offer reuse when freshDevice is not requested', () => {
  const { server } = pairingFixture()
  const first = server.createPairingOffer({ scope: 'runtime', reach: 'this-computer' })
  const second = server.createPairingOffer({ scope: 'runtime', reach: 'this-computer' })
  if (!first.available || !second.available) throw new Error('fixture_pairing_unavailable')
  expect(second.deviceId).toBe(first.deviceId)
})
