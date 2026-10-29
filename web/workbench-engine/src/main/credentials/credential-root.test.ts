import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { credentialRoot, hasExplicitPlatformCredentialRoot } from './credential-root'

describe('platform credential root', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'credential-root-'))
    vi.stubEnv('CE_WORKBENCH_CREDENTIAL_ROOT', undefined)
    vi.stubEnv('CE_WORKBENCH_ISOLATED', undefined)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(root, { recursive: true, force: true })
  })
  it('keeps the host credential directory when not configured', () => {
    expect(credentialRoot()).toBe(join(homedir(), '.orca'))
    expect(hasExplicitPlatformCredentialRoot()).toBe(false)
  })
  it('uses only an existing platform profile child directory', () => {
    const profile = join(root, 'profile')
    const credentials = join(profile, 'credentials')
    mkdirSync(credentials, { recursive: true })
    vi.stubEnv('CE_WORKBENCH_ISOLATED', '1')
    vi.stubEnv('CE_WORKBENCH_ORIGIN', 'http://127.0.0.1:12345')
    vi.stubEnv('ORCA_USER_DATA', profile)
    vi.stubEnv('CE_WORKBENCH_CREDENTIAL_ROOT', credentials)
    expect(credentialRoot()).toBe(realpathSync(credentials))
    expect(hasExplicitPlatformCredentialRoot()).toBe(true)
    vi.stubEnv('CE_WORKBENCH_CREDENTIAL_ROOT', root)
    expect(() => credentialRoot()).toThrow('platform_credential_root_invalid')
    vi.stubEnv('CE_WORKBENCH_CREDENTIAL_ROOT', join(profile, 'missing'))
    expect(() => credentialRoot()).toThrow('platform_credential_root_invalid')
  })
  it('does not redirect non-platform tools', () => {
    vi.stubEnv('CE_WORKBENCH_CREDENTIAL_ROOT', root)
    expect(credentialRoot()).toBe(join(homedir(), '.orca'))
    expect(hasExplicitPlatformCredentialRoot()).toBe(false)
  })
})
