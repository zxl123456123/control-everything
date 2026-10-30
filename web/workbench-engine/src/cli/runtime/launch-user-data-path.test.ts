import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultUserDataPath, getPlatformUserDataPath } from './metadata'
import { getMacOpenArgs } from './launch'
import { pinLaunchUserDataPath, resolveLaunchUserDataPath } from './launch-user-data-path'

afterEach(() => vi.unstubAllEnvs())

describe('resolveLaunchUserDataPath', () => {
  it('rejects a retired profile override instead of connecting to the default instance', () => {
    const env = { ORCA_USER_DATA_PATH: 'existing profile' }
    expect(() => resolveLaunchUserDataPath(env)).toThrow(
      'Set ZKYQ_USER_DATA_PATH to the same data directory'
    )
    vi.stubEnv('ZKYQ_USER_DATA_PATH', '')
    vi.stubEnv('ORCA_USER_DATA_PATH', env.ORCA_USER_DATA_PATH)
    expect(() => getDefaultUserDataPath()).toThrow(
      'Set ZKYQ_USER_DATA_PATH to the same data directory'
    )
  })

  it('uses the selected current profile even with an inherited retired setting', () => {
    vi.stubEnv('ZKYQ_USER_DATA_PATH', 'existing Orca profile')
    vi.stubEnv('ORCA_USER_DATA_PATH', 'stale profile')
    expect(getDefaultUserDataPath()).toBe('existing Orca profile')
    expect(resolveLaunchUserDataPath()).toBe(resolve('existing Orca profile'))
  })
  it('prefers ZKYQ_USER_DATA_PATH, made absolute', () => {
    expect(
      resolveLaunchUserDataPath({
        ZKYQ_USER_DATA_PATH: 'rel/profile',
        ORCA_DEV_USER_DATA_PATH: '/dev',
        ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT: '1'
      })
    ).toBe(resolve('rel/profile'))
  })

  it("falls back to the dev app's own profile for a dev executable", () => {
    expect(resolveLaunchUserDataPath({ ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT: '1' })).toBe(
      resolve(join(getPlatformUserDataPath(), '..', 'orca-dev'))
    )
  })

  it('ignores ORCA_DEV_USER_DATA_PATH for a packaged executable', () => {
    expect(resolveLaunchUserDataPath({ ORCA_DEV_USER_DATA_PATH: '/dev' })).toBe(
      getPlatformUserDataPath()
    )
  })
})

describe('pinLaunchUserDataPath', () => {
  it('removes the retired child setting without changing the parent environment', () => {
    const parent = { ORCA_USER_DATA_PATH: 'old profile' }
    const pinned = pinLaunchUserDataPath([], parent, 'selected profile')
    expect(pinned.env).toEqual({ ZKYQ_USER_DATA_PATH: 'selected profile' })
    expect(parent.ORCA_USER_DATA_PATH).toBe('old profile')
  })
  it('sets the dev override only for a dev executable', () => {
    expect(pinLaunchUserDataPath(['--no-sandbox'], {}, '/p')).toEqual({
      args: ['--no-sandbox', '--user-data-dir=/p'],
      env: { ZKYQ_USER_DATA_PATH: '/p' }
    })
    expect(
      pinLaunchUserDataPath([], { ORCA_APP_EXECUTABLE_NEEDS_APP_ROOT: '1' }, '/p').env
    ).toMatchObject({ ORCA_DEV_USER_DATA_PATH: '/p' })
  })
})

describe('getMacOpenArgs', () => {
  it('reopens the bundle as before on the default profile', () => {
    expect(getMacOpenArgs('/Applications/Orca.app', getPlatformUserDataPath())).toEqual([
      '/Applications/Orca.app'
    ])
  })

  it('starts a new instance on another profile instead of activating the running app', () => {
    expect(getMacOpenArgs('/Applications/Orca.app', '/isolated/p')).toEqual([
      '-n',
      '/Applications/Orca.app',
      '--args',
      '--user-data-dir=/isolated/p'
    ])
  })
})
