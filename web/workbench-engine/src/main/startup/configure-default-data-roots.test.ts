import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { configureDevUserDataPath } from './configure-process'

const fixture = vi.hoisted(() => ({
  paths: {} as Record<string, string>,
  explicit: false,
  e2e: undefined as string | undefined,
  move: vi.fn()
}))
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => fixture.paths[name],
    setPath: (name: string, value: string) => {
      fixture.paths[name] = value
    },
    commandLine: { hasSwitch: () => fixture.explicit }
  }
}))
vi.mock('../e2e-config', () => ({ getMainE2EConfig: () => ({ userDataDir: fixture.e2e }) }))
vi.mock('../persistence/default-data-root-migration', () => ({
  migrateDefaultProfileDataRoot: fixture.move,
  resolveMigratedDefaultDataRoot: (value: string) => value
}))
beforeEach(() => {
  fixture.paths = {
    appData: join(tmpdir(), 'fixture-appdata'),
    userData: join(tmpdir(), 'fixture-profile')
  }
  fixture.explicit = false
  fixture.e2e = undefined
  fixture.move.mockReset().mockImplementation((_previous, current) => current)
  vi.stubEnv('ZKYQ_DEV_USER_DATA_PATH', undefined)
  vi.stubEnv('ORCA_DEV_USER_DATA_PATH', undefined)
})
afterEach(() => vi.unstubAllEnvs())

it.each([false, true])(
  'pins both Electron data roots after the default migration, dev=%s',
  (dev) => {
    configureDevUserDataPath(dev)
    const current = join(fixture.paths.appData, dev ? 'zkyq-dev' : 'zkyq')
    expect(fixture.move).toHaveBeenCalledExactlyOnceWith(
      join(fixture.paths.appData, dev ? 'orca-dev' : 'orca'),
      current
    )
    expect(fixture.paths.userData).toBe(current)
    expect(fixture.paths.sessionData).toBe(current)
  }
)
it('migrates a known previous default supplied by an existing launcher', () => {
  fixture.explicit = true
  fixture.paths.userData = join(fixture.paths.appData, 'orca')
  configureDevUserDataPath(false)
  expect(fixture.paths.userData).toBe(join(fixture.paths.appData, 'zkyq'))
  expect(fixture.move).toHaveBeenCalledOnce()
})
it('preserves an explicit custom packaged profile', () => {
  fixture.explicit = true
  const selected = fixture.paths.userData
  configureDevUserDataPath(false)
  expect(fixture.paths.userData).toBe(selected)
  expect(fixture.move).not.toHaveBeenCalled()
})
it('preserves an explicit development profile', () => {
  const selected = join(tmpdir(), 'selected-development-profile')
  vi.stubEnv('ZKYQ_DEV_USER_DATA_PATH', selected)
  configureDevUserDataPath(true)
  expect(fixture.paths.userData).toBe(selected)
  expect(fixture.move).not.toHaveBeenCalled()
})
it('rejects a retired development override before moving any profile', () => {
  vi.stubEnv('ORCA_DEV_USER_DATA_PATH', fixture.paths.userData)
  expect(() => configureDevUserDataPath(true)).toThrow('ZKYQ_DEV_USER_DATA_PATH')
  expect(fixture.move).not.toHaveBeenCalled()
})

it('keeps the disposable E2E profile and home outside default-directory migration', () => {
  const home = mkdtempSync(join(tmpdir(), 'desktop-e2e-home-'))
  try {
    vi.stubEnv('HOME', home)
    vi.stubEnv('USERPROFILE', home)
    vi.stubEnv('ORCA_E2E_HOME_DIR', home)
    fixture.e2e = join(home, 'profile')
    configureDevUserDataPath(true)
    expect(fixture.paths.home).toBe(home)
    expect(fixture.paths.userData).toBe(fixture.e2e)
    expect(fixture.move).not.toHaveBeenCalled()
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
