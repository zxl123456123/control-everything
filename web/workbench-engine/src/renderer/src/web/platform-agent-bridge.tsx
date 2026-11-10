import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { readHostAgentLaunchSettings } from '@/components/settings/agent-launch-settings-transport'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import AgentCombobox from '@/components/agent/AgentCombobox'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { isTuiAgent } from '../../../shared/tui-agent-config'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { worktreeWorkspaceKey } from '../../../shared/workspace-scope'
import type { AgentLaunchSettings } from '../../../shared/agent-launch-settings'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import type { Worktree } from '../../../shared/worktree/types'
import { choosePlatformWorktree, describePlatformWorkspace } from './platform-project-navigation'
import { projectRoute, readPlatformRoute } from './platform-route'
import {
  readPlatformTaskProgress,
  startPlatformTaskProgress,
  resumePlatformTaskProgress,
  adoptPlatformTaskProgress,
  platformTaskCwd,
  readPlatformTaskBrief,
  type PlatformTaskProgress,
  type PlatformTaskAgent
} from './platform-agent-launch'

type Request = { projectId: string; taskId: string }
type Choice = Request & {
  title: string
  settings: AgentLaunchSettings
  sequence: number
  clientToken: string
  frozenRequest?: Record<string, unknown>
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
  const alive = useRef(true)
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
    if (choice.frozenRequest) {
      const saved = choice.frozenRequest.agent
      setAgent(isTuiAgent(saved) && available.some(row => row.id === saved) ? saved : null)
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
    return () => { alive.current = false; sequence.current++ }
  }, [])

  const reveal = (progress: PlatformTaskProgress) => {
    const run = progress.native_run
    const binding = run?.terminal_binding
    if (progress.item.project_id !== data.project.id || !binding ||
        binding.environmentId !== environmentId || !binding.tabId) throw new Error('会话暂不可定位，请在开发区核对。')
    const state = useAppStore.getState()
    const worktree = Object.values(selectWorktreesByRepo(state)).flat().find(row =>
      row.id === binding.worktreeId && row.repoId === data.target.repoId)
    const tab = state.tabsByWorktree[binding.worktreeId]?.find(row => row.id === binding.tabId)
    if (!worktree || !tab || !state.ptyIdsByTabId[binding.tabId]?.includes(binding.ptyId))
      throw new Error('会话尚未同步或已关闭，请稍后返回或显式恢复。')
    // Selection only: even setActiveWorktree marks sleeping tabs for a new spawn.
    useAppStore.setState({ activeRepoId: worktree.repoId, activeView: 'terminal',
      activeWorktreeId: worktree.id, activeWorkspaceKey: worktreeWorkspaceKey(worktree.id),
      activeWorkspaceExecutionHostId: toRuntimeExecutionHostId(environmentId), activePendingCreationId: null })
    state.setActiveTab(binding.tabId)
    state.setActiveTabType('terminal', worktree.id)
    window.location.hash = projectRoute(data.project.id)
  }

  useEffect(() => {
    const receive = (event: Event) => {
      const request = (event as CustomEvent<Request & { resume?: boolean }>).detail
      if (!request || request.projectId !== data.project.id || !request.taskId) return
      event.preventDefault()
      const operation = ++sequence.current
      const requestedHash = window.location.hash
      const sourceCurrent = () => alive.current && sequence.current === operation &&
        window.location.hash === requestedHash && readPlatformRoute(window.location).id === request.projectId
      void (async () => {
        let progress = await readPlatformTaskProgress(request.taskId)
        if (!sourceCurrent() || progress.item.project_id !== request.projectId) return
        if (request.resume === true) {
          progress = await resumePlatformTaskProgress(progress, crypto.randomUUID())
          if (!alive.current) return
          window.dispatchEvent(new CustomEvent('platform-task-progress-updated', { detail: { taskId: request.taskId } }))
          if (!sourceCurrent()) return
        }
        reveal(progress)
      })().catch(failure => {
        if (sourceCurrent()) toast.error(failure instanceof Error ? failure.message : '会话暂不可定位。')
      })
    }
    window.addEventListener('platform-open-task-session', receive)
    return () => window.removeEventListener('platform-open-task-session', receive)
  }, [data])

  useEffect(() => {
    const receive = (event: Event) => {
      const request = (event as CustomEvent<Request & { sessionId: string }>).detail
      if (!request || request.projectId !== data.project.id || !request.taskId || !request.sessionId) return
      event.preventDefault()
      if (starting.current) return
      const state = useAppStore.getState()
      const worktree = choosePlatformWorktree(Object.values(selectWorktreesByRepo(state)).flat(), data, state.activeWorktreeId)
      if (!worktree) { toast.error('请先选择会话所在的工作区。'); return }
      starting.current = true
      const operation = ++sequence.current
      void (async () => {
        const progress = await readPlatformTaskProgress(request.taskId)
        if (!alive.current || sequence.current !== operation || readPlatformRoute(window.location).id !== request.projectId) return
        if (progress.item.project_id !== data.project.id) throw new Error('项目归属已变化，请刷新进展。')
        await adoptPlatformTaskProgress(progress, request.sessionId, worktree.id, crypto.randomUUID())
        window.dispatchEvent(new CustomEvent('platform-task-progress-updated', { detail: { taskId: request.taskId } }))
        toast.success('已跟踪这段会话，进展按实际来源更新。')
      })().catch(failure => toast.error(failure instanceof Error ? failure.message : '会话尚不能跟踪。'))
        .finally(() => { starting.current = false })
    }
    window.addEventListener('platform-adopt-task-session', receive)
    return () => window.removeEventListener('platform-adopt-task-session', receive)
  }, [data])

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
      if (starting.current) { toast.info('启动正在核对，请稍候。'); return }
      const operation = ++sequence.current
      setError('')
      window.location.hash = projectRoute(request.projectId)
      void (async () => {
        const progress = await readPlatformTaskProgress(request.taskId)
        if (!current(request, operation)) return
        const activeRun = progress.native_run?.active_slot === 1 ? progress.native_run : null
        if (activeRun?.launch_state === 'created') { reveal(progress); return }
        const brief = await readPlatformTaskBrief(request.taskId)
        if (!current(request, operation)) return
        if (brief.item.project_id !== request.projectId || brief.item.origin !== 'task') {
          throw new Error('事项所属项目已变化，请返回事项重新打开。')
        }
        const settings = await readHostAgentLaunchSettings({ environmentId })
        if (!current(request, operation)) return
        if (!settings) throw new Error('当前宿主尚不能读取 Agent 配置。')
        const frozenRequest = activeRun?.brief_snapshot?.request
        const state = useAppStore.getState()
        const worktree = frozenRequest ? Object.values(selectWorktreesByRepo(state)).flat().find(row =>
          row.id === frozenRequest.worktree_id && row.repoId === data.target.repoId) ?? null : choosePlatformWorktree(
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
          clientToken: activeRun?.client_token || crypto.randomUUID(),
          frozenRequest,
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
      const worktree = request.frozenRequest ? Object.values(selectWorktreesByRepo(state)).flat().find(row =>
        row.id === request.frozenRequest!.worktree_id && row.repoId === data.target.repoId) ?? null : choosePlatformWorktree(
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
      const result = await startPlatformTaskProgress(fresh, {
        agent, worktreeId: worktree.id, clientToken: request.clientToken, frozenRequest: request.frozenRequest
      })
      if (!alive.current) return
      window.dispatchEvent(new CustomEvent('platform-task-progress-updated', { detail: { taskId: request.taskId } }))
      // The persistent launch may finish after navigation; only its current UI may reveal it.
      if (!current(request, request.sequence)) {
        setChoice(value => value?.sequence === request.sequence ? null : value)
        return
      }
      if (result.native_run?.launch_state !== 'created') throw new Error('启动尚未确认；记录已保留，请返回进展核对。')
      setChoice(null)
      toast.info('终端已打开；收到可核验的会话信息后更新进展。')
      try { reveal(result) } catch { toast.info('会话正在同步，可在开发区查看。') }

    } catch (failure) {
      const message = failure instanceof Error ? failure.message : '启动未确认，请先检查开发区。'
      if (current(request, request.sequence)) {
        setError(message)
        toast.error(message)
      } else if (alive.current) {
        setChoice(value => value?.sequence === request.sequence ? null : value)
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
        {choice && choice.settings.agentStatusHooksEnabled !== true && (
          <p className="text-sm text-muted-foreground">
            {choice.settings.agentStatusHooksEnabled === false
              ? '自动进展记录未启用，开发可继续；可在 Agent 设置开启。'
              : '自动进展记录能力尚未确认，开发可继续；请在 Agent 设置核对。'}
          </p>
        )}
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
        <fieldset disabled={busy || detectionUnavailable || Boolean(choice?.frozenRequest)} className="grid gap-2 text-sm">
          <legend>开发 Agent</legend>
          <AgentCombobox agents={available} value={agent} onValueChange={value => {
            if (!choice?.frozenRequest && !busy && !starting.current && !detectionUnavailable && available.some(row => row.id === value)) setAgent(value)
          }}
            defaultAgent={choice?.settings.defaultTuiAgent} allowNarrowTrigger />
        </fieldset>
        {(detectionUnavailable || !available.length) && <p role="status" className="text-sm text-muted-foreground">
          {detection.needsServerUpdate ? '当前宿主版本不支持工作区 Agent 检测，请更新宿主。'
            : detection.detectionFailed ? '当前宿主的 Agent 检测失败，请刷新重试。'
              : detection.isLoading || detection.detectedIds === null ? '正在检测当前工作区的 Agent…'
                : '当前工作区没有可用的 Agent，请检查安装及 Agent 设置。'}
        </p>}
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
