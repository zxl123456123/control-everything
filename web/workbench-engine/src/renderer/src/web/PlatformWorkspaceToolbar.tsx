import { GitBranch, LayoutGrid } from 'lucide-react'
import { useAppStore } from '../store'
import { TOGGLE_WORKSPACE_BOARD_EVENT } from '../components/sidebar/useWorkspaceBoardPanel'

/** Platform chrome shares the native workspace identity and board owner. */
export function PlatformWorkspaceToolbar(): React.JSX.Element {
  const workspace = useAppStore((state) => state.activeWorktreeId
    ? state.getKnownWorktreeById(state.activeWorktreeId, state.activeWorkspaceExecutionHostId ?? undefined)
    : null)
  const name = workspace?.displayName || '工作区'
  const branch = workspace?.branch?.replace(/^refs\/heads\//, '')
  const showOverview = () => {
    if (!useAppStore.getState().sidebarOpen) useAppStore.getState().toggleSidebar()
    window.dispatchEvent(new Event(TOGGLE_WORKSPACE_BOARD_EVENT))
  }

  return (
    <div className="platform-workspace-toolbar">
      <div className="platform-workspace-heading">
        <h1 title={name}>{name}</h1>
      </div>
      {branch && branch !== name && (
        <span className="platform-workspace-branch" title={branch}>
          <GitBranch size={13} aria-hidden="true" />{branch}
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
