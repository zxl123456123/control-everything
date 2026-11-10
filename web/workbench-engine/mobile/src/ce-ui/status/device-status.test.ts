import { describe, expect, it } from 'vitest'
import {
  canRevokeDevice,
  formatLastSeen,
  hubDeviceStates,
  isDeviceReachable,
  presentAccountStatus,
  presentDeviceState,
  presentMembership
} from './device-status'
import { cePalettes } from '../theme/tokens'

describe('device status mapping', () => {
  it('uses the exact labels of the browser portal for every hub state', () => {
    expect(
      Object.fromEntries(hubDeviceStates.map((s) => [s, presentDeviceState(s).label]))
    ).toEqual({
      pending: '等待绑定',
      provisioned: '正在准备连接',
      enrolling: '绑定中',
      connecting: '连接中',
      online: '在线',
      offline: '离线',
      revoking: '正在撤销连接',
      revoked: '连接已撤销'
    })
  })

  it('uses the same tones as the portal: online green, in-progress amber, revoke red, rest grey', () => {
    const tones = Object.fromEntries(hubDeviceStates.map((s) => [s, presentDeviceState(s).tone]))
    expect(tones).toEqual({
      pending: 'warning',
      provisioned: 'neutral',
      enrolling: 'warning',
      connecting: 'warning',
      online: 'success',
      offline: 'neutral',
      revoking: 'danger',
      revoked: 'danger'
    })
  })

  it('shows 状态未知 for anything it does not recognise, including prototype keys', () => {
    for (const odd of ['mystery', '', null, undefined, 'constructor', 'toString', '__proto__']) {
      expect(presentDeviceState(odd)).toMatchObject({ label: '状态未知', tone: 'neutral' })
    }
  })

  it('never relies on colour alone: every presentation has an icon and a label', () => {
    for (const state of [...hubDeviceStates, 'x']) {
      const p = presentDeviceState(state)
      expect(p.icon).toBeTruthy()
      expect(p.label.length).toBeGreaterThan(0)
      expect(cePalettes.dark.tones[p.tone]).toBeDefined()
    }
  })

  it('pulses online slowly, in-progress states quickly, and settled states not at all', () => {
    expect(presentDeviceState('online').pulse).toBe('slow')
    expect(presentDeviceState('connecting').pulse).toBe('fast')
    expect(presentDeviceState('offline').pulse).toBe('none')
    expect(presentDeviceState('revoked').pulse).toBe('none')
  })

  it('only lets online computers be opened and only live ones be revoked', () => {
    expect(isDeviceReachable('online')).toBe(true)
    expect(isDeviceReachable('connecting')).toBe(false)
    expect(canRevokeDevice('online')).toBe(true)
    expect(canRevokeDevice('offline')).toBe(true)
    expect(canRevokeDevice('revoking')).toBe(false)
    expect(canRevokeDevice('revoked')).toBe(false)
  })
})

describe('member and account status', () => {
  it('matches the portal membership wording', () => {
    expect(presentMembership('active').label).toBe('已激活')
    expect(presentMembership('disabled').label).toBe('接入停用')
    expect(presentMembership('inactive').label).toBe('待激活')
    expect(presentMembership('weird').label).toBe('状态未知')
  })
  it('marks signed-out and expired sessions as needing login (blue), never as failures', () => {
    expect(presentAccountStatus('signed-out')).toMatchObject({ tone: 'info', icon: 'log-in' })
    expect(presentAccountStatus('expired')).toMatchObject({ tone: 'info', label: '需要重新登录' })
    expect(presentAccountStatus('signed-in').tone).toBe('success')
    expect(presentAccountStatus('login-error').tone).toBe('danger')
    expect(presentAccountStatus('unconfigured').label).toBe('未配置')
  })
})

describe('formatLastSeen', () => {
  const now = 1_800_000_000_000
  it('reads in coarse human terms', () => {
    expect(formatLastSeen(null, now)).toBe('尚未连接')
    expect(formatLastSeen(Number.NaN, now)).toBe('尚未连接')
    expect(formatLastSeen(now - 5_000, now)).toBe('刚刚')
    expect(formatLastSeen(now + 5_000, now)).toBe('刚刚')
    expect(formatLastSeen(now - 5 * 60_000, now)).toBe('5 分钟前')
    expect(formatLastSeen(now - 3 * 3_600_000, now)).toBe('3 小时前')
    expect(formatLastSeen(now - 26 * 3_600_000, now)).toBe('昨天')
    expect(formatLastSeen(now - 3 * 86_400_000, now)).toBe('3 天前')
    expect(formatLastSeen(now - 40 * 86_400_000, now)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
