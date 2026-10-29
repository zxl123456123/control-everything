import { beforeEach, expect, it, vi } from 'vitest'
import { RuntimeAccountController } from './runtime-account-controller'

const host = vi.hoisted(() => ({ command: undefined as 'ce-workbench' | undefined, present: true }))
vi.mock('../../shared/app-environment', () => ({
  hasAppEnvironment: () => host.present,
  getAppEnvironment: () => ({ getCliAccountCommand: () => host.command })
}))
vi.mock('../managed-data-accounts/service', () => ({
  getManagedDataAccountService: () => ({ list: () => ({ accounts: [], activeAccountId: null }) })
}))
vi.mock('../native-chat/agent-session-wire/at-rest-command-context', () => ({
  retireAtRestCommandContext: vi.fn()
}))
beforeEach(() => {
  host.command = undefined
  host.present = true
})

it('advertises the host command only after the host reports a prepared launcher', () => {
  const controller = new RuntimeAccountController()
  expect(controller.dataAccountsSnapshot()).not.toHaveProperty('accountCommand')
  host.command = 'ce-workbench'
  expect(controller.dataAccountsSnapshot()).toEqual({
    opencode: { accounts: [], activeAccountId: null },
    devin: { accounts: [], activeAccountId: null },
    accountCommand: 'ce-workbench'
  })
  host.present = false
  expect(controller.dataAccountsSnapshot()).toEqual({})
})
