import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runProcess } from '@orca/process-host'
import {
  ORCAD_CLI_ENTRY_FILENAME,
  ORCAD_WINDOWS_CLI_LAUNCHER_FILENAME
} from '../../shared/orcad-artifacts'
import {
  ORCAD_WINDOWS_CLI_LAUNCHER_CONFIG_FILENAME,
  getOrcadAccountCommand,
  getOrcadCliLauncherPath,
  prepareOrcadCliLauncher
} from './orcad-cli-launcher'

const roots = vi.hoisted(() => ({ install: '', profile: '' }))
vi.mock('./orcad-app-paths', () => ({
  resolveOrcadInstallRoot: () => roots.install,
  resolveUserDataPath: () => roots.profile
}))

let directory = ''
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!

beforeEach(async () => {
  vi.stubEnv('CE_WORKBENCH_ISOLATED', '')
  directory = await mkdtemp(join(tmpdir(), 'orca-node-cli-'))
  roots.install = join(directory, "server ' slot")
  roots.profile = join(directory, "profile ' data")
})

afterEach(async () => {
  vi.unstubAllEnvs()
  Object.defineProperty(process, 'platform', platformDescriptor)
  await rm(directory, { recursive: true, force: true })
})

async function writeCli(): Promise<void> {
  const path = join(roots.install, ...ORCAD_CLI_ENTRY_FILENAME.split('/'))
  await mkdir(dirname(path), { recursive: true })
  await writeFile(
    path,
    'console.log(JSON.stringify({profile:process.env.ORCA_USER_DATA_PATH, args:process.argv.slice(2), electron:process.env.ELECTRON_RUN_AS_NODE}))'
  )
}

describe('orcad profile CLI launcher', () => {
  it.skipIf(process.platform === 'win32')(
    'launches pinned Node with intact arguments and the execution host profile',
    async () => {
      await writeCli()
      await prepareOrcadCliLauncher()
      const launcher = getOrcadCliLauncherPath()
      expect(launcher).toBe(join(roots.profile, 'cli', 'bin', 'orca'))
      if (!launcher) {
        throw new Error('CLI launcher is missing')
      }
      const args = ['orchestration', 'send', 'a body\nwith "quotes" and $HOME']
      const result = await runProcess({
        program: launcher,
        args,
        env: {
          ...process.env,
          ORCA_USER_DATA_PATH: '/another/owner',
          ELECTRON_RUN_AS_NODE: '1',
          NODE_OPTIONS: '--require /missing/inherited/preload'
        },
        timeoutMs: 5000
      })
      expect(result.code).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual({ profile: roots.profile, args })
    }
  )

  it.skipIf(process.platform === 'win32')(
    "passes a person's own Orca settings through, adding only the profile",
    async () => {
      const path = join(roots.install, ...ORCAD_CLI_ENTRY_FILENAME.split('/'))
      await mkdir(dirname(path), { recursive: true })
      await writeFile(
        path,
        "console.log(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('ORCA_')))))"
      )
      await prepareOrcadCliLauncher()
      const result = await runProcess({
        program: getOrcadCliLauncherPath()!,
        args: ['status'],
        env: {
          PATH: process.env.PATH,
          ORCA_ENVIRONMENT: 'other-server',
          ORCA_PAIRING_CODE: 'other-pairing'
        },
        timeoutMs: 5000
      })
      expect(result.code).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual({
        ORCA_USER_DATA_PATH: roots.profile,
        ORCA_ENVIRONMENT: 'other-server',
        ORCA_PAIRING_CODE: 'other-pairing'
      })
    }
  )

  it.skipIf(process.platform === 'win32')(
    'refreshes the launcher when the host switches server slots',
    async () => {
      await writeCli()
      await prepareOrcadCliLauncher()
      roots.install = join(directory, 'updated server')
      await writeCli()
      await prepareOrcadCliLauncher()
      const launcher = getOrcadCliLauncherPath()
      if (!launcher) {
        throw new Error('CLI launcher is missing')
      }
      expect(await readFile(launcher, 'utf8')).toContain(roots.install)
    }
  )

  it('leaves old slots without a CLI usable and clears a previous launcher', async () => {
    await writeCli()
    await prepareOrcadCliLauncher()
    roots.install = join(directory, 'old server')
    await prepareOrcadCliLauncher()
    expect(getOrcadCliLauncherPath()).toBeNull()
    expect(getOrcadAccountCommand()).toBeUndefined()
  })

  it('writes a platform POSIX alias with the same pinned runtime and profile', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' })
    vi.stubEnv('CE_WORKBENCH_ISOLATED', '1')
    vi.stubEnv('CE_WORKBENCH_ORIGIN', 'http://127.0.0.1:8878')
    await writeCli()
    await mkdir(join(roots.profile, 'cli', 'bin'), { recursive: true })
    await writeFile(join(roots.profile, 'cli', 'bin', 'ce-workbench'), 'old generated command')
    await writeFile(join(roots.profile, 'cli', 'bin', 'orca'), 'old internal command')
    await prepareOrcadCliLauncher()
    expect(getOrcadCliLauncherPath()).toBe(join(roots.profile, 'cli', 'bin', 'zkyq'))
    expect(getOrcadAccountCommand()).toBe('zkyq')
    expect(await readFile(join(roots.profile, 'cli', 'bin', 'zkyq'), 'utf8')).toBe(
      await readFile(getOrcadCliLauncherPath()!, 'utf8')
    )
    await expect(readFile(join(roots.profile, 'cli', 'bin', 'ce-workbench'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(roots.profile, 'cli', 'bin', 'orca'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('loads platform help context without changing arguments or leaking it to provider children', async () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'linux' })
    vi.stubEnv('CE_WORKBENCH_ISOLATED', '1')
    vi.stubEnv('CE_WORKBENCH_ORIGIN', 'http://127.0.0.1:8878')
    await writeCli()
    await writeFile(
      join(roots.install, ...ORCAD_CLI_ENTRY_FILENAME.split('/')),
      'const brand = process.env.CE_WORKBENCH_CLI; exports.main = () => console.log(JSON.stringify({ brand, childBrand: process.env.CE_WORKBENCH_CLI, args: process.argv.slice(2) }))'
    )
    await prepareOrcadCliLauncher()
    const args = ['account', 'add', '--label', 'Orca user label', '--help']
    const result = await runProcess({
      program: process.execPath,
      args: [join(roots.profile, 'cli', 'bin', 'platform-entry.cjs'), ...args],
      timeoutMs: 5000
    })
    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ brand: '1', args })
  })

  describe('on a Windows host', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    })

    async function writeLauncher(contents: string): Promise<void> {
      const path = join(roots.install, ...ORCAD_WINDOWS_CLI_LAUNCHER_FILENAME.split('/'))
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, contents)
    }

    const binDir = (): string => join(roots.profile, 'cli', 'bin')
    const readConfig = (): Promise<string> =>
      readFile(join(binDir(), ORCAD_WINDOWS_CLI_LAUNCHER_CONFIG_FILENAME), 'utf8')

    it('installs the native launcher and points it at this slot, runtime and profile', async () => {
      await writeCli()
      await writeLauncher('native launcher v1')
      await prepareOrcadCliLauncher()
      const launcher = getOrcadCliLauncherPath()
      expect(launcher).toBe(join(binDir(), 'orca.exe'))
      expect(await readFile(launcher!, 'utf8')).toBe('native launcher v1')
      expect(await readConfig()).toBe(
        [
          `node=${process.execPath}`,
          `cli=${join(roots.install, ...ORCAD_CLI_ENTRY_FILENAME.split('/'))}`,
          `user-data=${roots.profile}`,
          ''
        ].join('\n')
      )
      // cmd.exe reparses `%*`, so no batch or PowerShell proxy may shadow the exe.
      expect((await readdir(binDir())).sort()).toEqual(
        [ORCAD_WINDOWS_CLI_LAUNCHER_CONFIG_FILENAME, 'orca.exe'].sort()
      )
      expect(getOrcadAccountCommand()).toBeUndefined()
    })

    it('migrates generated platform commands to zkyq while preserving the profile', async () => {
      vi.stubEnv('CE_WORKBENCH_ISOLATED', '1')
      vi.stubEnv('CE_WORKBENCH_ORIGIN', 'http://127.0.0.1:8878')
      await writeCli()
      await writeLauncher('native launcher v1')
      await mkdir(binDir(), { recursive: true })
      await writeFile(join(binDir(), 'ce-workbench.exe'), 'native launcher v0')
      await writeFile(join(binDir(), 'orca.exe'), 'native launcher v0')
      await prepareOrcadCliLauncher()
      expect(getOrcadCliLauncherPath()).toBe(join(binDir(), 'zkyq.exe'))
      expect(getOrcadAccountCommand()).toBe('zkyq')
      expect(await readFile(join(binDir(), 'zkyq.exe'), 'utf8')).toBe('native launcher v1')
      await expect(readFile(join(binDir(), 'ce-workbench.exe'))).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(readFile(join(binDir(), 'orca.exe'))).rejects.toMatchObject({ code: 'ENOENT' })
      roots.install = join(directory, 'updated server')
      await writeCli()
      await writeLauncher('native launcher v2')
      await prepareOrcadCliLauncher()
      expect(await readFile(join(binDir(), 'zkyq.exe'), 'utf8')).toBe('native launcher v2')
      await expect(readFile(join(binDir(), 'ce-workbench.exe'))).rejects.toMatchObject({ code: 'ENOENT' })
      const wrapper = join(binDir(), 'platform-entry.cjs')
      expect(await readConfig()).toContain(`cli=${wrapper}`)
      expect(await readFile(wrapper, 'utf8')).toContain(
        JSON.stringify(join(roots.install, 'out', 'cli', 'index.js'))
      )
      roots.install = join(directory, 'old server')
      await prepareOrcadCliLauncher()
      expect(getOrcadAccountCommand()).toBeUndefined()
    })

    it('refreshes the launcher and its target when the host switches server slots', async () => {
      await writeCli()
      await writeLauncher('native launcher v1')
      await prepareOrcadCliLauncher()
      roots.install = join(directory, 'updated server')
      await writeCli()
      await writeLauncher('native launcher v2')
      await prepareOrcadCliLauncher()
      expect(await readFile(join(binDir(), 'orca.exe'), 'utf8')).toBe('native launcher v2')
      expect(await readConfig()).toContain(`cli=${join(roots.install, 'out', 'cli', 'index.js')}`)
    })

    it('leaves a slot without the native launcher with no orca command', async () => {
      await writeCli()
      await prepareOrcadCliLauncher()
      expect(getOrcadCliLauncherPath()).toBeNull()
    })
  })
})
