/** @vitest-environment happy-dom */
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { ActivityScopeFilterMenuItems } from './activity-scope-filter-controls'

const state = vi.hoisted(() => ({
  agentsVisibleHostIds: ['runtime:other'],
  agentsFilterRepoIds: ['other'],
  agentsHideAutomationGeneratedWorkspaces: false,
  agentsHideCliCreatedWorkspaces: false,
  agentsHideWorkspacesFromOtherDevices: false,
  runtimeEnvironmentCatalogHydrated: true,
  runtimeEnvironments: [],
  setAgentsVisibleHostIds: vi.fn(),
  setAgentsFilterRepoIds: vi.fn()
}))
vi.mock('@/store', () => ({
  useAppStore: (select: (value: typeof state) => unknown) => select(state)
}))
vi.mock('@/components/sidebar/use-sidebar-host-scope-options', () => ({
  useSidebarHostScopeOptions: () => ({ hostOptions: [] })
}))
vi.mock('@/components/sidebar/sidebar-host-options', () => ({
  shouldShowHostScopeControls: () => true,
  getSidebarHostVisibilityLabel: () => 'Hosts'
}))
vi.mock('@/components/sidebar/SidebarHostScopeMenuSection', () => ({
  SidebarHostScopeMenuSection: () => <span>Choose host</span>
}))
vi.mock('@/components/sidebar/SidebarRepositoryFilterSection', () => ({
  default: () => <span>Choose project</span>
}))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuCheckboxItem: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <span>{children}</span>
}))

it('locks host and project controls while preserving effective origin filters', () => {
  const locked = renderToStaticMarkup(<ActivityScopeFilterMenuItems lockProjectScope />)
  expect(locked).not.toContain('Choose host')
  expect(locked).not.toContain('Choose project')
  expect(locked).not.toContain('Show all hosts and projects')
  expect(locked).toContain('Hide CLI-created')
  const standalone = renderToStaticMarkup(<ActivityScopeFilterMenuItems />)
  expect(standalone).toContain('Choose host')
  expect(standalone).toContain('Choose project')
  expect(state.setAgentsVisibleHostIds).not.toHaveBeenCalled()
  expect(state.setAgentsFilterRepoIds).not.toHaveBeenCalled()
})
