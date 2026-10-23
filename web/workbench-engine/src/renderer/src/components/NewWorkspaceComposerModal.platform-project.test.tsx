// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { PlatformProjectContext } from '@/web/platform-project-context'
import type { PlatformProjectBootstrap } from '@/web/platform-project-bootstrap'
import { projectHostSetupProjectionFromRepos } from '../../../shared/project-host-setup-projection'
import { EMPTY_RETIRED_NAME_REGISTRY } from '../../../shared/worktree/retired-name-registry'
import { getDefaultSettings } from '../../../shared/constants'
import type { Repo } from '../../../shared/repo-types'
import type { NewWorkspaceComposerCardProps } from './new-workspace/new-workspace-composer-card-props'
import NewWorkspaceComposerModal from './NewWorkspaceComposerModal'

const fixture = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/hooks/composer-state/quick-creation-execution', () => ({
  useQuickCreationExecution: () => ({ executeQuickCreation: fixture.create })
}))
vi.mock('@/components/agent/AgentSettingsDialog', () => ({ default: () => null }))
vi.mock('@/components/tab-bar/use-new-tab-agent-menu-rows', () => ({
  useAgentMenuObservation: () => ({ selectionFor: () => ({ ready: true }) })
}))
vi.mock('@/hooks/useDetectedAgents', () => ({
  useDetectedAgents: () => ({ detectedIds: [], isLoading: false, detectionFailed: false })
}))
vi.mock('@/components/NewWorkspaceComposerCard', () => ({
  default: (props: NewWorkspaceComposerCardProps) => (
    <div>
      <span data-testid="target">{props.selectedRepo?.id}</span>
      <span data-testid="project-count">{props.projectOptions?.length}</span>
      <button disabled={props.createDisabled} onClick={props.onCreate}>
        Create fixture
      </button>
    </div>
  )
}))

const original = useAppStore.getState()
const current: Repo = {
  id: 'current',
  displayName: 'Current',
  path: 'C:/example/fixture/current',
  kind: 'folder',
  executionHostId: 'runtime:env-a',
  badgeColor: '',
  addedAt: 0
}
const other: Repo = { ...current, id: 'other', displayName: 'Other', path: 'C:/example/fixture/other' }
const project = {
  project: { id: 'p-current', name: 'Current' },
  runtime: { environmentId: 'env-a' },
  target: { repoId: 'current' }
} as PlatformProjectBootstrap
let originalApi: PropertyDescriptor | undefined
beforeEach(() => {
  fixture.create.mockReset()
  originalApi = Object.getOwnPropertyDescriptor(window, 'api')
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      preflight: { detectAgents: vi.fn().mockResolvedValue([]) },
      worktrees: { listRetiredNames: vi.fn().mockResolvedValue(EMPTY_RETIRED_NAME_REGISTRY) }
    }
  })
  const localTwin: Repo = { ...current, executionHostId: 'local', path: 'C:/example/fixture/local-twin' }
  const projection = projectHostSetupProjectionFromRepos([localTwin, current, other])
  useAppStore.setState({
    activeModal: 'new-workspace-composer',
    modalData: {
      prefilledName: 'fixture-work',
      initialRepoId: 'other',
      initialProjectGroupId: 'other-group',
      initialWorkspaceTarget: { projectId: 'repo:other', hostId: 'runtime:env-a' },
      taskSourceContext: {
        kind: 'task-source',
        provider: 'jira',
        projectId: 'repo:other',
        hostId: 'runtime:env-a'
      }
    },
    repos: [localTwin, current, other],
    projects: [...projection.projects],
    projectHostSetups: [...projection.setups],
    projectGroups: [
      {
        id: 'other-group',
        name: 'Other group',
        parentPath: 'C:/example/fixture/groups',
        executionHostId: 'runtime:env-a',
        parentGroupId: null,
        createdFrom: 'manual',
        tabOrder: 0,
        isCollapsed: false,
        color: null,
        createdAt: 0,
        updatedAt: 0
      }
    ],
    newWorkspaceDraft: null,
    worktreesByRepo: {},
    sparsePresetsByRepo: {},
    activeRepoId: 'other',
    settings: { ...getDefaultSettings('/fixture'), defaultTuiAgent: null },
    runtimeEnvironments: [
      {
        id: 'env-a',
        name: 'Fixture',
        createdAt: 0,
        updatedAt: 0,
        lastUsedAt: null,
        runtimeId: null,
        endpoints: [],
        preferredEndpointId: 'endpoint'
      }
    ]
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(original, true)
  if (originalApi) Object.defineProperty(window, 'api', originalApi)
  else Reflect.deleteProperty(window, 'api')
})

it('uses the real composer and submit target for the current project despite foreign modal seeds', async () => {
  render(
    <PlatformProjectContext.Provider value={project}>
      <NewWorkspaceComposerModal />
    </PlatformProjectContext.Provider>
  )
  expect(screen.getByTestId('target').textContent).toBe('current')
  expect(screen.getByTestId('project-count').textContent).toBe('1')
  await act(async () => fireEvent.click(screen.getByText('Create fixture')))
  expect(fixture.create).toHaveBeenCalledTimes(1)
  const [, , , runContext, repoId] = fixture.create.mock.calls[0]
  expect(repoId).toBe('current')
  expect(runContext).toMatchObject({
    repoId: 'current',
    hostId: 'runtime:env-a',
    path: current.path
  })
})

it('does not fall back to a global project while the platform context is unavailable', () => {
  render(
    <PlatformProjectContext.Provider value={null}>
      <NewWorkspaceComposerModal />
    </PlatformProjectContext.Provider>
  )
  expect(screen.getByTestId('project-count').textContent).toBe('0')
  fireEvent.click(screen.getByText('Create fixture'))
  expect(fixture.create).not.toHaveBeenCalled()
})
