import type { JSX } from 'react'
import type { FeatureTip } from '../../../../shared/feature-tips'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatShortcutLabel, useShortcutLabel } from '@/hooks/useShortcutLabel'
import { CmdJPaletteFeatureTipVisual } from './CmdJPaletteFeatureTipVisual'
import { FeatureTipActions } from './FeatureTipActions'
import {
  FeatureTipDialogFrame,
  FeatureTipEyebrow,
  FeatureTipSettingsLine
} from './FeatureTipDialogFrame'
import { translate } from '@/i18n/i18n'

export function CmdJPaletteTipDialog({
  open,
  tip,
  primaryBusy,
  onOpenChange,
  onPrimaryAction,
  onSkip,
  onRebindClick
}: {
  open: boolean
  tip: FeatureTip
  primaryBusy: boolean
  onOpenChange: (open: boolean) => void
  onPrimaryAction: () => void
  onSkip: () => void
  onRebindClick: () => void
}): JSX.Element {
  const platformMode =
    typeof window !== 'undefined' &&
    ['/studio', '/workbench/web-index.html'].includes(window.location.pathname)
  // Why: read the live binding so the title chip stays correct after a rebind
  // and on Linux/Windows (Ctrl+Shift+J) — matching the visual's key chips.
  const worktreePaletteShortcutLabel = useShortcutLabel('worktree.palette')
  const displayShortcutLabel =
    worktreePaletteShortcutLabel !== 'Unassigned'
      ? worktreePaletteShortcutLabel
      : formatShortcutLabel('worktree.palette')
  // The tip's title uses "<shortcut>" as a placeholder token; split it so we
  // can render the live label as a styled <kbd> chip inline. Missing token
  // degrades to the plain title.
  const titleParts = translate('platform.tip.palette.title', tip.title).split('<shortcut>')
  const titlePrefix = titleParts[0]
  const titleSuffix = titleParts.slice(1).join('<shortcut>')

  // Why: match the horizontal layout (text left, visual/animation right) used by the
  // CLI tip for a consistent "feature education" presentation; keeps the palette demo
  // prominent on the right.
  return (
    <FeatureTipDialogFrame
      open={open}
      onOpenChange={onOpenChange}
      // Why: Radix auto-focuses the first focusable child; without this the
      // inline rebind link in the description gets the focus ring on open.
      onOpenAutoFocus={(event) => event.preventDefault()}
      visual={platformMode ? undefined : <CmdJPaletteFeatureTipVisual />}
    >
      <DialogHeader className="gap-4 text-left">
        <div>
          {/* Why: uppercase eyebrow reads as a category label, not a feature launch. */}
          <FeatureTipEyebrow label={translate('platform.tip.palette.eyebrow', tip.eyebrow)} />
          {/* Why: flow the shortcut chip as inline text (not a flex item) so the
                short Mac label (⌘⇧J) stays on one line, while a wide label like
                "Ctrl+Shift+J" wraps to the next line only when it doesn't fit —
                instead of being pushed to the right edge on Win/Linux. */}
          <DialogTitle
            className={
              platformMode
                ? 'text-xl font-semibold leading-snug tracking-tight'
                : 'text-2xl font-semibold leading-tight tracking-tight md:text-[1.75rem]'
            }
          >
            {titlePrefix.trimEnd()}
            {displayShortcutLabel ? (
              <>
                {' '}
                <kbd className="ml-0.5 inline-flex items-center whitespace-nowrap rounded-md border border-border bg-card px-2 py-0.5 align-middle font-mono text-base font-medium text-foreground">
                  {displayShortcutLabel}
                </kbd>
              </>
            ) : null}
            {titleSuffix ? ` ${titleSuffix.trimStart()}` : null}
          </DialogTitle>
          <DialogDescription className="mt-3 max-w-2xl space-y-3 text-sm leading-relaxed">
            <span className="block">
              {translate('platform.tip.palette.description', tip.description)}
            </span>
            <FeatureTipSettingsLine
              lead={translate(
                'auto.components.feature.tips.CmdJPaletteTipDialog.8241897205',
                'Rebind the shortcut anytime in'
              )}
              link={translate(
                'auto.components.feature.tips.CmdJPaletteTipDialog.c0bb9f869b',
                'Settings → Shortcuts'
              )}
              onClick={onRebindClick}
            />
          </DialogDescription>
        </div>
      </DialogHeader>

      <DialogFooter className={platformMode ? 'mt-4 flex' : 'mt-8 flex sm:justify-stretch'}>
        <FeatureTipActions
          currentTip={tip}
          primaryBusy={primaryBusy}
          onPrimaryAction={onPrimaryAction}
          onSkip={onSkip}
          showSkip={false}
          fullWidth={!platformMode}
          label={translate('platform.tip.palette.acknowledge', tip.ctaLabel)}
        />
      </DialogFooter>
    </FeatureTipDialogFrame>
  )
}
