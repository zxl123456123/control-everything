// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitHistoryResult } from '../../../../shared/git-history'
const mocks = vi.hoisted(() => ({
  activeWorktreeId: 'A',
  target: { kind: 'environment', environmentId: 'owner-a' },
  getHistory: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: (select: (s: unknown) => unknown) => select(mocks) }))
vi.mock('@/store/selectors', () => ({ useWorktreeById: (id: string) => ({ id, path: `/${id}` }) }))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))
vi.mock('@/runtime/runtime-git-status-client', () => ({ getRuntimeGitHistory: mocks.getHistory }))
vi.mock('../right-sidebar/worktree-git-owner-target', () => ({
  useWorktreeGitOwnerTarget: () => mocks.target,
  requireGitOwnerTarget: (target: unknown) => target
}))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
import { useGitGraphHistory } from './useGitGraphHistory'

function result(id: string): GitHistoryResult {
  return {
    items: [{ id, parentIds: [], subject: id, message: id }],
    allRefs: true,
    limit: 200,
    hasMore: false,
    hasIncomingChanges: false,
    hasOutgoingChanges: false
  }
}
beforeEach(() => {
  mocks.activeWorktreeId = 'A'
  mocks.target = { kind: 'environment', environmentId: 'owner-a' }
  mocks.getHistory.mockReset().mockResolvedValue(result('first'))
})
afterEach(cleanup)

describe('repository graph loading', () => {
  it('uses the owner host, caps the request and waits for visibility', async () => {
    mocks.activeWorktreeId = 'B'
    const hook = renderHook(() => useGitGraphHistory('A'))
    expect(mocks.getHistory).not.toHaveBeenCalled()
    mocks.activeWorktreeId = 'A'
    hook.rerender()
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
    expect(mocks.getHistory).toHaveBeenCalledWith(
      { target: mocks.target, worktreeId: 'A', worktreePath: '/A', connectionId: undefined },
      { allRefs: true, limit: 200 }
    )
    hook.rerender()
    expect(mocks.getHistory).toHaveBeenCalledTimes(1)
  })

  it('discards a response after the owner changes and clears old content immediately', async () => {
    let finish!: (value: GitHistoryResult) => void
    mocks.getHistory.mockReturnValueOnce(
      new Promise<GitHistoryResult>((resolve) => {
        finish = resolve
      })
    )
    const hook = renderHook(() => useGitGraphHistory('A'))
    mocks.target = { kind: 'environment', environmentId: 'owner-b' }
    hook.rerender()
    await waitFor(() => expect(hook.result.current.state.result?.items[0]?.id).toBe('first'))
    await act(async () => {
      finish(result('stale'))
    })
    expect(hook.result.current.state.result?.items[0]?.id).toBe('first')
    expect(mocks.getHistory.mock.calls[1]?.[0].target.environmentId).toBe('owner-b')
  })

  it('does not accept a late completion after hiding, and refreshes on return', async () => {
    let finish!: (value: GitHistoryResult) => void
    mocks.getHistory.mockReturnValueOnce(
      new Promise<GitHistoryResult>((resolve) => {
        finish = resolve
      })
    )
    const hook = renderHook(() => useGitGraphHistory('A'))
    mocks.activeWorktreeId = 'B'
    hook.rerender()
    await act(async () => {
      finish(result('stale'))
    })
    expect(hook.result.current.state.result).toBeUndefined()
    expect(mocks.getHistory).toHaveBeenCalledTimes(1)
    mocks.activeWorktreeId = 'A'
    hook.rerender()
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
    expect(mocks.getHistory).toHaveBeenCalledTimes(2)
  })

  it('rejects an old execution host and supports an explicit retry', async () => {
    mocks.getHistory.mockResolvedValueOnce({ ...result('legacy'), allRefs: undefined })
    const hook = renderHook(() => useGitGraphHistory('A'))
    await waitFor(() => expect(hook.result.current.state.status).toBe('error'))
    expect(hook.result.current.state.result).toBeUndefined()
    act(() => hook.result.current.refresh())
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
  })
})
