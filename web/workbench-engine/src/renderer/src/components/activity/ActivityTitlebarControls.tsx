import { ArrowLeft, Bell } from 'lucide-react'

import { useAppStore } from '@/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useActivityUnreadCount } from './useActivityUnreadCount'
import { translate } from '@/i18n/i18n'

export function ActivityTitlebarControls(): React.JSX.Element {
  const unreadCount = useActivityUnreadCount()
  const closeActivityPage = useAppStore((s) => s.closeActivityPage)

  return (
    <div className="ce-management-surface flex h-full min-w-0 flex-1 items-center gap-4 border-l border-border px-4">
      <div
        className="flex min-w-0 items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Why: Activity hides the worktree sidebar (full-page surface), so the
            sidebar's nav row isn't available as the back path. This Back button
            is the dedicated exit, mirroring Settings' onBack pattern. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              onClick={closeActivityPage}
              aria-label={translate(
                'auto.components.activity.ActivityTitlebarControls.dc708f3eff',
                'Close agents'
              )}
            >
              <ArrowLeft className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate(
              'auto.components.activity.ActivityTitlebarControls.dc708f3eff',
              'Close agents'
            )}
          </TooltipContent>
        </Tooltip>
        <Bell className="size-3.5 shrink-0 text-muted-foreground" />
        <h1 className="truncate text-lg font-semibold leading-[26px]">
          {translate('auto.components.activity.ActivityTitlebarControls.d6a8de3934', 'agents')}
        </h1>
        <Badge variant="secondary" className="min-h-6 px-2 text-[13px] font-normal">
          {unreadCount}{' '}
          {translate('auto.components.activity.ActivityTitlebarControls.f915168c8e', 'unread')}
        </Badge>
      </div>
    </div>
  )
}
