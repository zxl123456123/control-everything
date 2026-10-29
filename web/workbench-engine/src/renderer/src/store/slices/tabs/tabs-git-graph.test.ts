import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from '../store-test-helpers'
import { createTabsSliceMockApi } from '../tabs-slice-test-harness'
import { projectWorktreeTabModelReconciliation } from './tabs-reconciliation'
import { getActiveTabNavOrder } from '@/components/tab-bar/group-tab-order'
import {
  buildOrderedTabItems,
  findActiveVisibleTabId
} from '@/components/tab-bar/tab-bar-item-model'
import { getNextTabAcrossAllTypes } from '@/components/terminal/tab-type-cycle'
import { activateTabNumberShortcut } from '@/lib/tab-number-shortcuts'
import { isVirtualEditorFile } from '../editor/tabs/editor-tab-content-type'

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
const current = vi.hoisted(() => ({ store: null as ReturnType<typeof createTestStore> | null }))
vi.mock('@/store', () => ({
  get useAppStore() {
    return current.store
  }
}))
const WORKTREE = 'repo::/workspace'
beforeEach(() => {
  createTabsSliceMockApi()
})

function graphStore() {
  const store = createTestStore()
  current.store = store
  store.setState({ activeWorktreeId: WORKTREE })
  return store
}

describe('Git graph workspace tab lifecycle', () => {
  it('reuses one self-backed tab and survives reconciliation without a file or terminal', () => {
    const store = graphStore()
    const first = store.getState().openGitGraph(WORKTREE)
    expect(store.getState().openGitGraph(WORKTREE)).toBe(first)
    const before = store.getState()
    expect(before.unifiedTabsByWorktree[WORKTREE]).toHaveLength(1)
    expect(before.getTab(first)?.entityId).toBe(first)
    expect(before.activeTabType).toBe('git-graph')
    expect(before.openFiles).toEqual([])
    expect(before.tabsByWorktree[WORKTREE] ?? []).toEqual([])
    expect(activateTabNumberShortcut(0)).toBe(true)
    expect(store.getState().activeTabType).toBe('git-graph')
    expect(store.getState().activeFileId).not.toBe(first)
    expect(isVirtualEditorFile({ mode: 'edit', language: 'git-graph' })).toBe(true)
    const { patch } = projectWorktreeTabModelReconciliation(before, WORKTREE)
    store.setState(patch)
    expect(store.getState().getTab(first)?.contentType).toBe('git-graph')
    store.getState().closeUnifiedTab(first)
    expect(store.getState().getTab(first)).toBeNull()
    expect(store.getState().openFiles).toEqual([])
  })

  it('keeps workspaces separate and opens in the requested split group', () => {
    const store = graphStore()
    const group = store.getState().ensureWorktreeRootGroup(WORKTREE)
    const id = store.getState().openGitGraph(WORKTREE, { targetGroupId: group })
    const second = store.getState().openGitGraph('other::/workspace')
    expect(second).not.toBe(id)
    expect(store.getState().getTab(id)?.groupId).toBe(group)
    expect(store.getState().getTab(second)?.worktreeId).toBe('other::/workspace')
    store.setState({ activeWorktreeId: 'other::/workspace' })
    expect(store.getState().openGitGraph('other::/workspace')).toBe(second)
  })

  it('renders and keyboard-cycles the graph in the same order as the tab strip', () => {
    const store = graphStore()
    const graphId = store.getState().openGitGraph(WORKTREE)
    const graph = store.getState().getTab(graphId)!
    const chat = store.getState().createUnifiedTab(WORKTREE, 'agent-session', {
      label: 'Chat',
      targetGroupId: graph.groupId
    })
    const state = store.getState()
    const order = getActiveTabNavOrder(state, WORKTREE)
    expect(order.map((item) => item.type)).toEqual(['git-graph', 'agent-session'])
    expect(
      getNextTabAcrossAllTypes({
        tabs: order,
        activeTabType: 'agent-session',
        activeTabId: null,
        activeFileId: null,
        activeBrowserTabId: null,
        activeGroupTabId: chat.id,
        direction: 1
      })?.tabId
    ).toBe(graphId)
    const items = buildOrderedTabItems({
      tabBarOrder: [graphId],
      terminalIds: [],
      editorFileIds: [],
      browserTabIds: [],
      simulatorTabIds: [],
      gitGraphTabIds: [graphId],
      agentSessionTabIds: [],
      terminalMap: new Map(),
      editorMap: new Map(),
      browserMap: new Map(),
      agentSessionMap: new Map(),
      unifiedTabByVisibleId: new Map([[graphId, graph]])
    })
    expect(items.map((item) => item.type)).toEqual(['git-graph'])
    expect(
      findActiveVisibleTabId(items, {
        activeTabId: null,
        activeTabType: 'git-graph',
        activeGitGraphTabId: graphId
      })
    ).toBe(graphId)
  })
})
