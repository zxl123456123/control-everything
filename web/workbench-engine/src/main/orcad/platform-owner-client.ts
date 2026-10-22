/** One bounded owner-pipe request. Auth material arrives on stdin, never argv. */
import { createConnection } from 'node:net'
import { randomUUID } from 'node:crypto'
import { decodePairingOffer } from '../../shared/pairing'

const METHODS = new Set(['repo.list', 'repo.add', 'worktree.list', 'platform.bootstrapDevice', 'platform.revokeDevice'])
const MAX_BYTES = 1024 * 1024

async function main(): Promise<void> {
  let input = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) {
    input += chunk.toString('utf8')
    if (Buffer.byteLength(input) > MAX_BYTES) throw new Error('owner_request_too_large')
  }
  const request = JSON.parse(input)
  if (!METHODS.has(request.method) || typeof request.authToken !== 'string' || !request.authToken ||
      typeof request.endpoint !== 'string' || !request.endpoint.startsWith('\\\\.\\pipe\\') ||
      typeof request.expectedRuntimeId !== 'string' || !request.expectedRuntimeId) {
    throw new Error('owner_request_invalid')
  }
  const id = randomUUID()
  const response = await new Promise<{ ok: boolean; result?: unknown }>((resolve, reject) => {
    const socket = createConnection(request.endpoint)
    socket.setEncoding('utf8')
    let pending = ''
    const deadline = setTimeout(() => finish(new Error('owner_request_timeout')), 25000)
    const finish = (error?: Error, value?: { ok: boolean; result?: unknown }): void => {
      clearTimeout(deadline)
      socket.destroy()
      if (error) reject(error)
      else resolve(value!)
    }
    socket.once('error', error => finish(error))
    socket.once('connect', () => socket.write(JSON.stringify({ id, method: request.method,
      params: request.params, authToken: request.authToken }) + '\n'))
    socket.on('data', chunk => {
      pending += chunk.toString('utf8')
      if (Buffer.byteLength(pending) > MAX_BYTES) return finish(new Error('owner_reply_too_large'))
      while (pending.includes('\n')) {
        const boundary = pending.indexOf('\n')
        const line = pending.slice(0, boundary)
        pending = pending.slice(boundary + 1)
        try {
          const value = JSON.parse(line)
          if (value._keepalive === true) continue
          if (value.id !== id || value._meta?.runtimeId !== request.expectedRuntimeId) {
            return finish(new Error('owner_reply_identity_mismatch'))
          }
          if (!value.ok) return finish(new Error('owner_rpc_rejected'))
          if (request.method === 'platform.bootstrapDevice' && value.result?.available === true) {
            value.result.offer = decodePairingOffer(value.result.pairingUrl)
          }
          return finish(undefined, value)
        } catch {
          return finish(new Error('owner_reply_invalid'))
        }
      }
    })
    socket.once('end', () => finish(new Error('owner_reply_incomplete')))
  })
  process.stdout.write(JSON.stringify(response) + '\n')
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ ok: false, error: { code: 'runtime_owner_request_failed' } }) + '\n')
  process.exitCode = 1
})
