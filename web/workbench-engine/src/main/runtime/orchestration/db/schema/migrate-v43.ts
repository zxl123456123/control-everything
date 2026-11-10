import type { OrchestrationDb } from '../orchestration-db'

// Frozen literals, never the live prefix constant: a migration rewrites what that build wrote.
const LEGACY_PREFIX = 'session:'
const CURRENT_PREFIX = 'orca_session_id:'

// Every column an earlier build wrote a session's mail address into. Bodies, subjects and payloads
// are text, not addresses, and are left as written.
const ADDRESS_COLUMNS = [
  ['messages', 'from_handle'],
  ['messages', 'to_handle'],
  ['coordinator_runs', 'coordinator_handle']
] as const

// Address columns in a key: where the current spelling already has its row, the legacy one is a duplicate.
const KEYED_ADDRESS_COLUMNS = [
  ['run_coordinator_handles', 'terminal_handle'],
  ['structured_pointer_operations', 'mailbox_handle']
] as const

/**
 * Earlier builds addressed an Orca session as `session:<id>`. Respells every stored one as
 * `orca_session_id:<id>`, so a chat still reads mail sent before the upgrade, a Run still routes
 * mail to the chat that coordinated it, and a reply to old mail reaches its sender.
 */
export function migrateV43(this: OrchestrationDb, current: number): void {
  if (current >= 43) {
    return
  }
  // Different operation IDs are not duplicates: discarding one can repeat or lose a delivery.
  const conflict = this.db
    .prepare(`
    SELECT 1 FROM structured_pointer_operations AS old
    JOIN structured_pointer_operations AS current
      ON current.mailbox_handle = '${CURRENT_PREFIX}' || substr(old.mailbox_handle, ${LEGACY_PREFIX.length + 1})
    WHERE substr(old.mailbox_handle, 1, ${LEGACY_PREFIX.length}) = '${LEGACY_PREFIX}'
      AND (old.session_id != current.session_id OR old.operation_id != current.operation_id
        OR old.batch_fingerprint != current.batch_fingerprint OR old.minted_at_ms != current.minted_at_ms)
    LIMIT 1
  `)
    .get()
  if (conflict) {
    throw new Error(
      'Cannot migrate conflicting session pointer operations without losing delivery identity'
    )
  }
  const isLegacy = (column: string): string =>
    `substr(${column}, 1, ${LEGACY_PREFIX.length}) = '${LEGACY_PREFIX}'`
  const respelled = (column: string): string =>
    `'${CURRENT_PREFIX}' || substr(${column}, ${LEGACY_PREFIX.length + 1})`
  for (const [table, column] of ADDRESS_COLUMNS) {
    this.db.exec(`UPDATE ${table} SET ${column} = ${respelled(column)} WHERE ${isLegacy(column)}`)
  }
  for (const [table, column] of KEYED_ADDRESS_COLUMNS) {
    this.db.exec(`
      UPDATE OR IGNORE ${table} SET ${column} = ${respelled(column)} WHERE ${isLegacy(column)};
      DELETE FROM ${table} WHERE ${isLegacy(column)};
    `)
  }
}
