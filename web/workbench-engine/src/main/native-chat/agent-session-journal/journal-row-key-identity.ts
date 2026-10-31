import { canonicalAgentJournalItemKey } from '../../../shared/agent-session-journal-item-key'

/** Only journal addresses move. Text, client/provider ids and unknown extensions stay opaque. */
export function canonicalJournalRowKeys<T extends object>(row: T): T {
  const record = row as Record<string, unknown>
  const current = { ...record }
  if (record.kind === 'item' || record.kind === 'tombstone') {
    rewriteKey(current, 'itemId')
  }
  if (record.kind === 'item' && isRecord(record.body)) {
    current.body = canonicalBody(record.body)
  }
  if (record.kind === 'dispatch') {
    rewriteKey(current, 'providerItemId')
    if (isRecord(record.answeredInTurn)) {
      current.answeredInTurn = { ...record.answeredInTurn }
      rewriteKey(current.answeredInTurn as Record<string, unknown>, 'turnItemId')
    }
  }
  if (isRecord(record.turnScope) && record.turnScope.kind === 'turn') {
    current.turnScope = { ...record.turnScope }
    rewriteKey(current.turnScope as Record<string, unknown>, 'turnItemId')
  }
  if (record.kind === 'lifecycle-batch' && Array.isArray(record.mutations)) {
    current.mutations = record.mutations.map((mutation) =>
      isRecord(mutation) && (mutation.kind === 'item' || mutation.kind === 'tombstone')
        ? canonicalJournalRowKeys(mutation)
        : mutation
    )
  }
  return current as T
}

function canonicalBody(body: Record<string, unknown>): Record<string, unknown> {
  if (body.kind === 'turn') {
    const current = { ...body }
    rewriteKey(current, 'userItemId')
    return current
  }
  if (body.kind === 'status' && isRecord(body.turnLifecycle)) {
    const turnLifecycle = { ...body.turnLifecycle }
    rewriteKey(turnLifecycle, 'userItemId')
    return { ...body, turnLifecycle }
  }
  return body
}

function rewriteKey(record: Record<string, unknown>, field: string): void {
  if (typeof record[field] === 'string') {
    record[field] = canonicalAgentJournalItemKey(record[field])
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
