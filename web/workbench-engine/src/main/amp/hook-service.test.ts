import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import * as fs from 'node:fs'
import type { SFTPWrapper } from 'ssh2'
import { RETIRED_AMP_PLUGIN_FILE, RETIRED_AMP_PLUGIN_MARKER } from './agent-status-plugin-source'

vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>()
  return { ...actual, renameSync: vi.fn(actual.renameSync) }
})

const { homedirMock } = vi.hoisted(() => ({
  homedirMock: vi.fn<() => string>()
}))

vi.mock('os', async () => {
  const actual = (await vi.importActual('os')) as Record<string, unknown>
  return {
    ...actual,
    homedir: homedirMock
  }
})

import { AmpHookService, _internals } from './hook-service'

function remoteFixture(
  files: Map<string, string>,
  failedTarget?: string,
  links = new Set<string>()
): SFTPWrapper {
  const missing = () => Object.assign(new Error('No such file'), { code: 2 })
  return {
    readFile(
      path: string,
      _encoding: string,
      callback: (error: Error | null, body?: string) => void
    ) {
      files.has(path) ? callback(null, files.get(path)) : callback(missing())
    },
    lstat(path: string, callback: (error: Error | null, stat?: unknown) => void) {
      files.has(path) ? callback(null, { isFile: () => !links.has(path) }) : callback(missing())
    },
    stat(path: string, callback: (error: Error | null, stat?: unknown) => void) {
      files.has(path) ? callback(null, { mode: 0o600 }) : callback(missing())
    },
    writeFile(
      path: string,
      body: string,
      _options: unknown,
      callback: (error: Error | null) => void
    ) {
      files.set(path, body)
      callback(null)
    },
    mkdir(_path: string, callback: (error: Error | null) => void) {
      callback(null)
    },
    chmod(_path: string, _mode: number, callback: (error: Error | null) => void) {
      callback(null)
    },
    rename(from: string, to: string, callback: (error: Error | null) => void) {
      if (
        to === failedTarget ||
        (failedTarget === 'archive' && to.includes('/.zkyq-retired-plugins/'))
      )
        return callback(new Error('fixture rename failure'))
      if (!files.has(from)) return callback(missing())
      files.set(to, files.get(from)!)
      files.delete(from)
      callback(null)
    },
    unlink(path: string, callback: (error: Error | null) => void) {
      files.delete(path)
      callback(null)
    }
  } as unknown as SFTPWrapper
}

describe('AmpHookService', () => {
  let homeDir: string

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'orca-amp-home-'))
    homedirMock.mockReturnValue(homeDir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    rmSync(homeDir, { recursive: true, force: true })
  })

  it('retires the previous auto-loaded file and preserves its exact edited bytes', () => {
    const old = _internals.getPluginPath(RETIRED_AMP_PLUGIN_FILE)
    const body = `// ${RETIRED_AMP_PLUGIN_MARKER}\r\n// fixture 中文 customization\r\n`
    mkdirSync(dirname(old), { recursive: true })
    writeFileSync(old, body)
    const service = new AmpHookService()
    expect(service.getStatus().state).toBe('partial')
    const status = service.install()
    expect(status.state).toBe('installed')
    expect(status.configPath).toContain('zkyq-agent-status.ts')
    expect(existsSync(old)).toBe(false)
    const archive = join(dirname(dirname(old)), '.zkyq-retired-plugins')
    const entries = fs.readdirSync(archive)
    expect(entries).toHaveLength(1)
    expect(readFileSync(join(archive, entries[0]), 'utf8')).toBe(body)
    expect(readFileSync(status.configPath, 'utf8')).toContain('Managed by Control Everything.')
    const written = fs.statSync(status.configPath).mtimeMs
    expect(service.install().state).toBe('installed')
    expect(fs.statSync(status.configPath).mtimeMs).toBe(written)
    expect(fs.readdirSync(archive)).toEqual(entries)
  })

  it.each(['previous', 'current'])(
    'does not change either file when the %s path is user-owned',
    (collision) => {
      const old = _internals.getPluginPath(RETIRED_AMP_PLUGIN_FILE)
      const current = _internals.getPluginPath()
      mkdirSync(dirname(old), { recursive: true })
      const oldBody =
        collision === 'previous' ? 'user-owned old filename\n' : `// ${RETIRED_AMP_PLUGIN_MARKER}\n`
      writeFileSync(old, oldBody)
      if (collision === 'current') writeFileSync(current, 'user-owned new filename\n')
      expect(new AmpHookService().install().state).toBe('partial')
      expect(readFileSync(old, 'utf8')).toBe(oldBody)
      if (collision === 'current')
        expect(readFileSync(current, 'utf8')).toBe('user-owned new filename\n')
      else expect(existsSync(current)).toBe(false)
    }
  )

  it('preserves a dangling user link instead of treating it as an absent plugin', () => {
    const current = _internals.getPluginPath()
    mkdirSync(dirname(current), { recursive: true })
    fs.symlinkSync(
      join(homeDir, 'missing-user-directory'),
      current,
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    expect(existsSync(current)).toBe(false)
    expect(new AmpHookService().install().state).toBe('partial')
    expect(fs.lstatSync(current).isSymbolicLink()).toBe(true)
    expect(existsSync(_internals.getPluginPath(RETIRED_AMP_PLUGIN_FILE))).toBe(false)
  })

  it('restores the previous entry when publishing the new local file fails', () => {
    const old = _internals.getPluginPath(RETIRED_AMP_PLUGIN_FILE)
    const current = _internals.getPluginPath()
    const body = `// ${RETIRED_AMP_PLUGIN_MARKER}\n`
    mkdirSync(dirname(old), { recursive: true })
    writeFileSync(old, body)
    const renameMock = vi.mocked(fs.renameSync)
    const rename = renameMock.getMockImplementation()!
    renameMock.mockImplementation((from, to) => {
      if (String(to) === current) throw new Error('fixture rename failure')
      return rename(from, to)
    })
    try {
      expect(() => new AmpHookService().install()).toThrow('fixture rename failure')
      expect(readFileSync(old, 'utf8')).toBe(body)
      expect(existsSync(current)).toBe(false)
    } finally {
      renameMock.mockImplementation(rename)
    }
  })

  it('removes the generated current entry and retires a surviving previous install', () => {
    const service = new AmpHookService()
    const current = service.install().configPath
    const old = _internals.getPluginPath(RETIRED_AMP_PLUGIN_FILE)
    writeFileSync(old, `// ${RETIRED_AMP_PLUGIN_MARKER}\n`)
    expect(service.remove().state).toBe('not_installed')
    expect(existsSync(old)).toBe(false)
    expect(existsSync(current)).toBe(false)
    expect(fs.readdirSync(join(dirname(dirname(old)), '.zkyq-retired-plugins'))).toHaveLength(1)
  })

  it.each([
    'fresh',
    'previous',
    'duplicate',
    'user-owned',
    'write-failure',
    'move-failure',
    'link'
  ])('migrates remote plugin identity: %s', async (kind) => {
    const home = '/fixture-home'
    const current = _internals.getRemotePluginPath(home)
    const old = _internals.getRemotePluginPath(home, RETIRED_AMP_PLUGIN_FILE)
    const body = `// ${RETIRED_AMP_PLUGIN_MARKER}\r\n// fixture customization\r\n`
    const files = new Map<string, string>()
    if (kind !== 'fresh') files.set(old, kind === 'user-owned' ? 'user-owned\n' : body)
    if (kind === 'duplicate') files.set(current, _internals.getAmpPluginSource())
    const sftp = remoteFixture(
      files,
      kind === 'write-failure' ? current : kind === 'move-failure' ? 'archive' : undefined,
      kind === 'link' ? new Set([old]) : undefined
    )
    const status = await new AmpHookService().installRemote(sftp, home)
    if (
      kind === 'user-owned' ||
      kind === 'link' ||
      kind === 'write-failure' ||
      kind === 'move-failure'
    ) {
      expect(status.state).toBe(kind === 'user-owned' ? 'partial' : 'error')
      expect(files.get(old)).toBe(kind === 'user-owned' ? 'user-owned\n' : body)
      expect(files.has(current)).toBe(false)
    } else {
      expect(status.state).toBe('installed')
      expect(files.get(current)).toBe(_internals.getAmpPluginSource())
      expect(files.has(old)).toBe(false)
      const archives = [...files].filter(([name]) => name.includes('/.zkyq-retired-plugins/'))
      expect(archives).toHaveLength(kind === 'fresh' ? 0 : 1)
      if (archives.length) expect(archives[0][1]).toBe(body)
    }
  })

  it('installs an Orca-managed Amp system plugin', () => {
    const status = new AmpHookService().install()

    expect(status).toMatchObject({
      agent: 'amp',
      state: 'installed',
      configPath: join(homeDir, '.config', 'amp', 'plugins', _internals.AMP_PLUGIN_FILE),
      managedHooksPresent: true,
      detail: null
    })

    const source = readFileSync(status.configPath, 'utf-8')
    expect(source).toContain('return { action: "allow" }')
    expect(source).toContain('const MAX_PENDING_POSTS = 50')
    expect(source).toContain('let postQueue: QueuedPost[] = []')
    expect(source).toContain('function enqueuePost')
    expect(source).toContain('postQueue.shift()')
    expect(source).toContain('enqueuePost("tool.call"')
    expect(source).not.toContain('await post("tool.call"')
    expect(source).not.toContain('postQueue = postQueue.then')
    expect(source).toContain('process.env.ZKYQ_PANE_KEY')
    expect(source).toContain('process.env.ZKYQ_AGENT_HOOK_ENDPOINT')
  })

  it('does not overwrite an existing user-authored Amp plugin file', () => {
    const pluginPath = _internals.getPluginPath()
    mkdirSync(dirname(pluginPath), { recursive: true })
    writeFileSync(pluginPath, 'export default function userPlugin() {}\n', 'utf-8')

    const status = new AmpHookService().install()

    expect(status).toMatchObject({
      agent: 'amp',
      state: 'partial',
      managedHooksPresent: false
    })
    expect(readFileSync(pluginPath, 'utf-8')).toBe('export default function userPlugin() {}\n')
  })

  it('removes only Orca-managed Amp plugin files', () => {
    const service = new AmpHookService()
    const installed = service.install()
    expect(existsSync(installed.configPath)).toBe(true)

    const removed = service.remove()

    expect(removed.state).toBe('not_installed')
    expect(existsSync(installed.configPath)).toBe(false)

    const pluginPath = _internals.getPluginPath()
    mkdirSync(dirname(pluginPath), { recursive: true })
    writeFileSync(pluginPath, 'export default function userPlugin() {}\n', 'utf-8')

    const skipped = service.remove()

    expect(skipped.state).toBe('partial')
    expect(existsSync(pluginPath)).toBe(true)
  })

  it('reports partial for stale managed plugin content missing required handlers', () => {
    const pluginPath = _internals.getPluginPath()
    mkdirSync(dirname(pluginPath), { recursive: true })
    writeFileSync(pluginPath, `// ${_internals.AMP_PLUGIN_MARKER}\n`, 'utf-8')

    const status = new AmpHookService().getStatus()

    expect(status).toMatchObject({
      agent: 'amp',
      state: 'partial',
      managedHooksPresent: true
    })
    expect(status.detail).toContain('missing required handlers')
  })

  it('reports partial when a stale managed plugin is missing the session reset handler', () => {
    const pluginPath = _internals.getPluginPath()
    mkdirSync(dirname(pluginPath), { recursive: true })
    writeFileSync(
      pluginPath,
      [
        `// ${_internals.AMP_PLUGIN_MARKER}`,
        "amp.on('agent.start', () => {})",
        "amp.on('tool.call', () => {})",
        "amp.on('tool.result', () => {})",
        "amp.on('agent.end', () => {})",
        '/hook/amp',
        ''
      ].join('\n'),
      'utf-8'
    )

    const status = new AmpHookService().getStatus()

    expect(status).toMatchObject({
      agent: 'amp',
      state: 'partial',
      managedHooksPresent: true
    })
    expect(status.detail).toContain('missing required handlers')
  })
})
