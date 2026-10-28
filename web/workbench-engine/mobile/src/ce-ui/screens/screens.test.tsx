import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountSnapshot } from '../../platform-account/controller'
import type { HubClient, HubDevice } from '../hub/hub-client'

const probe = vi.hoisted(() => ({
  haptic: vi.fn(),
  snapshot: { status: 'signed-in' } as AccountSnapshot
}))
vi.mock('react-native', async () =>
  (await import('../test-support/native-mocks')).reactNativeMock()
)
vi.mock('react-native-reanimated', async () =>
  (await import('../test-support/native-mocks')).reanimatedMock()
)
vi.mock('react-native-gesture-handler', async () =>
  (await import('../test-support/native-mocks')).gestureHandlerMock()
)
vi.mock('react-native-safe-area-context', async () =>
  (await import('../test-support/native-mocks')).safeAreaMock()
)
vi.mock('react-native-svg', async () => (await import('../test-support/native-mocks')).svgMock())
vi.mock('lucide-react-native', async () =>
  (await import('../test-support/native-mocks')).lucideMock()
)
vi.mock('../../platform/haptics', async () =>
  (await import('../test-support/native-mocks')).hapticsMock(probe.haptic)
)
vi.mock('expo-router', () => ({ Stack: { Screen: () => null }, useRouter: () => ({}) }))
vi.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  useCameraPermissions: () => [null, vi.fn()]
}))
vi.mock('expo-clipboard', () => ({ getStringAsync: vi.fn() }))
vi.mock('expo-constants', () => ({ default: { expoConfig: {} } }))
vi.mock('../../platform-account/controller', () => ({
  usePlatformAccount: () => probe.snapshot,
  platformAccountController: {}
}))
vi.mock('./use-pair-flow', () => ({ usePairFlow: vi.fn() }))
vi.mock('expo-linking', () => ({ openURL: vi.fn() }))

import { ComputersScreen, ComputersView } from './ComputersScreen'
import { InviteScreen, InviteView } from './InviteScreen'
import { DeviceDetailSheet } from './DeviceDetailSheet'
import { HubClientProvider } from '../hub/hub-context'
import { PairView } from './PairScreen'
import { createMockHubClient } from '../hub/mock-hub-client'
import { initialInviteState, inviteReducer } from '../invite/invite-code'

let renderer: ReactTestRenderer
beforeEach(() => {
  probe.snapshot = { status: 'signed-in' }
})
afterEach(() => {
  act(() => renderer?.unmount())
  probe.haptic.mockClear()
})
function mount(element: ReturnType<typeof createElement>) {
  act(() => {
    renderer = create(element)
  })
  return renderer.root
}
function texts() {
  return renderer.root
    .findAllByType('Text' as never)
    .map((n) => n.children.join(''))
    .join('\n')
}
function press(label: string) {
  const node = renderer.root
    .findAllByType('Pressable' as never)
    .find((p) => p.findAllByType('Text' as never).some((t) => t.children.join('') === label))
  if (!node) throw new Error(`no button ${label}`)
  act(() => node.props.onPress())
}
const noop = () => undefined

describe('account-scoped screens', () => {
  const account = (subject: string): AccountSnapshot => ({
    status: 'signed-in',
    issuer: 'https://identity.example.test/realm',
    account: {
      issuer: 'https://identity.example.test/realm',
      subject,
      expiresAt: 1234,
      persistence: 'refresh'
    }
  })
  const withHub = (client: HubClient, screen: typeof ComputersScreen | typeof InviteScreen) =>
    createElement(HubClientProvider, { client, children: createElement(screen) })

  it('clears the previous device list and selected details while the new account loads', async () => {
    const client = createMockHubClient({ latencyMs: 0 })
    const devices = await client.listDevices()
    let finish!: (devices: HubDevice[]) => void
    client.listDevices = vi
      .fn()
      .mockResolvedValueOnce(devices)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
    probe.snapshot = account('account-A')
    await act(async () => {
      renderer = create(withHub(client, ComputersScreen))
    })
    act(() => renderer.root.findByType(ComputersView).props.onSelect(devices[0]))
    expect(renderer.root.findByType(DeviceDetailSheet).props.device).toEqual(devices[0])
    probe.snapshot = account('account-B')
    await act(async () => renderer.update(withHub(client, ComputersScreen)))
    expect(renderer.root.findByType(ComputersView).props.state.phase).toBe('loading')
    expect(renderer.root.findByType(DeviceDetailSheet).props.device).toBeNull()
    expect(texts()).not.toContain(devices[0]!.name)
    await act(async () => finish([]))
    expect(renderer.root.findByType(ComputersView).props.state.devices).toEqual([])
    expect(client.listDevices).toHaveBeenCalledTimes(2)
  })

  it('ignores the previous account device reply after the new account has loaded', async () => {
    const client = createMockHubClient({ latencyMs: 0 })
    const devices = await client.listDevices()
    let finish!: (devices: HubDevice[]) => void
    client.listDevices = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValueOnce([])
    probe.snapshot = account('account-A')
    await act(async () => {
      renderer = create(withHub(client, ComputersScreen))
    })
    probe.snapshot = account('account-B')
    await act(async () => renderer.update(withHub(client, ComputersScreen)))
    await act(async () => finish(devices))
    expect(renderer.root.findByType(ComputersView).props.state.devices).toEqual([])
  })

  it('does not carry invite input or an activation success into the next account', async () => {
    const client = createMockHubClient({ latencyMs: 0 })
    probe.snapshot = account('account-A')
    mount(withHub(client, InviteScreen))
    act(() =>
      renderer.root
        .findByType(InviteView)
        .props.dispatch({ type: 'edit', text: 'DEMO-' + 'a'.repeat(20) })
    )
    await act(async () => renderer.root.findByType(InviteView).props.onSubmit())
    expect(renderer.root.findByType(InviteView).props.state.status).toBe('success')
    probe.snapshot = account('account-B')
    await act(async () => renderer.update(withHub(client, InviteScreen)))
    expect(renderer.root.findByType(InviteView).props.state).toEqual(initialInviteState)
  })
})

describe('ComputersView', () => {
  const base = {
    hubKind: 'mock' as const,
    now: 1_000_000,
    portalReady: true,
    onOpenPortal: noop,
    onSelect: noop,
    onPair: noop,
    onRetry: noop
  }
  it('lists every seeded computer with a status label, not colour alone', async () => {
    const devices = await createMockHubClient({ scenario: 'populated', latencyMs: 0 }).listDevices()
    mount(
      createElement(ComputersView, {
        ...base,
        state: { phase: 'ready', devices, refreshing: false }
      })
    )
    const text = texts()
    for (const device of devices) expect(text).toContain(device.name)
    expect(text).toContain('在线')
    expect(text).toContain('演示数据')
  })
  it('shows the empty state with a pairing action', () => {
    const onPair = vi.fn()
    mount(
      createElement(ComputersView, {
        ...base,
        onPair,
        state: { phase: 'ready', devices: [], refreshing: false }
      })
    )
    expect(texts()).toContain('还没有绑定电脑')
    press('配对新电脑')
    expect(onPair).toHaveBeenCalledTimes(1)
  })
  it('does not invent computers when no hub is connected', () => {
    mount(
      createElement(ComputersView, {
        ...base,
        hubKind: 'unavailable',
        state: { phase: 'error', error: 'unavailable' }
      })
    )
    const text = texts()
    expect(text).toContain('此版本暂未接入电脑列表')
    expect(text).not.toContain('演示数据')
  })
  it('offers retry on a network error', () => {
    const onRetry = vi.fn()
    mount(
      createElement(ComputersView, {
        ...base,
        onRetry,
        state: { phase: 'error', error: 'network' }
      })
    )
    press('重试')
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
  it('renders a skeleton while loading', () => {
    const root = mount(createElement(ComputersView, { ...base, state: { phase: 'loading' } }))
    expect(root.findByProps({ testID: 'ce-computers-loading' })).toBeTruthy()
  })
})

describe('InviteView', () => {
  const view = (state: Parameters<typeof InviteView>[0]['state'], over = {}) =>
    createElement(InviteView, {
      state,
      hubKind: 'mock',
      dispatch: noop,
      onPaste: noop,
      onSubmit: noop,
      onDone: noop,
      ...over
    })
  it('shows the typed error title and keeps the form for a retry', () => {
    let state = inviteReducer(initialInviteState, { type: 'edit', text: 'a'.repeat(20) })
    state = inviteReducer(state, { type: 'submit' })
    state = inviteReducer(state, { type: 'failed', error: 'expired' })
    mount(view(state))
    expect(texts()).toContain('邀请码已过期')
    expect(texts()).toContain('激活')
  })
  it('shows the success state after activation and the error haptic fires on failure', () => {
    let state = inviteReducer(initialInviteState, { type: 'edit', text: 'a'.repeat(20) })
    state = inviteReducer(state, { type: 'submit' })
    state = inviteReducer(state, { type: 'failed', error: 'invalid' })
    mount(view(state))
    expect(probe.haptic).toHaveBeenCalled()
    state = inviteReducer(inviteReducer(state, { type: 'submit' }), { type: 'succeeded' })
    act(() => renderer.update(view(state)))
    expect(texts()).toContain('已激活')
  })
})

describe('PairView', () => {
  const view = (status: 'scanning' | 'connecting' | 'success' | 'error', errorMessage = '') =>
    createElement(PairView, {
      status,
      errorMessage,
      camera: createElement('View', { testID: 'camera' }),
      onPasteOpen: noop,
      onRetry: noop,
      onCancel: noop
    })
  it.each([
    ['scanning', '改为粘贴配对码'],
    ['connecting', '正在连接电脑…'],
    ['success', '已配对'],
    ['error', '配对码无效']
  ] as const)('renders %s', (status, expected) => {
    mount(view(status, '配对码无效'))
    expect(texts()).toContain(expected)
  })
})
