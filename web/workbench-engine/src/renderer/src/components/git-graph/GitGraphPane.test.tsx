// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  open: vi.fn(),
  result: {
    items: [
      {
        id: 'commit-a',
        subject: 'Merge feature',
        message: 'Merge feature',
        parentIds: ['b', 'c'],
        displayId: 'commit-a',
        author: 'Fixture'
      }
    ],
    allRefs: true,
    limit: 200,
    hasMore: true,
    hasIncomingChanges: false,
    hasOutgoingChanges: false
  }
}))
vi.mock('./useGitGraphHistory', () => ({
  useGitGraphHistory: () => ({
    state: { status: 'ready', result: mocks.result },
    refresh: mocks.refresh,
    key: 'owner:repo',
    worktreePath: '/repo',
    target: { kind: 'local' }
  })
}))
vi.mock('../right-sidebar/source-control/sync/use-git-history-commit-actions', () => ({
  useGitHistoryCommitActions: () => ({ openHistoryCommitDiff: mocks.open })
}))
import GitGraphPane from './GitGraphPane'
afterEach(cleanup)
describe('GitGraphPane', () => {
  it('states its bounded scope and opens a commit through the existing diff action', () => {
    render(
      <TooltipProvider>
        <GitGraphPane worktreeId="repo" />
      </TooltipProvider>
    )
    expect(screen.getByRole('status').textContent).toContain('200')
    expect(screen.getByText(/Detached commits/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Open commit commit-a/ }))
    expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({ id: 'commit-a' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh graph' }))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })
})
