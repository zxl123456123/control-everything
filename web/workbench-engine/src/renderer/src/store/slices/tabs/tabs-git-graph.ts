import { createBrowserUuid } from '@/lib/browser-uuid'
import { getActiveExecutionHostIdForWorktree } from '@/lib/unified-tab-host-ownership'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../../shared/execution-host'
import { runtimeEnvironmentIdUnlessTwin } from '@/lib/resolve-owner'
import { noteDesktopCreatedServerTab } from '@/lib/desktop-created-server-tabs'
import { isFrameDrawnServerWorkspace } from '@/runtime/web-session-tabs-sync/frame-drawn-server-workspaces'
import { openContentTabThroughLayoutOwner } from '@/runtime/layout-owner-content-tab-open'
import { afterPendingTab, isPendingTab } from '@/runtime/layout-owner-pending-tabs'
import { ORCA_LAYOUT_OWNER_IS_MAIN } from '../../../../../shared/layout-owner-switch'
import { translate } from '@/i18n/i18n'
import type { TabsSliceGet } from './tabs-slice-contract'

const opening = new Map<string, string>()

/** One graph per workspace owner; selecting it never creates an editor file or terminal. */
export function openGitGraphTab(
  get: TabsSliceGet,
  worktreeId: string,
  options?: { targetGroupId?: string }
): string {
  const state = get()
  const executionHostId =
    getActiveExecutionHostIdForWorktree(state, worktreeId) ??
    getResolvedExecutionHostIdForWorktree(state, worktreeId) ??
    LOCAL_EXECUTION_HOST_ID
  const surface = (id: string): void => {
    const current = get()
    const tab = current.getTab(id)
    if (!tab) return
    current.focusGroup(worktreeId, tab.groupId)
    current.activateTab(id)
    current.setActiveTabType('git-graph', worktreeId)
  }
  const existing = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
    (tab) => tab.contentType === 'git-graph' && tab.executionHostId === executionHostId
  )
  if (existing) {
    surface(existing.id)
    return existing.id
  }
  const key = JSON.stringify([executionHostId, worktreeId])
  const pending = opening.get(key)
  if (pending && isPendingTab(pending)) return pending

  const id = createBrowserUuid()
  const groupId =
    options?.targetGroupId ??
    state.activeGroupIdByWorktree[worktreeId] ??
    state.ensureWorktreeRootGroup(worktreeId)
  const label = translate('git-graph.title', 'Git Graph')
  const drawHere = (): string => {
    get().createUnifiedTab(worktreeId, 'git-graph', {
      id,
      label,
      targetGroupId: groupId,
      ...(executionHostId ? { executionHostId } : {})
    })
    const environmentId = runtimeEnvironmentIdUnlessTwin(get(), worktreeId)
    if (environmentId && isFrameDrawnServerWorkspace(environmentId, worktreeId)) {
      noteDesktopCreatedServerTab(environmentId, worktreeId, id)
    }
    surface(id)
    return id
  }
  if (
    ORCA_LAYOUT_OWNER_IS_MAIN &&
    openContentTabThroughLayoutOwner(state, {
      worktreeId,
      entityId: id,
      command: { type: 'openGitGraphTab', tabId: id, groupId },
      facts: { label },
      shown: surface,
      drawHere
    })
  ) {
    opening.set(key, id)
    afterPendingTab(id, () => {
      if (opening.get(key) === id) opening.delete(key)
    })
    return id
  }
  return drawHere()
}
