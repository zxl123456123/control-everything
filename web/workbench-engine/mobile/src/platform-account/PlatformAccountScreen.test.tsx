import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountSnapshot } from './controller'
const state = vi.hoisted(() => ({
  snapshot: { status: 'signed-out' } as AccountSnapshot,
  login: vi.fn(),
  restore: vi.fn(),
  logout: vi.fn(),
  back: vi.fn(),
  replace: vi.fn()
}))
vi.mock('./controller', () => ({
  usePlatformAccount: () => state.snapshot,
  platformAccountController: state
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ back: state.back, replace: state.replace }) }))
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(x: T) => x }
}))
vi.mock('../components/OrcaLogo', () => ({ OrcaLogo: 'OrcaLogo' }))
vi.mock('lucide-react-native', () => ({ Settings: 'Settings' }))
import { PlatformAccountScreen } from './PlatformAccountScreen'
import { MobileHomeTopBar } from '../home/MobileHomeTopBar'
import OAuthCallback from '../../app/oauth/callback'
let renderer: ReactTestRenderer
afterEach(() => {
  act(() => renderer?.unmount())
  vi.clearAllMocks()
})
function render() {
  act(() => {
    renderer = create(createElement(PlatformAccountScreen))
  })
  return renderer.root
    .findAllByType('Text' as never)
    .map((node) => node.children.join(''))
    .join('\n')
}
describe('native platform account presentation', () => {
  it.each(['unconfigured', 'invalid-config'] as const)(
    'does not offer a browser login for %s',
    (status) => {
      state.snapshot = { status, message: '请联系发行者重新构建。' }
      const text = render()
      expect(text).toContain('重新构建')
      expect(text).not.toContain('使用系统浏览器登录')
      expect(text).toContain('平台账号登录不等于电脑授权')
    }
  )
  it('offers real controller actions without presenting an account as a paired computer', () => {
    state.snapshot = { status: 'signed-out' }
    expect(render()).toContain('使用系统浏览器登录')
    const buttons = renderer.root.findAllByType('Pressable' as never)
    act(() => buttons[1].props.onPress())
    expect(state.login).toHaveBeenCalledTimes(1)
  })
  it.each(['signed-out', 'unconfigured'] as const)(
    'allows explicit local cleanup while %s without starting authentication',
    (status) => {
      state.snapshot = { status }
      expect(render()).toContain('退出并清除此 App 记录')
      expect(state.logout).not.toHaveBeenCalled()
      const clearButton = renderer.root
        .findAllByType('Pressable' as never)
        .find((node) =>
          node
            .findAllByType('Text' as never)
            .some((text) => text.children.join('').includes('退出并清除此 App 记录'))
        )!
      act(() => clearButton.props.onPress())
      expect(state.logout).toHaveBeenCalledTimes(1)
      expect(state.login).not.toHaveBeenCalled()
      expect(state.restore).not.toHaveBeenCalled()
    }
  )
  it.each(['restoring', 'authorizing', 'logging-out'] as const)(
    'does not offer cleanup while %s',
    (status) => {
      state.snapshot = { status }
      expect(render()).not.toContain('退出并清除此 App 记录')
      expect(state.logout).not.toHaveBeenCalled()
    }
  )
  it('shows session-only persistence and an explicit local logout', () => {
    state.snapshot = {
      status: 'signed-in',
      account: {
        issuer: 'https://identity.example.test/realm',
        subject: 'synthetic-subject',
        expiresAt: 1234,
        persistence: 'session-only'
      }
    }
    const text = render()
    expect(text).toContain('重启后需要重新登录')
    expect(text).toContain('平台账号已登录')
    expect(text).toContain('不会结束系统浏览器会话')
    act(() => renderer.root.findAllByType('Pressable' as never)[1].props.onPress())
    expect(state.logout).toHaveBeenCalledTimes(1)
  })
  it('logout failure exposes only retry logout and its residual credential warning', () => {
    state.snapshot = {
      status: 'logout-error',
      message: '本机凭据未能清除，重启后可能恢复，请重试退出。'
    }
    const text = render()
    expect(text).toContain('重启后可能恢复')
    expect(text).toContain('重试退出')
    expect(text).not.toContain('使用系统浏览器登录')
    expect(text).not.toContain('重试恢复或保存')
  })
  it('home account entry works independently of host and Agent-account data', () => {
    const settings = vi.fn()
    const account = vi.fn()
    act(() => {
      renderer = create(
        createElement(MobileHomeTopBar, {
          onOpenSettings: settings,
          onOpenPlatformAccount: account
        })
      )
    })
    const buttons = renderer.root.findAllByType('Pressable' as never)
    act(() => buttons[0].props.onPress())
    expect(account).toHaveBeenCalledTimes(1)
    expect(settings).not.toHaveBeenCalled()
    act(() => buttons[1].props.onPress())
    expect(settings).toHaveBeenCalledTimes(1)
  })
  it('cold callback has no query consumer or authentication side effect', () => {
    act(() => {
      renderer = create(createElement(OAuthCallback))
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('授权已中断')
    expect(state.login).not.toHaveBeenCalled()
    expect(state.restore).not.toHaveBeenCalled()
  })
})
