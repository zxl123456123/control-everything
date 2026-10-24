import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { expect, it, vi } from 'vitest'
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: <T,>(x: T) => x }
}))
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0 }) }))
vi.mock('lucide-react-native', () => ({ ChevronLeft: 'ChevronLeft', Copy: 'Copy', Check: 'Check' }))
vi.mock('../components/ConnectionLog', () => ({ ConnectionLog: 'ConnectionLog' }))
import { ConnectionDiagnosticsView } from './connection-diagnostics-view'
it('keeps local report copying while removing upstream submission', () => {
  const copy = vi.fn()
  const send = vi.fn()
  let tree: ReturnType<typeof create>
  act(() => {
    tree = create(
      createElement(ConnectionDiagnosticsView, {
        hasHost: true,
        hostName: 'Synthetic host',
        state: 'disconnected',
        reconnectAttempts: 0,
        copied: false,
        copyDiagnostics: copy,
        sendDiagnostics: send,
        submissionState: 'idle',
        entries: [],
        onBack: vi.fn(),
        diagnosis: {
          reportability: 'orca-relay',
          likelyCause: 'Synthetic failure',
          nextStep: 'Retry'
        } as never
      })
    )
  })
  expect(JSON.stringify(tree!.toJSON())).toContain('本平台诊断提交渠道未配置')
  expect(JSON.stringify(tree!.toJSON())).not.toContain('Send diagnostics')
  const buttons = tree!.root.findAllByType('Pressable' as never)
  expect(buttons).toHaveLength(2)
  act(() => buttons[1].props.onPress())
  expect(copy).toHaveBeenCalledTimes(1)
  expect(send).not.toHaveBeenCalled()
  act(() => tree!.unmount())
})
