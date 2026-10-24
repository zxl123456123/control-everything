// @vitest-environment happy-dom
import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  projectAgentLaunchSettings,
  type AgentLaunchSettings
} from '../../../../shared/agent-launch-settings'
import { HostAgentLaunchSettings } from './HostAgentLaunchSettings'
import { TooltipProvider } from '../ui/tooltip'
import type { AgentPermissionsRenderer } from './AgentLaunchSettingsCatalog'
import { AgentPermissionsSetting, AgentsPane } from './AgentsPane'
import { useAppStore } from '@/store'
import { applyAgentPermissionMode } from '../../../../shared/tui-agent-permissions'
import { createGlobalSettingsFixture } from '../../../../shared/global-settings-test-fixture'

const transport = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  detection: vi.fn(),
  detectedIds: ['claude'] as string[],
  refresh: vi.fn(),
  auto: vi.fn(),
  native: vi.fn()
}))
vi.mock('./agent-launch-settings-transport', () => ({
  readHostAgentLaunchSettings: transport.read,
  mutateHostAgentLaunchSettings: transport.mutate,
  hostSupportsAutoPermissions: transport.auto,
  hostSupportsNativeChatPermissions: transport.native
}))
vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: (target: unknown) => {
    transport.detection(target)
    return {
      detectedIds: transport.detectedIds,
      detectionFailed: false,
      isRefreshing: false,
      refresh: transport.refresh
    }
  }
}))
const host = () =>
  projectAgentLaunchSettings({
    agentDefaultArgs: { claude: '--host-marker' },
    agentDefaultEnv: { claude: { API_KEY: 'host-secret' } }
  })
const renderPermissions: AgentPermissionsRenderer = ({ onChange }) => (
  <button onClick={() => onChange('manual')}>Manual</button>
)
const pane = (revision: number) => (
  <TooltipProvider>
    <HostAgentLaunchSettings
      key={revision}
      environmentId="ssh-host"
      pairingRevision={revision}
      hostName="SSH host"
      renderPermissions={renderPermissions}
    />
  </TooltipProvider>
)

afterEach(cleanup)
beforeEach(() => {
  transport.read.mockReset().mockResolvedValue(host())
  transport.mutate.mockReset().mockResolvedValue(host())
  transport.detection.mockClear()
  transport.detectedIds = ['claude']
  transport.refresh.mockReset().mockResolvedValue(undefined)
  transport.auto.mockReset().mockResolvedValue(true)
  transport.native.mockReset().mockResolvedValue(true)
})

describe('host launch settings form', () => {
  it('edits enabled undetected agents on the selected host and refreshes detection explicitly', async () => {
    transport.detectedIds = []
    let saved = { ...host(), agentCmdOverrides: { claude: 'C:/example/claude.exe' } }
    transport.read.mockImplementation(async () => saved)
    transport.mutate.mockImplementation(async (_owner, mutation) => {
      if (mutation.type === 'command') saved = { ...saved, agentCmdOverrides: { claude: mutation.value } }
      if (mutation.type === 'arguments') saved = { ...saved, agentDefaultArgs: { claude: mutation.value } }
      return saved
    })
    transport.refresh.mockImplementation(async () => { transport.detectedIds = ['claude'] })
    const desktop = createGlobalSettingsFixture({ agentCmdOverrides: { claude: 'desktop-command' } })
    useAppStore.setState({ settings: desktop })
    const { container } = render(pane(17))
    const command = await screen.findByDisplayValue('C:/example/claude.exe')
    expect(screen.getByText('Available to install')).toBeTruthy()
    expect(screen.queryByText('Installed')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Set default' })).toBeNull()
    const args = screen.getByDisplayValue('--host-marker')
    const secret = container.querySelector<HTMLInputElement>('[aria-label="Value for API_KEY"]')!
    expect(secret.type).toBe('password')
    expect(secret.value).toBe('')
    expect(container.innerHTML).not.toContain('host-secret')
    fireEvent.change(command, { target: { value: 'C:/example/next-claude.exe' } })
    fireEvent.blur(command)
    await waitFor(() => expect(screen.getByDisplayValue('C:/example/next-claude.exe')).toHaveProperty('readOnly', false))
    fireEvent.change(args, { target: { value: '--model test-model' } })
    fireEvent.blur(args)
    await waitFor(() => expect(screen.getByDisplayValue('--model test-model')).toHaveProperty('readOnly', false))
    fireEvent.change(secret, { target: { value: 'fixture-value' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(secret.value).toBe(''))
    expect(transport.mutate.mock.calls.map((call) => call[1])).toEqual([
      { type: 'command', agent: 'claude', value: 'C:/example/next-claude.exe' },
      { type: 'arguments', agent: 'claude', value: '--model test-model' },
      { type: 'environment-set', agent: 'claude', name: 'API_KEY', value: 'fixture-value' }
    ])
    for (const call of transport.mutate.mock.calls) {
      expect(call[0]).toEqual({ environmentId: 'ssh-host', pairingRevision: 17 })
      expect(call[2]).toBeInstanceOf(AbortSignal)
    }
    expect(useAppStore.getState().settings).toBe(desktop)
    expect(transport.refresh).not.toHaveBeenCalled()
    expect(screen.queryByText('Installed')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await screen.findByText('Installed')
    expect(transport.refresh).toHaveBeenCalledTimes(1)
    expect(transport.read).toHaveBeenCalledTimes(2)
    expect(transport.detection).toHaveBeenLastCalledWith({ kind: 'runtime', environmentId: 'ssh-host' })
    expect(screen.getByRole('button', { name: 'Set default' })).toBeTruthy()
  })

  it('opens startup editors for an enabled undetected agent without an override', async () => {
    transport.detectedIds = []
    transport.read.mockResolvedValue(projectAgentLaunchSettings({ agentDefaultArgs: { claude: '' } }))
    render(pane(17))
    const availability = await screen.findByRole('radiogroup', { name: 'Claude availability' })
    const row = availability.closest('.py-3') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Expand agent settings' }))
    expect(within(row).getByDisplayValue('claude')).toBeTruthy()
    expect(within(row).getByText('Arguments')).toBeTruthy()
    expect(within(row).getByRole('textbox', { name: 'Environment variable name' })).toBeTruthy()
  })

  it('shows saved commands for disabled undetected agents without offering startup editors', async () => {
    transport.detectedIds = []
    transport.read.mockResolvedValue({ ...host(), disabledTuiAgents: ['claude'], agentCmdOverrides: { claude: 'C:/example/saved-claude.exe' } })
    render(pane(17))
    const availability = await screen.findByRole('radiogroup', { name: 'Claude availability' })
    const row = availability.closest('.py-3') as HTMLElement
    expect(within(row).getByText('C:/example/saved-claude.exe')).toBeTruthy()
    expect(within(row).queryByDisplayValue('C:/example/saved-claude.exe')).toBeNull()
    expect(within(row).queryByText('Arguments')).toBeNull()
    expect(within(row).queryByRole('button', { name: 'Set default' })).toBeNull()
  })

  it.each([true, false])(
    'offers automatic permissions only when supported: %s',
    async (supported) => {
      transport.auto.mockResolvedValue(supported)
      render(
        <TooltipProvider>
          <HostAgentLaunchSettings
            environmentId="ssh-host"
            pairingRevision={17}
            hostName="SSH host"
            renderPermissions={(props) => <AgentPermissionsSetting {...props} />}
          />
        </TooltipProvider>
      )
      await screen.findByDisplayValue('--host-marker')
      const auto = screen.getByRole('radio', { name: 'Auto' })
      expect(auto.getAttribute('aria-disabled') === 'true').toBe(!supported)
      fireEvent.click(auto)
      if (supported) {
        await waitFor(() =>
          expect(transport.mutate).toHaveBeenCalledWith(
            { environmentId: 'ssh-host', pairingRevision: 17 },
            { type: 'permissions', mode: 'auto', syncNativeChat: true },
            expect.any(AbortSignal)
          )
        )
      } else {
        expect(transport.mutate).not.toHaveBeenCalled()
      }
    }
  )

  it.each([false, true])(
    'sends native synchronization only when the host supports it: %s',
    async (nativeSupported) => {
      transport.native.mockResolvedValue(nativeSupported)
      render(
        <TooltipProvider>
          <HostAgentLaunchSettings
            environmentId="ssh-host"
            pairingRevision={17}
            hostName="SSH host"
            renderPermissions={(props) => <AgentPermissionsSetting {...props} />}
          />
        </TooltipProvider>
      )
      await screen.findByDisplayValue('--host-marker')
      fireEvent.click(screen.getByRole('radio', { name: 'Manual' }))
      await waitFor(() =>
        expect(transport.mutate).toHaveBeenCalledWith(
          { environmentId: 'ssh-host', pairingRevision: 17 },
          {
            type: 'permissions',
            mode: 'manual',
            ...(nativeSupported ? { syncNativeChat: true } : {})
          },
          expect.any(AbortSignal)
        )
      )
    }
  )

  const fullPane = () => (
    <TooltipProvider>
      <HostAgentLaunchSettings
        environmentId="ssh-host"
        pairingRevision={17}
        hostName="SSH host"
        renderPermissions={(props) => <AgentPermissionsSetting {...props} />}
      />
    </TooltipProvider>
  )

  it('changes only the agents Auto does not cover from the Other agents control', async () => {
    const automatic = projectAgentLaunchSettings(
      applyAgentPermissionMode({ mode: 'auto', ...applyAgentPermissionMode({ mode: 'yolo' }) })
    )
    transport.read.mockResolvedValue(automatic)
    transport.mutate.mockResolvedValue(automatic)
    render(fullPane())
    const others = await screen.findByRole('radiogroup', { name: 'Permissions for other agents' })
    fireEvent.focus(screen.getByRole('button', { name: 'Supported agents' }))
    expect((await screen.findByRole('tooltip')).textContent).toContain(
      'Claude, Claude Agent Teams, and Codex'
    )
    expect(within(others).getByRole('radio', { name: 'Yolo' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    fireEvent.click(within(others).getByRole('radio', { name: 'Manual' }))
    await waitFor(() =>
      expect(transport.mutate).toHaveBeenCalledWith(
        { environmentId: 'ssh-host', pairingRevision: 17 },
        { type: 'permissions', mode: 'manual', exceptAuto: true, syncNativeChat: true },
        expect.any(AbortSignal)
      )
    )
  })

  it('marks an exception and opens its own permission control from the badge', async () => {
    const yolo = applyAgentPermissionMode({ mode: 'yolo' })
    const settings = projectAgentLaunchSettings({
      ...yolo,
      agentDefaultArgs: { ...yolo.agentDefaultArgs, claude: '' }
    })
    transport.read.mockResolvedValue(settings)
    transport.mutate.mockResolvedValue(settings)
    render(fullPane())
    fireEvent.click(await screen.findByRole('button', { name: 'Claude permissions: Manual' }))
    const control = await screen.findByRole('radiogroup', { name: 'Claude permissions' })
    await waitFor(() =>
      expect(document.activeElement).toBe(within(control).getByRole('radio', { name: 'Manual' }))
    )
    fireEvent.click(within(control).getByRole('radio', { name: 'Auto' }))
    await waitFor(() =>
      expect(transport.mutate).toHaveBeenCalledWith(
        { environmentId: 'ssh-host', pairingRevision: 17 },
        { type: 'permissions', agent: 'claude', mode: 'auto', syncNativeChat: true },
        expect.any(AbortSignal)
      )
    )
  })

  it('replaces custom arguments with the expected mode from the row', async () => {
    render(fullPane())
    await screen.findByDisplayValue('--host-marker')
    fireEvent.click(screen.getByRole('button', { name: 'Replace with Manual' }))
    await waitFor(() =>
      expect(transport.mutate).toHaveBeenCalledWith(
        { environmentId: 'ssh-host', pairingRevision: 17 },
        { type: 'arguments', agent: 'claude', value: '' },
        expect.any(AbortSignal)
      )
    )
  })

  it('offers the most common mode for a custom-argument row', async () => {
    const yolo = applyAgentPermissionMode({ mode: 'yolo' })
    const settings = projectAgentLaunchSettings({
      ...yolo,
      agentDefaultArgs: { ...yolo.agentDefaultArgs, claude: '--model sonnet', codex: '' }
    })
    transport.read.mockResolvedValue(settings)
    transport.mutate.mockResolvedValue(settings)
    render(fullPane())
    fireEvent.click(await screen.findByRole('button', { name: 'Replace with Yolo' }))
    await waitFor(() =>
      expect(transport.mutate).toHaveBeenCalledWith(
        { environmentId: 'ssh-host', pairingRevision: 17 },
        { type: 'arguments', agent: 'claude', value: '--dangerously-skip-permissions' },
        expect.any(AbortSignal)
      )
    )
  })

  it.each(['pill', 'row'] as const)(
    'clears the selected default through its %s',
    async (surface) => {
      transport.read.mockResolvedValue({ ...host(), defaultTuiAgent: 'claude' })
      transport.mutate.mockResolvedValue({ ...host(), defaultTuiAgent: 'blank' })
      render(pane(17))
      await screen.findByDisplayValue('--host-marker')
      fireEvent.click(
        screen.getByRole('button', { name: surface === 'pill' ? 'Claude' : 'Default' })
      )
      await waitFor(() =>
        expect(transport.mutate).toHaveBeenCalledWith(
          { environmentId: 'ssh-host', pairingRevision: 17 },
          { type: 'default', agent: 'blank' },
          expect.any(AbortSignal)
        )
      )
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Claude' }).getAttribute('aria-pressed')).toBe(
          'false'
        )
      )
      expect(screen.getByRole('button', { name: 'Auto' }).getAttribute('aria-pressed')).toBe(
        'false'
      )
      expect(screen.queryByRole('button', { name: 'No agent (blank terminal)' })).toBeNull()
      transport.mutate.mockResolvedValue({ ...host(), defaultTuiAgent: 'claude' })
      fireEvent.click(screen.getByRole('button', { name: 'Claude' }))
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Claude' }).getAttribute('aria-pressed')).toBe(
          'true'
        )
      )
      expect(transport.mutate).toHaveBeenLastCalledWith(
        { environmentId: 'ssh-host', pairingRevision: 17 },
        { type: 'default', agent: 'claude' },
        expect.any(AbortSignal)
      )
    }
  )

  it('lets Auto toggle off into an empty selection', async () => {
    transport.mutate.mockResolvedValue({ ...host(), defaultTuiAgent: 'blank' })
    const { container } = render(pane(17))
    await screen.findByDisplayValue('--host-marker')
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }))
    await waitFor(() => expect(container.querySelector('[aria-pressed="true"]')).toBeNull())
    expect(transport.mutate).toHaveBeenCalledWith(
      { environmentId: 'ssh-host', pairingRevision: 17 },
      { type: 'default', agent: 'blank' },
      expect.any(AbortSignal)
    )
    transport.mutate.mockResolvedValue(host())
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Auto' }).getAttribute('aria-pressed')).toBe('true')
    )
  })

  it('routes the pane to the chosen host and saves arguments without editing desktop defaults', async () => {
    const desktop = createGlobalSettingsFixture({
      activeRuntimeEnvironmentId: null,
      agentDefaultArgs: { claude: '--desktop-marker' },
      agentDefaultEnv: { claude: { DESKTOP_KEY: 'desktop-secret' } }
    })
    useAppStore.setState({
      settings: desktop,
      runtimeEnvironments: [
        {
          id: 'ssh-host',
          name: 'SSH host',
          createdAt: 1,
          updatedAt: 1,
          pairingRevision: 17,
          lastUsedAt: null,
          runtimeId: null,
          endpoints: [],
          preferredEndpointId: 'remote'
        }
      ]
    })
    const updateDesktop = vi.fn()
    render(
      <TooltipProvider>
        <AgentsPane
          settings={desktop}
          updateSettings={updateDesktop}
          hostScope={{
            target: { kind: 'environment', environmentId: 'ssh-host' },
            available: true
          }}
        />
      </TooltipProvider>
    )
    const args = await screen.findByDisplayValue('--host-marker')
    expect(screen.getByText(/How much agents can do without asking you/)).toBeTruthy()
    expect(screen.queryByDisplayValue('--desktop-marker')).toBeNull()
    fireEvent.change(args, { target: { value: '--r10-marker' } })
    fireEvent.blur(args)
    await waitFor(() =>
      expect(transport.mutate).toHaveBeenCalledWith(
        { environmentId: 'ssh-host', pairingRevision: 17 },
        { type: 'arguments', agent: 'claude', value: '--r10-marker' },
        expect.any(AbortSignal)
      )
    )
    expect(updateDesktop).not.toHaveBeenCalled()
    expect(desktop.agentDefaultEnv?.claude?.DESKTOP_KEY).toBe('desktop-secret')
    fireEvent.click(screen.getByRole('radio', { name: 'Manual' }))
    await waitFor(() =>
      expect(transport.mutate).toHaveBeenCalledWith(
        { environmentId: 'ssh-host', pairingRevision: 17 },
        { type: 'permissions', mode: 'manual', syncNativeChat: true },
        expect.any(AbortSignal)
      )
    )
    expect(updateDesktop).not.toHaveBeenCalled()
  })

  it('renders host arguments and masked values, then writes the selected host', async () => {
    const { container } = render(pane(17))
    const args = await screen.findByDisplayValue('--host-marker')
    expect(transport.detection).toHaveBeenCalledWith({ kind: 'runtime', environmentId: 'ssh-host' })
    expect(within(args.closest('.py-3') as HTMLElement).getByRole('textbox', { name: 'Environment variable name' })).toBeTruthy()
    const secret = container.querySelector<HTMLInputElement>('[aria-label="Value for API_KEY"]')
    expect(secret?.type).toBe('password')
    expect(secret?.value).toBe('')
    expect(container.innerHTML).not.toContain('host-secret')
    fireEvent.click(screen.getByRole('button', { name: 'Manual' }))
    await waitFor(() =>
      expect(transport.mutate).toHaveBeenCalledWith(
        { environmentId: 'ssh-host', pairingRevision: 17 },
        { type: 'permissions', mode: 'manual', syncNativeChat: true },
        expect.any(AbortSignal)
      )
    )
  })

  it('retains a typed env replacement after failure and never submits it on blur', async () => {
    const { container } = render(pane(17))
    await screen.findByDisplayValue('--host-marker')
    const secret = container.querySelector<HTMLInputElement>('[aria-label="Value for API_KEY"]')
    if (!secret) {
      throw new Error('missing saved environment input')
    }
    fireEvent.change(secret, { target: { value: 'typed-secret' } })
    fireEvent.blur(secret)
    expect(transport.mutate).not.toHaveBeenCalled()
    transport.mutate.mockRejectedValue(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')
    expect(secret.value).toBe('typed-secret')
    expect(screen.getByRole('alert').textContent).not.toContain('typed-secret')
    transport.mutate.mockResolvedValue(host())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(secret.value).toBe(''))
  })

  it('serializes successive field saves without dropping a click while the first is pending', async () => {
    let finishArguments!: (settings: AgentLaunchSettings) => void
    transport.mutate.mockImplementationOnce(
      () =>
        new Promise<AgentLaunchSettings>((resolve) => {
          finishArguments = resolve
        })
    )
    render(pane(17))
    const args = await screen.findByDisplayValue('--host-marker')
    fireEvent.change(args, { target: { value: '--next-marker' } })
    fireEvent.blur(args)
    await waitFor(() => expect(transport.mutate).toHaveBeenCalledTimes(1))
    expect(args).toHaveProperty('readOnly', true)
    fireEvent.click(screen.getByRole('button', { name: 'Manual' }))
    expect(transport.mutate).toHaveBeenCalledTimes(1)
    finishArguments(projectAgentLaunchSettings({ agentDefaultArgs: { claude: '--next-marker' } }))
    await waitFor(() => expect(transport.mutate).toHaveBeenCalledTimes(2))
    expect(transport.mutate.mock.calls[1]?.[1]).toEqual({
      type: 'permissions',
      mode: 'manual',
      syncNativeChat: true
    })
  })

  it('does not display launch controls or local defaults for an old server', async () => {
    transport.read.mockResolvedValue(null)
    render(pane(17))
    await screen.findByText('Update this server to edit its agent launch settings.')
    expect(screen.queryByText('Default Agent')).toBeNull()
    expect(transport.detection).not.toHaveBeenCalled()
    expect(transport.mutate).not.toHaveBeenCalled()
  })

  it('discards a late read from the retired pairing', async () => {
    let resolveOld!: (settings: AgentLaunchSettings) => void
    transport.read.mockImplementationOnce(
      () =>
        new Promise<AgentLaunchSettings>((resolve) => {
          resolveOld = resolve
        })
    )
    const { rerender } = render(pane(17))
    const oldSignal: AbortSignal = transport.read.mock.calls[0]?.[1]
    rerender(pane(18))
    await screen.findByDisplayValue('--host-marker')
    expect(oldSignal.aborted).toBe(true)
    resolveOld(projectAgentLaunchSettings({ agentDefaultArgs: { claude: '--retired-host' } }))
    await waitFor(() => expect(screen.queryByDisplayValue('--retired-host')).toBeNull())
    expect(screen.getByDisplayValue('--host-marker')).toBeTruthy()
  })

  it('drops unsaved environment values when the peer is re-paired', async () => {
    const { container, rerender } = render(pane(17))
    await screen.findByDisplayValue('--host-marker')
    const secret = container.querySelector<HTMLInputElement>('[aria-label="Value for API_KEY"]')
    if (!secret) {
      throw new Error('missing saved environment input')
    }
    fireEvent.change(secret, { target: { value: 'unsaved-secret' } })
    rerender(pane(18))
    await screen.findByDisplayValue('--host-marker')
    const nextSecret = container.querySelector<HTMLInputElement>('[aria-label="Value for API_KEY"]')
    expect(nextSecret?.value).toBe('')
    expect(container.innerHTML).not.toContain('unsaved-secret')
    expect(transport.mutate).not.toHaveBeenCalled()
  })

  it('can read again after Strict Mode cleans up the first mount', async () => {
    render(<StrictMode>{pane(17)}</StrictMode>)
    await screen.findByDisplayValue('--host-marker')
    expect(transport.read.mock.calls.at(-1)?.[1].aborted).toBe(false)
  })
})
