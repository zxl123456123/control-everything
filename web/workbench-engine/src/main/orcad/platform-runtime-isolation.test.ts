import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ browser: vi.fn(), codex: vi.fn(), adopt: vi.fn(),
  hydrate: vi.fn(), reconcile: vi.fn(), opencode: vi.fn() }))
vi.mock('./orcad-instance-lock', () => ({ acquireOrcadInstanceLock: () => ({
  path: '/fixture/state/orcad.lock', record: { pid: 1, startedAtMs: 1, nonce: 'fixture' }, release: vi.fn() }) }))
vi.mock('../persistence/profile-state/profile-state-access', () => ({ acquireProfileStateRuntimeAdmission: () => ({ release: vi.fn() }) }))
vi.mock('./orcad-browser-startup', () => ({ startOrcadBrowserProvider: mocks.browser }))
vi.mock('../runtime/agent-session-runtime-end-record', () => ({ recordAgentSessionRuntimeEnd: vi.fn() }))
vi.mock('../codex/codex-hook-reconcile', () => ({ startCodexHooks: mocks.codex }))
vi.mock('../agent-hooks/agent-home-login-shell', () => ({ adoptLoginShellAgentHomes: mocks.adopt }))
vi.mock('../agent-hooks/local-agent-cli-presence', () => ({ hydrateAgentCliShellPath: mocks.hydrate }))
vi.mock('../agent-hooks/managed-agent-hook-startup', () => ({ reconcileStartupManagedAgentHooks: mocks.reconcile }))
vi.mock('../opencode/opencode-status-plugin-startup-refresh', () => ({ refreshInstalledOpenCodeStatusPlugins: mocks.opencode }))
import { startOrcadWithHost } from './orcad-lifecycle'
import { startOrcadManagedAgentHooks } from './orcad-managed-agent-hooks'
import { resolveWindowsShellLaunchArgs } from '../providers/windows-shell-args'

describe('isolated platform startup seams', () => {
  beforeEach(() => {
    vi.stubEnv('CE_WORKBENCH_ISOLATED', '1')
    vi.stubEnv('CE_WORKBENCH_ORIGIN', 'http://127.0.0.1:14401')
    mocks.browser.mockReturnValue({ ready: Promise.resolve(), stop: vi.fn(async () => {}) })
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
  it('installs an empty official-EXE resolver at the actual host lifecycle seam', async () => {
    const handle = await startOrcadWithHost('/fixture/state', async () => ({ fixture: true }), vi.fn())
    const options = mocks.browser.mock.calls[0][0]
    expect(await options.resolveInstalledElectronExecutable()).toBeNull()
    await handle.stop()
  })
  it('returns before every automatic hook or login environment action', () => {
    const store = { getSettings: vi.fn(), onSettingsChanged: vi.fn() }
    const enabled = vi.fn()
    startOrcadManagedAgentHooks(store, enabled, vi.fn())
    expect(enabled).toHaveBeenCalledWith(false)
    expect(store.onSettingsChanged).not.toHaveBeenCalled()
    for (const action of [mocks.codex, mocks.adopt, mocks.hydrate, mocks.reconcile, mocks.opencode]) expect(action).not.toHaveBeenCalled()
  })
  it('disables profiles before both supported Windows shells can start', () => {
    const cwd = 'C:/example/fixture'
    expect(resolveWindowsShellLaunchArgs('cmd.exe', cwd, cwd).shellArgs[0]).toBe('/D')
    for (const shell of ['powershell.exe', 'pwsh.exe']) {
      expect(resolveWindowsShellLaunchArgs(shell, cwd, cwd).shellArgs).toContain('-NoProfile')
    }
    expect(() => resolveWindowsShellLaunchArgs('wsl.exe', cwd, cwd)).toThrow('platform_wsl_not_configured')
  })
})
