import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { CornerDownLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { isCurrentPlatformIosWeb } from '@/lib/ios-web-platform'
import type { ManagedPane, PaneManager } from '@/lib/pane-manager/pane-manager'
import type { PtyTransport } from './pty-transport-types'
import {
  installTerminalImeCompositionTracker,
  type TerminalImeCompositionTracker
} from './terminal-ime-composition-tracker'
import { hasPendingTerminalImeComposition } from './terminal-ime-composition-route'

type Props = {
  pane: ManagedPane
  managerRef: RefObject<PaneManager | null>
  paneTransportsRef: RefObject<Map<number, PtyTransport>>
}

export function TerminalTouchControls({ pane, managerRef, paneTransportsRef }: Props) {
  const iosWeb = isCurrentPlatformIosWeb()
  const compositionRef = useRef<TerminalImeCompositionTracker | null>(null)
  const [composing, setComposing] = useState(false)
  const [, refreshConnection] = useState(0)
  const transport = paneTransportsRef.current.get(pane.id)
  const ptyId = transport?.getPtyId() ?? null

  useEffect(() => {
    if (!iosWeb) return
    const element = pane.terminal.element
    const tracker = installTerminalImeCompositionTracker(element)
    compositionRef.current = tracker
    const update = () => setComposing(tracker.isActive())
    const events = ['compositionstart', 'compositionupdate', 'compositionend', 'input', 'blur']
    for (const event of events) element?.addEventListener(event, update, true)
    // Initial connection does not necessarily update the parent's recovery banner state.
    const connection = new MutationObserver(() => refreshConnection((value) => value + 1))
    connection.observe(pane.container, {
      attributes: true,
      attributeFilter: ['data-pty-recovery-state']
    })
    update()
    return () => {
      connection.disconnect()
      for (const event of events) element?.removeEventListener(event, update, true)
      tracker.dispose()
      compositionRef.current = null
    }
  }, [iosWeb, pane])

  if (!iosWeb) return null

  const disabled =
    composing ||
    pane.terminal.options.disableStdin === true ||
    !transport?.isConnected() ||
    ptyId === null
  const enter = () => {
    const activePane = managerRef.current?.getActivePane()
    if (
      activePane?.id !== pane.id ||
      activePane.terminal !== pane.terminal ||
      !transport ||
      paneTransportsRef.current.get(pane.id) !== transport ||
      ptyId === null ||
      transport.getPtyId() !== ptyId ||
      !transport.isConnected() ||
      pane.terminal.options.disableStdin ||
      compositionRef.current?.isActive() ||
      hasPendingTerminalImeComposition(pane.terminal.element)
    )
      return
    // Keep the normal input route's ownership, replay and recovery checks.
    pane.terminal.input('\r', true)
  }
  const label = translate('terminal-touch-controls.enter', 'Enter')

  return createPortal(
    // Keep Return at the pane top instead of placing it below the iOS keyboard.
    <div className="absolute right-2 top-10 z-30" data-terminal-touch-controls>
      <Button
        type="button"
        variant="secondary"
        className="h-11 min-w-11 touch-manipulation gap-2 px-3 shadow-sm"
        aria-label={label}
        disabled={disabled}
        onPointerDown={(event) => event.preventDefault()}
        onClick={enter}
      >
        <CornerDownLeft className="size-4" aria-hidden="true" />
        {label}
      </Button>
    </div>,
    pane.container
  )
}
