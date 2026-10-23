// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '../components/ui/dialog'

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.platformView
})
const switchSurface = (value: string) =>
  act(() => {
    document.documentElement.dataset.platformView = value
    window.dispatchEvent(new Event('platform-surface-change'))
  })

it('defers an asynchronous developer dialog while the business editor is visible', () => {
  switchSurface('studio')
  const ui = (open: boolean) => (
    <Dialog open={open}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Developer request</DialogTitle>
      </DialogContent>
    </Dialog>
  )
  const { rerender } = render(ui(false))
  rerender(ui(true))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.body.style.pointerEvents).not.toBe('none')
  switchSurface('workspace')
  expect(screen.getByRole('dialog')).toBeTruthy()
})

it('preserves ordinary uncontrolled dialog behavior outside the platform', () => {
  render(
    <Dialog>
      <DialogTrigger>Open fixture</DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>Standalone request</DialogTitle>
      </DialogContent>
    </Dialog>
  )
  fireEvent.click(screen.getByText('Open fixture'))
  expect(screen.getByRole('dialog')).toBeTruthy()
})
