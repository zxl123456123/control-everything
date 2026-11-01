import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { profileStateAccessMachineIdentity } from './profile-state/profile-state-access-identity'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { runProcess } from '@orca/process-host'

let migrationMachineIdentity: string | null = null

/** This identity attributes moves only; changing the secret-store identity would change its key. */
export async function prepareDefaultDataRootMigrationIdentity(): Promise<void> {
  if (
    profileStateAccessMachineIdentity() ||
    migrationMachineIdentity ||
    process.platform !== 'win32'
  )
    return
  const systemRoot = process.env.SystemRoot
  if (!systemRoot) return
  try {
    const result = await runProcess({
      program: join(systemRoot, 'System32', 'reg.exe'),
      args: ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'],
      timeoutMs: 2000,
      maxOutputBytes: 16384
    })
    const value = /^\s*MachineGuid\s+REG_SZ\s+([a-f0-9-]+)\s*$/im
      .exec(result.stdout)?.[1]
      ?.toLowerCase()
    if (
      result.code === 0 &&
      value &&
      /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value) &&
      !/^0+-0+-0+-0+-0+$/.test(value)
    ) {
      migrationMachineIdentity = `win32-machine-guid:${value}`
    }
  } catch {
    // An unavailable identity keeps the previous entrance until a later verified start.
  }
}

export type DefaultDataRootRecord = {
  schemaVersion: 1
  generation: string
  previousName: string
  currentName: string
  phase: 'bridged' | 'previous-build' | 'complete'
  expectedMachines: string[]
  quietMachines: string[]
  rootIdentities: Record<string, string>
}

export function defaultDataRootRecordPaths(current: string) {
  const coordinator = join(dirname(current), '.zkyq-data-migrations', basename(current))
  return { coordinator, record: join(coordinator, 'identity.json') }
}

export function defaultDataRootMachineTag(): string | null {
  const identity = profileStateAccessMachineIdentity() ?? migrationMachineIdentity
  return identity ? createHash('sha256').update(identity).digest('hex').slice(0, 16) : null
}

export function readDefaultDataRootRecord(current: string): DefaultDataRootRecord | null {
  const path = defaultDataRootRecordPaths(current).record
  const entry = lstatSync(path, { throwIfNoEntry: false })
  if (!entry) return null
  if (!entry.isFile() || entry.size > 65536)
    throw Error('Data root migration record is not a bounded regular file')
  const record = JSON.parse(readFileSync(path, 'utf8')) as DefaultDataRootRecord
  const validMachines = (value: unknown): value is string[] =>
    Array.isArray(value) &&
    value.every((key) => typeof key === 'string' && /^(?:[a-f0-9]{16}|unattributed)$/.test(key))
  if (
    record?.schemaVersion !== 1 ||
    typeof record.generation !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(record.generation) ||
    typeof record.previousName !== 'string' ||
    basename(record.previousName) !== record.previousName ||
    record.currentName !== basename(current) ||
    !['bridged', 'previous-build', 'complete'].includes(record.phase) ||
    !validMachines(record.expectedMachines) ||
    !validMachines(record.quietMachines) ||
    !record.rootIdentities ||
    typeof record.rootIdentities !== 'object' ||
    Array.isArray(record.rootIdentities) ||
    !Object.entries(record.rootIdentities).every(
      ([key, value]) =>
        /^[a-f0-9]{16}$/.test(key) && typeof value === 'string' && /^\d+:\d+$/.test(value)
    )
  )
    throw Error('Data root migration record is invalid')
  return record
}

export function newDefaultDataRootRecord(previous: string, current: string): DefaultDataRootRecord {
  return {
    schemaVersion: 1,
    generation: randomUUID(),
    previousName: basename(previous),
    currentName: basename(current),
    phase: 'bridged',
    expectedMachines: [],
    quietMachines: [],
    rootIdentities: {}
  }
}

export function writeDefaultDataRootRecord(current: string, record: DefaultDataRootRecord): void {
  writeFileAtomically(defaultDataRootRecordPaths(current).record, JSON.stringify(record) + '\n', {
    mode: 0o600
  })
}
