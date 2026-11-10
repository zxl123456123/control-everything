import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  getDefaultUserDataPath,
  getPlatformUserDataPath,
  readMetadata,
  readPrimaryMetadataForPreflight
} from './metadata'
import {
  defaultDataRootRecordPaths,
  newDefaultDataRootRecord,
  writeDefaultDataRootRecord
} from '../../main/persistence/default-data-root-record'
import { getRuntimeMetadataPath } from '../../shared/runtime-bootstrap'
import { checkServeUserDataPath } from '../../main/startup/serve-user-data-path-guard'
import { SERVE_USER_DATA_PATH_ENV } from '../../shared/serve-user-data-path'

let parent: string
beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), 'desktop-default-'))
  vi.stubEnv('ZKYQ_USER_DATA_PATH', undefined)
  vi.stubEnv('ORCA_USER_DATA_PATH', undefined)
  vi.stubEnv('APPDATA', parent)
  vi.stubEnv('XDG_CONFIG_HOME', parent)
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(parent, { recursive: true, force: true })
})

it.each(['win32', 'darwin', 'linux'] as const)(
  'uses the canonical packaged default on %s',
  (platform) => {
    expect(getPlatformUserDataPath(platform, parent)).toBe(
      platform === 'darwin'
        ? join(parent, 'Library', 'Application Support', 'zkyq')
        : join(parent, 'zkyq')
    )
  }
)
it('finds a previous desktop without writing a second data tree', () => {
  const previous = join(parent, 'orca')
  mkdirSync(previous)
  writeFileSync(join(previous, 'latest.txt'), 'latest')
  expect(getDefaultUserDataPath('win32', parent)).toBe(previous)
  expect(existsSync(join(parent, 'zkyq'))).toBe(false)
})
it('refuses ambiguous defaults while preserving an explicitly selected custom profile', () => {
  for (const name of ['orca', 'zkyq']) mkdirSync(join(parent, name))
  expect(() => getDefaultUserDataPath('win32', parent)).toThrow('Both default data directories')
  vi.stubEnv('ZKYQ_USER_DATA_PATH', join(parent, 'custom'))
  expect(getDefaultUserDataPath('win32', parent)).toBe(join(parent, 'custom'))
})
it('follows an owned completed move during CLI polling and serve preflight', () => {
  const previous = join(parent, 'orca')
  const current = join(parent, 'zkyq')
  mkdirSync(current)
  mkdirSync(defaultDataRootRecordPaths(current).coordinator, { recursive: true })
  const record = newDefaultDataRootRecord(previous, current)
  record.phase = 'complete'
  writeDefaultDataRootRecord(current, record)
  const metadata = {
    runtimeId: 'moved-runtime',
    pid: 12345,
    authToken: 'synthetic-token',
    startedAt: 1,
    transports: [{ kind: 'named-pipe', endpoint: 'synthetic-pipe' }]
  }
  writeFileSync(getRuntimeMetadataPath(current), JSON.stringify(metadata))
  expect(readMetadata(previous)).toEqual(metadata)
  expect(readPrimaryMetadataForPreflight(previous)).toEqual(metadata)
  expect(
    checkServeUserDataPath({
      isServeMode: true,
      userDataPath: current,
      env: { [SERVE_USER_DATA_PATH_ENV]: previous }
    })
  ).toBeNull()
  expect(existsSync(previous)).toBe(false)
})
