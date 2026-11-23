import { Check, ChevronDown, Circle, Clock3, GitPullRequest, LoaderCircle, OctagonAlert, Pause, Plus, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { Suspense, useEffect, useId, useRef, useState } from 'react'
import { z } from 'zod'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { contextFetch, onContextInactive, remoteContext } from './remote-context'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import type { PendingAutomation } from './ProjectAutomationControls'

const CreateWorkflowTask = lazy(() => import('./ProjectAutomationControls').then((module) => ({ default: module.CreateWorkflowTask })))
const RunAutomation = lazy(() => import('./ProjectAutomationControls').then((module) => ({ default: module.RunAutomation })))

const taskSchema = z.object({ id: z.string(), project_id: z.string().nullable(), title: z.string() })
const taskPage = z.object({ items: z.array(taskSchema), total: z.number(), list_revision: z.number() })
const stepSchema = z.object({
  kind: z.string(), status: z.string(), attempt: z.number(), updated_at: z.string(),
  exit_code: z.number().nullable(), target_sha: z.string().nullable(),
  candidate_test_passed: z.number().nullish(),
  target_test_passed: z.number().nullable(), delivery_id: z.string().nullable(),
  review_verdict: z.enum(['approve', 'revise', 'discuss']).nullable().optional()
})
const reviewSchema = z.object({
  delivery_id: z.string(), verdict: z.string(), reason: z.string().nullable(), created_at: z.string()
})
const automationSchema = z.object({
  pending_since: z.string().nullable(),
  flows: z.array(z.object({
    id: z.string(), status: z.string(), phase: z.string(), reason: z.string().nullable(),
    integration_approved: z.number().optional(),
    requirement_revision: z.number().nullable(), steps: z.array(stepSchema), reviews: z.array(reviewSchema)
  }))
})
const taskDetail = z.object({ item: taskSchema, automation: automationSchema })
type Task = z.infer<typeof taskSchema>
type Automation = z.infer<typeof automationSchema>
type Flow = Automation['flows'][number]

const stages = [
  ['prepare', '接收与准备'], ['plan', '制定方案'], ['plan_review', '独立方案审查'],
  ['implement', '实现'], ['verify', '测试'], ['code_review', '独立代码审查'],
  ['acceptance', '人工验收'], ['retest', '候选与目标复测'], ['integrate', '集成 develop']
] as const
const statuses: Record<string, string> = {
  queued: '排队中', reserved: '排队中', dispatching: '正在启动', running: '进行中',
  waiting_user: '等待人工决定', waiting_external: '等待处理', awaiting_acceptance: '等待指定人验收',
  integrating: '集成中', completed: '已完成', failed: '失败', unknown: '结果待核实',
  cancelling: '正在取消', cancelled: '已取消', paused: '已暂停', idle: '未开始', skipped: '无需审查',
  waiting_retest: '等待复测回执', integration_approved: '已批准，复测通过后集成',
  integration_running: '复测与集成中', integrated: '已集成',
  review_unverified: '审查已返回，结论待核实', discussion: '需要讨论',
  approved: '通过', changes_requested: '要求修改', rejected: '未通过'
}
const reasons: Record<string, string> = {
  acceptance_changes_requested: '指定验收人已提出修改意见',
  acceptance_rejected: '指定验收人未通过本次交付',
  integration_not_connected: '等待登记 develop 集成目标',
  integration_incomplete: '集成结果未核实',
  integration_rejected: '集成已停止',
  verification_not_configured: '等待配置验证命令',
  repair_budget_exhausted: '自动返修次数已用完',
  requirement_changed: '需求已变更，等待核对当前版本',
  agent_not_supported: '等待选择支持自动推进的 Agent'
}
const label = (status: string): string => statuses[status] ?? statuses.unknown
function stepStatus(step: Flow['steps'][number]): string {
  if (step.status !== 'completed' || !['plan_review', 'code_review'].includes(step.kind)) return step.status
  if (!step.review_verdict) return 'review_unverified'
  return { approve: 'approved', revise: 'changes_requested', discuss: 'discussion' }[step.review_verdict]
}
const terminal = new Set(['completed', 'failed', 'cancelled'])
const clock = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' })

function integrationStatus(flow: Flow, step: Flow['steps'][number] | undefined): string | undefined {
  if (flow.phase !== 'integration') return undefined
  if (step?.status === 'completed' && step.target_sha) return 'integrated'
  if (flow.status === 'completed' || step?.status === 'unknown' || flow.reason === 'integration_incomplete') return 'unknown'
  if (['running', 'integrating'].includes(flow.status)) return 'integration_running'
  if (flow.status === 'waiting_external' && flow.reason === 'integration_not_connected' && flow.integration_approved === 1) {
    return 'integration_approved'
  }
  return undefined
}

function StatusIcon({ status }: { status: string }): React.JSX.Element {
  const icon = ['completed', 'approved', 'integrated'].includes(status) ? [Check, 'text-emerald-500'] as const
    : ['failed', 'rejected', 'changes_requested'].includes(status) ? [X, 'text-red-500'] as const
    : ['unknown', 'review_unverified'].includes(status) ? [OctagonAlert, 'text-amber-500'] as const
    : ['running', 'integrating', 'integration_running', 'dispatching', 'cancelling'].includes(status) ? [LoaderCircle, 'text-primary'] as const
    : ['idle', 'skipped'].includes(status) ? [Circle, 'text-muted-foreground'] as const
    : ['paused', 'cancelled'].includes(status) ? [Pause, 'text-muted-foreground'] as const
    : [Clock3, 'text-amber-500'] as const
  const [Icon, color] = icon
  return <Icon size={17} className={`shrink-0 ${color}`} aria-hidden="true" />
}

function StageList({ flow, current }: { flow: Flow; current: boolean }): React.JSX.Element {
  const deliveries = flow.steps.filter((step) => step.delivery_id)
  const lastReview = flow.reviews.filter((review) => review.delivery_id === deliveries.at(-1)?.delivery_id).at(-1)
  const integration = flow.steps.filter((step) => step.kind === 'integrate').at(-1)
  const integrationState = integrationStatus(flow, integration)
  const candidatePassed = integration?.status === 'completed' && integration.candidate_test_passed === 1
  const targetPassed = integration?.status === 'completed' && integration.target_test_passed === 1
  const phase = flow.phase === 'integration' ? 'integrate'
    : flow.phase === 'implementation' ? (flow.reason === 'verification_not_configured' ? 'verify' : 'implement')
    : flow.phase
  return (
    <ul className="platform-workflow-stages list-none p-0" aria-label="自动推进阶段">
      {stages.map(([kind, title]) => {
        const steps = flow.steps.filter((step) => step.kind === kind)
        const active = current && !terminal.has(flow.status) && phase === kind
        const latest = steps.at(-1)
        let status = latest ? stepStatus(latest) : 'idle'
        if (kind === 'acceptance' && deliveries.length) status = lastReview?.verdict ?? 'awaiting_acceptance'
        if (kind === 'code_review' && deliveries.length && !steps.length) status = 'skipped'
        if (active && !(latest?.status === 'completed' && ['plan_review', 'code_review'].includes(kind))) status = flow.status
        if (kind === 'integrate' && integrationState) status = integrationState
        if (kind === 'retest') {
          if (candidatePassed && targetPassed) status = 'approved'
          else if (integrationState === 'integrated' || integrationState === 'unknown') status = 'unknown'
          else if (integrationState === 'integration_running') status = 'waiting_retest'
        }
        const hasEvidence = steps.length > 0 || (kind === 'acceptance' && deliveries.length > 0)
          || (kind === 'retest' && ['approved', 'unknown'].includes(status))
        const quietStatus = status === 'idle' || (!active && ['completed', 'approved'].includes(status) && !['retest', 'integrate'].includes(kind))
        const moving = active && ['running', 'integrating', 'integration_running', 'dispatching', 'cancelling'].includes(status)
        const row = <>
          <span className="platform-workflow-stage-marker"><StatusIcon status={status} /></span>
          <span className="min-w-0 font-medium">{title}</span>
          <span className={quietStatus ? 'sr-only' : 'platform-workflow-stage-status ml-auto min-w-0 text-right text-sm text-muted-foreground'}>
            {active && flow.reason && !(kind === 'integrate' && integrationState) ? reasons[flow.reason] ?? label(status) : label(status)}
          </span>
        </>
        return (
          <li key={kind} aria-current={active ? 'step' : undefined} data-status={status} data-moving={moving ? 'true' : undefined}>
            {hasEvidence ? <details>
              <summary className="platform-workflow-stage-row cursor-pointer list-none rounded focus-visible:outline-2 focus-visible:outline-primary">
                {row}
                <ChevronDown size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              </summary>
              <div className="platform-workflow-stage-evidence space-y-1 break-words pb-3 text-sm text-muted-foreground">
                {steps.map((step, index) => <p key={`${step.attempt}:${index}`}>
                  第 {index + 1} 次 · {label(stepStatus(step))}
                  {step.exit_code === null ? '' : ` · 退出码 ${step.exit_code}`}
                  {step.target_sha && <> · 提交 <code className="break-all">{step.target_sha}</code></>}
                  {Number.isFinite(Date.parse(step.updated_at)) && <> · {clock.format(new Date(step.updated_at))}</>}
                </p>)}
                {kind === 'acceptance' && deliveries.map((step, index) => (
                  <div key={step.delivery_id}>
                    <p>交付第 {index + 1} 版</p>
                    {flow.reviews.filter((review) => review.delivery_id === step.delivery_id).map((review) =>
                      <p key={review.created_at}>
                        {label(review.verdict)}{review.reason && ` · ${review.reason}`}
                        {Number.isFinite(Date.parse(review.created_at)) && <> · {clock.format(new Date(review.created_at))}</>}
                      </p>)}
                  </div>
                ))}
                {kind === 'retest' && hasEvidence && <>
                  <p>候选副本复测{candidatePassed ? '已通过' : '结果待核实'}。</p>
                  <p>develop 目标副本复测{targetPassed ? '已通过' : '结果待核实'}。</p>
                </>}
              </div>
            </details> : <div className="platform-workflow-stage-row">{row}</div>}
          </li>
        )
      })}
    </ul>
  )
}

async function get(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await contextFetch(path, {
    credentials: 'same-origin', headers: { 'X-Session-Client': 'panel' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])
  })
  if (!response.ok) throw new Error('读取任务流水线失败')
  return response.json()
}

async function readTasks(projectId: string, signal: AbortSignal): Promise<Task[]> {
  const tasks: Task[] = []
  let revision: number | undefined
  let offset = 0
  do {
    const query = new URLSearchParams({ project_id: projectId, limit: '100', offset: String(offset) })
    if (revision !== undefined) query.set('list_revision', String(revision))
    const page = taskPage.parse(await get(`/api/workspace/items?${query}`, signal))
    if (page.items.some((item) => item.project_id !== projectId)) throw new Error('事项所属项目已变化')
    tasks.push(...page.items)
    offset += page.items.length
    revision = page.list_revision
    if (offset >= page.total) return tasks
    if (page.items.length === 0) throw new Error('项目事项读取不完整')
  } while (!signal.aborted)
  return []
}

function WorkflowProgress({ projectId, task, execution, pending }: {
  projectId: string
  task: Task
  execution?: PlatformProjectBootstrap
  pending: Map<string, PendingAutomation>
}): React.JSX.Element {
  const taskId = task.id
  const [workflow, setWorkflow] = useState<Automation>()
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => { controller.abort(); clearTimeout(timer) }
    const unsubscribe = onContextInactive(stop)
    const poll = async (): Promise<void> => {
      try {
        const result = taskDetail.parse(await get(`/api/workspace/agent-tasks/${encodeURIComponent(taskId)}`, controller.signal))
        if (controller.signal.aborted) return
        if (result.item.id !== taskId || result.item.project_id !== projectId) {
          setWorkflow(undefined)
          setUnavailable(true)
          return
        }
        setWorkflow(result.automation)
        setUnavailable(false)
      } catch {
        if (!controller.signal.aborted) setUnavailable(true)
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 5000)
      }
    }
    if (!controller.signal.aborted) void poll()
    return () => { unsubscribe(); stop() }
  }, [projectId, taskId])
  if (!workflow) return <p role="status" className="text-muted-foreground">{unavailable ? '暂时无法读取流水线，正在重试。' : '正在读取流水线…'}</p>
  const [current, ...history] = workflow.flows
  const activeFlow = Boolean(current && !terminal.has(current.status))
  const inProgress = Boolean(workflow.pending_since || activeFlow)
  const integration = current?.steps.filter((step) => step.kind === 'integrate').at(-1)
  const integrationState = current && integrationStatus(current, integration)
  return (
    <div className="grid gap-4">
      {execution && <Suspense fallback={null}>
        <RunAutomation execution={execution} task={task} pending={pending} available={!inProgress && !unavailable}
          pendingDispatch={Boolean(workflow.pending_since)}
          flowId={current?.id} activeFlow={activeFlow} />
      </Suspense>}
      {unavailable && <p role="status" className="text-muted-foreground">刷新失败，显示上次读取的进度。</p>}
      {workflow.pending_since && <p role="status" className="text-muted-foreground">已收到新交办，等待调度。</p>}
      {current ? (
        <div key={current.id} className="grid gap-2">
          <p role="status" className="platform-workflow-current break-words font-medium">
            {integrationState ? label(integrationState) : (current.reason && reasons[current.reason]) || label(current.status)}
            {integrationState === 'integrated' && <> · 提交 <code className="break-all">{integration?.target_sha}</code></>}
          </p>
          <StageList flow={current} current />
        </div>
      ) : !workflow.pending_since && !execution && <p className="text-muted-foreground">本事项暂无自动推进记录。</p>}
      {history.map((flow) => <details key={flow.id} className="border-t border-border/60">
        <summary className="cursor-pointer rounded py-3 focus-visible:outline-2 focus-visible:outline-primary">历史流程 · 需求版本 {flow.requirement_revision ?? '未知'} · {label(flow.status)}</summary>
        <div className="pt-2"><StageList flow={flow} current={false} /></div>
      </details>)}
    </div>
  )
}

function ProjectWorkflowTasks({ projectId, execution, pending }: {
  projectId: string
  execution?: PlatformProjectBootstrap
  pending: Map<string, PendingAutomation>
}): React.JSX.Element {
  const [tasks, setTasks] = useState<Task[]>()
  const [taskId, setTaskId] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const [retry, setRetry] = useState(0)
  const [creating, setCreating] = useState(false)
  const [saved, setSaved] = useState(false)
  const chooserId = useId()
  const formId = useId()
  const chooser = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    const unsubscribe = onContextInactive(() => controller.abort())
    void readTasks(projectId, controller.signal).then((result) => {
      if (!controller.signal.aborted) setTasks(result)
    }).catch(() => {
      if (!controller.signal.aborted) setUnavailable(true)
    })
    return () => { unsubscribe(); controller.abort() }
  }, [projectId, retry])
  if (unavailable) return <p role="status" className="text-muted-foreground">
    暂时无法读取项目事项。
    <button type="button" className="ml-2 text-primary underline" onClick={() => { setUnavailable(false); setRetry((value) => value + 1) }}>重试</button>
  </p>
  if (!tasks) return <p role="status" className="text-muted-foreground">正在读取项目事项…</p>
  const task = tasks.find((row) => row.id === taskId)
  const canWrite = execution?.project.id === projectId && !remoteContext()
  return (
    <div className="grid min-w-0 gap-5">
      <div className="grid gap-1.5">
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-2">
          <label htmlFor={chooserId} className="font-medium">项目事项</label>
          {canWrite && <button type="button" aria-expanded={creating} aria-controls={formId}
            className="platform-workflow-quiet-button"
            onClick={() => { setSaved(false); setCreating(!creating) }}>
            <Plus size={16} aria-hidden="true" />新建事项
          </button>}
        </div>
        <select id={chooserId} ref={chooser} className="platform-workflow-field"
          value={taskId} onChange={(event) => { setSaved(false); setTaskId(event.target.value) }}>
          <option value="">{tasks.length ? '请选择事项' : '此项目还没有事项'}</option>
          {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select>
      </div>
      {canWrite && <div id={formId} hidden={!creating}>
        <Suspense fallback={<p role="status" className="text-muted-foreground">正在打开表单…</p>}>
          <CreateWorkflowTask projectId={projectId} onCreated={(created) => {
            setTasks((rows) => [...(rows ?? []), created])
            setTaskId(created.id)
            setCreating(false)
            setSaved(true)
            chooser.current?.focus()
          }} />
        </Suspense>
      </div>}
      {saved && <p role="status" className="sr-only">事项与需求已保存。</p>}
      {task && <WorkflowProgress key={task.id} projectId={projectId} task={task} pending={pending}
        execution={canWrite ? execution : undefined} />}
    </div>
  )
}

export function PlatformTaskWorkflow({ projectId, execution }: {
  projectId: string
  execution?: PlatformProjectBootstrap
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const pending = useRef(new Map<string, PendingAutomation>())
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="flex shrink-0 items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary">
          <GitPullRequest size={15} aria-hidden="true" />任务流水线
        </button>
      </Dialog.Trigger>
      <SheetContent className="platform-task-workflow" overlayClassName="platform-task-workflow-overlay" showCloseButton={false}>
        <SheetHeader className="flex-row items-center justify-between gap-4 border-b border-border/60 px-5 py-3 sm:px-6">
          <div><SheetTitle className="text-[22px]">任务流水线</SheetTitle><SheetDescription className="sr-only">{execution && !remoteContext()
            ? '选择项目事项和本机工作树，手动发起自动推进。' : '选择项目事项，查看自动推进阶段与证据。'}</SheetDescription></div>
          <SheetClose type="button" className="platform-workflow-quiet-button w-11 justify-center" aria-label="关闭任务流水线"><X size={19} aria-hidden="true" /></SheetClose>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {open && <ProjectWorkflowTasks projectId={projectId} execution={execution} pending={pending.current} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}
