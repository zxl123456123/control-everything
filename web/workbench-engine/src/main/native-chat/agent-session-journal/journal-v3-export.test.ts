import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from '../../sqlite/sync-database'
import {
  agentJournalItemKey,
  canonicalAgentJournalItemKey
} from '../../../shared/agent-session-journal-item-key'
import { exportJournalV3 } from './journal-v3-export'
import { journalV3Key } from './journal-v3-key'
import { JournalHostDatabase, journalDatabasePath } from './journal-host-database'
import { publishJournalSessionEpoch } from './journal-row-table'
import {
  writeCommandReceiptTestRecord,
  commandReceiptFixture
} from './command-receipt-test-support'
import { insertCommandReceiptIfAbsent } from './command-receipt-table'
import { commandReceiptScope } from './command-receipt-schema'

describe('explicit journal v3 export', () => {
  let directory = ''
  let database: JournalHostDatabase
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'zkyq-journal-v3-'))
    database = JournalHostDatabase.open(directory)
  })
  afterEach(async () => {
    if (!database.isClosed) database.close()
    await rm(directory, { recursive: true, force: true })
  })
  const old = JSON.stringify({
    v: 3,
    epoch: 'e',
    seq: 1,
    fence: 1,
    ts: 1,
    kind: 'epoch',
    reason: 'session_created',
    providerHandle: { kind: 'codex', threadId: 't' }
  })
  function seed(extra: Record<string, unknown> = {}) {
    publishJournalSessionEpoch(database.db, { sessionId: 's', workspaceId: 'w' }, 'e')
    database.db.prepare('INSERT INTO journal_rows VALUES (?, ?, ?, ?, ?)').run('s', 'e', 1, 1, old)
    const row = {
      v: 4,
      epoch: 'e',
      seq: 2,
      fence: 1,
      ts: 2,
      kind: 'item',
      itemId: 'zkyq:answer',
      revision: 1,
      body: {
        kind: 'turn',
        turnId: 'zkyq:opaque',
        userItemId: 'zkyq:send',
        state: 'completed',
        later: 'zkyq:user-text'
      },
      ...extra
    }
    database.db
      .prepare('INSERT INTO journal_rows VALUES (?, ?, ?, ?, ?)')
      .run('s', 'e', 2, 2, JSON.stringify(row))
  }

  it('snapshots WAL and preserves latest data, old bytes and every unrelated table', async () => {
    seed()
    database.transaction((db) => {
      writeCommandReceiptTestRecord(db)
      insertCommandReceiptIfAbsent(
        db,
        commandReceiptScope('caller-1'),
        commandReceiptFixture({
          result: {
            kind: 'prompt-answer',
            itemId: 'zkyq:answer',
            revision: 2,
            resolution: {
              state: 'resolved',
              selectedOptionId: 'zkyq:opaque-option',
              resolvedBy: null,
              resolvedAt: 2
            }
          }
        })
      )
    })
    const before = database.db.prepare('SELECT row_json FROM journal_rows ORDER BY seq').all()
    const receipts = database.db.prepare('SELECT * FROM agent_session_command_receipts').all()
    const records = database.db.prepare('SELECT * FROM agent_session_records').all()
    const output = join(directory, 'export.db')
    await expect(exportJournalV3(journalDatabasePath(directory), output)).resolves.toMatchObject({
      rows: 2,
      rewrittenRows: 1,
      rewrittenReceipts: 1
    })
    expect(database.db.prepare('SELECT row_json FROM journal_rows ORDER BY seq').all()).toEqual(
      before
    )
    expect(database.db.prepare('SELECT * FROM agent_session_command_receipts').all()).toEqual(
      receipts
    )
    const exported = new Database(output, { readonly: true })
    try {
      const rows = exported.prepare('SELECT row_json FROM journal_rows ORDER BY seq').all()
      expect(rows[0]?.row_json).toBe(old)
      expect(JSON.parse(String(rows[1]?.row_json))).toMatchObject({
        v: 3,
        itemId: 'orca:answer',
        body: {
          turnId: 'zkyq:opaque',
          userItemId: 'orca:send',
          later: 'zkyq:user-text'
        }
      })
      expect(exported.prepare('SELECT * FROM agent_session_records').all()).toEqual(records)
      const projected = exported.prepare('SELECT * FROM agent_session_command_receipts').all()
      expect(projected).toEqual(
        receipts.map((receipt) => ({
          ...receipt,
          result_json: JSON.stringify({
            ...JSON.parse(String(receipt.result_json)),
            itemId: 'orca:answer'
          })
        }))
      )
      expect(exported.pragma('integrity_check', { simple: true })).toBe('ok')
    } finally {
      exported.close()
    }
  })

  it.each([{ v: 5 }, { body: { kind: 'turn', state: null } }])(
    'refuses unsupported content without publishing or changing source: %j',
    async (extra) => {
      seed(extra)
      const before = database.db.prepare('SELECT row_json FROM journal_rows ORDER BY seq').all()
      const output = join(directory, 'refused.db')
      await expect(exportJournalV3(journalDatabasePath(directory), output)).rejects.toThrow(
        'unreadable or damaged row'
      )
      await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(database.db.prepare('SELECT row_json FROM journal_rows ORDER BY seq').all()).toEqual(
        before
      )
    }
  )

  it('refuses an existing target and leaves its exact contents intact', async () => {
    seed()
    const output = join(directory, 'existing.db')
    await writeFile(output, 'user-owned')
    await expect(exportJournalV3(journalDatabasePath(directory), output)).rejects.toThrow(
      'already exists'
    )
    expect(await readFile(output, 'utf8')).toBe('user-owned')
  })

  it('refuses a newer database version without publishing a v3 file', async () => {
    seed()
    database.db.pragma('user_version = 5')
    const output = join(directory, 'future.db')
    await expect(exportJournalV3(journalDatabasePath(directory), output)).rejects.toThrow(
      'database version cannot be exported'
    )
    await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(database.db.pragma('user_version', { simple: true })).toBe(5)
  })

  it.each([JSON.stringify({ kind: 'future-result' }), '{invalid-private-content'])(
    'rolls the copy back if a later receipt cannot be projected: %s',
    async (resultJson) => {
      seed()
      database.transaction((db) => {
        writeCommandReceiptTestRecord(db)
        insertCommandReceiptIfAbsent(db, commandReceiptScope('caller-1'), commandReceiptFixture())
        db.prepare('UPDATE agent_session_command_receipts SET result_json = ?').run(resultJson)
      })
      const output = join(directory, 'receipt-refused.db')
      await expect(exportJournalV3(journalDatabasePath(directory), output)).rejects.toThrow(
        'unreadable command receipt'
      )
      await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' })
      const pending = new Database(`${output}.pending`, { readonly: true })
      try {
        const row = pending.prepare('SELECT row_json FROM journal_rows WHERE seq = 2').get()
        expect(JSON.parse(String(row?.row_json))).toMatchObject({ v: 4, itemId: 'zkyq:answer' })
      } finally {
        pending.close()
      }
    }
  )
})

describe('journal key downgrade domains', () => {
  it('round trips generated digests, raw mimics, Unicode and exact legacy encodings', () => {
    const generated = agentJournalItemKey({ provider: 'zkyq', clientMessageId: 'x'.repeat(1100) })
    const digest = decodeURIComponent(generated.slice('zkyq:%FE'.length))
    for (const current of [
      generated,
      agentJournalItemKey({ provider: 'zkyq', clientMessageId: digest }),
      agentJournalItemKey({
        provider: 'zkyq',
        clientMessageId: digest.replace('zkyq-oversized', 'orca-oversized')
      }),
      'zkyq:%78',
      'codex:t:turn:01',
      'claude:s:%E7%94%A8%E6%88%B7',
      'unknown:%ZZ'
    ]) {
      expect(canonicalAgentJournalItemKey(journalV3Key(current))).toBe(current)
    }
  })
})
