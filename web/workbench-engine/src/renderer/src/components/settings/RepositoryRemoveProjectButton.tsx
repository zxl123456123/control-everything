import { useContext, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PlatformProjectContext } from '@/web/platform-project-context'
import { Trash2 } from 'lucide-react'
import type { Repo } from '../../../../shared/repo-types'
import type { SettingsProjectRemovalScope } from './settings-project-list'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { SearchableSetting } from './SearchableSetting'
import { translate } from '@/i18n/i18n'

function getRemoveProjectDescription(scope: SettingsProjectRemovalScope, platformMode: boolean): string {
  if (platformMode) return '从常用项目中移除并归档，保留文件、事项、终端和草稿。'
  if (scope === 'checkout') {
    return translate(
      'auto.components.settings.RepositoryPane.removeProjectCheckout',
      'Remove this checkout from Orca. Other checkouts of this project stay.'
    )
  }
  if (scope === 'split-project') {
    return translate(
      'auto.components.settings.RepositoryPane.removeProjectKeepCheckouts',
      'Remove this project from Orca. Checkouts that have their own settings stay.'
    )
  }
  return translate(
    'auto.components.settings.RepositoryPane.removeProjectAllHosts',
    'Remove this project from Orca on all configured hosts.'
  )
}

export function RepositoryRemoveProjectButton({
  repo,
  removalScope,
  forceVisible,
  removeProject
}: {
  repo: Repo
  removalScope: SettingsProjectRemovalScope
  forceVisible: boolean
  removeProject: (repoId: string) => void | Promise<void>
}) {
  const platformMode = useContext(PlatformProjectContext) !== undefined
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const removeProjectLabel =
    confirmingRemove === repo.id ? 'Confirm Remove Project' : 'Remove Project'
  const description = getRemoveProjectDescription(removalScope, platformMode)

  const handleRemoveProject = async (repoId: string) => {
    if (submitting.current) return
    if (confirmingRemove === repoId) {
      submitting.current = true
      setPending(true)
      try {
        await removeProject(repoId)
        setConfirmingRemove(null)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '项目移除失败。')
      } finally {
        submitting.current = false
        setPending(false)
      }
      return
    }

    setConfirmingRemove(repoId)
  }

  return (
    <SearchableSetting
      title={translate('auto.components.settings.RepositoryPane.0909e5d650', 'Remove Project')}
      description={description}
      keywords={[repo.displayName, 'delete', 'project', 'repository']}
      className="absolute top-0 right-0 z-10 w-auto max-w-none"
      forceVisible={forceVisible}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={confirmingRemove === repo.id ? 'destructive' : 'outline'}
            size="icon-sm"
            onClick={() => {
              void handleRemoveProject(repo.id)
            }}
            onBlur={() => {
              if (!submitting.current) setConfirmingRemove(null)
            }}
            aria-label={removeProjectLabel}
            aria-description={platformMode ? description : undefined}
            aria-busy={pending}
            disabled={pending}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {platformMode ? `${removeProjectLabel}：${description}` : removeProjectLabel}
        </TooltipContent>
      </Tooltip>
    </SearchableSetting>
  )
}
