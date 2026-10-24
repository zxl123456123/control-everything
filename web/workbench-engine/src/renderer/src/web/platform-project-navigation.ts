import { getRepoKind } from '../../../shared/repo-kind'
import type { Repo } from '../../../shared/repo-types'
import { getRepoExecutionHostId, toRuntimeExecutionHostId } from '../../../shared/execution-host'
import type { Worktree } from '../../../shared/worktree/types'
import { worktreeOwnerHostIds } from '../lib/worktree-runtime-owner-index'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'

// Describe only catalog records belonging to this project and execution host.
export function describePlatformWorkspace(
  repos: readonly Repo[],
  worktree: Worktree | null,
  data: PlatformProjectBootstrap
) {
  const hostId = toRuntimeExecutionHostId(data.runtime.environmentId)
  const repo = repos.find(
    (row) => row.id === data.target.repoId && getRepoExecutionHostId(row) === hostId
  )
  if (!repo || !worktree || worktree.repoId !== repo.id || !worktreeOwnerHostIds(worktree).includes(hostId))
    return null
  return {
    name: worktree.displayName || '未命名工作区',
    mode: getRepoKind(repo) === 'folder'
      ? '共享项目目录'
      : worktree.isMainWorktree === true
        ? '项目原目录'
        : worktree.isMainWorktree === false
          ? '独立代码目录（Git worktree）'
          : '目录模式尚未读取',
    path: worktree.path || '',
    branch: getRepoKind(repo) === 'git' ? worktree.branch || '' : ''
  }
}

export function choosePlatformWorktree(
  rows: readonly Worktree[],
  data: PlatformProjectBootstrap,
  activeWorktreeId: string | null
): Worktree | null {
  const hostId = toRuntimeExecutionHostId(data.runtime.environmentId)
  const candidates = rows.filter(
    (row) =>
      row.repoId === data.target.repoId &&
      worktreeOwnerHostIds(row).includes(hostId) &&
      !row.removing &&
      !row.prunable
  )
  if (data.target.worktreeId) {
    return (
      candidates.find(
        (row) =>
          row.id === data.target.worktreeId &&
          (!data.target.instanceId || row.instanceId === data.target.instanceId)
      ) ?? null
    )
  }
  return (
    candidates.find((row) => row.id === activeWorktreeId) ??
    candidates.find((row) => row.isMainWorktree) ??
    candidates[0] ??
    null
  )
}

export function createPlatformProjectNavigator(
  data: PlatformProjectBootstrap,
  activate: (
    id: string,
    options: { executionHostId: ReturnType<typeof toRuntimeExecutionHostId> }
  ) => unknown
) {
  let navigated = false
  return (state: {
    ready: boolean
    hasRepo: boolean
    worktrees: readonly Worktree[]
    activeWorktreeId: string | null
  }): string => {
    if (navigated) return '项目已打开'
    if (!state.ready) return '正在恢复项目工作区…'
    const target = state.hasRepo
      ? choosePlatformWorktree(state.worktrees, data, state.activeWorktreeId)
      : null
    if (!target) return '项目中尚无可定位的工作区，请从左侧选择或创建。'
    // The original activation path owns tab restoration and any initial terminal.
    if (
      !activate(target.id, {
        executionHostId: toRuntimeExecutionHostId(data.runtime.environmentId)
      })
    )
      return '工作区暂不可定位，请重新加载。'
    navigated = true
    return '项目已打开'
  }
}
