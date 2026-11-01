import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  getLegacyRuntimeMetadataPath,
  getRuntimeMetadataPath
} from '../../shared/runtime-bootstrap'
import { readLegacyMetadataForPreflight, readMetadata, tryReadMetadata } from './metadata'

const dirs: string[] = []
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'zkyq-runtime-migration-'))
  dirs.push(dir)
  return dir
}
function metadata(runtimeId: string) {
  return {
    runtimeId,
    pid: process.pid,
    transports: [{ kind: 'named-pipe', endpoint: 'fixture' }],
    authToken: 'fixture',
    startedAt: 1
  }
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('runtime discovery migration', () => {
  it('reads the legacy record while the new one is absent, and prefers the new one', () => {
    const dir = fixture()
    writeFileSync(getLegacyRuntimeMetadataPath(dir), JSON.stringify(metadata('legacy')))
    expect(readMetadata(dir).runtimeId).toBe('legacy')
    expect(tryReadMetadata(dir)?.runtimeId).toBe('legacy')
    writeFileSync(getRuntimeMetadataPath(dir), JSON.stringify(metadata('current')))
    expect(readMetadata(dir).runtimeId).toBe('current')
    expect(tryReadMetadata(dir)?.runtimeId).toBe('current')
    expect(readLegacyMetadataForPreflight(dir)?.runtimeId).toBe('legacy')
  })

  it('does not silently fall back when the new file is malformed', () => {
    const dir = fixture()
    writeFileSync(getLegacyRuntimeMetadataPath(dir), JSON.stringify(metadata('legacy')))
    writeFileSync(getRuntimeMetadataPath(dir), '{bad')
    expect(() => readMetadata(dir)).toThrow('zkyq-runtime.json')
    expect(tryReadMetadata(dir)).toBeNull()
  })

  it('fails closed on a malformed legacy owner record in preflight', () => {
    const dir = fixture()
    writeFileSync(getLegacyRuntimeMetadataPath(dir), '{bad')
    expect(() => readLegacyMetadataForPreflight(dir)).toThrow()
  })
})
