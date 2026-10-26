import { contextFetch } from './remote-context'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import { isPathInsideOrEqual, resolveRuntimePath } from '../../../shared/cross-platform-path'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { TuiAgent } from '../../../shared/tui-agent'
import {
  agentProviderSessionsEqual,
  normalizeAgentProviderSession,
  type AgentProviderSessionMetadata
} from '../../../shared/agent-session-resume'

export type PlatformTaskAgent = TuiAgent
export type PlatformTaskBrief = {
  item: { id: string; origin: string; project_id: string | null; title: string }
  brief: {
    request_text: string
    acceptance_text: string
    constraints_text: string
    references: string[]
    execution_directory_id: string | null
  }
  directories: { binding_id: string; path: string }[]
}
export type PlatformAgentPendingLink = {
  taskId: string
  projectId: string
  title: string
  agent: PlatformTaskAgent
  environmentId: string
  worktreeId: string
  tabId: string
}

export function platformTaskCwd(
  data: PlatformTaskBrief,
  taskId: string,
  projectId: string,
  worktreePath: string
): string {
  if (
    data.item.id !== taskId ||
    data.item.origin !== 'task' ||
    data.item.project_id !== projectId
  ) {
    throw new Error('事项所属项目已变化，请返回事项重新打开。')
  }
  const directoryId = data.brief.execution_directory_id
  const requested = directoryId
    ? data.directories.find((row) => row.binding_id === directoryId)?.path
    : worktreePath
  if (!requested || !worktreePath) throw new Error('执行目录不可用，请在事项说明中重新选择。')
  const cwd = resolveRuntimePath(worktreePath, requested)
  if (!isPathInsideOrEqual(resolveRuntimePath(worktreePath, '.'), cwd)) {
    throw new Error('事项执行目录不在当前工作区内，请切换到对应工作区或更正执行目录。')
  }
  return cwd
}

export function platformTaskPrompt(data: PlatformTaskBrief): string {
  return [
    `事项：${data.item.title}`,
    data.brief.request_text.trim() || data.item.title,
    data.brief.acceptance_text && `验收要求：\n${data.brief.acceptance_text}`,
    data.brief.constraints_text && `约束：\n${data.brief.constraints_text}`,
    data.brief.references.length && `参考：\n${data.brief.references.join('\n')}`,
    '完成后说明改动和实际验证结果，事项仍由用户验收。'
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function findPlatformProviderSession(
  entries: Record<string, AgentStatusEntry | undefined>,
  pending: PlatformAgentPendingLink
): AgentProviderSessionMetadata | null {
  let observed: AgentProviderSessionMetadata | undefined
  for (const entry of Object.values(entries)) {
    if (
      !entry ||
      entry.restoredUnconfirmed ||
      ('isReplay' in entry && entry.isReplay === true) ||
      ('providerSessionOnly' in entry && entry.providerSessionOnly === true) ||
      ('programStatusOnly' in entry && entry.programStatusOnly === true) ||
      entry.connectionId !== pending.environmentId ||
      entry.worktreeId !== pending.worktreeId ||
      entry.agentType !== pending.agent ||
      (entry.tabId ?? parsePaneKey(entry.paneKey)?.tabId) !== pending.tabId
    )
      continue
    const provider = normalizeAgentProviderSession(entry.providerSession)
    if (!provider || provider.id.length > 256) continue
    if (observed && !agentProviderSessionsEqual(pending.agent, observed, provider)) return null
    observed = provider
  }
  return observed ?? null
}

export async function readPlatformTaskBrief(taskId: string): Promise<PlatformTaskBrief> {
  const response = await contextFetch(`/api/workspace/tasks/${encodeURIComponent(taskId)}/brief`, {
    credentials: 'same-origin',
    headers: { 'X-Session-Client': 'panel' }
  })
  if (!response.ok) throw new Error('事项暂不可读取，请返回事项刷新后重试。')
  return response.json()
}

export async function linkPlatformTaskSession(
  pending: PlatformAgentPendingLink,
  provider: AgentProviderSessionMetadata
): Promise<void> {
  const identity = normalizeAgentProviderSession(provider)
  if (!identity || identity.id.length > 256) throw new Error('会话身份不可用，终端保留，未创建关联。')
  // This API stores an association index, not the native runtime's complete resume credentials.
  const providerId = identity.id
  const fresh = await readPlatformTaskBrief(pending.taskId)
  if (fresh.item.project_id !== pending.projectId) {
    throw new Error('事项所属项目已变化，终端保留，会话尚未关联。')
  }
  const bootstrap = await contextFetch('/api/bootstrap', {
    credentials: 'same-origin',
    headers: { 'X-Session-Client': 'panel' }
  })
  const credentials = await bootstrap.json()
  if (!bootstrap.ok || typeof credentials?.csrf_token !== 'string' || !credentials.csrf_token) {
    throw new Error('保存凭据不可用，终端保留，会话尚未关联。')
  }
  const response = await contextFetch(
    `/api/workspace/tasks/${encodeURIComponent(pending.taskId)}/sessions`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'X-Session-Client': 'panel',
        'Content-Type': 'application/json',
        'X-Session-CSRF': credentials.csrf_token
      },
      body: JSON.stringify({
        source: pending.agent,
        source_instance: pending.environmentId,
        external_id: providerId,
        title: pending.title.slice(0, 200)
      })
    }
  )
  if (response.status === 409) throw new Error('会话已关联其他事项，未改动原关联。')
  if (!response.ok) throw new Error('会话关联尚未确认；可重试关联，终端无需重新启动。')
  const saved = await response.json()
  if (
    saved.task_id !== pending.taskId ||
    saved.project_id !== pending.projectId ||
    saved.source !== pending.agent ||
    saved.source_instance !== pending.environmentId ||
    saved.external_id !== providerId
  )
    throw new Error('会话关联结果发生变化，请返回事项核对。')
}
