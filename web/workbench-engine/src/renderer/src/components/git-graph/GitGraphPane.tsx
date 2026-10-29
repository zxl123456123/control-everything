import React, { useCallback, useMemo, useState } from 'react'
import { Network, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VirtualizedList } from '@/components/virtualized-list'
import { translate } from '@/i18n/i18n'
import {
  buildDefaultGitHistoryColorMap,
  buildGitHistoryViewModels,
  getGitHistoryItemLaneIndex
} from '../../../../shared/git-history-graph'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type { GitHistoryResult } from '../../../../shared/git-history'
import { GitHistoryRow } from '../right-sidebar/source-control/sync/git-history-row'
import { useGitHistoryCommitActions } from '../right-sidebar/source-control/sync/use-git-history-commit-actions'
import { useGitGraphHistory } from './useGitGraphHistory'

// Shared graph models and measured virtual rows keep the bounded history view cheap to render.
function GitGraphRows({
  result,
  worktreeId,
  worktreePath,
  target
}: {
  result: GitHistoryResult
  worktreeId: string
  worktreePath: string | null
  target: RuntimeClientTarget | null
}): React.JSX.Element {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const viewModels = useMemo(() => {
    const colors = buildDefaultGitHistoryColorMap(result)
    for (const item of result.items) {
      for (const ref of item.references ?? []) {
        if (!colors.has(ref.id)) colors.set(ref.id, undefined)
      }
    }
    return buildGitHistoryViewModels(result.items, colors, result.currentRef)
  }, [result])
  const laneCount = useMemo(
    () =>
      viewModels.reduce(
        (count, row) =>
          Math.max(
            count,
            row.inputSwimlanes.length,
            row.outputSwimlanes.length,
            getGitHistoryItemLaneIndex(row) + 1
          ),
        1
      ),
    [viewModels]
  )
  const noSplitTarget = useCallback(() => undefined, [])
  const { openHistoryCommitDiff } = useGitHistoryCommitActions({
    activeWorktreeId: worktreeId,
    worktreePath,
    activeRepoTarget: target,
    resolveSplitTargetGroupId: noSplitTarget
  })
  return (
    <div
      ref={setScrollElement}
      className="min-h-0 flex-1 overflow-auto scrollbar-sleek"
      aria-label={translate('git-graph.title', 'Git Graph')}
    >
      <VirtualizedList
        rows={viewModels}
        scrollElement={scrollElement}
        getRowKey={(row) => row.historyItem.id}
        estimateRowHeightPx={24}
        announceListPosition
        hasUnloadedRows={result.hasMore}
        renderRow={(row) => (
          <GitHistoryRow
            viewModel={row}
            graphLaneCount={laneCount}
            layout="pane"
            onOpenCommit={(item) => void openHistoryCommitDiff(item)}
          />
        )}
      />
    </div>
  )
}

function GitGraphPane({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  const { state, refresh, target, worktreePath, key } = useGitGraphHistory(worktreeId)
  const result = state.result
  const loading = state.status === 'loading'
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background" data-testid="git-graph-pane">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <Network className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-semibold">{translate('git-graph.title', 'Git Graph')}</span>
        {result && (
          <span className="text-xs tabular-nums text-muted-foreground">{result.items.length}</span>
        )}
        <Button
          className="ml-auto"
          variant="ghost"
          size="icon-sm"
          onClick={refresh}
          disabled={loading}
          aria-label={translate('git-graph.refresh', 'Refresh graph')}
        >
          <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
        </Button>
      </div>
      <p className="shrink-0 px-3 py-2 text-xs text-muted-foreground">
        {translate(
          'git-graph.scope',
          'Local branches, remote branches, tags and this workspace HEAD. Detached commits in other workspaces are not included unless referenced.'
        )}
      </p>
      {result?.hasMore && (
        <p
          role="status"
          className="shrink-0 border-b border-border px-3 pb-2 text-xs text-muted-foreground"
        >
          {translate(
            'git-graph.truncated',
            'Showing the first {{count}} commits. Older history is not loaded.',
            { count: result.limit }
          )}
        </p>
      )}
      {state.status === 'error' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
          <Button variant="outline" size="sm" onClick={refresh}>
            {translate('git-graph.retry', 'Retry')}
          </Button>
        </div>
      ) : loading ? (
        <p role="status" className="p-6 text-sm text-muted-foreground">
          {translate('git-graph.loading', 'Loading graph…')}
        </p>
      ) : result?.items.length ? (
        <GitGraphRows
          key={key}
          result={result}
          worktreeId={worktreeId}
          worktreePath={worktreePath}
          target={target}
        />
      ) : (
        <p className="p-6 text-sm text-muted-foreground">
          {translate('git-graph.empty', 'No commits yet')}
        </p>
      )}
    </div>
  )
}

export default React.memo(GitGraphPane)
