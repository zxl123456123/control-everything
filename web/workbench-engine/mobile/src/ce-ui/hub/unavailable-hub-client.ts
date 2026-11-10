import { HubError, type HubClient } from './hub-client'

/** Release builds use this until the hub ships mobile endpoints: honest empty-handed failures. */
export const unavailableHubClient: HubClient = {
  kind: 'unavailable',
  getMe: () => Promise.reject(new HubError('unavailable')),
  listDevices: () => Promise.reject(new HubError('unavailable')),
  activateInvite: () => Promise.reject(new HubError('unavailable')),
  revokeDevice: () => Promise.reject(new HubError('unavailable'))
}
