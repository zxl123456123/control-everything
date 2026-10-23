import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { selectWorktreesByRepo } from '../store/workspace-record-selectors'
import { activateAndRevealWorktree } from '../lib/worktree-activation'
import { getRepoExecutionHostId, toRuntimeExecutionHostId } from '../../../shared/execution-host'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import {
  choosePlatformWorktree,
  createPlatformProjectNavigator
} from './platform-project-navigation'
import type { PlatformProject } from './platform-studio-surface'

export default function PlatformNavigation({
  data,
  projects,
  active,
  onSelection
}: {
  data: PlatformProjectBootstrap
  projects: PlatformProject[]
  active: boolean
  onSelection: (id: string | null) => void
}): React.JSX.Element {
  const hydrated = useAppStore((state) => state.hydrationSucceeded)
  const terminalsReady = useAppStore((state) => state.terminalStartupRestorationReady)
  const catalogReady = useAppStore((state) => state.startupWorktreeRefreshCompleted)
  const repos = useAppStore((state) => state.repos)
  const worktrees = useAppStore(selectWorktreesByRepo)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activated = useRef<PlatformProjectBootstrap | null>(null)
  const snapshot = useAppStore(
    (state) => state.runtimeStatusByEnvironmentId.get(data.runtime.environmentId)?.snapshot
  )
  const navigate = useMemo(
    () => createPlatformProjectNavigator(data, activateAndRevealWorktree),
    [data]
  )
  const [notice, setNotice] = useState('正在恢复项目工作区…')
  const [catalogError, setCatalogError] = useState('')

  useEffect(() => {
    if (
      !hydrated ||
      !catalogReady ||
      snapshot?.verification !== 'verified' ||
      snapshot.transport !== 'ready'
    )
      return
    let disposed = false
    setCatalogError('')
    const state = useAppStore.getState()
    const hostId = toRuntimeExecutionHostId(data.runtime.environmentId)
    if (
      state.repos.some(
        (row) => row.id === data.target.repoId && getRepoExecutionHostId(row) === hostId
      ) &&
      choosePlatformWorktree(
        Object.values(selectWorktreesByRepo(state)).flat(),
        data,
        state.activeWorktreeId
      )
    )
      return
    // Web repo-change notifications are unavailable; fetch a newly bootstrapped project's catalog explicitly.
    void state
      .fetchRepos({ runtimeEnvironmentId: data.runtime.environmentId, throwOnError: true })
      .then(() => {
        if (!disposed)
          return useAppStore
            .getState()
            .fetchWorktrees(data.target.repoId, { executionHostId: hostId })
      })
      .catch(() => {
        if (!disposed) setCatalogError('项目目录未能刷新，请重新加载页面后重试。')
      })
    return () => {
      disposed = true
    }
  }, [data, hydrated, catalogReady, snapshot?.verification, snapshot?.transport])

  useEffect(() => {
    const hostId = toRuntimeExecutionHostId(data.runtime.environmentId)
    const repo = repos.find(
      (row) => row.id === data.target.repoId && getRepoExecutionHostId(row) === hostId
    )
    const state = useAppStore.getState()
    const message = navigate({
      ready:
        hydrated &&
        terminalsReady &&
        catalogReady &&
        snapshot?.verification === 'verified' &&
        snapshot.transport === 'ready',
      hasRepo: Boolean(repo),
      worktrees: Object.values(worktrees).flat(),
      activeWorktreeId: state.activeWorktreeId
    })
    if (message === '项目已打开') activated.current = data
    setNotice(message)
  }, [data, hydrated, terminalsReady, catalogReady, repos, worktrees, snapshot, navigate])

  useEffect(() => {
    if (!active || activated.current !== data) return
    const state = useAppStore.getState()
    const selected = Object.values(worktrees)
      .flat()
      .find((row) => row.id === state.activeWorktreeId)
    const repo = repos.find(
      (row) =>
        row.id === selected?.repoId &&
        getRepoExecutionHostId(row) === toRuntimeExecutionHostId(data.runtime.environmentId)
    )
    if (!repo) {
      onSelection(null)
      return
    }
    if (repo.id === data.target.repoId) {
      onSelection(data.project.id)
      return
    }
    const normalize = (value: string) =>
      value.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
    const matches = projects.filter(
      (project) => project.directory && normalize(project.directory) === normalize(repo.path)
    )
    onSelection(matches.length === 1 ? matches[0].id : null)
  }, [active, data, projects, activeWorktreeId, repos, worktrees, onSelection])

  const disconnected =
    snapshot &&
    (snapshot.transport === 'disconnected' ||
      snapshot.verification === 'blocked' ||
      snapshot.verification === 'unavailable')
  return (
    <div className="platform-runtime-status" aria-live="polite">
      <span role="status">
        {catalogError || (disconnected ? '连接已中断；运行组件重启后请重新加载。' : notice)}
      </span>
    </div>
  )
}
