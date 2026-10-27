import type { HubDeviceState, HubMembership } from '../status/device-status'

// The phone's view of the Control Everything hub. The real hub has no mobile token kind, device
// list or revoke endpoint yet (see the PR follow-ups), so every screen talks to this interface and
// the app ships a clearly labelled mock until a live client exists. Swap by changing
// `resolveHubClient` only; no screen imports the mock directly.

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
  boundAt: number
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
