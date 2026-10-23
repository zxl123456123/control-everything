import type { ExecutionHostId } from '../../../../shared/execution-host'
import {
  getWorktreeExecutionHostId,
  normalizeExecutionHostId
} from '../../../../shared/execution-host'
import type { AgentPaneThread } from './activity-thread-types'

export type BoundActivityScope = { repoId: string; hostId: ExecutionHostId }

// Platform scope is an ownership boundary, not a persisted user filter.
export function bindActivityThreads(
  threads: AgentPaneThread[],
  scope: BoundActivityScope | null | undefined
): AgentPaneThread[] {
  if (scope === undefined) return threads
  if (!scope?.repoId || !normalizeExecutionHostId(scope.hostId)) return []
  return threads.filter((thread) => {
    if (thread.repo?.id !== scope.repoId || thread.worktree.repoId !== scope.repoId) return false
    const explicitHost = thread.worktree.hostId ?? thread.repo.executionHostId
    if (!normalizeExecutionHostId(explicitHost) && !thread.repo.connectionId) return false
    return getWorktreeExecutionHostId(thread.worktree, thread.repo, 'local') === scope.hostId
  })
}
