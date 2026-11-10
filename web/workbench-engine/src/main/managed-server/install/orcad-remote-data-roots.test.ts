import { beforeEach, expect, it, vi } from 'vitest'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import {
  MANAGED_DATA_ROOT_HELPER_MARKER,
  MANAGED_DATA_ROOT_PATH_MARKER,
  MANAGED_DATA_ROOT_TARGET_MARKER,
  MANAGED_DATA_ROOT_RESULT_MARKER
} from '../../../shared/managed-data-roots'
const calls = vi.hoisted(() => ({ exec: vi.fn() }))
vi.mock('./orcad-remote-runtime-control', () => ({ execOrcadRemote: calls.exec }))
import { discoverManagedDataRoot, prepareManagedDataRoot } from './orcad-remote-data-roots'
const target = {
  host: getRemoteHostPlatform('linux-x64'),
  remoteHome: '/home/example',
  conn: Object.create(null)
}
const current = '/home/example/.zkyq',
  old = '/home/example/.orca',
  helper = '/home/example/.zkyq-remote/orcad-0.1.0+ab01'
function probe(state = 'previous', supports = '1', selectedHelper = helper) {
  const encode = (marker: string, value: string) =>
    marker + ' ' + Buffer.from(value).toString('base64')
  return [
    encode(
      MANAGED_DATA_ROOT_PATH_MARKER,
      JSON.stringify({ userDataDir: state === 'previous' ? old : current, state })
    ),
    encode(MANAGED_DATA_ROOT_HELPER_MARKER, selectedHelper),
    encode(MANAGED_DATA_ROOT_TARGET_MARKER, supports)
  ].join('\n')
}
beforeEach(() => calls.exec.mockReset())
const operationResult = (value: unknown) =>
  MANAGED_DATA_ROOT_RESULT_MARKER + ' ' + Buffer.from(JSON.stringify(value)).toString('base64')
it('discovers the old root without moving it before a candidate is installed', async () => {
  calls.exec.mockResolvedValue(probe('previous', '0', ''))
  expect((await discoverManagedDataRoot(target, current)).userDataDir).toBe(old)
  expect(calls.exec).toHaveBeenCalledOnce()
})
it('uses the installed production helper before a snapshot', async () => {
  calls.exec
    .mockResolvedValueOnce(probe())
    .mockResolvedValueOnce(
      operationResult({ version: 1, userDataDir: current, launchUserDataDir: current })
    )
  expect((await prepareManagedDataRoot(target, current, helper, 'prepare')).userDataDir).toBe(
    current
  )
  expect(calls.exec.mock.calls[1][1]).toContain('--zkyq-data-root prepare')
})
it('hands the previous path only to the older slot while keeping the canonical management path', async () => {
  calls.exec
    .mockResolvedValueOnce(probe('current', '0'))
    .mockResolvedValueOnce(
      operationResult({ version: 1, userDataDir: current, launchUserDataDir: old })
    )
  expect(await prepareManagedDataRoot(target, current, helper, 'launch')).toEqual({
    version: 1,
    userDataDir: current,
    launchUserDataDir: old
  })
  expect(calls.exec.mock.calls[1][1]).toContain('--zkyq-data-root previous-build')
})
it('refuses to start an older consumer over migrated state when no capable helper remains', async () => {
  calls.exec.mockResolvedValue(probe('current', '0', ''))
  await expect(prepareManagedDataRoot(target, current, helper, 'launch')).rejects.toThrow(
    'Install the current'
  )
})
it('rejects a helper outside the owned version directories', async () => {
  calls.exec.mockResolvedValue(probe('current', '1', '/home/example/custom/helper'))
  await expect(discoverManagedDataRoot(target, current)).rejects.toThrow(
    'unexpected data directory helper'
  )
})

it('decodes non-ASCII Windows coordinates from the ASCII host protocol', async () => {
  const home = 'C:/example/示例 空间'
  const current = home + '/.zkyq'
  const helper = home + '/.zkyq-remote/orcad-0.2.0+bb02'
  const encode = (marker: string, value: string) =>
    marker + ' ' + Buffer.from(value).toString('base64')
  calls.exec
    .mockResolvedValueOnce(
      [
        encode(
          MANAGED_DATA_ROOT_PATH_MARKER,
          JSON.stringify({ userDataDir: home + '/.orca', state: 'previous' })
        ),
        encode(MANAGED_DATA_ROOT_HELPER_MARKER, helper),
        encode(MANAGED_DATA_ROOT_TARGET_MARKER, '1')
      ].join('\n')
    )
    .mockResolvedValueOnce(
      [
        encode('__ORCAD_RUNTIME__', 'C:/example/runtime/node.exe'),
        encode('__ORCAD_ENTRY__', helper + '/orcad-server.js')
      ].join('\n')
    )
    .mockResolvedValueOnce(
      operationResult({
        version: 1,
        userDataDir: current.replaceAll('/', '\\'),
        launchUserDataDir: current.replaceAll('/', '\\')
      })
    )
  const prepared = await prepareManagedDataRoot(
    { host: getRemoteHostPlatform('win32-x64'), remoteHome: home, conn: Object.create(null) },
    current,
    helper,
    'prepare'
  )
  expect(prepared.userDataDir).toBe(current)
  expect(prepared.launchUserDataDir).toBe(current)
})
