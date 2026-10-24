// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import StandaloneWebRoot from './standalone-web-root'

const startup = vi.hoisted(() => ({
  decide: vi.fn(),
  clear: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  create: vi.fn(),
  install: vi.fn()
}))
vi.mock('./web-pairing', () => ({
  readPairingInputFromLocation: () => 'fixture-pairing',
  decideWebPairingStartup: startup.decide,
  clearPairingInputFromAddressBar: startup.clear
}))
vi.mock('./web-runtime-environment', () => ({
  readStoredWebRuntimeEnvironment: startup.read,
  saveStoredWebRuntimeEnvironment: startup.save,
  createStoredWebRuntimeEnvironment: startup.create
}))
vi.mock('./web-preload-api', () => ({ installWebPreloadApi: startup.install }))
vi.mock('../lib/pane-manager/pane-webgl-renderer', () => ({ primeTerminalWebglAddon: vi.fn() }))
vi.mock('../i18n/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: ReactNode }) => <>{children}</>
}))
vi.mock('./WebConnect', () => ({
  default: ({
    initialPairingInput,
    onConnected
  }: {
    initialPairingInput: string
    onConnected: () => void
  }) => <button onClick={onConnected}>Connect {initialPairingInput}</button>
}))
vi.mock('./WebPairingSecurityNotice', () => ({
  WebPairingSecurityNotice: () => <p>Pairing security</p>
}))
vi.mock('../App', () => ({ default: () => <p>Developer app</p> }))
beforeEach(() => {
  vi.clearAllMocks()
  startup.read.mockReturnValue(null)
  startup.create.mockReturnValue({ id: 'fixture-environment' })
})
afterEach(cleanup)

it('keeps explicit pairing before installing the runtime API', async () => {
  startup.decide.mockReturnValue({ kind: 'show-connect', initialPairingInput: 'fixture-pairing' })
  render(<StandaloneWebRoot />)
  expect(startup.clear).toHaveBeenCalledOnce()
  expect(startup.install).not.toHaveBeenCalled()
  expect(screen.queryByText('Pairing security')).toBeNull()
  await act(async () => {
    screen.getByRole('button', { name: 'Connect fixture-pairing' }).click()
  })
  expect(startup.install).toHaveBeenCalled()
  expect(screen.getByText('Developer app')).toBeTruthy()
  expect(screen.getByText('Pairing security')).toBeTruthy()
})

it('preserves automatic runtime-scope pairing and clears the pairing address', async () => {
  const offer = { scope: 'runtime' }
  startup.decide.mockReturnValue({ kind: 'auto-save-runtime-offer', offer })
  await act(async () => {
    render(<StandaloneWebRoot />)
  })
  expect(startup.create).toHaveBeenCalledWith({
    name: 'Orca Server',
    offer,
    previousEnvironment: null
  })
  expect(startup.save).toHaveBeenCalledWith({ id: 'fixture-environment' })
  expect(startup.clear).toHaveBeenCalledOnce()
  expect(screen.getByText('Developer app')).toBeTruthy()
})

it('reuses a stored environment without replacing its pairing', async () => {
  startup.read.mockReturnValue({ id: 'existing' })
  startup.decide.mockReturnValue({ kind: 'use-stored-environment' })
  await act(async () => {
    render(<StandaloneWebRoot />)
  })
  expect(startup.decide).toHaveBeenCalledWith({
    initialPairingInput: 'fixture-pairing',
    hasStoredEnvironment: true
  })
  expect(startup.save).not.toHaveBeenCalled()
  expect(startup.clear).not.toHaveBeenCalled()
  expect(screen.getByText('Developer app')).toBeTruthy()
})
