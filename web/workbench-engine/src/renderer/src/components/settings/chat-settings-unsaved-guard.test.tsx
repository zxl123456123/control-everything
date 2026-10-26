// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import {
  useSettingsInteractionController,
  type SettingsInteractionModel
} from './use-settings-interaction-controller'
import { useSettingsNavigationActions } from './settings-view-model'

afterEach(cleanup)

function createModel(shouldDiscard = false, dirty = true) {
  return {
    closeSettingsPage: vi.fn(),
    confirm: vi.fn(async () => shouldDiscard),
    hasUnsavedBranchPromptChanges: false,
    hasUnsavedCommitPromptChanges: false,
    hasUnsavedChatPromptChanges: dirty,
    highlightedSettingsTargetId: null,
    setFontSuggestions: vi.fn(),
    setHasUnsavedBranchPromptChanges: vi.fn(),
    setHasUnsavedCommitPromptChanges: vi.fn(),
    setHasUnsavedChatPromptChanges: vi.fn(),
    setHighlightedSettingsTargetId: vi.fn(),
    setSettingsSearchQuery: vi.fn(),
    setSourceControlAiPromptDiscardSignal: vi.fn(),
    settings: getDefaultSettings('/tmp'),
    updateSettingsOrThrow: vi.fn(async () => {}),
    activeSectionId: 'chat',
    setActiveSectionId: vi.fn(),
    setPendingNavRequestTick: vi.fn(),
    settingsSearchQuery: ''
  } satisfies SettingsInteractionModel & Parameters<typeof useSettingsNavigationActions>[0]
}

function renderController(model: ReturnType<typeof createModel>) {
  return renderHook(() => {
    const interactions = useSettingsInteractionController(model)
    const navigation = useSettingsNavigationActions(model, interactions)
    return { ...interactions, ...navigation }
  })
}

describe('Chat settings unsaved guard', () => {
  it('coalesces repeated close intent while the existing prompt or save is pending', async () => {
    const model = createModel(true)
    let resolve!: (accepted: boolean) => void
    model.confirm.mockImplementation(() => new Promise<boolean>((done) => { resolve = done }))
    const { result } = renderController(model)
    let close!: Promise<void>, repeat!: Promise<void>
    act(() => { close = result.current.closeSettingsPageWithPromptGuard(); repeat = result.current.closeSettingsPageWithPromptGuard() })
    expect(model.confirm).toHaveBeenCalledOnce()
    await act(async () => { resolve(true); await Promise.all([close, repeat]) })
    expect(model.closeSettingsPage).toHaveBeenCalledOnce()
  })

  it('keeps all drafts until the matching accepted event, including when a later guard vetoes', async () => {
    const model = { ...createModel(true), presentation: {
      scope: { kind: 'global' as const, entry: 'development' as const, contextKey: 'trusted-1', environmentId: 'server' }, visible: true
    } }
    const { result } = renderController(model)
    const discard = vi.fn()
    result.current.draftContext.register({ key: 'project', ask: async () => true, discard })
    const waits: Promise<boolean>[] = []
    act(() => window.dispatchEvent(new CustomEvent('platform-before-navigate', { cancelable: true,
      detail: { from: '#settings/development', to: '#home', waitUntil: (promise: Promise<boolean>) => waits.push(promise) } })))
    await act(async () => { expect(await Promise.all(waits)).toEqual([true]) })
    // A second domain may veto; absence of the commit event must keep every draft.
    expect(model.setSourceControlAiPromptDiscardSignal).not.toHaveBeenCalled()
    expect(discard).not.toHaveBeenCalled()
    act(() => window.dispatchEvent(new CustomEvent('platform-navigation-accepted', { detail: { from: '#settings/development', to: '#project/b/settings' } })))
    expect(discard).not.toHaveBeenCalled()
    act(() => window.dispatchEvent(new CustomEvent('platform-navigation-accepted', { detail: { from: '#settings/development', to: '#home' } })))
    expect(model.setSourceControlAiPromptDiscardSignal).toHaveBeenCalledOnce()
    expect(discard).toHaveBeenCalledOnce()
    act(() => window.dispatchEvent(new CustomEvent('platform-navigation-accepted', { detail: { from: '#settings/development', to: '#home' } })))
    expect(discard).toHaveBeenCalledOnce()
  })

  it('does not register a hidden platform settings domain', () => {
    const model = { ...createModel(true), presentation: {
      scope: { kind: 'global' as const, entry: 'development' as const, contextKey: 'trusted-1' }, visible: false
    } }
    renderController(model)
    const waitUntil = vi.fn()
    act(() => window.dispatchEvent(new CustomEvent('platform-before-navigate', { detail: { from: '#home', to: '#project/b/settings', waitUntil } })))
    expect(waitUntil).not.toHaveBeenCalled()
    expect(model.confirm).not.toHaveBeenCalled()
  })
  it('asks before closing with a dirty chat recipe and keeps the page open when cancelled', async () => {
    const model = createModel()
    const { result } = renderController(model)
    await act(async () => result.current.closeSettingsPageWithPromptGuard())
    expect(model.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Discard unsaved AI settings?' })
    )
    expect(model.closeSettingsPage).not.toHaveBeenCalled()
    expect(model.setHasUnsavedChatPromptChanges).not.toHaveBeenCalled()
    expect(model.setSourceControlAiPromptDiscardSignal).not.toHaveBeenCalled()
  })

  it('clears the chat draft through the existing discard signal before closing', async () => {
    const model = createModel(true)
    const { result } = renderController(model)
    await act(async () => result.current.closeSettingsPageWithPromptGuard())
    expect(model.confirm).toHaveBeenCalledOnce()
    expect(model.setSourceControlAiPromptDiscardSignal).toHaveBeenCalledOnce()
    expect(model.setHasUnsavedChatPromptChanges).toHaveBeenCalledWith(false)
    expect(model.closeSettingsPage).toHaveBeenCalledOnce()
  })

  it('guards settings navigation with the same dirty chat recipe', async () => {
    const model = createModel()
    const { result } = renderController(model)
    await act(async () => result.current.scrollToSection('git'))
    expect(model.confirm).toHaveBeenCalledOnce()
    expect(model.setActiveSectionId).not.toHaveBeenCalled()
    expect(model.setSourceControlAiPromptDiscardSignal).not.toHaveBeenCalled()
  })

  it('closes without asking when the recipe is clean', async () => {
    const model = createModel(false, false)
    const { result } = renderController(model)
    await act(async () => result.current.closeSettingsPageWithPromptGuard())
    expect(model.confirm).not.toHaveBeenCalled()
    expect(model.closeSettingsPage).toHaveBeenCalledOnce()
  })
})
