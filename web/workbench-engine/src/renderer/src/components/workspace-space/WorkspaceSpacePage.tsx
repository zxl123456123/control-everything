import { ArrowLeft } from 'lucide-react'
import { Button } from '../ui/button'
import { WorkspaceSpaceManagerPanel } from '../status-bar/WorkspaceSpaceManagerPanel'
import { useAppStore } from '../../store'
import { translate } from '@/i18n/i18n'

export default function WorkspaceSpacePage(): React.JSX.Element {
  const closeSpacePage = useAppStore((state) => state.closeSpacePage)
  const isSeparateWindow = window.location.pathname.endsWith('/space.html')

  return (
    <div className="ce-management-surface mx-auto flex h-full min-h-0 w-full max-w-[1100px] flex-col gap-6 overflow-hidden bg-background p-4 md:p-8">
      <header className="flex shrink-0 flex-wrap items-center gap-4">
        {!isSeparateWindow ? (
          <Button variant="ghost" size="xs" onClick={closeSpacePage} className="min-h-10 w-fit">
            <ArrowLeft className="size-3.5" />
            {translate('auto.components.workspace.space.WorkspaceSpacePage.ecf72fdc3b', 'Back')}
          </Button>
        ) : null}
        <h1 className="text-2xl font-bold leading-8">
          {translate('workspaceSpace.title', 'Workspace storage')}
        </h1>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-[1100px] flex-1 flex-col">
        <WorkspaceSpaceManagerPanel />
      </div>
    </div>
  )
}
