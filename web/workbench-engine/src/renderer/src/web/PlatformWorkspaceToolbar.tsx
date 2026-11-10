import { ChevronRight, GitBranch, LayoutGrid } from 'lucide-react'
import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../store'
import { TOGGLE_WORKSPACE_BOARD_EVENT } from '../components/sidebar/useWorkspaceBoardPanel'

/** Platform chrome shares the native workspace identity and board owner. */
export function PlatformWorkspaceToolbar(): React.JSX.Element {
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setHeaderHost(document.getElementById('platform-workspace-controls'))
  }, [])
  const workspace = useAppStore((state) =>
    state.activeWorktreeId
      ? state.getKnownWorktreeById(
          state.activeWorktreeId,
          state.activeWorkspaceExecutionHostId ?? undefined
        )
      : null
  )
  const name = workspace?.displayName || '工作区'
  const branch = workspace?.branch?.replace(/^refs\/heads\//, '')
  const showOverview = () => {
    if (!useAppStore.getState().sidebarOpen) useAppStore.getState().toggleSidebar()
    window.dispatchEvent(new Event(TOGGLE_WORKSPACE_BOARD_EVENT))
  }

  const toolbar = (
    <div className="platform-workspace-toolbar">
      <ChevronRight size={14} className="platform-workspace-separator" aria-hidden="true" />
      <div className="platform-workspace-heading">
        <h1 title={name}>{name}</h1>
      </div>
      {branch && branch !== name && (
        <span className="platform-workspace-branch" title={branch}>
          <GitBranch size={13} aria-hidden="true" />
          {branch}
        </span>
      )}
      <div className="platform-workspace-actions">
        <button
          type="button"
          onClick={showOverview}
          data-workspace-board-trigger=""
          aria-label="工作区总览"
          title="工作区总览"
        >
          <LayoutGrid size={15} aria-hidden="true" />
          <span>工作区总览</span>
        </button>
      </div>
    </div>
  )
  return headerHost ? createPortal(toolbar, headerHost) : toolbar
}
