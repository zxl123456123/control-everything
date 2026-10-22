import { z } from 'zod'
import { defineMethod, type RpcContext } from '../runtime/rpc/core'
import type { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'

function requireOwner(context: RpcContext): void {
  if (context.caller?.kind !== 'local-cli') throw new Error('platform_owner_required')
}

/** These methods supplement the entire upstream catalog; they never replace it. */
export function platformOwnerMethods(server: () => Pick<OrcaRuntimeRpcServer, 'createPairingOffer' | 'revokeRuntimeAccess'>) {
  return [
    defineMethod({
      name: 'platform.bootstrapDevice',
      permission: 'pairing-admin',
      params: z.object({ name: z.string().min(1).max(120) }).strict(),
      handler: (params, context) => {
        requireOwner(context)
        return server().createPairingOffer({ name: params.name, scope: 'runtime', reach: 'this-computer', grants: [], freshDevice: true })
      }
    }),
    defineMethod({
      name: 'platform.revokeDevice',
      permission: 'pairing-admin',
      params: z.object({ deviceId: z.string().min(1).max(255) }).strict(),
      handler: (params, context) => {
        requireOwner(context)
        return { revoked: server().revokeRuntimeAccess(params.deviceId) }
      }
    })
  ]
}
