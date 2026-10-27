// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FEATURE_TIPS } from '../../../../shared/feature-tips'
import { useManagementSurface } from '../ui/management-surface'
import { CliSetupTipDialog } from './CliSetupTipDialog'

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => children,
  DialogContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children, className }: { children: ReactNode; className?: string }) => (
    <footer className={className}>{children}</footer>
  )
}))
vi.mock('./CliFeatureTipVisual', () => ({ CliFeatureTipVisual: () => null }))
vi.mock('./CliSkillSetupTerminal', () => ({
  CliSkillSetupTerminal: () => (
    <div data-testid="live-terminal" data-management={String(useManagementSurface())} />
  )
}))

afterEach(cleanup)

it('keeps the real CLI terminal outside the management DOM and portal context', () => {
  const tip = FEATURE_TIPS.find((entry) => entry.action === 'setup-cli')!
  render(
    <CliSetupTipDialog
      open
      tip={tip}
      primaryBusy={false}
      skillTerminalOpen
      onOpenChange={() => {}}
      onPrimaryAction={() => {}}
      onSkip={() => {}}
    />
  )
  const terminal = screen.getByTestId('live-terminal')
  expect(terminal.closest('.ce-management-surface')).toBeNull()
  expect(terminal.getAttribute('data-management')).toBe('false')
  expect(
    screen.getByRole('button', { name: 'Done' }).closest('.ce-management-surface')
  ).toBeNull()
})
