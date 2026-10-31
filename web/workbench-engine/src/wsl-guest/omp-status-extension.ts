import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  PI_AGENT_STATUS_EXTENSION_FILE,
  writeManagedPiExtension
} from '../shared/pi-managed-extension-install'

export function writeRelayOmpStatusExtension(homeDir: string, source: string): string | null {
  const directory = join(homeDir, '.orca-relay', 'omp-managed-status-extension')
  try {
    mkdirSync(directory, { recursive: true })
    const path = join(directory, PI_AGENT_STATUS_EXTENSION_FILE)
    return writeManagedPiExtension(path, source) ? path : null
  } catch (err) {
    process.stderr.write(
      `[plugin-overlay] failed to write OMP managed status extension: ${err instanceof Error ? err.message : String(err)}\n`
    )
    return null
  }
}
