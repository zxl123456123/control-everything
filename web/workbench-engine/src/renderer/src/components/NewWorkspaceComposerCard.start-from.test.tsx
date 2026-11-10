// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NewWorkspaceComposerCard from './NewWorkspaceComposerCard'
import { PlatformProjectContext } from '@/web/platform-project-context'
import type { PlatformProjectBootstrap } from '@/web/platform-project-bootstrap'

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({
        closeModal: vi.fn(),
        openModal: vi.fn(),
        openSettingsPage: vi.fn(),
        openSettingsTarget: vi.fn(),
        setRuntimeEnvironmentStatus: vi.fn(),
        activeModal: 'new-workspace-composer',
        settings: { defaultTuiAgent: null, disabledTuiAgents: [] },
        updateSettings: vi.fn(),
        projects: [],
        repos: [],
        worktreesByRepo: {}
      }),
    { getState: () => ({}) }
  )
}))

vi.mock('@/components/contextual-tours/use-contextual-tour', () => ({
  useContextualTour: vi.fn()
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock('@/components/agent/AgentCombobox', () => ({
  default: () => <button type="button">Agent picker</button>
}))

vi.mock('@/components/sidebar/AddRemoteHostDialog', () => ({
  AddRemoteHostDialog: () => null
}))

vi.mock('@/components/new-workspace/SmartWorkspaceNameField', () => ({
  default: () => <input aria-label="workspace name" />
}))

vi.mock('@/components/new-workspace/ProjectCombobox', () => ({
  default: ({ onAddProject }: { onAddProject?: () => void }) => (
    <div data-testid="project-combobox">
      <button type="button" data-testid="project-combobox-add" onClick={onAddProject} disabled={!onAddProject}>
        Add project from picker
      </button>
    </div>
  )
}))

// Why: the picker owns its own test; here it only has to report its value and emit picks.
vi.mock('@/components/repo/CreateFromPicker', () => ({
  CreateFromPicker: ({
    value,
    onValueChange,
    readOnly
  }: {
    value: string
    onValueChange: (next: string) => void
    readOnly?: boolean
  }) => (
    <div
      data-testid="base-ref-picker"
      data-value={value}
      data-readonly={readOnly ? 'true' : 'false'}
    >
      <button type="button" onClick={() => onValueChange('release/1.2')}>
        Pick release
      </button>
      <button type="button" onClick={() => onValueChange('')}>
        Pick project default
      </button>
    </div>
  )
}))

function renderCard(
  overrides: Partial<React.ComponentProps<typeof NewWorkspaceComposerCard>> = {},
  platformProject?: PlatformProjectBootstrap | null
): HTMLDivElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    createRoot(container).render(
      <PlatformProjectContext.Provider value={platformProject}>
      <NewWorkspaceComposerCard
        quickAgent={null}
        onQuickAgentChange={() => {}}
        eligibleRepos={[]}
        repoId="repo-a"
        selectedRepoIsGit
        onRepoChange={() => {}}
        onProjectChange={() => {}}
        primaryActionLabel="Create workspace"
        name=""
        onNameValueChange={() => {}}
        branchNameOverride={undefined}
        onBranchNameOverrideChange={() => {}}
        onSmartGitHubItemSelect={() => {}}
        onSmartGitLabItemSelect={() => {}}
        onSmartBranchSelect={() => {}}
        onSmartLinearIssueSelect={() => {}}
        smartNameSelection={{ kind: 'jira', label: 'ERP-1491' }}
        onClearSmartNameSelection={() => {}}
        canReuseSelectedBranch={false}
        reuseSelectedBranch={false}
        onReuseSelectedBranchChange={() => {}}
        forkPushWarning={null}
        detectedAgentIds={null}
        onOpenAgentSettings={() => {}}
        advancedOpen={false}
        onToggleAdvanced={() => {}}
        parentWorktreeId={null}
        onParentWorktreeIdChange={() => {}}
        createDisabled={false}
        projectError={null}
        creating={false}
        onCreate={() => {}}
        note=""
        onNoteChange={() => {}}
        setupConfig={null}
        requiresExplicitSetupChoice={false}
        setupDecision={null}
        onSetupDecisionChange={() => {}}
        setupAgentStartupPolicy="start-immediately"
        onSetupAgentStartupPolicyChange={() => {}}
        shouldWaitForSetupCheck={false}
        resolvedSetupDecision={null}
        createError={null}
        selectedRepoConnectionId={null}
        selectedRepoSshStatus={null}
        selectedRepoRequiresConnection={false}
        selectedRepoConnectInProgress={false}
        onConnectSelectedRepo={async () => {}}
        canUseSparseCheckout={false}
        sparsePresets={[]}
        sparseSelectedPresetId={null}
        onSparseSelectPreset={() => {}}
        branchesEnabled
        setupControlsEnabled={false}
        sparseControlsEnabled={false}
        baseBranch={undefined}
        onBaseBranchChange={() => {}}
        startFromResetHint={null}
        {...overrides}
      />
      </PlatformProjectContext.Provider>
    )
  })
  return container
}

function clickButton(container: HTMLDivElement, label: string): void {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === label
  )
  act(() => button?.click())
}

describe('NewWorkspaceComposerCard start from', () => {
  it('keeps the original add-project button and picker action available in the platform', () => {
    document.documentElement.dataset.platformView = 'workspace'
    try {
      const add = vi.fn()
      container = renderCard({ onAddProjectOverride: add })
      const button = container.querySelector<HTMLButtonElement>('button[aria-label="Add project"]')
      expect(button).toBeTruthy()
      act(() => button!.click())
      const picker = container.querySelector<HTMLButtonElement>('[data-testid="project-combobox-add"]')!
      expect(picker.disabled).toBe(false)
      act(() => picker.click())
      expect(add).toHaveBeenCalledTimes(2)
    } finally {
      delete document.documentElement.dataset.platformView
    }
  })
  const platformProject = { target: { repoId: 'repo-a' }, runtime: { environmentId: 'env-a' } } as PlatformProjectBootstrap
  const selected = { eligibleRepos: [{ id: 'repo-a', displayName: 'Fixture', path: 'C:/example/repo' }] as any,
    selectedRepoExecutionHostId: 'runtime:env-a' as const }
  it.each([true, false])('uses the workspace action label in integrated mode for Git=%s', (selectedRepoIsGit) => {
    const onCreate = vi.fn()
    const card = renderCard({ ...selected, selectedRepoIsGit, primaryActionLabel: '创建工作树', onCreate }, platformProject)
    const button = [...card.querySelectorAll('button')].find((row) => row.textContent?.includes('创建工作区'))
    expect(button).toBeTruthy()
    expect(card.textContent).not.toContain('创建工作树')
    act(() => button?.click())
    expect(onCreate).toHaveBeenCalledOnce()
    card.remove()
  })
  it('keeps standalone action labels and uses workspace terminology while platform selection is pending', () => {
    const standalone = renderCard({ primaryActionLabel: 'Create worktree' })
    expect(standalone.textContent).toContain('Create worktree')
    const pending = renderCard({ primaryActionLabel: '创建工作树' }, null)
    expect(pending.textContent).toContain('创建工作区')
    expect(pending.textContent).not.toContain('创建工作树')
    standalone.remove(); pending.remove()
  })
  it('explains Git creation and folder sharing only for the verified selected project', () => {
    const git = renderCard(selected, platformProject)
    expect(git.querySelector('[data-platform-workspace-help]')?.textContent).toContain('不自动带入未提交文件')
    const folder = renderCard({ ...selected, selectedRepoIsGit: false }, platformProject)
    expect(folder.querySelector('[data-platform-workspace-help]')?.textContent).toContain('文件仍共用项目目录')
    for (const project of [undefined, null, { ...platformProject, target: { repoId: 'other' } }]) {
      const card = renderCard(selected, project)
      expect(card.querySelector('[data-platform-workspace-help]')).toBeNull()
      card.remove()
    }
    const remote = renderCard({ ...selected, selectedRepoExecutionHostId: 'runtime:other' }, platformProject)
    expect(remote.querySelector('[data-platform-workspace-help]')).toBeNull()
    git.remove(); folder.remove(); remote.remove()
  })
  let container: HTMLDivElement | null = null

  afterEach(() => {
    container?.remove()
    container = null
  })

  it('offers a base ref while a Jira issue names the workspace', () => {
    container = renderCard()

    expect(container.querySelector('[data-testid="base-ref-picker"]')).toBeTruthy()
  })

  it('reports the picked ref to the composer', () => {
    const picks: (string | undefined)[] = []
    container = renderCard({ onBaseBranchChange: (next) => picks.push(next) })

    clickButton(container, 'Pick release')

    expect(picks).toEqual(['release/1.2'])
  })

  it('renders the base ref as read-only while the project needs a connection', () => {
    container = renderCard({ selectedRepoRequiresConnection: true })

    expect(
      container.querySelector('[data-testid="base-ref-picker"]')?.getAttribute('data-readonly')
    ).toBe('true')
  })

  it('reports the project default as no base at all', () => {
    const picks: (string | undefined)[] = []
    container = renderCard({
      baseBranch: 'release/1.2',
      onBaseBranchChange: (next) => picks.push(next)
    })

    clickButton(container, 'Pick project default')

    expect(picks).toEqual([undefined])
  })

  // Why: picking a base clears reuse, so offering one here would silently turn a checkout of
  // the picked branch into a new branch off something else.
  it('omits the base ref for a branch source, which already is the base', () => {
    container = renderCard({
      smartNameSelection: { kind: 'branch', label: 'feature/export-v2' },
      baseBranch: 'feature/export-v2'
    })

    expect(container.querySelector('[data-testid="base-ref-picker"]')).toBeNull()
  })

  it('offers the base ref while a plain typed name owns the field', () => {
    container = renderCard({ smartNameSelection: null, name: 'my-own-name' })

    expect(container.querySelector('[data-testid="base-ref-picker"]')).toBeTruthy()
  })

  it.each([
    ['github-pr', { kind: 'github-pr' as const, label: '#42 Fix' }],
    ['gitlab-mr', { kind: 'gitlab-mr' as const, label: '!42 Fix' }]
  ])(
    'omits the base ref for a %s source that carries its own base',
    (_label, smartNameSelection) => {
      container = renderCard({ smartNameSelection })

      expect(container.querySelector('[data-testid="base-ref-picker"]')).toBeNull()
    }
  )

  it('omits the base ref when branches are disabled', () => {
    container = renderCard({ branchesEnabled: false })

    expect(container.querySelector('[data-testid="base-ref-picker"]')).toBeNull()
  })

  it('surfaces the reset hint left by a project switch', () => {
    container = renderCard({ startFromResetHint: 'was origin/main' })

    expect(container.textContent).toContain('was origin/main')
  })
})
