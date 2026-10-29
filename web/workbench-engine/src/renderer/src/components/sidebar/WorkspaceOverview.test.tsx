// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'
import { makeWorktree } from '../../store/slices/worktrees-slice-test-fixtures'
import WorkspaceOverview from './WorkspaceOverview'

// The DOM has no layout; preserve the virtualizer boundary and return a small window.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    getItemKey
  }: {
    count: number
    getItemKey: (i: number) => string
  }) => ({
    getTotalSize: () => count * 132,
    getVirtualItems: () => {
      const start = count > 4 ? 10 : 0
      const length = count > 4 ? 2 : count
      return Array.from({ length }, (_, offset) => {
        const index = start + offset
        return { index, key: getItemKey(index), start: index * 132 }
      })
    },
    measure: () => {},
    measureElement: () => {}
  })
}))

vi.mock('./WorktreeCard', () => ({
  default: ({
    worktree,
    isActive,
    onActivate
  }: {
    worktree: Worktree
    isActive: boolean
    onActivate: () => void
  }) => (
    <button data-worktree-card-surface="true" data-active={isActive} onClick={onActivate}>
      {getWorktreeHostIdentity(worktree)}
    </button>
  )
}))

let resize: () => void
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1100)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect() {}
    }
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function overview(items: Worktree[], activeWorktreeIdentity: string | null = null) {
  const onActivate = vi.fn()
  const result = render(
    <WorkspaceOverview
      items={items}
      repoMap={new Map()}
      activeWorktreeIdentity={activeWorktreeIdentity}
      onActivate={onActivate}
    />
  )
  return { ...result, onActivate }
}

describe('WorkspaceOverview', () => {
  it('mounts only the visible rows of a large workspace set', () => {
    const { container } = overview(
      Array.from({ length: 500 }, (_, index) =>
        makeWorktree({ id: `w${index}`, repoId: 'repo', hostId: 'local', lastActivityAt: 1 })
      )
    )
    expect(container.querySelector('[data-workspace-overview-columns="4"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-workspace-overview-card]')).toHaveLength(8)
    expect(container.textContent).toContain('local|w40')
    expect(container.textContent).not.toContain('local|w499')
  })

  it('keeps same-id hosts distinct and prioritizes the exact active workspace', () => {
    const { container, onActivate } = overview(
      [
        makeWorktree({ id: 'shared', repoId: 'repo', hostId: 'local', lastActivityAt: 20 }),
        makeWorktree({ id: 'shared', repoId: 'repo', hostId: 'ssh:host-b', lastActivityAt: 1 })
      ],
      'ssh:host-b|shared'
    )
    const cards = [...container.querySelectorAll('[data-workspace-overview-card]')]
    expect(cards.map((card) => card.getAttribute('data-workspace-overview-card'))).toEqual([
      'ssh:host-b|shared',
      'local|shared'
    ])
    expect(cards[0].querySelector('[data-active="true"]')).not.toBeNull()
    fireEvent.click(cards[0].querySelector('button')!)
    expect(onActivate).toHaveBeenCalledOnce()
    fireEvent.keyDown(cards[1], { key: 'Enter' })
    fireEvent.keyDown(cards[1], { key: ' ' })
    expect(onActivate).toHaveBeenCalledTimes(3)
  })

  it('uses two columns at a medium width and only renders supplied scoped workspaces', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(550)
    const { container } = overview([
      makeWorktree({ id: 'visible', repoId: 'repo', hostId: 'local' })
    ])
    expect(container.querySelector('[data-workspace-overview-columns="2"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-workspace-overview-card]')).toHaveLength(1)
    expect(container.textContent).toBe('local|visible')
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(250)
    act(() => resize())
    expect(container.querySelector('[data-workspace-overview-columns="1"]')).not.toBeNull()
  })

  it('explains an empty filtered set without inventing a workspace', () => {
    const { container } = overview([])
    expect(container.textContent).toContain('当前筛选下没有工作区')
    expect(container.querySelector('[data-workspace-overview-card]')).toBeNull()
  })
})
