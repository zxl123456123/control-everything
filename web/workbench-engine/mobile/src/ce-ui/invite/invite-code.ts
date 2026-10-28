// The invite flow's state machine. Pure and synchronous so the screen is a thin renderer and every
// transition is unit-tested. The hub issues `secrets.token_urlsafe(32)` (43 chars, case-sensitive,
// A-Z a-z 0-9 - _) and accepts 16-128 characters, so the input is grouped for reading only: the
// stored value never contains separators and its case is never changed.

export const INVITE_MIN_LENGTH = 16
export const INVITE_MAX_LENGTH = 128
export const INVITE_GROUP_SIZE = 4

export type InviteStatus = 'idle' | 'submitting' | 'success' | 'error'
export type InviteErrorKind =
  | 'invalid'
  | 'expired'
  | 'used'
  | 'rate-limited'
  | 'unauthorized'
  | 'network'
  | 'unavailable'
  | 'disabled'
  | 'clipboard-empty'

export type InviteState = {
  value: string
  status: InviteStatus
  error: InviteErrorKind | null
  /** Bumps on every failed attempt so the shake replays even for the same error. */
  errorCount: number
}
export type InviteAction =
  | { type: 'edit'; text: string }
  | { type: 'paste'; text: string }
  | { type: 'clear' }
  | { type: 'submit' }
  | { type: 'failed'; error: InviteErrorKind }
  | { type: 'succeeded' }

export const initialInviteState: InviteState = {
  value: '',
  status: 'idle',
  error: null,
  errorCount: 0
}

/** Accepts a bare code or a link carrying `?invite=` / `?code=`; returns only legal characters. */
export function sanitizeInvite(raw: string): string {
  let text = raw.trim()
  const link = /[?&#](?:invite|invite_code|code)=([^&#\s]+)/i.exec(text)
  if (link?.[1]) {
    try {
      text = decodeURIComponent(link[1])
    } catch {
      text = link[1]
    }
  }
  return text.replace(/[^A-Za-z0-9_-]/g, '').slice(0, INVITE_MAX_LENGTH)
}

export type InviteValidity = 'empty' | 'short' | 'ok'
export function inviteValidity(value: string): InviteValidity {
  if (value.length === 0) return 'empty'
  return value.length < INVITE_MIN_LENGTH ? 'short' : 'ok'
}

/** Splits for display. Always at least the minimum number of groups, so the field never looks done early. */
export function groupInvite(value: string): { chars: string; filled: boolean }[] {
  const minGroups = INVITE_MIN_LENGTH / INVITE_GROUP_SIZE
  const needed = Math.max(minGroups, Math.ceil((value.length + 1) / INVITE_GROUP_SIZE))
  const count = Math.min(needed, INVITE_MAX_LENGTH / INVITE_GROUP_SIZE)
  return Array.from({ length: count }, (_, index) => {
    const chars = value.slice(index * INVITE_GROUP_SIZE, (index + 1) * INVITE_GROUP_SIZE)
    return { chars, filled: chars.length === INVITE_GROUP_SIZE }
  })
}

export function inviteReducer(state: InviteState, action: InviteAction): InviteState {
  switch (action.type) {
    case 'edit':
    case 'paste': {
      if (state.status === 'submitting' || state.status === 'success') return state
      const value = sanitizeInvite(action.text)
      return { ...state, value, status: 'idle', error: null }
    }
    case 'clear':
      if (state.status === 'submitting' || state.status === 'success') return state
      return { ...state, value: '', status: 'idle', error: null }
    case 'submit':
      if (state.status === 'submitting' || state.status === 'success') return state
      if (inviteValidity(state.value) !== 'ok')
        return { ...state, status: 'error', error: 'invalid', errorCount: state.errorCount + 1 }
      return { ...state, status: 'submitting', error: null }
    case 'failed':
      if (state.status !== 'submitting' && action.error !== 'clipboard-empty') return state
      return {
        ...state,
        status: 'error',
        error: action.error,
        errorCount: state.errorCount + 1
      }
    case 'succeeded':
      return state.status === 'submitting' ? { ...state, status: 'success', error: null } : state
  }
}
