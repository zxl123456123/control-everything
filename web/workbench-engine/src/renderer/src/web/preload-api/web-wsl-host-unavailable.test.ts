import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installBrowserGlobals } from '../web-preload-api-test-harness'

const calls = vi.hoisted(() => ({
  getState: vi.fn(() => ({ settings: { experimentalWslHosts: false } })),
  subscribe: vi.fn(() => () => undefined),
  runtimeCall: vi.fn()
}))

vi.mock('../../store', () => ({
  useAppStore: { getState: calls.getState, subscribe: calls.subscribe }
}))
vi.mock('../../store/workspace-record-selectors', () => ({
  selectFolderWorkspaces: vi.fn(() => [])
}))
vi.mock('./web-runtime-calls', () => ({
  assertEnvironmentPairing: vi.fn(),
  callEnvironmentEnvelope: calls.runtimeCall
}))

async function installRuntimeEnvironmentApi() {
  const { window } = installBrowserGlobals('Windows')
  const { createRuntimeEnvironmentsApi } = await import('./web-runtime-environments-api')
  const { withFallback } = await import('./web-fallback-api')
  const runtimeEnvironments = withFallback(createRuntimeEnvironmentsApi(), ['runtimeEnvironments'])
  Object.assign(window, { api: { runtimeEnvironments } })
  return { runtimeEnvironments }
}

describe('WSL desktop host capability in the paired Web adapter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reports the optional desktop namespace as absent through the fallback proxy', async () => {
    const { runtimeEnvironments: api } = await installRuntimeEnvironmentApi()
    expect(typeof api.wslHosts).toBe('undefined')
    expect(calls.runtimeCall).not.toHaveBeenCalled()
  })

  it('lets the original App bridge observe absent capability without starting or reporting hosts', async () => {
    await installRuntimeEnvironmentApi()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { registerWslHostIpcBridge } = await import('../../hooks/ipc-events/wsl-host-ipc-bridge')
    const unsubs: (() => void)[] = []
    registerWslHostIpcBridge(unsubs)
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(error).not.toHaveBeenCalled()
    expect(warning).not.toHaveBeenCalled()
    expect(unsubs).toEqual([])
    expect(calls.getState).not.toHaveBeenCalled()
    expect(calls.subscribe).not.toHaveBeenCalled()
    expect(calls.runtimeCall).not.toHaveBeenCalled()
  })
})
