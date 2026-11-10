// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { i18n, setRendererUiLanguage } from '../../i18n/i18n'
import { CrashReportDialogSurface } from './CrashReportDialogSurface'

vi.mock('./use-crash-report-copy', () => ({ useCrashReportCopy: () => vi.fn() }))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? children : null),
  DialogContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div role="dialog" className={className}>
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>
}))

beforeEach(async () => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { gh: { viewer: vi.fn().mockResolvedValue(null) } }
  })
  await i18n.changeLanguage('en')
})
afterEach(async () => {
  cleanup()
  await i18n.changeLanguage('en')
})

it.each([
  ['en', 'Problem diagnostics', 'Additional details (optional)', 'Optional: describe the problem'],
  ['zh', '问题诊断', '补充说明（可选）', '可选：描述发生的问题']
] as const)(
  'renders the original diagnostic form with localized labels in %s',
  async (language, title, label, placeholder) => {
    await setRendererUiLanguage(language)
    const close = vi.fn()
    render(
      <CrashReportDialogSurface
        open
        report={null}
        loading={false}
        onOpenChange={close}
        onReportChange={() => {}}
      />
    )
    await waitFor(() => expect(window.api.gh.viewer).toHaveBeenCalledOnce())
    expect(screen.getByRole('heading', { name: title })).toBeTruthy()
    const notes = screen.getByRole('textbox', { name: label }) as HTMLTextAreaElement
    expect(notes.placeholder).toBe(placeholder)
    fireEvent.change(notes, { target: { value: 'diagnostic draft' } })
    expect(notes.value).toBe('diagnostic draft')
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true')
  }
)
