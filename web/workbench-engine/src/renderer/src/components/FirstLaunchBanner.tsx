// First-launch telemetry notice shown only to pre-telemetry users (existedBeforeTelemetryRelease && optedIn === null),
// who installed under a "no telemetry" contract; new users are covered by install-time disclosure.
// Got it / ✕ silently opt in; "Turn off" explicitly opts out. See telemetry-plan.md §First-launch experience.

import { useState } from 'react'
import { X } from 'lucide-react'

import { Button } from './ui/button'
import { acknowledgeBanner, PRIVACY_URL, setOptIn as telemetrySetOptIn } from '../lib/telemetry'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'

type FirstLaunchBannerProps = {
  onResolve: () => void
  fetchSettings: () => Promise<void>
}

export function FirstLaunchBanner({
  onResolve,
  fetchSettings
}: FirstLaunchBannerProps): React.JSX.Element {
  // Double-click guard: a second Turn-off click would re-derive `via` as 'settings', mis-tagging one opt-out as two.
  const [inFlight, setInFlight] = useState(false)
  const mountedRef = useMountedRef()

  const handleAcknowledge = async (): Promise<void> => {
    if (inFlight) {
      return
    }
    setInFlight(true)
    // acknowledgeBanner doesn't broadcast settings:changed, so refetch or the store keeps optedIn: null.
    try {
      await acknowledgeBanner()
      await fetchSettings()
      if (mountedRef.current) {
        onResolve()
      }
    } finally {
      // Reset inFlight so a fetchSettings rejection doesn't leave every button permanently disabled.
      if (mountedRef.current) {
        setInFlight(false)
      }
    }
  }

  const handleTurnOff = async (): Promise<void> => {
    if (inFlight) {
      return
    }
    setInFlight(true)
    // Route through telemetrySetOptIn(false) so main derives `via` and fires telemetry_opted_out before disabling the SDK.
    try {
      await telemetrySetOptIn(false)
      await fetchSettings()
      if (mountedRef.current) {
        onResolve()
      }
    } finally {
      if (mountedRef.current) {
        setInFlight(false)
      }
    }
  }

  return (
    // Fixed non-modal overlay; centered + narrow so it clears the macOS traffic lights.
    // The positioned banner anchors its close control without covering the copy.
    <div
      className="ce-management-surface fixed left-1/2 top-4 z-40 flex max-h-[calc(100dvh-2rem)] w-[min(44.625rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-start gap-4 overflow-y-auto rounded-2xl border border-border bg-background p-6 pr-16 shadow-floating"
      role="region"
      aria-label={translate('auto.components.FirstLaunchBanner.fcbee32f08', 'Telemetry notice')}
      aria-live="polite"
    >
      {/* Copy and actions wrap independently on narrow windows. */}
      <div className="min-w-0 flex-1 basis-72 space-y-2 text-sm">
        <p className="text-lg font-semibold leading-[26px]">
          {translate('management.telemetry.noticeTitle', 'Anonymous usage statistics')}
        </p>
        <p className="text-sm leading-[22px] text-muted-foreground">
          {translate(
            'management.telemetry.noticeDescription',
            'Anonymous statistics count feature usage without file contents, prompts, terminal output, or identifying information. Continuing or closing this notice enables statistics; you can opt out instead and change this later in Settings → Privacy.'
          )}{' '}
          <button
            type="button"
            className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground"
            onClick={() => void window.api.shell.openUrl(PRIVACY_URL)}
          >
            {translate('auto.components.FirstLaunchBanner.d1deebb050', 'Privacy policy')}
          </button>
          .
        </p>
      </div>
      {/* Action column — "Got it" primary reads as the easy path; "Turn off" outline marks the explicit opt-out. */}
      <div className="flex flex-wrap items-center gap-2 self-center">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTurnOff}
          disabled={inFlight}
          className="border-border/60 text-muted-foreground"
        >
          {translate('management.telemetry.optOut', 'Turn off statistics')}
        </Button>
        <Button size="sm" onClick={handleAcknowledge} disabled={inFlight}>
          {translate('management.telemetry.acknowledge', 'Acknowledge and continue')}
        </Button>
      </div>
      {/* Closing acknowledges the notice and persists opt-in through the original IPC path. */}
      <button
        type="button"
        aria-label={translate('management.telemetry.dismiss', 'Acknowledge and close notice')}
        onClick={handleAcknowledge}
        disabled={inFlight}
        className="absolute right-3 top-3 grid size-11 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
