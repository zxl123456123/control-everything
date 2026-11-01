import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultCredentialRootProcessReaders,
  defaultDataRootDaemonReaders,
  retireIdleDefaultDataRootDaemons
} from './default-data-root-readers'

const fixture = vi.hoisted(() => ({
  rows: [] as { pid: number; ppid: number; command: string; name: string }[],
  status: 'live',
  verdict: 'matches',
  local: true,
  nonce: 'fixture-nonce',
  request: vi.fn(),
  disconnect: vi.fn()
}))
vi.mock('../windows/windows-process-table', () => ({
  readWindowsProcessTableFresh: async () => fixture.rows
}))
vi.mock('../../shared/process-table-snapshot-reader', () => ({
  getFreshProcessTableSnapshot: async () => fixture.rows,
  getStrictProcessTableSnapshot: async () => fixture.rows
}))
vi.mock('../daemon/daemon-process-inspection', () => ({
  inspectProcessLiveness: () => ({ status: fixture.status })
}))
vi.mock('../orcad/orcad-process-start-time', () => ({
  compareOrcadProcessIdentity: () => fixture.verdict
}))
vi.mock('../orcad/orcad-data-root-locality', () => ({
  orcadDataRootIsOnLocalDisk: () => fixture.local
}))
vi.mock('../daemon/client', () => ({
  DaemonClient: class {
    async ensureConnectedWithin() {}
    getDaemonIdentity() {
      return { pid: 12345, launchNonce: fixture.nonce }
    }
    request = fixture.request
    disconnect = fixture.disconnect
  }
}))

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'default-readers-'))
  fixture.rows = [
    { pid: process.pid, ppid: process.ppid, name: 'node.exe', command: 'node fixture.js' }
  ]
  fixture.status = 'live'
  fixture.verdict = 'matches'
  fixture.local = true
  fixture.nonce = 'fixture-nonce'
  fixture.request.mockReset().mockResolvedValue({ retiring: false })
  fixture.disconnect.mockReset()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
function daemon() {
  mkdirSync(join(root, 'daemon'))
  writeFileSync(
    join(root, 'daemon', 'daemon-v56.pid'),
    JSON.stringify({ pid: 12345, launchNonce: 'fixture-nonce' })
  )
}

describe('default root reader fences', () => {
  it('requires a complete process inventory containing the observer', async () => {
    fixture.rows = []
    expect(await defaultCredentialRootProcessReaders()).toBe('unverifiable')
  })
  it('allows unrelated protected services but refuses an unreadable Node process', async () => {
    fixture.rows.push({ pid: 4, ppid: 0, name: 'System', command: '' })
    expect(await defaultCredentialRootProcessReaders()).toBe('quiet')
    fixture.rows.push({ pid: 12345, ppid: 4, name: 'node.exe', command: '' })
    expect(await defaultCredentialRootProcessReaders()).toBe('unverifiable')
  })
  it('keeps old runtimes and renamed desktop clients live', async () => {
    for (const command of [
      'node /bundle/orcad-server.js --json',
      `"${join(root, 'ControlEverything.exe')}"`,
      `"${join(root, '掌控一切.exe')}"`
    ]) {
      fixture.rows = [fixture.rows[0], { pid: 12345, ppid: 4, name: 'fixture', command }]
      expect(await defaultCredentialRootProcessReaders()).toBe('live')
    }
  })
  it('exempts only this server’s immediate same-install launcher', async () => {
    const launcher = `node "${join(dirname(process.argv[1]), 'orcad.js')}"`
    fixture.rows.push({ pid: process.ppid, ppid: 4, name: 'node.exe', command: launcher })
    expect(await defaultCredentialRootProcessReaders()).toBe('quiet')
    fixture.rows.push({ pid: 12345, ppid: 4, name: 'node.exe', command: launcher })
    expect(await defaultCredentialRootProcessReaders()).toBe('live')
  })
  it('does not use a local PID to free a network-home daemon', () => {
    daemon()
    fixture.local = false
    fixture.status = 'exited'
    expect(defaultDataRootDaemonReaders(root)).toBe('unverifiable')
  })
  it('distinguishes a reused PID from a matching or unreadable daemon', () => {
    daemon()
    expect(defaultDataRootDaemonReaders(root)).toBe('live')
    fixture.verdict = 'differs'
    expect(defaultDataRootDaemonReaders(root)).toBe('quiet')
    fixture.status = 'unverifiable'
    expect(defaultDataRootDaemonReaders(root)).toBe('unverifiable')
  })
  it('asks for idle retirement without requesting a forced shutdown', async () => {
    daemon()
    await retireIdleDefaultDataRootDaemons(root)
    expect(fixture.request).toHaveBeenCalledExactlyOnceWith('shutdownIfIdle', undefined, 1000)
    expect(fixture.disconnect).toHaveBeenCalledOnce()
  })
  it('does not retire an endpoint whose authenticated nonce differs from the PID record', async () => {
    daemon()
    fixture.nonce = 'other-instance'
    await retireIdleDefaultDataRootDaemons(root)
    expect(fixture.request).not.toHaveBeenCalled()
    expect(fixture.disconnect).toHaveBeenCalledOnce()
  })
})
