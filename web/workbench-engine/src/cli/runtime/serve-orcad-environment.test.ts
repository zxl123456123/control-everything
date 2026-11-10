import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn((_spec: unknown) => ({})) }))
vi.mock('@orca/process-host', () => ({ spawnProcess: spawn, runProcess: vi.fn() }))
vi.mock('./serve-update-supervisor', () => ({ superviseForegroundServe: vi.fn(async () => 0) }))
import { serveWithOrcad } from './serve-orcad-launch'

let slot: string
beforeEach(() => {
  slot = mkdtempSync(join(tmpdir(), 'zkyq-serve-env-'))
  spawn.mockClear()
})
afterEach(() => rmSync(slot, { recursive: true, force: true }))

it.each([0, 1])(
  'launches installed environment version %s without retaining the other product identity',
  async (version) => {
    mkdirSync(join(slot, 'out'))
    writeFileSync(
      join(slot, 'out/package.json'),
      JSON.stringify(version ? { zkyqManagedLaunchEnvironment: 1 } : { version: 'old' })
    )
    const base = {
      ORCA_VERSION: 'inherited-other-slot',
      ORCA_ORCAD_MANAGED_ACTIVATION_ROOT: '/owned/root',
      USER_NOTE: 'preserved'
    }
    await expect(
      serveWithOrcad(
        {
          kind: 'orcad',
          runtime: 'node',
          entry: join(slot, 'orcad-server.js'),
          version: 'selected'
        },
        {},
        '/owned/profile',
        base
      )
    ).resolves.toBe(0)
    const spec = spawn.mock.calls[0]?.[0] as unknown as { env: NodeJS.ProcessEnv }
    expect(spec.env).toMatchObject(
      version
        ? { ZKYQ_VERSION: 'selected', ZKYQ_SERVER_MANAGED_ACTIVATION_ROOT: '/owned/root' }
        : { ORCA_VERSION: 'selected', ORCA_ORCAD_MANAGED_ACTIVATION_ROOT: '/owned/root' }
    )
    expect(spec.env[version ? 'ORCA_VERSION' : 'ZKYQ_VERSION']).toBeUndefined()
    expect(spec.env.USER_NOTE).toBe('preserved')
    expect(spec.env.ZKYQ_USER_DATA).toBe('/owned/profile')
    expect(base.ORCA_VERSION).toBe('inherited-other-slot')
  }
)
it('rejects unknown package environment formats before spawning', () => {
  mkdirSync(join(slot, 'out'))
  writeFileSync(join(slot, 'out/package.json'), '{"zkyqManagedLaunchEnvironment":2}')
  expect(() =>
    serveWithOrcad(
      { kind: 'orcad', runtime: 'node', entry: join(slot, 'orcad-server.js'), version: 'selected' },
      {},
      '/owned/profile',
      {}
    )
  ).toThrow('Unsupported')
  expect(spawn).not.toHaveBeenCalled()
})
