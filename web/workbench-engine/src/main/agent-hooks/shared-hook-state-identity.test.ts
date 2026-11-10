import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { runProcess } from '@orca/process-host'
import { wrapPosixHookCommand } from './posix-hook-command'
import type * as Os from 'node:os'

const { home } = vi.hoisted(() => ({ home: vi.fn<() => string>() }))
vi.mock('node:os', async (original) => ({ ...(await original<typeof Os>()), homedir: home }))
import { getSharedManagedScriptPath } from './installer-utils'
import { refreshManagedScriptIfPresent } from './managed-hook-script-refresh'
import {
  hasLivePeer,
  registerGrokHookOwner,
  releaseGrokHookOwnerAndCheckForPeers
} from '../grok/grok-hook-owners'
import { applyManagedDshPatch, removeManagedDshPatch } from '../dsh/dsh-home-patch'
import { serializeMuseSettings } from '../muse/hook-config-json'
import { MuseHookService } from '../muse/hook-service'
import { getMuseConfigPath, getMuseManagedHooksPath } from '../muse/hook-settings'

it.each(['ZKYQ', 'ORCA', 'absent'])(
  'keeps the shared POSIX registration usable by a %s pane',
  async (prefix) => {
    const script = join(dir, 'grok-hook.sh')
    writeFileSync(script, '#!/bin/sh\nprintf "fixture-invoked\\n"\n', { mode: 0o755 })
    const command = wrapPosixHookCommand(script, {}, { requiredEnvVar: 'ZKYQ_PANE_KEY' })
    const shell =
      process.platform === 'win32'
        ? resolve(
            execFileSync('git', ['--exec-path'], { encoding: 'utf8', windowsHide: true }).trim(),
            '../../../bin/bash.exe'
          )
        : '/bin/sh'
    const env = { ...process.env }
    delete env.ZKYQ_PANE_KEY
    delete env.ORCA_PANE_KEY
    if (prefix !== 'absent') env[`${prefix}_PANE_KEY`] = 'fixture:leaf'
    const result = await runProcess({
      program: shell,
      args: ['-c', command],
      env,
      input: '',
      timeoutMs: 5000
    })
    expect(result).toMatchObject({
      code: 0,
      timedOut: false,
      stdout: prefix === 'absent' ? '' : 'fixture-invoked\n'
    })
  }
)

it('migrates the exact old Muse pointer through installation and preserves the user settings', () => {
  vi.stubEnv('XDG_CONFIG_HOME', join(dir, 'config'))
  try {
    const config = getMuseConfigPath()
    const oldHooks = join(dir, '.orca', 'agent-hooks', 'muse-hooks.json')
    mkdirSync(join(dir, 'config', 'muse'), { recursive: true })
    mkdirSync(join(dir, '.orca', 'agent-hooks'), { recursive: true })
    writeFileSync(oldHooks, '{"legacy":"preserved"}\n')
    writeFileSync(
      config,
      JSON.stringify({
        schema_version: 1,
        custom: true,
        managed_hooks_path: oldHooks,
        managed_hooks_env_vars: ['ORCA_AGENT_HOOK_TOKEN', 'USER_VAR']
      })
    )
    expect(new MuseHookService().install().state).toBe('installed')
    const value = JSON.parse(readFileSync(config, 'utf8'))
    expect(value.managed_hooks_path).toBe(getMuseManagedHooksPath())
    expect(value.custom).toBe(true)
    expect(value.managed_hooks_env_vars).toContain('USER_VAR')
    expect(value.managed_hooks_env_vars).not.toContain('ORCA_AGENT_HOOK_TOKEN')
    expect(readFileSync(oldHooks, 'utf8')).toBe('{"legacy":"preserved"}\n')
  } finally {
    vi.unstubAllEnvs()
  }
})

it('refreshes an existing legacy script when the CLI is absent without creating a legacy entry', async () => {
  const current = join(dir, '.zkyq', 'agent-hooks', 'claude-hook.sh')
  const old = join(dir, '.orca', 'agent-hooks', 'claude-hook.sh')
  expect(await refreshManagedScriptIfPresent(current, 'current-body\n')).toBe(false)
  expect(existsSync(current)).toBe(false)
  expect(existsSync(old)).toBe(false)
  mkdirSync(join(dir, '.orca', 'agent-hooks'), { recursive: true })
  writeFileSync(old, 'legacy-body\n')
  expect(await refreshManagedScriptIfPresent(current, 'current-body\n')).toBe(true)
  expect(readFileSync(old, 'utf8')).toBe('current-body\n')
  expect(existsSync(current)).toBe(false)
})

it('upgrades and deduplicates both DSH block formats without consuming user rows or orphan markers', () => {
  const user = '- user-owned: true\n'
  const old =
    '# >>> orca-managed-dsh-hooks (managed by Orca; do not edit) >>>\n- old-managed: true\n# <<< orca-managed-dsh-hooks <<<\n'
  const current = applyManagedDshPatch('', '/fixture/.zkyq/agent-hooks/dsh-hooks.json')!
  const source = old + user + current
  const upgraded = applyManagedDshPatch(source, '/fixture/.zkyq/agent-hooks/dsh-hooks.json')!
  expect(upgraded).toContain(user)
  expect(upgraded).not.toContain('orca-managed-dsh-hooks')
  expect(upgraded.match(/zkyq-managed-dsh-hooks \(managed by/g)).toHaveLength(1)
  expect(removeManagedDshPatch(source).text).toBe(user)
  const orphan = '# >>> orca-managed-dsh-hooks (managed by Orca; do not edit) >>>\n' + user
  expect(applyManagedDshPatch(orphan + current, '/fixture/new.json')).toContain(orphan)
})

it('renames only platform-owned Muse allowlist entries while keeping user fields and comments', () => {
  const source =
    '{\n// user comment\n"custom": true, "managed_hooks_env_vars": ["ORCA_AGENT_HOOK_TOKEN", "USER_VAR", "ORCA_USER_CHOICE"]\n}'
  const output = serializeMuseSettings(source, '/fixture/.zkyq/agent-hooks/muse-hooks.json')
  expect(output).toContain('// user comment')
  expect(output).toContain('"custom": true')
  expect(output).not.toContain('"ORCA_AGENT_HOOK_TOKEN"')
  expect(output).toContain('"ZKYQ_AGENT_HOOK_TOKEN"')
  expect(output).toContain('"USER_VAR"')
  expect(output).toContain('"ORCA_USER_CHOICE"')
})

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'zkyq-hook-state-'))
  home.mockReturnValue(dir)
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

it('retains the installed statusline choice and leaves other legacy files untouched', () => {
  const oldRoot = join(dir, '.orca', 'agent-hooks')
  mkdirSync(oldRoot, { recursive: true })
  writeFileSync(join(oldRoot, 'claude-statusline.installed'), 'installed\n')
  writeFileSync(join(oldRoot, 'user-notes.txt'), 'user-owned\n')
  writeFileSync(join(oldRoot, 'dsh-hooks.json'), '{"fixture":"unchanged"}\n')
  const marker = getSharedManagedScriptPath('claude-statusline.installed')
  expect(marker).toBe(join(dir, '.zkyq', 'agent-hooks', 'claude-statusline.installed'))
  expect(readFileSync(marker, 'utf8')).toBe('installed\n')
  expect(readFileSync(join(oldRoot, 'claude-statusline.installed'), 'utf8')).toBe('installed\n')
  expect(existsSync(getSharedManagedScriptPath('user-notes.txt'))).toBe(false)
  expect(existsSync(getSharedManagedScriptPath('dsh-hooks.json'))).toBe(false)
  writeFileSync(marker, 'current-choice\n')
  expect(readFileSync(getSharedManagedScriptPath('claude-statusline.installed'), 'utf8')).toBe(
    'current-choice\n'
  )
})

it('counts a live legacy owner without moving or pruning its record', async () => {
  const old = join(dir, '.orca', 'agent-hooks', 'grok-owners')
  mkdirSync(old, { recursive: true })
  const token = '11111111-1111-4111-8111-111111111111'
  const file = join(old, `owner-${token}.json`)
  const bytes = JSON.stringify({ token, pid: process.pid })
  writeFileSync(file, bytes)
  registerGrokHookOwner()
  const current = join(dir, '.zkyq', 'agent-hooks', 'grok-owners')
  expect(readdirSync(current)).toHaveLength(1)
  expect(await releaseGrokHookOwnerAndCheckForPeers()).toBe(true)
  expect(readFileSync(file, 'utf8')).toBe(bytes)
  expect(await hasLivePeer(old, 'other-owner', async () => false, false)).toBe(false)
  expect(readFileSync(file, 'utf8')).toBe(bytes)
})
