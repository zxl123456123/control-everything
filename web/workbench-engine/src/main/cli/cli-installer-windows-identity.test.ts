import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { CliInstaller } from './cli-installer'

it('registers zkyq on Windows and removes only its PATH entry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workbench-cli-identity-'))
  try {
    const resourcesPath = join(root, 'resources')
    const bin = join(resourcesPath, 'bin')
    const launcher = join(bin, 'zkyq.exe')
    await mkdir(bin, { recursive: true })
    await writeFile(launcher, 'synthetic executable fixture')
    let userPath = join(root, 'other-tool')
    const originalPath = userPath
    const installer = new CliInstaller({
      platform: 'win32', isPackaged: true, resourcesPath,
      userDataPath: join(root, 'profile'), appPath: root,
      execPath: join(root, 'desktop.exe'), homePath: root,
      processPathEnv: originalPath,
      userPathReader: async () => ({ state: 'success', value: userPath, expandable: false }),
      userPathWriter: async (value) => { userPath = value },
      userPathCacheInvalidator: vi.fn()
    })
    expect(await installer.getStatus()).toMatchObject({ commandName: 'zkyq', commandPath: launcher, state: 'not_installed' })
    expect(await installer.install()).toMatchObject({ commandName: 'zkyq', state: 'installed', pathConfigured: true })
    expect(userPath).toBe(`${originalPath};${bin}`)
    await installer.install()
    expect(userPath).toBe(`${originalPath};${bin}`)
    expect(await installer.remove()).toMatchObject({ commandName: 'zkyq', state: 'not_installed' })
    expect(userPath).toBe(originalPath)
    expect(existsSync(launcher)).toBe(true)
    expect(existsSync(join(bin, 'orca.exe'))).toBe(false)
    expect(existsSync(join(bin, 'orca.cmd'))).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
