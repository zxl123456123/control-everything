// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import Landing from './Landing'
import { PlatformProjectContext, PlatformProjectScopeContext } from '../web/platform-project-context'

const fixture = vi.hoisted(() => ({ openModal: vi.fn(), repos: [
  { id: 'historical', path: 'C:/example/archived', executionHostId: 'runtime:env-a' }
] }))
vi.mock('../store', () => ({ useAppStore: (selector: (value: unknown) => unknown) => selector(fixture) }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutKeyDetails: () => ({ keys: [], doubleTap: false }) }))
vi.mock('./landing-preflight-runtime', () => ({ useLandingPreflightRuntime: () => ({ preflightIssues: [] }) }))
vi.mock('./landing-github-star-state', () => ({ useLandingOrcaStarState: () => ['hidden', vi.fn()] }))
vi.mock('./ShortcutKeyCombo', () => ({ ShortcutKeyCombo: () => null }))
afterEach(cleanup)

it('offers project registration inside the empty workbench without a workspace-creation bypass', () => {
  window.history.replaceState(null, '', '/studio#workbench')
  render(<PlatformProjectContext.Provider value={null}>
    <PlatformProjectScopeContext.Provider value={{ projects: [], executionHostId: 'runtime:env-a' }}>
      <Landing />
    </PlatformProjectScopeContext.Provider>
  </PlatformProjectContext.Provider>)
  expect(screen.getByText('Add a project to get started.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Create/ })).toBeNull()
  expect(screen.queryByText('Create workspace')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }))
  expect(fixture.openModal).toHaveBeenCalledWith('add-repo')
})
