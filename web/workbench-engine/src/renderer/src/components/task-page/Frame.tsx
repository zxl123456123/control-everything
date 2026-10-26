import { translate } from '@/i18n/i18n'
import type { TaskPageComposerActionsModel } from '../use-task-page-composer-actions'
import { TaskPageListChrome } from './ListChrome'
import { TaskPageContent } from './Content'
export function TaskPageFrame({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element | null {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="mx-auto flex min-h-0 min-w-0 w-full flex-1 flex-col px-4 py-6 md:px-8 md:py-8">
        {!model.taskPageListChromeHidden && (
          <h1 className="mb-6 shrink-0 text-2xl font-bold leading-8">
            {translate('auto.components.task.page.TaskPage.title', 'Tasks')}
          </h1>
        )}
        <TaskPageListChrome model={model} />

        <TaskPageContent model={model} />
      </div>
    </div>
  )
}
