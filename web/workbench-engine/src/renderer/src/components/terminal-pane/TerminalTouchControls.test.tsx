/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ManagedPane, PaneManager } from '@/lib/pane-manager/pane-manager'
import type { PtyTransport } from './pty-transport-types'
import { TerminalTouchControls } from './TerminalTouchControls'
import {
  installTerminalImeCompositionRoute,
  XTERM_COMPOSITION_SESSION_START_EVENT
} from './terminal-ime-composition-route'

vi.mock('@/i18n/i18n', () => ({
  translate: (key: string, fallback: string) =>
    key === 'terminal-touch-controls.enter' ? '回车' : fallback
}))

const mounted: { root: Root; container: HTMLElement; pane: ManagedPane }[] = []

function fixture(ios = true, initiallyConnected = true) {
  vi.stubGlobal('navigator', {
    userAgent: ios ? 'iPhone; CPU iPhone OS 18_0 like Mac OS X' : 'Macintosh; Intel Mac OS X',
    maxTouchPoints: ios ? 5 : 0
  })
  const element = document.createElement('div')
  const textarea = document.createElement('textarea')
  element.appendChild(textarea)
  const input = vi.fn()
  const options = { disableStdin: false }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const paneContainer = document.createElement('div')
  paneContainer.appendChild(element)
  document.body.appendChild(paneContainer)
  // Only terminal input, its existing DOM and pane identity are exercised here.
  const pane = {
    id: 1,
    container: paneContainer,
    terminal: { element, textarea, options, input }
  } as unknown as ManagedPane
  let activePane: ManagedPane = pane
  let ptyId: string | null = initiallyConnected ? 'pty-1' : null
  let connected = initiallyConnected
  const sendInput = vi.fn()
  const transport = {
    getPtyId: () => ptyId,
    isConnected: () => connected,
    sendInput
  } as unknown as PtyTransport
  const managerRef = {
    current: { getActivePane: () => activePane } as PaneManager
  }
  const paneTransportsRef = { current: new Map([[pane.id, transport]]) }
  const root = createRoot(container)
  mounted.push({ root, container, pane })
  act(() =>
    root.render(
      <TerminalTouchControls
        pane={pane}
        managerRef={managerRef}
        paneTransportsRef={paneTransportsRef}
      />
    )
  )
  const button = pane.container.querySelector('button')
  const click = () => act(() => button?.click())
  return {
    pane,
    textarea,
    input,
    options,
    transport,
    paneTransportsRef,
    button,
    click,
    sendInput,
    setConnected: (value: boolean) => {
      connected = value
    },
    setPty: (value: string) => {
      ptyId = value
    },
    switchPane: () => {
      activePane = { ...pane, id: 2 }
    }
  }
}

afterEach(() => {
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount())
    item.container.remove()
    item.pane.container.remove()
  }
  vi.unstubAllGlobals()
})

describe('iOS terminal Return control', () => {
  it('shows a labelled 44px top control and sends exactly one normal xterm Enter', () => {
    const f = fixture()
    expect(f.button?.textContent).toContain('回车')
    expect(f.button?.getAttribute('aria-label')).toBe('回车')
    expect(f.button?.classList.contains('h-11')).toBe(true)
    expect(f.button?.parentElement?.classList.contains('top-10')).toBe(true)
    expect(f.button?.parentElement?.classList.contains('bottom-0')).toBe(false)
    const pointer = new Event('pointerdown', { bubbles: true, cancelable: true })
    act(() => f.button?.dispatchEvent(pointer))
    expect(pointer.defaultPrevented).toBe(true)
    f.click()
    expect(f.input).toHaveBeenCalledTimes(1)
    expect(f.input).toHaveBeenCalledWith('\r', true)
    expect(f.sendInput).not.toHaveBeenCalled()
  })

  it('does not add a control to a desktop browser', () => {
    const f = fixture(false)
    expect(f.button).toBeNull()
  })

  it('enables after the first PTY connection without an unrelated parent render', async () => {
    const f = fixture(true, false)
    expect(f.button?.disabled).toBe(true)
    f.setPty('pty-1')
    f.setConnected(true)
    await act(async () => {
      f.pane.container.dataset.ptyRecoveryState = 'connected'
      await Promise.resolve()
    })
    expect(f.button?.disabled).toBe(false)
    f.click()
    expect(f.input).toHaveBeenCalledTimes(1)
  })

  it.each(['disabled', 'disconnected', 'replaced-transport', 'changed-pty', 'changed-pane'])(
    'does not submit to a %s input target, even without a React update',
    (state) => {
      const f = fixture()
      if (state === 'disabled') f.options.disableStdin = true
      if (state === 'disconnected') f.setConnected(false)
      if (state === 'replaced-transport') f.paneTransportsRef.current.set(1, { ...f.transport })
      if (state === 'changed-pty') f.setPty('pty-2')
      if (state === 'changed-pane') f.switchPane()
      f.click()
      expect(f.input).not.toHaveBeenCalled()
    }
  )

  it('waits for IME composition to finish instead of executing partial text', () => {
    const f = fixture()
    act(() => f.textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    expect(f.button?.disabled).toBe(true)
    f.click()
    expect(f.input).not.toHaveBeenCalled()
    act(() => f.textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    expect(f.button?.disabled).toBe(false)
    f.click()
    expect(f.input).toHaveBeenCalledTimes(1)
  })

  it('does not overtake a composition still held by the existing PTY route', () => {
    const f = fixture()
    const route = installTerminalImeCompositionRoute({
      terminalElement: f.pane.terminal.element,
      terminal: f.pane.terminal,
      capturedTransport: f.transport,
      getCurrentTransport: () => f.transport
    })
    try {
      f.pane.terminal.element?.dispatchEvent(
        new CustomEvent(XTERM_COMPOSITION_SESSION_START_EVENT, {
          detail: { id: 1 }
        })
      )
      f.click()
      expect(f.input).not.toHaveBeenCalled()
    } finally {
      route.dispose()
    }
  })
})
