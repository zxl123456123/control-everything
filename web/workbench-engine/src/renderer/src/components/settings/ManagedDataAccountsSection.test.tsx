// @vitest-environment happy-dom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ManagedDataAccountsSection } from './ManagedDataAccountsSection'

const mocks = vi.hoisted(() => ({ call: vi.fn(), copy: vi.fn() }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: mocks.call }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
const roster = {
  accounts: [{ id: 'saved', label: 'Saved account', integrations: ['example'] }],
  activeAccountId: null
}
const target = { kind: 'environment' as const, environmentId: 'platform-host' }
beforeEach(() => {
  mocks.call.mockReset()
  mocks.copy.mockReset().mockResolvedValue(undefined)
  vi.stubGlobal('api', { ui: { writeClipboardText: mocks.copy } })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it.each(['zkyq', 'ce-workbench', undefined])(
  'copies the command proven by the selected host: %s',
  async (command) => {
    mocks.call.mockImplementation(async (_target, method) =>
      method === 'accounts.listData' ? { opencode: roster, accountCommand: command } : roster
    )
    const view = render(<ManagedDataAccountsSection provider="opencode" target={target} />)
    await screen.findByText('Saved account')
    expect(view.container.querySelector('details')?.open).toBe(false)
    fireEvent.click(screen.getByText('Setup instructions'))
    fireEvent.click(screen.getByText('Copy add account command'))
    expect(mocks.copy).toHaveBeenCalledWith(`${command ?? 'orca'} account add --agent opencode`)
    fireEvent.click(screen.getByText('Select'))
    await waitFor(() =>
      expect(mocks.call).toHaveBeenCalledWith(target, 'accounts.selectData', {
        provider: 'opencode',
        accountId: 'saved'
      })
    )
    expect(mocks.call.mock.calls.some(([, method]) => method === 'accounts.addDataFromHome')).toBe(
      false
    )
  }
)

it('drops the former host command when switching to a legacy host', async () => {
  mocks.call.mockResolvedValueOnce({ devin: roster, accountCommand: 'zkyq' })
  const view = render(<ManagedDataAccountsSection provider="devin" target={target} />)
  await screen.findByText('zkyq account add --agent devin')
  mocks.call.mockResolvedValueOnce({ devin: roster })
  view.rerender(
    <ManagedDataAccountsSection
      provider="devin"
      target={{ kind: 'environment', environmentId: 'legacy-host' }}
    />
  )
  await screen.findByText('orca account add --agent devin')
  expect(screen.queryByText('zkyq account add --agent devin')).toBeNull()
})
