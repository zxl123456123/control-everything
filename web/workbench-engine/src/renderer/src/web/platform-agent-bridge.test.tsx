// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformTaskBrief } from './platform-agent-launch'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import PlatformAgentBridge from './platform-agent-bridge'

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  brief: vi.fn(),
  progress: vi.fn(),
  resume: vi.fn(),
  adopt: vi.fn(),
  launch: vi.fn(),
  link: vi.fn(),
  activate: vi.fn(),
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
  state: {} as Record<string, any>,
  listener: () => {},
  openSettingsTarget: vi.fn(),
  openSettingsPage: vi.fn(),
  detect: vi.fn(), refresh: vi.fn(), detection: {} as Record<string, any>
}))
vi.mock('@/hooks/useDetectedAgents', () => ({ useDetectedAgents: (target: unknown) => {
  mocks.detect(target)
  return { ...mocks.detection, ...(target ? {} : { detectedIds: null, isLoading: true }), refresh: mocks.refresh }
} }))
vi.mock('@/lib/agent-catalog', () => ({ getAgentCatalog: () =>
  ['codex', 'claude', 'grok', 'dsh', 'pi', 'cursor', 'hermes'].map(id => ({ id, label: id }))
}))
vi.mock('@/components/agent/AgentCombobox', () => ({ default: ({ agents, value, onValueChange }: any) =>
  <select aria-label="执行 Agent" value={value ?? ''} onChange={event => onValueChange(event.target.value)}>
    <option value="">请选择</option>
    {agents.map((agent: any) => <option key={agent.id} value={agent.id}>{agent.label}</option>)}
  </select>
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mocks.state,
    setState: (patch: any) => Object.assign(mocks.state, patch),
    subscribe: (callback: () => void) => {
      mocks.listener = callback
      return () => {
        mocks.listener = () => {}
      }
    }
  }
}))
vi.mock('@/store/workspace-record-selectors', () => ({
  selectWorktreesByRepo: (state: any) => state.worktrees
}))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: mocks.launch }))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: mocks.activate }))
vi.mock('@/components/settings/agent-launch-settings-transport', () => ({
  readHostAgentLaunchSettings: mocks.settings
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('./platform-agent-launch', async (actual) => ({
  ...(await actual<typeof import('./platform-agent-launch')>()),
  readPlatformTaskBrief: mocks.brief,
  readPlatformTaskProgress: mocks.progress,
  startPlatformTaskProgress: mocks.launch,
  resumePlatformTaskProgress: mocks.resume,
  adoptPlatformTaskProgress: mocks.adopt,
  linkPlatformTaskSession: mocks.link
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: any) => (open ? <div role="dialog">{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({ variant: _variant, ...props }: any) => <button {...props} />
}))

const data = {
  project: { id: 'project', name: 'Project' },
  runtime: { environmentId: 'env' },
  target: { repoId: 'repo' }
} as PlatformProjectBootstrap
const fresh = (): PlatformTaskBrief => ({
  item: { id: 'task', origin: 'task', title: 'Build search', project_id: 'project', revision: 1 },
  brief: {
    revision: 1, request_text: 'Search titles',
    acceptance_text: '',
    constraints_text: '',
    references: [],
    execution_directory_id: null
  },
  directories: []
})
const progress = () => ({ item: fresh().item, native_run: { id: 'run', client_token: 'token', launch_state: 'created', active_slot: 1, binding_revision: 1,
  terminal_binding: { environmentId: 'env', worktreeId: 'worktree', tabId: 'tab', ptyId: 'pty' } } })
const settings = () => ({
  disabledTuiAgents: [],
  defaultTuiAgent: 'codex',
  agentDefaultArgs: { codex: '--sandbox read-only', claude: '' }
})
async function request(taskId = 'task') {
  let accepted = false
  await act(async () => {
    accepted = !window.dispatchEvent(
      new CustomEvent('platform-start-task-agent', {
        cancelable: true,
        detail: { projectId: 'project', taskId }
      })
    )
  })
  expect(accepted).toBe(true)
  await screen.findByText('开始')
}
beforeEach(() => {
  vi.clearAllMocks()
  window.location.hash = '#project/project/tasks'
  document.documentElement.dataset.platformView = 'workspace'
  mocks.state = {
    hydrationSucceeded: true,
    terminalStartupRestorationReady: true,
    startupWorktreeRefreshCompleted: true,
    activeWorktreeId: 'worktree',
    repos: [{ id: 'repo', kind: 'git', executionHostId: 'runtime:env' }],
    runtimeStatusByEnvironmentId: new Map([
      ['env', { snapshot: { verification: 'verified', transport: 'ready' } }]
    ]),
    worktrees: {
      repo: [
        {
          id: 'worktree',
          displayName: 'Main workspace',
          branch: 'main',
          repoId: 'repo',
          runtimeOwnerEnvironmentId: 'env',
          path: 'C:/example/Repo',
          isMainWorktree: true
        }
      ]
    },
    agentStatusByPaneKey: {}, tabsByWorktree: { worktree: [{ id: 'tab' }] }, ptyIdsByTabId: { tab: ['pty'] },
    setActiveRepo: vi.fn(), setActiveView: vi.fn(), setActiveWorktree: vi.fn(), setActiveTab: vi.fn(), setActiveTabType: vi.fn(),
    openSettingsTarget: mocks.openSettingsTarget,
    openSettingsPage: mocks.openSettingsPage
  }
  mocks.settings.mockResolvedValue(settings())
  mocks.detection = { detectedIds: ['codex', 'claude', 'grok', 'dsh', 'pi', 'cursor', 'hermes'],
    isLoading: false, isRefreshing: false, detectionFailed: false, needsServerUpdate: false }
  mocks.refresh.mockImplementation(async () => mocks.detection.detectedIds ?? [])
  mocks.brief.mockResolvedValue(fresh())
  mocks.link.mockResolvedValue(undefined)
  mocks.activate.mockReturnValue({ primaryTabId: null })
  mocks.progress.mockResolvedValue({ item: fresh().item, native_run: null })
  mocks.launch.mockResolvedValue(progress())
  mocks.resume.mockResolvedValue(progress())
  mocks.adopt.mockResolvedValue(progress())
})
afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.platformView
})

describe('platform native Agent bridge', () => {
  it.each(['grok', 'dsh'])('uses %s through the durable task start without registration', async agent => {
    mocks.settings.mockResolvedValue({ ...settings(), defaultTuiAgent: agent })
    render(<PlatformAgentBridge data={data} />)
    await request()
    expect(mocks.detect).toHaveBeenCalledWith({ kind: 'runtime', environmentId: 'env', worktreeId: 'worktree' })
    expect((screen.getByLabelText('执行 Agent') as HTMLSelectElement).value).toBe(agent)
    await act(async () => { fireEvent.click(screen.getByText('开始')) })
    expect(mocks.launch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ agent,
      worktreeId: 'worktree', clientToken: expect.any(String) }))
    expect(mocks.link).not.toHaveBeenCalled()
  })
  it('keeps a saved Grok launch fixed while reconciling its outcome', async () => {
    const frozen = { agent: 'grok', worktree_id: 'worktree', client_token: 'original', expected_revision: 1, brief_revision: 1 }
    mocks.progress.mockResolvedValue({ item: fresh().item, native_run: { ...progress().native_run,
      launch_state: 'unknown', client_token: 'original', brief_snapshot: { request: frozen } } })
    render(<PlatformAgentBridge data={data} />)
    await request()
    fireEvent.change(screen.getByLabelText('执行 Agent'), { target: { value: 'codex' } })
    expect((screen.getByLabelText('执行 Agent') as HTMLSelectElement).value).toBe('grok')
    await act(async () => { fireEvent.click(screen.getByText('开始')) })
    expect(mocks.launch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ agent: 'grok',
      clientToken: 'original', frozenRequest: frozen }))
  })
  it.each(['isLoading', 'detectionFailed', 'needsServerUpdate'])('refuses unknown host agents when %s', async (flag) => {
    mocks.detection[flag] = true
    render(<PlatformAgentBridge data={data} />)
    await request()
    expect((screen.getByText('开始') as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it('clears a disappeared selection without silently selecting another agent', async () => {
    const view = render(<PlatformAgentBridge data={data} />)
    await request()
    mocks.detection.detectedIds = ['grok']
    view.rerender(<PlatformAgentBridge data={data} />)
    expect((screen.getByLabelText('执行 Agent') as HTMLSelectElement).value).toBe('')
    expect((screen.getByText('开始') as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it('waits for a first inventory before choosing the host default', async () => {
    mocks.detection.detectedIds = null
    const view = render(<PlatformAgentBridge data={data} />)
    await request()
    expect((screen.getByText('开始') as HTMLButtonElement).disabled).toBe(true)
    mocks.detection.detectedIds = ['codex', 'grok']
    view.rerender(<PlatformAgentBridge data={data} />)
    expect((screen.getByLabelText('执行 Agent') as HTMLSelectElement).value).toBe('codex')
  })
  it('ignores selection changes while a fresh probe is pending', async () => {
    let finish: (ids: string[]) => void = () => {}
    mocks.refresh.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    render(<PlatformAgentBridge data={data} />)
    await request()
    await act(async () => { fireEvent.click(screen.getByText('开始')) })
    fireEvent.change(screen.getByLabelText('执行 Agent'), { target: { value: 'grok' } })
    expect((screen.getByLabelText('执行 Agent') as HTMLSelectElement).value).toBe('codex')
    await act(async () => { finish(['codex', 'grok']) })
    expect(mocks.launch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ agent: 'codex' }))
  })
  it('keeps the current selection and refuses launch when the fresh probe rejects', async () => {
    render(<PlatformAgentBridge data={data} />)
    await request()
    mocks.refresh.mockRejectedValue(new Error('host offline'))
    await act(async () => { fireEvent.click(screen.getByText('开始')) })
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('host offline')
  })
  it('rechecks installation before launch and does not fall back when the probe fails', async () => {
    render(<PlatformAgentBridge data={data} />)
    await request()
    mocks.refresh.mockResolvedValue([])
    await act(async () => { fireEvent.click(screen.getByText('开始')) })
    expect(screen.getByRole('alert').textContent).toContain('未检测到')
    expect((screen.getByLabelText('执行 Agent') as HTMLSelectElement).value).toBe('')
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
  })

  it.each([false, undefined])('explains status hook capability %s before allowing development', async enabled => {
    mocks.settings.mockResolvedValue({ ...settings(), agentStatusHooksEnabled: enabled })
    render(<PlatformAgentBridge data={data} />)
    await request()
    expect(screen.getByText(enabled === false
      ? '自动进展记录未启用，开发可继续；可在 Agent 设置开启。'
      : '自动进展记录能力尚未确认，开发可继续；请在 Agent 设置核对。')).toBeTruthy()
    expect((screen.getByText('开始') as HTMLButtonElement).disabled).toBe(false)
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it('does not report disabled hooks when the host explicitly enables them', async () => {
    mocks.settings.mockResolvedValue({ ...settings(), agentStatusHooksEnabled: true })
    render(<PlatformAgentBridge data={data} />)
    await request()
    expect(screen.queryByText(/自动进展记录/)).toBeNull()
  })
  it.each(['created', 'unknown'])('starts a new intent after release of a historical %s run', async launchState => {
    const historical = { ...progress().native_run, active_slot: 0, launch_state: launchState,
      client_token: 'released-token', brief_snapshot: { request: { client_token: 'released-token',
        expected_revision: 0, brief_revision: 0, agent: 'claude', worktree_id: 'historical-worktree' } } }
    mocks.progress.mockResolvedValue({ item: fresh().item, native_run: historical })
    render(<PlatformAgentBridge data={data} />)
    await request()
    expect(mocks.state.setActiveTab).not.toHaveBeenCalled()
    await act(async () => { fireEvent.click(screen.getByText('开始')) })
    expect(mocks.launch).toHaveBeenCalledOnce()
    const options = mocks.launch.mock.calls[0][1]
    expect(options.clientToken).not.toBe('released-token')
    expect(options.frozenRequest).toBeUndefined()
    expect(options.worktreeId).toBe('worktree')
    expect(options.agent).toBe('codex')
  })
  it('shows the same workspace and task subdirectory passed to launch', async () => {
    const brief = fresh()
    brief.brief.execution_directory_id = 'docs'
    brief.directories = [{ binding_id: 'docs', path: 'C:/example/Repo/docs' }]
    mocks.brief.mockResolvedValue(brief)
    render(<PlatformAgentBridge data={data} />)
    await request()
    const target = screen.getByLabelText('启动目标').textContent
    expect(target).toContain('Main workspace')
    expect(target).toContain('项目原目录')
    expect(target).toContain('C:/example/Repo/docs')
    await act(async () => { fireEvent.click(screen.getByText('开始')) })
    expect(mocks.launch).toHaveBeenCalledWith(brief, expect.objectContaining({ worktreeId: 'worktree' }))
  })
  it.each(['selection', 'instance', 'path', 'cwd', 'branch', 'mode'])('refuses an unseen target after %s changes', async (change) => {
    render(<PlatformAgentBridge data={data} />)
    await request()
    const worktree = mocks.state.worktrees.repo[0]
    if (change === 'selection') {
      mocks.state.worktrees.repo.push({ ...worktree, id: 'other', isMainWorktree: false, path: 'C:/example/other' })
      mocks.state.activeWorktreeId = 'other'
    } else if (change === 'instance') worktree.instanceId = 'replacement'
    else if (change === 'path') worktree.path = 'C:/example/changed'
    else if (change === 'branch') worktree.branch = 'different'
    else if (change === 'mode') mocks.state.repos[0].kind = 'folder'
    else {
      const changed = fresh()
      changed.brief.execution_directory_id = 'docs'
      changed.directories = [{ binding_id: 'docs', path: 'C:/example/Repo/docs' }]
      mocks.brief.mockResolvedValue(changed)
    }
    await act(async () => { fireEvent.click(screen.getByText('开始')) })
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('启动目标已变化')
  })
  it('shows an unavailable path and keeps start disabled without selecting another workspace', async () => {
    mocks.state.worktrees.repo = []
    render(<PlatformAgentBridge data={data} />)
    await request()
    expect(screen.getByLabelText('启动目标').textContent).toContain('尚不可解析')
    expect((screen.getByText('开始') as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it('announces readiness only after its request listener can accept the cold request', async () => {
    const onReady = vi.fn(() => {
      expect(
        window.dispatchEvent(
          new CustomEvent('platform-start-task-agent', {
            cancelable: true,
            detail: { projectId: 'project', taskId: 'task' }
          })
        )
      ).toBe(false)
    })
    await act(async () => {
      render(<PlatformAgentBridge data={data} onReady={onReady} />)
    })
    expect(onReady).toHaveBeenCalledWith(data)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it('starts exactly once through the persistent API, without browser-owned linking', async () => {
    render(<PlatformAgentBridge data={data} />)
    await request()
    await act(async () => { fireEvent.click(screen.getByText('开始')); fireEvent.click(screen.getByText('开始')) })
    expect(mocks.launch).toHaveBeenCalledOnce()
    expect(mocks.launch).toHaveBeenCalledWith(fresh(), expect.objectContaining({ agent: 'codex', worktreeId: 'worktree', clientToken: expect.any(String) }))
    expect(mocks.link).not.toHaveBeenCalled()
  })
  it('opens native settings for the actual host without changing the default host', async () => {
    render(<PlatformAgentBridge data={data} />)
    await request()
    fireEvent.click(screen.getByText('Agent 设置'))
    expect(mocks.openSettingsTarget).toHaveBeenCalledWith({
      pane: 'agents',
      repoId: null,
      hostScope: { kind: 'environment', environmentId: 'env' }
    })
    expect(mocks.openSettingsPage).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('reads fresh ownership and rejects a task moved after opening the chooser', async () => {
    render(<PlatformAgentBridge data={data} />)
    await request()
    const moved = fresh()
    moved.item.project_id = 'other'
    mocks.brief.mockResolvedValue(moved)
    await act(async () => {
      fireEvent.click(screen.getByText('开始'))
    })
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('所属项目')
  })
  it('rejects a newly disabled agent', async () => {
    render(<PlatformAgentBridge data={data} />)
    await request()
    mocks.settings.mockResolvedValue({ ...settings(), disabledTuiAgents: ['codex'] })
    await act(async () => {
      fireEvent.click(screen.getByText('开始'))
    })
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it('does not start a stale operation after the user changes projects while awaiting data', async () => {
    render(<PlatformAgentBridge data={data} />)
    await request()
    let release!: (value: ReturnType<typeof fresh>) => void
    mocks.brief.mockReturnValue(
      new Promise((resolve) => {
        release = resolve
      })
    )
    fireEvent.click(screen.getByText('开始'))
    window.location.hash = '#project/other/workspace'
    await act(async () => release(fresh()))
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it('keeps the same token after an unconfirmed response', async () => {
    mocks.launch.mockRejectedValue(new Error('unconfirmed'))
    render(<PlatformAgentBridge data={data} />)
    await request()
    await act(async () => { fireEvent.click(screen.getByText('开始')) })
    await act(async () => { fireEvent.click(screen.getByText('开始')) })
    expect(mocks.launch).toHaveBeenCalledTimes(2)
    expect(mocks.launch.mock.calls[0][1].clientToken).toBe(mocks.launch.mock.calls[1][1].clientToken)
  })
  it.each(['#project/project/tasks', '#project/other/workspace', 'superseded'])('keeps %s after an already-issued launch resolves', async destination => {
    let release!: (value: ReturnType<typeof progress>) => void
    mocks.launch.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
    render(<PlatformAgentBridge data={data} />)
    await request()
    fireEvent.click(screen.getByText('开始'))
    await waitFor(() => expect(mocks.launch).toHaveBeenCalledOnce())
    if (destination === 'superseded') {
      mocks.progress.mockReturnValueOnce(new Promise(() => {}))
      window.dispatchEvent(new CustomEvent('platform-open-task-session', {
        detail: { projectId: 'project', taskId: 'other-task' }
      }))
    } else window.location.hash = destination
    const before = window.location.hash
    const updated = vi.fn()
    window.addEventListener('platform-task-progress-updated', updated)
    try {
      await act(async () => release(progress()))
      expect(updated).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener('platform-task-progress-updated', updated)
    }
    expect(window.location.hash).toBe(before)
    expect(mocks.state.setActiveTab).not.toHaveBeenCalled()
    expect(mocks.launch).toHaveBeenCalledOnce()
    expect(mocks.toast.info).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('does not report an old launch error after leaving the workspace', async () => {
    let reject!: (error: Error) => void
    mocks.launch.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail }))
    render(<PlatformAgentBridge data={data} />)
    await request()
    fireEvent.click(screen.getByText('开始'))
    await waitFor(() => expect(mocks.launch).toHaveBeenCalledOnce())
    window.location.hash = '#project/project/tasks'
    await act(async () => reject(new Error('late launch failure')))
    expect(mocks.toast.error).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.hash).toBe('#project/project/tasks')
    expect(mocks.launch).toHaveBeenCalledOnce()
  })
  it('opens a persisted source without create, resume or link', async () => {
    mocks.progress.mockResolvedValue(progress())
    render(<PlatformAgentBridge data={data} />)
    await act(async () => { window.dispatchEvent(new CustomEvent('platform-open-task-session', {
      cancelable: true, detail: { projectId: 'project', taskId: 'task' }
    })) })
    expect(mocks.state.setActiveTab).toHaveBeenCalledWith('tab')
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.resume).not.toHaveBeenCalled()
    expect(mocks.link).not.toHaveBeenCalled()
  })
  it('requires an explicit resume event to restore the saved provider', async () => {
    mocks.progress.mockResolvedValue(progress())
    render(<PlatformAgentBridge data={data} />)
    await act(async () => { window.dispatchEvent(new CustomEvent('platform-open-task-session', {
      cancelable: true, detail: { projectId: 'project', taskId: 'task', resume: true }
    })) })
    expect(mocks.resume).toHaveBeenCalledOnce()
    expect(mocks.launch).not.toHaveBeenCalled()
  })
  it.each(['read', 'resume'])('keeps a later route when a source %s finishes', async phase => {
    let release!: (value: ReturnType<typeof progress>) => void
    mocks.progress.mockResolvedValue(progress())
    const pending = new Promise(resolve => { release = resolve })
    if (phase === 'read') mocks.progress.mockReturnValueOnce(pending)
    else mocks.resume.mockReturnValueOnce(pending)
    render(<PlatformAgentBridge data={data} />)
    await act(async () => { window.dispatchEvent(new CustomEvent('platform-open-task-session', {
      detail: { projectId: 'project', taskId: 'task', resume: phase === 'resume' }
    })) })
    if (phase === 'resume') expect(mocks.resume).toHaveBeenCalledOnce()
    window.location.hash = '#project/other/tasks'
    const updated = vi.fn()
    window.addEventListener('platform-task-progress-updated', updated)
    try {
      await act(async () => release(progress()))
      expect(updated).toHaveBeenCalledTimes(phase === 'resume' ? 1 : 0)
    } finally { window.removeEventListener('platform-task-progress-updated', updated) }
    expect(window.location.hash).toBe('#project/other/tasks')
    expect(mocks.state.setActiveTab).not.toHaveBeenCalled()
    expect(mocks.toast.error).not.toHaveBeenCalled()
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.resume).toHaveBeenCalledTimes(phase === 'resume' ? 1 : 0)
  })
  it.each(['read', 'resume'])('does not show a stale source %s error after navigation', async phase => {
    let reject!: (error: Error) => void
    mocks.progress.mockResolvedValue(progress())
    const pending = new Promise((_resolve, fail) => { reject = fail })
    if (phase === 'read') mocks.progress.mockReturnValueOnce(pending)
    else mocks.resume.mockReturnValueOnce(pending)
    render(<PlatformAgentBridge data={data} />)
    await act(async () => { window.dispatchEvent(new CustomEvent('platform-open-task-session', {
      detail: { projectId: 'project', taskId: 'task', resume: phase === 'resume' }
    })) })
    window.location.hash = '#home'
    await act(async () => reject(new Error('stale source failure')))
    expect(mocks.toast.error).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#home')
    expect(mocks.state.setActiveTab).not.toHaveBeenCalled()
  })
  it('does not wake or recreate a closed source tab during navigation', async () => {
    mocks.progress.mockResolvedValue(progress())
    mocks.state.ptyIdsByTabId = {}
    render(<PlatformAgentBridge data={data} />)
    await act(async () => { window.dispatchEvent(new CustomEvent('platform-open-task-session', {
      cancelable: true, detail: { projectId: 'project', taskId: 'task' }
    })) })
    expect(mocks.state.setActiveTab).not.toHaveBeenCalled()
    expect(mocks.state.setActiveWorktree).not.toHaveBeenCalled()
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.resume).not.toHaveBeenCalled()
  })
  it('adopts an existing session only on the explicit event and current worktree', async () => {
    render(<PlatformAgentBridge data={data} />)
    await act(async () => { window.dispatchEvent(new CustomEvent('platform-adopt-task-session', {
      cancelable: true, detail: { projectId: 'project', taskId: 'task', sessionId: 'session-record' }
    })) })
    expect(mocks.adopt).toHaveBeenCalledWith(expect.objectContaining({ item: fresh().item }), 'session-record', 'worktree', expect.any(String))
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.resume).not.toHaveBeenCalled()
  })
  it('uses the saved launch payload and token after a reload', async () => {
    const saved = { expected_revision: 1, brief_revision: 1, agent: 'codex', worktree_id: 'worktree', client_token: 'frozen' }
    mocks.progress.mockResolvedValue({ ...progress(), native_run: { ...progress().native_run, launch_state: 'unknown', client_token: 'frozen', brief_snapshot: { request: saved } } })
    render(<PlatformAgentBridge data={data} />)
    await request()
    await act(async () => { fireEvent.click(screen.getByText('开始')) })
    expect(mocks.launch).toHaveBeenCalledWith(fresh(), expect.objectContaining({ clientToken: 'frozen', frozenRequest: saved }))
  })
})
