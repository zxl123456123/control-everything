import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { readHostAgentLaunchSettings } from '@/components/settings/agent-launch-settings-transport'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { resolveTuiAgentLaunchArgs } from '../../../shared/tui-agent-launch-defaults'
import type { AgentLaunchSettings } from '../../../shared/agent-launch-settings'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import { choosePlatformWorktree } from './platform-project-navigation'
import { projectRoute, readPlatformRoute } from './platform-route'
import {
  findPlatformProviderSession,
  linkPlatformTaskSession,
  platformTaskCwd,
  platformTaskPrompt,
  readPlatformTaskBrief,
  type PlatformAgentPendingLink,
  type PlatformTaskAgent
} from './platform-agent-launch'

type Request = { projectId: string; taskId: string }
type Choice = Request & { title: string; settings: AgentLaunchSettings; sequence: number }
const agentLabels = { codex: 'Codex', claude: 'Claude Code' } as const

export default function PlatformAgentBridge({
  data
}: {
  data: PlatformProjectBootstrap
}): React.JSX.Element {
  const [choice, setChoice] = useState<Choice | null>(null)
  const [agent, setAgent] = useState<PlatformTaskAgent>('codex')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const starting = useRef(false)
  const pending = useRef(new Map<string, PlatformAgentPendingLink>())
  const writing = useRef(new Set<string>())
  const retryLinks = useRef(new Map<string, () => void>())
  const alive = useRef(true)
  const inspectPending = useRef(() => {})
  const environmentId = data.runtime.environmentId
  const close = () => {
    sequence.current++
    setChoice(null)
    setError('')
  }
  const current = (request: Request, operation: number) => {
    const route = readPlatformRoute(window.location)
    return (
      alive.current &&
      operation === sequence.current &&
      route.view === 'project' &&
      route.id === request.projectId &&
      route.id === data.project.id &&
      route.tab === 'workspace'
    )
  }
  const assertReady = (request: Request, operation: number) => {
    const state = useAppStore.getState()
    const snapshot = state.runtimeStatusByEnvironmentId.get(environmentId)?.snapshot
    if (
      !current(request, operation) ||
      document.documentElement.dataset.platformView !== 'workspace'
    ) {
      throw new Error('页面已切换，请从当前项目的事项重新打开。')
    }
    if (
      !state.hydrationSucceeded ||
      !state.terminalStartupRestorationReady ||
      !state.startupWorktreeRefreshCompleted ||
      snapshot?.verification !== 'verified' ||
      snapshot.transport !== 'ready'
    )
      throw new Error('工作区正在恢复连接，请稍后重试。')
  }

  useEffect(() => {
    alive.current = true
    const link = async (entry: PlatformAgentPendingLink, id: string) => {
      if (!alive.current || writing.current.has(entry.taskId)) return
      writing.current.add(entry.taskId)
      retryLinks.current.delete(entry.taskId)
      pending.current.delete(entry.taskId)
      try {
        await linkPlatformTaskSession(entry, id)
        if (alive.current) toast.success('会话已关联到事项；完成后仍需验收。')
      } catch (failure) {
        if (alive.current) {
          const retry = () => {
            void link(entry, id)
          }
          retryLinks.current.set(entry.taskId, retry)
          toast.error(failure instanceof Error ? failure.message : '会话尚未关联。', {
            action: { label: '重试关联', onClick: retry }
          })
        }
      } finally {
        writing.current.delete(entry.taskId)
      }
    }
    const inspect = () => {
      const statuses = useAppStore.getState().agentStatusByPaneKey
      for (const entry of pending.current.values()) {
        const id = findPlatformProviderSession(statuses, entry)
        if (id) void link(entry, id)
      }
    }
    const unsubscribe = useAppStore.subscribe(inspect)
    inspectPending.current = inspect
    return () => {
      alive.current = false
      sequence.current++
      pending.current.clear()
      retryLinks.current.clear()
      unsubscribe()
      inspectPending.current = () => {}
    }
  }, [])

  useEffect(() => {
    const receive = (event: Event) => {
      event.preventDefault()
      const request = (event as CustomEvent<Request>).detail
      const route = readPlatformRoute(window.location)
      if (
        !request ||
        typeof request.taskId !== 'string' ||
        !request.taskId ||
        request.projectId !== data.project.id ||
        route.id !== request.projectId
      ) {
        toast.error('事项与当前项目不一致，请重新打开。')
        return
      }
      const retryLink = retryLinks.current.get(request.taskId)
      if (retryLink) {
        toast.info('该事项已有终端，会话尚未关联；无需重新启动。', {
          action: { label: '重试关联', onClick: retryLink }
        })
        return
      }
      if (
        starting.current ||
        pending.current.has(request.taskId) ||
        writing.current.has(request.taskId)
      ) {
        toast.info('该事项的终端正在打开或等待会话关联，请先在开发区核对。')
        return
      }
      const operation = ++sequence.current
      setError('')
      window.location.hash = projectRoute(request.projectId)
      void (async () => {
        const brief = await readPlatformTaskBrief(request.taskId)
        if (!current(request, operation)) return
        if (brief.item.project_id !== request.projectId || brief.item.origin !== 'task') {
          throw new Error('事项所属项目已变化，请返回事项重新打开。')
        }
        const settings = await readHostAgentLaunchSettings({ environmentId })
        if (!current(request, operation)) return
        if (!settings) throw new Error('当前宿主尚不能读取 Agent 配置。')
        const enabled = (Object.keys(agentLabels) as PlatformTaskAgent[]).filter(
          (value) => !settings.disabledTuiAgents.includes(value)
        )
        setAgent(
          enabled.includes(settings.defaultTuiAgent as PlatformTaskAgent)
            ? (settings.defaultTuiAgent as PlatformTaskAgent)
            : (enabled[0] ?? 'codex')
        )
        setChoice({ ...request, title: brief.item.title, settings, sequence: operation })
      })().catch((failure) => {
        if (operation === sequence.current)
          toast.error(failure instanceof Error ? failure.message : '事项暂不可打开。')
      })
    }
    window.addEventListener('platform-start-task-agent', receive)
    return () => {
      sequence.current++
      setChoice(null)
      window.removeEventListener('platform-start-task-agent', receive)
    }
  }, [data])

  const start = async () => {
    if (!choice || starting.current) return
    const request = choice
    starting.current = true
    setBusy(true)
    setError('')
    try {
      assertReady(request, request.sequence)
      const fresh = await readPlatformTaskBrief(request.taskId)
      assertReady(request, request.sequence)
      const hostSettings = await readHostAgentLaunchSettings({ environmentId })
      assertReady(request, request.sequence)
      if (!hostSettings || hostSettings.disabledTuiAgents.includes(agent)) {
        throw new Error('该 Agent 未启用，请在当前宿主的 Agent 设置中核对。')
      }
      const state = useAppStore.getState()
      const worktree = choosePlatformWorktree(
        Object.values(selectWorktreesByRepo(state)).flat(),
        data,
        state.activeWorktreeId
      )
      if (!worktree) throw new Error('项目尚无可用工作区，请先打开或创建工作区。')
      const initialCwd = platformTaskCwd(fresh, request.taskId, request.projectId, worktree.path)
      if (
        !activateAndRevealWorktree(worktree.id, {
          executionHostId: toRuntimeExecutionHostId(environmentId)
        })
      ) {
        throw new Error('工作区暂不可定位，请刷新后重试。')
      }
      const result = launchAgentInNewTab({
        requestId: newAgentLaunchRequestId(),
        agent,
        worktreeId: worktree.id,
        requestedSurface: 'terminal',
        requireHostAuthority: true,
        selectedExecutionHostId: toRuntimeExecutionHostId(environmentId),
        agentArgs: resolveTuiAgentLaunchArgs(agent, hostSettings.agentDefaultArgs),
        initialCwd,
        prompt: platformTaskPrompt(fresh),
        promptDelivery: 'submit-after-ready'
      })
      if (!result?.terminalCompletion)
        throw new Error('当前宿主未能启动 Agent，请检查连接和 Agent 设置。')
      setChoice(null)
      const completed = await result.terminalCompletion
      if (completed.outcome.status !== 'created')
        throw new Error('Agent 启动未确认，请在开发区核对后再试。')
      if (!alive.current) return
      if (completed.tabId) {
        pending.current.set(request.taskId, {
          taskId: request.taskId,
          projectId: request.projectId,
          title: fresh.item.title,
          agent,
          environmentId,
          worktreeId: worktree.id,
          tabId: completed.tabId
        })
        inspectPending.current()
      }
      const delivery = await result.promptDeliveryResult
      if (alive.current)
        toast.info(
          !completed.tabId
            ? '终端已打开，会话尚未关联，请在开发区核对；无需重新启动。'
            : delivery?.delivered
              ? '事项内容已送达；会话身份返回后自动关联。'
              : '终端已打开，事项内容未确认送达，请在终端核对；不会重复发送。'
        )
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : '启动未确认，请先检查开发区。'
      if (alive.current && request.sequence === sequence.current) {
        setError(message)
        toast.error(message)
      }
    } finally {
      starting.current = false
      if (alive.current) setBusy(false)
    }
  }

  return (
    <Dialog
      open={choice !== null}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogTitle>在工作区开始</DialogTitle>
        <DialogDescription>{choice?.title}</DialogDescription>
        <label className="grid gap-2 text-sm">
          Agent
          <select
            aria-label="执行 Agent"
            value={agent}
            disabled={busy}
            className="rounded border bg-background p-2"
            onChange={(event) => setAgent(event.target.value as PlatformTaskAgent)}
          >
            {(Object.keys(agentLabels) as PlatformTaskAgent[]).map((value) => (
              <option
                key={value}
                value={value}
                disabled={choice?.settings.disabledTuiAgents.includes(value)}
              >
                {agentLabels[value]}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-between gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              close()
              const state = useAppStore.getState()
              state.openSettingsTarget({
                pane: 'agents',
                repoId: null,
                hostScope: { kind: 'environment', environmentId }
              })
              state.openSettingsPage()
            }}
          >
            Agent 设置
          </Button>
          <Button
            disabled={busy || !choice || choice.settings.disabledTuiAgents.includes(agent)}
            onClick={() => {
              void start()
            }}
          >
            {busy ? '正在打开…' : '开始'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
