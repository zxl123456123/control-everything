import { describe, expect, it, vi } from 'vitest'
import type { SshChannelMultiplexer } from '../ssh/ssh-channel-multiplexer'
import {
  hasManagedPluginDirectoryRemote,
  readManagedPluginFileRemote
} from './installer-utils-remote'
import { createWslHookSftpAdapter } from './wsl-hook-fs-adapter'

function adapter(request: (method: string, params: Record<string, unknown>) => Promise<unknown>) {
  return createWslHookSftpAdapter({ request } as unknown as SshChannelMultiplexer)
}

describe('WSL plugin ownership checks through the SFTP adapter', () => {
  it('reads a regular plugin after reconstructing file predicates from JSON', async () => {
    const request = vi.fn(async (method: string) =>
      method === 'wslfs.lstat'
        ? { ok: true, mode: 0o100600, file: true, directory: false }
        : { ok: true, content: 'managed fixture' }
    )
    await expect(
      readManagedPluginFileRemote(adapter(request), '/test-home/plugin.ts')
    ).resolves.toBe('managed fixture')
    expect(request.mock.calls.map(([method]) => method)).toEqual(['wslfs.lstat', 'wslfs.readFile'])
  })

  it.each([
    { file: false, directory: true },
    { file: false, directory: false }
  ])('rejects a non-file before reading its contents (%j)', async (kind) => {
    const request = vi.fn(async () => ({ ok: true, mode: 0, ...kind }))
    await expect(
      readManagedPluginFileRemote(adapter(request), '/test-home/plugin.ts')
    ).rejects.toThrow('not a regular file')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('accepts a real plugin directory and rejects a link without a stat fallback', async () => {
    await expect(
      hasManagedPluginDirectoryRemote(
        adapter(async () => ({ ok: true, mode: 0o40700, file: false, directory: true })),
        '/test-home/plugin'
      )
    ).resolves.toBe(true)
    const request = vi.fn(async () => ({ ok: true, mode: 0o120777, file: false, directory: false }))
    await expect(
      hasManagedPluginDirectoryRemote(adapter(request), '/test-home/plugin')
    ).rejects.toThrow('not a directory')
    expect(request).toHaveBeenCalledWith('wslfs.lstat', { path: '/test-home/plugin' })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('maps a missing guest path to the existing SFTP absence contract', async () => {
    const sftp = adapter(async () => ({ ok: false, errno: 'ENOENT', message: 'fixture absent' }))
    await expect(readManagedPluginFileRemote(sftp, '/test-home/plugin.ts')).resolves.toBeNull()
    await expect(hasManagedPluginDirectoryRemote(sftp, '/test-home/plugin')).resolves.toBe(false)
  })

  it('propagates denied or unsupported guest operations without reading through links', async () => {
    for (const failure of [
      { ok: false, errno: 'EACCES', message: 'fixture denied' },
      { ok: false, errno: 'ENOSYS', message: 'fixture stale guest' }
    ]) {
      const request = vi.fn(async () => failure)
      await expect(
        readManagedPluginFileRemote(adapter(request), '/test-home/plugin.ts')
      ).rejects.toThrow(failure.message)
      expect(request).toHaveBeenCalledTimes(1)
    }
  })
})
