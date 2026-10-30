import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acquireProfileStateMaintenance,
  acquireProfileStateRuntimeAdmission
} from './profile-state-access'
import { migrateProfileStateDataNames } from './profile-state-data-name-migration'

vi.mock('node:fs', async (original) => ({ ...(await original<typeof fs>()) }))

const roots: string[] = []
function root(): string {
  const directory = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'profile-name-migration-')))
  roots.push(directory)
  return directory
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of roots.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('profile state data filename migration', () => {
  it('moves the root and every profile JSON family without changing data or SQLite files', () => {
    const directory = root()
    const first = join(directory, 'profiles', 'local-default')
    const second = join(directory, 'profiles', 'other')
    fs.mkdirSync(first, { recursive: true })
    fs.mkdirSync(second, { recursive: true })
    const names = [
      'orca-data.json',
      ...[0, 1, 2, 3, 4].map((i) => `orca-data.json.bak.${i}`),
      'orca-data.json.sqlite-export.1.json',
      'orca-data.json.sqlite-export.42.json'
    ]
    for (const folder of [directory, first, second]) {
      for (const name of names) fs.writeFileSync(join(folder, name), `${folder}:${name}`)
      fs.writeFileSync(join(folder, 'profile-state.db-wal'), 'database wal')
      fs.writeFileSync(join(folder, 'orca-data.json.sqlite-export.notes.json'), 'unmanaged')
    }
    const maintenance = acquireProfileStateMaintenance(directory)
    try {
      expect(migrateProfileStateDataNames(directory, maintenance)).toBe(names.length * 3)
      expect(migrateProfileStateDataNames(directory, maintenance)).toBe(0)
      for (const folder of [directory, first, second]) {
        for (const name of names) {
          expect(fs.existsSync(join(folder, name))).toBe(false)
          expect(
            fs.readFileSync(join(folder, name.replace('orca-data.json', 'zkyq-data.json')), 'utf8')
          ).toBe(`${folder}:${name}`)
        }
        expect(fs.readFileSync(join(folder, 'profile-state.db-wal'), 'utf8')).toBe('database wal')
        expect(
          fs.readFileSync(join(folder, 'orca-data.json.sqlite-export.notes.json'), 'utf8')
        ).toBe('unmanaged')
      }
    } finally {
      maintenance.release()
    }
  })

  it('rejects conflicting destinations before moving any member', () => {
    const directory = root()
    fs.writeFileSync(join(directory, 'orca-data.json'), 'old')
    fs.writeFileSync(join(directory, 'orca-data.json.bak.0'), 'backup')
    fs.writeFileSync(join(directory, 'zkyq-data.json.bak.0'), 'different')
    const maintenance = acquireProfileStateMaintenance(directory)
    try {
      expect(() => migrateProfileStateDataNames(directory, maintenance)).toThrow(
        'destination already exists'
      )
      expect(fs.readFileSync(join(directory, 'orca-data.json'), 'utf8')).toBe('old')
      expect(fs.readFileSync(join(directory, 'orca-data.json.bak.0'), 'utf8')).toBe('backup')
      expect(fs.readFileSync(join(directory, 'zkyq-data.json.bak.0'), 'utf8')).toBe('different')
      expect(fs.existsSync(join(directory, 'zkyq-data.json'))).toBe(false)
    } finally {
      maintenance.release()
    }
  })

  it('resumes an interrupted link before removing the old name', () => {
    const directory = root()
    const source = join(directory, 'orca-data.json')
    const target = join(directory, 'zkyq-data.json')
    fs.writeFileSync(source, 'state')
    const maintenance = acquireProfileStateMaintenance(directory)
    try {
      const spy = vi.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {
        throw new Error('interrupted')
      })
      expect(() => migrateProfileStateDataNames(directory, maintenance)).toThrow('interrupted')
      spy.mockRestore()
      expect(fs.readFileSync(source, 'utf8')).toBe('state')
      expect(fs.readFileSync(target, 'utf8')).toBe('state')
      expect(fs.statSync(source).ino).toBe(fs.statSync(target).ino)
      expect(migrateProfileStateDataNames(directory, maintenance)).toBe(1)
      expect(fs.existsSync(source)).toBe(false)
      expect(fs.readFileSync(target, 'utf8')).toBe('state')
    } finally {
      maintenance.release()
    }
  })

  it('leaves the source untouched when hard-link publication is unavailable', () => {
    const directory = root()
    const source = join(directory, 'orca-data.json')
    fs.writeFileSync(source, 'state')
    const maintenance = acquireProfileStateMaintenance(directory)
    try {
      vi.spyOn(fs, 'linkSync').mockImplementationOnce(() => {
        throw new Error('unsupported')
      })
      expect(() => migrateProfileStateDataNames(directory, maintenance)).toThrow('unsupported')
      expect(fs.readFileSync(source, 'utf8')).toBe('state')
      expect(fs.existsSync(join(directory, 'zkyq-data.json'))).toBe(false)
    } finally {
      maintenance.release()
    }
  })

  it('requires the matching live maintenance owner and excludes active runtimes', () => {
    const directory = root()
    const other = root()
    fs.writeFileSync(join(directory, 'orca-data.json'), 'state')
    const running = acquireProfileStateRuntimeAdmission(directory)
    expect(() => acquireProfileStateMaintenance(directory)).toThrow()
    running.release()
    const maintenance = acquireProfileStateMaintenance(other)
    expect(() => migrateProfileStateDataNames(directory, maintenance)).toThrow('root')
    expect(() => migrateProfileStateDataNames(other, { ...maintenance })).toThrow('acquired')
    maintenance.release()
    expect(() => migrateProfileStateDataNames(other, maintenance)).toThrow('released')
    expect(fs.readFileSync(join(directory, 'orca-data.json'), 'utf8')).toBe('state')
  })

  it('refuses a reserved name that is not a regular file before moving any files', () => {
    const directory = root()
    fs.writeFileSync(join(directory, 'orca-data.json'), 'state')
    fs.mkdirSync(join(directory, 'orca-data.json.bak.1'))
    const maintenance = acquireProfileStateMaintenance(directory)
    try {
      expect(() => migrateProfileStateDataNames(directory, maintenance)).toThrow(
        'not a regular file'
      )
      expect(fs.readFileSync(join(directory, 'orca-data.json'), 'utf8')).toBe('state')
      expect(fs.existsSync(join(directory, 'zkyq-data.json'))).toBe(false)
    } finally {
      maintenance.release()
    }
  })

  it('refuses linked profile directories', () => {
    const directory = root()
    const outside = root()
    fs.mkdirSync(join(directory, 'profiles'))
    fs.symlinkSync(outside, join(directory, 'profiles', 'other'), 'junction')
    fs.writeFileSync(join(outside, 'orca-data.json'), 'outside')
    const maintenance = acquireProfileStateMaintenance(directory)
    try {
      expect(() => migrateProfileStateDataNames(directory, maintenance)).toThrow('not a directory')
      expect(fs.readFileSync(join(outside, 'orca-data.json'), 'utf8')).toBe('outside')
    } finally {
      maintenance.release()
    }
  })
})
