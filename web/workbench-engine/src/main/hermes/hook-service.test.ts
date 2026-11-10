import { createServer } from 'node:http'
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import {
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
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'

import { makePaneKey } from '../../shared/stable-pane-id'
import { HermesHookService, _internals } from './hook-service'
import {
  RETIRED_HERMES_PLUGIN_MARKER,
  RETIRED_HERMES_PLUGIN_NAME
} from './hermes-managed-plugin-source'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) }
})

const python = process.platform === 'win32' ? 'python' : 'python3'
const pythonAvailable = spawnSync(python, ['--version'], { encoding: 'utf-8' }).status === 0
const hermesAvailable = spawnSync('hermes', ['--version'], { encoding: 'utf-8' }).status === 0

const PANE_KEY = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')

describe('HermesHookService', () => {
  let homeDir: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    previousHermesHome = process.env.HERMES_HOME
    homeDir = mkdtempSync(join(tmpdir(), 'zkyq-hermes-hooks-'))
    process.env.HERMES_HOME = homeDir
  })

  afterEach(() => {
    if (previousHermesHome === undefined) {
      delete process.env.HERMES_HOME
    } else {
      process.env.HERMES_HOME = previousHermesHome
    }
    rmSync(homeDir, { recursive: true, force: true })
  })

  it('installs the managed Hermes plugin and enables it in config.yaml', () => {
    const status = new HermesHookService().install()

    expect(status).toMatchObject({
      agent: 'hermes',
      state: 'installed',
      managedHooksPresent: true,
      detail: null
    })
    const pluginDir = join(homeDir, 'plugins', _internals.HERMES_PLUGIN_NAME)
    expect(readFileSync(join(pluginDir, 'plugin.yaml'), 'utf-8')).toContain('provides_hooks:')
    expect(readFileSync(join(pluginDir, '__init__.py'), 'utf-8')).toContain('/hook/hermes')
    const config = parse(readFileSync(join(homeDir, 'config.yaml'), 'utf-8')) as {
      plugins: { enabled: string[] }
    }
    expect(config.plugins.enabled).toContain(_internals.HERMES_PLUGIN_NAME)
  })

  it('preserves other enabled plugins and removes the managed plugin from disabled list', () => {
    writeFileSync(
      join(homeDir, 'config.yaml'),
      [
        'model: test-model',
        'plugins:',
        '  enabled:',
        '    - disk-cleanup',
        '  disabled:',
        `    - ${_internals.HERMES_PLUGIN_NAME}`,
        ''
      ].join('\n'),
      'utf-8'
    )

    new HermesHookService().install()

    const config = parse(readFileSync(join(homeDir, 'config.yaml'), 'utf-8')) as {
      model: string
      plugins: { enabled: string[]; disabled: string[] }
    }
    expect(config.model).toBe('test-model')
    expect(config.plugins.enabled).toEqual(['disk-cleanup', _internals.HERMES_PLUGIN_NAME])
    expect(config.plugins.disabled).toEqual([])
  })

  it('refuses malformed plugin lists during install', () => {
    writeFileSync(
      join(homeDir, 'config.yaml'),
      ['plugins:', '  enabled: "not-a-list"', '  disabled: "not-a-list"', ''].join('\n'),
      'utf-8'
    )

    const status = new HermesHookService().install()

    expect(status.state).toBe('error')
    const config = parse(readFileSync(join(homeDir, 'config.yaml'), 'utf-8')) as {
      plugins: { enabled: string[]; disabled: string[] }
    }
    expect(config.plugins.enabled).toBe('not-a-list')
    expect(config.plugins.disabled).toBe('not-a-list')
  })

  it('reports partial when the plugin exists but is not enabled', () => {
    new HermesHookService().install()
    const update = _internals.updateConfigContent(
      readFileSync(join(homeDir, 'config.yaml'), 'utf-8'),
      _internals.disablePlugin
    )
    expect(update.content).toBeTruthy()
    writeFileSync(join(homeDir, 'config.yaml'), update.content!, 'utf-8')

    const status = new HermesHookService().getStatus()

    expect(status.state).toBe('partial')
    expect(status.detail).toContain('not enabled')
  })

  it.skipIf(!hermesAvailable)(
    'is visible to the real hermes CLI when hermes is installed',
    () => {
      new HermesHookService().install()

      const output = execFileSync('hermes', ['plugins', 'list'], {
        env: { ...process.env, HERMES_HOME: homeDir },
        encoding: 'utf-8',
        timeout: 15_000
      })

      expect(output).toContain(_internals.HERMES_PLUGIN_NAME)
      expect(output.toLowerCase()).toContain('enabled')
    },
    20_000
  )

  it.skipIf(!pythonAvailable)(
    'registered plugin hooks post normalized JSON to Control Everything',
    async () => {
      new HermesHookService().install()

      const received = new Promise<Record<string, unknown>>((resolve, reject) => {
        const server = createServer((req, res) => {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              expect(req.url).toBe('/hook/hermes')
              expect(req.headers['x-zkyq-agent-hook-token']).toBe('token-1')
              res.writeHead(204)
              res.end()
              clearTimeout(timeout)
              server.close()
              resolve(
                JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Record<string, unknown>
              )
            } catch (error) {
              clearTimeout(timeout)
              server.close()
              reject(error)
            }
          })
        })
        const timeout = setTimeout(() => {
          server.close()
          reject(new Error('timed out waiting for Hermes plugin POST'))
        }, 5_000)
        server.listen(0, '127.0.0.1', () => {
          const address = server.address()
          if (!address || typeof address === 'string') {
            server.close()
            reject(new Error('server did not bind to a TCP port'))
            return
          }
          const initPath = join(homeDir, 'plugins', _internals.HERMES_PLUGIN_NAME, '__init__.py')
          const script = [
            'import importlib.util',
            `spec = importlib.util.spec_from_file_location("zkyq_status", ${JSON.stringify(initPath)})`,
            'mod = importlib.util.module_from_spec(spec)',
            'spec.loader.exec_module(mod)',
            'class Ctx:',
            '    def __init__(self): self.hooks = {}',
            '    def register_hook(self, name, callback): self.hooks[name] = callback',
            'ctx = Ctx()',
            'mod.register(ctx)',
            'ctx.hooks["pre_llm_call"](',
            '    session_id="sess-1",',
            '    user_message="make Hermes good",',
            '    is_first_turn=True,',
            '    model="test-model",',
            '    platform="cli",',
            ')'
          ].join('\n')
          // Why: the Python hook POSTs back into this process. A synchronous
          // child process blocks the HTTP server from replying, deadlocking the test.
          execFile(
            python,
            ['-c', script],
            {
              env: {
                ...process.env,
                ZKYQ_AGENT_HOOK_PORT: String(address.port),
                ZKYQ_AGENT_HOOK_TOKEN: 'token-1',
                ZKYQ_AGENT_HOOK_ENDPOINT: '',
                ZKYQ_PANE_KEY: PANE_KEY,
                ZKYQ_TAB_ID: 'tab-1',
                ZKYQ_WORKTREE_ID: 'wt-1',
                ZKYQ_AGENT_HOOK_ENV: 'production',
                ZKYQ_AGENT_HOOK_VERSION: '2'
              },
              encoding: 'utf-8'
            },
            (error) => {
              if (!error) {
                return
              }
              clearTimeout(timeout)
              server.close()
              reject(error)
            }
          )
        })
      })

      await expect(received).resolves.toMatchObject({
        paneKey: PANE_KEY,
        tabId: 'tab-1',
        worktreeId: 'wt-1',
        env: 'production',
        version: '2',
        payload: {
          hook_event_name: 'pre_llm_call',
          prompt: 'make Hermes good',
          user_message: 'make Hermes good'
        }
      })
    }
  )

  it.skipIf(!pythonAvailable)(
    'bounds generated plugin payload normalization before JSON encoding',
    () => {
      new HermesHookService().install()

      const initPath = join(homeDir, 'plugins', _internals.HERMES_PLUGIN_NAME, '__init__.py')
      const script = [
        'import importlib.util, json',
        `spec = importlib.util.spec_from_file_location("zkyq_status", ${JSON.stringify(initPath)})`,
        'mod = importlib.util.module_from_spec(spec)',
        'spec.loader.exec_module(mod)',
        'payload = mod._payload_for_event("post_tool_call", {',
        '    "session_id": "sess-1",',
        '    "tool_name": "BigTool",',
        '    "args": {"long": "x" * 9000, "items": list(range(200))},',
        '    "result": {"text": "y" * 9000, "nested": [{"value": i} for i in range(200)]},',
        '    "duration_ms": 12,',
        '})',
        'print(json.dumps(payload))'
      ].join('\n')

      const output = execFileSync(python, ['-c', script], {
        encoding: 'utf-8',
        timeout: 15_000
      })
      const payload = JSON.parse(output) as {
        args: { long: string; items: unknown[] }
        result: { text: string; nested: unknown[] }
        tool_input: { items: unknown[] }
      }

      expect(payload.args.long).toHaveLength(8192 + '...[truncated]'.length)
      expect(payload.args.long.endsWith('...[truncated]')).toBe(true)
      expect(payload.args.items).toHaveLength(51)
      expect(payload.args.items.at(-1)).toBe('...[truncated]')
      expect(payload.result.text.endsWith('...[truncated]')).toBe(true)
      expect(payload.result.nested).toHaveLength(51)
      expect(payload.tool_input.items).toHaveLength(51)
    }
  )

  function writeRetiredPlugin(): string {
    const directory = join(homeDir, 'plugins', RETIRED_HERMES_PLUGIN_NAME)
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      join(directory, 'plugin.yaml'),
      `# ${RETIRED_HERMES_PLUGIN_MARKER}\r\nname: orca-status\r\n`
    )
    writeFileSync(
      join(directory, '__init__.py'),
      `# ${RETIRED_HERMES_PLUGIN_MARKER}\r\n# retained operator edit 中文\r\n`
    )
    writeFileSync(join(directory, 'operator-data.txt'), 'preserve this data')
    return directory
  }

  it('migrates the old plugin and both lists without duplicate hooks or lost comments', () => {
    const retired = writeRetiredPlugin()
    const previous = readFileSync(join(retired, '__init__.py'))
    const configPath = join(homeDir, 'config.yaml')
    writeFileSync(
      configPath,
      '# operator notes\r\nmodel: "001"\r\nplugins:\r\n  enabled: [other, orca-status, zkyq-status, last] # order\r\n  disabled: [orca-status, zkyq-status, disabled-other]\r\n'
    )
    const service = new HermesHookService()
    expect(service.getStatus()).toMatchObject({ state: 'partial', managedHooksPresent: true })
    expect(service.install().state).toBe('installed')
    expect(readdirSync(join(homeDir, 'plugins'))).toEqual(['zkyq-status'])
    const archived = join(
      homeDir,
      '.zkyq-retired-plugins',
      readdirSync(join(homeDir, '.zkyq-retired-plugins'))[0]
    )
    expect(readFileSync(join(archived, '__init__.py'))).toEqual(previous)
    expect(readFileSync(join(archived, 'operator-data.txt'), 'utf8')).toBe('preserve this data')
    const source = readFileSync(configPath, 'utf8')
    expect(source).toContain('# operator notes\r\nmodel: "001"\r\n')
    expect(source).toContain('# order')
    expect(parse(source).plugins).toEqual({
      enabled: ['other', 'zkyq-status', 'last'],
      disabled: ['disabled-other']
    })
    const init = join(homeDir, 'plugins', 'zkyq-status', '__init__.py')
    const before = statSync(init).mtimeMs
    expect(service.install().state).toBe('installed')
    expect(statSync(init).mtimeMs).toBe(before)
    expect(readFileSync(configPath, 'utf8')).toBe(source)
    expect(readdirSync(join(homeDir, '.zkyq-retired-plugins'))).toHaveLength(1)
  })

  it.each(['zkyq-status', 'orca-status'])(
    'protects an unmarked %s plugin before changing config or files',
    (name) => {
      writeRetiredPlugin()
      const plugin = join(homeDir, 'plugins', name)
      mkdirSync(plugin, { recursive: true })
      writeFileSync(join(plugin, '__init__.py'), '# user supplied plugin')
      const config = 'plugins:\n  enabled: [other, orca-status]\n'
      writeFileSync(join(homeDir, 'config.yaml'), config)
      const status = new HermesHookService().install()
      expect(status.state).toBe('error')
      expect(status.detail).toContain('user-managed')
      expect(readFileSync(join(plugin, '__init__.py'), 'utf8')).toBe('# user supplied plugin')
      expect(readFileSync(join(homeDir, 'config.yaml'), 'utf8')).toBe(config)
      expect(existsSync(join(homeDir, '.zkyq-retired-plugins'))).toBe(false)
    }
  )

  it('protects a dangling plugin directory link', () => {
    const retired = writeRetiredPlugin()
    const plugin = join(homeDir, 'plugins', 'zkyq-status')
    symlinkSync(join(homeDir, 'missing-target'), plugin, 'junction')
    expect(new HermesHookService().install().state).toBe('error')
    expect(lstatSync(plugin).isSymbolicLink()).toBe(true)
    expect(existsSync(retired)).toBe(true)
  })

  it('restores the original active directory when publishing the new plugin fails', () => {
    const retired = writeRetiredPlugin()
    const previous = readFileSync(join(retired, '__init__.py'))
    const config = 'plugins:\n  enabled: [orca-status]\n'
    writeFileSync(join(homeDir, 'config.yaml'), config)
    const write = vi.mocked(writeFileSync).getMockImplementation()!
    vi.mocked(writeFileSync).mockImplementation((...args) => {
      if (String(args[0]) === join(homeDir, 'plugins', 'zkyq-status', '__init__.py'))
        throw new Error('fixture publishing refusal')
      return write(...args)
    })
    try {
      expect(() => new HermesHookService().install()).toThrow('fixture publishing refusal')
    } finally {
      vi.mocked(writeFileSync).mockImplementation(write)
    }
    expect(readFileSync(join(retired, '__init__.py'))).toEqual(previous)
    expect(readFileSync(join(homeDir, 'config.yaml'), 'utf8')).toBe(config)
    expect(readdirSync(join(homeDir, '.zkyq-retired-plugins'))).toEqual([])
  })

  it('unregisters both identities and preserves all directory contents outside auto-load on removal', () => {
    const service = new HermesHookService()
    service.install()
    writeRetiredPlugin()
    writeFileSync(
      join(homeDir, 'config.yaml'),
      'plugins:\n  enabled: [other, orca-status, zkyq-status]\n  disabled: [orca-status]\n'
    )
    expect(service.remove().state).toBe('not_installed')
    expect(readdirSync(join(homeDir, 'plugins'))).toEqual([])
    expect(parse(readFileSync(join(homeDir, 'config.yaml'), 'utf8')).plugins).toEqual({
      enabled: ['other'],
      disabled: ['zkyq-status']
    })
    const archives = readdirSync(join(homeDir, '.zkyq-retired-plugins'))
    expect(archives).toHaveLength(2)
    expect(
      archives.some((name) =>
        existsSync(join(homeDir, '.zkyq-retired-plugins', name, 'operator-data.txt'))
      )
    ).toBe(true)
  })
})
