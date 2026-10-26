import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSnapshot } from './controller'
const state = vi.hoisted(() => ({
  snapshot: { status: 'signed-out' } as AccountSnapshot,
  login: vi.fn(),
  restore: vi.fn(),
  logout: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  openURL: vi.fn(),
  expoConfig: { extra: { platformAccount: { remoteOrigin: 'https://workbench.example.test' } } }
}))
vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return state.expoConfig
    }
  }
}))
vi.mock('expo-linking', () => ({ openURL: state.openURL }))
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
beforeEach(() => {
  state.snapshot = { status: 'signed-out' }
  state.expoConfig = {
    extra: { platformAccount: { remoteOrigin: 'https://workbench.example.test' } }
  }
  state.openURL.mockResolvedValue(undefined)
})
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
function button(label: string) {
  return renderer.root
    .findAllByType('Pressable' as never)
    .find((node) =>
      node.findAllByType('Text' as never).some((text) => text.children.join('') === label)
    )!
}
describe('native platform account presentation', () => {
  it.each(['unconfigured', 'invalid-config'] as const)(
    'hides native sign-in while preserving the browser workspace for %s',
    (status) => {
      state.snapshot = { status, message: '请联系发行者重新构建。' }
      const text = render()
      expect(text).not.toContain('此 App 的账号')
      expect(text).not.toContain('登录此 App')
      expect(text).toContain('登录 / 注册并查看电脑')
    }
  )
  it('offers real controller actions without presenting an account as a paired computer', () => {
    state.snapshot = { status: 'signed-out' }
    expect(render()).toContain('登录此 App')
    act(() => button('登录此 App').props.onPress())
    expect(state.login).toHaveBeenCalledTimes(1)
    expect(state.openURL).not.toHaveBeenCalled()
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
  it('shows the real cleanup result even when the native OAuth client is unconfigured', () => {
    state.snapshot = { status: 'unconfigured', message: '此安装包未配置原生身份。' }
    expect(render()).not.toContain('此安装包未配置原生身份。')
    act(() => button('退出并清除此 App 记录').props.onPress())
    state.snapshot = {
      status: 'unconfigured',
      message: '已退出此 App。浏览器会话与已配对电脑的权限保持独立。'
    }
    act(() => renderer.update(createElement(PlatformAccountScreen)))
    expect(JSON.stringify(renderer.toJSON())).toContain('已退出此 App。')
    expect(state.logout).toHaveBeenCalledTimes(1)
    expect(state.openURL).not.toHaveBeenCalled()
  })
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
    act(() => button('退出并清除此 App 记录').props.onPress())
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
    expect(text).not.toContain('登录此 App')
    expect(text).not.toContain('重试恢复或保存')
  })
  it('opens the central account page only after an explicit action without native credentials', async () => {
    state.snapshot = { status: 'unconfigured' }
    expect(render()).toContain('https://workbench.example.test')
    expect(state.openURL).not.toHaveBeenCalled()
    await act(async () => button('登录 / 注册并查看电脑').props.onPress())
    expect(state.openURL.mock.calls).toEqual([['https://workbench.example.test/remote']])
    expect(state.login).not.toHaveBeenCalled()
    expect(state.restore).not.toHaveBeenCalled()
    expect(state.logout).not.toHaveBeenCalled()
  })
  it.each(['', 'http://workbench.example.test', 'https://name:secret@workbench.example.test'])(
    'does not offer an unusable browser action for %j',
    (remoteOrigin) => {
      state.expoConfig.extra.platformAccount.remoteOrigin = remoteOrigin
      expect(render()).not.toContain('登录 / 注册并查看电脑')
      expect(state.openURL).not.toHaveBeenCalled()
      expect(state.login).not.toHaveBeenCalled()
    }
  )
  it('shows browser launch failure and permits an explicit retry', async () => {
    state.openURL.mockRejectedValueOnce(new Error('synthetic unavailable browser'))
    render()
    await act(async () => button('登录 / 注册并查看电脑').props.onPress())
    expect(JSON.stringify(renderer.toJSON())).toContain('无法打开系统浏览器，请重试。')
    await act(async () => button('登录 / 注册并查看电脑').props.onPress())
    expect(state.openURL).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(renderer.toJSON())).not.toContain('无法打开系统浏览器，请重试。')
  })
  it('does not launch duplicate browsers or interrupt native authorization', async () => {
    let finish!: () => void
    state.openURL.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    render()
    const open = button('登录 / 注册并查看电脑').props.onPress
    act(() => {
      open()
      open()
    })
    expect(state.openURL).toHaveBeenCalledTimes(1)
    expect(button('正在打开浏览器…').props.disabled).toBe(true)
    await act(async () => finish())
    state.snapshot = { status: 'authorizing' }
    act(() => renderer.update(createElement(PlatformAccountScreen)))
    expect(button('登录 / 注册并查看电脑').props.disabled).toBe(true)
    act(() => button('登录 / 注册并查看电脑').props.onPress())
    expect(state.openURL).toHaveBeenCalledTimes(1)
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
