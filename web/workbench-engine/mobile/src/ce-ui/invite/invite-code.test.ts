import { describe, expect, it } from 'vitest'
import {
  groupInvite,
  initialInviteState,
  inviteReducer,
  inviteValidity,
  sanitizeInvite,
  type InviteAction,
  type InviteState
} from './invite-code'

const code43 = 'Ab3_dE-fGh1JkLmNoPqRsTuVwXyZ0123456789abcde'.slice(0, 43)
const run = (actions: InviteAction[], from: InviteState = initialInviteState) =>
  actions.reduce(inviteReducer, from)

describe('sanitizeInvite', () => {
  it('keeps case, dash and underscore, and drops whitespace and everything else', () => {
    expect(sanitizeInvite('  Ab_c-D \n e!f ')).toBe('Ab_c-Def')
    expect(sanitizeInvite('ab\u200bcd')).toBe('abcd')
  })
  it('pulls the code out of an invite link', () => {
    expect(sanitizeInvite(`https://hub.example.test/join?invite=${code43}&x=1`)).toBe(code43)
    expect(sanitizeInvite(`https://hub.example.test/join#code=${code43}`)).toBe(code43)
  })
  it('caps at 128 characters', () => {
    expect(sanitizeInvite('a'.repeat(300))).toHaveLength(128)
  })
})

describe('validity and grouping', () => {
  it('needs 16 to 128 characters', () => {
    expect(inviteValidity('')).toBe('empty')
    expect(inviteValidity('a'.repeat(15))).toBe('short')
    expect(inviteValidity('a'.repeat(16))).toBe('ok')
    expect(inviteValidity('a'.repeat(128))).toBe('ok')
  })
  it('always shows at least four groups, then grows with the text and stops at 32', () => {
    expect(groupInvite('')).toHaveLength(4)
    expect(groupInvite('abcd')).toHaveLength(4)
    expect(groupInvite('a'.repeat(15))).toHaveLength(4)
    expect(groupInvite('a'.repeat(16))).toHaveLength(5)
    expect(
      groupInvite(code43)
        .map((g) => g.chars)
        .join('')
    ).toBe(code43)
    expect(groupInvite('a'.repeat(128))).toHaveLength(32)
  })
  it('marks only complete groups as filled', () => {
    const groups = groupInvite('abcdef')
    expect(groups[0]).toEqual({ chars: 'abcd', filled: true })
    expect(groups[1]).toEqual({ chars: 'ef', filled: false })
    expect(groups[2]).toEqual({ chars: '', filled: false })
  })
})

describe('inviteReducer', () => {
  it('edits and pastes through the same sanitising path', () => {
    expect(run([{ type: 'edit', text: 'ab cd' }]).value).toBe('abcd')
    expect(run([{ type: 'paste', text: `?invite=${code43}` }]).value).toBe(code43)
  })
  it('refuses to submit a short code and counts the failure for the shake', () => {
    const state = run([{ type: 'edit', text: 'abc' }, { type: 'submit' }])
    expect(state).toMatchObject({ status: 'error', error: 'invalid', errorCount: 1 })
    expect(run([{ type: 'submit' }], state).errorCount).toBe(2)
  })
  it('clears the error as soon as the user edits again', () => {
    const failed = run([{ type: 'submit' }])
    expect(failed.status).toBe('error')
    expect(run([{ type: 'edit', text: 'a' }], failed)).toMatchObject({
      status: 'idle',
      error: null
    })
  })
  it('submits a valid code and locks the input while the request runs', () => {
    const submitting = run([{ type: 'edit', text: code43 }, { type: 'submit' }])
    expect(submitting.status).toBe('submitting')
    expect(
      run([{ type: 'edit', text: 'zzz' }, { type: 'clear' }, { type: 'submit' }], submitting)
    ).toBe(submitting)
  })
  it('records a server failure only while a request is in flight', () => {
    expect(run([{ type: 'failed', error: 'expired' }])).toBe(initialInviteState)
    const failed = run([
      { type: 'edit', text: code43 },
      { type: 'submit' },
      { type: 'failed', error: 'expired' }
    ])
    expect(failed).toMatchObject({
      status: 'error',
      error: 'expired',
      errorCount: 1,
      value: code43
    })
  })
  it('lets a failed attempt be retried with the same code', () => {
    const failed = run([
      { type: 'edit', text: code43 },
      { type: 'submit' },
      { type: 'failed', error: 'network' },
      { type: 'submit' }
    ])
    expect(failed.status).toBe('submitting')
  })
  it('reports an empty clipboard without needing a request', () => {
    expect(run([{ type: 'failed', error: 'clipboard-empty' }])).toMatchObject({
      status: 'error',
      error: 'clipboard-empty'
    })
  })
  it('only succeeds from a request in flight, and then stays put', () => {
    expect(run([{ type: 'succeeded' }])).toBe(initialInviteState)
    const done = run([{ type: 'edit', text: code43 }, { type: 'submit' }, { type: 'succeeded' }])
    expect(done.status).toBe('success')
    expect(run([{ type: 'edit', text: 'x' }, { type: 'submit' }], done)).toBe(done)
  })
})
