import { isWorktreePaletteQueryTooLarge } from '@/lib/worktree-palette-query-bounds'
import { searchWorktreeDocuments } from '@/lib/worktree-palette-search'
import { buildWorktreePaletteDocuments } from '@/lib/worktree-palette-document'
import {
  buildPaletteWorktreeIndex,
  resolvePaletteWorktree,
  type PaletteWorktreeIndex
} from '@/lib/palette-repo-resolution'
import type { PaletteDocument } from '@/lib/palette-match/palette-document'
import type { Repo } from '../../../../shared/repo-types'
import type { WorkspaceStatus, Worktree } from '../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'

export type WorkspaceKanbanLaneView = {
  items: readonly Worktree[]
  totalCount: number
}

/**
 * Builds the board's palette index once per worktree/repo identity.
 *
 * Why separate from the match: the index is identical across keystrokes, and building it inline
 * meant normalizing and segmenting every indexed field of every worktree on every character —
 * and again on every agent-status tick, which churns board identities while a query is active.
 */
export function buildWorkspaceBoardPaletteDocuments(args: {
  worktrees: readonly Worktree[]
  repoMap: ReadonlyMap<string, Repo>
  repoMapByHostIdentity?: ReadonlyMap<string, Repo>
}): Map<string, PaletteDocument> {
  // Why the board policy (#15170): the board is a drag surface for named workspaces, so a card
  // may only be hidden by text printed on it. Ports, reviews and automation runs are palette-only.
  return buildWorktreePaletteDocuments(args.worktrees, {
    repoMap: args.repoMap,
    repoMapByHostIdentity: args.repoMapByHostIdentity,
    evidencePolicy: 'board'
  })
}

/**
 * Returns `null` when no filtering is active — distinct from an empty set, which
 * means a real query matched nothing.
 */
export function matchWorkspaceBoardWorktrees(args: {
  worktrees: Worktree[]
  query: string
  repoMap: Map<string, Repo>
  repoMapByHostIdentity?: ReadonlyMap<string, Repo>
  documents?: ReadonlyMap<string, PaletteDocument>
  worktreeIndex?: PaletteWorktreeIndex
}): ReadonlySet<string> | null {
  if (!args.query.trim()) {
    return null
  }
  // Why: searchWorktrees returns [] for an over-bound query, which downstream
  // reads as "matched nothing" and blanks the whole board on a paste accident.
  if (isWorktreePaletteQueryTooLarge(args.query)) {
    return null
  }

  const matched = new Set<string>()
  const worktreeIndex = args.worktreeIndex ?? buildPaletteWorktreeIndex(args.worktrees)
  const documents =
    args.documents ??
    buildWorkspaceBoardPaletteDocuments(args)
  for (const result of searchWorktreeDocuments({
    worktrees: args.worktrees,
    query: args.query,
    documents,
    repoMap: args.repoMap,
    repoMapByHostIdentity: args.repoMapByHostIdentity
  })) {
    if (result.matchedFields.length) {
      // Palette results name the runtime owner; board selection and drag keys name the
      // input row's physical host. Resolve the exact row before crossing that boundary.
      const worktree = resolvePaletteWorktree(worktreeIndex, result.worktreeId, result.worktreeHostId)
      if (worktree) matched.add(getWorktreeHostIdentity(worktree))
    }
  }
  return matched
}

export function buildWorkspaceKanbanLaneViews(args: {
  worktreesByStatus: ReadonlyMap<WorkspaceStatus, readonly Worktree[]>
  matchingWorktreeIds: ReadonlySet<string> | null
}): Map<WorkspaceStatus, WorkspaceKanbanLaneView> {
  const matchingWorktreeIds = args.matchingWorktreeIds
  const views = new Map<WorkspaceStatus, WorkspaceKanbanLaneView>()
  for (const [status, items] of args.worktreesByStatus) {
    views.set(status, {
      // Why: the no-query path must not reallocate a lane array per keystroke.
      items: matchingWorktreeIds
        ? items.filter((worktree) => matchingWorktreeIds.has(getWorktreeHostIdentity(worktree)))
        : items,
      totalCount: items.length
    })
  }
  return views
}
