import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { setAppEnvironment } from '../../shared/app-environment'
import { getDaemonRuntimeDir } from '../daemon/daemon-launch-paths'
import { getDaemonSocketPath } from '../daemon/daemon-spawner'
import {
  defaultDataRootRecordPaths,
  newDefaultDataRootRecord,
  writeDefaultDataRootRecord
} from './default-data-root-record'

const roots: string[] = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'default-root-'))
  roots.push(root)
  return root
}

function useRoot(root: string) {
  setAppEnvironment({
    getPath: () => root,
    getAppPath: () => root,
    getVersion: () => 'fixture',
    isPackaged: () => false,
    onWillQuit: () => {},
    exit: () => {},
    getAppMetrics: () => []
  })
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('default data root transition and persistent terminal identity', () => {
  it.each([
    ['.orca', '.zkyq'],
    ['Orca', 'zkyq'],
    ['orca', 'zkyq'],
    ['orca-dev', 'zkyq-dev'],
    ['.orca-1234abcd', '.zkyq-1234abcd']
  ])('retains the existing daemon endpoint while %s drains through %s', (previous, current) => {
    const root = fixture()
    const oldPath = join(root, previous)
    const newPath = join(root, current)
    mkdirSync(oldPath)
    useRoot(oldPath)
    const original = getDaemonRuntimeDir()
    const endpoint = getDaemonSocketPath(original)
    symlinkSync(oldPath, newPath, process.platform === 'win32' ? 'junction' : 'dir')
    useRoot(newPath)
    expect(getDaemonRuntimeDir()).toBe(original)
    expect(getDaemonSocketPath(getDaemonRuntimeDir())).toBe(endpoint)
  })

  it('keeps an explicitly selected custom alias on its existing endpoint', () => {
    const root = fixture()
    const selected = join(root, 'custom-profile')
    const target = join(root, 'profile-storage')
    mkdirSync(target)
    symlinkSync(target, selected, process.platform === 'win32' ? 'junction' : 'dir')
    useRoot(selected)
    expect(getDaemonRuntimeDir()).toBe(join(selected, 'daemon'))
  })

  it('uses the new directory after the migration bridge has retired', () => {
    const current = join(fixture(), '.zkyq')
    mkdirSync(current)
    useRoot(current)
    expect(getDaemonRuntimeDir()).toBe(join(current, 'daemon'))
  })

  it('retains the previous namespace while a recorded rollback entrance is in use', () => {
    const root = fixture()
    const previous = join(root, '.orca')
    const current = join(root, '.zkyq')
    mkdirSync(current)
    mkdirSync(defaultDataRootRecordPaths(current).coordinator, { recursive: true })
    const record = newDefaultDataRootRecord(previous, current)
    record.phase = 'previous-build'
    writeDefaultDataRootRecord(current, record)
    symlinkSync(current, previous, process.platform === 'win32' ? 'junction' : 'dir')
    useRoot(current)
    expect(getDaemonRuntimeDir()).toBe(join(previous, 'daemon'))
  })

  it('preserves a new-name alias whose target belongs to another directory', () => {
    const root = fixture()
    const selected = join(root, '.zkyq')
    const target = join(root, 'explicit-profile')
    mkdirSync(target)
    symlinkSync(target, selected, process.platform === 'win32' ? 'junction' : 'dir')
    useRoot(selected)
    expect(getDaemonRuntimeDir()).toBe(join(selected, 'daemon'))
  })

  it('preserves an unrelated custom alias pointing to an old-name directory', () => {
    const root = fixture()
    const selected = join(root, 'explicit-profile')
    const target = join(root, '.orca')
    mkdirSync(target)
    symlinkSync(target, selected, process.platform === 'win32' ? 'junction' : 'dir')
    useRoot(selected)
    expect(getDaemonRuntimeDir()).toBe(join(selected, 'daemon'))
  })
})
