/**
 * @vitest-environment happy-dom
 */
import React, { createRef, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type * as I18n from '@/i18n/i18n'
import type { NativeChatComposerHandle } from './NativeChatComposer'
import { useStructuredNativeChatPaneCommands } from './use-structured-native-chat-pane-commands'

type ItemProps = { onSelect?: () => void; children?: ReactNode }

const items = vi.hoisted(() => ({ list: [] as ItemProps[] }))
const callRuntimeRpc = vi.hoisted(() => vi.fn())

vi.mock('@/components/ui/dropdown-menu', () => {
  const Pass = ({ children }: { children?: ReactNode }) => children
  return {
    DropdownMenu: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuItem: (props: ItemProps) => {
      items.list.push(props)
      return props.children
    },
    DropdownMenuLabel: Pass,
    DropdownMenuSeparator: () => null,
    DropdownMenuShortcut: Pass,
    DropdownMenuSub: Pass,
    DropdownMenuSubContent: Pass,
    DropdownMenuSubTrigger: Pass,
    DropdownMenuTrigger: Pass
  }
})
vi.mock('@/i18n/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18n>()),
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/tooltip', () => {
  const Pass = ({ children }: { children?: ReactNode }) => children
  return { Tooltip: Pass, TooltipTrigger: Pass, TooltipContent: () => null }
})
vi.mock('@/components/tab-bar/TabWorkspaceLayoutMenuSection', () => ({
  TabWorkspaceLayoutMenuSection: () => null
}))
vi.mock('@/components/tab-bar/tab-move-to-pane-column', () => ({
  canMoveTabToNewPaneColumn: () => false
}))
vi.mock('@/store', () => ({
  useAppStore: (select: (state: { keybindings: object }) => unknown) => select({ keybindings: {} })
}))
vi.mock('../../runtime/runtime-rpc-client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  callRuntimeRpc
}))

const SESSION = '4a1f6c2e-8b3d-4e7a-9c15-0d2b6e8f1a37'
const TARGET = { kind: 'environment', environmentId: 'env_1' } as const

function childrenText(children: ReactNode): string {
  return React.Children.toArray(children)
    .map((child) =>
      typeof child === 'string'
        ? child
        : React.isValidElement<{ children?: ReactNode }>(child)
          ? childrenText(child.props.children)
          : ''
    )
    .join('')
}

function StructuredChatTab(): ReactNode {
  const { menu } = useStructuredNativeChatPaneCommands({
    tabId: 'chat-tab',
    groupId: 'group-1',
    isVisible: true,
    rootRef: createRef<HTMLDivElement>(),
    composerRef: createRef<NativeChatComposerHandle>(),
    questionAnswerInputRef: createRef<HTMLInputElement>(),
    sessionId: SESSION,
    target: TARGET
  })
  return menu
}

describe('a structured chat tab', () => {
  beforeEach(() => {
    items.list = []
    callRuntimeRpc.mockReset().mockResolvedValue({ sessionId: `agent_session:${SESSION}` })
    Object.assign(window, {
      api: { ui: { writeClipboardText: vi.fn().mockResolvedValue(undefined) } }
    })
  })

  it("copies the session ID returned by the tab's host", async () => {
    renderToStaticMarkup(<StructuredChatTab />)

    const item = items.list.find(
      (candidate) => childrenText(candidate.children) === 'Copy Session ID'
    )
    item?.onSelect?.()

    expect(item).toBeDefined()
    await vi.waitFor(() =>
      expect(callRuntimeRpc).toHaveBeenCalledWith(TARGET, 'orchestration.sessionAddress', {
        sessionId: SESSION,
        responseFormat: 'workbench'
      })
    )
    await vi.waitFor(() => {
      expect(window.api.ui.writeClipboardText).toHaveBeenCalledWith(`agent_session:${SESSION}`)
      expect(toast.success).toHaveBeenCalledWith('Session ID copied')
    })
  })

  it('shows a failure when the clipboard write fails', async () => {
    vi.mocked(window.api.ui.writeClipboardText).mockRejectedValueOnce(new Error('clipboard denied'))
    renderToStaticMarkup(<StructuredChatTab />)
    const item = items.list.find(
      (candidate) => childrenText(candidate.children) === 'Copy Session ID'
    )
    expect(item).toBeDefined()
    item?.onSelect?.()
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Unable to copy session ID'))
  })
})
