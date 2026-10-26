// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformTaskBrief } from './platform-agent-launch'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import PlatformAgentBridge from './platform-agent-bridge'

const mocks = vi.hoisted(() => ({
  settings: vi.fn(),
  brief: vi.fn(),
  launch: vi.fn(),
  link: vi.fn(),
  activate: vi.fn(),
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
  state: {} as Record<string, any>,
  listener: () => {},
  openSettingsTarget: vi.fn(),
  openSettingsPage: vi.fn(),
  detect: vi.fn(),
  refresh: vi.fn(),
  detection: {} as Record<string, any>
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
  item: { id: 'task', origin: 'task', title: 'Build search', project_id: 'project' },
  brief: {
    request_text: 'Search titles',
    acceptance_text: '',
    constraints_text: '',
    references: [],
    execution_directory_id: null
  },
  directories: []
})
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
    agentStatusByPaneKey: {},
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
  mocks.launch.mockReturnValue({
    terminalCompletion: Promise.resolve({
      outcome: { status: 'created' },
      tabId: 'web-terminal-tab'
    }),
    promptDeliveryResult: Promise.resolve({ delivered: true })
  })
})
afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.platformView
})

describe('platform native Agent bridge', () => {
  it.each(['grok', 'dsh'])('uses the host %s agent without a platform registration', async (agent) => {
    mocks.settings.mockResolvedValue({ ...settings(), defaultTuiAgent: agent })
    render(<PlatformAgentBridge data={data} />)
    await request()
    expect(mocks.detect).toHaveBeenCalledWith({ kind: 'runtime', environmentId: 'env', worktreeId: 'worktree' })
    expect((screen.getByLabelText('执行 Agent') as HTMLSelectElement).value).toBe(agent)
    expect(screen.getByRole('status').textContent).toContain('无需注册')
    await act(async () => { fireEvent.click(screen.getByText('开始')) })
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.launch).toHaveBeenCalledWith(expect.objectContaining({ agent,
      requireHostAuthority: true, selectedExecutionHostId: 'runtime:env' }))
    mocks.state.agentStatusByPaneKey = { row: { connectionId: 'env', worktreeId: 'worktree',
      tabId: 'web-terminal-tab', agentType: agent, providerSession: { key: 'session_id', id: 'native-id' } } }
    await act(async () => { mocks.listener() })
    expect(mocks.link).toHaveBeenCalledWith(expect.objectContaining({ agent }), { key: 'session_id', id: 'native-id' })
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
    expect(mocks.launch).toHaveBeenCalledWith(expect.objectContaining({ agent: 'codex' }))
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
  it('does not retry a launch without provider identity to repair its association', async () => {
    mocks.settings.mockResolvedValue({ ...settings(), defaultTuiAgent: 'hermes' })
    render(<PlatformAgentBridge data={data} />)
    await request()
    await act(async () => { fireEvent.click(screen.getByText('开始')) })
    await act(async () => { window.dispatchEvent(new CustomEvent('platform-start-task-agent', {
      cancelable: true, detail: { projectId: 'project', taskId: 'task' }
    })) })
    expect(mocks.launch).toHaveBeenCalledOnce()
    expect(mocks.link).not.toHaveBeenCalled()
    expect(mocks.toast.info).toHaveBeenLastCalledWith(expect.stringContaining('等待会话关联'))
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
    expect(mocks.launch).toHaveBeenCalledWith(expect.objectContaining({ worktreeId: 'worktree', initialCwd: 'C:/example/Repo/docs' }))
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
  it('launches once using the current host arguments and links only a real provider identity', async () => {
    render(<PlatformAgentBridge data={data} />)
    await request()
    const button = screen.getByText('开始')
    await act(async () => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    expect(mocks.launch).toHaveBeenCalledOnce()
    expect(mocks.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'codex',
        worktreeId: 'worktree',
        requestedSurface: 'terminal',
        requireHostAuthority: true,
        selectedExecutionHostId: 'runtime:env',
        initialCwd: 'C:/example/Repo',
        agentArgs: '--sandbox read-only',
        promptDelivery: 'submit-after-ready'
      })
    )
    expect(mocks.brief).toHaveBeenCalledTimes(2)
    expect(mocks.toast.info).toHaveBeenCalledWith('事项内容已送达，请在终端继续；会话关联需等待真实来源信息，未提供时保持未关联。')
    expect(mocks.settings).toHaveBeenCalledWith({ environmentId: 'env' })
    expect(mocks.link).not.toHaveBeenCalled()
    mocks.state.agentStatusByPaneKey = {
      row: {
        connectionId: 'env',
        worktreeId: 'worktree',
        tabId: 'web-terminal-tab',
        agentType: 'codex',
        providerSession: { key: 'session_id', id: 'real-session' }
      }
    }
    await act(async () => {
      mocks.listener()
      mocks.listener()
    })
    expect(mocks.link).toHaveBeenCalledOnce()
    expect(mocks.link).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task' }),
      { key: 'session_id', id: 'real-session' }
    )
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
  it('keeps two different task and agent launches independently awaiting their exact sessions', async () => {
    render(<PlatformAgentBridge data={data} />)
    await request()
    await act(async () => {
      fireEvent.click(screen.getByText('开始'))
    })
    const second = fresh()
    second.item.id = 'second-task'
    mocks.brief.mockResolvedValue(second)
    mocks.launch.mockReturnValue({
      terminalCompletion: Promise.resolve({
        outcome: { status: 'created' },
        tabId: 'web-terminal-claude'
      }),
      promptDeliveryResult: Promise.resolve({ delivered: true })
    })
    await request('second-task')
    fireEvent.change(screen.getByLabelText('执行 Agent'), { target: { value: 'claude' } })
    await act(async () => {
      fireEvent.click(screen.getByText('开始'))
    })
    expect(mocks.launch).toHaveBeenCalledTimes(2)
    expect(mocks.launch.mock.calls[1][0]).toMatchObject({ agent: 'claude', agentArgs: '' })
    expect(mocks.link).not.toHaveBeenCalled()
    mocks.state.agentStatusByPaneKey = {
      first: {
        connectionId: 'env',
        worktreeId: 'worktree',
        tabId: 'web-terminal-tab',
        agentType: 'codex',
        providerSession: { key: 'session_id', id: 'codex-session' }
      },
      second: {
        connectionId: 'env',
        worktreeId: 'worktree',
        tabId: 'web-terminal-claude',
        agentType: 'claude',
        providerSession: { key: 'session_id', id: 'claude-session' }
      }
    }
    await act(async () => {
      mocks.listener()
    })
    expect(mocks.link).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task', agent: 'codex' }),
      { key: 'session_id', id: 'codex-session' }
    )
    expect(mocks.link).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'second-task', agent: 'claude' }),
      { key: 'session_id', id: 'claude-session' }
    )
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
  it('does not retry launch after host refusal', async () => {
    mocks.launch.mockReturnValue({
      terminalCompletion: Promise.resolve({ outcome: { status: 'failed', message: 'offline' } })
    })
    render(<PlatformAgentBridge data={data} />)
    await request()
    await act(async () => {
      fireEvent.click(screen.getByText('开始'))
    })
    expect(mocks.launch).toHaveBeenCalledOnce()
    expect(mocks.link).not.toHaveBeenCalled()
    expect(mocks.toast.error).toHaveBeenCalled()
  })

  it('does not promise automatic association when the host returns no tab correlation', async () => {
    mocks.launch.mockReturnValue({
      terminalCompletion: Promise.resolve({ outcome: { status: 'created' } }),
      promptDeliveryResult: Promise.resolve({ delivered: true })
    })
    render(<PlatformAgentBridge data={data} />)
    await request()
    await act(async () => {
      fireEvent.click(screen.getByText('开始'))
    })
    expect(mocks.toast.info).toHaveBeenLastCalledWith(
      '终端已打开，会话尚未关联，请在开发区核对；无需重新启动。'
    )
    expect(mocks.link).not.toHaveBeenCalled()
    expect(mocks.launch).toHaveBeenCalledOnce()
  })
  it('retries association without opening another terminal, and drops pending state on unmount', async () => {
    mocks.link.mockRejectedValueOnce(new Error('temporary link error'))
    const mounted = render(<PlatformAgentBridge data={data} />)
    await request()
    await act(async () => {
      fireEvent.click(screen.getByText('开始'))
    })
    mocks.state.agentStatusByPaneKey = {
      row: {
        connectionId: 'env',
        worktreeId: 'worktree',
        tabId: 'web-terminal-tab',
        agentType: 'codex',
        providerSession: { key: 'session_id', id: 'real-session' }
      }
    }
    await act(async () => {
      mocks.listener()
    })
    const options = mocks.toast.error.mock.calls.at(-1)?.[1]
    expect(options.action.label).toBe('重试关联')
    await act(async () => {
      options.action.onClick()
    })
    expect(mocks.link).toHaveBeenCalledTimes(2)
    expect(mocks.launch).toHaveBeenCalledOnce()
    mounted.unmount()
    await act(async () => {
      mocks.listener()
    })
    expect(mocks.link).toHaveBeenCalledTimes(2)
  })
  it.each(['pending', 'failed'] as const)(
    'keeps the same task reserved while association is %s',
    async (state) => {
      let settle!: () => void
      if (state === 'pending')
        mocks.link.mockReturnValueOnce(
          new Promise<void>((resolve) => {
            settle = resolve
          })
        )
      else mocks.link.mockRejectedValueOnce(new Error('link failed'))
      render(<PlatformAgentBridge data={data} />)
      await request()
      await act(async () => {
        fireEvent.click(screen.getByText('开始'))
      })
      mocks.state.agentStatusByPaneKey = {
        row: {
          connectionId: 'env',
          worktreeId: 'worktree',
          tabId: 'web-terminal-tab',
          agentType: 'codex',
          providerSession: { key: 'session_id', id: 'real-session' }
        }
      }
      await act(async () => {
        mocks.listener()
      })
      expect(mocks.link).toHaveBeenCalledOnce()
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent('platform-start-task-agent', {
            cancelable: true,
            detail: { projectId: 'project', taskId: 'task' }
          })
        )
      })
      expect(screen.queryByText('开始')).toBeNull()
      expect(mocks.launch).toHaveBeenCalledOnce()
      if (state === 'pending')
        await act(async () => {
          settle()
        })
      else {
        const retry = mocks.toast.info.mock.calls.at(-1)?.[1]
        expect(retry.action.label).toBe('重试关联')
        await act(async () => {
          retry.action.onClick()
        })
        expect(mocks.link).toHaveBeenCalledTimes(2)
      }
      expect(mocks.launch).toHaveBeenCalledOnce()
    }
  )
})


it('keeps workspace details collapsed and uses the host default Agent without starting automatically', async () => {
  mocks.settings.mockResolvedValue({ ...settings(), defaultTuiAgent: 'claude' })
  render(<PlatformAgentBridge data={data} />)
  await request()
  expect(screen.getByRole('heading', { name: '开始对话' })).toBeTruthy()
  const target = screen.getByLabelText('启动目标')
  expect(target.querySelector('p')?.textContent).toBe('Project · Main workspace')
  expect(target.querySelector('details')?.open).toBe(false)
  expect(target.querySelector('details')?.textContent).toContain('C:/example/Repo')
  expect(target.querySelector('details')?.textContent).toContain('main')
  expect((screen.getByLabelText('执行 Agent') as HTMLSelectElement).value).toBe('claude')
  expect(mocks.launch).not.toHaveBeenCalled()
})
