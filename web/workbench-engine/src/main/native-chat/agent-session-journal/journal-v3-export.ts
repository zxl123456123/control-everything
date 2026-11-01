import { closeSync, linkSync, lstatSync, openSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from '../../sqlite/sync-database'
import { bestEffortFsyncDirectorySync, fsyncFileSync } from '../../../shared/secure-file'
import { mapJournalRowKeys } from './journal-row-key-identity'
import { parseJournalRow } from './journal-row-schema'
import { commandReceiptResultSchema } from './command-receipt-schema'
import { mapCommandReceiptResultKeys } from './command-receipt-key-identity'
import { journalV3Key } from './journal-v3-key'

// This exporter targets the frozen v3 reader, independent of a future writer's maximum.
const V3_MAX_DATABASE_VERSION = 4

/** Snapshot only: never installs the export or replaces the source database. Stop writers
 *  before taking the snapshot that will be used for an actual runtime downgrade. */
export async function exportJournalV3(
  sourceFile: string,
  outputFile: string
): Promise<{
  databasePath: string
  rows: number
  rewrittenRows: number
  rewrittenReceipts: number
}> {
  try {
    lstatSync(outputFile)
    throw new Error('Journal export target already exists')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  const pending = `${outputFile}.pending`
  closeSync(openSync(pending, 'wx', 0o600))
  const source = new Database(sourceFile, { readonly: true, fileMustExist: true })
  try {
    await source.backup(pending)
  } finally {
    source.close()
  }
  const copy = new Database(pending, { fileMustExist: true })
  let counts: { rows: number; rewrittenRows: number; rewrittenReceipts: number }
  try {
    const version = Number(copy.pragma('user_version', { simple: true }))
    if (version < 3 || version > V3_MAX_DATABASE_VERSION) {
      throw new Error('Journal database version cannot be exported for v3')
    }
    // Publish one self-contained file; sidecars must not be needed to read the export.
    copy.pragma('journal_mode = DELETE')
    copy.pragma('synchronous = FULL')
    copy.exec('BEGIN IMMEDIATE')
    try {
      const journal = rewriteJsonColumn(copy, 'journal_rows', 'row_json', projectRow)
      const receipts = copy
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get('agent_session_command_receipts')
        ? rewriteJsonColumn(copy, 'agent_session_command_receipts', 'result_json', projectReceipt)
        : { rows: 0, rewritten: 0 }
      counts = {
        rows: journal.rows,
        rewrittenRows: journal.rewritten,
        rewrittenReceipts: receipts.rewritten
      }
      copy.exec('COMMIT')
    } catch (error) {
      copy.exec('ROLLBACK')
      throw error
    }
    if (copy.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('Journal export failed its SQLite integrity check')
    }
  } finally {
    copy.close()
  }
  fsyncFileSync(pending)
  linkSync(pending, outputFile)
  bestEffortFsyncDirectorySync(dirname(outputFile))
  unlinkSync(pending)
  bestEffortFsyncDirectorySync(dirname(outputFile))
  return { databasePath: outputFile, ...counts }
}

function projectRow(source: string): string {
  if (!parseJournalRow(source).ok) throw new Error('Journal contains an unreadable or damaged row')
  const record = JSON.parse(source) as Record<string, unknown>
  if (typeof record.v !== 'number' || record.v > 4)
    throw new Error('Journal row version cannot be exported for v3')
  if (record.v !== 4) return source
  return JSON.stringify({ ...mapJournalRowKeys(record, journalV3Key), v: 3 })
}

function projectReceipt(source: string): string {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error('Journal contains an unreadable command receipt')
  }
  const result = commandReceiptResultSchema.safeParse(value)
  if (!result.success) throw new Error('Journal contains an unreadable command receipt')
  if (result.data.kind !== 'prompt-answer') return source
  return JSON.stringify(mapCommandReceiptResultKeys(result.data, journalV3Key))
}

function rewriteJsonColumn(
  db: Database.Database,
  table: 'journal_rows' | 'agent_session_command_receipts',
  column: 'row_json' | 'result_json',
  project: (source: string) => string
): { rows: number; rewritten: number } {
  let last: number | null = null
  let rows = 0
  let rewritten = 0
  const first = db.prepare(
    `SELECT rowid AS id, ${column} AS json FROM ${table} ORDER BY rowid LIMIT 128`
  )
  const next = db.prepare(
    `SELECT rowid AS id, ${column} AS json FROM ${table} WHERE rowid > ? ORDER BY rowid LIMIT 128`
  )
  const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`)
  while (true) {
    const page = last === null ? first.all() : next.all(last)
    if (page.length === 0) return { rows, rewritten }
    for (const row of page) {
      if (typeof row.id !== 'number' || !Number.isSafeInteger(row.id))
        throw new Error('Journal row address is unreadable')
      last = row.id
      rows += 1
      if (column === 'result_json' && row.json === null) continue
      if (typeof row.json !== 'string') throw new Error('Journal JSON column is unreadable')
      const converted = project(row.json)
      if (converted !== row.json) {
        update.run(converted, row.id)
        rewritten += 1
      }
    }
  }
}
