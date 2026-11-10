// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import { normalizeSourceControlAiSettings } from '../../../../shared/source-control-ai'
import { SettingsDraftContext } from '@/web/platform-settings-navigation'
import { useRepositoryHookSettingsDraft } from './use-repository-hook-settings-draft'
import { useRepositorySourceControlAiGlobalUx } from './repository-source-control-ai-global-ux'

afterEach(cleanup)
const repo: Repo = { id: 'same', path: '/r', displayName: 'R', addedAt: 0, badgeColor: 'blue' }

function wrapper(drafts: Map<string, unknown>, keyPrefix: string) {
  const context = { drafts, keyPrefix, register: () => () => {}, confirmDiscard: async () => false }
  return ({ children }: { children: ReactNode }) => <SettingsDraftContext.Provider value={context}>{children}</SettingsDraftContext.Provider>
}

describe('session-only settings drafts', () => {
  it('restores a failed Hooks draft for A after B without sharing the same repo id on another host', async () => {
    const drafts = new Map<string, unknown>()
    const persist = vi.fn().mockResolvedValue(false)
    const open = (owner: string) => renderHook(() => useRepositoryHookSettingsDraft({ repo,
      repoHostIdentity: owner + '\0same', onUpdateHookSettings: persist }), { wrapper: wrapper(drafts, 'trusted:project') })
    const a = open('runtime:a')
    act(() => a.result.current.updateScriptDraft('setup', 'A failed draft'))
    await act(async () => { await a.result.current.commitScriptDraft() })
    a.unmount()
    const b = open('runtime:b')
    expect(b.result.current.hookSettingsDraft.scripts.setup).not.toBe('A failed draft')
    b.unmount()
    const again = open('runtime:a')
    expect(again.result.current.hookSettingsDraft.scripts.setup).toBe('A failed draft')
    persist.mockResolvedValue(true)
    await act(async () => { expect(await again.result.current.commitScriptDraft()).toBe(true) })
    expect(drafts.size).toBe(0)
  })
  it('restores only the same Source Control AI action draft after remount', () => {
    const drafts = new Map<string, unknown>()
    const persistedRepoAi = { actionOverrides: { fixCommitFailure: {
      agentId: null, commandInputTemplate: 'original', agentArgs: ''
    } } }
    const source = normalizeSourceControlAiSettings(undefined, undefined)
    const updateRepo = async () => true
    const open = (owner: string) => renderHook(() => useRepositorySourceControlAiGlobalUx({ repoId: 'same',
      repoHostIdentity: owner, persistedRepoAi, settings: null, source, updateRepo }),
      { wrapper: wrapper(drafts, 'trusted:project') })
    const a = open('runtime:a')
    act(() => a.result.current.updateActionTemplate('fixCommitFailure', 'A recipe draft'))
    a.unmount()
    const b = open('runtime:b')
    expect(b.result.current.displayRepoAi.actionOverrides?.fixCommitFailure?.commandInputTemplate).not.toBe('A recipe draft')
    b.unmount()
    const again = open('runtime:a')
    expect(again.result.current.displayRepoAi.actionOverrides?.fixCommitFailure?.commandInputTemplate).toBe('A recipe draft')
    expect(again.result.current.actionDirtyById.fixCommitFailure).toBe(true)
  })
})
