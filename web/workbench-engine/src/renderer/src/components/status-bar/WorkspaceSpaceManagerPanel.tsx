import { ManagementSurfaceProvider } from '@/components/ui/management-surface'
import { useWorkspaceSpaceManagerPanel } from './use-workspace-space-manager-panel'
import { WorkspaceSpaceManagerView } from './workspace-space-manager-view'

export { getWorkspaceDecisionDetails } from './workspace-space-decision-details'

export function WorkspaceSpaceManagerPanel(): React.JSX.Element {
  const model = useWorkspaceSpaceManagerPanel()
  return (
    <ManagementSurfaceProvider value={true}>
      <div className="ce-management-surface flex min-h-0 flex-1 flex-col">
        <WorkspaceSpaceManagerView model={model} />
      </div>
    </ManagementSurfaceProvider>
  )
}
