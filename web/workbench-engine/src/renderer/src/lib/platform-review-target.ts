import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'

type ReviewState = Pick<
  AppState,
  | 'activeView'
  | 'activeWorktreeId'
  | 'groupsByWorktree'
  | 'layoutByWorktree'
  | 'unifiedTabsByWorktree'
  | 'createEmptySplitGroup'
>

/** Reuse a simple right-hand reading group without rearranging a saved custom layout. */
export function resolvePlatformReviewGroup(
  state: ReviewState,
  worktreeId: string
): string | undefined {
  if (state.activeView !== 'terminal' || state.activeWorktreeId !== worktreeId) return undefined
  const groups = state.groupsByWorktree[worktreeId] ?? []
  const tabs = state.unifiedTabsByWorktree[worktreeId] ?? []
  const layout = state.layoutByWorktree[worktreeId]
  const hasConversation = (groupId: string): boolean => {
    const group = groups.find((candidate) => candidate.id === groupId)
    return tabs.some(
      (tab) =>
        tab.id === group?.activeTabId &&
        tab.groupId === groupId &&
        (tab.contentType === 'terminal' ||
          tab.contentType === 'agent-session' ||
          tab.contentType === 'git-graph')
    )
  }
  const isReadingGroup = (groupId: string): boolean => {
    const group = groups.find((candidate) => candidate.id === groupId)
    if (!group) return false
    const active = tabs.find((tab) => tab.id === group.activeTabId && tab.groupId === groupId)
    return (
      !group.activeTabId ||
      active?.contentType === 'editor' ||
      active?.contentType === 'diff' ||
      active?.contentType === 'git-graph' ||
      active?.contentType === 'conflict-review' ||
      active?.contentType === 'check-details'
    )
  }
  if (
    layout?.type === 'split' &&
    layout.direction === 'horizontal' &&
    layout.first.type === 'leaf' &&
    layout.second.type === 'leaf' &&
    hasConversation(layout.first.groupId) &&
    isReadingGroup(layout.second.groupId)
  ) {
    return layout.second.groupId
  }
  if (groups.length !== 1 || layout?.type !== 'leaf' || !hasConversation(layout.groupId))
    return undefined
  return state.createEmptySplitGroup(worktreeId, layout.groupId, 'right') ?? undefined
}

export function platformReviewTargetGroup(worktreeId: string): string | undefined {
  if (
    typeof window === 'undefined' ||
    !['/studio', '/workbench/web-index.html'].includes(window.location.pathname) ||
    typeof window.matchMedia !== 'function' ||
    !window.matchMedia('(min-width: 1120px)').matches ||
    !document.querySelector('[data-workbench-panel-overlay="none"]')
  )
    return undefined
  return resolvePlatformReviewGroup(useAppStore.getState(), worktreeId)
}
