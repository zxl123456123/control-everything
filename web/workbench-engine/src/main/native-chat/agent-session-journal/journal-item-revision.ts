import type { JournalReducerState } from './journal-reducer'
import { canonicalAgentJournalItemKey } from '../../../shared/agent-session-journal-item-key'

export function nextJournalItemRevision(
  state: JournalReducerState,
  itemId: string,
  revisions?: Map<string, number>
): number {
  const current = canonicalAgentJournalItemKey(itemId)
  const resolved = state.aliases.get(current) ?? current
  const revision =
    (revisions?.get(resolved) ??
      Math.max(state.items.get(resolved)?.revision ?? 0, state.tombstones.get(resolved) ?? 0)) + 1
  revisions?.set(resolved, revision)
  return revision
}

export function journalItemRevisionIsStale(
  state: JournalReducerState,
  itemId: string,
  revision: number
): boolean {
  const tombstoned = state.tombstones.get(itemId)
  const existing = state.items.get(itemId)
  return (
    (tombstoned !== undefined && revision <= tombstoned) ||
    (existing !== undefined && revision <= existing.revision)
  )
}
