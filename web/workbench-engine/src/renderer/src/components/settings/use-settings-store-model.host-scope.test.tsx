// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGlobalSettingsFixture } from '../../../../shared/global-settings-test-fixture'
import {
  projectAgentLaunchSettings,
  type AgentLaunchSettingsMutation
} from '../../../../shared/agent-launch-settings'
import { useSettingsStoreModel } from './use-settings-store-model'
import { AgentLaunchSettingsSection } from './AgentLaunchSettingsSection'
import { PlatformSettingsContext } from '@/web/platform-settings-navigation'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  read: vi.fn(),
  mutate: vi.fn(),
  update: vi.fn(),
  defaultHost: vi.fn(),
  confirmationScopes: [] as Array<{ signal: AbortSignal; visible: boolean }>
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))
vi.mock('@/store/selectors', () => ({
  useProjectHostSetupProjection: () => ({ projects: [], setups: [] })
}))
vi.mock('@/components/terminal-pane/use-system-prefers-dark', () => ({
  useSystemPrefersDark: () => true
}))
vi.mock('@/components/terminal-pane/pane-helpers', () => ({
  isMacUserAgent: () => false,
  isWindowsUserAgent: () => true
}))
vi.mock('@/components/confirmation-dialog-context', () => ({
  useConfirmationDialog: (presentation: { signal: AbortSignal; visible: boolean }) => {
    mocks.confirmationScopes.push(presentation)
    return vi.fn()
  }
}))
vi.mock('@/hooks/useSettingsNavigationMetadata', () => ({ isWebClientLocation: () => true }))
vi.mock('@/hooks/useInstalledAgentSkills', () => ({
  GLOBAL_AGENT_SKILL_SOURCE_KINDS: [],
  useInstalledAgentSkill: () => ({}),
  useInstalledAgentSkillNames: () => ({})
}))
vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({ canUseLocalSkillFreshness: false })
}))
vi.mock('@/hooks/useLinearProviderConnected', () => ({ useLinearProviderConnected: () => false }))
vi.mock('@/hooks/useSkillFreshness', () => ({ useSkillFreshness: () => ({ inventory: null }) }))
vi.mock('./useGhosttyImport', () => ({ useGhosttyImport: () => ({}) }))
vi.mock('./useWarpThemeImport', () => ({ useWarpThemeImport: () => ({}) }))
vi.mock('./agent-launch-settings-transport', () => ({
  readHostAgentLaunchSettings: mocks.read,
  mutateHostAgentLaunchSettings: mocks.mutate,
  hostSupportsAutoPermissions: async () => true,
  hostSupportsNativeChatPermissions: async () => true
}))
vi.mock('./AgentLaunchSettingsCatalog', () => ({
  AgentLaunchSettingsCatalog: ({
    hostName,
    mutate
  }: {
    hostName: string | null
    mutate: (mutation: AgentLaunchSettingsMutation) => Promise<void>
  }) => (
    <button
      onClick={() => {
        void mutate({ type: 'command', agent: 'codex', value: 'fixture-launcher' })
      }}
    >
      Save {hostName ?? 'client'}
    </button>
  )
}))

function Probe() {
  const model = useSettingsStoreModel()
  return (
    <>
      <button
        onClick={() =>
          model.setSettingsHostChoice({ kind: 'environment', environmentId: 'project-host' })
        }
      >
        Open project host
      </button>
      <output>{JSON.stringify(model.settingsHostScope)}</output>
      <AgentLaunchSettingsSection
        settings={model.settings!}
        updateSettings={model.updateSettings}
        hostScope={model.settingsHostScope}
        renderPermissions={() => null}
      />
    </>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.confirmationScopes = []
  mocks.state = {
    settings: createGlobalSettingsFixture({ activeRuntimeEnvironmentId: null }),
    repos: [],
    projects: [],
    projectHostSetups: [],
    settingsProjectHostSelection: {},
    settingsProjectSetupSelection: {},
    runtimeEnvironments: [
      { id: 'project-host', name: 'Project host', createdAt: 1, pairingRevision: 17 },
      { id: 'default-host', name: 'Default host', createdAt: 2, pairingRevision: 18 }
    ],
    runtimeEnvironmentCatalogHydrated: true,
    updateSettings: mocks.update,
    setActiveRuntimeEnvironmentPreference: mocks.defaultHost
  }
  const host = projectAgentLaunchSettings({ agentCmdOverrides: { codex: 'fixture-host-command' } })
  mocks.read.mockResolvedValue(host)
  mocks.mutate.mockResolvedValue(host)
})
afterEach(cleanup)

describe('Web settings host choice through the real model and launch settings section', () => {
  it('retires the live confirmation signal when its exact host or foreground scope changes', () => {
    const scope = { kind: 'global' as const, contextKey: 'trusted', entry: 'development' as const, environmentId: 'project-host' }
    const view = render(<PlatformSettingsContext.Provider value={{ scope, visible: true }}><Probe /></PlatformSettingsContext.Provider>)
    const first = mocks.confirmationScopes.at(-1)!.signal
    expect(first.aborted).toBe(false)
    view.rerender(<PlatformSettingsContext.Provider value={{ scope: { ...scope, environmentId: 'default-host' }, visible: true }}><Probe /></PlatformSettingsContext.Provider>)
    expect(first.aborted).toBe(true)
    const second = mocks.confirmationScopes.at(-1)!.signal
    expect(second.aborted).toBe(false)
    view.rerender(<PlatformSettingsContext.Provider value={{ scope, visible: false }}><Probe /></PlatformSettingsContext.Provider>)
    expect(second.aborted).toBe(true)
    expect(mocks.confirmationScopes.at(-1)!.signal.aborted).toBe(true)
  })
  it('uses the explicit project host despite a different saved default and ignores picker changes', async () => {
    mocks.state.settings = createGlobalSettingsFixture({ activeRuntimeEnvironmentId: 'default-host' })
    const view = render(<PlatformSettingsContext.Provider value={{ scope: { kind: 'project', contextKey: 'trusted',
      platformId: 'p', repoId: 'repo', hostId: 'runtime:project-host', setupId: 'setup', name: 'Project', path: '/p' } }}>
      <Probe />
    </PlatformSettingsContext.Provider>)
    await screen.findByText('Save Project host')
    expect(view.container.querySelector('output')?.textContent).toContain('project-host')
    expect(mocks.read).toHaveBeenCalledWith({ environmentId: 'project-host', pairingRevision: 17 }, expect.any(AbortSignal))
    expect(mocks.defaultHost).not.toHaveBeenCalled()
  })
  it('reads and writes the explicit project host while the client default stays local', async () => {
    render(<Probe />)
    expect(screen.getByText('Save client')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByText('Open project host'))
    })
    const save = await screen.findByText('Save Project host')
    expect(mocks.read).toHaveBeenCalledWith(
      { environmentId: 'project-host', pairingRevision: 17 },
      expect.any(AbortSignal)
    )
    await act(async () => {
      fireEvent.click(save)
    })
    expect(mocks.mutate).toHaveBeenCalledWith(
      { environmentId: 'project-host', pairingRevision: 17 },
      { type: 'command', agent: 'codex', value: 'fixture-launcher' },
      expect.any(AbortSignal)
    )
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.defaultHost).not.toHaveBeenCalled()
  })
  it.each([null, 'default-host'])(
    'keeps the ordinary Web default when no explicit host was chosen: %s',
    async (environmentId) => {
      mocks.state.settings = createGlobalSettingsFixture({
        activeRuntimeEnvironmentId: environmentId
      })
      render(<Probe />)
      if (environmentId) {
        await screen.findByText('Save Default host')
        expect(mocks.read).toHaveBeenCalledWith(
          { environmentId: 'default-host', pairingRevision: 18 },
          expect.any(AbortSignal)
        )
      } else {
        expect(screen.getByText('Save client')).toBeTruthy()
        expect(mocks.read).not.toHaveBeenCalled()
      }
      expect(mocks.defaultHost).not.toHaveBeenCalled()
    }
  )
})
