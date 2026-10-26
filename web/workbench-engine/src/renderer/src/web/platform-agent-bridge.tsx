import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { readHostAgentLaunchSettings } from '@/components/settings/agent-launch-settings-transport'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import AgentCombobox from '@/components/agent/AgentCombobox'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import type { AgentProviderSessionMetadata } from '../../../shared/agent-session-resume'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { resolveTuiAgentLaunchArgs } from '../../../shared/tui-agent-launch-defaults'
import type { AgentLaunchSettings } from '../../../shared/agent-launch-settings'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import type { Worktree } from '../../../shared/worktree/types'
import { choosePlatformWorktree, describePlatformWorkspace } from './platform-project-navigation'
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
type Choice = Request & {
  title: string
  settings: AgentLaunchSettings
  sequence: number
  worktree: Worktree | null
  cwd: string | null
  targetError: string
  workspace: ReturnType<typeof describePlatformWorkspace>
}

export default function PlatformAgentBridge({
  data,
  onReady
}: {
  data: PlatformProjectBootstrap
  onReady?: (data: PlatformProjectBootstrap) => void
}): React.JSX.Element {
  const [choice, setChoice] = useState<Choice | null>(null)
  const [agent, setAgent] = useState<PlatformTaskAgent | null>(null)
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
  const detection = useDetectedAgents(choice?.worktree
    ? { kind: 'runtime', environmentId, worktreeId: choice.worktree.id } : undefined)
  const available = useMemo(() => getAgentCatalog().filter(row =>
    detection.detectedIds?.includes(row.id) && !choice?.settings.disabledTuiAgents.includes(row.id)
  ), [detection.detectedIds, choice?.settings])
  const initializedChoice = useRef<number | null>(null)
  const detectionUnavailable = detection.detectedIds === null || detection.isLoading || detection.detectionFailed || detection.needsServerUpdate
  useEffect(() => {
    if (!choice || detectionUnavailable) {
      setAgent(null)
      return
    }
    if (initializedChoice.current !== choice.sequence) {
      initializedChoice.current = choice.sequence
      setAgent(previous => available.some(row => row.id === previous) ? previous
        : available.find(row => row.id === choice.settings.defaultTuiAgent)?.id ?? available[0]?.id ?? null)
    } else {
      setAgent(previous => available.some(row => row.id === previous) ? previous : null)
    }
  }, [choice, available, detectionUnavailable])
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
    const link = async (entry: PlatformAgentPendingLink, id: AgentProviderSessionMetadata) => {
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
        const state = useAppStore.getState()
        const worktree = choosePlatformWorktree(
          Object.values(selectWorktreesByRepo(state)).flat(), data, state.activeWorktreeId
        )
        let cwd: string | null = null
        let targetError = ''
        try {
          if (!worktree) throw new Error('项目尚无可用工作区，请先打开或创建工作区。')
          cwd = platformTaskCwd(brief, request.taskId, request.projectId, worktree.path)
        } catch (failure) {
          targetError = failure instanceof Error ? failure.message : '执行目录尚不可解析。'
        }
        setChoice({
          ...request, title: brief.item.title, settings, sequence: operation,
          worktree: worktree ? { ...worktree } : null, cwd, targetError,
          workspace: describePlatformWorkspace(state.repos, worktree, data)
        })
      })().catch((failure) => {
        if (operation === sequence.current)
          toast.error(failure instanceof Error ? failure.message : '事项暂不可打开。')
      })
    }
    window.addEventListener('platform-start-task-agent', receive)
    onReady?.(data)
    return () => {
      sequence.current++
      setChoice(null)
      window.removeEventListener('platform-start-task-agent', receive)
    }
  }, [data, onReady])

  const start = async () => {
    if (!choice || !agent || detectionUnavailable || starting.current) return
    const request = choice
    starting.current = true
    setBusy(true)
    setError('')
    try {
      assertReady(request, request.sequence)
      const fresh = await readPlatformTaskBrief(request.taskId)
      assertReady(request, request.sequence)
      const detected = await detection.refresh()
      assertReady(request, request.sequence)
      if (!detected.includes(agent)) {
        setAgent(null)
        throw new Error('当前宿主未检测到所选 Agent，请刷新或检查 Agent 设置。')
      }
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
      const workspace = describePlatformWorkspace(state.repos, worktree, data)
      if (
        !request.cwd || !request.worktree || worktree.id !== request.worktree.id ||
        worktree.instanceId !== request.worktree.instanceId || worktree.path !== request.worktree.path ||
        initialCwd !== request.cwd || workspace?.mode !== request.workspace?.mode ||
        workspace?.branch !== request.workspace?.branch
      ) {
        throw new Error('启动目标已变化，请关闭窗口后重新打开并核对。')
      }
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
              ? '事项内容已送达，请在终端继续；会话关联需等待真实来源信息，未提供时保持未关联。'
              : '终端已打开，事项内容未确认送达；请先在终端中完成首次确认，再正常对话。'
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
        <DialogTitle>开始对话</DialogTitle>
        <DialogDescription>{choice?.title}</DialogDescription>
        {choice && (
          <div className="min-w-0 space-y-1 break-all text-sm" aria-label="启动目标">
            <p>{data.project.name} · {choice.workspace?.name || choice.worktree?.displayName || '尚不可定位'}</p>
            <details>
              <summary>工作区详情</summary>
              <p>目录模式：{choice.workspace?.mode || '尚未读取'}</p>
              <p>启动目录：{choice.cwd || '尚不可解析'}</p>
              {choice.workspace?.branch && <p>分支：{choice.workspace.branch}</p>}
            </details>
            {choice.targetError && <p role="alert">{choice.targetError}</p>}
          </div>
        )}
        <fieldset disabled={busy || detectionUnavailable} className="grid gap-2 text-sm">
          <legend>开发 Agent</legend>
          <AgentCombobox agents={available} value={agent} onValueChange={value => {
            if (!busy && !starting.current && !detectionUnavailable && available.some(row => row.id === value)) setAgent(value)
          }}
            defaultAgent={choice?.settings.defaultTuiAgent} allowNarrowTrigger />
        </fieldset>
        <p role="status" className="text-sm text-muted-foreground">
          {detection.needsServerUpdate ? '当前宿主版本不支持工作区 Agent 检测，请更新宿主。'
            : detection.detectionFailed ? '当前宿主的 Agent 检测失败，请刷新重试。'
              : detection.isLoading || detection.detectedIds === null ? '正在检测当前工作区的 Agent…'
                : available.length ? '使用工作台已有配置，无需注册外部程序或生成 Token。'
                  : '当前工作区没有可用的 Agent，请检查安装及 Agent 设置。'}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-between gap-2">
          <Button variant="outline" disabled={busy || detection.isRefreshing || !choice?.worktree}
            onClick={() => { void detection.refresh().catch(() => setError('Agent 检测失败，请重试。')) }}>
            {detection.isRefreshing ? '正在刷新…' : '刷新'}
          </Button>
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
            disabled={busy || detectionUnavailable || detection.isRefreshing || !choice?.cwd || !agent || !available.some(row => row.id === agent)}
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
