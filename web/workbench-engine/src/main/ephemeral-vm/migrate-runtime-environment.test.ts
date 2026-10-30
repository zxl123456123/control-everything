import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  upsertEphemeralVmRuntime,
  listEphemeralVmRuntimes,
  getEphemeralVmRuntimeStorePath
} from '../../shared/ephemeral-vm-runtime-store'
import { getEphemeralVmRuntimeFeatureStorePath } from '../../shared/ephemeral-vm-runtime-feature-store'
import type { EphemeralVmRuntimeRecord } from '../../shared/ephemeral-vm-runtimes'
import {
  acquireProfileStateMaintenance,
  acquireProfileStateRuntimeAdmission
} from '../persistence/profile-state/profile-state-access'
import { acquireOrcadInstanceLock } from '../orcad/orcad-instance-lock'
import { migrateRuntimeEnvironment } from './migrate-runtime-environment'
import { VM_HANDLERS } from '../../cli/handlers/vm'
import type { HandlerContext } from '../../cli/dispatch'

const roots: string[] = []
function directory(): string {
  const path = mkdtempSync(join(tmpdir(), 'zkyq-vm-snapshot-'))
  roots.push(path)
  return path
}
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function record(overrides: Partial<EphemeralVmRuntimeRecord> = {}): EphemeralVmRuntimeRecord {
  return {
    id: 'old-vm-id',
    recipeId: 'fixture',
    recipe: {
      id: 'fixture',
      name: 'Fixture',
      create: 'create',
      destroy: 'destroy',
      checkoutMode: 'orca-worktree'
    },
    status: 'running',
    cleanupStatus: 'not_started',
    createdAt: 100,
    updatedAt: 100,
    recipeResult: {
      schemaVersion: 1,
      connection: {
        type: 'ssh',
        target: { label: 'fixture', host: '127.0.0.1', port: 22, username: 'fixture' },
        projectRoot: '/fixture'
      },
      userData: { resourceId: 'fixture-resource' }
    },
    ...overrides
  }
}

it('migrates one reviewed snapshot and preserves the runtime store, resource data and future metadata', () => {
  const userDataPath = directory()
  const original = record()
  upsertEphemeralVmRuntime(userDataPath, original)
  const storePath = getEphemeralVmRuntimeStorePath(userDataPath)
  const originalStore = readFileSync(storePath)
  const featurePath = getEphemeralVmRuntimeFeatureStorePath(userDataPath)
  const sidecar = JSON.parse(readFileSync(featurePath, 'utf8'))
  const future = { kind: 'future-feature', value: 'fixture' }
  writeFileSync(featurePath, JSON.stringify({ ...sidecar, records: [...sidecar.records, future] }))
  const maintenance = acquireProfileStateMaintenance(userDataPath)
  try {
    expect(
      migrateRuntimeEnvironment({
        userDataPath,
        runtimeId: original.id,
        recipeId: original.recipeId,
        maintenance
      })
    ).toEqual({ runtimeId: original.id, recipeId: original.recipeId, changed: true })
    expect(readFileSync(storePath)).toEqual(originalStore)
    expect(listEphemeralVmRuntimes(userDataPath)).toEqual([
      { ...original, recipe: { ...original.recipe, environmentContract: 'zkyq' } }
    ])
    expect(JSON.parse(readFileSync(featurePath, 'utf8')).records).toContainEqual(future)
    const after = readFileSync(featurePath)
    expect(
      migrateRuntimeEnvironment({
        userDataPath,
        runtimeId: original.id,
        recipeId: original.recipeId,
        maintenance
      }).changed
    ).toBe(false)
    expect(readFileSync(featurePath)).toEqual(after)
  } finally {
    maintenance.release()
  }
})

it.each([
  ['wrong recipe', record(), 'other'],
  ['missing snapshot', record({ recipe: undefined }), 'fixture'],
  ['cleanup pending', record({ status: 'cleanup_pending' }), 'fixture'],
  ['cleanup running', record({ cleanupStatus: 'running' }), 'fixture'],
  ['already cleaned', record({ status: 'cleaned' }), 'fixture']
])('refuses %s without changing saved bytes', (_name, original, recipeId) => {
  const userDataPath = directory()
  upsertEphemeralVmRuntime(userDataPath, original)
  const storePath = getEphemeralVmRuntimeStorePath(userDataPath)
  const featurePath = getEphemeralVmRuntimeFeatureStorePath(userDataPath)
  const storeBefore = readFileSync(storePath)
  const featureBefore = existsSync(featurePath) ? readFileSync(featurePath) : null
  const maintenance = acquireProfileStateMaintenance(userDataPath)
  try {
    expect(() =>
      migrateRuntimeEnvironment({ userDataPath, runtimeId: original.id, recipeId, maintenance })
    ).toThrow()
    expect(readFileSync(storePath)).toEqual(storeBefore)
    expect(existsSync(featurePath) ? readFileSync(featurePath) : null).toEqual(featureBefore)
  } finally {
    maintenance.release()
  }
})

it('rejects a fabricated maintenance owner and a damaged sidecar', () => {
  const userDataPath = directory()
  const original = record()
  upsertEphemeralVmRuntime(userDataPath, original)
  expect(() =>
    migrateRuntimeEnvironment({
      userDataPath,
      runtimeId: original.id,
      recipeId: original.recipeId,
      maintenance: { assertActive() {}, assertProfile() {}, release() {} }
    })
  ).toThrow('acquired maintenance owner')
  const featurePath = getEphemeralVmRuntimeFeatureStorePath(userDataPath)
  writeFileSync(featurePath, '{invalid')
  const maintenance = acquireProfileStateMaintenance(userDataPath)
  try {
    expect(() =>
      migrateRuntimeEnvironment({
        userDataPath,
        runtimeId: original.id,
        recipeId: original.recipeId,
        maintenance
      })
    ).toThrow('not writable')
    expect(readFileSync(featurePath, 'utf8')).toBe('{invalid')
  } finally {
    maintenance.release()
  }
})

it('requires explicit script review and refuses a live owner or maintenance participant', async () => {
  const userDataPath = directory()
  upsertEphemeralVmRuntime(userDataPath, record())
  vi.stubEnv('ZKYQ_USER_DATA_PATH', userDataPath)
  const handler = VM_HANDLERS['vm runtime migrate-env']
  const flags = new Map<string, string | boolean>([
    ['runtime-id', 'old-vm-id'],
    ['recipe-id', 'fixture']
  ])
  const context = { flags, json: true } as HandlerContext
  await expect(handler(context)).rejects.toThrow('pass --yes')
  flags.set('yes', true)
  const instance = acquireOrcadInstanceLock(userDataPath, { role: 'desktop' })
  try {
    await expect(handler(context)).rejects.toThrow('exclusive profile access')
  } finally {
    instance.release()
  }
  const participant = acquireProfileStateRuntimeAdmission(userDataPath)
  try {
    await expect(handler(context)).rejects.toThrow('maintenance access')
  } finally {
    participant.release()
  }
  const metadata = join(userDataPath, 'zkyq-runtime.json')
  writeFileSync(metadata, '{invalid')
  try {
    await expect(handler(context)).rejects.toThrow('Cannot verify that the profile is offline')
    expect(listEphemeralVmRuntimes(userDataPath)[0].recipe?.environmentContract).toBeUndefined()
  } finally {
    unlinkSync(metadata)
  }
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await handler(context)
  expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({
    runtimeId: 'old-vm-id',
    recipeId: 'fixture',
    changed: true
  })
})

it('lists saved identities and contracts without changing the runtime store', async () => {
  const userDataPath = directory()
  upsertEphemeralVmRuntime(userDataPath, record())
  vi.stubEnv('ZKYQ_USER_DATA_PATH', userDataPath)
  const storePath = getEphemeralVmRuntimeStorePath(userDataPath)
  const before = readFileSync(storePath)
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await VM_HANDLERS['vm runtime list']({ json: true } as HandlerContext)
  expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual([
    {
      runtimeId: 'old-vm-id',
      recipeId: 'fixture',
      status: 'running',
      environmentContract: 'legacy'
    }
  ])
  expect(readFileSync(storePath)).toEqual(before)
  vi.stubEnv('ZKYQ_ENVIRONMENT', 'remote')
  await expect(VM_HANDLERS['vm runtime list']({ json: true } as HandlerContext)).rejects.toThrow(
    'resource host'
  )
})

it.runIf(process.platform === 'win32')(
  'keeps the default runtime privacy gate while maintenance preserves desktop permissions',
  () => {
    const userDataPath = directory()
    const restrict = vi.fn(() => false)
    expect(() =>
      acquireOrcadInstanceLock(userDataPath, { role: 'orcad', restrictWindowsDataRoot: restrict })
    ).toThrow('Could not restrict')
    expect(restrict).toHaveBeenCalledOnce()
    restrict.mockClear()
    const lock = acquireOrcadInstanceLock(userDataPath, {
      role: 'orcad',
      preserveRootPermissions: true,
      restrictWindowsDataRoot: restrict
    })
    try {
      expect(restrict).not.toHaveBeenCalled()
    } finally {
      lock.release()
    }
  }
)
