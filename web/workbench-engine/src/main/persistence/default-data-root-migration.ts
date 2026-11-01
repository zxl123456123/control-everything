import { randomUUID } from 'node:crypto'
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  renameSync,
  statSync,
  symlinkSync,
  unlinkSync
} from 'node:fs'
import { basename, dirname, join, relative, resolve, toNamespacedPath, isAbsolute } from 'node:path'
import { bestEffortFsyncDirectorySync } from '../../shared/secure-file'
import {
  acquireOrcadInstanceLock,
  relocateOrcadInstanceLockAfterRootMove,
  type OrcadInstanceLock
} from '../orcad/orcad-instance-lock'
import { orcadDataRootIsOnLocalDisk } from '../orcad/orcad-data-root-locality'
import {
  acquireProfileStateMaintenance,
  acquireProfileStateRuntimeAdmission,
  moveProfileStateMaintenanceRoot,
  type ProfileStateRuntimeAdmission
} from './profile-state/profile-state-access'
import {
  defaultCredentialRootProcessReaders,
  defaultDataRootDaemonReaders,
  retireIdleDefaultDataRootDaemons,
  type DefaultDataRootReaders
} from './default-data-root-readers'
import {
  defaultDataRootMachineTag,
  prepareDefaultDataRootMigrationIdentity,
  defaultDataRootRecordPaths,
  newDefaultDataRootRecord,
  readDefaultDataRootRecord,
  writeDefaultDataRootRecord,
  type DefaultDataRootRecord
} from './default-data-root-record'

const admissions = new Map<string, ProfileStateRuntimeAdmission>()
process.once('exit', () => {
  for (const admission of admissions.values()) admission.release()
})
const entry = (path: string) => lstatSync(path, { throwIfNoEntry: false })
const samePath = (a: string, b: string) =>
  process.platform === 'win32'
    ? toNamespacedPath(resolve(a)).toLowerCase() === toNamespacedPath(resolve(b)).toLowerCase()
    : resolve(a) === resolve(b)

function sameLink(path: string, target: string): boolean {
  return (
    !!entry(path)?.isSymbolicLink() && samePath(resolve(dirname(path), readlinkSync(path)), target)
  )
}

function coordinates(previous: string, current: string): void {
  if (
    !isAbsolute(previous) ||
    !isAbsolute(current) ||
    !samePath(dirname(previous), dirname(current)) ||
    samePath(previous, current)
  )
    throw Error('Invalid default data directory coordinates')
}

function coordinator(current: string) {
  const paths = defaultDataRootRecordPaths(current)
  for (const directory of [dirname(paths.coordinator), paths.coordinator]) {
    if (entry(directory)?.isSymbolicLink())
      throw Error('Data migration coordinator is a symbolic link')
  }
  return acquireProfileStateMaintenance(paths.coordinator)
}

/** Caller holds the stable coordinator, outside the directory that will move. */
function prepare(previous: string, current: string): DefaultDataRootRecord | null {
  coordinates(previous, current)
  let old = entry(previous)
  const present = entry(current)
  let record = readDefaultDataRootRecord(current)
  if (!old && !present) {
    if (record) throw Error('Recorded data directory is missing')
    mkdirSync(current, { mode: 0o700 })
  }
  if (!old) {
    if (record && record.phase !== 'complete' && present && !present.isSymbolicLink()) {
      // Resume a crash after rename but before references and the old entrance were retired.
      symlinkSync(current, previous, process.platform === 'win32' ? 'junction' : 'dir')
      old = entry(previous)
    } else {
      if (!record) {
        record = newDefaultDataRootRecord(previous, current)
        record.phase = 'complete'
        writeDefaultDataRootRecord(current, record)
      }
      return record
    }
  }
  if (!statSync(previous).isDirectory()) throw Error('Previous data directory is not a directory')
  if (present && !sameLink(current, previous) && !sameLink(previous, current))
    throw Error('Both default data directories exist; neither was changed')
  if (!record) {
    record = newDefaultDataRootRecord(previous, current)
    if (sameLink(previous, current)) record.phase = 'previous-build'
  }
  if (!samePath(join(dirname(previous), record.previousName), previous))
    throw Error('Data migration coordinates changed')
  if (!present) symlinkSync(previous, current, process.platform === 'win32' ? 'junction' : 'dir')
  writeDefaultDataRootRecord(current, record)
  return record
}

function admit(current: string): void {
  const key = process.platform === 'win32' ? resolve(current).toLowerCase() : resolve(current)
  if (admissions.has(key)) return
  const admission = acquireProfileStateRuntimeAdmission(current)
  admissions.set(key, admission)
}

/** Get a single-view entrance and retain admission before a reader can use it. */
export function admitDefaultDataRoot(previous: string, current: string): string {
  coordinates(previous, current)
  const lock = coordinator(current)
  try {
    prepare(previous, current)
    admit(current)
    return current
  } finally {
    lock.release()
  }
}

/** Explicit old defaults may still be supplied by launchers after a completed move. */
export function resolveMigratedDefaultDataRoot(path: string): string {
  if (!isAbsolute(path)) return path
  const name = basename(path)
  const currentName =
    name === '.orca'
      ? '.zkyq'
      : name === 'orca' || name === 'Orca'
        ? 'zkyq'
        : name === 'orca-dev'
          ? 'zkyq-dev'
          : /^\.orca-[a-f0-9]{8}$/.test(name)
            ? name.replace('.orca-', '.zkyq-')
            : null
  if (!currentName) return path
  const current = join(dirname(path), currentName)
  const record = readDefaultDataRootRecord(current)
  return record?.previousName === name ? current : path
}

/** Publish a previous-build entrance before an offline rollback can launch that build. */
export function handOffDefaultDataRootToPreviousBuild(previous: string, current: string): void {
  if (!readDefaultDataRootRecord(current)) return
  coordinates(previous, current)
  const lock = coordinator(current)
  try {
    const record = prepare(previous, current)
    if (!record) return
    if (!entry(previous) && defaultDataRootDaemonReaders(current) !== 'quiet')
      throw Error(
        'Stop the terminal daemon before handing this default directory to a previous build'
      )
    record.phase = 'previous-build'
    record.quietMachines = []
    writeDefaultDataRootRecord(current, record)
    if (!entry(previous))
      symlinkSync(current, previous, process.platform === 'win32' ? 'junction' : 'dir')
  } finally {
    lock.release()
  }
}

function recordQuietMachine(
  root: string,
  current: string,
  record: DefaultDataRootRecord,
  verdict: DefaultDataRootReaders,
  shared: boolean
): boolean {
  const machine = defaultDataRootMachineTag()
  const stats = statSync(root, { bigint: true })
  const identity = `${stats.dev}:${stats.ino}`
  if (machine && record.rootIdentities[machine] && record.rootIdentities[machine] !== identity)
    throw Error('Data directory changed since migration began')
  if (machine) record.rootIdentities[machine] = identity
  const expected =
    !shared || orcadDataRootIsOnLocalDisk(root)
      ? [machine ?? 'unattributed']
      : readdirSync(root).flatMap(
          (name) => /^orcad-secret-store-([a-f0-9]{16})\.json$/.exec(name)?.slice(1) ?? []
        )
  if (machine && orcadDataRootIsOnLocalDisk(root)) {
    record.expectedMachines = record.expectedMachines.filter((key) => key !== 'unattributed')
  }
  if (shared && expected.length === 0 && !orcadDataRootIsOnLocalDisk(root))
    expected.push('unattributed')
  if (machine) expected.push(machine)
  record.expectedMachines = [...new Set([...record.expectedMachines, ...expected])]
  record.quietMachines = record.quietMachines.filter((key) => key !== machine)
  if (machine && verdict === 'quiet') record.quietMachines.push(machine)
  writeDefaultDataRootRecord(current, record)
  return (
    verdict === 'quiet' &&
    record.expectedMachines.every(
      (key) => key !== 'unattributed' && record.quietMachines.includes(key)
    )
  )
}

/** Repair only filesystem links back into the same moved root; never follow links out of it. */
function rewriteLinks(directory: string, previous: string, current: string): void {
  for (const child of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, child.name)
    if (child.isDirectory()) {
      rewriteLinks(path, previous, current)
    } else if (child.isSymbolicLink()) {
      const original = readlinkSync(path)
      const suffix = relative(previous, resolve(dirname(path), original))
      if (
        suffix === '..' ||
        suffix.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) ||
        isAbsolute(suffix)
      )
        continue
      const target = join(current, suffix)
      const isDirectory = statSync(target, { throwIfNoEntry: false })?.isDirectory() ?? false
      const type =
        process.platform === 'win32' && isDirectory ? 'junction' : isDirectory ? 'dir' : 'file'
      const value =
        isAbsolute(original) || type === 'junction' ? target : relative(dirname(path), target)
      const temporary = path + '.zkyq-' + randomUUID() + '.tmp'
      try {
        symlinkSync(value, temporary, type)
        if (readlinkSync(path) !== original)
          throw Error('Data directory reference changed during migration')
        try {
          renameSync(temporary, path)
        } catch (error) {
          if (
            process.platform !== 'win32' ||
            type !== 'junction' ||
            !['EPERM', 'EACCES', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')
          )
            throw error
          const saved = path + '.zkyq-before-' + randomUUID()
          renameSync(path, saved)
          try {
            renameSync(temporary, path)
          } catch (failure) {
            if (!entry(path)) renameSync(saved, path)
            throw failure
          }
          unlinkSync(saved)
        }
      } finally {
        if (entry(temporary)) unlinkSync(temporary)
      }
    }
  }
}

function finish(previous: string, current: string, record: DefaultDataRootRecord): void {
  if (!entry(previous)) return
  const physical = sameLink(previous, current) ? current : previous
  let instance: OrcadInstanceLock | undefined
  let maintenance: ReturnType<typeof acquireProfileStateMaintenance> | undefined
  try {
    instance = acquireOrcadInstanceLock(physical, { preserveRootPermissions: true })
    maintenance = acquireProfileStateMaintenance(physical)
    if (defaultDataRootDaemonReaders(physical) !== 'quiet') return
    if (sameLink(current, previous)) {
      unlinkSync(current)
      try {
        if (entry(previous)?.isSymbolicLink()) renameSync(previous, current)
        else moveProfileStateMaintenanceRoot(maintenance, current)
      } catch (error) {
        if (!entry(current) && entry(previous))
          symlinkSync(previous, current, process.platform === 'win32' ? 'junction' : 'dir')
        throw error
      }
      instance = relocateOrcadInstanceLockAfterRootMove(instance, current)
      symlinkSync(current, previous, process.platform === 'win32' ? 'junction' : 'dir')
      bestEffortFsyncDirectorySync(dirname(current))
    }
    rewriteLinks(current, previous, current)
    if (!sameLink(previous, current)) throw Error('Previous data directory entrance changed')
    unlinkSync(previous)
    record.phase = 'complete'
    writeDefaultDataRootRecord(current, record)
    bestEffortFsyncDirectorySync(dirname(current))
  } finally {
    maintenance?.release()
    instance?.release()
  }
}

function tryFinish(
  previous: string,
  current: string,
  record: DefaultDataRootRecord | null,
  verdict: DefaultDataRootReaders,
  shared: boolean
): void {
  if (!record || (record.phase === 'complete' && !entry(previous))) return
  const physical = sameLink(previous, current) ? current : previous
  const daemon = defaultDataRootDaemonReaders(physical)
  if (!recordQuietMachine(physical, current, record, daemon === 'quiet' ? verdict : daemon, shared))
    return
  try {
    finish(previous, current, record)
  } catch (error) {
    // An active owner or an open Windows handle keeps the one data view intact for the next start.
    if (
      ![
        'profile-state-access-refused',
        'orcad_instance_lock_held',
        'orcad_instance_lock_foreign_identity',
        'EPERM',
        'EACCES',
        'EBUSY'
      ].includes(String((error as { code?: unknown }).code))
    )
      throw error
    // Revalidate the entrance before admitting readers; a failed bridge restore must not create empty state.
    prepare(previous, current)
  }
}

/** Desktop profile moves must finish before Electron opens its caches. No process scan blocks ready. */
export function migrateDefaultProfileDataRoot(previous: string, current: string): string {
  coordinates(previous, current)
  const lock = coordinator(current)
  try {
    const record = prepare(previous, current)
    tryFinish(previous, current, record, 'quiet', false)
    admit(current)
    return current
  } finally {
    lock.release()
  }
}

/** Node startup can retire an idle daemon before opening the profile, without blocking ready. */
export async function migrateDefaultProfileDataRootBeforeStartup(
  previous: string,
  current: string
): Promise<string> {
  if (entry(previous)) {
    await prepareDefaultDataRootMigrationIdentity()
    await retireIdleDefaultDataRootDaemons(previous)
  }
  return migrateDefaultProfileDataRoot(previous, current)
}

/** The async startup gate covers old credential readers in every local profile. */
export async function migrateDefaultCredentialDataRoot(
  previous: string,
  current: string
): Promise<string> {
  coordinates(previous, current)
  const lock = coordinator(current)
  try {
    const record = prepare(previous, current)
    if (record && entry(previous)) {
      await prepareDefaultDataRootMigrationIdentity()
      await retireIdleDefaultDataRootDaemons(previous)
    }
    const verdict =
      record && entry(previous) ? await defaultCredentialRootProcessReaders() : 'quiet'
    tryFinish(previous, current, record, verdict, true)
    admit(current)
    return current
  } finally {
    lock.release()
  }
}
