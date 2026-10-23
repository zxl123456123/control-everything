// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  openSettingsPage: vi.fn()
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
const fresh = () => ({
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
    runtimeStatusByEnvironmentId: new Map([
      ['env', { snapshot: { verification: 'verified', transport: 'ready' } }]
    ]),
    worktrees: {
      repo: [
        {
          id: 'worktree',
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
      'real-session'
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
      'codex-session'
    )
    expect(mocks.link).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'second-task', agent: 'claude' }),
      'claude-session'
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
