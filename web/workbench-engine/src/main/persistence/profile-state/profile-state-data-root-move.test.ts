import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  acquireProfileStateMaintenance,
  acquireProfileStateRuntimeAdmission,
  assertProfileStateMaintenanceRoot,
  moveProfileStateMaintenanceRoot,
  type ProfileStateMaintenance
} from './profile-state-access'
import {
  acquireOrcadInstanceLock,
  relocateOrcadInstanceLockAfterRootMove
} from '../../orcad/orcad-instance-lock'

const roots: string[] = []
function fixture() {
  const parent = mkdtempSync(join(tmpdir(), 'root-move-'))
  roots.push(parent)
  return { previous: join(parent, '.orca'), current: join(parent, '.zkyq') }
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('exclusive default data root moves', () => {
  it('retains its genuine maintenance owner when the destination parent is reached through an alias', () => {
    const { previous, current } = fixture()
    const alias = join(dirname(previous), 'via-parent')
    symlinkSync(dirname(previous), alias, process.platform === 'win32' ? 'junction' : 'dir')
    const maintenance = acquireProfileStateMaintenance(previous)
    try {
      moveProfileStateMaintenanceRoot(maintenance, join(alias, '.zkyq'))
      expect(() => maintenance.assertActive()).not.toThrow()
      expect(assertProfileStateMaintenanceRoot(maintenance, current)).toBe(realpathSync(current))
    } finally {
      maintenance.release()
    }
    const admitted = acquireProfileStateRuntimeAdmission(current)
    admitted.release()
  })

  it('retains the maintenance fence after moving the root and releases it at the new path', () => {
    const { previous, current } = fixture()
    const maintenance = acquireProfileStateMaintenance(previous)
    try {
      writeFileSync(join(previous, 'state.json'), 'latest')
      moveProfileStateMaintenanceRoot(maintenance, current)
      expect(existsSync(previous)).toBe(false)
      expect(readFileSync(join(current, 'state.json'), 'utf8')).toBe('latest')
      expect(() => maintenance.assertActive()).not.toThrow()
      expect(assertProfileStateMaintenanceRoot(maintenance, current)).toBe(current)
      expect(() => acquireProfileStateRuntimeAdmission(current)).toThrow()
    } finally {
      maintenance.release()
    }
    const admitted = acquireProfileStateRuntimeAdmission(current)
    admitted.release()
  })

  it('refuses an existing destination and preserves both roots and its source fence', () => {
    const { previous, current } = fixture()
    const maintenance = acquireProfileStateMaintenance(previous)
    try {
      mkdirSync(current)
      writeFileSync(join(current, 'other.txt'), 'destination')
      writeFileSync(join(previous, 'source.txt'), 'source')
      expect(() => moveProfileStateMaintenanceRoot(maintenance, current)).toThrow('already exists')
      expect(readFileSync(join(previous, 'source.txt'), 'utf8')).toBe('source')
      expect(readFileSync(join(current, 'other.txt'), 'utf8')).toBe('destination')
      expect(() => maintenance.assertActive()).not.toThrow()
    } finally {
      maintenance.release()
    }
  })

  it('requires a genuine maintenance owner', () => {
    const { previous, current } = fixture()
    mkdirSync(previous)
    const forged: ProfileStateMaintenance = { assertActive() {}, assertProfile() {}, release() {} }
    expect(() => moveProfileStateMaintenanceRoot(forged, current)).toThrow('acquired maintenance')
    expect(existsSync(previous)).toBe(true)
  })

  it('keeps the instance owner exclusive through the move and releases the moved record', () => {
    const { previous, current } = fixture()
    let instance = acquireOrcadInstanceLock(previous, { preserveRootPermissions: true })
    const original = instance
    const maintenance = acquireProfileStateMaintenance(previous)
    try {
      moveProfileStateMaintenanceRoot(maintenance, current)
      instance = relocateOrcadInstanceLockAfterRootMove(instance, current)
      expect(instance.path).toBe(join(current, 'orcad.lock'))
      expect(() => acquireOrcadInstanceLock(current, { preserveRootPermissions: true })).toThrow()
    } finally {
      maintenance.release()
      instance.release()
      original.release()
    }
    expect(existsSync(join(current, 'orcad.lock'))).toBe(false)
    const acquired = acquireOrcadInstanceLock(current, { preserveRootPermissions: true })
    acquired.release()
  })
})
