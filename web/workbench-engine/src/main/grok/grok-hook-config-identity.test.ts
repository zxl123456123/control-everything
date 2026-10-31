import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createAgentHookMemorySftp } from '../agent-hooks/agent-hook-memory-sftp.test-fixture'

const { homedirMock } = vi.hoisted(() => ({ homedirMock: vi.fn<() => string>() }))
vi.mock('os', async () => ({ ...(await vi.importActual('os')), homedir: homedirMock }))
import { GrokHookService } from './hook-service'
import { buildWindowsGrokHookScript } from './windows-grok-hook-script'

let home = ''
let previous = ''
let current = ''
function remoteConfigFixture(files: Record<string, string>) {
  const fixture = createAgentHookMemorySftp(files)
  Object.assign(fixture.sftp, {
    lstat: (path: string, callback: (error: unknown, stats?: { isFile(): boolean }) => void) => {
      fixture.fs.files.has(path) ? callback(null, { isFile: () => true }) : callback({ code: 2 })
    }
  })
  return fixture
}
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'zkyq-grok-identity-'))
  homedirMock.mockReturnValue(home)
  vi.stubEnv('GROK_HOME', join(home, '.grok'))
  mkdirSync(join(home, '.grok', 'hooks'), { recursive: true })
  previous = join(home, '.grok', 'hooks', 'orca-status.json')
  current = join(home, '.grok', 'hooks', 'zkyq-status.json')
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(home, { recursive: true, force: true })
})

it('installs the current filename with all lifecycle events and no retired config', () => {
  expect(new GrokHookService().install()).toMatchObject({ state: 'installed', configPath: current })
  expect(Object.keys(JSON.parse(readFileSync(current, 'utf8')).hooks)).toHaveLength(10)
  expect(existsSync(previous)).toBe(false)
})

it('moves edited legacy JSON and retains user hooks and the original raw backup', () => {
  const raw =
    '\ufeff{ "custom": true, "hooks": { "Notification": [{ "hooks": [{ "type": "command", "command": "user-hook" }] }] } }\r\n'
  writeFileSync(previous, raw)
  expect(new GrokHookService().getStatus().state).toBe('partial')
  expect(new GrokHookService().install().state).toBe('installed')
  const config = JSON.parse(readFileSync(current, 'utf8'))
  expect(config.custom).toBe(true)
  expect(config.hooks.Notification[0].hooks[0].command).toBe('user-hook')
  expect(readFileSync(current + '.bak', 'utf8')).toBe(raw)
  expect(existsSync(previous)).toBe(false)
})

it('preserves an explicitly cleared legacy config without reinstalling', () => {
  const raw = '{ "hooks": {} }\r\n'
  writeFileSync(previous, raw)
  writeFileSync(previous + '.bak', 'previous backup')
  expect(new GrokHookService().install().state).toBe('not_installed')
  expect(readFileSync(current, 'utf8')).toBe(raw)
  expect(readFileSync(current + '.bak', 'utf8')).toBe('previous backup')
  expect(existsSync(previous)).toBe(false)
  expect(existsSync(previous + '.bak')).toBe(false)
})

it('rejects a split family before moving or replacing either generation', () => {
  writeFileSync(previous, '{}')
  writeFileSync(previous + '.bak', 'old backup')
  writeFileSync(current + '.bak', 'current backup')
  expect(new GrokHookService().install()).toMatchObject({ state: 'error' })
  expect(readFileSync(previous, 'utf8')).toBe('{}')
  expect(readFileSync(previous + '.bak', 'utf8')).toBe('old backup')
  expect(readFileSync(current + '.bak', 'utf8')).toBe('current backup')
  expect(existsSync(current)).toBe(false)
})

it('resumes an interrupted exclusive publication of the same inode', () => {
  writeFileSync(previous, '{"hooks":{}}')
  linkSync(previous, current)
  expect(new GrokHookService().install().state).toBe('not_installed')
  expect(existsSync(previous)).toBe(false)
  expect(readFileSync(current, 'utf8')).toBe('{"hooks":{}}')
})

it.skipIf(process.platform === 'win32')(
  'keeps a user-cleared symlink connected to its original target',
  () => {
    const target = join(home, 'user-hooks.json')
    writeFileSync(target, '{"hooks":{}}')
    symlinkSync('../../user-hooks.json', previous)
    expect(new GrokHookService().install().state).toBe('not_installed')
    expect(lstatSync(current).isSymbolicLink()).toBe(true)
    expect(readlinkSync(current)).toBe('../../user-hooks.json')
    expect(readFileSync(target, 'utf8')).toBe('{"hooks":{}}')
    expect(existsSync(previous)).toBe(false)
  }
)

it.skipIf(process.platform === 'win32')(
  'moves its own symlink cleanup marker so managed reinstall still works',
  () => {
    const target = join(home, 'user-hooks.json')
    const raw = '{"hooks":{}}'
    writeFileSync(target, raw)
    symlinkSync(target, previous)
    const stats = statSync(target)
    writeFileSync(
      previous + '.orca-cleaned-symlink',
      JSON.stringify({
        realPath: target,
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        contentsHash: createHash('sha256').update(raw).digest('hex')
      })
    )
    expect(new GrokHookService().install().state).toBe('installed')
    expect(lstatSync(current).isSymbolicLink()).toBe(true)
    expect(existsSync(previous + '.orca-cleaned-symlink')).toBe(false)
    expect(existsSync(current + '.zkyq-cleaned-symlink')).toBe(false)
  }
)

it.each(['remove', 'removeAsync'] as const)(
  'migrates before %s and removes only managed entries',
  async (method) => {
    const config = {
      hooks: {
        Notification: [
          {
            hooks: [
              { type: 'command', command: '/example/.orca/agent-hooks/grok-hook.sh' },
              { type: 'command', command: 'user-hook' }
            ]
          }
        ]
      }
    }
    writeFileSync(previous, JSON.stringify(config))
    expect((await new GrokHookService()[method]()).state).toBe('not_installed')
    expect(existsSync(previous)).toBe(false)
    expect(JSON.parse(readFileSync(current, 'utf8')).hooks.Notification[0].hooks).toEqual([
      { type: 'command', command: 'user-hook' }
    ])
  }
)

it('does not replace an independent current config even when legacy contents match', () => {
  writeFileSync(previous, '{}')
  writeFileSync(current, '{}')
  expect(new GrokHookService().install().state).toBe('error')
  expect(readFileSync(previous, 'utf8')).toBe('{}')
  expect(readFileSync(current, 'utf8')).toBe('{}')
})

it('moves the remote legacy config before installing current hooks', async () => {
  const old = '/example/remote/.grok/hooks/orca-status.json'
  const fresh = '/example/remote/.grok/hooks/zkyq-status.json'
  const fixture = remoteConfigFixture({ [old]: '{"custom":true,"hooks":{}}' })
  const result = await new GrokHookService().installRemote(fixture.sftp, '/example/remote')
  expect(result).toMatchObject({ state: 'installed', configPath: fresh })
  expect(fixture.fs.files.has(old)).toBe(false)
  expect(JSON.parse(fixture.fs.files.get(fresh)!).custom).toBe(true)
})

it('preserves conflicting remote generations and does not install a script', async () => {
  const old = '/example/remote/.grok/hooks/orca-status.json'
  const fresh = '/example/remote/.grok/hooks/zkyq-status.json'
  const fixture = remoteConfigFixture({ [old]: '{}', [fresh]: '{"custom":true}' })
  expect(await new GrokHookService().installRemote(fixture.sftp, '/example/remote')).toMatchObject({
    state: 'error',
    detail: 'Remote Grok hook identity migration has conflicting files'
  })
  expect(Object.fromEntries(fixture.fs.files)).toEqual({ [old]: '{}', [fresh]: '{"custom":true}' })
})

it('generates only current Grok scratch variables and labels', () => {
  const script = buildWindowsGrokHookScript()
  expect(script).toContain('grokHome=%ZKYQ_GROK_HOME%')
  expect(script).toContain(':zkyq_grok_home_ready')
  expect(script).not.toMatch(/ORCA_GROK_HOME|orca_grok_home_ready/)
})

it('leaves remote symlinks untouched rather than replacing user-owned targets', async () => {
  const old = '/example/remote/.grok/hooks/orca-status.json'
  const fixture = remoteConfigFixture({ [old]: '{"hooks":{}}' })
  Object.assign(fixture.sftp, {
    lstat: (_path: string, callback: (error: unknown, stats?: { isFile(): boolean }) => void) =>
      callback(null, { isFile: () => false })
  })
  expect((await new GrokHookService().installRemote(fixture.sftp, '/example/remote')).state).toBe(
    'error'
  )
  expect(Object.fromEntries(fixture.fs.files)).toEqual({ [old]: '{"hooks":{}}' })
})

it('retains the remote source if exclusive rename fails before publication', async () => {
  const old = '/example/remote/.grok/hooks/orca-status.json'
  const fixture = remoteConfigFixture({ [old]: '{}' })
  Object.assign(fixture.sftp, {
    rename: (_from: string, _to: string, callback: (error: unknown) => void) =>
      callback(new Error('fixture exclusive rename failure'))
  })
  expect(await new GrokHookService().installRemote(fixture.sftp, '/example/remote')).toMatchObject({
    state: 'error',
    detail: 'fixture exclusive rename failure'
  })
  expect(Object.fromEntries(fixture.fs.files)).toEqual({ [old]: '{}' })
})
