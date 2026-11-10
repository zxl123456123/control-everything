// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_TIPS, type FeatureTip } from '../../../../shared/feature-tips'
import { CmdJPaletteTipDialog } from './CmdJPaletteTipDialog'
import { i18n, setRendererUiLanguage } from '@/i18n/i18n'

const shortcutLabelMock = vi.hoisted(() => vi.fn(() => '⌘J'))
const formatShortcutLabelMock = vi.hoisted(() => vi.fn(() => '⌘J'))

vi.mock('@/hooks/useShortcutLabel', () => ({
  useShortcutLabel: shortcutLabelMock,
  formatShortcutLabel: formatShortcutLabelMock
}))

vi.mock('./CmdJPaletteFeatureTipVisual', () => ({
  CmdJPaletteFeatureTipVisual: () => <div data-testid="palette-visual" />
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({
    children,
    className,
    'data-feature-tip-layout': layout
  }: {
    children: ReactNode
    className: string
    'data-feature-tip-layout': string
  }) => (
    <div className={className} data-feature-tip-layout={layout}>
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h1>{children}</h1>
}))

vi.mock('./FeatureTipActions', () => ({
  FeatureTipActions: ({
    label,
    onPrimaryAction
  }: {
    label: string
    onPrimaryAction: () => void
  }) => (
    <button data-testid="feature-tip-actions" onClick={onPrimaryAction}>
      {label}
    </button>
  )
}))

function getCmdJPaletteTip(): FeatureTip {
  const tip = FEATURE_TIPS.find((entry) => entry.id === 'cmd-j-palette')
  if (!tip) {
    throw new Error('Expected cmd-j-palette feature tip fixture')
  }
  return { ...tip }
}

const paletteTip = getCmdJPaletteTip()

function renderDialog(): string {
  return renderToStaticMarkup(
    <CmdJPaletteTipDialog
      open
      tip={paletteTip}
      primaryBusy={false}
      onOpenChange={vi.fn()}
      onPrimaryAction={vi.fn()}
      onSkip={vi.fn()}
      onRebindClick={vi.fn()}
    />
  )
}

describe('CmdJPaletteTipDialog', () => {
  beforeEach(async () => {
    window.history.replaceState(null, '', '/')
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    document.body.replaceChildren()
    window.history.replaceState(null, '', '/')
  })

  it('shows a tip badge so the dialog reads as education, not a new feature', () => {
    const html = renderDialog()

    expect(html).toContain('Tip')
    expect(html).toContain('data-testid="palette-visual"')
    expect(html).toContain('data-feature-tip-layout="illustrated"')
  })

  it('inlines the live shortcut label in the title', () => {
    shortcutLabelMock.mockReturnValue('⌘J')

    const html = renderDialog()

    expect(html).toContain('Jump to a worktree with')
    expect(html).toContain('⌘J')
  })

  it('falls back to the default shortcut label when the binding is unassigned', () => {
    shortcutLabelMock.mockReturnValue('Unassigned')
    formatShortcutLabelMock.mockReturnValue('Ctrl+Shift+J')

    const html = renderDialog()

    expect(formatShortcutLabelMock).toHaveBeenCalledWith('worktree.palette')
    expect(html).toContain('Ctrl+Shift+J')
    expect(html).not.toContain('Unassigned')
  })

  it('keeps the rebind guidance inside the dialog description', () => {
    const html = renderDialog()

    expect(html).toContain('Settings → Shortcuts')
    expect(html).toContain('spin up a new worktree')
  })

  it.each(['/studio', '/workbench/web-index.html'])(
    'keeps the platform tip compact and actionable on %s',
    async (pathname) => {
      window.history.replaceState(null, '', pathname)
      await setRendererUiLanguage('zh')
      shortcutLabelMock.mockReturnValue('Ctrl+Shift+J')
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      const acknowledge = vi.fn()
      const rebind = vi.fn()
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)
      try {
        await act(async () =>
          root.render(
            <CmdJPaletteTipDialog
              open
              tip={paletteTip}
              primaryBusy={false}
              onOpenChange={vi.fn()}
              onPrimaryAction={acknowledge}
              onSkip={vi.fn()}
              onRebindClick={rebind}
            />
          )
        )
        expect(container.querySelector('[data-feature-tip-layout="compact"]')).toBeTruthy()
        expect(container.querySelector('[data-testid="palette-visual"]')).toBeNull()
        expect(container.querySelector('h1')?.textContent).toBe('用 Ctrl+Shift+J 快速切换工作区')
        expect(container.textContent).toContain('知道了')
        expect(container.textContent).not.toContain('Jump to a worktree')
        const settings = Array.from(container.querySelectorAll('button')).find(
          (button) => button.textContent === '设置 → 快捷键'
        )
        expect(settings).toBeTruthy()
        await act(async () => settings?.click())
        expect(rebind).toHaveBeenCalledTimes(1)
        await act(async () =>
          container.querySelector<HTMLButtonElement>('[data-testid="feature-tip-actions"]')?.click()
        )
        expect(acknowledge).toHaveBeenCalledTimes(1)
      } finally {
        await act(async () => root.unmount())
      }
    }
  )
})
