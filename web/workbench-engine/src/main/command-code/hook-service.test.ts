import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { AddressInfo } from 'node:net'

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

import { CommandCodeHookService } from './hook-service'
import { buildCommandCodeManagedScript } from './command-code-managed-script'
import { runProcess } from '@orca/process-host'

import { wrapWindowsBatchHookCommand } from '../agent-hooks/windows-direct-cmd-hook-command'

describe('CommandCodeHookService', () => {
  let homeDir: string

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'orca-command-code-home-'))
    homedirMock.mockReturnValue(homeDir)
  })

  afterEach(() => {
    vi.clearAllMocks()
    rmSync(homeDir, { recursive: true, force: true })
  })

  it('installs the managed command for Command Code status events', () => {
    const status = new CommandCodeHookService().install()

    expect(status.state).toBe('installed')
    expect(status.managedHooksPresent).toBe(true)

    const config = JSON.parse(
      readFileSync(join(homeDir, '.commandcode', 'settings.json'), 'utf8')
    ) as {
      hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]>
    }
    expect(Object.keys(config.hooks).sort()).toEqual(['PostToolUse', 'PreToolUse', 'Stop'].sort())
    expect(config.hooks.PreToolUse[0].matcher).toBe('.*')
    expect(config.hooks.PostToolUse[0].matcher).toBe('.*')
    expect(config.hooks.Stop[0].matcher).toBeUndefined()
    expect(config.hooks.PreToolUse[0].hooks[0].command).toMatch(
      process.platform === 'win32'
        ? wrapWindowsBatchHookCommand(
            join(homeDir, '.zkyq', 'agent-hooks', 'command-code-hook.cmd')
          )
        : /command-code-hook/
    )
    if (process.platform !== 'win32') {
      expect(config.hooks.PreToolUse[0].hooks[0].command).toContain(join(homeDir, '.zkyq'))
    }
    if (process.platform !== 'win32') {
      expect(config.hooks.PreToolUse[0].hooks[0].command).toMatch(/^if \[ -f /)
    }
  })

  // Why: runs on every OS; windows-hook-payload-delivery.test.ts runs each form under Command Code's shell.
  it('registers the Windows batch hook command for every event', () => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    try {
      expect(new CommandCodeHookService().install().state).toBe('installed')
      const command = wrapWindowsBatchHookCommand(
        join(homeDir, '.zkyq', 'agent-hooks', 'command-code-hook.cmd')
      )
      const config = JSON.parse(
        readFileSync(join(homeDir, '.commandcode', 'settings.json'), 'utf8')
      )
      for (const eventName of ['PreToolUse', 'PostToolUse', 'Stop']) {
        expect(config.hooks[eventName][0].hooks[0].command).toBe(command)
      }
    } finally {
      platform.mockRestore()
    }
  })

  it('installs a hook script that can recover the endpoint when Command Code strips token env', () => {
    new CommandCodeHookService().install()

    const scriptFileName =
      process.platform === 'win32' ? 'command-code-hook.cmd' : 'command-code-hook.sh'
    const script = readFileSync(join(homeDir, '.zkyq', 'agent-hooks', scriptFileName), 'utf8')

    if (process.platform === 'win32') {
      expect(script).toContain('sourceEndpointByPort')
      expect(script).toContain('orca-dev\\agent-hooks')
      expect(script).toContain('set ZKYQ_AGENT_HOOK_PORT=')
    } else {
      expect(script).toContain('__orca_read_ancestor_var')
      expect(script).toContain('__orca_fill_from_endpoint_file')
      expect(script).toContain('[ "$__orca_endpoint_port" != "$ZKYQ_AGENT_HOOK_PORT" ]')
      expect(script).toContain('ZKYQ_PANE_KEY')
      expect(script).toContain('ZKYQ_AGENT_LAUNCH_TOKEN')
      expect(script).toContain('orca-dev/agent-hooks')
      expect(script).toContain('endpoint_port=')
    }
  })

  const itPosix = process.platform === 'win32' ? it.skip : it

  itPosix('does not let stale endpoint files clobber recovered connection fields', async () => {
    new CommandCodeHookService().install()

    const staleEndpointPath = join(homeDir, 'stale-endpoint.env')
    writeFileSync(
      staleEndpointPath,
      [
        'ZKYQ_AGENT_HOOK_PORT=9',
        'ZKYQ_AGENT_HOOK_TOKEN=stale-token',
        'ZKYQ_AGENT_HOOK_ENV=development',
        'ZKYQ_AGENT_HOOK_VERSION=2',
        ''
      ].join('\n')
    )

    const requests: { body: string; token: string | string[] | undefined }[] = []
    const server = createServer((req, res) => {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        requests.push({
          body,
          token: req.headers['x-zkyq-agent-hook-token']
        })
        res.statusCode = 204
        res.end()
      })
    })

    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address() as AddressInfo
      const scriptPath = join(homeDir, '.zkyq', 'agent-hooks', 'command-code-hook.sh')
      const child = spawn('/bin/sh', [scriptPath], {
        env: {
          ...process.env,
          HOME: homeDir,
          ZKYQ_AGENT_HOOK_ENDPOINT: staleEndpointPath,
          ZKYQ_AGENT_HOOK_PORT: String(address.port),
          ZKYQ_AGENT_HOOK_TOKEN: 'current-token',
          ZKYQ_PANE_KEY: 'tab:leaf',
          ZKYQ_TAB_ID: 'tab',
          ZKYQ_WORKTREE_ID: 'worktree',
          ZKYQ_AGENT_HOOK_ENV: 'development',
          ZKYQ_AGENT_HOOK_VERSION: '2'
        },
        stdio: ['pipe', 'ignore', 'pipe']
      })
      child.stdin.end(JSON.stringify({ hook_event_name: 'Stop' }))

      const exitCode = await new Promise<number | null>((resolve, reject) => {
        let stderr = ''
        child.stderr.setEncoding('utf8')
        child.stderr.on('data', (chunk) => {
          stderr += chunk
        })
        child.on('error', reject)
        child.on('exit', (code) => {
          if (stderr.trim()) {
            reject(new Error(stderr))
          } else {
            resolve(code)
          }
        })
      })

      expect(exitCode).toBe(0)
      expect(requests).toHaveLength(1)
      expect(requests[0].token).toBe('current-token')
      expect(new URLSearchParams(requests[0].body).get('paneKey')).toBe('tab:leaf')
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('reports partial when one managed event is missing', () => {
    const service = new CommandCodeHookService()
    service.install()

    const configPath = join(homeDir, '.commandcode', 'settings.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      hooks: Record<string, unknown>
    }
    delete config.hooks.Stop
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)

    const status = service.getStatus()

    expect(status.state).toBe('partial')
    expect(status.managedHooksPresent).toBe(true)
    expect(status.detail).toBe('Managed hook missing for events: Stop')
  })

  const recoveryCases = (process.platform === 'win32' ? ['local', 'posix'] : ['posix']).flatMap(
    (target) =>
      [1, 2].flatMap((version) =>
        ['explicit', 'discovery', 'conflict'].map((mode) => ({ target, version, mode }))
      )
  )
  it.each(recoveryCases)(
    'recovers a stripped token via $target/$version/$mode without changing pane ownership',
    async ({ target, version, mode }) => {
      const windows = target === 'local'
      const requests: { token: unknown; body: URLSearchParams }[] = []
      const server = createServer((request, response) => {
        let body = ''
        request.setEncoding('utf8')
        request.on('data', (chunk) => {
          body += chunk
        })
        request.on('end', () => {
          requests.push({
            token:
              request.headers[
                version === 1 ? 'x-orca-agent-hook-token' : 'x-zkyq-agent-hook-token'
              ],
            body: new URLSearchParams(body)
          })
          response.end('{}')
        })
      })
      try {
        await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
        const port = (server.address() as AddressInfo).port
        const userData = join(homeDir, 'state')
        const appData = join(homeDir, 'appdata')
        const configHome = join(homeDir, 'config')
        const endpointRoot =
          version === 2
            ? join(userData, 'agent-hooks')
            : join(windows ? appData : configHome, 'orca', 'agent-hooks')
        mkdirSync(endpointRoot, { recursive: true })
        const endpoint = join(
          endpointRoot,
          `endpoint${version === 2 ? '-v2' : ''}.${windows ? 'cmd' : 'env'}`
        )
        const prefix = version === 1 ? 'ORCA' : 'ZKYQ'
        const fields = [
          'PORT=' + port,
          'TOKEN=fixture-recovery-token',
          'ENV=development',
          'VERSION=' + version
        ]
        const lines = fields.map((field) => `${windows ? 'set ' : ''}${prefix}_AGENT_HOOK_${field}`)
        if (mode === 'conflict')
          lines.push(
            `${windows ? 'set ' : ''}${prefix === 'ORCA' ? 'ZKYQ' : 'ORCA'}_AGENT_HOOK_TOKEN=conflicting-fixture`
          )
        writeFileSync(endpoint, lines.join(windows ? '\r\n' : '\n') + '\n')
        const script = join(homeDir, `command-code-hook.${windows ? 'cmd' : 'sh'}`)
        writeFileSync(script, buildCommandCodeManagedScript(target as 'local' | 'posix'))
        const env = {
          ...process.env,
          HOME: homeDir,
          APPDATA: appData,
          XDG_CONFIG_HOME: configHome,
          ZKYQ_USER_DATA_PATH: userData,
          ZKYQ_AGENT_HOOK_PORT: String(port),
          ZKYQ_AGENT_HOOK_TOKEN: '',
          ZKYQ_PANE_KEY: 'recovery:leaf',
          ZKYQ_AGENT_HOOK_ENDPOINT: mode === 'discovery' ? '' : endpoint
        }
        const shell =
          process.platform === 'win32'
            ? resolve(
                execFileSync('git', ['--exec-path'], {
                  encoding: 'utf8',
                  windowsHide: true
                }).trim(),
                '../../../bin/bash.exe'
              )
            : '/bin/sh'
        const result = await runProcess({
          program: windows ? script : shell,
          args: windows ? [] : [script],
          env,
          input: '{"hook_event_name":"Stop"}\n',
          timeoutMs: 15000
        })
        expect(result).toMatchObject({ code: 0, timedOut: false })
        if (mode === 'conflict') expect(requests).toHaveLength(0)
        else {
          expect(requests).toHaveLength(1)
          expect(requests[0].token).toBe('fixture-recovery-token')
          expect(requests[0].body.get('paneKey')).toBe('recovery:leaf')
          expect(requests[0].body.get('version')).toBe(String(version))
        }
      } finally {
        await new Promise<void>((closed) => server.close(() => closed()))
      }
    }
  )
})
