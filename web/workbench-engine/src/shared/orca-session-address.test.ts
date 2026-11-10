import { describe, expect, it } from 'vitest'
import {
  formatOrcaSessionAddress,
  isOrcaSessionId,
  parseOrcaSessionAddress
} from './orca-session-address'
import { testOrcaSessionId } from './orca-session-address-test-fixture'

const SESSION_ID = testOrcaSessionId('0b7e4c2a-5f1d-4e8a-9c3b-2d6f8a1e4b70')
const ADDRESS = `agent_session:${SESSION_ID}`

describe('Orca session address', () => {
  it('addresses an Orca session id as agent_session:<id> and parses the bare id back', () => {
    expect(formatOrcaSessionAddress(SESSION_ID)).toBe(ADDRESS)
    expect(parseOrcaSessionAddress(ADDRESS)).toBe(SESSION_ID)
    const parsed = parseOrcaSessionAddress(ADDRESS)
    expect(parsed && formatOrcaSessionAddress(parsed)).toBe(ADDRESS)
  })

  it('reads only the addressed spelling when parsing an address', () => {
    // A bare id is what the columns store, not an address.
    expect(parseOrcaSessionAddress(SESSION_ID)).toBeNull()
    expect(parseOrcaSessionAddress(null)).toBeNull()
    expect(parseOrcaSessionAddress(undefined)).toBeNull()
    expect(parseOrcaSessionAddress('')).toBeNull()
  })

  it('reads an address from a running older session but formats the new spelling', () => {
    const parsed = parseOrcaSessionAddress(`orca_session_id:${SESSION_ID}`)
    expect(parsed).toBe(SESSION_ID)
    expect(parsed && formatOrcaSessionAddress(parsed)).toBe(ADDRESS)
  })

  it.each([
    ['an unknown prefix', `pane:${SESSION_ID}`],
    ['the Run mailbox namespace', 'run:run_123'],
    ['the Dispatch mailbox namespace', 'dispatch:ctx_123'],
    ['an empty prefix', `:${SESSION_ID}`],
    ['an empty id', 'agent_session:'],
    ['an id with a separator', `agent_session:${SESSION_ID}:extra`],
    ['an id the session predicate rejects', 'agent_session:short'],
    ['a terminal handle', 'term_4f2c9a']
  ])('refuses %s', (_label, value) => {
    expect(parseOrcaSessionAddress(value)).toBeNull()
  })

  it('no longer reads the retired session:<id> spelling as a session, as an address or a bare id', () => {
    expect(parseOrcaSessionAddress(`session:${SESSION_ID}`)).toBeNull()
    expect(isOrcaSessionId(`session:${SESSION_ID}`)).toBe(false)
  })

  it.each([
    ['a PTY terminal handle', 'term_4f2c9a1b-7d3e-4a5f-8b6c-9d0e1f2a3b4c'],
    ['a short PTY terminal handle', 'term_4f2c9a'],
    ['a structured-worker handle', 'structworker_4f2c9a1b-7d3e-4a5f-8b6c-9d0e1f2a3b4c']
  ])('never treats %s as an Orca session id', (_label, handle) => {
    // Handles share the session-id charset, so the session-record predicate alone would accept them.
    expect(isOrcaSessionId(handle)).toBe(false)
    expect(parseOrcaSessionAddress(`agent_session:${handle}`)).toBeNull()
  })

  it('validates an Orca session id with the session-record predicate', () => {
    expect(isOrcaSessionId(SESSION_ID)).toBe(true)
    expect(isOrcaSessionId('has space in it')).toBe(false)
    expect(isOrcaSessionId('x'.repeat(129))).toBe(false)
  })
})
