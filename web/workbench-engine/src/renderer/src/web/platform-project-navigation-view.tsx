import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store'
import { selectWorktreesByRepo } from '../store/workspace-record-selectors'
import { activateAndRevealWorktree } from '../lib/worktree-activation'
import { getRepoExecutionHostId, toRuntimeExecutionHostId } from '../../../shared/execution-host'
import type { PlatformProjectBootstrap } from './platform-project-bootstrap'
import { createPlatformProjectNavigator } from './platform-project-navigation'

export default function PlatformNavigation({
  data
}: {
  data: PlatformProjectBootstrap
}): React.JSX.Element {
  const hydrated = useAppStore((state) => state.hydrationSucceeded)
  const terminalsReady = useAppStore((state) => state.terminalStartupRestorationReady)
  const catalogReady = useAppStore((state) => state.startupWorktreeRefreshCompleted)
  const repos = useAppStore((state) => state.repos)
  const worktrees = useAppStore(selectWorktreesByRepo)
  const snapshot = useAppStore(
    (state) => state.runtimeStatusByEnvironmentId.get(data.runtime.environmentId)?.snapshot
  )
  const navigate = useMemo(
    () => createPlatformProjectNavigator(data, activateAndRevealWorktree),
    [data]
  )
  const [notice, setNotice] = useState('正在恢复项目工作区…')

  useEffect(() => {
    const hostId = toRuntimeExecutionHostId(data.runtime.environmentId)
    const repo = repos.find(
      (row) => row.id === data.target.repoId && getRepoExecutionHostId(row) === hostId
    )
    const state = useAppStore.getState()
    setNotice(
      navigate({
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
    )
  }, [data, hydrated, terminalsReady, catalogReady, repos, worktrees, snapshot, navigate])

  const disconnected =
    snapshot &&
    (snapshot.transport === 'disconnected' ||
      snapshot.verification === 'blocked' ||
      snapshot.verification === 'unavailable')
  return (
    <nav
      className="flex h-11 shrink-0 items-center gap-4 border-b border-border bg-background px-4 text-sm"
      aria-label="平台导航"
    >
      <a href="/studio" className="shrink-0 underline-offset-4 hover:underline">
        返回工作台
      </a>
      <span className="truncate font-medium">{data.project.name}</span>
      <a href={data.returnUrl} className="shrink-0 underline-offset-4 hover:underline">
        平台事项与验收
      </a>
      <span className="ml-auto truncate text-xs text-muted-foreground" role="status">
        {disconnected ? '连接已中断；运行组件重启后请重新加载。' : notice}
      </span>
    </nav>
  )
}
