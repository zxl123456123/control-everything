import './unused-default-rpc-methods.test-fixture'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from '../orchestration/db'
import {
  ADDRESS_X,
  createSessionCallerHarness,
  orchestrationRequest,
  resultOf,
  SESSION_X,
  SESSION_Y,
  WORKER_HANDLE,
  type SessionCallerHarness
} from './orchestration-session-caller-test-fixture'

const hostRef = vi.hoisted((): { current: unknown } => ({ current: null }))
vi.mock('../../native-chat/agent-session-wire/structured-agent-session-registry', () => ({
  getStructuredAgentSessionHost: () => hostRef.current
}))

const OLD_ADDRESS = `orca_session_id:${SESSION_X}`

describe('session address upgrade', () => {
  let h: SessionCallerHarness

  beforeEach(() => {
    h = createSessionCallerHarness(hostRef)
    hostRef.current = {
      deps: {
        store: {
          getRecord: (id: string) => h.records.get(id) ?? null,
          listRecords: () => [...h.records.values()],
          getVisibleSessionTabIndex: () => ({ present: true, sessionIds: [SESSION_X] })
        }
      }
    }
  })

  afterEach(() => {
    h.close()
    vi.restoreAllMocks()
  })

  it('migrates historical mail, dispatch identity and the pointer operation without changing their contents', async () => {
    const to = h.db.insertMessage({ from: WORKER_HANDLE, to: ADDRESS_X, subject: OLD_ADDRESS })
    const from = h.db.insertMessage({ from: ADDRESS_X, to: WORKER_HANDLE, subject: 'reply' })
    h.db.db.prepare('UPDATE messages SET to_handle = ? WHERE id = ?').run(OLD_ADDRESS, to.id)
    h.db.db.prepare('UPDATE messages SET from_handle = ? WHERE id = ?').run(OLD_ADDRESS, from.id)
    h.db.db
      .prepare(
        "INSERT INTO tasks (id, spec, created_by_terminal_handle) VALUES ('task_old', 'spec', ?)"
      )
      .run(OLD_ADDRESS)
    h.db.db
      .prepare(
        "INSERT INTO dispatch_contexts (id, task_id, assignee_handle, creator_handle, status) VALUES ('ctx_old', 'task_old', ?, ?, 'completed')"
      )
      .run(OLD_ADDRESS, OLD_ADDRESS)
    h.db.db
      .prepare(
        "INSERT INTO structured_pointer_operations VALUES (?, ?, 'operation-old', 'batch-old', 42)"
      )
      .run(OLD_ADDRESS, SESSION_X)
    h.db.createCoordinatorRun({ spec: 'spec', coordinatorHandle: OLD_ADDRESS })
    h.db.db.pragma('user_version = 43')

    h.db.migrate()
    expect(h.db.db.pragma('user_version', { simple: true })).toBe(44)
    expect(h.db.getMessageById(from.id)?.from_handle).toBe(ADDRESS_X)
    expect(
      h.db.db
        .prepare('SELECT assignee_handle, creator_handle FROM dispatch_contexts WHERE id = ?')
        .get('ctx_old')
    ).toEqual({ assignee_handle: ADDRESS_X, creator_handle: ADDRESS_X })
    expect(
      h.db.db.prepare('SELECT created_by_terminal_handle FROM tasks WHERE id = ?').get('task_old')
    ).toEqual({ created_by_terminal_handle: ADDRESS_X })
    expect(h.db.db.prepare('SELECT * FROM structured_pointer_operations').get()).toEqual({
      mailbox_handle: ADDRESS_X,
      session_id: SESSION_X,
      operation_id: 'operation-old',
      batch_fingerprint: 'batch-old',
      minted_at_ms: 42
    })
    expect(h.db.db.prepare('SELECT coordinator_handle FROM coordinator_runs').get()).toEqual({
      coordinator_handle: ADDRESS_X
    })
    const checked = resultOf(
      await h.dispatch(orchestrationRequest('orchestration.check', {}, { sessionId: SESSION_X }))
    )
    expect(checked.messages).toEqual([
      expect.objectContaining({ id: to.id, to_handle: ADDRESS_X, subject: OLD_ADDRESS })
    ])
    const replied = await h.dispatch(
      orchestrationRequest('orchestration.reply', {
        id: from.id,
        body: 'answer',
        from: WORKER_HANDLE
      })
    )
    expect(replied).toMatchObject({ ok: true, result: { message: { to_handle: ADDRESS_X } } })
  })

  it('accepts an older session address as input and records only the new address', async () => {
    const response = await h.dispatch(
      orchestrationRequest('orchestration.send', {
        from: WORKER_HANDLE,
        to: OLD_ADDRESS,
        subject: 'hello'
      })
    )
    expect(response).toMatchObject({ ok: true, result: { message: { to_handle: ADDRESS_X } } })
  })

  it('binds an older caller spelling to the actual session and refuses a different session', async () => {
    const sent = await h.dispatch(
      orchestrationRequest(
        'orchestration.send',
        { from: OLD_ADDRESS, to: WORKER_HANDLE, subject: 'hello' },
        { sessionId: SESSION_X }
      )
    )
    expect(sent).toMatchObject({ ok: true, result: { message: { from_handle: ADDRESS_X } } })
    const wrong = await h.dispatch(
      orchestrationRequest(
        'orchestration.send',
        { from: `orca_session_id:${SESSION_Y}`, to: WORKER_HANDLE, subject: 'wrong' },
        { sessionId: SESSION_X }
      )
    )
    expect(wrong).toMatchObject({ ok: false, error: { code: 'consumer_fenced' } })
  })

  it('preserves a remembered coordinator when its Run update invokes the routing trigger', () => {
    h.db.db
      .prepare("INSERT INTO runs (id, objective, coordinator_handle) VALUES ('run_old', 'test', ?)")
      .run(OLD_ADDRESS)
    h.db.db.pragma('user_version = 43')
    h.db.migrate()
    expect(
      h.db.db.prepare('SELECT coordinator_handle FROM runs WHERE id = ?').get('run_old')
    ).toEqual({ coordinator_handle: ADDRESS_X })
    expect(
      h.db.db
        .prepare('SELECT terminal_handle FROM run_coordinator_handles WHERE run_id = ?')
        .all('run_old')
    ).toEqual([{ terminal_handle: ADDRESS_X }])
  })

  it('persists the migration across a real database close and reopen', () => {
    const directory = mkdtempSync(join(tmpdir(), 'session-address-upgrade-'))
    const path = join(directory, 'orchestration.db')
    let db: InstanceType<typeof OrchestrationDb> | undefined
    try {
      db = new OrchestrationDb(path)
      const message = db.insertMessage({ from: WORKER_HANDLE, to: ADDRESS_X, subject: 'persist' })
      db.db.prepare('UPDATE messages SET to_handle = ? WHERE id = ?').run(OLD_ADDRESS, message.id)
      db.db.pragma('user_version = 43')
      db.close()
      db = undefined
      db = new OrchestrationDb(path)
      expect(db.getMessageById(message.id)?.to_handle).toBe(ADDRESS_X)
      db.close()
      db = undefined
      db = new OrchestrationDb(path)
      expect(db.getMessageById(message.id)?.to_handle).toBe(ADDRESS_X)
      expect(db.db.pragma('user_version', { simple: true })).toBe(44)
    } finally {
      db?.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rolls back the whole migration on conflicting pointer operations', () => {
    const message = h.db.insertMessage({ from: WORKER_HANDLE, to: ADDRESS_X, subject: 'preserve' })
    h.db.db.prepare('UPDATE messages SET to_handle = ? WHERE id = ?').run(OLD_ADDRESS, message.id)
    const insert = h.db.db.prepare(
      'INSERT INTO structured_pointer_operations VALUES (?, ?, ?, ?, ?)'
    )
    insert.run(OLD_ADDRESS, SESSION_X, 'old-operation', 'batch', 1)
    insert.run(ADDRESS_X, SESSION_X, 'new-operation', 'batch', 2)
    h.db.db.pragma('user_version = 43')
    expect(() => h.db.migrate()).toThrow()
    expect(h.db.db.pragma('user_version', { simple: true })).toBe(43)
    expect(h.db.getMessageById(message.id)?.to_handle).toBe(OLD_ADDRESS)
    expect(
      h.db.db
        .prepare('SELECT operation_id FROM structured_pointer_operations ORDER BY operation_id')
        .all()
    ).toEqual([{ operation_id: 'new-operation' }, { operation_id: 'old-operation' }])
  })

  it('also preserves conflicting pointer operations when upgrading a v42 database', () => {
    const insert = h.db.db.prepare(
      'INSERT INTO structured_pointer_operations VALUES (?, ?, ?, ?, ?)'
    )
    insert.run(`session:${SESSION_X}`, SESSION_X, 'old-operation', 'batch', 1)
    insert.run(OLD_ADDRESS, SESSION_X, 'new-operation', 'batch', 2)
    h.db.db.pragma('user_version = 42')
    expect(() => h.db.migrate()).toThrow('conflicting session pointer operations')
    expect(h.db.db.pragma('user_version', { simple: true })).toBe(42)
    expect(
      h.db.db
        .prepare(
          'SELECT mailbox_handle, operation_id FROM structured_pointer_operations ORDER BY operation_id'
        )
        .all()
    ).toEqual([
      { mailbox_handle: OLD_ADDRESS, operation_id: 'new-operation' },
      { mailbox_handle: `session:${SESSION_X}`, operation_id: 'old-operation' }
    ])
  })
})
