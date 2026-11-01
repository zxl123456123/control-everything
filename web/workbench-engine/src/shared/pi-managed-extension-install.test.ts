import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PI_AGENT_STATUS_EXTENSION_FILE,
  PI_PREFILL_EXTENSION_FILE,
  PI_TITLEBAR_EXTENSION_FILE,
  PI_MANAGED_EXTENSION_MARKER,
  RETIRED_PI_MANAGED_EXTENSION_MARKER,
  markManagedPiExtension,
  writeManagedPiExtension
} from './pi-managed-extension-install'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, renameSync: vi.fn(actual.renameSync) }
})

describe('managed Pi extension identity installation', () => {
  let root: string
  let directory: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'zkyq-pi-identity-'))
    directory = join(root, 'extensions')
    mkdirSync(directory)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('replaces only the retired generated marker and leaves the module body intact', () => {
    const body = '\r\n// operator Orca note retained\r\nexport default () => {}\r\n'
    expect(markManagedPiExtension(`// ${RETIRED_PI_MANAGED_EXTENSION_MARKER}${body}`)).toBe(
      `// ${PI_MANAGED_EXTENSION_MARKER}${body}`
    )
  })

  it.each([PI_AGENT_STATUS_EXTENSION_FILE, PI_PREFILL_EXTENSION_FILE, PI_TITLEBAR_EXTENSION_FILE])(
    'retires %s by exact bytes and leaves one stable current entry',
    (name) => {
      const previous = join(directory, name.replace(/^zkyq-/, 'orca-'))
      const original = `// ${RETIRED_PI_MANAGED_EXTENSION_MARKER}\r\n// operator edit 中文\r\n`
      writeFileSync(previous, original)
      const current = join(directory, name)
      expect(writeManagedPiExtension(current, 'export default () => {}\n')).toBe(true)
      expect(readdirSync(directory)).toEqual([name])
      const archiveDir = join(root, '.zkyq-retired-extensions')
      const files = readdirSync(archiveDir)
      expect(files).toHaveLength(1)
      expect(readFileSync(join(archiveDir, files[0]), 'utf8')).toBe(original)
      expect(readFileSync(current, 'utf8')).toContain(PI_MANAGED_EXTENSION_MARKER)
      const before = statSync(current).mtimeMs
      expect(writeManagedPiExtension(current, 'export default () => {}\n')).toBe(true)
      expect(statSync(current).mtimeMs).toBe(before)
      expect(readdirSync(archiveDir)).toEqual(files)
    }
  )

  it.each(['zkyq-agent-status.ts', 'orca-agent-status.ts'])(
    'protects an unmarked %s entry before migration',
    (name) => {
      const previous = join(directory, 'orca-agent-status.ts')
      writeFileSync(previous, `// ${RETIRED_PI_MANAGED_EXTENSION_MARKER}\n`)
      writeFileSync(join(directory, name), 'user supplied')
      expect(
        writeManagedPiExtension(join(directory, PI_AGENT_STATUS_EXTENSION_FILE), 'new source')
      ).toBe(false)
      expect(readFileSync(join(directory, name), 'utf8')).toBe('user supplied')
      expect(existsSync(previous)).toBe(true)
      expect(existsSync(join(root, '.zkyq-retired-extensions'))).toBe(false)
    }
  )

  it('publishes only the current filename for a new pinned fallback', () => {
    const path = join(directory, PI_AGENT_STATUS_EXTENSION_FILE)
    expect(writeManagedPiExtension(path, 'new source', 'pinned')).toBe(true)
    expect(readdirSync(directory)).toEqual([PI_AGENT_STATUS_EXTENSION_FILE])
  })

  it('leaves a pinned retired input byte-for-byte untouched while updating the current module', () => {
    const previous = join(directory, 'orca-agent-status.ts')
    const original = `// ${RETIRED_PI_MANAGED_EXTENSION_MARKER}\r\n// retained input 中文\r\n`
    writeFileSync(previous, original)
    const before = statSync(previous).mtimeMs
    const current = join(directory, PI_AGENT_STATUS_EXTENSION_FILE)
    expect(writeManagedPiExtension(current, 'new source', 'pinned')).toBe(true)
    expect(readFileSync(previous, 'utf8')).toBe(original)
    expect(statSync(previous).mtimeMs).toBe(before)
    expect(readFileSync(current, 'utf8')).toContain(PI_MANAGED_EXTENSION_MARKER)
    expect(existsSync(join(root, '.zkyq-retired-extensions'))).toBe(false)
  })

  it('rejects a dangling link without following or replacing it', () => {
    const path = join(directory, PI_AGENT_STATUS_EXTENSION_FILE)
    symlinkSync(join(root, 'missing'), path, 'junction')
    expect(writeManagedPiExtension(path, 'new source')).toBe(false)
    expect(lstatSync(path).isSymbolicLink()).toBe(true)
  })

  it('restores the retired entry and cleans staging when publication fails', () => {
    const previous = join(directory, 'orca-agent-status.ts')
    const original = `// ${RETIRED_PI_MANAGED_EXTENSION_MARKER}\r\n// edit\r\n`
    writeFileSync(previous, original)
    const path = join(directory, PI_AGENT_STATUS_EXTENSION_FILE)
    const rename = vi.mocked(renameSync).getMockImplementation()!
    vi.mocked(renameSync).mockImplementation((from, to) => {
      if (String(to) === path) throw new Error('fixture publication refusal')
      rename(from, to)
    })
    try {
      expect(() => writeManagedPiExtension(path, 'new source')).toThrow(
        'fixture publication refusal'
      )
    } finally {
      vi.mocked(renameSync).mockImplementation(rename)
    }
    expect(readFileSync(previous, 'utf8')).toBe(original)
    expect(readdirSync(directory)).toEqual(['orca-agent-status.ts'])
    expect(readdirSync(join(root, '.zkyq-retired-extensions'))).toEqual([])
  })

  it('archives a duplicate old entry without reloading or rewriting current content', () => {
    const path = join(directory, PI_AGENT_STATUS_EXTENSION_FILE)
    writeManagedPiExtension(path, 'new source')
    const before = statSync(path).mtimeMs
    writeFileSync(
      join(directory, 'orca-agent-status.ts'),
      `// ${RETIRED_PI_MANAGED_EXTENSION_MARKER}\n`
    )
    expect(writeManagedPiExtension(path, 'new source')).toBe(true)
    expect(statSync(path).mtimeMs).toBe(before)
    expect(readdirSync(directory)).toEqual([PI_AGENT_STATUS_EXTENSION_FILE])
  })

  it.skipIf(process.platform === 'win32')(
    'keeps an existing mode despite a restrictive umask',
    () => {
      const path = join(directory, PI_AGENT_STATUS_EXTENSION_FILE)
      writeFileSync(path, `// ${PI_MANAGED_EXTENSION_MARKER}\nold`)
      chmodSync(path, 0o640)
      const previousUmask = process.umask(0o077)
      try {
        expect(writeManagedPiExtension(path, 'new source')).toBe(true)
      } finally {
        process.umask(previousUmask)
      }
      expect(statSync(path).mode & 0o777).toBe(0o640)
    }
  )
})
