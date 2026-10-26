// @vitest-environment happy-dom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type { Repo } from '../../../../shared/repo-types'
import { SettingsDraftContext } from '@/web/platform-settings-navigation'
import { getLocalHookFields } from './repository-hook-settings-draft'
import { RepositoryHookScriptSetting } from './RepositoryHookScriptSetting'
import { useRepositoryHookSettingsDraft } from './use-repository-hook-settings-draft'
import { useSettingsInteractionController, type SettingsInteractionModel } from './use-settings-interaction-controller'

afterEach(cleanup)
const repo: Repo = { id: 'r', path: '/r', displayName: 'R', addedAt: 0, badgeColor: 'blue' }

function Editor({ persist }: { persist: () => Promise<boolean> }) {
  const draft = useRepositoryHookSettingsDraft({ repo, repoHostIdentity: 'runtime:b\0r', onUpdateHookSettings: persist })
  return <section ref={draft.flushScriptDraftOnUnmount}>
    <RepositoryHookScriptSetting field={getLocalHookFields()[0]} value={draft.hookSettingsDraft.scripts.setup ?? ''}
      hasShared={false} sharedScript={undefined} onChange={(value) => draft.updateScriptDraft('setup', value)}
      onCommit={draft.commitScriptDraft} saveStatus={draft.saveStatus} focusOnError />
  </section>
}

function Harness({ persist, closed }: { persist: () => Promise<boolean>; closed: () => void }) {
  const [open, setOpen] = useState(true)
  const model: SettingsInteractionModel = {
    closeSettingsPage: () => { closed(); setOpen(false) }, confirm: async () => false,
    hasUnsavedBranchPromptChanges: false, hasUnsavedChatPromptChanges: false, hasUnsavedCommitPromptChanges: false,
    highlightedSettingsTargetId: null, setFontSuggestions: vi.fn(), setHasUnsavedBranchPromptChanges: vi.fn(),
    setHasUnsavedChatPromptChanges: vi.fn(), setHasUnsavedCommitPromptChanges: vi.fn(), setHighlightedSettingsTargetId: vi.fn(),
    setSettingsSearchQuery: vi.fn(), setSourceControlAiPromptDiscardSignal: vi.fn(), settings: getDefaultSettings('/tmp'),
    updateSettingsOrThrow: async () => {}
  }
  const interactions = useSettingsInteractionController(model)
  return <SettingsDraftContext.Provider value={interactions.draftContext}>
    {open ? <><Editor persist={persist} /><button onClick={() => void interactions.closeSettingsPageWithPromptGuard()}>Close settings</button></> : <p>Closed</p>}
  </SettingsDraftContext.Provider>
}

describe('Hooks blur and one close intent', () => {
  it.each([true, false])('awaits the existing write and closes only on true (result=%s)', async (ok) => {
    let resolve!: (saved: boolean) => void
    const persist = vi.fn(() => new Promise<boolean>((done) => { resolve = done }))
    const closed = vi.fn()
    render(<Harness persist={persist} closed={closed} />)
    const input = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'keep this script' } })
    fireEvent.focusOut(input)
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(persist).toHaveBeenCalledOnce()
    expect(closed).not.toHaveBeenCalled()
    expect(screen.queryByText('Saved')).toBeNull()
    await act(async () => { resolve(ok); await Promise.resolve() })
    expect(closed).toHaveBeenCalledTimes(ok ? 1 : 0)
    if (ok) expect(screen.queryByRole('textbox')).toBeNull()
    else {
      expect(input.value).toBe('keep this script')
      expect(input.getAttribute('aria-invalid')).toBe('true')
      expect(document.activeElement).toBe(input)
    }
  })
})
