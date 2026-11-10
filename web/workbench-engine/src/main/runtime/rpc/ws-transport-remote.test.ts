import { EventEmitter } from 'node:events'
import { connect } from 'node:net'
import { request } from 'node:http'
import type { Duplex } from 'node:stream'
import WebSocket, { type WebSocketServer } from 'ws'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketTransport } from './ws-transport'
import { E2EEChannel } from './e2ee-channel'
import { deriveSharedKey, encrypt, decrypt, generateKeyPair } from '../../../shared/e2ee-crypto'

const origin = 'https://192.0.2.1'
const proof = 'a'.repeat(43)
const headers = { Host: '192.0.2.1', Origin: origin, 'X-CE-Device-Proof': proof }
function state(transport: WebSocketTransport) {
  return transport as unknown as {
    wss: WebSocketServer
    pendingUpgrades: Map<Duplex, () => void>
    remotePreAuth: Map<WebSocket, () => void>
    reserveRemoteUpgrade(socket: Duplex, release: () => void): (ws: WebSocket) => boolean
  }
}

describe('remote WebSocket transport admission', () => {
  let now: number
  const transports: WebSocketTransport[] = []
  const clients: WebSocket[] = []
  beforeEach(() => {
    now = 0
    vi.stubEnv('CE_WORKBENCH_ISOLATED', '1')
    vi.stubEnv('CE_WORKBENCH_ORIGIN', 'http://127.0.0.1:14401')
    vi.stubEnv('CE_WORKBENCH_PUBLIC_ORIGIN', origin)
    vi.stubEnv('CE_WORKBENCH_DEVICE_PROOF', proof)
    vi.stubEnv('CE_REMOTE_DEVICE_ID', 'device-1')
    vi.stubEnv('CE_REMOTE_GENERATION', '1')
    vi.stubEnv('CE_REMOTE_INSTALLATION_ID', 'platform-installation-1')
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    for (const client of clients) client.terminate()
    clients.length = 0
    await Promise.all(transports.map((transport) => transport.stop()))
    transports.length = 0
    vi.unstubAllEnvs()
  })
  async function start(preAuthTimeoutMs = 10000) {
    const transport = new WebSocketTransport({
      host: '127.0.0.1', port: 0, preAuthTimeoutMs, remoteAdmissionNow: () => now
    })
    transports.push(transport)
    await transport.start()
    return transport
  }
  function dial(transport: WebSocketTransport, requestHeaders = headers): Promise<WebSocket | number> {
    return new Promise((resolve, reject) => {
      const client = new WebSocket(`ws://127.0.0.1:${transport.resolvedPort}/?orca-client=web`, { headers: requestHeaders })
      clients.push(client)
      let rejectedUpgrade = false
      client.once('open', () => resolve(client))
      client.once('unexpected-response', (_request, response) => {
        rejectedUpgrade = true
        response.resume()
        resolve(response.statusCode!)
        client.terminate()
      })
      client.on('error', (error) => { if (!rejectedUpgrade) reject(error) })
    })
  }
  async function accepted(transport: WebSocketTransport) {
    const client = await dial(transport)
    expect(client).toBeInstanceOf(WebSocket)
    return client as WebSocket
  }
  function exchange(client: WebSocket, message: string): Promise<string> {
    return new Promise((resolve) => {
      client.once('message', (data) => resolve(data.toString()))
      client.send(message)
    })
  }

  it('serves an authenticated probe only after RPC wiring is ready', async () => {
    const transport = await start()
    async function probe(path: string, requestHeaders: Record<string, string> = headers, method = 'GET') {
      return await new Promise<{status: number; body: Record<string, unknown>}>((resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', port: transport.resolvedPort, path, headers: requestHeaders, method }, (response) => {
          let raw = ''
          response.on('data', (chunk) => { raw += chunk.toString() })
          response.on('end', () => resolve({status: response.statusCode!, body: JSON.parse(raw)}))
        })
        req.on('error', reject)
        req.end()
      })
    }
    const path = '/__ce_remote_health?nonce=' + 'A'.repeat(32)
    expect((await probe(path)).status).toBe(503)
    transport.onMessage(() => {})
    expect(await probe(path)).toEqual({status: 200, body: {nonce: 'A'.repeat(32), device_id: 'device-1', generation: 1,
      platform_installation_id: 'platform-installation-1', channel: 'ws', ready: true}})
    for (const modified of [{...headers, Origin: 'null'}, {...headers, 'X-CE-Device-Proof': ''},
      {...headers, 'X-CE-Device-Proof': 'b'.repeat(43)}, {Host: '127.0.0.1:' + transport.resolvedPort, Origin: 'http://127.0.0.1:14401'}] as Array<Record<string, string>>) {
      expect((await probe(path, modified)).status).toBe(403)
    }
    for (const invalid of ['/__ce_remote_health', path + '&nonce=x', path + '&extra=1', '/__ce_remote_health?nonce=short']) {
      expect((await probe(invalid)).status).toBe(400)
    }
    expect((await probe(path, headers, 'POST')).status).toBe(405)
  })

  it('rejects wrong origins before the attempt budget, then bounds anonymous slots', async () => {
    const transport = await start()
    for (let index = 0; index < 20; index++) {
      expect(await dial(transport, { ...headers, Origin: 'https://wrong' })).toBe(403)
    }
    for (let index = 0; index < 16; index++) await accepted(transport)
    expect(state(transport).remotePreAuth.size).toBe(16)
    expect(await dial(transport)).toBe(429)
    now = 125
    expect(await dial(transport)).toBe(503)
    clients.find((client) => client.readyState === WebSocket.OPEN)!.terminate()
    await vi.waitFor(() => expect(state(transport).remotePreAuth.size).toBe(15))
    now = 250
    await accepted(transport)
    expect(state(transport).remotePreAuth.size).toBe(16)
    await transport.stop()
    expect(state(transport).remotePreAuth.size).toBe(0)
    expect(state(transport).pendingUpgrades.size).toBe(0)
  })

  it('returns authenticated slots while preserving their traffic during anonymous saturation', async () => {
    const transport = await start()
    transport.onMessage((message, reply, socket) => {
      if (message === 'synthetic-auth') transport.setClientId(socket, 'fixture-device')
      reply('ack')
    })
    const authorized = await accepted(transport)
    expect(await exchange(authorized, 'synthetic-auth')).toBe('ack')
    expect(state(transport).remotePreAuth.size).toBe(0)
    for (let index = 0; index < 16; index++) {
      now += 125
      await accepted(transport)
    }
    now += 125
    expect(await dial(transport)).toBe(503)
    expect(await exchange(authorized, 'still-active')).toBe('ack')
  })

  it('reclaims timed-out unauthenticated sockets and admits a later connection', async () => {
    const transport = await start(30)
    const client = await accepted(transport)
    await new Promise<void>((resolve) => client.once('close', () => resolve()))
    await vi.waitFor(() => expect(state(transport).remotePreAuth.size).toBe(0))
    now = 125
    await accepted(transport)
  })

  it('releases a rejected raw handshake and a synchronous upgrade failure', async () => {
    const transport = await start()
    const response = await new Promise<string>((resolve, reject) => {
      const raw = connect(transport.resolvedPort, '127.0.0.1')
      let text = ''
      raw.on('error', reject)
      raw.on('data', (chunk) => { text += chunk.toString() })
      raw.once('close', () => resolve(text))
      raw.once('connect', () => raw.write(
        'GET / HTTP/1.1\r\nHost: 192.0.2.1\r\nOrigin: https://192.0.2.1\r\n' +
        `X-CE-Device-Proof: ${proof}\r\n` +
        'Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 12\r\n' +
        `Sec-WebSocket-Key: ${Buffer.alloc(16).toString('base64')}\r\n\r\n`
      ))
    })
    expect(response).toContain('400')
    await vi.waitFor(() => expect(state(transport).pendingUpgrades.size).toBe(0))
    vi.spyOn(state(transport).wss, 'handleUpgrade').mockImplementationOnce(() => { throw new Error('fixture upgrade failure') })
    await expect(dial(transport)).rejects.toThrow()
    await vi.waitFor(() => expect(state(transport).pendingUpgrades.size).toBe(0))
    await accepted(transport)
  })

  it('times out upgrades with no callback and rejects a callback arriving after raw close', async () => {
    const transport = await start(30)
    let callback: ((ws: WebSocket) => void) | undefined
    vi.spyOn(state(transport).wss, 'handleUpgrade').mockImplementationOnce((request, _socket, _head, done) => {
      callback = (ws) => done(ws, request)
    })
    await expect(dial(transport)).rejects.toThrow()
    await vi.waitFor(() => expect(state(transport).pendingUpgrades.size).toBe(0))
    const late = { terminate: vi.fn() } as unknown as WebSocket
    callback!(late)
    expect(late.terminate).toHaveBeenCalledOnce()
    expect(state(transport).remotePreAuth.size).toBe(0)
    await accepted(transport)
  })

  it('owns reservations until physical close and transfers raw ownership exactly once', () => {
    const transport = new WebSocketTransport({ host: '127.0.0.1', port: 0 })
    transports.push(transport)
    const raw = Object.assign(new EventEmitter(), { destroyed: false, destroy: vi.fn() }) as unknown as Duplex
    const release = vi.fn()
    state(transport).reserveRemoteUpgrade(raw, release)
    raw.emit('error', new Error('fixture'))
    expect(raw.destroy).toHaveBeenCalledOnce()
    expect(release).not.toHaveBeenCalled()
    raw.emit('close')
    raw.emit('close')
    expect(release).toHaveBeenCalledOnce()
    const nextRaw = Object.assign(new EventEmitter(), { destroyed: false, destroy: vi.fn() }) as unknown as Duplex
    const nextRelease = vi.fn()
    const handoff = state(transport).reserveRemoteUpgrade(nextRaw, nextRelease)
    const ws = new EventEmitter() as unknown as WebSocket
    expect(handoff(ws)).toBe(true)
    nextRaw.emit('close')
    expect(nextRelease).not.toHaveBeenCalled()
    transport.setClientId(ws, 'fixture-device')
    ws.emit('close')
    expect(nextRelease).toHaveBeenCalledOnce()
    expect(state(transport).remotePreAuth.size).toBe(0)
  })

  it('destroys pending raw upgrades when the transport stops', async () => {
    const transport = await start()
    vi.spyOn(state(transport).wss, 'handleUpgrade').mockImplementationOnce(() => {})
    const connection = dial(transport).catch(() => 'closed')
    await vi.waitFor(() => expect(state(transport).pendingUpgrades.size).toBe(1))
    await transport.stop()
    expect(await connection).toBe('closed')
    expect(state(transport).pendingUpgrades.size).toBe(0)
    expect(state(transport).remotePreAuth.size).toBe(0)
  })

  it('closes a null hello without disrupting a genuinely E2EE-authenticated socket', async () => {
    const transport = await start()
    const serverKeys = generateKeyPair()
    const channels = new Map<WebSocket, E2EEChannel>()
    transport.onConnectionClose((_client, socket) => { channels.get(socket)?.destroy(); channels.delete(socket) })
    transport.onMessage((message, _reply, socket) => {
      let channel = channels.get(socket)
      if (!channel) {
        channel = new E2EEChannel(socket, {
          serverSecretKey: serverKeys.secretKey,
          resolveAuthenticatedDevice: (token) => token === 'fixture-token' ? {
            deviceId: 'fixture-device', deviceToken: token, clientId: token,
            scope: 'runtime', callerFingerprint: 'fixture', credentialRevision: 0
          } : null,
          onReady: () => transport.setClientId(socket, 'fixture-device'),
          onError: (code, reason) => { channels.get(socket)?.destroy(); socket.close(code, reason) }
        })
        channel.onMessage((plaintext, reply) => reply(`ack:${plaintext}`))
        channels.set(socket, channel)
      }
      channel.handleRawMessage(message)
    })
    const authorized = await accepted(transport)
    const clientKeys = generateKeyPair()
    const key = deriveSharedKey(clientKeys.secretKey, serverKeys.publicKey)
    expect(JSON.parse(await exchange(authorized, JSON.stringify({
      type: 'e2ee_hello', publicKeyB64: Buffer.from(clientKeys.publicKey).toString('base64')
    }))).type).toBe('e2ee_ready')
    const authentication = encrypt(JSON.stringify({ type: 'e2ee_auth', deviceToken: 'fixture-token' }), key)
    const authReply = decrypt(await exchange(authorized, authentication), key)
    expect(JSON.parse(authReply!).type).toBe('e2ee_authenticated')
    const anonymous = await accepted(transport)
    const closed = new Promise<number>((resolve) => anonymous.once('close', (code) => resolve(code)))
    anonymous.send('null')
    expect(await closed).toBe(4001)
    expect(decrypt(await exchange(authorized, encrypt('alive', key)), key)).toBe('ack:alive')
    await vi.waitFor(() => expect(state(transport).remotePreAuth.size).toBe(0))
  })
})
