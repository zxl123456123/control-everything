import { expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import { win32 } from 'node:path'
import { resolveOrcaCliCommand, resolveOrcaCliInvocation } from './live-remote-freeze-rpc.mjs'

it.each(['linux', 'darwin', 'win32'])('uses the installed command on %s', (platform) => {
  expect(resolveOrcaCliCommand({ env: {}, platform })).toBe(platform === 'win32' ? 'zkyq.exe' : 'zkyq')
  expect(resolveOrcaCliCommand({ env: { ORCA_CLI_COMMAND: '/user/custom CLI' }, platform })).toBe('/user/custom CLI')
})

it('keeps Windows source invocation in the selected development profile', () => {
  const repo = win32.join(tmpdir(), 'test-repo')
  const profile = win32.join(tmpdir(), 'existing Orca profile')
  const invocation = resolveOrcaCliInvocation({
    platform: 'win32', nodeExecutable: 'node.exe',
    env: { ORCA_DEV_REPO_ROOT: repo, ORCA_DEV_USER_DATA_PATH: profile }
  })
  expect(invocation.command).toBe('node.exe')
  expect(invocation.prefixArgs).toEqual([win32.join(repo, 'out/cli/index.js')])
  expect(invocation.env).toMatchObject({ ORCA_USER_DATA_PATH: profile, ORCA_CLI_COMMAND: 'zkyq-dev', ORCA_DEV_CLI_INVOCATION: '1' })
})
