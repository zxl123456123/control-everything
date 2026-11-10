import { describe, expect, it } from 'vitest'
import { LayoutApplyParams } from '../rpc-contract/workspace-layout-params'
import { applyLayoutCommand } from './workspace-layout-commands'
import type {
  LayoutCommand,
  LayoutCommandResult,
  LayoutContext
} from './workspace-layout-command-types'
import type { WorkspaceLayoutModel } from './workspace-layout-model'

const WS = 'fixture-workspace'
function testContext(): LayoutContext {
  let nextId = 0
  return {
    mintId: () => `tab-${++nextId}`,
    mintLeafId: () => '00000000-0000-4000-8000-000000000001',
    now: () => 7
  }
}
function build(context: LayoutContext, commands: LayoutCommand[], initial?: WorkspaceLayoutModel) {
  let model: WorkspaceLayoutModel = initial ?? {
    hostId: 'local',
    workspaces: {},
    records: {},
    legacy: { terminalRowOwners: {} }
  }
  const results: LayoutCommandResult[] = []
  for (const command of commands) {
    const applied = applyLayoutCommand(model, command, context)
    if (!applied.ok) throw new Error(applied.code)
    model = applied.model
    results.push(applied.result)
  }
  return { model, results }
}

describe('repository graph layout tab', () => {
  it('preserves a self-backed graph tab, accepts its wire command and makes duplicate delivery idempotent', () => {
    const command = {
      type: 'openGitGraphTab',
      workspace: WS,
      tabId: 'graph-1',
      groupId: 'g1',
      createdAt: 7
    } as const
    expect(LayoutApplyParams.parse({ command }).command).toEqual(command)
    const ctx = testContext()
    const { model } = build(ctx, [command])
    expect(model.workspaces[WS]?.tabs).toEqual([
      {
        id: 'graph-1',
        entityId: 'graph-1',
        kind: 'git-graph',
        createdAt: 7,
        customTitle: null,
        color: null
      }
    ])
    const again = applyLayoutCommand(model, command, ctx)
    expect(again.ok && again.model).toEqual(model)
    expect(
      LayoutApplyParams.safeParse({
        command: { ...command, type: 'openEditorTab', contentType: 'git-graph', fileId: '/file' }
      }).success
    ).toBe(false)
  })

  it('closes a split graph without touching its terminal sibling', () => {
    const ctx = testContext()
    const { model, results } = build(ctx, [{ type: 'createTerminalTab', workspace: WS }])
    const groupId = model.workspaces[WS]!.groups[0]!.id
    const opened = build(
      ctx,
      [
        {
          type: 'openGitGraphTab',
          workspace: WS,
          tabId: 'graph-1',
          groupId: 'g2',
          split: { besideGroupId: groupId, direction: 'right' }
        }
      ],
      model
    ).model
    expect(opened.workspaces[WS]?.groups).toHaveLength(2)
    const closed = build(
      ctx,
      [{ type: 'closeTabs', workspace: WS, tabIds: ['graph-1'], force: true }],
      opened
    ).model
    expect(closed.workspaces[WS]?.groups.map((group) => group.id)).toEqual([groupId])
    expect(closed.workspaces[WS]?.tabs.map((tab) => tab.id)).toEqual([results[0]!.tabId])
  })
})
