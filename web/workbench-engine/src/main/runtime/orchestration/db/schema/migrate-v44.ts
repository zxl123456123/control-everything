import type { OrchestrationDb } from '../orchestration-db'

// Frozen spellings: this migration must not change when the live address codec changes.
const OLD = 'orca_session_id:'
const NEXT = 'agent_session:'

const ADDRESS_COLUMNS = [
  // Move remembered addresses before a runs update can invoke its remember trigger.
  ['run_coordinator_handles', 'terminal_handle'],
  ['structured_pointer_operations', 'mailbox_handle'],
  ['messages', 'from_handle'],
  ['messages', 'to_handle'],
  ['coordinator_runs', 'coordinator_handle'],
  ['runs', 'coordinator_handle'],
  ['tasks', 'created_by_terminal_handle'],
  ['dispatch_contexts', 'assignee_handle'],
  ['dispatch_contexts', 'creator_handle']
] as const

/** Rewrite only address columns. The enclosing migration transaction rolls back on any collision. */
export function migrateV44(this: OrchestrationDb, current: number): void {
  if (current >= 44) return
  for (const [table, column] of ADDRESS_COLUMNS) {
    this.db.exec(
      `UPDATE ${table} SET ${column} = '${NEXT}' || substr(${column}, ${OLD.length + 1}) ` +
        `WHERE substr(${column}, 1, ${OLD.length}) = '${OLD}'`
    )
  }
}
