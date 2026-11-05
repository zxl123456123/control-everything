import { describe, expect, it } from 'vitest'
import type { AgentPaneThread } from './activity-thread-types'
import { projectOfficeAgents, projectOfficeChildWork } from './office-activity-model'

function thread(paneKey: string, state: AgentPaneThread['currentAgentState'] = 'working'): AgentPaneThread {
  return {
    paneKey, paneTitle: '同名 Agent', agentType: 'codex',
    worktree: { displayName: '项目' } as AgentPaneThread['worktree'],
    repo: null, tab: {} as AgentPaneThread['tab'], currentAgentState: state,
    currentAgentEntry: { paneKey, state: 'working', stateStartedAt: 1, updatedAt: 1, stateHistory: [], prompt: '' },
    responsePreview: '', latestTimestamp: 1, latestEvent: null, events: [], unread: false
  }
}

describe('office projection of the scoped activity data', () => {
  it('keeps same-named instances distinct and never turns history into live work', () => {
    const inactive = thread('two', null)
    inactive.currentAgentEntry = null
    const rows = projectOfficeAgents([thread('one'), inactive])
    expect(new Set(rows.map(row => row.id)).size).toBe(2)
    expect(rows.map(row => row.status)).toEqual(['working', 'unknown'])
    expect(rows[1].stateLabel).toBe('活动未知')
  })

  it('treats unconfirmed restored status as unknown even when supplied as working', () => {
    const restored = thread('one')
    restored.currentAgentEntry!.restoredUnconfirmed = true
    expect(projectOfficeAgents([restored])[0]).toMatchObject({ status: 'unknown', evidence: '历史记录，活动未知' })
  })

  it('shows only real agent children when enabled and always selects their parent pane', () => {
    const parent = thread('parent')
    parent.currentAgentEntry!.children = [
      { id: 'child', kind: 'agent', state: 'working', membership: 'live', firstObservedAt: 1, observedAt: 1,
        stoppable: false, invocation: { invocationId: 'run-1', generation: 1 } },
      { id: 'command', kind: 'command', state: 'working', membership: 'live', firstObservedAt: 1, observedAt: 1,
        stoppable: false, invocation: { invocationId: 'run-2', generation: 1 } }
    ]
    expect(projectOfficeAgents([parent])).toHaveLength(1)
    const rows = projectOfficeAgents([parent], true)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ paneKey: 'parent', status: 'working', evidence: '子 Agent 状态观察' })
    parent.currentAgentEntry!.children![0].invocation.generation++
    expect(projectOfficeAgents([parent], true)[1].id).toBe(rows[1].id)
    parent.currentAgentEntry!.restoredUnconfirmed = true
    expect(projectOfficeAgents([parent], true)[1].status).toBe('unknown')
  })

  it('uses legacy child snapshots only when canonical children are absent', () => {
    const parent = thread('parent')
    parent.currentAgentEntry!.subagents = [{ id: 'legacy', state: 'waiting', startedAt: 1 }]
    expect(projectOfficeAgents([parent], true)[1]).toMatchObject({ paneKey: 'parent', status: 'waiting' })
    parent.currentAgentEntry!.children = []
    expect(projectOfficeAgents([parent], true)).toHaveLength(1)
  })

  it('keeps an observed child visible as unknown when its parent has no live state', () => {
    const parent = thread('parent', null)
    parent.paneEntry = parent.currentAgentEntry!
    parent.paneEntry.subagents = [{ id: 'retained', state: 'working', startedAt: 1 }]
    parent.currentAgentEntry = null
    expect(projectOfficeAgents([parent], true)[1]).toMatchObject({ status: 'unknown', paneKey: 'parent' })
  })

  it('animates only newly observed child work and successful settlements in a continuous view', () => {
    const initial = thread('one')
    initial.currentAgentEntry!.structuredHostOwned = true
    const started = thread('one')
    const child = {
      id: 'child', kind: 'agent', state: 'working', membership: 'live', description: '检查任务模型',
      firstObservedAt: 2, observedAt: 2, stoppable: false, invocation: { invocationId: 'run-1', generation: 1 }
    } as const
    started.currentAgentEntry!.children = [child]
    const shown = projectOfficeAgents([started], true)
    const launch = projectOfficeChildWork([initial], [started], shown)
    expect(launch.tasks).toEqual([expect.objectContaining({ title: '检查任务模型' })])
    expect(launch.flows).toEqual([expect.objectContaining({ from: shown[0].id, to: shown[1].id })])
    expect(launch.taskPanes.get(launch.tasks[0].id)).toBe('one')
    expect(projectOfficeChildWork([], [started], shown).flows).toEqual([])
    expect(projectOfficeChildWork([started], [started], shown).flows).toEqual([])
    expect(projectOfficeChildWork([initial], [started], [shown[1]]).flows).toEqual([])

    const settled = thread('one')
    settled.currentAgentEntry!.children = [{ ...child, state: 'done', membership: 'settled', outcome: 'succeeded', settledAt: 3 }]
    expect(projectOfficeChildWork([started], [settled], shown).flows).toEqual([
      expect.objectContaining({ from: shown[1].id, to: '$done', label: '子工作结束' })
    ])
    settled.currentAgentEntry!.children[0].outcome = 'cancelled'
    expect(projectOfficeChildWork([started], [settled], shown).flows).toEqual([])
    initial.currentAgentEntry!.subagentObservation = 'unverifiable'
    expect(projectOfficeChildWork([initial], [started], shown).flows).toEqual([])
    started.currentAgentEntry!.subagentObservation = 'unverifiable'
    expect(projectOfficeChildWork([initial], [started], shown)).toMatchObject({ tasks: [], flows: [] })
    expect(projectOfficeAgents([started], true)[1].status).toBe('unknown')
  })
})
