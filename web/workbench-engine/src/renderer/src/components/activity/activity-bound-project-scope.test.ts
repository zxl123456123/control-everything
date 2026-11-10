import { describe, expect, it } from 'vitest'
import { bindActivityThreads } from './activity-bound-project-scope'
import type { AgentPaneThread } from './activity-thread-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import { makeRepo, makeWorktree, makeTab } from './ActivityPrototypePage-test-fixtures'

function thread(repoId = 'repo-1', hostId?: ExecutionHostId): AgentPaneThread {
  return {
    paneKey: `${repoId}-${hostId}`,
    paneTitle: 'Agent',
    agentType: 'claude',
    worktree: { ...makeWorktree(), repoId, hostId },
    repo: { ...makeRepo(), id: repoId },
    tab: makeTab(),
    events: [],
    latestEvent: null,
    latestTimestamp: 1,
    currentAgentState: 'working',
    currentAgentEntry: null,
    unread: true,
    responsePreview: ''
  }
}

describe('bound platform activity scope', () => {
  it('matches the exact repo and host and never treats hostless or unknown repos as global', () => {
    const own = thread('repo-1', 'runtime:one')
    const rows = [own, thread('repo-1', 'runtime:two'), thread('repo-2', 'runtime:one'), thread()]
    expect(bindActivityThreads(rows, { repoId: 'repo-1', hostId: 'runtime:one' })).toEqual([own])
    expect(bindActivityThreads(rows, { repoId: 'missing', hostId: 'runtime:one' })).toEqual([])
    expect(bindActivityThreads(rows, { repoId: 'repo-1', hostId: 'local' })).toEqual([])
  })

  it('keeps standalone behavior and clears platform activity while the project is unresolved', () => {
    const rows = [thread('repo-1', 'runtime:one')]
    expect(bindActivityThreads(rows, undefined)).toBe(rows)
    expect(bindActivityThreads(rows, null)).toEqual([])
  })

  it('uses a known repository host only when the worktree has no explicit host', () => {
    const own = thread()
    own.repo!.executionHostId = 'runtime:one'
    expect(bindActivityThreads([own], { repoId: 'repo-1', hostId: 'runtime:one' })).toEqual([own])
    own.worktree.hostId = 'runtime:two'
    expect(bindActivityThreads([own], { repoId: 'repo-1', hostId: 'runtime:one' })).toEqual([])
  })
})
