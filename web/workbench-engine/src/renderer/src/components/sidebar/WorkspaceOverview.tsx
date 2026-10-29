import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'
import { translate } from '@/i18n/i18n'
import WorktreeCard from './WorktreeCard'

type WorkspaceOverviewProps = {
  items: readonly Worktree[]
  repoMap: Map<string, Repo>
  activeWorktreeIdentity: string | null
  onActivate: () => void
}

export default function WorkspaceOverview({
  items,
  repoMap,
  activeWorktreeIdentity,
  onActivate
}: WorkspaceOverviewProps): React.JSX.Element {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const [columns, setColumns] = useState(1)
  useLayoutEffect(() => {
    if (!scrollElement) return
    const updateColumns = (): void => {
      setColumns(Math.max(1, Math.min(4, Math.floor((scrollElement.clientWidth + 12) / 276))))
    }
    updateColumns()
    const observer = new ResizeObserver(updateColumns)
    observer.observe(scrollElement)
    return () => observer.disconnect()
  }, [scrollElement])

  const orderedItems = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          Number(getWorktreeHostIdentity(b) === activeWorktreeIdentity) -
            Number(getWorktreeHostIdentity(a) === activeWorktreeIdentity) ||
          Number(b.isPinned) - Number(a.isPinned) ||
          b.lastActivityAt - a.lastActivityAt
      ),
    [items, activeWorktreeIdentity]
  )
  const rows = useMemo(() => {
    const result: Worktree[][] = []
    for (let index = 0; index < orderedItems.length; index += columns) {
      result.push(orderedItems.slice(index, index + columns))
    }
    return result
  }, [orderedItems, columns])
  // Why: the shared list waits for 50 rows, which would mount up to 196 rich cards.
  // Window rows from the start so only visible workspaces subscribe to live activity.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 120,
    getItemKey: useCallback(
      (index: number) => rows[index].map(getWorktreeHostIdentity).join(','),
      [rows]
    ),
    overscan: 2,
    gap: 12,
    useFlushSync: false
  })
  useLayoutEffect(() => {
    virtualizer.measure()
  }, [columns, virtualizer])

  return (
    <div
      ref={setScrollElement}
      className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek"
      data-workspace-overview=""
      data-workspace-overview-columns={columns}
    >
      {items.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {translate('workspaceBoard.overview.empty', '当前筛选下没有工作区')}
        </p>
      ) : (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => (
            <div
              key={row.key}
              ref={virtualizer.measureElement}
              data-index={row.index}
              className="absolute left-0 top-0 grid w-full gap-3"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                transform: `translateY(${row.start}px)`
              }}
            >
              {rows[row.index].map((worktree) => {
                const identity = getWorktreeHostIdentity(worktree)
                return (
                  <div
                    key={identity}
                    data-workspace-overview-card={identity}
                    role="group"
                    tabIndex={0}
                    aria-label={worktree.displayName}
                    className="min-w-0 rounded-xl border border-worktree-sidebar-border bg-worktree-sidebar-accent/25 p-2 outline-none focus-visible:ring-2 focus-visible:ring-worktree-sidebar-ring"
                    onKeyDown={(event) => {
                      if (
                        event.target !== event.currentTarget ||
                        !['Enter', ' '].includes(event.key)
                      )
                        return
                      event.preventDefault()
                      // Why: reuse the card's activation gates and exact host routing.
                      event.currentTarget
                        .querySelector<HTMLElement>('[data-worktree-card-surface]')
                        ?.click()
                    }}
                  >
                    <WorktreeCard
                      worktree={worktree}
                      repo={repoMap.get(worktree.repoId)}
                      isActive={identity === activeWorktreeIdentity}
                      showProjectName
                      nativeDragEnabled={false}
                      onActivate={onActivate}
                    />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
