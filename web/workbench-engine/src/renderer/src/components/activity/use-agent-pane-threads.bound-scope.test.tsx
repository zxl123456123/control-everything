/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { useAgentPaneThreads } from './use-agent-pane-threads'
import { makeRepo, makeWorktree, makeTab } from './ActivityPrototypePage-test-fixtures'
import type { BoundActivityScope } from './activity-bound-project-scope'
import { makePaneKey } from '../../../../shared/stable-pane-id'

const initial = useAppStore.getInitialState()
let root: Root | undefined
let snapshot: ReturnType<typeof useAgentPaneThreads>
const scope = { repoId: 'repo-1', hostId: 'runtime:one' } as const
const pane = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')

function Probe({ boundScope }: { boundScope: BoundActivityScope | null | undefined }) {
  snapshot = useAgentPaneThreads({
    query: '',
    readFilter: 'all',
    groupBy: 'project',
    selectedPaneKey: pane,
    showChildAgents: true,
    boundScope
  })
  return null
}

afterEach(() => {
  act(() => root?.unmount())
  useAppStore.setState(initial, true)
  document.body.replaceChildren()
})

it('scopes allThreads, selected terminal lookup and mark-all-read before view filters', async () => {
  const repo = { ...makeRepo(), executionHostId: scope.hostId }
  const worktree = { ...makeWorktree(), hostId: scope.hostId }
  const tab = makeTab()
  useAppStore.setState(
    {
      ...initial,
      repos: [repo],
      worktreesByRepo: { [repo.id]: [worktree] },
      tabsByWorktree: { [worktree.id]: [] },
      retainedAgentsByPaneKey: {
        [pane]: {
          entry: {
            state: 'done',
            prompt: 'Synthetic retained agent',
            updatedAt: Date.now(),
            stateStartedAt: Date.now(),
            paneKey: pane,
            terminalTitle: 'Claude',
            stateHistory: [],
            agentType: 'claude'
          },
          worktreeId: worktree.id,
          tab,
          agentType: 'claude',
          startedAt: Date.now()
        }
      }
    },
    true
  )
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root!.render(<Probe boundScope={scope} />))
  expect(snapshot.allThreads.map((row) => row.paneKey)).toEqual([pane])
  expect(snapshot.markAllReadThreads.map((row) => row.paneKey)).toEqual([pane])
  await act(async () =>
    useAppStore.setState({
      agentsFilterRepoIds: ['other'],
      agentsVisibleHostIds: ['runtime:other']
    })
  )
  expect(snapshot.visibleThreads.map((row) => row.paneKey)).toEqual([pane])
  await act(async () =>
    root!.render(<Probe boundScope={{ repoId: 'other', hostId: scope.hostId }} />)
  )
  expect(snapshot.allThreads).toEqual([])
  expect(snapshot.markAllReadThreads).toEqual([])
  expect(snapshot.visibleThreads).toEqual([])
  expect(snapshot.selectedPaneKeyIsLive).toBe(false)
  expect(snapshot.effectiveSelectedPaneKey).toBeNull()
  await act(async () => root!.render(<Probe boundScope={null} />))
  expect(snapshot.allThreads).toEqual([])
  await act(async () => root!.render(<Probe boundScope={undefined} />))
  expect(snapshot.allThreads.map((row) => row.paneKey)).toEqual([pane])
  expect(useAppStore.getState().agentsFilterRepoIds).toEqual(['other'])
  expect(useAppStore.getState().agentsVisibleHostIds).toEqual(['runtime:other'])
})
