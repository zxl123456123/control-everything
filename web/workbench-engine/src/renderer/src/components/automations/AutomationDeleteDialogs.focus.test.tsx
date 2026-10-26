// @vitest-environment happy-dom
import { createRef } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { AutomationDeleteDialog, ExternalAutomationDeleteDialog } from './AutomationDeleteDialogs'
import { makeAutomation, makeExternalManager } from './automations-page-fixtures'

afterEach(cleanup)

it('opens local deletion on Cancel and Enter cannot confirm accidentally', async () => {
  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  const confirmButtonRef = createRef<HTMLButtonElement>()
  render(
    <AutomationDeleteDialog
      deleteTarget={makeAutomation()}
      dontAskDeleteAgain={false}
      confirmButtonRef={confirmButtonRef}
      onOpenChange={vi.fn()}
      onDontAskAgainToggle={vi.fn()}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
  const cancel = screen.getByRole('button', { name: 'Cancel' })
  await waitFor(() => expect(document.activeElement).toBe(cancel))
  expect(confirmButtonRef.current).toBe(screen.getByRole('button', { name: 'Delete' }))
  await userEvent.keyboard('{Enter}')
  expect(onCancel).toHaveBeenCalledOnce()
  expect(onConfirm).not.toHaveBeenCalled()
})

it('keeps external provider deletion behind the explicit destructive action', async () => {
  const manager = makeExternalManager()
  const onConfirm = vi.fn()
  render(
    <ExternalAutomationDeleteDialog
      externalDeleteTarget={{ manager, job: manager.jobs[0] }}
      confirmButtonRef={createRef<HTMLButtonElement>()}
      onOpenChange={vi.fn()}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />
  )
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  )
  expect(screen.getByRole('dialog').textContent).toContain(manager.targetLabel)
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(onConfirm).toHaveBeenCalledOnce()
})
