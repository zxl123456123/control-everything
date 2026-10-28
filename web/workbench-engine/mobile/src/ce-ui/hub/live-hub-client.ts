import { HubError, type HubClient, type HubDevice, type HubMe, type HubOs } from './hub-client'
import type { HubMembership } from '../status/device-status'

// The live client for the remote hub's Bearer-only `/remote/mobile/*` surface. The phone proves who
// it is with the Keycloak access token the platform-account controller already holds; there are no
// cookies, no CSRF tokens and no hub-specific credential. This module knows nothing about React
// Native, expo or the controller, so every behaviour below is unit-tested with a mocked `fetch`.

/** The part of the account controller the hub client needs. Tokens never pass through UI state. */
export type HubTokenSource = {
  /** A token that is valid now (with a small safety margin), or null. Must not hit the network. */
  getAccessToken(): string | null
  /** Refreshes the session; concurrent callers share one refresh. Null means "no usable session". */
  refreshAccessToken(): Promise<string | null>
}

export type LiveHubClientOptions = {
  /** Origin of the remote hub, e.g. `https://hub.example.com` (no path). */
  origin: string
  tokens: HubTokenSource
  /** Must not follow redirects: a Bearer token is never replayed to another URL. */
  fetch: (url: string, init: LiveFetchInit) => Promise<LiveFetchResponse>
  timeoutMs?: number
}
export type LiveFetchInit = {
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
  signal: AbortSignal
  redirect: 'error'
}
export type LiveFetchResponse = {
  status: number
  text(): Promise<string>
}

export const DEFAULT_HUB_TIMEOUT_MS = 15_000
const MAX_BODY_CHARS = 1_000_000
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

/** Returns a normalized origin, or null when the value cannot safely carry a Bearer token. */
export function hubOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password) return null
    if (url.pathname !== '/' || url.search || url.hash) return null
    return url.origin
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null
/** The hub stores epoch seconds (floats allowed); the UI works in epoch milliseconds. */
const seconds = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : null

function malformed(): never {
  // A reply we cannot read is treated as a transient fault, so the user can simply retry.
  throw new HubError('network')
}

function parseOs(value: unknown): HubOs {
  const name = typeof value === 'string' ? value.toLowerCase() : ''
  if (name.startsWith('win')) return 'windows'
  if (name === 'darwin' || name.startsWith('mac')) return 'macos'
  if (name.startsWith('linux')) return 'linux'
  return 'unknown'
}

const MEMBERSHIPS: readonly HubMembership[] = ['active', 'disabled', 'inactive']

function parseMe(body: unknown): HubMe {
  if (!isRecord(body) || !isRecord(body.account)) return malformed()
  const sub = text(body.account.sub)
  const membership = MEMBERSHIPS.find((item) => item === body.membership)
  if (!sub || !membership) return malformed()
  return {
    subject: sub,
    // `display_name` is the person's full name; `name` falls back to the login name or the subject.
    name: text(body.account.display_name) ?? text(body.account.name) ?? sub,
    email: text(body.account.email),
    membership,
    admin: body.admin === true
  }
}

function parseDevice(item: unknown): HubDevice {
  if (!isRecord(item)) return malformed()
  const id = text(item.device_id)
  const state = text(item.state)
  if (!id || !state) return malformed()
  return {
    id,
    name: text(item.name) ?? id,
    os: parseOs(item.os_name),
    state,
    lastSeenAt: seconds(item.last_seen),
    boundAt: seconds(item.created_at),
    appVersion: text(item.app_version)
  }
}

function parseDevices(body: unknown): HubDevice[] {
  if (!isRecord(body) || !Array.isArray(body.items)) return malformed()
  return body.items.map(parseDevice)
}

/** Maps a hub error reply to the kinds the UI already has copy for. */
function failure(status: number, code: string | null): HubError {
  if (status === 401) return new HubError('unauthorized')
  if (status === 429 || code === 'rate_limited') return new HubError('rate-limited')
  switch (code) {
    // The hub answers one code for malformed, unknown, expired and already-used invitations on
    // purpose, so the phone cannot tell them apart and must not pretend to.
    case 'invalid_invitation':
      return new HubError('invalid-invite')
    case 'member_disabled':
      return new HubError('member-disabled')
    case 'device_not_found':
      return new HubError('not-found')
    // The token is valid but its audience or client is not accepted: a deployment mismatch that a
    // retry cannot fix.
    case 'identity_scope_rejected':
      return new HubError('unavailable')
  }
  if (status === 404 || status === 405) return new HubError('unavailable')
  return new HubError('network')
}

export function createLiveHubClient(options: LiveHubClientOptions): HubClient {
  const origin = hubOrigin(options.origin)
  if (!origin) throw new Error('invalid hub origin')
  const timeoutMs = options.timeoutMs ?? DEFAULT_HUB_TIMEOUT_MS

  async function send(
    token: string,
    method: 'GET' | 'POST',
    path: string,
    payload: unknown
  ): Promise<{ status: number; body: unknown }> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    // Aborting alone is not trusted to end the wait: a stalled connection must still time out.
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error('timeout'))
      }, timeoutMs)
    })
    const exchange = async (): Promise<{ status: number; body: unknown }> => {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      }
      if (payload !== undefined) headers['Content-Type'] = 'application/json'
      const response = await options.fetch(`${origin}${path}`, {
        method,
        headers,
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        signal: controller.signal,
        redirect: 'error'
      })
      const raw = await response.text()
      let body: unknown = null
      if (raw.length <= MAX_BODY_CHARS) {
        try {
          body = JSON.parse(raw)
        } catch {
          body = null
        }
      }
      return { status: response.status, body }
    }
    try {
      return await Promise.race([exchange(), deadline])
    } catch {
      // Timeouts, DNS/TLS failures and refused redirects all look the same to the user. The error
      // object is dropped on purpose: it may echo the request.
      throw new HubError('network')
    } finally {
      clearTimeout(timer)
    }
  }

  async function call(method: 'GET' | 'POST', path: string, payload?: unknown): Promise<unknown> {
    const sent = options.tokens.getAccessToken() ?? (await options.tokens.refreshAccessToken())
    if (!sent) throw new HubError('unauthorized')
    let reply = await send(sent, method, path, payload)
    if (reply.status === 401) {
      // Refresh once. If another request already rotated the token, use that one instead of
      // refreshing again; a second 401 means the account really is signed out.
      const current = options.tokens.getAccessToken()
      const fresh =
        current && current !== sent ? current : await options.tokens.refreshAccessToken()
      if (!fresh) throw new HubError('unauthorized')
      reply = await send(fresh, method, path, payload)
    }
    if (reply.status >= 200 && reply.status < 300) return reply.body
    const code = isRecord(reply.body) ? text(reply.body.error) : null
    throw failure(reply.status, code)
  }

  return {
    kind: 'live',
    async getMe() {
      return parseMe(await call('GET', '/remote/mobile/me'))
    },
    async listDevices() {
      return parseDevices(await call('GET', '/remote/mobile/devices'))
    },
    async activateInvite(code) {
      return parseMe(await call('POST', '/remote/mobile/activate', { invite: code }))
    },
    async revokeDevice(deviceId) {
      // Never build a URL from an id the hub could not have issued.
      if (!SAFE_ID.test(deviceId)) throw new HubError('not-found')
      await call('POST', `/remote/mobile/devices/${deviceId}/revoke`, {})
    }
  }
}
