import type { AgentPaneThread } from './activity-thread-types'
import type { OfficeFlow, OfficeTask } from './office-scene/office-scene.js'

export type OfficeAgent = {
  id: string
  paneKey: string
  label: string
  provider: string
  status: 'working' | 'waiting' | 'idle' | 'done' | 'error' | 'unknown'
  stateLabel: string
  taskTitle: string
  evidence: string
}

function stateView(state: string | null | undefined): Pick<OfficeAgent, 'status' | 'stateLabel'> {
  switch (state) {
    case 'working': return { status: 'working', stateLabel: '工作中' }
    case 'waiting': return { status: 'waiting', stateLabel: '等待中' }
    case 'blocked': return { status: 'waiting', stateLabel: '等待处理' }
    case 'monitoring': return { status: 'idle', stateLabel: '监控中' }
    case 'idle': return { status: 'idle', stateLabel: '空闲' }
    case 'done': return { status: 'done', stateLabel: '子工作已结束' }
    default: return { status: 'unknown', stateLabel: '活动未知' }
  }
}

const paneId = (paneKey: string): string => JSON.stringify(['pane', paneKey])
const childId = (paneKey: string, id: string): string => JSON.stringify(['child', paneKey, id])

function liveEntry(thread: AgentPaneThread) {
  const entry = thread.currentAgentEntry
  return thread.currentAgentState && entry && !entry.restoredUnconfirmed ? entry : null
}

/** Consume only the already host/project-filtered activity projection. IDs are local UI keys. */
export function projectOfficeAgents(threads: readonly AgentPaneThread[], showChildAgents = false): OfficeAgent[] {
  const result: OfficeAgent[] = []
  for (const thread of threads) {
    const entry = thread.currentAgentEntry ?? thread.paneEntry
    const live = Boolean(liveEntry(thread))
    result.push({
      id: paneId(thread.paneKey), paneKey: thread.paneKey,
      label: thread.paneTitle || '未命名会话', provider: thread.agentType,
      ...stateView(live ? thread.currentAgentState : null),
      taskTitle: live && entry?.toolName ? `工具：${entry.toolName}` : thread.worktree.displayName || '项目工作区',
      evidence: live ? 'Agent 状态观察' : '历史记录，活动未知'
    })
    if (!showChildAgents || !entry) continue
    // Child-work views are the host's canonical projection when present; do not duplicate legacy snapshots.
    if (entry.children !== undefined) {
      for (const child of entry.children) {
        if (child.kind !== 'agent' || !child.id) continue
        const confirmed = live && entry.subagentObservation !== 'unverifiable'
        const status = confirmed && (child.membership === 'live' || child.outcome === 'succeeded') ? child.state : null
        result.push({
          id: childId(thread.paneKey, child.id), paneKey: thread.paneKey,
          label: child.name || child.agentType || '子 Agent', provider: child.agentType || thread.agentType,
          ...stateView(status), taskTitle: child.description || '子 Agent',
          evidence: status ? '子 Agent 状态观察' : '活动未知'
        })
      }
    } else {
      for (const child of entry.subagents ?? []) {
        if (!child.id) continue
        result.push({
          id: childId(thread.paneKey, child.id), paneKey: thread.paneKey,
          label: child.agentType || '子 Agent', provider: child.agentType || thread.agentType,
          ...stateView(live ? child.state : null), taskTitle: child.description || '子 Agent',
          evidence: live ? '子 Agent 状态观察' : '历史记录，活动未知'
        })
      }
    }
  }
  return result
}

/** Compare adjacent, confirmed child-work snapshots, never the activity history. */
export function projectOfficeChildWork(
  previous: readonly AgentPaneThread[], threads: readonly AgentPaneThread[], shown: readonly OfficeAgent[]
): { tasks: OfficeTask[]; flows: OfficeFlow[]; taskPanes: Map<string, string> } {
  const before = new Map(previous.map((thread) => [thread.paneKey, thread]))
  const visible = new Set(shown.map((agent) => agent.id))
  const tasks: OfficeTask[] = []
  const flows: OfficeFlow[] = []
  const taskPanes = new Map<string, string>()
  for (const thread of threads) {
    const entry = liveEntry(thread)
    if (!entry?.children || entry.subagentObservation === 'unverifiable') continue
    const priorThread = before.get(thread.paneKey)
    const priorEntry = priorThread ? liveEntry(priorThread) : null
    // A structured status summary omits the child list when there is no running work.
    const priorChildren = priorEntry && priorEntry.subagentObservation !== 'unverifiable'
      ? priorEntry.children ?? (priorEntry.structuredHostOwned && !priorEntry.subagents?.length ? [] : undefined)
      : undefined
    for (const child of entry.children) {
      const to = childId(thread.paneKey, child.id)
      if (child.kind !== 'agent' || !visible.has(to)) continue
      const title = child.description?.trim() || child.name?.trim() || '子 Agent 工作'
      const taskId = JSON.stringify([to, child.invocation.invocationId, child.invocation.generation])
      taskPanes.set(taskId, thread.paneKey)
      if (child.membership === 'live') tasks.push({ id: taskId, title })
      if (!priorChildren) continue
      const prior = priorChildren.find((value) => value.id === child.id &&
        value.invocation.invocationId === child.invocation.invocationId &&
        value.invocation.generation === child.invocation.generation)
      const owner = child.parentChildWorkId ? childId(thread.paneKey, child.parentChildWorkId) : paneId(thread.paneKey)
      if (!prior && child.membership === 'live' && owner !== to && visible.has(owner)) {
        flows.push({ id: `${taskId}:observed`, taskId, label: '发现子 Agent 工作', from: owner, to })
      } else if (prior?.membership === 'live' && child.membership === 'settled' && child.outcome === 'succeeded' && child.settledAt !== undefined) {
        flows.push({ id: `${taskId}:settled`, taskId, label: '子工作结束', from: to, to: '$done' })
      }
    }
  }
  return { tasks, flows, taskPanes }
}
