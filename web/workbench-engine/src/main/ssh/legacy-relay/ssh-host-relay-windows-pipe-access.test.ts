import { runProcess } from '@orca/process-host'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { Script } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  WINDOWS_PIPE_ACCESS_JS,
  WINDOWS_RELAY_INVENTORY_JS,
  parseWindowsRelayInventory,
  windowsPipesNotRunHere
} from './ssh-host-relay-windows-inventory'
import { getRemoteHostPlatform } from '../ssh-remote-platform'
import { windowsRelayPipePathsForSocketName } from './ssh-relay-endpoints'

it.each(['.zkyq-remote', '.orca-remote'])(
  'retains native Windows paths for %s pipe credentials',
  (root) => {
    const host = getRemoteHostPlatform('win32-x64')
    const home = win32.join(tmpdir(), 'relay-inventory-home')
    const dir = win32.join(home, root, 'relay-0.1.0+abcd1234')
    const pipe = windowsRelayPipePathsForSocketName(host, dir, 'sock')[0]
    const inventory = parseWindowsRelayInventory(
      host,
      home,
      [],
      JSON.stringify({
        directoryPaths: true,
        pipes: [pipe.slice('\\\\.\\pipe\\'.length)],
        dirs: { [dir]: { credentials: ['sock.credential'], markers: {} } }
      })
    )
    expect(inventory?.pipes).toContain(pipe)
    expect(inventory?.owners.get(pipe.toLowerCase())).toEqual({
      dir,
      credentialFile: dir.replace(/\\/g, '/') + '/sock.credential'
    })
  }
)

it('inventories an old root bridge once and preserves its original pipe coordinates', () => {
  const home = win32.join(tmpdir(), 'relay-inventory-home'),
    old = win32.join(home, '.orca-remote'),
    current = win32.join(home, '.zkyq-remote')
  const version = 'relay-0.1.0+abcd1234'
  const output: string[] = [],
    reads: string[] = []
  new Script(WINDOWS_RELAY_INVENTORY_JS).runInNewContext({
    process: {
      argv: ['node', old, current],
      stdout: { write: (text: string) => output.push(text) }
    },
    require: (name: string) =>
      name === 'path'
        ? win32
        : {
            realpathSync: () => current,
            readdirSync: (file: string) => {
              reads.push(file)
              if (file === '\\\\.\\pipe\\') return []
              if (file === old) return [version]
              if (file === win32.join(old, version)) return ['sock.credential']
              throw new Error('Unexpected directory read')
            }
          }
  })
  expect(JSON.parse(output[0])).toEqual({
    pipes: [],
    directoryPaths: true,
    dirs: {
      [win32.join(old, version)]: { credentials: ['sock.credential'], markers: {} }
    }
  })
  expect(reads).not.toContain(current)
})

class ProbeSocket extends EventEmitter {
  destroyed = false

  destroy(): void {
    this.destroyed = true
  }
}

function startProbe(paths: readonly string[]) {
  const sockets: ProbeSocket[] = []
  const timers = new Map<number, { callback: () => void; delay: number }>()
  const output: string[] = []
  let nextTimer = 0
  new Script(WINDOWS_PIPE_ACCESS_JS).runInNewContext({
    require: (name: string) => {
      if (name !== 'net') {
        throw new Error(`Unexpected module ${name}`)
      }
      return {
        connect: () => {
          const socket = new ProbeSocket()
          sockets.push(socket)
          return socket
        }
      }
    },
    process: { argv: ['node', ...paths], stdout: { write: (text: string) => output.push(text) } },
    setTimeout: (callback: () => void, delay: number) => {
      const id = ++nextTimer
      timers.set(id, { callback, delay })
      return id
    },
    clearTimeout: (id: number) => timers.delete(id)
  })
  const expireProbe = (): void => {
    const first = timers.entries().next().value
    if (!first) {
      throw new Error('No pending probe deadline')
    }
    const [id, timer] = first
    expect(timer.delay).toBe(2000)
    timers.delete(id)
    timer.callback()
  }
  return { sockets, timers, output, expireProbe }
}

describe('Windows relay pipe probe lifetime', () => {
  it('releases the deadline after an accepted connection', () => {
    const probe = startProbe(['pipe-a'])
    expect(probe.timers.size).toBe(1)
    probe.sockets[0].emit('connect')
    expect(probe.output).toEqual(['{"pipe-a":"ok"}'])
    expect(probe.sockets[0].destroyed).toBe(true)
    expect(probe.timers.size).toBe(0)
  })

  it.each(['EACCES', 'EPERM', 'ENOENT', 'ECONNREFUSED'])(
    'releases the deadline after %s',
    (code) => {
      const probe = startProbe(['pipe-a'])
      probe.sockets[0].emit('error', { code })
      expect(probe.output).toEqual([JSON.stringify({ 'pipe-a': code })])
      expect(probe.sockets[0].destroyed).toBe(true)
      expect(probe.timers.size).toBe(0)
      const foreign = windowsPipesNotRunHere(probe.output[0])
      expect(foreign.has('pipe-a')).toBe(code !== 'ECONNREFUSED')
    }
  )

  it('retains one active deadline and preserves sequential answers', () => {
    const probe = startProbe(['pipe-a', 'pipe-b'])
    probe.sockets[0].emit('connect')
    expect(probe.output).toEqual([])
    expect(probe.sockets).toHaveLength(2)
    expect(probe.timers.size).toBe(1)
    probe.sockets[1].emit('error', { code: 'EACCES' })
    expect(probe.output).toEqual(['{"pipe-a":"ok","pipe-b":"EACCES"}'])
    expect(probe.timers.size).toBe(0)
    probe.sockets[0].emit('error', { code: 'ENOENT' })
    probe.sockets[1].emit('connect')
    expect(probe.output).toHaveLength(1)
  })

  it('keeps a real unanswered deadline and rejects later answers', () => {
    const probe = startProbe(['pipe-a', 'pipe-b'])
    probe.expireProbe()
    expect(probe.output).toEqual([])
    expect(probe.sockets[0].destroyed).toBe(true)
    expect(probe.timers.size).toBe(1)
    probe.sockets[1].emit('connect')
    expect(probe.output).toEqual(['{"pipe-a":"timeout","pipe-b":"ok"}'])
    expect(windowsPipesNotRunHere(probe.output[0])).toEqual(new Set())
    expect(probe.timers.size).toBe(0)
    probe.sockets[0].emit('connect')
    expect(probe.output).toHaveLength(1)
  })

  it('has no deadlines when no pipes need probing', () => {
    const probe = startProbe([])
    expect(probe.output).toEqual(['{}'])
    expect(probe.timers.size).toBe(0)
    expect(probe.sockets).toEqual([])
  })

  it('lets the actual Node probe exit after answering live and missing pipes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-pipe-'))
    const socketPath =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\orca-test-${randomUUID()}`
        : join(dir, 'probe.sock')
    const missingPath = `${socketPath}-missing`
    const server = createServer((socket) => socket.on('error', () => socket.destroy()))
    await new Promise<void>((resolve) => server.listen(socketPath, resolve))
    try {
      const result = await runProcess({
        program: process.execPath,
        args: ['-e', WINDOWS_PIPE_ACCESS_JS, socketPath, missingPath],
        timeoutMs: 1500
      })
      expect(result.stdout).toBe(JSON.stringify({ [socketPath]: 'ok', [missingPath]: 'ENOENT' }))
      expect(result.timedOut).toBe(false)
      expect(result.code).toBe(0)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
