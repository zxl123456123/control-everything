import { afterEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import {
  buildGuestInstallScript,
  buildGuestLaunchScript,
  buildWslRelaySpawnEnv
} from './wsl-hook-relay-launch'
import {
  WSL_HOOK_RELAY_DIR,
  WSL_HOOK_RELAY_ENDPOINT_FILE,
  WSL_HOOK_RELAY_INSTANCE_ENV,
  WSL_HOOK_RELAY_RETIRED_READERS_ENV,
  WSL_HOOK_RELAY_VERSION_ENV
} from '../../shared/wsl-hook-relay-contract'
import { wireWslRelayLink, type WslRelayLinkOptions } from './wsl-hook-relay-link'
import { AGENT_HOOK_NOTIFICATION_METHOD } from '../../shared/agent-hook-relay'
import { getEndpointFileName } from '../../shared/agent-hook-listener/endpoint-publication'
import { RELAY_SENTINEL as HOST_RELAY_SENTINEL } from '../ssh/remote-exec/remote-frame-protocol'
import { RELAY_SENTINEL as GUEST_RELAY_SENTINEL } from '../../wsl-guest/protocol'

afterEach(() => vi.unstubAllEnvs())

it('agrees on the current readiness marker at both ends of the WSL stream', () => {
  expect(HOST_RELAY_SENTINEL).toBe('ZKYQ-RELAY v0.1.0 READY\n')
  expect(GUEST_RELAY_SENTINEL).toBe(HOST_RELAY_SENTINEL)
})

it('names the endpoint actually published by the POSIX guest', () => {
  expect(WSL_HOOK_RELAY_ENDPOINT_FILE).toBe(getEndpointFileName().replace(/\.cmd$/, '.env'))
})

it('starts the current cache and launcher with current version and instance names', () => {
  expect(WSL_HOOK_RELAY_DIR).toBe('.zkyq-wsl/hook-relay')
  expect(WSL_HOOK_RELAY_VERSION_ENV).toBe('ZKYQ_WSL_HOOK_RELAY_VERSION')
  expect(WSL_HOOK_RELAY_INSTANCE_ENV).toBe('ZKYQ_WSL_HOOK_INSTANCE')
  const script = buildGuestInstallScript(Buffer.from('fixture bundle'), '1.2.3')
  expect(script).toContain('ZKYQ_EOF_BUNDLE')
  expect(script).toContain('ZKYQ_EOF_LAUNCH')
  expect(script).not.toMatch(/ORCA_EOF|\.orca-wsl/)
  expect(buildGuestLaunchScript('1.2.3')).toContain('$ZKYQ_WSL_HOOK_RELAY_VERSION')
})

it('migrates inherited relay keys before authoritative launch values and preserves WSL flags', () => {
  vi.stubEnv('ORCA_WSL_HOOK_RELAY_VERSION', 'old-version')
  vi.stubEnv('ORCA_WSL_HOOK_INSTANCE', 'old-instance')
  vi.stubEnv('ORCA_WSL_HOOK_RELAY_DEBUG', '1')
  vi.stubEnv(
    'WSLENV',
    'ORCA_WSL_HOOK_RELAY_VERSION/u:ORCA_WSL_HOOK_INSTANCE/u:ORCA_WSL_HOOK_RELAY_DEBUG/u:PUBLIC/p'
  )
  const env = buildWslRelaySpawnEnv(
    { ZKYQ_AGENT_HOOK_PORT: '1234', ZKYQ_AGENT_HOOK_TOKEN: 'fixture-token' },
    'current-version',
    'current-instance'
  )
  expect(env).toMatchObject({
    ZKYQ_WSL_HOOK_RELAY_VERSION: 'current-version',
    ZKYQ_WSL_HOOK_INSTANCE: 'current-instance',
    ZKYQ_WSL_HOOK_RELAY_DEBUG: '1'
  })
  for (const key of [
    'ORCA_WSL_HOOK_RELAY_VERSION',
    'ORCA_WSL_HOOK_INSTANCE',
    'ORCA_WSL_HOOK_RELAY_DEBUG'
  ])
    expect(env).not.toHaveProperty(key)
  expect(env.WSLENV).not.toContain('ORCA_WSL_HOOK_')
  expect(env.WSLENV).toContain('ZKYQ_WSL_HOOK_RELAY_VERSION/u')
  expect(env.WSLENV).toContain('ZKYQ_WSL_HOOK_INSTANCE/u')
  expect(env.WSLENV).toContain('PUBLIC/p')
})

it.each([false, true])(
  'overwrites inherited retirement evidence with host proof: %s',
  (confirmed) => {
    vi.stubEnv(WSL_HOOK_RELAY_RETIRED_READERS_ENV, confirmed ? '0' : '1')
    vi.stubEnv('WSLENV', `${WSL_HOOK_RELAY_RETIRED_READERS_ENV}/u:PUBLIC/p`)
    const env = buildWslRelaySpawnEnv({}, 'fixture', 'fixture', confirmed)
    expect(env[WSL_HOOK_RELAY_RETIRED_READERS_ENV]).toBe(confirmed ? '1' : '0')
    expect(
      env.WSLENV?.split(':').filter((entry) => entry.startsWith(WSL_HOOK_RELAY_RETIRED_READERS_ENV))
    ).toEqual([`${WSL_HOOK_RELAY_RETIRED_READERS_ENV}/u`])
    expect(env.WSLENV).toContain('PUBLIC/p')
  }
)

it('clears inherited retirement evidence unless the host explicitly confirms it', () => {
  vi.stubEnv(WSL_HOOK_RELAY_RETIRED_READERS_ENV, '1')
  expect(buildWslRelaySpawnEnv({}, 'fixture', 'fixture')[WSL_HOOK_RELAY_RETIRED_READERS_ENV]).toBe(
    '0'
  )
})

it('keeps forwarding events when diagnostics use the current debug flag', () => {
  vi.stubEnv('ZKYQ_WSL_HOOK_RELAY_DEBUG', '1')
  let notification = (_method: string, _params: unknown) => {}
  const warn = vi.fn()
  const ingest = vi.fn()
  wireWslRelayLink({
    mux: {
      onNotification: (handler: typeof notification) => (notification = handler),
      onDispose: () => {},
      dispose: vi.fn()
    } as unknown as WslRelayLinkOptions['mux'],
    child: Object.assign(new EventEmitter(), {
      kill: vi.fn()
    }) as unknown as WslRelayLinkOptions['child'],
    distro: 'fixture',
    warn,
    ingest,
    onDead: vi.fn()
  })
  const envelope = { paneKey: 'fixture-pane', payload: { state: 'working' } }
  notification(AGENT_HOOK_NOTIFICATION_METHOD, envelope)
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('fixture-pane'))
  expect(ingest).toHaveBeenCalledWith(envelope, 'wsl:fixture')
})
