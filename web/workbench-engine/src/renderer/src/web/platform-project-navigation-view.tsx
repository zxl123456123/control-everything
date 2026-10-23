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
import { projectRoute, readPlatformRoute } from './platform-route'

export default function PlatformNavigation({
  data,
  projects,
  active,
  surface = 'workspace',
  onSelection,
  onReady
}: {
  data: PlatformProjectBootstrap
  projects: PlatformProject[]
  active: boolean
  surface?: 'workspace' | 'activity'
  onSelection: (id: string | null) => void
  onReady?: (data: PlatformProjectBootstrap | null) => void
}): React.JSX.Element {
  const hydrated = useAppStore((state) => state.hydrationSucceeded)
  const terminalsReady = useAppStore((state) => state.terminalStartupRestorationReady)
  const catalogReady = useAppStore((state) => state.startupWorktreeRefreshCompleted)
  const repos = useAppStore((state) => state.repos)
  const worktrees = useAppStore(selectWorktreesByRepo)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeView = useAppStore((state) => state.activeView)
  const activated = useRef<PlatformProjectBootstrap | null>(null)
  const shownSurface = useRef<{
    data: PlatformProjectBootstrap
    surface: 'workspace' | 'activity'
  } | null>(null)
  const snapshot = useAppStore(
    (state) => state.runtimeStatusByEnvironmentId.get(data.runtime.environmentId)?.snapshot
  )
  const navigate = useMemo(
    () => createPlatformProjectNavigator(data, activateAndRevealWorktree),
    [data]
  )
  const [notice, setNotice] = useState('正在恢复项目工作区…')
  const [catalogError, setCatalogError] = useState('')
  const project = projects.find((row) => row.id === data.project.id)
  const normalize = (value: string) => value.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
  const isProjectRepo = (repo: (typeof repos)[number]) =>
    Boolean(project?.directory && normalize(project.directory) === normalize(repo.path))

  useEffect(() => {
    if (
      !project ||
      project.name !== data.project.name ||
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
        (row) =>
          row.id === data.target.repoId &&
          getRepoExecutionHostId(row) === hostId &&
          isProjectRepo(row) &&
          row.displayName === project.name
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
        return undefined
      })
      .catch(() => {
        if (!disposed) setCatalogError('项目目录未能刷新，请重新加载页面后重试。')
      })
    return () => {
      disposed = true
    }
  }, [
    data,
    project?.name,
    project?.directory,
    hydrated,
    catalogReady,
    snapshot?.verification,
    snapshot?.transport
  ])

  useEffect(() => {
    const hostId = toRuntimeExecutionHostId(data.runtime.environmentId)
    const repo = repos.find(
      (row) =>
        row.id === data.target.repoId &&
        getRepoExecutionHostId(row) === hostId &&
        isProjectRepo(row) &&
        row.displayName === project?.name
    )
    const state = useAppStore.getState()
    const ready =
      Boolean(project) &&
      project?.name === data.project.name &&
      hydrated &&
      terminalsReady &&
      catalogReady &&
      snapshot?.verification === 'verified' &&
      snapshot.transport === 'ready'
    const message = navigate({
      ready,
      hasRepo: Boolean(repo),
      worktrees: Object.values(worktrees).flat(),
      activeWorktreeId: state.activeWorktreeId
    })
    if (message === '项目已打开') activated.current = data
    onReady?.(ready && repo && message === '项目已打开' ? data : null)
    setNotice(message)
  }, [
    data,
    project?.name,
    project?.directory,
    hydrated,
    terminalsReady,
    catalogReady,
    repos,
    worktrees,
    snapshot,
    navigate,
    onReady
  ])

  useEffect(() => {
    if (!active) {
      shownSurface.current = null
      return
    }
    const current = readPlatformRoute(window.location)
    if (
      current.view !== 'project' ||
      current.id !== data.project.id ||
      current.tab !== surface ||
      activated.current !== data ||
      !hydrated ||
      !terminalsReady ||
      !catalogReady ||
      snapshot?.verification !== 'verified' ||
      snapshot.transport !== 'ready'
    )
      return
    if (shownSurface.current?.data === data && shownSurface.current.surface === surface) return
    const state = useAppStore.getState()
    if (
      !project ||
      project.name !== data.project.name ||
      !repos.some(
        (repo) =>
          repo.id === data.target.repoId &&
          getRepoExecutionHostId(repo) === toRuntimeExecutionHostId(data.runtime.environmentId) &&
          isProjectRepo(repo) &&
          repo.displayName === project.name
      )
    )
      return
    const target = choosePlatformWorktree(
      Object.values(worktrees).flat(),
      data,
      state.activeWorktreeId
    )
    if (!target) return
    if (surface === 'activity') state.openActivityPage()
    else if (state.activeView !== 'terminal') {
      if (state.activeView === 'activity') state.closeActivityPage()
      activateAndRevealWorktree(target.id, {
        executionHostId: toRuntimeExecutionHostId(data.runtime.environmentId)
      })
    }
    shownSurface.current = { data, surface }
  }, [
    active,
    data,
    surface,
    hydrated,
    terminalsReady,
    catalogReady,
    snapshot,
    worktrees,
    repos,
    project?.name,
    project?.directory
  ])

  useEffect(() => {
    const current = readPlatformRoute(window.location)
    if (
      active &&
      surface === 'activity' &&
      shownSurface.current?.data === data &&
      shownSurface.current.surface === 'activity' &&
      useAppStore.getState().activeView === 'terminal' &&
      current.view === 'project' &&
      current.id === data.project.id &&
      current.tab === 'activity'
    ) {
      window.location.hash = projectRoute(data.project.id)
    }
  }, [active, data, surface, activeView])

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
    if (repo.id === data.target.repoId && project && isProjectRepo(repo)) {
      onSelection(data.project.id)
      return
    }
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
