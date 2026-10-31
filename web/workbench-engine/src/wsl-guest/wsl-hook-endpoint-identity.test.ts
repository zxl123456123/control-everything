import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  writeSync,
  symlinkSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareWslHookEndpointDirectory } from './wsl-hook-endpoint-identity'
import { wslHookRelayEndpointDir } from '../shared/wsl-hook-relay-contract'

const fault = vi.hoisted(() => ({ link: false, busy: false }))
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return {
    ...fs,
    renameSync: (...args: Parameters<typeof fs.renameSync>) => {
      if (fault.busy) throw Object.assign(new Error('fixture busy directory'), { code: 'EACCES' })
      return fs.renameSync(...args)
    },
    symlinkSync: (...args: Parameters<typeof fs.symlinkSync>) => {
      if (fault.link) throw new Error('fixture link publication failed')
      // Windows junctions exercise real directory links without elevation.
      return fs.symlinkSync(args[0], args[1], process.platform === 'win32' ? 'junction' : args[2])
    }
  }
})

let home: string
let retired: string
let current: string
const body =
  'ORCA_AGENT_HOOK_PORT=12345\nORCA_AGENT_HOOK_TOKEN=fixture-token\nORCA_AGENT_HOOK_ENV=remote\nORCA_AGENT_HOOK_VERSION=1\n'
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'zkyq-wsl-endpoint-'))
  retired = join(home, '.orca-wsl', 'agent-hooks', 'instance-fixture')
  current = wslHookRelayEndpointDir(home, 'fixture')
})
afterEach(() => {
  fault.link = false
  fault.busy = false
  rmSync(home, { recursive: true, force: true })
})
const seed = () => {
  mkdirSync(retired, { recursive: true })
  writeFileSync(join(retired, 'endpoint.env'), body)
}

it('uses only the current location for a fresh instance', () => {
  expect(prepareWslHookEndpointDirectory(home, 'fixture')).toBe(current)
  expect(current).toContain('.zkyq-wsl/agent-hooks/instance-fixture')
  expect(existsSync(join(home, '.orca-wsl'))).toBe(false)
})

it('moves owned data and preserves frozen paths and spool bytes', () => {
  seed()
  mkdirSync(join(retired, 'spool'))
  const oldFile = join(retired, 'spool', 'events.jsonl')
  writeFileSync(oldFile, '')
  const inode = lstatSync(oldFile).ino
  writeFileSync(join(retired, 'user-note.txt'), 'preserved user bytes\n')
  expect(prepareWslHookEndpointDirectory(home, 'fixture')).toBe(current)
  expect(lstatSync(retired).isSymbolicLink()).toBe(true)
  expect(lstatSync(current).isDirectory()).toBe(true)
  expect(realpathSync(retired)).toBe(realpathSync(current))
  expect(readFileSync(join(current, 'endpoint.env'), 'utf8')).toBe(body)
  expect(readFileSync(join(current, 'user-note.txt'), 'utf8')).toBe('preserved user bytes\n')
  writeFileSync(oldFile, 'from-frozen-path\n', { flag: 'a' })
  expect(lstatSync(join(current, 'spool', 'events.jsonl')).ino).toBe(inode)
  expect(readFileSync(join(current, 'spool', 'events.jsonl'), 'utf8')).toBe('from-frozen-path\n')
  expect(prepareWslHookEndpointDirectory(home, 'fixture')).toBe(current)
})

it.skipIf(process.platform === 'win32')(
  'preserves an open POSIX spool writer across migration',
  () => {
    seed()
    mkdirSync(join(retired, 'spool'))
    const fd = openSync(join(retired, 'spool', 'events.jsonl'), 'a')
    try {
      prepareWslHookEndpointDirectory(home, 'fixture')
      writeSync(fd, 'from-held-fd\n')
      expect(readFileSync(join(current, 'spool', 'events.jsonl'), 'utf8')).toBe('from-held-fd\n')
    } finally {
      closeSync(fd)
    }
  }
)

it('keeps both sides unchanged when current and retired directories conflict', () => {
  seed()
  mkdirSync(current, { recursive: true })
  writeFileSync(join(current, 'endpoint-v2.env'), 'current bytes')
  expect(() => prepareWslHookEndpointDirectory(home, 'fixture')).toThrow('Both current and retired')
  expect(readFileSync(join(retired, 'endpoint.env'), 'utf8')).toBe(body)
  expect(readFileSync(join(current, 'endpoint-v2.env'), 'utf8')).toBe('current bytes')
})

it('keeps current coordinates usable while busy and relocates on the next startup', () => {
  seed()
  fault.busy = true
  expect(prepareWslHookEndpointDirectory(home, 'fixture')).toBe(current)
  expect(lstatSync(current).isSymbolicLink()).toBe(true)
  expect(lstatSync(retired).isDirectory()).toBe(true)
  expect(readFileSync(join(current, 'endpoint.env'), 'utf8')).toBe(body)
  fault.busy = false
  expect(prepareWslHookEndpointDirectory(home, 'fixture')).toBe(current)
  expect(lstatSync(current).isDirectory()).toBe(true)
  expect(lstatSync(retired).isSymbolicLink()).toBe(true)
  expect(readFileSync(join(current, 'endpoint.env'), 'utf8')).toBe(body)
})

it('does not move an unrecognized directory', () => {
  seed()
  writeFileSync(join(retired, 'endpoint.env'), body + 'USER_VALUE=keep\n')
  expect(() => prepareWslHookEndpointDirectory(home, 'fixture')).toThrow('unrecognized')
  expect(readFileSync(join(retired, 'endpoint.env'), 'utf8')).toBe(body + 'USER_VALUE=keep\n')
  expect(existsSync(current)).toBe(false)
})

it('retires the frozen-reader link after confirmed exit without changing current data', () => {
  seed()
  prepareWslHookEndpointDirectory(home, 'fixture')
  writeFileSync(join(current, 'new-session.json'), 'latest session bytes\n')
  const inode = lstatSync(join(current, 'new-session.json')).ino
  expect(prepareWslHookEndpointDirectory(home, 'fixture', true)).toBe(current)
  expect(lstatSync(retired, { throwIfNoEntry: false })).toBeUndefined()
  expect(readFileSync(join(current, 'new-session.json'), 'utf8')).toBe('latest session bytes\n')
  expect(lstatSync(join(current, 'new-session.json')).ino).toBe(inode)
  expect(existsSync(join(current, 'endpoint.env'))).toBe(false)
  prepareWslHookEndpointDirectory(home, 'fixture')
  expect(existsSync(retired)).toBe(false)
})

it('moves an owned cold directory without publishing an obsolete entry', () => {
  seed()
  writeFileSync(join(retired, 'queued.jsonl'), 'unread event\n')
  prepareWslHookEndpointDirectory(home, 'fixture', true)
  expect(lstatSync(current).isDirectory()).toBe(true)
  expect(existsSync(retired)).toBe(false)
  expect(existsSync(join(current, 'endpoint.env'))).toBe(false)
  expect(readFileSync(join(current, 'queued.jsonl'), 'utf8')).toBe('unread event\n')
})

it('retires an owned v1 endpoint after a previous partial retirement', () => {
  mkdirSync(current, { recursive: true })
  writeFileSync(join(current, 'endpoint.env'), body)
  prepareWslHookEndpointDirectory(home, 'fixture', true)
  expect(existsSync(join(current, 'endpoint.env'))).toBe(false)
})

it('preserves an unrecognized v1 file while retiring its owned directory link', () => {
  seed()
  prepareWslHookEndpointDirectory(home, 'fixture')
  writeFileSync(join(current, 'endpoint.env'), body + 'USER_VALUE=keep\n')
  prepareWslHookEndpointDirectory(home, 'fixture', true)
  expect(existsSync(retired)).toBe(false)
  expect(readFileSync(join(current, 'endpoint.env'), 'utf8')).toBe(body + 'USER_VALUE=keep\n')
})

it('retries a busy retirement without dropping pending data or rebuilding the old link', () => {
  seed()
  fault.busy = true
  prepareWslHookEndpointDirectory(home, 'fixture')
  writeFileSync(join(current, 'queued.jsonl'), 'latest pending event\n')
  prepareWslHookEndpointDirectory(home, 'fixture', true)
  expect(lstatSync(current).isSymbolicLink()).toBe(true)
  expect(readFileSync(join(retired, 'queued.jsonl'), 'utf8')).toBe('latest pending event\n')
  fault.busy = false
  prepareWslHookEndpointDirectory(home, 'fixture', true)
  expect(lstatSync(current).isDirectory()).toBe(true)
  expect(existsSync(retired)).toBe(false)
  expect(readFileSync(join(current, 'queued.jsonl'), 'utf8')).toBe('latest pending event\n')
})

it('does not remove an unrelated link even after confirmed exit', () => {
  mkdirSync(current, { recursive: true })
  const outside = join(home, 'other-instance')
  mkdirSync(outside)
  writeFileSync(join(outside, 'keep.txt'), 'user bytes')
  mkdirSync(join(retired, '..'), { recursive: true })
  symlinkSync(outside, retired, 'dir')
  expect(() => prepareWslHookEndpointDirectory(home, 'fixture', true)).toThrow('unexpected target')
  expect(readFileSync(join(retired, 'keep.txt'), 'utf8')).toBe('user bytes')
})

it('restores the original directory if publishing the frozen path fails', () => {
  seed()
  fault.link = true
  expect(() => prepareWslHookEndpointDirectory(home, 'fixture')).toThrow(
    'fixture link publication failed'
  )
  expect(lstatSync(retired).isDirectory()).toBe(true)
  expect(readFileSync(join(retired, 'endpoint.env'), 'utf8')).toBe(body)
  expect(existsSync(current)).toBe(false)
})

it.each(['.orca-wsl', '.zkyq-wsl'])(
  'rejects a linked %s parent without writing through it',
  (name) => {
    const outside = join(home, 'user-directory')
    mkdirSync(outside)
    writeFileSync(join(outside, 'keep.txt'), 'user bytes')
    symlinkSync(outside, join(home, name), 'dir')
    expect(() => prepareWslHookEndpointDirectory(home, 'fixture')).toThrow('symbolic link')
    expect(readFileSync(join(outside, 'keep.txt'), 'utf8')).toBe('user bytes')
    expect(existsSync(join(outside, 'agent-hooks'))).toBe(false)
  }
)

it('rejects an unexpected instance link and invalid path keys', () => {
  const outside = join(home, 'other-instance')
  mkdirSync(outside)
  mkdirSync(join(retired, '..'), { recursive: true })
  symlinkSync(outside, retired, 'dir')
  expect(() => prepareWslHookEndpointDirectory(home, 'fixture')).toThrow('unexpected target')
  expect(() => prepareWslHookEndpointDirectory(home, '../escape')).toThrow('Invalid')
  expect(realpathSync(retired)).toBe(realpathSync(outside))
})
