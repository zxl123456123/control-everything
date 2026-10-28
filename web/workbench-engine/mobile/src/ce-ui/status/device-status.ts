import type { CeTone } from '../theme/tokens'
import type { AccountStatus } from '../../platform-account/controller'

// Pure presentation mapping, kept free of React and icon imports so it is trivially testable.
// Labels and tones mirror `remoteStates` / `connectionTone` in web/workspace/account-device.js:
// a device must read the same on the phone and in the browser portal.

export type HubDeviceState =
  | 'pending'
  | 'provisioned'
  | 'enrolling'
  | 'connecting'
  | 'online'
  | 'offline'
  | 'revoking'
  | 'revoked'

export const hubDeviceStates: readonly HubDeviceState[] = [
  'pending',
  'provisioned',
  'enrolling',
  'connecting',
  'online',
  'offline',
  'revoking',
  'revoked'
]

export type StatusIconKey =
  | 'hourglass'
  | 'link'
  | 'loader'
  | 'wifi'
  | 'wifi-off'
  | 'shield-off'
  | 'ban'
  | 'help'
  | 'user-check'
  | 'log-in'
  | 'shield-alert'
export type PulseSpeed = 'none' | 'slow' | 'fast'

export type StatusPresentation = {
  label: string
  tone: CeTone
  icon: StatusIconKey
  pulse: PulseSpeed
}

const deviceStates: Record<HubDeviceState, StatusPresentation> = {
  pending: { label: '等待绑定', tone: 'warning', icon: 'hourglass', pulse: 'none' },
  provisioned: { label: '正在准备连接', tone: 'neutral', icon: 'link', pulse: 'fast' },
  enrolling: { label: '绑定中', tone: 'warning', icon: 'link', pulse: 'fast' },
  connecting: { label: '连接中', tone: 'warning', icon: 'loader', pulse: 'fast' },
  online: { label: '在线', tone: 'success', icon: 'wifi', pulse: 'slow' },
  offline: { label: '离线', tone: 'neutral', icon: 'wifi-off', pulse: 'none' },
  revoking: { label: '正在撤销连接', tone: 'danger', icon: 'shield-off', pulse: 'fast' },
  revoked: { label: '连接已撤销', tone: 'danger', icon: 'ban', pulse: 'none' }
}
const has = (table: object, key: string) => Object.prototype.hasOwnProperty.call(table, key)
const unknownDevice: StatusPresentation = {
  label: '状态未知',
  tone: 'neutral',
  icon: 'help',
  pulse: 'none'
}

/** Any string is accepted: a newer hub may send a state this build has never seen. */
export function presentDeviceState(state: string | null | undefined): StatusPresentation {
  return (
    (state && has(deviceStates, state) ? deviceStates[state as HubDeviceState] : undefined) ??
    unknownDevice
  )
}

/** Only an online device can be opened; everything else is read-only or being changed. */
export function isDeviceReachable(state: string | null | undefined): boolean {
  return state === 'online'
}
/** A revoked or revoking device has nothing left to revoke. */
export function canRevokeDevice(state: string | null | undefined): boolean {
  return state !== 'revoked' && state !== 'revoking'
}

export type HubMembership = 'active' | 'disabled' | 'inactive'
const membership: Record<HubMembership, StatusPresentation> = {
  active: { label: '已激活', tone: 'success', icon: 'user-check', pulse: 'none' },
  disabled: { label: '接入停用', tone: 'danger', icon: 'shield-alert', pulse: 'none' },
  inactive: { label: '待激活', tone: 'warning', icon: 'hourglass', pulse: 'none' }
}
export function presentMembership(value: string | null | undefined): StatusPresentation {
  return (
    (value && has(membership, value) ? membership[value as HubMembership] : undefined) ??
    unknownDevice
  )
}

/** The sign-in state of the phone itself (not of a computer). */
export function presentAccountStatus(status: AccountStatus): StatusPresentation {
  switch (status) {
    case 'signed-in':
      return { label: '已登录', tone: 'success', icon: 'user-check', pulse: 'none' }
    case 'expired':
      return { label: '需要重新登录', tone: 'info', icon: 'log-in', pulse: 'none' }
    case 'authorizing':
    case 'restoring':
      return { label: '正在验证', tone: 'warning', icon: 'loader', pulse: 'fast' }
    case 'logging-out':
      return { label: '正在退出', tone: 'warning', icon: 'loader', pulse: 'fast' }
    case 'login-error':
    case 'recovery-error':
    case 'logout-error':
      return { label: '需要处理', tone: 'danger', icon: 'shield-alert', pulse: 'none' }
    case 'signed-out':
      return { label: '未登录', tone: 'info', icon: 'log-in', pulse: 'none' }
    default:
      return { label: '未配置', tone: 'neutral', icon: 'help', pulse: 'none' }
  }
}

/** "刚刚 / 5 分钟前 / 昨天 / 3 天前 / 日期" — coarse on purpose, a phone list is not an audit log. */
export function formatLastSeen(lastSeenMs: number | null | undefined, nowMs: number): string {
  if (lastSeenMs === null || lastSeenMs === undefined || !Number.isFinite(lastSeenMs))
    return '尚未连接'
  const diff = Math.max(0, nowMs - lastSeenMs)
  const minute = 60_000
  if (diff < minute) return '刚刚'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`
  const days = Math.floor(diff / (24 * 60 * minute))
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  const date = new Date(lastSeenMs)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
