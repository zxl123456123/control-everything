import { afterEach, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getWslAccountTarget } from './account-wsl-location'

afterEach(() => vi.unstubAllEnvs())

it.runIf(process.platform === 'win32')(
  'uses the forwarded distribution when the caller is on a Windows drive',
  () => {
    vi.stubEnv('ZKYQ_CLI_WSL_DISTRO', 'Ubuntu')
    expect(getWslAccountTarget(join(tmpdir(), 'fixture'))).toEqual({
      runtime: 'wsl',
      wslDistro: 'Ubuntu'
    })
  }
)

it.runIf(process.platform === 'win32')('still discovers a WSL distribution from a UNC path', () => {
  vi.stubEnv('ZKYQ_CLI_WSL_DISTRO', '')
  expect(getWslAccountTarget('\\\\wsl.localhost\\Ubuntu\\home\\fixture')).toEqual({
    runtime: 'wsl',
    wslDistro: 'Ubuntu'
  })
})
