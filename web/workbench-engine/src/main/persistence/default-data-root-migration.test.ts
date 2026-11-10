import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acquireProfileStateRuntimeAdmission } from './profile-state/profile-state-access'
import {
  migrateDefaultCredentialDataRoot,
  migrateDefaultProfileDataRoot,
  handOffDefaultDataRootToPreviousBuild,
  resolveMigratedDefaultDataRoot
} from './default-data-root-migration'
import {
  defaultDataRootRecordPaths,
  newDefaultDataRootRecord,
  readDefaultDataRootRecord,
  writeDefaultDataRootRecord
} from './default-data-root-record'

const readers = vi.hoisted(() => ({
  daemon: 'quiet',
  credentials: 'quiet',
  machine: '0123456789abcdef' as string | null
}))
vi.mock('./default-data-root-readers', () => ({
  defaultDataRootDaemonReaders: () => readers.daemon,
  defaultCredentialRootProcessReaders: async () => readers.credentials,
  retireIdleDefaultDataRootDaemons: async () => {}
}))
vi.mock('./default-data-root-record', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./default-data-root-record')>()),
  defaultDataRootMachineTag: () => readers.machine,
  prepareDefaultDataRootMigrationIdentity: async () => {}
}))

const roots: string[] = []
function fixture() {
  const parent = mkdtempSync(join(tmpdir(), 'default-root-'))
  roots.push(parent)
  return { parent, previous: join(parent, '.orca'), current: join(parent, '.zkyq') }
}

beforeEach(() => {
  readers.daemon = 'quiet'
  readers.credentials = 'quiet'
  readers.machine = '0123456789abcdef'
})
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('default data root convergence', () => {
  it('moves an idle root without copying state or sealed key bytes and removes the old entrance', () => {
    const { previous, current } = fixture()
    mkdirSync(previous)
    const bytes = Buffer.from([0, 1, 255, 82, 0])
    writeFileSync(join(previous, 'sealed.json'), bytes)
    const before = statSync(join(previous, 'sealed.json'), { bigint: true })
    expect(migrateDefaultProfileDataRoot(previous, current)).toBe(current)
    expect(existsSync(previous)).toBe(false)
    expect(lstatSync(current).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(current, 'sealed.json'))).toEqual(bytes)
    expect(statSync(join(current, 'sealed.json'), { bigint: true }).ino).toBe(before.ino)
    expect(readDefaultDataRootRecord(current)?.phase).toBe('complete')
    expect(existsSync(join(current, 'orcad.lock'))).toBe(false)
  })

  it('keeps one writable data view while an admitted profile is active', () => {
    const { previous, current } = fixture()
    const active = acquireProfileStateRuntimeAdmission(previous)
    try {
      expect(migrateDefaultProfileDataRoot(previous, current)).toBe(current)
      expect(lstatSync(current).isSymbolicLink()).toBe(true)
      writeFileSync(join(previous, 'latest.txt'), 'old writer')
      expect(readFileSync(join(current, 'latest.txt'), 'utf8')).toBe('old writer')
      writeFileSync(join(current, 'latest.txt'), 'new writer')
      expect(readFileSync(join(previous, 'latest.txt'), 'utf8')).toBe('new writer')
      expect(readDefaultDataRootRecord(current)?.phase).toBe('bridged')
    } finally {
      active.release()
    }
  })

  it('preserves the daemon entrance while a terminal daemon is active', () => {
    const { previous, current } = fixture()
    mkdirSync(previous)
    readers.daemon = 'live'
    migrateDefaultProfileDataRoot(previous, current)
    expect(lstatSync(previous).isDirectory()).toBe(true)
    expect(lstatSync(current).isSymbolicLink()).toBe(true)
    expect(readDefaultDataRootRecord(current)?.phase).toBe('bridged')
  })

  it('refuses two independent roots without overwriting either root', () => {
    const { previous, current } = fixture()
    for (const path of [previous, current]) mkdirSync(path)
    writeFileSync(join(previous, 'state.txt'), 'previous')
    writeFileSync(join(current, 'state.txt'), 'current')
    expect(() => migrateDefaultProfileDataRoot(previous, current)).toThrow(
      'Both default data directories exist'
    )
    expect(readFileSync(join(previous, 'state.txt'), 'utf8')).toBe('previous')
    expect(readFileSync(join(current, 'state.txt'), 'utf8')).toBe('current')
  })

  it('creates a fresh canonical root without creating the previous entrance', () => {
    const { previous, current } = fixture()
    expect(migrateDefaultProfileDataRoot(previous, current)).toBe(current)
    expect(lstatSync(current).isDirectory()).toBe(true)
    expect(existsSync(previous)).toBe(false)
    expect(readDefaultDataRootRecord(current)?.phase).toBe('complete')
  })

  it('resumes an interrupted rename and retires the temporary reverse entrance', () => {
    const { previous, current } = fixture()
    mkdirSync(current)
    writeFileSync(join(current, 'state.txt'), 'latest after rename')
    mkdirSync(defaultDataRootRecordPaths(current).coordinator, { recursive: true })
    writeDefaultDataRootRecord(current, newDefaultDataRootRecord(previous, current))
    migrateDefaultProfileDataRoot(previous, current)
    expect(existsSync(previous)).toBe(false)
    expect(readFileSync(join(current, 'state.txt'), 'utf8')).toBe('latest after rename')
    expect(readDefaultDataRootRecord(current)?.phase).toBe('complete')
  })

  it('repairs absolute links into the moved root and preserves external links', () => {
    const { parent, previous, current } = fixture()
    mkdirSync(join(previous, 'payload'), { recursive: true })
    mkdirSync(join(parent, 'external'))
    writeFileSync(join(previous, 'payload', 'state.txt'), 'preserved')
    const type = process.platform === 'win32' ? 'junction' : 'dir'
    symlinkSync(join(previous, 'payload'), join(previous, 'inside'), type)
    symlinkSync(join(parent, 'external'), join(previous, 'outside'), type)
    const external = readlinkSync(join(previous, 'outside'))
    migrateDefaultProfileDataRoot(previous, current)
    expect(readFileSync(join(current, 'inside', 'state.txt'), 'utf8')).toBe('preserved')
    expect(readlinkSync(join(current, 'outside'))).toBe(external)
    expect(resolve(readlinkSync(join(current, 'inside')))).toContain('payload')
    expect(existsSync(previous)).toBe(false)
  })

  it('defers shared credential retirement when another reader cannot be excluded', async () => {
    const { previous, current } = fixture()
    mkdirSync(previous)
    writeFileSync(join(previous, 'sealed.json'), 'unchanged ciphertext')
    readers.credentials = 'unverifiable'
    expect(await migrateDefaultCredentialDataRoot(previous, current)).toBe(current)
    expect(lstatSync(current).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(previous, 'sealed.json'), 'utf8')).toBe('unchanged ciphertext')
    expect(readDefaultDataRootRecord(current)?.phase).toBe('bridged')
  })

  it('keeps the previous data view when machine ownership cannot be established', () => {
    const { previous, current } = fixture()
    mkdirSync(previous)
    readers.machine = null
    migrateDefaultProfileDataRoot(previous, current)
    expect(lstatSync(current).isSymbolicLink()).toBe(true)
    expect(readDefaultDataRootRecord(current)?.expectedMachines).toContain('unattributed')
  })

  it('finishes a deferred local move once its previously unavailable machine identity is proven', () => {
    const { previous, current } = fixture()
    mkdirSync(previous)
    mkdirSync(defaultDataRootRecordPaths(current).coordinator, { recursive: true })
    const record = newDefaultDataRootRecord(previous, current)
    record.expectedMachines = ['unattributed']
    writeDefaultDataRootRecord(current, record)
    migrateDefaultProfileDataRoot(previous, current)
    expect(existsSync(previous)).toBe(false)
    expect(readDefaultDataRootRecord(current)?.phase).toBe('complete')
    expect(readDefaultDataRootRecord(current)?.expectedMachines).not.toContain('unattributed')
  })

  it('hands the latest data to a previous build without making a second data tree', () => {
    const { previous, current } = fixture()
    mkdirSync(previous)
    writeFileSync(join(previous, 'state.txt'), 'latest')
    migrateDefaultProfileDataRoot(previous, current)
    handOffDefaultDataRootToPreviousBuild(previous, current)
    expect(lstatSync(previous).isSymbolicLink()).toBe(true)
    expect(readFileSync(join(previous, 'state.txt'), 'utf8')).toBe('latest')
    writeFileSync(join(previous, 'state.txt'), 'written by previous build')
    expect(readFileSync(join(current, 'state.txt'), 'utf8')).toBe('written by previous build')
    expect(readDefaultDataRootRecord(current)?.phase).toBe('previous-build')
    expect(resolveMigratedDefaultDataRoot(previous)).toBe(current)
  })

  it('does not invent a rollback entrance or redirect an explicitly selected custom root', () => {
    const { previous, current } = fixture()
    mkdirSync(current)
    handOffDefaultDataRootToPreviousBuild(previous, current)
    expect(existsSync(previous)).toBe(false)
    expect(resolveMigratedDefaultDataRoot(previous)).toBe(previous)
  })

  it('refuses a previous-build handoff while the moved root still has a daemon', () => {
    const { previous, current } = fixture()
    mkdirSync(previous)
    migrateDefaultProfileDataRoot(previous, current)
    readers.daemon = 'live'
    expect(() => handOffDefaultDataRootToPreviousBuild(previous, current)).toThrow(
      'Stop the terminal daemon'
    )
    expect(existsSync(previous)).toBe(false)
    expect(readDefaultDataRootRecord(current)?.phase).toBe('complete')
  })
})
