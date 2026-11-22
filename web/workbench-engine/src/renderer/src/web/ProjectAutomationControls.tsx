import { useState } from 'react'
import { z } from 'zod'
import { useAppStore } from '@/store'
import { selectWorktreesByRepo } from '@/store/workspace-record-selectors'
import { worktreeOwnerHostIds } from '@/lib/worktree-runtime-owner-index'
import { getRepoExecutionHostId, getSshTargetIdForExecutionHost, toRuntimeExecutionHostId } from '../../../shared/execution-host'
import { normalizeRuntimePathForComparison } from '../../../shared/cross-platform-path'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import { readPlatformTaskBrief } from './platform-agent-launch'
import { contextFetch, remoteContext } from './remote-context'

const itemSchema = z.object({ id: z.string().uuid(), project_id: z.string(), title: z.string() })
const briefSchema = z.object({
  item: z.object({ id: z.string(), project_id: z.string().nullable(), origin: z.literal('task'), revision: z.number().int().positive() }),
  brief: z.object({ revision: z.number().int().nonnegative(), request_text: z.string(), execution_directory_id: z.string().nullable() }),
  directories: z.array(z.object({ binding_id: z.string(), path: z.string() }))
})
const credentials = z.object({ csrf_token: z.string().min(1) })
const receipt = z.object({ task_id: z.string(), project_id: z.string(), source_event_id: z.string() })
type Item = { id: string; project_id: string | null; title: string }
export type PendingAutomation = {
  worktreeLabel: string
  body: { expected_revision: number; brief_revision: number; client_token: string; agent: 'codex'; worktree_id: string }
}

const fieldClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground'
const buttonClass = 'w-fit rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50'
const readHeaders = { 'X-Session-Client': 'panel' }

async function post(path: string, body: object): Promise<Response> {
  if (remoteContext()) throw new Error('远程连接仅可查看流水线。')
  const auth = await contextFetch('/api/bootstrap', {
    credentials: 'same-origin', headers: readHeaders, signal: AbortSignal.timeout(15000)
  })
  if (!auth.ok) throw new Error('无法获取本机操作凭据，请重试。')
  const { csrf_token } = credentials.parse(await auth.json())
  if (remoteContext()) throw new Error('远程连接仅可查看流水线。')
  return contextFetch(path, {
    method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(15000),
    headers: { ...readHeaders, 'Content-Type': 'application/json', 'X-Session-CSRF': csrf_token },
    body: JSON.stringify(body)
  })
}

export function RunAutomation({ execution, task, pending, available, flowId, activeFlow }: {
  execution: PlatformProjectBootstrap; task: Item; pending: Map<string, PendingAutomation>; available: boolean
  flowId?: string; activeFlow: boolean
}): React.JSX.Element {
  const projectId = execution.project.id
  const hostId = toRuntimeExecutionHostId(execution.runtime.environmentId)
  const repoId = execution.target.repoId
  const rows = useAppStore((state) => selectWorktreesByRepo(state)[repoId])
  const repoPath = useAppStore((state) => state.repos.find((repo) =>
    repo.id === repoId && getRepoExecutionHostId(repo) === hostId)?.path)
  const worktrees = rows?.filter((row) => worktreeOwnerHostIds(row).includes(hostId) &&
    !getSshTargetIdForExecutionHost(row.hostId) && !row.removing && !row.prunable) ?? []
  const [worktreeId, setWorktreeId] = useState('')
  const [busy, setBusy] = useState(false)
  const [queued, setQueued] = useState<{ previousFlowId?: string }>()
  const [feedback, setFeedback] = useState('')
  const selected = worktrees.find((row) => row.id === worktreeId)
  const retry = pending.get(task.id)
  if (queued && flowId && (activeFlow || flowId !== queued.previousFlowId)) return <></>
  if (!available && !retry && !busy && !queued) return <></>

  async function start(): Promise<void> {
    if (busy || queued || remoteContext() || (!retry && !selected)) return
    setBusy(true)
    setFeedback('')
    let request = retry
    try {
      if (!request && selected) {
        const brief = briefSchema.parse(await readPlatformTaskBrief(task.id))
        if (brief.item.id !== task.id || brief.item.project_id !== projectId) {
          setFeedback('事项信息已变化，请重新选择事项。')
          return
        }
        const directoryId = brief.brief.execution_directory_id
        const directory = directoryId === null && brief.directories.length === 1 ? brief.directories[0]
          : brief.directories.find((row) => row.binding_id === directoryId)
        if (!repoPath || !directory?.path ||
            normalizeRuntimePathForComparison(repoPath) !== normalizeRuntimePathForComparison(directory.path)) {
          setFeedback('事项执行目录与当前项目仓库不匹配，请核对事项的执行目录。')
          return
        }
        request = { worktreeLabel: `${selected.displayName} · ${selected.path}`, body: {
          expected_revision: brief.item.revision, brief_revision: brief.brief.revision,
          client_token: crypto.randomUUID(), agent: 'codex', worktree_id: selected.id
        } }
        pending.set(task.id, request)
      }
      if (!request) return
      const response = await post(`/api/workspace/tasks/${encodeURIComponent(task.id)}/automation-enable`, request.body)
      if (response.status >= 400 && response.status < 500 && response.status !== 408) {
        pending.delete(task.id)
        setFeedback(response.status === 409 ? '启动未受理，事项版本或执行条件已变化。请核对后重试。'
          : `启动未受理（HTTP ${response.status}）。`)
        return
      }
      const result = receipt.safeParse(await response.json())
      if (response.status !== 202 || !result.success || result.data.task_id !== task.id ||
          result.data.project_id !== projectId || result.data.source_event_id !== request.body.client_token) throw new Error()
      pending.delete(task.id)
      setQueued({ previousFlowId: activeFlow ? undefined : flowId })
      setFeedback('已入队，等待调度。')
    } catch {
      setFeedback(request ? '启动结果尚未确认。重试会沿用同一请求。' : '无法读取事项需求，请重试。')
    } finally {
      setBusy(false)
    }
  }

  return <section aria-label="本机自动推进" className="grid gap-2 rounded-lg border border-border/60 p-3">
    {retry ? <p className="break-all text-sm">本机工作树 · {retry.worktreeLabel}</p> :
      <label className="grid gap-1.5 text-sm font-medium">本机工作树
        <select className={fieldClass} value={worktreeId} disabled={busy || Boolean(queued)}
          onChange={(event) => setWorktreeId(event.target.value)}>
          <option value="">{worktrees.length ? '请选择本机工作树' : '没有可用的本机工作树'}</option>
          {worktrees.map((row) => <option key={row.id} value={row.id}>{row.displayName} · {row.path}</option>)}
        </select>
      </label>}
    <button type="button" className={buttonClass} disabled={busy || Boolean(queued) || (!selected && !retry)} onClick={() => void start()}>
      {busy ? '正在提交…' : queued ? '已入队' : retry ? '重试原启动请求' : '用 Codex 启动自动推进'}
    </button>
    {feedback && <p role="status" className="text-sm text-muted-foreground">{feedback}</p>}
  </section>
}

export function CreateWorkflowTask({ projectId, onCreated }: {
  projectId: string; onCreated: (item: Item) => void
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [request, setRequest] = useState('')
  const [created, setCreated] = useState<Item>()
  const [busy, setBusy] = useState(false)
  const [unknownItem, setUnknownItem] = useState(false)
  const [feedback, setFeedback] = useState('')

  async function save(): Promise<void> {
    if (busy || unknownItem || !title.trim() || !request.trim() || remoteContext()) return
    setBusy(true)
    setFeedback('')
    let item = created
    try {
      if (!item) {
        const response = await post('/api/workspace/items', { project_id: projectId, title: title.trim() })
        if (response.status >= 400 && response.status < 500 && response.status !== 408) {
          setFeedback(`事项创建未受理（HTTP ${response.status}）。`)
          return
        }
        const saved = z.object({ item: itemSchema }).parse(await response.json())
        if (!response.ok || saved.item.project_id !== projectId) throw new Error()
        item = saved.item
        setCreated(item)
      }
      const current = briefSchema.parse(await readPlatformTaskBrief(item.id))
      if (current.item.id !== item.id || current.item.project_id !== projectId) throw new Error()
      if (current.brief.revision === 0) {
        const response = await post(`/api/workspace/tasks/${encodeURIComponent(item.id)}/brief`, {
          expected_revision: 0, request_text: request.trim(), acceptance_text: '', constraints_text: '',
          references: [], execution_directory_id: null
        })
        if (!response.ok) throw new Error()
        const saved = briefSchema.parse(await response.json())
        if (saved.item.id !== item.id || saved.item.project_id !== projectId || saved.brief.request_text !== request.trim()) throw new Error()
      } else if (current.brief.request_text !== request.trim()) {
        setFeedback('事项需求已被修改。请关闭抽屉并重新查看此事项。')
        return
      }
      onCreated(item)
      setTitle('')
      setRequest('')
      setCreated(undefined)
      setFeedback('事项与需求已保存。')
    } catch {
      setUnknownItem(!item)
      setFeedback(item ? '事项已创建，需求保存结果待核对。可重试保存需求。' : '事项创建结果待核对。请重新打开抽屉查看项目事项。')
    } finally {
      setBusy(false)
    }
  }

  return <details className="rounded-lg border border-border/60 p-3">
      <summary className="cursor-pointer text-sm font-medium">新建项目事项</summary>
      <form className="grid gap-2 pt-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <label className="grid gap-1 text-sm">事项标题
          <input className={fieldClass} value={title} maxLength={2000} required disabled={busy || Boolean(created) || unknownItem}
            onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">需求说明
          <textarea className={fieldClass} value={request} maxLength={20000} required rows={3} disabled={busy || Boolean(created) || unknownItem}
            onChange={(event) => setRequest(event.target.value)} />
        </label>
        <button className={buttonClass} type="submit" disabled={busy || unknownItem || !title.trim() || !request.trim()}>
          {busy ? '正在保存…' : created ? '重试保存需求' : '保存事项与需求'}
        </button>
        {feedback && <p role="status" className="text-sm text-muted-foreground">{feedback}</p>}
      </form>
    </details>
}
