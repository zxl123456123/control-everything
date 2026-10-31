import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  agentJournalItemKey,
  boundJournalKeyComponent,
  canonicalAgentJournalItemKey,
  parseAgentJournalItemKey
} from '../../../shared/agent-session-journal-item-key'
import { AGENT_JOURNAL_THREAD_SCOPE } from '../../../shared/agent-session-journal-types'
import { codexProviderHandle } from '../../../shared/agent-session-provider-handle-encoding'
import { canonicalJournalRowKeys } from './journal-row-key-identity'
import { parseJournalRow } from './journal-row-schema'
import {
  createTrackedJournalOpener,
  insertTestJournalRowJson,
  liveTestJournalRows,
  openTestJournalHostDatabase,
  publishTestJournalEpoch
} from './journal-host-database-test-support'

const legacyDigest = `${'a'.repeat(40)}~orca-oversized~1100~0123456789abcdef`
const currentDigest = legacyDigest.replace('~orca-oversized~', '~zkyq-oversized~')

describe('journal identity domains across released and current keys', () => {
  it('preserves a pre-bound raw address for revisions and an unsendable-frame reset', () => {
    const component = 'h'.repeat(2048)
    const old = `orca:${component}`
    expect(canonicalAgentJournalItemKey(old)).toBe(`zkyq:${component}`)
    expect(agentJournalItemKey(parseAgentJournalItemKey(old)!)).toBe(`zkyq:${component}`)
    expect(agentJournalItemKey({ provider: 'zkyq', clientMessageId: component })).not.toBe(
      `zkyq:${component}`
    )
  })
  it.each([
    ['orca:send%3A1', 'zkyq:send%3A1'],
    ['orca:%78', 'zkyq:%78'],
    ['codex:thread:turn:01', 'codex:thread:turn:01'],
    [`claude:s:${legacyDigest}`, `claude:s:%FE${currentDigest}`],
    [`orca:%FF${legacyDigest}`, `zkyq:%FF${legacyDigest}`],
    [`orca:${currentDigest}`, `zkyq:%FF${currentDigest}`],
    [`zkyq:%FE${currentDigest}`, `zkyq:%FE${currentDigest}`],
    ['orca:bad%ZZ', 'orca:bad%ZZ'],
    ['unknown:orca', 'unknown:orca']
  ])('canonicalizes %s without rewriting opaque text', (before, after) => {
    expect(canonicalAgentJournalItemKey(before)).toBe(after)
    expect(canonicalAgentJournalItemKey(after)).toBe(after)
  })

  it('separates a new generated digest from both old and new literal spellings', () => {
    const long = 'a'.repeat(1100)
    const current = boundJournalKeyComponent(long)
    const old = current.replace('~zkyq-oversized~', '~orca-oversized~')
    const key = (clientMessageId: string) =>
      agentJournalItemKey({ provider: 'zkyq', clientMessageId })
    const generated = key(long)
    expect(generated).toBe(`zkyq:%FE${current}`)
    const keys = [generated, key(current), key(old)]
    expect(new Set(keys).size).toBe(3)
    expect(canonicalAgentJournalItemKey(`orca:${old}`)).toBe(generated)
    expect(canonicalAgentJournalItemKey(`orca:${current}`)).toBe(key(current))
    expect(canonicalAgentJournalItemKey(`orca:%FF${old}`)).toBe(key(old))
    for (const value of keys) {
      expect(agentJournalItemKey(parseAgentJournalItemKey(value)!)).toBe(value)
    }
  })

  it('does not consume an opaque digest head or malformed reserved tag', () => {
    const old = `~orca-oversized~head~orca-oversized~1100~0123456789abcdef`
    expect(canonicalAgentJournalItemKey(`orca:${old}`)).toBe(
      `zkyq:%FE~orca-oversized~head~zkyq-oversized~1100~0123456789abcdef`
    )
    expect(parseAgentJournalItemKey('zkyq:%FEordinary')).toBeNull()
    expect(parseAgentJournalItemKey(`zkyq:%FE${legacyDigest}`)).toBeNull()
  })
})

describe('journal address references', () => {
  it('moves recognized references, keeping user/provider ids and unknown bodies unchanged', () => {
    const row = {
      kind: 'lifecycle-batch',
      settlementId: 'orca:opaque',
      mutations: [
        {
          kind: 'item',
          itemId: 'orca:turn',
          echoOf: 'orca:opaque',
          turnScope: { kind: 'turn', turnItemId: 'orca:turn' },
          body: {
            kind: 'turn',
            turnId: 'orca:opaque',
            userItemId: 'orca:send',
            providerTurnId: 'orca:opaque'
          }
        },
        { kind: 'tombstone', itemId: 'orca:gone' },
        {
          kind: 'item',
          itemId: 'orca:status',
          body: { kind: 'status', text: 'orca:send', turnLifecycle: { userItemId: 'orca:send' } }
        },
        { kind: 'item', itemId: 'orca:future', body: { kind: 'future', userItemId: 'orca:opaque' } }
      ]
    }
    const bytes = JSON.stringify(row)
    const current = canonicalJournalRowKeys(row)
    expect(current.mutations[0]).toEqual({
      kind: 'item',
      itemId: 'zkyq:turn',
      echoOf: 'orca:opaque',
      turnScope: { kind: 'turn', turnItemId: 'zkyq:turn' },
      body: {
        kind: 'turn',
        turnId: 'orca:opaque',
        userItemId: 'zkyq:send',
        providerTurnId: 'orca:opaque'
      }
    })
    expect(current.mutations[1]?.itemId).toBe('zkyq:gone')
    expect(current.mutations[2]?.body).toEqual({
      kind: 'status',
      text: 'orca:send',
      turnLifecycle: { userItemId: 'zkyq:send' }
    })
    expect(current.mutations[3]?.body).toEqual({ kind: 'future', userItemId: 'orca:opaque' })
    expect(current.settlementId).toBe('orca:opaque')
    expect(JSON.stringify(row)).toBe(bytes)
  })

  it('upcasts dispatch and its answered turn while preserving malformed content for admission', () => {
    const row = {
      v: 2,
      epoch: 'e',
      seq: 2,
      fence: 1,
      ts: 1,
      kind: 'dispatch',
      clientMessageId: 'orca:opaque',
      state: 'rejected',
      providerItemId: 'orca:send',
      reason: 'orca:reason',
      turnScope: { kind: 'turn', turnItemId: 'orca:turn' },
      answeredInTurn: { turnItemId: 'orca:turn', via: 'steer' }
    }
    expect(parseJournalRow(JSON.stringify(row))).toMatchObject({
      ok: true,
      row: {
        v: 4,
        clientMessageId: 'orca:opaque',
        providerItemId: 'zkyq:send',
        reason: 'orca:reason',
        turnScope: { turnItemId: 'zkyq:turn' },
        answeredInTurn: { turnItemId: 'zkyq:turn' }
      }
    })
    expect(
      parseJournalRow(
        JSON.stringify({
          ...row,
          kind: 'item',
          itemId: 7,
          revision: 1,
          body: { kind: 'status', text: 'x' }
        })
      )
    ).toEqual({ ok: false, unreadable: false })
  })
})

describe('released SQLite journal upgrades without rewriting history', () => {
  let directory = ''
  const opener = createTrackedJournalOpener()
  afterEach(async () => {
    await opener.closeAll()
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  it('keeps revisions, tombstones, echo receipts and turn references across a real reopen', async () => {
    directory = await mkdtemp(join(tmpdir(), 'zkyq-journal-key-'))
    const database = openTestJournalHostDatabase(directory)
    publishTestJournalEpoch(database.db, 'session-1', 'epoch-1')
    const message = {
      kind: 'message',
      role: 'user',
      blocks: [{ type: 'text', text: 'orca:literal user text' }]
    }
    const oldRows = [
      {
        kind: 'epoch',
        reason: 'session_created',
        providerHandle: { kind: 'codex', threadId: 'thread-1' }
      },
      {
        kind: 'submission',
        clientMessageId: 'm1',
        payloadFingerprint: 'f'.repeat(64),
        providerHandle: { kind: 'codex', threadId: 'thread-1' },
        body: message
      },
      {
        kind: 'dispatch',
        clientMessageId: 'm1',
        state: 'accepted',
        providerItemId: 'orca:m1',
        reason: null
      },
      { kind: 'item', itemId: 'orca:gone', revision: 1, body: { kind: 'status', text: 'before' } },
      {
        kind: 'item',
        itemId: 'orca:turn',
        revision: 1,
        body: { kind: 'turn', turnId: 't1', state: 'completed', userItemId: 'orca:m1' }
      },
      {
        kind: 'item',
        itemId: `claude:s:${legacyDigest}`,
        revision: 1,
        body: { kind: 'status', text: 'oversized' }
      },
      {
        kind: 'lifecycle-batch',
        settlementId: 'old-settle',
        mutations: [
          { kind: 'tombstone', itemId: 'orca:gone', revision: 2 },
          {
            kind: 'item',
            itemId: 'orca:kept',
            revision: 1,
            body: { kind: 'status', text: 'kept' },
            turnScope: { kind: 'turn', turnItemId: 'orca:turn' }
          }
        ]
      }
    ].map((row, index) =>
      JSON.stringify({ v: 3, epoch: 'epoch-1', seq: index + 1, fence: 1, ts: index + 1, ...row })
    )
    oldRows.forEach((row, index) =>
      insertTestJournalRowJson(database.db, 'session-1', index + 1, row)
    )
    const options = {
      stateDirectory: directory,
      now: () => 1000,
      identity: {
        sessionId: 'session-1',
        workspaceId: 'ws-1',
        hostId: 'local',
        agent: 'codex' as const,
        providerHandle: codexProviderHandle('thread-1')
      }
    }
    const journal = await opener.open(options)
    expect(journal.receiptFor('m1')?.providerItemId).toBe('zkyq:m1')
    expect(journal.item('orca:gone')).toBeNull()
    expect(journal.item('orca:turn')?.body).toMatchObject({ userItemId: 'zkyq:m1' })
    expect(journal.item('orca:kept')?.turnScope).toEqual({ kind: 'turn', turnItemId: 'zkyq:turn' })
    expect(journal.itemBody('orca:m1')).toEqual(message)
    expect(journal.itemFence('orca:kept')).toBe(1)
    expect(journal.canonicalItemId('orca:m1')).toBe('zkyq:m1')
    expect(liveTestJournalRows(database.db, 'session-1').map((row) => row.rowJson)).toEqual(oldRows)

    const restored = await journal.appendItem(
      parseAgentJournalItemKey('orca:gone')!,
      { kind: 'status', text: 'restored' },
      { fence: 1, turnScope: AGENT_JOURNAL_THREAD_SCOPE }
    )
    expect(restored).toMatchObject({ itemId: 'zkyq:gone', revision: 3 })
    await journal.appendLifecycleBatch({
      settlementId: 'new-settle',
      fence: 1,
      mutations: [
        {
          kind: 'item',
          itemId: 'orca:kept',
          body: { kind: 'status', text: 'updated' },
          turnScope: { kind: 'turn', turnItemId: 'orca:turn' }
        },
        { kind: 'tombstone', itemId: `claude:s:${legacyDigest}` }
      ]
    })
    expect(journal.item('zkyq:kept')).toMatchObject({ revision: 2, body: { text: 'updated' } })
    expect(journal.item(`claude:s:${legacyDigest}`)).toBeNull()
    await journal.appendTombstone(parseAgentJournalItemKey('orca:gone')!, { fence: 1 })
    const stored = liveTestJournalRows(database.db, 'session-1')
    expect(stored.slice(0, oldRows.length).map((row) => row.rowJson)).toEqual(oldRows)
    expect(stored.slice(oldRows.length).map((row) => JSON.parse(row.rowJson).v)).toEqual([4, 4, 4])
    const read = journal.readSince({ epoch: 'epoch-1', sequence: 0 })
    expect(read.ok && read.rows.every((row) => row.v === 4)).toBe(true)
    await opener.closeAll()
    const reopened = await opener.open(options)
    expect(reopened.item('zkyq:gone')).toBeNull()
    expect(reopened.item(`claude:s:%FE${currentDigest}`)).toBeNull()
    expect(reopened.item('orca:kept')).toMatchObject({
      revision: 2,
      turnScope: { turnItemId: 'zkyq:turn' }
    })
    expect(reopened.snapshot().items.map((item) => item.itemId)).toEqual([
      'zkyq:m1',
      'zkyq:turn',
      'zkyq:kept'
    ])
  })
})
