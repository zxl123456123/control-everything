import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useWorktreeById } from '@/store/selectors'
import { getConnectionId } from '@/lib/connection-context'
import { getRuntimeGitHistory } from '@/runtime/runtime-git-status-client'
import { translate } from '@/i18n/i18n'
import { GIT_HISTORY_MAX_LIMIT, type GitHistoryResult } from '../../../../shared/git-history'
import {
  requireGitOwnerTarget,
  useWorktreeGitOwnerTarget
} from '../right-sidebar/worktree-git-owner-target'

type GraphState = {
  key: string
  status: 'loading' | 'ready' | 'error'
  result?: GitHistoryResult
  error?: string
}

// Scope every request to the worktree owner and ignore completions after hiding or rerouting.
export function useGitGraphHistory(worktreeId: string) {
  const worktree = useWorktreeById(worktreeId)
  const worktreePath = worktree?.path ?? null
  const target = useWorktreeGitOwnerTarget(worktreeId)
  const visible = useAppStore((state) => state.activeWorktreeId === worktreeId)
  const ownerKey =
    target?.kind === 'environment' ? target.environmentId : (target?.kind ?? 'missing')
  const key = JSON.stringify([worktreeId, worktreePath, ownerKey])
  const [state, setState] = useState<GraphState>({ key, status: 'loading' })
  const [reloadToken, setReloadToken] = useState(0)
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    if (!visible || !worktreePath) return
    let disposed = false
    setState({ key, status: 'loading' })
    void (async () => {
      try {
        const result = await getRuntimeGitHistory(
          {
            target: requireGitOwnerTarget(target),
            worktreeId,
            worktreePath,
            connectionId: getConnectionId(worktreeId) ?? undefined
          },
          { allRefs: true, limit: GIT_HISTORY_MAX_LIMIT }
        )
        if (disposed || requestRef.current !== requestId) return
        if (result.allRefs !== true) {
          throw new Error(
            translate(
              'git-graph.unsupported',
              'Update the execution host to display the repository graph.'
            )
          )
        }
        setState({ key, status: 'ready', result })
      } catch (error) {
        if (disposed || requestRef.current !== requestId) return
        setState({
          key,
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : translate('git-graph.failed', 'Failed to load git graph')
        })
      }
    })()
    return () => {
      disposed = true
    }
  }, [key, reloadToken, target, visible, worktreeId, worktreePath])

  const refresh = useCallback(() => setReloadToken((value) => value + 1), [])
  return {
    state: state.key === key ? state : { key, status: 'loading' as const },
    refresh,
    target,
    worktreePath,
    key
  }
}
