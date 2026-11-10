import { lstatSync, readFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'

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
