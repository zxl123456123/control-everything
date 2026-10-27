// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { getDefaultSettings } from '../../../../shared/constants'
import type { Project } from '../../../../shared/project-types'
import type { Repo } from '../../../../shared/repo-types'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { useAppStore } from '@/store/index'
import { getRepositoryPaneSearchEntries, RepositoryPane } from './RepositoryPane'
import { matchesRepositoryIdentitySearch } from './repository/identity/repository-identity-search'
import { matchesSettingsSearch } from './settings-search'
import { TooltipProvider } from '../ui/tooltip'
import { RepositoryRemoveProjectButton } from './RepositoryRemoveProjectButton'
import { PlatformProjectContext } from '@/web/platform-project-context'
import { RepoHeaderCreateWorkspaceButton, RepoHeaderProjectActionsMenu } from '../sidebar/worktree-list/rows/repo-header-project-actions'

const archiveProject = vi.hoisted(() => vi.fn())
vi.mock('@/web/platform-project-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/web/platform-project-actions')>()),
  archivePlatformProject: archiveProject
}))
vi.mock('@/runtime/runtime-repo-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/runtime/runtime-repo-client')>()),
  getRuntimeRepoBaseRefDefault: vi.fn().mockResolvedValue({ defaultBaseRef: null, remoteCount: 0 })
}))

let container: HTMLDivElement
let root: Root

const repo: Repo = {
  id: 'repo-1',
  path: '/tmp/repo',
  displayName: 'Example Repo',
  badgeColor: '#000000',
  addedAt: 1,
  kind: 'git'
}

const project: Project = {
  id: 'project-1',
  displayName: 'Example Project',
  badgeColor: '#000000',
  sourceRepoIds: ['repo-1'],
  createdAt: 1,
  updatedAt: 1
}

function terminalTab(id: string, worktreeId: string): TerminalTab {
  return {
    id,
    ptyId: null,
    worktreeId,
    title: 'Terminal',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

function activeAgent(paneKey: string, worktreeId: string): AgentStatusEntry {
  return {
    state: 'working',
    prompt: 'Implement runtime switch',
    updatedAt: 1,
    stateStartedAt: 1,
    agentType: 'codex',
    paneKey,
    tabId: paneKey.split(':')[0],
    worktreeId,
    stateHistory: []
  }
}

beforeEach(() => {
  archiveProject.mockReset().mockResolvedValue(undefined)
  useAppStore.setState(useAppStore.getInitialState(), true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  // WorktreeSymlinksSection reads window.api.fs on mount to suggest directory
  // paths; provide a minimal renderer bridge so mounting the full pane doesn't
  // throw in the test environment.
  ;(window as unknown as { api: unknown }).api = {
    fs: { readDir: () => Promise.resolve([]) },
    sparsePresets: { list: () => Promise.resolve([]) }
  }
})

function renderProjectAction(content: React.ReactNode, platform = false): void {
  act(() => root.render(React.createElement(TooltipProvider, null,
    platform ? React.createElement(PlatformProjectContext.Provider, { value: null }, content) : content
  )))
}

describe('native project actions in integrated settings', () => {
  it('restores the editable display name and keeps its selected runtime host', () => {
    const selectedRepo: Repo = { ...repo, executionHostId: 'runtime:fixture' }
    const updateRepo = vi.fn()
    renderProjectAction(React.createElement(RepositoryPane, {
      repo: selectedRepo, yamlHooks: null, hasHooksFile: false, hooksInspectionReady: true,
      mayNeedUpdate: false, updateRepo, removeProject: vi.fn()
    }), true)
    const input = container.querySelector<HTMLInputElement>('#repo-display-name-repo-1')!
    expect(input).not.toBeNull()
    expect(input.readOnly).toBe(false)
    expect(input.value).toBe('Example Repo')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Renamed')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(updateRepo).toHaveBeenCalledWith('repo-1', { displayName: 'Renamed' }, { hostId: 'runtime:fixture' })
    expect(container.textContent).not.toContain('项目管理')
  })

  it('archives through the platform helper only after confirmation and never calls all-host removal', async () => {
    const removeProject = vi.fn()
    renderProjectAction(React.createElement(RepositoryPane, {
      repo, yamlHooks: null, hasHooksFile: false, hooksInspectionReady: true,
      mayNeedUpdate: false, updateRepo: vi.fn(), removeProject
    }), true)
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Remove Project"]')!
    expect(button.getAttribute('aria-description')).toContain('保留文件、事项、终端和草稿')
    act(() => button.click())
    expect(archiveProject).not.toHaveBeenCalled()
    await act(async () => button.click())
    expect(archiveProject).toHaveBeenCalledExactlyOnceWith(repo)
    expect(removeProject).not.toHaveBeenCalled()
  })

  it('blocks repeat requests while pending and retains confirmation after an error for retry', async () => {
    let resolve!: () => void
    let reject!: (error: Error) => void
    const removeProject = vi.fn(() => new Promise<void>((done, fail) => { resolve = done; reject = fail }))
    const errorToast = vi.spyOn(toast, 'error').mockReturnValue('fixture-toast')
    try {
      renderProjectAction(React.createElement(RepositoryRemoveProjectButton, {
        repo, removalScope: 'project', forceVisible: true, removeProject
      }), true)
      const button = container.querySelector<HTMLButtonElement>('button')!
      act(() => button.click())
      act(() => { button.click(); button.click() })
      expect(removeProject).toHaveBeenCalledTimes(1)
      expect(button.disabled).toBe(true)
      act(() => button.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
      await act(async () => reject(new Error('归档失败')))
      expect(button.disabled).toBe(false)
      expect(button.getAttribute('aria-label')).toBe('Confirm Remove Project')
      expect(errorToast).toHaveBeenCalledWith('归档失败')
      act(() => button.click())
      expect(removeProject).toHaveBeenCalledTimes(2)
      await act(async () => resolve())
      expect(button.getAttribute('aria-label')).toBe('Remove Project')
    } finally { errorToast.mockRestore() }
  })

  it('keeps standalone blur cancellation and the original confirmed callback', async () => {
    const removeProject = vi.fn()
    renderProjectAction(React.createElement(RepositoryRemoveProjectButton, {
      repo, removalScope: 'project', forceVisible: true, removeProject
    }))
    const button = container.querySelector<HTMLButtonElement>('button')!
    act(() => button.click())
    act(() => button.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(removeProject).not.toHaveBeenCalled()
    expect(button.getAttribute('aria-label')).toBe('Remove Project')
    expect(button.hasAttribute('aria-description')).toBe(false)
    act(() => button.click())
    await act(async () => button.click())
    expect(removeProject).toHaveBeenCalledExactlyOnceWith('repo-1')
    expect(archiveProject).not.toHaveBeenCalled()
  })

  it('restores the destructive native header menu callback in platform mode', async () => {
    const onRemoveProject = vi.fn()
    renderProjectAction(React.createElement(RepoHeaderProjectActionsMenu, {
      repo, label: repo.displayName, projectGroups: [], actions: {
        getWorktreeVisibilityDefaults: () => undefined, onOpenRepoSettings: vi.fn(),
        onOpenWorktreeVisibility: vi.fn(), onCreateGroupFromRepo: vi.fn(),
        onMoveProjectToGroup: vi.fn(), onRemoveProjectFromGroup: vi.fn(),
        onRemoveProject, onCreateForRepo: vi.fn()
      }
    }), true)
    fireEvent.keyDown(container.querySelector('button')!, { key: 'ArrowDown' })
    await waitFor(() => expect(document.body.querySelector('[role="menuitem"][data-variant="destructive"]')).not.toBeNull())
    const remove = document.body.querySelector<HTMLElement>('[role="menuitem"][data-variant="destructive"]')!
    expect(remove.textContent).toContain('Remove Project')
    fireEvent.click(remove)
    expect(onRemoveProject).toHaveBeenCalledExactlyOnceWith(repo)
    expect(archiveProject).not.toHaveBeenCalled()
  })

  it('retains the platform plus event with the exact repo and execution host', () => {
    const selectedRepo: Repo = { ...repo, executionHostId: 'runtime:fixture' }
    const onCreateForRepo = vi.fn(), listener = vi.fn()
    window.addEventListener('platform-create-workspace', listener)
    try {
      renderProjectAction(React.createElement(RepoHeaderCreateWorkspaceButton, {
        repo: selectedRepo, label: selectedRepo.displayName, createState: null, onCreateForRepo
      }), true)
      fireEvent.click(container.querySelector('button')!)
      expect(listener).toHaveBeenCalledTimes(1)
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ repoId: 'repo-1', executionHostId: 'runtime:fixture' })
      expect(onCreateForRepo).not.toHaveBeenCalled()
    } finally { window.removeEventListener('platform-create-workspace', listener) }
  })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
  delete (window as unknown as { api?: unknown }).api
  useAppStore.setState(useAppStore.getInitialState(), true)
})

describe('RepositoryPane search entries', () => {
  it('keeps renamed hook sections reachable through settings search', () => {
    const entries = getRepositoryPaneSearchEntries(repo, { isLocalWindowsProject: true })

    expect(matchesSettingsSearch('setup script', entries)).toBe(true)
    expect(matchesSettingsSearch('archive script', entries)).toBe(true)
    expect(matchesSettingsSearch('setup command', entries)).toBe(true)
    expect(matchesSettingsSearch('archive command', entries)).toBe(true)
    expect(matchesSettingsSearch('advanced', entries)).toBe(true)
    expect(matchesSettingsSearch('runtime', entries)).toBe(true)
    expect(matchesSettingsSearch('wsl', entries)).toBe(true)
    expect(matchesSettingsSearch('windows host', entries)).toBe(true)
    expect(matchesSettingsSearch('command source', entries)).toBe(true)
    expect(matchesSettingsSearch('local settings scripts', entries)).toBe(true)
    expect(matchesSettingsSearch('../worktrees', entries)).toBe(true)
    expect(matchesSettingsSearch('worktree path', entries)).toBe(true)
  })

  it('includes each project search section once', () => {
    const entries = getRepositoryPaneSearchEntries(repo)

    expect(entries.filter(({ title }) => title === 'Project Icon')).toHaveLength(1)
    expect(entries.filter(({ title }) => title === 'Default Worktree Base')).toHaveLength(1)
  })

  it('omits project runtime search for remote or unsupported repos', () => {
    expect(matchesSettingsSearch('project runtime', getRepositoryPaneSearchEntries(repo))).toBe(
      false
    )
    expect(
      matchesSettingsSearch(
        'project runtime',
        getRepositoryPaneSearchEntries(
          {
            ...repo,
            connectionId: 'builder',
            executionHostId: 'ssh:builder'
          },
          { windowsRuntimeSupported: true }
        )
      )
    ).toBe(false)
  })

  it('matches project identity searches on display name and path only', () => {
    expect(matchesRepositoryIdentitySearch('example repo', repo)).toBe(true)
    expect(matchesRepositoryIdentitySearch('/tmp/repo', repo)).toBe(true)
    expect(matchesRepositoryIdentitySearch('setup script', repo)).toBe(false)
  })

  it('renders full hook controls when search matches the project name', () => {
    useAppStore.setState({
      settingsSearchQuery: 'Example Repo',
      settingsSearchInputQuery: 'Example Repo'
    })

    try {
      const html = renderToStaticMarkup(
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(RepositoryPane, {
            repo,
            yamlHooks: null,
            hasHooksFile: false,
            hooksInspectionReady: true,
            mayNeedUpdate: false,
            updateRepo: vi.fn(),
            removeProject: vi.fn()
          })
        )
      )

      expect(html).toContain('Worktree Hooks')
      expect(html).toContain('Setup Script')
      expect(html).toContain('Archive Script')
      expect(html).toContain('Custom GitHub Issue Command')
    } finally {
      useAppStore.setState({
        settingsSearchQuery: '',
        settingsSearchInputQuery: ''
      })
    }
  })

  it('warns about live terminals and active tasks before project runtime changes', () => {
    const worktreeId = 'repo-1::/tmp/repo'
    useAppStore.setState({
      settingsSearchQuery: 'Example Repo',
      settingsSearchInputQuery: 'Example Repo',
      settings: getDefaultSettings('/tmp'),
      tabsByWorktree: {
        [worktreeId]: [terminalTab('tab-1', worktreeId), terminalTab('tab-2', worktreeId)]
      },
      ptyIdsByTabId: {
        'tab-1': ['pty-1'],
        'tab-2': ['pty-2']
      },
      agentStatusByPaneKey: {
        'tab-2:0': activeAgent('tab-2:0', worktreeId)
      }
    })

    act(() => {
      root.render(
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(RepositoryPane, {
            repo,
            project,
            yamlHooks: null,
            hasHooksFile: false,
            hooksInspectionReady: true,
            mayNeedUpdate: false,
            updateRepo: vi.fn(),
            removeProject: vi.fn(),
            isLocalWindowsProject: true,
            wslAvailable: true,
            wslDistros: ['Ubuntu-24.04'],
            wslCapabilitiesLoading: false,
            updateProject: vi.fn()
          })
        )
      )
    })

    expect(container.textContent).toContain('2 live terminals')
    expect(container.textContent).toContain('1 active task')
    expect(container.textContent).toContain('finish or restart')
  })
})
