import { findTransport, type RuntimeMetadata } from '../../shared/runtime-bootstrap'
import {
  readLegacyMetadataForPreflight,
  readMetadata,
  readPrimaryMetadataForPreflight
} from './metadata'
import { probeRuntimeListener } from './runtime-listener-probe'
import { sendRequest } from './transport'
import { RuntimeClientError } from './types'

/** Select before any user request; never retry a mutation against another runtime. */
export function resolveRuntimeMetadata(
  userDataPath: string
): RuntimeMetadata | Promise<RuntimeMetadata> {
  const selected = readMetadata(userDataPath)
  let current: RuntimeMetadata | null
  let legacy: RuntimeMetadata | null
  try {
    current = readPrimaryMetadataForPreflight(userDataPath)
    legacy = readLegacyMetadataForPreflight(userDataPath)
  } catch {
    return selected
  }
  if (current && JSON.stringify(current) !== JSON.stringify(selected)) {
    throw new RuntimeClientError(
      'runtime_metadata_changed',
      'Runtime discovery changed while checking the connection. No request was sent; retry the command.'
    )
  }
  if (!current || !legacy || current.runtimeId === legacy.runtimeId || !legacy.runtimeId)
    return selected
  const endpoint = findTransport(current, 'unix', 'named-pipe')?.endpoint
  if (typeof endpoint !== 'string' || !endpoint.trim()) return selected
  return selectLegacyIfCurrentAbsent(userDataPath, selected, current, legacy)
}

async function selectLegacyIfCurrentAbsent(
  userDataPath: string,
  selected: RuntimeMetadata,
  current: RuntimeMetadata,
  legacy: RuntimeMetadata
): Promise<RuntimeMetadata> {
  if ((await probeRuntimeListener(current)) !== 'not-listening') return selected
  let confirmed = false
  try {
    const response = await sendRequest(legacy, 'status.get', undefined, 1_000)
    confirmed = response.ok && response._meta.runtimeId === legacy.runtimeId
  } catch {
    return selected
  }
  if (!confirmed) return selected
  // Do not send the user's request if either record changed during the read-only probe.
  let unchanged = false
  try {
    unchanged =
      JSON.stringify(readPrimaryMetadataForPreflight(userDataPath)) === JSON.stringify(current) &&
      JSON.stringify(readLegacyMetadataForPreflight(userDataPath)) === JSON.stringify(legacy)
  } catch {
    // An unreadable record cannot establish the target.
  }
  if (!unchanged) {
    throw new RuntimeClientError(
      'runtime_metadata_changed',
      'Runtime discovery changed while checking the connection. No request was sent; retry the command.'
    )
  }
  return legacy
}
