import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Script } from 'node:vm'
import { runProcess } from '@orca/process-host'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import {
  parseRemoteRootProbe,
  remoteRootProbeCommand,
  windowsRemoteRootMoveCommand
} from './remote-root-identity-commands'
import {
  REMOTE_ROOT_IDENTITY_LOCK,
  REMOTE_ROOT_IDENTITY_OWNER,
  REMOTE_ROOT_IDENTITY_RECORD,
  REMOTE_ROOT_IDENTITY_SCRIPT
} from './remote-root-identity-host'

const a = 'a'.repeat(16),
  b = 'b'.repeat(16),
  token = 'owned-fixture-token'
const host = getRemoteHostPlatform(process.platform === 'win32' ? 'win32-x64' : 'linux-x64')
let home: string, old: string, current: string
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'zkyq-remote-root-[测试] & !-'))
  old = join(home, '.orca-remote')
  current = join(home, '.zkyq-remote')
  mkdirSync(join(home, REMOTE_ROOT_IDENTITY_LOCK))
  writeFileSync(join(home, REMOTE_ROOT_IDENTITY_LOCK, REMOTE_ROOT_IDENTITY_OWNER), token)
})
afterEach(() => rmSync(home, { recursive: true, force: true }))
function seed() {
  mkdirSync(join(old, 'orcad-0.1.0+abcd1234'), { recursive: true })
  writeFileSync(join(old, 'orcad-0.1.0+abcd1234/.version'), '0.1.0+abcd1234')
  writeFileSync(join(old, 'user-note.txt'), 'latest user bytes 中文\n')
}
async function osCommand(command: string): Promise<string> {
  const spec =
    process.platform === 'win32'
      ? { program: 'powershell.exe', args: command.split(' ').slice(1) }
      : { program: '/bin/sh', args: ['-c', command] }
  const result = await runProcess({ ...spec, timeoutMs: 15000 })
  if (result.code !== 0) throw new Error(result.stderr + result.stdout)
  return result.stdout
}
function runHost(
  scope: string | null = a,
  expected = [a],
  verdict: 'exited' | 'live' | 'canonical-live' | 'unverifiable' = 'exited',
  mode = 'finalize',
  failJunctionPublish = false
): { state: string; reason?: string } {
  let output: { state: string; reason?: string } | undefined
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64')
  const uid = process.getuid?.() ?? 1000
  const census =
    process.platform === 'win32'
      ? JSON.stringify(
          verdict === 'live' || verdict === 'canonical-live'
            ? [
                {
                  ProcessId: 424242,
                  ParentProcessId: 1,
                  Name: 'node.exe',
                  CommandLine: join(verdict === 'canonical-live' ? current : old, 'reader.cjs')
                }
              ]
            : [
                {
                  ProcessId: 424242,
                  ParentProcessId: 1,
                  Name: 'node.exe',
                  CommandLine: verdict === 'exited' ? 'unrelated runtime' : null
                }
              ]
        )
      : verdict === 'unverifiable'
        ? 'malformed process inventory'
        : `${uid} 424242 1 node ${verdict === 'live' || verdict === 'canonical-live' ? join(verdict === 'canonical-live' ? current : old, 'reader.cjs') : 'unrelated-runtime'}\n`
  new Script(REMOTE_ROOT_IDENTITY_SCRIPT).runInNewContext({
    Buffer,
    console: {
      log: (value: string) => {
        output = JSON.parse(value)
      }
    },
    process: {
      platform: process.platform,
      pid: process.pid,
      getuid: () => uid,
      argv: ['node', 'host.cjs', home, encode(scope), encode(expected), token, mode],
      exit: (code: number) => {
        throw new Error(`fixture_exit_${code}`)
      }
    },
    require: (name: string) => {
      if (name === 'node:child_process') return { spawnSync: () => ({ status: 0, stdout: census }) }
      const actual = require(name)
      if (name !== 'node:fs' || !failJunctionPublish) return actual
      return {
        ...actual,
        renameSync: (source: string, target: string) => {
          if (
            source.includes('.zkyq-link-') &&
            target.endsWith('current-data') &&
            !existsSync(target)
          )
            throw Object.assign(new Error('injected publication failure'), { code: 'EIO' })
          return actual.renameSync(source, target)
        }
      }
    }
  })
  if (!output) throw new Error('No host result')
  return output
}
async function move() {
  if (process.platform === 'win32') {
    expect((await osCommand(windowsRemoteRootMoveCommand(host, home, token))).trim()).toBe('MOVED')
  } else {
    runHost(a, [a, b], 'exited', 'prepare')
  }
}

it('probes fresh and owned roots over the actual host shell without changing them', async () => {
  const fresh = parseRemoteRootProbe(await osCommand(remoteRootProbeCommand(host, home)))
  expect(fresh.old).toBe('absent')
  expect(fresh.current).toBe('absent')
  seed()
  const owned = parseRemoteRootProbe(await osCommand(remoteRootProbeCommand(host, home)))
  expect(owned.old).toBe('dir')
  expect(owned.slot).toBe('orcad-0.1.0+abcd1234')
  expect(existsSync(current)).toBe(false)
})
it('creates no retired entry for a fresh profile', () => {
  expect(runHost()).toEqual({ state: 'current' })
  expect(existsSync(old)).toBe(false)
  expect(existsSync(current)).toBe(false)
})
it('rewrites an internal directory link before retiring the root', async () => {
  seed()
  mkdirSync(join(old, 'data'))
  symlinkSync(
    join(old, 'data'),
    join(old, 'current-data'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  await move()
  expect(runHost(a, [a])).toEqual({ state: 'current' })
  expect(existsSync(old)).toBe(false)
  expect(realpathSync(join(current, 'current-data'))).toBe(realpathSync(join(current, 'data')))
})
it.runIf(process.platform === 'win32')(
  'restores the previous junction when replacement publication fails',
  async () => {
    seed()
    mkdirSync(join(old, 'data'))
    symlinkSync(join(old, 'data'), join(old, 'current-data'), 'junction')
    await move()
    expect(() => runHost(a, [a], 'exited', 'finalize', true)).toThrow(
      'injected publication failure'
    )
    expect(realpathSync(join(current, 'current-data'))).toBe(realpathSync(join(current, 'data')))
    expect(existsSync(old)).toBe(true)
    expect(readFileSync(join(old, 'user-note.txt'), 'utf8')).toBe('latest user bytes 中文\n')
    expect(runHost(a, [a])).toEqual({ state: 'current' })
  }
)
it('retains one inode and newer writes until every registered machine confirms exit', async () => {
  seed()
  const inode = lstatSync(join(old, 'user-note.txt'), { bigint: true }).ino
  await move()
  expect(realpathSync(old)).toBe(realpathSync(current))
  writeFileSync(join(old, 'user-note.txt'), 'new write through frozen coordinates')
  expect(runHost(a, [a, b])).toEqual({ state: 'bridged', reason: 'other-machines' })
  expect(runHost(b, [a, b])).toEqual({ state: 'current' })
  expect(existsSync(old)).toBe(false)
  expect(readFileSync(join(current, 'user-note.txt'), 'utf8')).toBe(
    'new write through frozen coordinates'
  )
  expect(lstatSync(join(current, 'user-note.txt'), { bigint: true }).ino).toBe(inode)
  expect(runHost()).toEqual({ state: 'current' })
  expect(existsSync(old)).toBe(false)
})
it.each(['live', 'canonical-live', 'unverifiable'] as const)(
  'keeps the bridge when the current machine is %s',
  async (verdict) => {
    seed()
    await move()
    expect(runHost(a, [a], verdict)).toEqual({
      state: 'bridged',
      reason: verdict === 'canonical-live' ? 'live' : verdict
    })
    expect(readFileSync(join(old, 'user-note.txt'), 'utf8')).toBe('latest user bytes 中文\n')
    const record = JSON.parse(readFileSync(join(current, REMOTE_ROOT_IDENTITY_RECORD), 'utf8'))
    expect(record.retiredScopes).not.toContain(a)
  }
)
it('does not retire a bridge for an unattributed caller', async () => {
  seed()
  await move()
  expect(runHost(null, [a, b]).state).toBe('bridged')
  expect(lstatSync(old).isSymbolicLink()).toBe(true)
})
it('refuses future records and changed ownership before removing data', async () => {
  seed()
  await move()
  writeFileSync(join(current, REMOTE_ROOT_IDENTITY_RECORD), '{"schemaVersion":2}')
  expect(() => runHost()).toThrow('Unsupported')
  expect(readFileSync(join(old, 'user-note.txt'), 'utf8')).toBe('latest user bytes 中文\n')
  writeFileSync(join(home, REMOTE_ROOT_IDENTITY_LOCK, REMOTE_ROOT_IDENTITY_OWNER), 'other-owner')
  expect(() => runHost()).toThrow('ownership changed')
})
it('refuses unrelated links instead of touching their external target', () => {
  seed()
  const outside = join(home, 'outside')
  mkdirSync(outside)
  writeFileSync(join(outside, 'user.txt'), 'external user bytes')
  symlinkSync(outside, current, process.platform === 'win32' ? 'junction' : 'dir')
  expect(() => runHost()).toThrow('unexpected target')
  expect(readFileSync(join(outside, 'user.txt'), 'utf8')).toBe('external user bytes')
})
it.skipIf(process.platform === 'win32')(
  'rewrites only internal absolute and relative links before removing the bridge',
  () => {
    seed()
    writeFileSync(join(home, 'external.txt'), 'external bytes')
    symlinkSync(join(old, 'user-note.txt'), join(old, 'absolute'))
    symlinkSync('../.orca-remote/user-note.txt', join(old, 'relative'))
    symlinkSync('../external.txt', join(old, 'external'))
    expect(runHost(a, [a], 'exited', 'prepare')).toEqual({ state: 'current' })
    expect(existsSync(old)).toBe(false)
    for (const name of ['absolute', 'relative'])
      expect(readFileSync(join(current, name), 'utf8')).toBe('latest user bytes 中文\n')
    expect(realpathSync(join(current, 'external'))).toBe(join(home, 'external.txt'))
  }
)
it('rejects malformed root probe framing', () => {
  expect(() => parseRemoteRootProbe('')).toThrow('verifiable')
  const encoded = (value: string) => Buffer.from(value).toString('base64')
  expect(() =>
    parseRemoteRootProbe(
      'ZKYQ_ROOT_PROBE_V1\n' +
        ['old', 'old', 'oldTarget', 'currentTarget', 'slot', 'owner', 'record']
          .map((name) => name + '=' + encoded('absent'))
          .join('\n')
    )
  ).toThrow('malformed')
})
