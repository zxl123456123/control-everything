// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as paletteRepos from '@/lib/palette-repo-resolution'
import * as boardSearch from './workspace-kanban-search'
import { useWorkspaceKanbanSearch } from './use-workspace-kanban-search'
import { getRepoHostIdentity } from '../../../../shared/repo-host-identity'
import { getWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'
import { repo as makeRepo, wt as makeWorktree } from './sidebar-list-golden-factories.test-fixture'

const repo = makeRepo('repo', 'mianban-develop', { executionHostId: 'runtime:host-a' })
const worktrees = [makeWorktree(repo, 'Development', {
  id: 'workspace', hostId: 'ssh:box', runtimeOwnerEnvironmentId: 'host-a',
  branch: 'codex/dev-views', path: '/workspace'
})]
const repoMap = new Map([[repo.id, repo]])
const repoMapByHostIdentity = new Map([[getRepoHostIdentity(repo), repo]])

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('useWorkspaceKanbanSearch indexes', () => {
  it('reuses both indexes across query edits and preserves equal match-set identity', () => {
    const documents = vi.spyOn(boardSearch, 'buildWorkspaceBoardPaletteDocuments')
    const index = vi.spyOn(paletteRepos, 'buildPaletteWorktreeIndex')
    const { result } = renderHook(() => useWorkspaceKanbanSearch({
      open: true, worktrees, repoMap, repoMapByHostIdentity
    }))
    expect(documents).toHaveBeenCalledTimes(1)
    expect(index).toHaveBeenCalledTimes(1)
    act(() => result.current.setQuery('mianban-develop'))
    const matched = result.current.matchingWorktreeIds
    expect(matched).toEqual(new Set([getWorktreeHostIdentity(worktrees[0]!)]))
    act(() => result.current.setQuery('dev-views'))
    expect(result.current.matchingWorktreeIds).toBe(matched)
    act(() => result.current.clearQuery())
    expect(result.current.matchingWorktreeIds).toBeNull()
    expect(documents).toHaveBeenCalledTimes(1)
    expect(index).toHaveBeenCalledTimes(1)
  })

  it('rebuilds searchable fields when the owning repo changes, without rebuilding the worktree index', () => {
    const documents = vi.spyOn(boardSearch, 'buildWorkspaceBoardPaletteDocuments')
    const index = vi.spyOn(paletteRepos, 'buildPaletteWorktreeIndex')
    const { result, rerender } = renderHook((props) => useWorkspaceKanbanSearch({
      open: true, worktrees, repoMap, repoMapByHostIdentity: props.repos
    }), { initialProps: { repos: repoMapByHostIdentity } })
    act(() => result.current.setQuery('renamed-project'))
    expect(result.current.matchingWorktreeIds?.size).toBe(0)
    const renamed = { ...repo, displayName: 'renamed-project' }
    rerender({ repos: new Map([[getRepoHostIdentity(renamed), renamed]]) })
    expect(result.current.matchingWorktreeIds).toEqual(new Set([getWorktreeHostIdentity(worktrees[0]!)]))
    expect(documents).toHaveBeenCalledTimes(2)
    expect(index).toHaveBeenCalledTimes(1)
  })
})
