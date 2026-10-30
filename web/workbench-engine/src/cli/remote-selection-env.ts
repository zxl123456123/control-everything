import { RuntimeClientError } from './runtime/types'

const RETIRED_REMOTE_SELECTORS = [
  ['ORCA_ENVIRONMENT', 'ZKYQ_ENVIRONMENT'],
  ['ORCA_PAIRING_CODE', 'ZKYQ_PAIRING_CODE'],
  ['ORCA_REMOTE_PAIRING', 'ZKYQ_REMOTE_PAIRING']
] as const

/** Refuse a retired selection before a command can fall back to another host. */
export function refuseRetiredRemoteSelection(env: NodeJS.ProcessEnv = process.env): void {
  const retired = RETIRED_REMOTE_SELECTORS.filter(([oldName]) => env[oldName])
  if (retired.length > 0) {
    const replacements = retired.map(([oldName, newName]) => `${oldName} → ${newName}`).join(', ')
    throw new RuntimeClientError(
      'invalid_argument',
      `Remote selection variables were renamed: ${replacements}. Move the values and unset the old names before retrying.`
    )
  }
}
