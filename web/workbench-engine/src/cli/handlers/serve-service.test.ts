import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  installServeService,
  readServeServiceStatus,
  uninstallServeService,
  type ServeServiceDeps
} from './serve-service'
import { resolveServiceCommand } from '../runtime/serve-app-launcher'
import { serveSupervisorBrakePath } from '../runtime/serve-supervisor-brake'
import { formatServeServiceInstall, formatServeServiceStatus } from './serve-service-format'

describe('zkyq serve service', () => {
  let home: string
  let bin: string
  let calls: string[]
  let answers: Map<string, { code: number | null; out: string }>

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'zkyq-serve-service-'))
    bin = join(home, 'bin')
    await mkdir(bin)
    for (const name of ['zkyq', 'orca', 'orca-ide']) {
      await writeFile(join(bin, name), '#!/bin/sh\n')
      await chmod(join(bin, name), 0o755)
    }
    calls = []
    answers = new Map()
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  const deps = (platform: NodeJS.Platform): ServeServiceDeps => ({
    platform,
    env: {
      PATH: `/nonexistent${delimiter}${bin}`,
      ZKYQ_USER_DATA_PATH: join(home, 'profile'),
      ELECTRON_RUN_AS_NODE: '1'
    },
    homeDir: home,
    uid: 501,
    run: async (program, args) => {
      const line = [program, ...args].join(' ')
      calls.push(line)
      return answers.get(line) ?? { code: 0, out: '' }
    }
  })

  async function previousService(platform: 'linux' | 'darwin', dataKey = 'ORCA_USER_DATA_PATH') {
    const d = deps(platform)
    const current = await installServeService(
      {
        command: null,
        dryRun: true,
        port: '6779',
        pairingAddress: 'wss://server.example.test/a%20b?x=1&y=2'
      },
      d
    )
    const name = String(current.name)
      .replace('com.controleverything.serve', 'com.stablyai.orca.serve')
      .replace('zkyq-serve', 'orca-serve')
    const path = join(
      dirname(String(current.unitPath)),
      name + (platform === 'darwin' ? '.plist' : '')
    )
    const content = String(current.content)
      .replaceAll(String(current.name), name)
      .replaceAll('ZKYQ_USER_DATA_PATH', dataKey)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
    return { d, current, name, path, content }
  }

  it.each(['linux', 'darwin'] as const)(
    'retires the previous %s service before starting its replacement',
    async (platform) => {
      const old = await previousService(platform)
      const preview = await installServeService({ command: null, dryRun: true }, old.d)
      expect(preview.retiring).toBe(old.name)
      expect(calls).toEqual([])
      expect(await readFile(old.path, 'utf8')).toBe(old.content)
      expect(existsSync(String(old.current.unitPath))).toBe(false)
      const result = await installServeService({ command: null, dryRun: false }, old.d)
      expect(calls[0]).toBe(
        platform === 'darwin'
          ? `launchctl bootout gui/501/${old.name}`
          : `systemctl --user disable --now ${old.name}`
      )
      expect(existsSync(old.path)).toBe(false)
      expect(String(result.retiredUnit)).toMatch(/\.retired$/)
      expect(dirname(String(result.retiredUnit))).not.toBe(dirname(String(result.unitPath)))
      expect(await readFile(String(result.retiredUnit), 'utf8')).toBe(old.content)
      expect(await readFile(String(result.unitPath), 'utf8')).toBe(old.current.content)
      calls = []
      await expect(
        installServeService({ command: null, dryRun: false }, old.d)
      ).resolves.toMatchObject({ retiredUnit: null })
      expect(calls.some((call) => call.includes(old.name))).toBe(false)
    }
  )

  it.each(['linux', 'darwin'] as const)(
    'preserves the previous %s unit when stopping fails',
    async (platform) => {
      const old = await previousService(platform)
      answers.set(
        platform === 'darwin'
          ? `launchctl bootout gui/501/${old.name}`
          : `systemctl --user disable --now ${old.name}`,
        { code: 5, out: 'denied' }
      )
      await expect(installServeService({ command: null, dryRun: false }, old.d)).rejects.toThrow(
        'denied'
      )
      expect(await readFile(old.path, 'utf8')).toBe(old.content)
      expect(existsSync(String(old.current.unitPath))).toBe(false)
      expect(calls).toHaveLength(1)
    }
  )

  it('refuses an unrecognized unit before contacting a manager', async () => {
    const old = await previousService('linux')
    await writeFile(old.path, '[Service]\nExecStart=custom-command\n')
    await expect(installServeService({ command: null, dryRun: false }, old.d)).rejects.toThrow(
      'Cannot verify the previous service'
    )
    expect(calls).toEqual([])
    expect(await readFile(old.path, 'utf8')).toContain('custom-command')
  })

  it('rejects a different profile even when its path has the selected profile as a prefix', async () => {
    const old = await previousService('linux')
    const foreign = old.content.replaceAll('profile', 'profile-other')
    await writeFile(old.path, foreign)
    await expect(installServeService({ command: null, dryRun: false }, old.d)).rejects.toThrow(
      'Cannot verify'
    )
    expect(calls).toEqual([])
    expect(await readFile(old.path, 'utf8')).toBe(foreign)
  })

  it('honors an explicit port while retaining the previous pairing address', async () => {
    const old = await previousService('linux')
    const preview = await installServeService({ command: null, dryRun: true, port: '6780' }, old.d)
    expect(preview.content).toBe(String(old.current.content).replace('--port 6779', '--port 6780'))
    expect(calls).toEqual([])
  })

  it('preserves an edit made while the previous service stops', async () => {
    const old = await previousService('linux')
    old.d.run = async () => {
      await writeFile(old.path, 'changed by user')
      return { code: 0, out: '' }
    }
    await expect(installServeService({ command: null, dryRun: false }, old.d)).rejects.toThrow(
      'Cannot verify the previous service'
    )
    expect(await readFile(old.path, 'utf8')).toBe('changed by user')
    expect(existsSync(String(old.current.unitPath))).toBe(false)
  })

  it('reports and uninstalls a remaining previous registration without creating the replacement', async () => {
    const old = await previousService('linux', 'ZKYQ_USER_DATA_PATH')
    answers.set(`systemctl --user show ${old.name} --property=ActiveState,SubState,MainPID`, {
      code: 0,
      out: 'ActiveState=active\nSubState=running\nMainPID=123\n'
    })
    const status = await readServeServiceStatus(old.d)
    expect(status).toMatchObject({
      name: old.name,
      migrationRequired: true,
      verdict: 'live',
      pid: 123
    })
    expect(formatServeServiceStatus(status)).toContain('to migrate it')
    const removed = await uninstallServeService(old.d)
    expect(removed.removed).toBe(true)
    expect(await readFile(String(removed.retiredUnit), 'utf8')).toBe(old.content)
    expect(existsSync(old.path)).toBe(false)
    expect(existsSync(String(old.current.unitPath))).toBe(false)
  })

  it('installs and loads a LaunchAgent, clearing an old give-up', async () => {
    await mkdir(join(home, 'profile'))
    await writeFile(serveSupervisorBrakePath(join(home, 'profile')), '{}')
    const result = await installServeService({ command: null, dryRun: false }, deps('darwin'))
    const unitPath = String(result.unitPath)
    expect(await readFile(unitPath, 'utf8')).toContain(`<string>${join(bin, 'zkyq')}</string>`)
    expect(calls).toEqual([
      expect.stringMatching(/^launchctl bootout gui\/501\/com\.controleverything\.serve\./),
      `launchctl bootstrap gui/501 ${unitPath}`
    ])
    expect(existsSync(serveSupervisorBrakePath(join(home, 'profile')))).toBe(false)
  })

  it('enables a systemd unit and reports lingering', async () => {
    const d = deps('linux')
    answers.set('loginctl show-user 501 --property=Linger --value', { code: 0, out: 'no\n' })
    const result = await installServeService({ command: null, dryRun: false }, d)
    expect(result.linger).toBe('no')
    expect(await readFile(String(result.unitPath), 'utf8')).toContain(
      'Description=Control Everything server (zkyq serve --supervise)'
    )
    expect(formatServeServiceInstall(result)).toContain('`zkyq serve`')
    expect(calls.slice(0, 3)).toEqual([
      'systemctl --user daemon-reload',
      expect.stringMatching(/^systemctl --user enable zkyq-serve-[0-9a-f]{8}\.service$/),
      expect.stringMatching(/^systemctl --user restart zkyq-serve-/)
    ])
  })

  it('fails loudly when the manager refuses, and writes nothing on a dry run', async () => {
    const d = deps('darwin')
    const dry = await installServeService({ command: null, dryRun: true }, d)
    expect(existsSync(String(dry.unitPath))).toBe(false)
    expect(calls).toEqual([])
    answers.set(`launchctl bootstrap gui/501 ${String(dry.unitPath)}`, { code: 5, out: 'denied' })
    await expect(installServeService({ command: null, dryRun: false }, d)).rejects.toThrow(/denied/)
  })

  it('reports live, exited and unverifiable from the manager', async () => {
    const d = deps('darwin')
    const dry = await installServeService({ command: null, dryRun: true }, d)
    const print = `launchctl print gui/501/${String(dry.name)}`
    answers.set(print, { code: 0, out: '\tstate = running\n\tpid = 4242\n' })
    await expect(readServeServiceStatus(d)).resolves.toMatchObject({
      verdict: 'live',
      pid: 4242,
      installed: false
    })
    answers.set(print, { code: 113, out: 'Could not find service' })
    await expect(readServeServiceStatus(d)).resolves.toMatchObject({ verdict: 'exited' })
    answers.set(print, { code: null, out: '' })
    await expect(readServeServiceStatus(d)).resolves.toMatchObject({ verdict: 'unverifiable' })
    answers.set(print, { code: 5, out: 'Bootstrap failed: no GUI session' })
    await expect(readServeServiceStatus(d)).resolves.toMatchObject({ verdict: 'unverifiable' })

    const linux = deps('linux')
    answers.set(
      `systemctl --user show ${String((await installServeService({ command: null, dryRun: true }, linux)).name)} --property=ActiveState,SubState,MainPID`,
      { code: 0, out: 'ActiveState=active\nSubState=running\nMainPID=99\n' }
    )
    await expect(readServeServiceStatus(linux)).resolves.toMatchObject({ verdict: 'live', pid: 99 })
  })

  it('uninstalls by stopping the service and removing the unit', async () => {
    const d = deps('linux')
    const result = await installServeService({ command: null, dryRun: false }, d)
    calls = []
    await expect(uninstallServeService(d)).resolves.toMatchObject({ removed: true })
    expect(existsSync(String(result.unitPath))).toBe(false)
    expect(calls[0]).toMatch(/^systemctl --user disable --now zkyq-serve-/)
  })

  it('never picks a version-scoped launcher from the profile or a mounted AppImage', async () => {
    const scoped = join(home, 'profile', 'cli', 'bin')
    await mkdir(scoped, { recursive: true })
    await writeFile(join(scoped, 'zkyq'), '#!/bin/sh\n')
    await chmod(join(scoped, 'zkyq'), 0o755)
    expect(
      resolveServiceCommand(null, {
        platform: 'darwin',
        env: { PATH: `${scoped}${delimiter}${bin}`, ZKYQ_USER_DATA_PATH: join(home, 'profile') }
      })
    ).toBe(join(bin, 'zkyq'))
    // Retired commands, including a screen reader named orca, are never selected.
    const onlyOrca = join(home, 'only-orca')
    await mkdir(onlyOrca)
    await writeFile(join(onlyOrca, 'orca'), '#!/bin/sh\n')
    await chmod(join(onlyOrca, 'orca'), 0o755)
    expect(() =>
      resolveServiceCommand(null, {
        platform: 'linux',
        env: { PATH: onlyOrca, ZKYQ_USER_DATA_PATH: join(home, 'profile') }
      })
    ).toThrow(/PATH/)
    await writeFile(join(onlyOrca, 'orca-ide'), '#!/bin/sh\n')
    await chmod(join(onlyOrca, 'orca-ide'), 0o755)
    for (const platform of ['linux', 'darwin'] as const) {
      expect(() =>
        resolveServiceCommand(null, {
          platform,
          env: { PATH: onlyOrca, ZKYQ_USER_DATA_PATH: join(home, 'profile') }
        })
      ).toThrow(/`zkyq` command on PATH/)
    }
  })

  it('keeps an explicitly selected stable custom launcher', async () => {
    const custom = join(bin, 'custom launcher')
    await writeFile(custom, '#!/bin/sh\n')
    await chmod(custom, 0o755)
    expect(resolveServiceCommand(custom, deps('linux'))).toBe(custom)
    const status = await readServeServiceStatus(deps('darwin'))
    expect(formatServeServiceStatus({ ...status, installed: false, verdict: 'exited' })).toContain(
      '`zkyq serve service install`'
    )
  })

  it('refuses Windows and a relative --command', async () => {
    await expect(
      installServeService({ command: null, dryRun: true }, deps('win32'))
    ).rejects.toThrow(/Windows/)
    expect(() => resolveServiceCommand('orca', { platform: 'darwin', env: {} })).toThrow()
    expect(() =>
      resolveServiceCommand(null, { platform: 'darwin', env: { PATH: '/nonexistent' } })
    ).toThrow(/PATH/)
  })
  it('names the command to run when only a server-scoped launcher exists here', async () => {
    // An SSH-managed launcher runs on plain Node and belongs to that server.
    const serverCli = (platform: NodeJS.Platform, path: string): ServeServiceDeps => {
      const base = deps(platform)
      const { ELECTRON_RUN_AS_NODE: _electron, ...env } = base.env
      return { ...base, env: { ...env, PATH: path } }
    }
    const scoped = join(home, 'profile', 'cli', 'bin')
    await mkdir(scoped, { recursive: true })
    await writeFile(join(scoped, 'zkyq'), '#!/bin/sh\n')
    await chmod(join(scoped, 'zkyq'), 0o755)
    await expect(
      installServeService({ command: null, dryRun: false }, serverCli('linux', scoped))
    ).rejects.toThrow(/install the Control Everything app.*`zkyq serve service install`/i)
    await expect(
      installServeService({ command: null, dryRun: true }, serverCli('darwin', scoped))
    ).rejects.toThrow(/`zkyq serve service install`/)
    expect(calls).toEqual([])
    // An installed app's launcher on PATH (or named by --command) still works from that terminal.
    await expect(
      installServeService(
        { command: null, dryRun: true },
        serverCli('linux', `${scoped}${delimiter}${bin}`)
      )
    ).resolves.toMatchObject({ dryRun: true })
    await expect(
      installServeService({ command: join(bin, 'zkyq'), dryRun: true }, serverCli('linux', scoped))
    ).resolves.toMatchObject({ dryRun: true })
  })

  it('refuses a --command tied to one app version', async () => {
    const scoped = join(home, 'profile', 'cli', 'bin')
    await mkdir(scoped, { recursive: true })
    await writeFile(join(scoped, 'zkyq'), '#!/bin/sh\n')
    await chmod(join(scoped, 'zkyq'), 0o755)
    expect(() =>
      resolveServiceCommand(join(scoped, 'zkyq'), {
        platform: 'darwin',
        env: { ZKYQ_USER_DATA_PATH: join(home, 'profile') }
      })
    ).toThrow(/one app version/)
  })
})
