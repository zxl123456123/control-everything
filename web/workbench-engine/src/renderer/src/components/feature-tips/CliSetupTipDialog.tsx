import type { JSX } from 'react'
import type { FeatureTip } from '../../../../shared/feature-tips'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { CliFeatureTipVisual } from './CliFeatureTipVisual'
import { CliSkillSetupTerminal } from './CliSkillSetupTerminal'
import { FeatureTipActions } from './FeatureTipActions'

function WorktreePromptTerm({ children }: { children: string }): JSX.Element {
  return (
    <span className="rounded-sm bg-foreground/10 px-1 py-0.5 font-medium text-foreground">
      {children}
    </span>
  )
}

export function CliSetupTipDialog({
  open,
  tip,
  primaryBusy,
  skillTerminalOpen,
  onOpenChange,
  onPrimaryAction,
  onSkip
}: {
  open: boolean
  tip: FeatureTip
  primaryBusy: boolean
  skillTerminalOpen: boolean
  onOpenChange: (open: boolean) => void
  onPrimaryAction: () => void
  onSkip: () => void
}): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Why: only the copy and footer are management surfaces; the live terminal stays compact. */}
      <DialogContent
        className="!flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden bg-background p-0 sm:max-w-[820px] md:!flex-row"
        showCloseButton={!skillTerminalOpen}
      >
        <div
          className={`scrollbar-sleek flex min-h-0 min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6 pt-16 md:pt-6 ${
            skillTerminalOpen ? 'basis-auto md:basis-full' : 'basis-auto md:basis-[47.5%]'
          }`}
        >
          <DialogHeader className={`${skillTerminalOpen ? 'gap-2' : 'gap-4'} text-left`}>
            <div className="ce-management-surface">
              <DialogTitle
                className={`text-xl font-semibold leading-7 tracking-normal ${
                  skillTerminalOpen ? 'max-w-2xl' : 'max-w-[22rem]'
                }`}
              >
                {tip.title}
              </DialogTitle>
              <DialogDescription className="mt-3 max-w-2xl text-[15px] leading-6">
                {tip.description}
              </DialogDescription>
              <div
                aria-hidden={skillTerminalOpen}
                className={`max-w-sm space-y-2 overflow-hidden rounded-md border text-sm leading-relaxed text-muted-foreground transition-[max-height,opacity,transform,margin,padding,border-color] duration-300 ease-out motion-reduce:transition-none ${
                  skillTerminalOpen
                    ? 'pointer-events-none mt-0 max-h-0 -translate-y-2 border-transparent p-0 opacity-0'
                    : 'mt-3 max-h-64 translate-y-0 border-border/70 bg-muted/35 p-3 opacity-100'
                }`}
              >
                <p className="font-medium text-foreground">
                  {translate(
                    'auto.components.feature.tips.FeatureTipsModal.4795ac2d4a',
                    'Try asking:'
                  )}
                </p>
                <p>
                  {translate(
                    'auto.components.feature.tips.FeatureTipsModal.55846c7f95',
                    '“Split this PR into two'
                  )}
                  <WorktreePromptTerm>
                    {translate(
                      'auto.components.feature.tips.FeatureTipsModal.27c567a89c',
                      'worktrees'
                    )}
                  </WorktreePromptTerm>{' '}
                  {translate(
                    'auto.components.feature.tips.FeatureTipsModal.7fc6f02099',
                    'and create PRs for each.”'
                  )}
                </p>
                <p>
                  {translate(
                    'auto.components.feature.tips.FeatureTipsModal.864e2db28f',
                    '“When the agent in'
                  )}
                  <WorktreePromptTerm>
                    {translate(
                      'auto.components.feature.tips.FeatureTipsModal.298301b7a0',
                      'worktree'
                    )}
                  </WorktreePromptTerm>{' '}
                  {translate(
                    'auto.components.feature.tips.FeatureTipsModal.3c6c478462',
                    'X finishes, send it the review task.”'
                  )}
                </p>
              </div>
            </div>
            {skillTerminalOpen ? <CliSkillSetupTerminal /> : null}
          </DialogHeader>

          <DialogFooter className="ce-management-surface mt-0 flex sm:justify-stretch">
            {skillTerminalOpen ? (
              <Button className="w-full" onClick={onSkip}>
                {translate('auto.components.feature.tips.FeatureTipsModal.c169298e4d', 'Done')}
              </Button>
            ) : (
              <FeatureTipActions
                currentTip={tip}
                primaryBusy={primaryBusy}
                onPrimaryAction={onPrimaryAction}
                onSkip={onSkip}
                showSkip={false}
                fullWidth
              />
            )}
          </DialogFooter>
        </div>
        <div
          className={`min-h-0 min-w-0 shrink-0 overflow-hidden transition-[flex-basis,max-height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
            skillTerminalOpen
              ? 'pointer-events-none max-h-0 basis-0 md:max-h-none md:basis-0'
              : 'hidden max-h-[40rem] basis-auto md:block md:basis-[52.5%]'
          }`}
        >
          <div
            className={`h-full transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:w-[29.4rem] ${
              skillTerminalOpen ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'
            }`}
          >
            {skillTerminalOpen ? null : <CliFeatureTipVisual />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
