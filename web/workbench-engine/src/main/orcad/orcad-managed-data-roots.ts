import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import {
  MANAGED_DATA_ROOT_VERSION,
  type ManagedDataRootResult
} from '../../shared/managed-data-roots'
import {
  handOffDefaultDataRootToPreviousBuild,
  migrateDefaultCredentialDataRoot,
  migrateDefaultProfileDataRootBeforeStartup
} from '../persistence/default-data-root-migration'

/** The managed caller supplies only its own default; custom paths never become migration input. */
export async function runManagedDataRootOperation(
  action: string | undefined,
  selected: string | undefined
): Promise<ManagedDataRootResult> {
  if (!selected || !isAbsolute(selected) || !['prepare', 'previous-build'].includes(action ?? ''))
    throw Error('Invalid managed data directory operation')
  const current = resolve(selected)
  const name = basename(current)
  const sameHome =
    process.platform === 'win32'
      ? dirname(current).toLowerCase() === resolve(homedir()).toLowerCase()
      : dirname(current) === resolve(homedir())
  if (!sameHome || (name !== '.zkyq' && !/^\.zkyq-[a-f0-9]{8}$/.test(name)))
    throw Error('Managed data directory is not a default in this login home')
  const previous = join(dirname(current), name.replace('.zkyq', '.orca'))
  const sharedPrevious = join(homedir(), '.orca')
  const sharedCurrent = join(homedir(), '.zkyq')
  await migrateDefaultCredentialDataRoot(sharedPrevious, sharedCurrent)
  if (name !== '.zkyq') await migrateDefaultProfileDataRootBeforeStartup(previous, current)
  if (action === 'previous-build') {
    handOffDefaultDataRootToPreviousBuild(sharedPrevious, sharedCurrent)
    if (name !== '.zkyq') handOffDefaultDataRootToPreviousBuild(previous, current)
  }
  return {
    version: MANAGED_DATA_ROOT_VERSION,
    userDataDir: current,
    launchUserDataDir: action === 'previous-build' ? previous : current
  }
}
