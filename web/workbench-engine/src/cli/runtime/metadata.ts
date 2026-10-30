import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import {
  findTransport,
  getLegacyRuntimeMetadataPath,
  getRuntimeMetadataPath,
  type RuntimeMetadata
} from '../../shared/runtime-bootstrap'
import { RuntimeClientError } from './types'

export function readMetadata(userDataPath: string): RuntimeMetadata {
  let metadataPath = getRuntimeMetadataPath(userDataPath)
  try {
    let raw: string
    try {
      raw = readFileSync(metadataPath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const legacyPath = getLegacyRuntimeMetadataPath(userDataPath)
      raw = readFileSync(legacyPath, 'utf8')
      metadataPath = legacyPath
    }
    const metadata = JSON.parse(raw) as RuntimeMetadata | null
    if (!metadata || !findTransport(metadata, 'unix', 'named-pipe') || !metadata.authToken) {
      throw new RuntimeClientError(
        'runtime_unavailable',
        `Control Everything runtime metadata is incomplete at ${metadataPath}`
      )
    }
    return metadata
  } catch (error) {
    if (error instanceof RuntimeClientError) {
      throw error
    }
    throw new RuntimeClientError(
      'runtime_unavailable',
      `Could not read Control Everything runtime metadata at ${metadataPath}. Start the app first.`
    )
  }
}

export function tryReadMetadata(userDataPath: string): RuntimeMetadata | null {
  try {
    let raw: string
    try {
      raw = readFileSync(getRuntimeMetadataPath(userDataPath), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      raw = readFileSync(getLegacyRuntimeMetadataPath(userDataPath), 'utf8')
    }
    return JSON.parse(raw) as RuntimeMetadata | null
  } catch {
    return null
  }
}

/** An owner record must be readable before a second runtime may start. */
function readOwnerMetadata(path: string): RuntimeMetadata | null {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  const metadata = JSON.parse(raw) as RuntimeMetadata | null
  if (
    !metadata ||
    !Number.isSafeInteger(metadata.pid) ||
    metadata.pid <= 0 ||
    !findTransport(metadata, 'unix', 'named-pipe') ||
    !metadata.authToken
  ) {
    throw new Error('runtime_metadata_invalid')
  }
  return metadata
}

export function readPrimaryMetadataForPreflight(userDataPath: string): RuntimeMetadata | null {
  return readOwnerMetadata(getRuntimeMetadataPath(userDataPath))
}

export function readLegacyMetadataForPreflight(userDataPath: string): RuntimeMetadata | null {
  return readOwnerMetadata(getLegacyRuntimeMetadataPath(userDataPath))
}

export function getDefaultUserDataPath(
  platform: NodeJS.Platform = process.platform,
  homeDir = homedir()
): string {
  // Why: in dev mode (and for parallel Orca instances), the Electron app writes
  // runtime metadata to a separate userData directory (e.g. `orca-dev`) to avoid
  // clobbering the production app's metadata. The CLI needs to find the same
  // metadata file, so this env var lets the CLI target a specific instance.
  if (process.env.ZKYQ_USER_DATA_PATH) {
    return process.env.ZKYQ_USER_DATA_PATH
  }
  if (process.env.ORCA_USER_DATA_PATH) {
    throw new RuntimeClientError(
      'runtime_unavailable',
      'ORCA_USER_DATA_PATH was retired. Set ZKYQ_USER_DATA_PATH to the same data directory.'
    )
  }
  return getPlatformUserDataPath(platform, homeDir)
}

/** The packaged app's own default profile, ignoring any CLI override. */
export function getPlatformUserDataPath(
  platform: NodeJS.Platform = process.platform,
  homeDir = homedir()
): string {
  if (platform === 'darwin') {
    return join(homeDir, 'Library', 'Application Support', 'orca')
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA
    if (!appData) {
      throw new RuntimeClientError(
        'runtime_unavailable',
        'APPDATA is not set, so the Control Everything runtime metadata path cannot be resolved.'
      )
    }
    return join(appData, 'orca')
  }
  // Why: the CLI must find the same metadata file Electron writes in packaged
  // runs, so this mirrors Electron's default userData base instead of inventing
  // a CLI-specific config path.
  return join(process.env.XDG_CONFIG_HOME || join(homeDir, '.config'), 'orca')
}
