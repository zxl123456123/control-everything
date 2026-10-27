import type { HubDeviceState, HubMembership } from '../status/device-status'

// The phone's view of the Control Everything hub. Every screen talks to this interface; the live
// client (`live-hub-client.ts`) speaks to the hub's Bearer `/remote/mobile/*` API, the mock shows
// clearly labelled sample data, and the unavailable client is the honest fallback. Swap by changing
// `resolveHubClient` only; no screen imports an implementation directly.

export type HubOs = 'windows' | 'macos' | 'linux' | 'unknown'

export type HubMe = {
  subject: string
  name: string
  email: string | null
  membership: HubMembership
  admin: boolean
}

export type HubDevice = {
  id: string
  name: string
  os: HubOs
  /** Raw hub state; unknown strings are shown as 状态未知. */
  state: HubDeviceState | (string & {})
  /** Epoch ms, or null when the computer never connected. */
  lastSeenAt: number | null
  /** Epoch ms, or null for a computer registered before the hub recorded the time. */
  boundAt: number | null
  appVersion: string | null
}

export type HubErrorKind =
  | 'invalid-invite'
  | 'expired-invite'
  | 'used-invite'
  | 'rate-limited'
  | 'unauthorized'
  | 'network'
  | 'unavailable'
  | 'member-disabled'
  | 'not-found'

export class HubError extends Error {
  constructor(readonly kind: HubErrorKind) {
    super(kind)
  }
}

export interface HubClient {
  /** `mock` data is invented; the UI must label it. `unavailable` has no backend at all. */
  readonly kind: 'live' | 'mock' | 'unavailable'
  getMe(): Promise<HubMe>
  listDevices(): Promise<HubDevice[]>
  activateInvite(code: string): Promise<HubMe>
  revokeDevice(deviceId: string): Promise<void>
}
