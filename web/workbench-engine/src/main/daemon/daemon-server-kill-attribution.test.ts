import './mock-descendant-sweep'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DaemonServer } from './daemon-server'
import { SessionNotFoundError, type DaemonRequest } from './types'

type DaemonServerPrivate = {
  host: {
    kill: (sessionId: string, opts?: { immediate?: boolean }) => void | Promise<void>
    killExact: (sessionId: string, incarnation: string, opts?: { immediate?: boolean }) => Promise<void>
  }
  attachments: { clearInput(sessionId: string): void }
  preparations: {
    pending: Map<string, Set<{ canceled: boolean; clientId: string }>>
  }
  requestRouter: {
    route(clientId: string, request: DaemonRequest): Promise<unknown>
  }
}

describe('daemon kill attribution', () => {
  let server: DaemonServer
  let dir: string

  afterEach(async () => {
    await server?.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  it('routes killExact without canceling a pending replacement or clearing input on refusal', async () => {
    dir = mkdtempSync(join(tmpdir(), 'daemon-kill-exact-'))
    server = new DaemonServer({ socketPath: join(dir, 'daemon.sock'), tokenPath: join(dir, 'daemon.token'),
      spawnSubprocess: () => { throw new Error('not used') } })
    const daemon = server as unknown as DaemonServerPrivate
    const pending = { canceled: false, controller: new AbortController(), clientId: 'other' }
    daemon.preparations.pending.set('target', new Set([pending]))
    const clear = vi.spyOn(daemon.attachments, 'clearInput')
    const exact = vi.spyOn(daemon.host, 'killExact').mockImplementation(() => { throw new Error('terminal_incarnation_changed') })
    const request: DaemonRequest = { id: 'exact', type: 'killExact',
      payload: { sessionId: 'target', expectedIncarnationId: 'birth', immediate: true } }
    await expect(daemon.requestRouter.route('control', request)).rejects.toThrow('terminal_incarnation_changed')
    expect(pending.canceled).toBe(false)
    expect(clear).not.toHaveBeenCalled()
    exact.mockResolvedValueOnce()
    await daemon.requestRouter.route('control', request)
    expect(exact).toHaveBeenLastCalledWith('target', 'birth', { immediate: true })
    expect(pending.canceled).toBe(false)
    expect(clear).toHaveBeenCalledOnce()
  })

  it.each([null, {}, { sessionId: 'target', expectedIncarnationId: '' },
    { sessionId: 'target', expectedIncarnationId: 3 },
    { sessionId: 'target', expectedIncarnationId: 'birth', immediate: 'yes' }])
    ('rejects malformed killExact input without falling back: %j', async payload => {
      dir = mkdtempSync(join(tmpdir(), 'daemon-kill-exact-invalid-'))
      server = new DaemonServer({ socketPath: join(dir, 'daemon.sock'), tokenPath: join(dir, 'daemon.token'),
        spawnSubprocess: () => { throw new Error('not used') } })
      const daemon = server as unknown as DaemonServerPrivate
      const kill = vi.spyOn(daemon.host, 'kill')
      // Exercise the untyped wire boundary, not just TypeScript callers.
      const request = { id: 'invalid', type: 'killExact', payload } as unknown as DaemonRequest
      await expect(daemon.requestRouter.route('control', request)).rejects.toThrow('invalid_exact_stop')
      expect(kill).not.toHaveBeenCalled()
    })

  it('records the requesting control client in the session-killed log', async () => {
    dir = mkdtempSync(join(tmpdir(), 'daemon-kill-attribution-'))
    const killLog = { log: vi.fn(), close: vi.fn() }
    server = new DaemonServer({
      socketPath: join(dir, 'daemon.sock'),
      tokenPath: join(dir, 'daemon.token'),
      log: killLog,
      spawnSubprocess: () => {
        throw new Error('not used')
      }
    })
    const daemon = server as unknown as DaemonServerPrivate
    let finishKill!: () => void
    const killFinished = new Promise<void>((resolve) => {
      finishKill = resolve
    })
    vi.spyOn(daemon.host, 'kill').mockReturnValue(killFinished)

    const request = daemon.requestRouter.route('control-42', {
      id: 'kill-1',
      type: 'kill',
      payload: { sessionId: 'agent-session', immediate: true }
    })

    await vi.waitFor(() => expect(daemon.host.kill).toHaveBeenCalledOnce())
    expect(killLog.log).not.toHaveBeenCalledWith('session-killed', expect.anything())
    finishKill()
    await request

    expect(killLog.log).toHaveBeenCalledWith('session-killed', {
      sessionId: 'agent-session',
      immediate: true,
      clientId: 'control-42'
    })
  })

  it('attributes a failed kill without claiming the session was killed', async () => {
    dir = mkdtempSync(join(tmpdir(), 'daemon-kill-attribution-'))
    const killLog = { log: vi.fn(), close: vi.fn() }
    server = new DaemonServer({
      socketPath: join(dir, 'daemon.sock'),
      tokenPath: join(dir, 'daemon.token'),
      log: killLog,
      spawnSubprocess: () => {
        throw new Error('not used')
      }
    })
    const daemon = server as unknown as DaemonServerPrivate
    vi.spyOn(daemon.host, 'kill').mockRejectedValue(new Error('kill refused'))

    await expect(
      daemon.requestRouter.route('control-42', {
        id: 'kill-1',
        type: 'kill',
        payload: { sessionId: 'agent-session', immediate: true }
      })
    ).rejects.toThrow('kill refused')

    expect(killLog.log).toHaveBeenCalledWith('session-kill-failed', {
      sessionId: 'agent-session',
      immediate: true,
      clientId: 'control-42',
      errorName: 'Error',
      error: 'kill refused'
    })
    expect(killLog.log).not.toHaveBeenCalledWith('session-killed', expect.anything())
  })

  it('attributes a tolerated kill after canceling a pending spawn', async () => {
    dir = mkdtempSync(join(tmpdir(), 'daemon-kill-attribution-'))
    const killLog = { log: vi.fn(), close: vi.fn() }
    server = new DaemonServer({
      socketPath: join(dir, 'daemon.sock'),
      tokenPath: join(dir, 'daemon.token'),
      log: killLog,
      spawnSubprocess: () => {
        throw new Error('not used')
      }
    })
    const daemon = server as unknown as DaemonServerPrivate
    const pendingPreparation = {
      canceled: false,
      controller: new AbortController(),
      clientId: 'control-42'
    }
    daemon.preparations.pending.set('agent-session', new Set([pendingPreparation]))
    vi.spyOn(daemon.host, 'kill').mockRejectedValue(new SessionNotFoundError('agent-session'))

    await daemon.requestRouter.route('control-42', {
      id: 'kill-1',
      type: 'kill',
      payload: { sessionId: 'agent-session', immediate: true }
    })

    expect(pendingPreparation.canceled).toBe(true)
    expect(killLog.log).toHaveBeenCalledWith('session-killed', {
      sessionId: 'agent-session',
      immediate: true,
      clientId: 'control-42'
    })
    expect(killLog.log).not.toHaveBeenCalledWith('session-kill-failed', expect.anything())
  })
})
