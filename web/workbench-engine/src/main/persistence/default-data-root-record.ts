import {
  defaultDataRootRecordPaths,
  type DefaultDataRootRecord
} from './default-data-root-record-reader'
export {
  defaultDataRootRecordPaths,
  readDefaultDataRootRecord,
  type DefaultDataRootRecord
} from './default-data-root-record-reader'
import { createHash, randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
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

export function defaultDataRootMachineTag(): string | null {
  const identity = profileStateAccessMachineIdentity() ?? migrationMachineIdentity
  return identity ? createHash('sha256').update(identity).digest('hex').slice(0, 16) : null
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
