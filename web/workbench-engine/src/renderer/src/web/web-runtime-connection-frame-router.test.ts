import nacl from 'tweetnacl'
import { describe, expect, it, vi } from 'vitest'
import { createPairedE2EEClientHandshake } from '../../../shared/paired-e2ee-client-handshake'
import { NODE_PAIRED_E2EE_PRIMITIVES } from '../../../shared/paired-e2ee-node-primitives'
import {
  createMobileE2EEV2Fixture,
  MOBILE_E2EE_V2_VECTOR
} from '../../../shared/mobile-e2ee-v2-fixtures'
import { openMobileE2EEV2Frame } from '../../../shared/mobile-e2ee-v2-framing'
import { verifyDeviceProof } from '../../../shared/device-key-proof'
import {
  CLAUDE_STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
  PI_STRUCTURED_DIALOGS_RUNTIME_CAPABILITY,
  REPO_SEARCH_QUALIFIED_REFS_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_REGISTERED_AGENTS_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
  WORKTREE_BACKGROUND_REMOVAL_RUNTIME_CAPABILITY,
  WORKTREE_GITHUB_PR_SUPPRESSION_RUNTIME_CAPABILITY
} from '../../../shared/protocol-version'
import {
  routeWebRuntimeConnectionFrame,
  sealWebRuntimeAuth,
  sealWebRuntimePlanAuth
} from './web-runtime-connection-frame-router'

function openWebAuthForTest(
  host: nacl.BoxKeyPair,
  client: nacl.BoxKeyPair,
  frame: string
): unknown {
  const bundle = Buffer.from(frame, 'base64')
  const shared = nacl.box.before(client.publicKey, host.secretKey)
  const plaintext = nacl.box.open.after(bundle.subarray(24), bundle.subarray(0, 24), shared)
  return JSON.parse(Buffer.from(plaintext!).toString())
}

describe('web runtime connection capability advertisement', () => {
  it('advertises structured chat capabilities in the signed v2 device-key auth', async () => {
    const fixture = createMobileE2EEV2Fixture()
    const handshake = createPairedE2EEClientHandshake({
      primitives: { ...NODE_PAIRED_E2EE_PRIMITIVES, deriveSharedKey: () => fixture.sharedSecret },
      hostPublicKeyB64: fixture.ready.desktopPublicKeyB64,
      framing: 'v2',
      transport: 'relay',
      relayHostId: fixture.hello.context.relayHostId,
      clientKeyPair: { publicKey: new Uint8Array(32).fill(1), secretKey: new Uint8Array(32) },
      clientNonce: new Uint8Array(32).fill(2)
    })
    expect(handshake.acceptReadyText(JSON.stringify(fixture.ready))).toBe('accepted')
    const key = nacl.sign.keyPair()
    const publicKeyB64 = Buffer.from(key.publicKey).toString('base64')
    const frame = await sealWebRuntimePlanAuth(
      handshake,
      {
        kind: 'device-key',
        deviceId: 'device-1',
        key: { publicKeyB64, sign: async (message) => nacl.sign.detached(message, key.secretKey) }
      },
      'unused'
    )
    const plaintext = openMobileE2EEV2Frame({
      frame: Buffer.from(frame, 'base64'),
      key: Buffer.from(MOBILE_E2EE_V2_VECTOR.mobileToDesktopKeyHex, 'hex'),
      sessionId: Buffer.from(MOBILE_E2EE_V2_VECTOR.sessionIdHex, 'hex'),
      direction: 'mobile-to-desktop',
      payloadKind: 'text',
      expectedCounter: 0n
    })
    const auth = JSON.parse(Buffer.from(plaintext!).toString())
    expect(auth).toEqual({
      type: 'e2ee_auth',
      v: 2,
      deviceId: 'device-1',
      transcriptHashB64: handshake.transcriptHashB64(),
      deviceProofB64: expect.any(String),
      clientCapabilities: expect.arrayContaining([
        STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
        CLAUDE_STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
        STRUCTURED_AGENT_SESSION_REGISTERED_AGENTS_RUNTIME_CAPABILITY,
        PI_STRUCTURED_DIALOGS_RUNTIME_CAPABILITY
      ])
    })
    expect(
      verifyDeviceProof({
        devicePublicKeyB64: publicKeyB64,
        deviceProofB64: auth.deviceProofB64,
        purpose: 'auth',
        transcriptHashB64: auth.transcriptHashB64
      })
    ).toBe(true)
  })
  it('advertises GitHub PR suppression and the removing marker during E2EE authentication', async () => {
    const host = nacl.box.keyPair()
    const client = nacl.box.keyPair()
    const handshake = createPairedE2EEClientHandshake({
      primitives: NODE_PAIRED_E2EE_PRIMITIVES,
      hostPublicKeyB64: Buffer.from(host.publicKey).toString('base64'),
      framing: 'legacy',
      clientKeyPair: client
    })
    const sendAuth = vi.fn()

    await routeWebRuntimeConnectionFrame(JSON.stringify({ type: 'e2ee_ready' }), undefined, {
      getState: () => 'handshaking',
      getHandshake: () => handshake,
      getSocket: () => null,
      pending: new Map(),
      subscriptions: new Map(),
      sendAuth,
      setConnected: vi.fn(),
      authRejected: vi.fn()
    })

    expect(sendAuth).toHaveBeenCalledWith(handshake)
    expect(openWebAuthForTest(host, client, await sealWebRuntimeAuth(handshake, 'token'))).toEqual(
      expect.objectContaining({
        type: 'e2ee_auth',
        deviceToken: 'token',
        clientCapabilities: expect.arrayContaining([
          STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
          CLAUDE_STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
          STRUCTURED_AGENT_SESSION_REGISTERED_AGENTS_RUNTIME_CAPABILITY,
          PI_STRUCTURED_DIALOGS_RUNTIME_CAPABILITY,
          REPO_SEARCH_QUALIFIED_REFS_RUNTIME_CAPABILITY,
          WORKTREE_GITHUB_PR_SUPPRESSION_RUNTIME_CAPABILITY,
          // The web client runs the desktop renderer, which shows Deleting from the marker.
          WORKTREE_BACKGROUND_REMOVAL_RUNTIME_CAPABILITY
        ])
      })
    )
  })
})
