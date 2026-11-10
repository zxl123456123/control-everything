import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { createManagedHookLocalFilesystem } from '../agent-hooks/managed-hook-local-filesystem.test-fixture'
import { HermesHookService } from './hook-service'
import { RETIRED_HERMES_PLUGIN_MARKER } from './hermes-managed-plugin-source'

describe('Hermes remote installer through a local filesystem adapter (no SSH)', () => {
  let directory: string
  let configPath: string
  const service = new HermesHookService()

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'orca-hermes-remote-adapter-'))
    mkdirSync(join(directory, '.hermes'))
    configPath = join(directory, '.hermes', 'config.yaml')
  })
  afterEach(() => rmSync(directory, { recursive: true, force: true }))

  it('does not rewrite a configured CRLF file or an existing backup', async () => {
    const initial = '# operator notes\r\nplugins:\r\n  enabled: [zeta, zkyq-status, alpha]\r\n'
    writeFileSync(configPath, initial)
    writeFileSync(`${configPath}.bak`, 'recovery point')
    const before = statSync(configPath)
    expect((await service.installRemote(createManagedHookLocalFilesystem(), directory)).state).toBe(
      'installed'
    )
    expect(readFileSync(configPath, 'utf8')).toBe(initial)
    const after = statSync(configPath)
    expect([after.ino, after.mtimeMs, after.mode]).toEqual([
      before.ino,
      before.mtimeMs,
      before.mode
    ])
    expect(readFileSync(`${configPath}.bak`, 'utf8')).toBe('recovery point')
  })

  it.each(['\n', '\r\n'])(
    'preserves comments and parsed values during real install (%j)',
    async (eol) => {
      const input =
        '# notes\nmodel: "001"\nprompt: |\n  First\n  Second\nplugins:\n  enabled: [other]\n'.replaceAll(
          '\n',
          eol
        )
      writeFileSync(configPath, input)
      const filesystem = createManagedHookLocalFilesystem()
      expect((await service.installRemote(filesystem, directory)).state).toBe('installed')
      const installed = readFileSync(configPath, 'utf8')
      expect(installed).toContain('# notes')
      expect(installed).toContain(`prompt: |${eol}  First${eol}  Second`)
      expect(parse(installed)).toEqual({
        ...parse(input),
        plugins: { enabled: ['other', 'zkyq-status'] }
      })
      const before = statSync(configPath)
      expect((await service.installRemote(filesystem, directory)).state).toBe('installed')
      expect(statSync(configPath).ino).toBe(before.ino)
      expect(existsSync(`${configPath}.bak`)).toBe(false)
    }
  )

  it.skipIf(process.platform === 'win32').each([0o600, 0o640])(
    'preserves mode %i despite umask',
    async (mode) => {
      writeFileSync(configPath, 'model: fixture\n')
      chmodSync(configPath, mode)
      const previous = process.umask(0o077)
      try {
        expect(
          (await service.installRemote(createManagedHookLocalFilesystem(), directory)).state
        ).toBe('installed')
      } finally {
        process.umask(previous)
      }
      expect(statSync(configPath).mode & 0o777).toBe(mode)
    }
  )

  it.each(['plugins: [', 'plugins: unexpected\n', 'plugins:\n  enabled: [123]\n'])(
    'refuses unsafe YAML before writing plugin files (%s)',
    async (input) => {
      writeFileSync(configPath, input)
      expect(
        (await service.installRemote(createManagedHookLocalFilesystem(), directory)).state
      ).toBe('error')
      expect(readFileSync(configPath, 'utf8')).toBe(input)
      expect(readdirSync(join(directory, '.hermes'))).toEqual(['config.yaml'])
    }
  )

  it('keeps the config and cleans staged files when remote rename fails', async () => {
    writeFileSync(configPath, 'model: fixture\n')
    const filesystem = createManagedHookLocalFilesystem()
    const rename = filesystem.ext_openssh_rename.bind(filesystem)
    filesystem.ext_openssh_rename = (source, destination, callback) => {
      if (resolve(destination) === resolve(configPath)) {
        callback(new Error('fixture rename refusal'))
      } else {
        rename(source, destination, callback)
      }
    }
    expect((await service.installRemote(filesystem, directory)).state).toBe('error')
    expect(readFileSync(configPath, 'utf8')).toBe('model: fixture\n')
    expect(readdirSync(join(directory, '.hermes')).sort()).toEqual(['config.yaml', 'plugins'])
  })

  function writeRetiredPlugin(): string {
    const plugin = join(directory, '.hermes', 'plugins', 'orca-status')
    mkdirSync(plugin, { recursive: true })
    writeFileSync(
      join(plugin, 'plugin.yaml'),
      `# ${RETIRED_HERMES_PLUGIN_MARKER}\r\nname: orca-status\r\n`
    )
    writeFileSync(
      join(plugin, '__init__.py'),
      `# ${RETIRED_HERMES_PLUGIN_MARKER}\r\n# operator edit 中文\r\n`
    )
    writeFileSync(join(plugin, 'operator-data.txt'), 'preserve this data')
    return plugin
  }

  it('migrates the remote directory, manifest and enablement together while preserving original bytes', async () => {
    const retired = writeRetiredPlugin()
    const previous = readFileSync(join(retired, '__init__.py'))
    writeFileSync(
      configPath,
      '# keep notes\r\nplugins:\r\n  enabled: [other, orca-status, zkyq-status, last]\r\n  disabled: [orca-status]\r\n'
    )
    const adapter = createManagedHookLocalFilesystem()
    expect((await service.installRemote(adapter, directory)).state).toBe('installed')
    expect(readdirSync(join(directory, '.hermes', 'plugins'))).toEqual(['zkyq-status'])
    const root = join(directory, '.hermes', '.zkyq-retired-plugins')
    const archive = join(root, readdirSync(root)[0])
    expect(readFileSync(join(archive, '__init__.py'))).toEqual(previous)
    expect(readFileSync(join(archive, 'operator-data.txt'), 'utf8')).toBe('preserve this data')
    const config = readFileSync(configPath, 'utf8')
    expect(config).toContain('# keep notes\r\n')
    expect(parse(config).plugins).toEqual({
      enabled: ['other', 'zkyq-status', 'last'],
      disabled: []
    })
    const current = join(directory, '.hermes', 'plugins', 'zkyq-status', '__init__.py')
    const before = statSync(current).mtimeMs
    expect((await service.installRemote(adapter, directory)).state).toBe('installed')
    expect(statSync(current).mtimeMs).toBe(before)
    expect(readFileSync(configPath, 'utf8')).toBe(config)
    expect(readdirSync(root)).toHaveLength(1)
  })

  it.each(['zkyq-status', 'orca-status'])(
    'protects unmarked remote %s files before any mutation',
    async (name) => {
      writeRetiredPlugin()
      const plugin = join(directory, '.hermes', 'plugins', name)
      mkdirSync(plugin, { recursive: true })
      writeFileSync(join(plugin, '__init__.py'), '# user supplied')
      const original = 'plugins:\n  enabled: [orca-status]\n'
      writeFileSync(configPath, original)
      const status = await service.installRemote(createManagedHookLocalFilesystem(), directory)
      expect(status.state).toBe('error')
      expect(status.detail).toContain('user-managed')
      expect(readFileSync(join(plugin, '__init__.py'), 'utf8')).toBe('# user supplied')
      expect(readFileSync(configPath, 'utf8')).toBe(original)
      expect(existsSync(join(directory, '.hermes', '.zkyq-retired-plugins'))).toBe(false)
    }
  )

  it.each(['zkyq-status', 'orca-status'])(
    'protects a remote directory link at %s',
    async (name) => {
      const plugins = join(directory, '.hermes', 'plugins')
      mkdirSync(plugins)
      const link = join(plugins, name)
      symlinkSync(join(directory, 'missing-target'), link, 'junction')
      expect(
        (await service.installRemote(createManagedHookLocalFilesystem(), directory)).state
      ).toBe('error')
      expect(lstatSync(link).isSymbolicLink()).toBe(true)
      expect(existsSync(configPath)).toBe(false)
    }
  )

  it.each(['__init__.py', 'config.yaml', 'archive'])(
    'keeps the old active plugin and config when remote %s publication fails',
    async (failure) => {
      const retired = writeRetiredPlugin()
      const original = readFileSync(join(retired, '__init__.py'))
      const config = 'plugins:\n  enabled: [orca-status]\n'
      writeFileSync(configPath, config)
      const adapter = createManagedHookLocalFilesystem()
      const rename = adapter.ext_openssh_rename.bind(adapter)
      adapter.ext_openssh_rename = (source, destination, callback) => {
        if (
          failure === 'archive'
            ? destination.includes('/.zkyq-retired-plugins/')
            : destination.endsWith(`/${failure}`)
        ) {
          callback(new Error('fixture publishing refusal'))
        } else {
          rename(source, destination, callback)
        }
      }
      const status = await service.installRemote(adapter, directory)
      expect(status).toMatchObject({ state: 'error', detail: 'fixture publishing refusal' })
      expect(readFileSync(join(retired, '__init__.py'))).toEqual(original)
      expect(readFileSync(configPath, 'utf8')).toBe(config)
      expect(readFileSync(join(retired, 'operator-data.txt'), 'utf8')).toBe('preserve this data')
    }
  )
})
