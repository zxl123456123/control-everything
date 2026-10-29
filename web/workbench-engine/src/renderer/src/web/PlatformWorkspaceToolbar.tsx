import { GitBranch, LayoutGrid } from 'lucide-react'
import { useAppStore } from '../store'
import { TOGGLE_WORKSPACE_BOARD_EVENT } from '../components/sidebar/useWorkspaceBoardPanel'

/** Platform chrome shares the native workspace identity and board owner. */
export function PlatformWorkspaceToolbar(): React.JSX.Element {
  const workspace = useAppStore((state) => state.activeWorktreeId
    ? state.getKnownWorktreeById(state.activeWorktreeId, state.activeWorkspaceExecutionHostId ?? undefined)
    : null)
  const showOverview = () => {
    if (!useAppStore.getState().sidebarOpen) useAppStore.getState().toggleSidebar()
    window.dispatchEvent(new Event(TOGGLE_WORKSPACE_BOARD_EVENT))
  }

  return (
    <div className="platform-workspace-toolbar">
      <div className="platform-workspace-heading">
        <span>当前工作区</span>
        <h1 title={workspace?.displayName || '工作区'}>{workspace?.displayName || '工作区'}</h1>
      </div>
      {workspace?.branch && (
        <span className="platform-workspace-branch" title={workspace.branch}>
          <GitBranch size={13} aria-hidden="true" />{workspace.branch.replace(/^refs\/heads\//, '')}
        </span>
      )}
      <div className="platform-workspace-actions">
        <button type="button" onClick={showOverview} data-workspace-board-trigger="">
          <LayoutGrid size={15} aria-hidden="true" /><span>工作区总览</span>
        </button>
      </div>
    </div>
  )
}
