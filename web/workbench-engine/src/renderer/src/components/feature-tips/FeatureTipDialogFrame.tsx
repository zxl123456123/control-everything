import type { ComponentProps, JSX, ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ManagementSurfaceProvider } from '@/components/ui/management-surface'

/** Shared two-column tip layout: copy and actions on the left, a feature visual on the right. */
export function FeatureTipDialogFrame({
  open,
  onOpenChange,
  onOpenAutoFocus,
  visual,
  children
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenAutoFocus: ComponentProps<typeof DialogContent>['onOpenAutoFocus']
  visual: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <ManagementSurfaceProvider value>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="!flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[820px] md:!flex-row"
          showCloseButton
          onOpenAutoFocus={onOpenAutoFocus}
        >
          <div className="scrollbar-sleek flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6 pt-16 md:basis-1/2 md:pt-6">
            {children}
          </div>
          <div className="hidden min-h-0 min-w-0 self-stretch overflow-hidden bg-muted md:flex md:basis-1/2 md:border-l md:border-border">
            <div className="h-full min-h-[23rem] w-full">{visual}</div>
          </div>
        </DialogContent>
      </Dialog>
    </ManagementSurfaceProvider>
  )
}

export function FeatureTipEyebrow({ label }: { label: string }): JSX.Element {
  return (
    <Badge
      variant="outline"
      className="mb-3 rounded-md px-2 py-0.5 text-[13px] font-medium tracking-normal text-muted-foreground"
    >
      {label}
    </Badge>
  )
}

/** A muted "Change it anytime in Settings → X." line whose link leaves the tip for Settings. */
export function FeatureTipSettingsLine({
  lead,
  link,
  onClick
}: {
  lead: string
  link: string
  onClick: () => void
}): JSX.Element {
  return (
    <span className="block text-muted-foreground">
      {lead}{' '}
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-h-11 items-center appearance-none border-0 bg-transparent p-0 font-medium text-foreground underline decoration-foreground/30 underline-offset-2 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:decoration-foreground"
      >
        {link}
      </button>
      .
    </span>
  )
}
