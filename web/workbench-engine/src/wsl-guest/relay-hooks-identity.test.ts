import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareRelayHooksDirectory } from './relay-hooks-identity'
import { materializeOmpFreshConfig } from '../shared/omp-fresh-config'

const fault = vi.hoisted(() => ({
  busy: false,
  publish: false,
  rewrite: false,
  renameFailure: '',
  publicationAttempts: 0
}))
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return {
    ...fs,
    renameSync: (...args: Parameters<typeof fs.renameSync>) => {
      if (fault.busy && String(args[0]).endsWith('.orca-relay'))
        throw Object.assign(new Error('fixture busy root'), { code: 'EACCES' })
      if (fault.rewrite && String(args[0]).includes('.zkyq-link-'))
        throw Object.assign(new Error('fixture link replacement failed'), { code: 'EIO' })
      try {
        return fs.renameSync(...args)
      } catch (error) {
        fault.renameFailure = String((error as NodeJS.ErrnoException).code)
        throw error
      }
    },
    symlinkSync: (...args: Parameters<typeof fs.symlinkSync>) => {
      if (fault.publish) {
        fault.publicationAttempts++
        throw new Error('fixture bridge publication failed')
      }
      return fs.symlinkSync(
        args[0],
        args[1],
        process.platform === 'win32' && args[2] === 'dir' ? 'junction' : args[2]
      )
    }
  }
})

let home: string, old: string, current: string
const relativePlugin = join(
  'opencode-overlays',
  'a'.repeat(32),
  'plugins',
  'zkyq-opencode-status.js'
)
const pinned = join('omp-managed-status-extension', 'orca-agent-status.ts')
const source = '// @orca-managed-pi-extension\n// preserved operator content 中文\n'
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'zkyq-relay-root-'))
  old = join(home, '.orca-relay')
  current = join(home, '.zkyq-relay')
})
afterEach(() => {
  fault.busy = fault.publish = fault.rewrite = false
  fault.renameFailure = ''
  fault.publicationAttempts = 0
  rmSync(home, { recursive: true, force: true })
})
function seed() {
  mkdirSync(join(old, relativePlugin, '..'), { recursive: true })
  writeFileSync(join(old, relativePlugin), 'export const status = 1\n')
  writeFileSync(join(old, 'user-note.txt'), 'latest user bytes\n')
}
function seedPinned() {
  mkdirSync(join(old, pinned, '..'), { recursive: true })
  writeFileSync(join(old, pinned), source)
}

it('creates no retired entry for a fresh profile', () => {
  expect(prepareRelayHooksDirectory(home)).toBe(current)
  expect(existsSync(old)).toBe(false)
})
it('migrates a generated OMP fresh-session cache with no status plugin installed', () => {
  const original = materializeOmpFreshConfig(join(old, 'omp-managed-status-extension'))
  prepareRelayHooksDirectory(home, true)
  expect(existsSync(old)).toBe(false)
  expect(readFileSync(original.replace('.orca-relay', '.zkyq-relay'), 'utf8')).toBe(
    'autoResume: false\n'
  )
})
it('keeps one live view, original inode and newer writes while the old reader survives', () => {
  seed()
  const inode = lstatSync(join(old, relativePlugin)).ino
  prepareRelayHooksDirectory(home)
  expect(lstatSync(old).isSymbolicLink()).toBe(true)
  expect(realpathSync(old)).toBe(realpathSync(current))
  writeFileSync(join(old, 'user-note.txt'), 'newer write through frozen path\n')
  expect(readFileSync(join(current, 'user-note.txt'), 'utf8')).toBe(
    'newer write through frozen path\n'
  )
  expect(lstatSync(join(current, relativePlugin)).ino).toBe(inode)
  prepareRelayHooksDirectory(home)
  expect(lstatSync(old).isSymbolicLink()).toBe(true)
})
it('retires the bridge and preserves the old pinned inode under a current disabled name', () => {
  seedPinned()
  const inode = lstatSync(join(old, pinned)).ino
  prepareRelayHooksDirectory(home, true)
  expect(existsSync(old)).toBe(false)
  expect(existsSync(join(current, pinned))).toBe(false)
  const archives = readdirSync(join(current, '.zkyq-retired-extensions'))
  expect(archives).toHaveLength(1)
  expect(archives[0]).toMatch(/^zkyq-agent-status-.+\.disabled$/)
  const retained = join(current, '.zkyq-retired-extensions', archives[0])
  expect(readFileSync(retained, 'utf8')).toBe(source)
  expect(lstatSync(retained).ino).toBe(inode)
  prepareRelayHooksDirectory(home)
  expect(existsSync(old)).toBe(false)
})
it('preserves unknown user directories and refuses unrelated root links', () => {
  mkdirSync(old)
  writeFileSync(join(old, 'user.txt'), 'user owned')
  expect(prepareRelayHooksDirectory(home, true)).toBe(current)
  expect(readFileSync(join(old, 'user.txt'), 'utf8')).toBe('user owned')
  const outside = join(home, 'outside')
  mkdirSync(outside)
  symlinkSync(outside, current, 'dir')
  expect(() => prepareRelayHooksDirectory(home, true)).toThrow('unexpected target')
  expect(readFileSync(join(old, 'user.txt'), 'utf8')).toBe('user owned')
})
it('does not merge conflicting directories', () => {
  seed()
  mkdirSync(current)
  writeFileSync(join(current, 'keep.txt'), 'current bytes')
  expect(() => prepareRelayHooksDirectory(home, true)).toThrow('Both current and retired')
  expect(readFileSync(join(old, 'user-note.txt'), 'utf8')).toBe('latest user bytes\n')
  expect(readFileSync(join(current, 'keep.txt'), 'utf8')).toBe('current bytes')
})
it('recognizes a pre-plugin endpoint root and retires v1 coordinates while keeping pending events', () => {
  const hooks = join(old, 'agent-hooks')
  mkdirSync(join(hooks, 'spool'), { recursive: true })
  writeFileSync(
    join(hooks, 'endpoint.env'),
    'ORCA_AGENT_HOOK_PORT=12345\nORCA_AGENT_HOOK_TOKEN=fixture-token\nORCA_AGENT_HOOK_ENV=remote\nORCA_AGENT_HOOK_VERSION=1\n'
  )
  writeFileSync(join(hooks, 'spool', 'pending.jsonl'), 'pending bytes\n')
  prepareRelayHooksDirectory(home)
  expect(lstatSync(old).isSymbolicLink()).toBe(true)
  prepareRelayHooksDirectory(home, true)
  expect(existsSync(old)).toBe(false)
  expect(existsSync(join(current, 'agent-hooks', 'endpoint.env'))).toBe(false)
  expect(readFileSync(join(current, 'agent-hooks', 'spool', 'pending.jsonl'), 'utf8')).toBe(
    'pending bytes\n'
  )
})
it('defers a busy root without separating data and retires it after relocation is possible', () => {
  seed()
  fault.busy = true
  prepareRelayHooksDirectory(home)
  expect(lstatSync(current).isSymbolicLink()).toBe(true)
  writeFileSync(join(current, 'user-note.txt'), 'new pending data')
  fault.busy = false
  prepareRelayHooksDirectory(home, true)
  expect(lstatSync(current).isDirectory()).toBe(true)
  expect(existsSync(old)).toBe(false)
  expect(readFileSync(join(current, 'user-note.txt'), 'utf8')).toBe('new pending data')
})
it('restores the original view when publishing the bridge fails', () => {
  seed()
  fault.publish = true
  let failure: unknown
  try {
    prepareRelayHooksDirectory(home)
  } catch (error) {
    failure = error
  }
  expect(
    String(failure),
    `rename=${fault.renameFailure}; currentLink=${lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()}`
  ).toContain('bridge publication failed')
  expect(lstatSync(old).isDirectory()).toBe(true)
  expect(fault.publicationAttempts).toBe(1)
  expect(existsSync(current)).toBe(false)
  expect(readFileSync(join(old, 'user-note.txt'), 'utf8')).toBe('latest user bytes\n')
})
it('does not archive files through a user directory link', () => {
  seed()
  const outside = join(home, 'outside')
  mkdirSync(outside)
  writeFileSync(join(outside, 'orca-agent-status.ts'), source)
  symlinkSync(outside, join(old, 'omp-managed-status-extension'), 'dir')
  prepareRelayHooksDirectory(home, true)
  expect(readFileSync(join(outside, 'orca-agent-status.ts'), 'utf8')).toBe(source)
  expect(existsSync(join(current, '.zkyq-retired-extensions'))).toBe(false)
})
it('refuses an archive link before removing the original module', () => {
  seedPinned()
  const outside = join(home, 'outside')
  mkdirSync(outside)
  symlinkSync(outside, join(old, '.zkyq-retired-extensions'), 'dir')
  expect(() => prepareRelayHooksDirectory(home, true)).toThrow('archive is not a real directory')
  expect(readFileSync(join(old, pinned), 'utf8')).toBe(source)
  expect(readdirSync(outside)).toEqual([])
})
it.skipIf(process.platform === 'win32')(
  'rewrites internal links before retirement and preserves external links across a failed retry',
  () => {
    seed()
    seedPinned()
    writeFileSync(join(home, 'external.txt'), 'external user bytes')
    symlinkSync(join(old, pinned), join(old, 'pinned-reference'))
    symlinkSync(join(old, 'user-note.txt'), join(old, 'internal-reference'))
    symlinkSync('../external.txt', join(old, 'external-reference'))
    prepareRelayHooksDirectory(home)
    fault.rewrite = true
    expect(() => prepareRelayHooksDirectory(home, true)).toThrow('link replacement failed')
    expect(readFileSync(join(old, pinned), 'utf8')).toBe(source)
    expect(readFileSync(join(old, 'pinned-reference'), 'utf8')).toBe(source)
    fault.rewrite = false
    prepareRelayHooksDirectory(home, true)
    expect(existsSync(old)).toBe(false)
    expect(readFileSync(join(current, 'pinned-reference'), 'utf8')).toBe(source)
    expect(realpathSync(join(current, 'pinned-reference'))).toContain('.zkyq-retired-extensions')
    expect(readFileSync(join(current, 'internal-reference'), 'utf8')).toBe('latest user bytes\n')
    expect(realpathSync(join(current, 'external-reference'))).toBe(join(home, 'external.txt'))
  }
)
