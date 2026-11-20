import { describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import { resolvePlatformReviewGroup } from './platform-review-target'
import { shouldOpenSourceControlRowAsPreview } from '@/components/right-sidebar/source-control/listing/split-open'

function state(contentType: 'terminal' | 'agent-session' | 'git-graph' | 'editor') {
  return {
    activeView: 'terminal',
    activeWorktreeId: 'wt',
    groupsByWorktree: {
      wt: [{ id: 'left', worktreeId: 'wt', activeTabId: 'tab', tabOrder: ['tab'] }]
    },
    layoutByWorktree: { wt: { type: 'leaf', groupId: 'left' } },
    unifiedTabsByWorktree: {
      wt: [
        {
          id: 'tab',
          entityId: 'entity',
          groupId: 'left',
          worktreeId: 'wt',
          contentType,
          label: 'Session',
          customLabel: null,
          color: null,
          sortOrder: 0,
          createdAt: 0
        }
      ]
    },
    createEmptySplitGroup: vi.fn(() => 'right')
  } satisfies Parameters<typeof resolvePlatformReviewGroup>[0]
}

describe('platform review group placement', () => {
  it('keeps automatic review opens as previews and explicit splits permanent', () => {
    const event = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }
    expect(shouldOpenSourceControlRowAsPreview(event, undefined)).toBe(true)
    expect(shouldOpenSourceControlRowAsPreview(undefined, undefined)).toBe(true)
    expect(shouldOpenSourceControlRowAsPreview({ ...event, ctrlKey: true }, 'right')).toBe(false)
    expect(shouldOpenSourceControlRowAsPreview({ ...event, openAsPermanent: true }, 'right')).toBe(
      false
    )
  })
  it.each(['terminal', 'agent-session', 'git-graph'] as const)(
    'keeps a visible %s beside the requested document',
    (kind) => {
      const current = state(kind)
      expect(resolvePlatformReviewGroup(current, 'wt')).toBe('right')
      expect(current.createEmptySplitGroup).toHaveBeenCalledWith('wt', 'left', 'right')
    }
  )
  it('leaves editor-only and different-worktree opens on the normal route', () => {
    const current = state('editor')
    expect(resolvePlatformReviewGroup(current, 'wt')).toBeUndefined()
    expect(resolvePlatformReviewGroup(state('terminal'), 'other')).toBeUndefined()
    expect(current.createEmptySplitGroup).not.toHaveBeenCalled()
  })
  it('reuses a right reading group even after focus moved there', () => {
    const current = state('terminal')
    const layout: AppState['layoutByWorktree'] = {
      wt: {
        type: 'split',
        direction: 'horizontal',
        first: { type: 'leaf', groupId: 'left' },
        second: { type: 'leaf', groupId: 'right' }
      }
    }
    expect(
      resolvePlatformReviewGroup(
        {
          ...current,
          layoutByWorktree: layout,
          groupsByWorktree: {
            wt: [
              ...current.groupsByWorktree.wt,
              { id: 'right', worktreeId: 'wt', activeTabId: null, tabOrder: [] }
            ]
          }
        },
        'wt'
      )
    ).toBe('right')
    expect(current.createEmptySplitGroup).not.toHaveBeenCalled()
  })
  it('does not rearrange a stacked custom layout', () => {
    const current = state('terminal')
    const layout: AppState['layoutByWorktree'] = {
      wt: {
        type: 'split',
        direction: 'vertical',
        first: { type: 'leaf', groupId: 'left' },
        second: { type: 'leaf', groupId: 'right' }
      }
    }
    expect(
      resolvePlatformReviewGroup({ ...current, layoutByWorktree: layout }, 'wt')
    ).toBeUndefined()
    expect(current.createEmptySplitGroup).not.toHaveBeenCalled()
  })
  it.each(['terminal', 'agent-session'] as const)(
    'reuses the right Git Graph after refocusing the left %s',
    (kind) => {
      const current = state(kind)
      const graph = {
        ...current.unifiedTabsByWorktree.wt[0],
        id: 'graph',
        groupId: 'right',
        contentType: 'git-graph' as const
      }
      const layout: AppState['layoutByWorktree'] = {
        wt: {
          type: 'split',
          direction: 'horizontal',
          first: { type: 'leaf', groupId: 'left' },
          second: { type: 'leaf', groupId: 'right' }
        }
      }
      expect(
        resolvePlatformReviewGroup(
          {
            ...current,
            layoutByWorktree: layout,
            unifiedTabsByWorktree: { wt: [...current.unifiedTabsByWorktree.wt, graph] },
            groupsByWorktree: {
              wt: [
                ...current.groupsByWorktree.wt,
                { id: 'right', worktreeId: 'wt', activeTabId: 'graph', tabOrder: ['graph'] }
              ]
            }
          },
          'wt'
        )
      ).toBe('right')
      expect(current.createEmptySplitGroup).not.toHaveBeenCalled()
    }
  )
})
