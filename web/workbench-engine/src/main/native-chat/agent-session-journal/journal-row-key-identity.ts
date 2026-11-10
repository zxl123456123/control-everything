import { canonicalAgentJournalItemKey } from '../../../shared/agent-session-journal-item-key'

/** Only journal addresses move. Text, client/provider ids and unknown extensions stay opaque. */
export function canonicalJournalRowKeys<T extends object>(row: T): T {
  return mapJournalRowKeys(row, canonicalAgentJournalItemKey)
}

/** Shared by read-time migration and the explicit offline downgrade export. */
export function mapJournalRowKeys<T extends object>(row: T, mapKey: (key: string) => string): T {
  const record = row as Record<string, unknown>
  const current = { ...record }
  if (record.kind === 'item' || record.kind === 'tombstone') {
    rewriteKey(current, 'itemId', mapKey)
  }
  if (record.kind === 'item' && isRecord(record.body)) {
    current.body = canonicalBody(record.body, mapKey)
  }
  if (record.kind === 'dispatch') {
    rewriteKey(current, 'providerItemId', mapKey)
    if (isRecord(record.answeredInTurn)) {
      current.answeredInTurn = { ...record.answeredInTurn }
      rewriteKey(current.answeredInTurn as Record<string, unknown>, 'turnItemId', mapKey)
    }
  }
  if (isRecord(record.turnScope) && record.turnScope.kind === 'turn') {
    current.turnScope = { ...record.turnScope }
    rewriteKey(current.turnScope as Record<string, unknown>, 'turnItemId', mapKey)
  }
  if (record.kind === 'lifecycle-batch' && Array.isArray(record.mutations)) {
    current.mutations = record.mutations.map((mutation) =>
      isRecord(mutation) && (mutation.kind === 'item' || mutation.kind === 'tombstone')
        ? mapJournalRowKeys(mutation, mapKey)
        : mutation
    )
  }
  return current as T
}

function canonicalBody(
  body: Record<string, unknown>,
  mapKey: (key: string) => string
): Record<string, unknown> {
  if (body.kind === 'turn') {
    const current = { ...body }
    rewriteKey(current, 'userItemId', mapKey)
    return current
  }
  if (body.kind === 'status' && isRecord(body.turnLifecycle)) {
    const turnLifecycle = { ...body.turnLifecycle }
    rewriteKey(turnLifecycle, 'userItemId', mapKey)
    return { ...body, turnLifecycle }
  }
  return body
}

function rewriteKey(
  record: Record<string, unknown>,
  field: string,
  mapKey: (key: string) => string
): void {
  if (typeof record[field] === 'string') {
    record[field] = mapKey(record[field])
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
