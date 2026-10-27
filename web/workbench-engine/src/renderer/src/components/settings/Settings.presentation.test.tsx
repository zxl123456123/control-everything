// @vitest-environment happy-dom
import { useContext, useEffect } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlatformSettingsContext, SettingsDraftContext, type PlatformSettingsPresentation } from '@/web/platform-settings-navigation'
import Settings from './Settings'

const fixture = vi.hoisted(() => ({ model: {} as any, navigation: {} as any, open: vi.fn(),
  ask: vi.fn(), guard: undefined as undefined | (() => boolean | Promise<boolean>) }))
function DraftParticipant() {
  const context = useContext(SettingsDraftContext)
  useEffect(() => context?.register({ key: 'fixture-inline', ask: fixture.ask }), [context])
  return null
}
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ openSettingsTarget: fixture.open }) } }))
vi.mock('./use-settings-store-model', () => ({ useSettingsStoreModel: () => ({
  ...fixture.model, presentation: useContext(PlatformSettingsContext)
}) }))
vi.mock('./use-settings-navigation-model', () => ({ useSettingsNavigationModel: () => fixture.navigation }))
vi.mock('./use-settings-terminal-model', () => ({ useSettingsTerminalModel: () => ({}) }))
vi.mock('./use-settings-repo-scroll-effects', () => ({ useSettingsRepoScrollEffects: () => {} }))
vi.mock('./settings-view-model', () => ({ buildSettingsViewModel: () => ({}), useSettingsNavigationActions: () => ({}) }))
vi.mock('./settings-page-renderer', () => ({
  renderSettingsLoading: (_: unknown, unavailable?: string) => <div data-testid="loading">{unavailable ?? 'pending'}</div>,
  renderSettingsPage: (context: any) => <div data-testid="page"><DraftParticipant />{context.model.activeSectionId}
    <input aria-label="Native display name draft" defaultValue="" /></div>
}))
vi.mock('../window-close-request-coordinator', () => ({ registerWindowCloseGuard: (guard: () => boolean | Promise<boolean>) => {
  fixture.guard = guard
  return () => {}
} }))

const repo = { id: 'repo-b', executionHostId: 'runtime:b', displayName: 'B', path: '/B', addedAt: 0, badgeColor: 'blue' }
const setup = { id: 'setup-b', repoId: 'repo-b', hostId: 'runtime:b', setupState: 'ready', path: '/B' }
const scope: PlatformSettingsPresentation['scope'] = { kind: 'project', contextKey: 'trusted', platformId: 'p-b',
  repoId: 'repo-b', hostId: 'runtime:b', setupId: 'setup-b', name: 'B', path: '/B' }

beforeEach(() => {
  vi.clearAllMocks()
  fixture.ask.mockResolvedValue(true)
  const noop = vi.fn()
  fixture.model = {
    settings: {}, repos: [repo], settingsProjectList: [{ representativeRepoId: 'repo-b', setups: [setup] }],
    settingsNavigationTarget: null, activeSectionId: 'repo-a', repoIdToRepresentative: new Map([['repo-b', 'repo-b']]),
    repoIdToHostSelection: new Map(), settingsSearchQuery: '', keybindings: [], showDesktopOnlySettings: false,
    closeSettingsPage: noop, confirm: async () => false, updateSettingsOrThrow: async () => {},
    fetchSettings: noop, fetchKeybindings: noop, refreshModelStates: async () => {}, setVoiceModelStatesLoading: noop,
    clearSettingsTarget: noop, setMountedSectionIds: noop, setQuickCommandAddIntentSignal: noop,
    setRemoteServerAddIntentSignal: noop, setSettingsHostChoice: noop, setSettingsProjectHostSelection: noop,
    setSshHostAddIntentSignal: noop, setPendingNavRequestTick: noop, setFontSuggestions: noop,
    setHasUnsavedBranchPromptChanges: noop, setHasUnsavedChatPromptChanges: noop, setHasUnsavedCommitPromptChanges: noop,
    setHighlightedSettingsTargetId: noop, setSettingsSearchQuery: noop, setSourceControlAiPromptDiscardSignal: noop
  }
  fixture.navigation = { navSections: [{ id: 'repo-repo-b' }] }
  fixture.model.clearSettingsTarget = vi.fn()
  fixture.model.closeSettingsPage = vi.fn()
  fixture.model.setQuickCommandAddIntentSignal = vi.fn()
})
afterEach(cleanup)

function page(presentation: PlatformSettingsPresentation) {
  return <PlatformSettingsContext.Provider value={presentation}><Settings /></PlatformSettingsContext.Provider>
}

it('uses the actual Settings target/effect/ready chain and rejects the old A section before reporting B', () => {
  const ready = vi.fn()
  const presentation = { scope, visible: true, onReady: ready }
  const view = render(page(presentation))
  expect(fixture.open).toHaveBeenCalledWith({ pane: 'repo', repoId: 'repo-b', hostId: 'runtime:b' })
  expect(ready).toHaveBeenLastCalledWith(null)
  fixture.model.settingsNavigationTarget = { pane: 'repo', repoId: 'repo-b', hostId: 'runtime:b' }
  view.rerender(page(presentation))
  expect(fixture.model.clearSettingsTarget).toHaveBeenCalledOnce()
  expect(ready).toHaveBeenLastCalledWith(null)
  fixture.model.settingsNavigationTarget = null
  fixture.model.activeSectionId = 'repo-repo-b'
  view.rerender(page(presentation))
  expect(ready).toHaveBeenLastCalledWith({ contextKey: 'trusted', repoId: 'repo-b', hostId: 'runtime:b',
    setupId: 'setup-b', sectionId: 'repo-repo-b' })
})

it('keeps a missing exact host/setup pending and never renders the prior project pane', () => {
  fixture.model.settingsProjectList = []
  const ready = vi.fn()
  const view = render(page({ scope, visible: true, onReady: ready }))
  expect(view.queryByTestId('page')).toBeNull()
  expect(view.getByTestId('loading').textContent).toBe('pending')
  expect(fixture.open).not.toHaveBeenCalled()
  expect(ready).toHaveBeenLastCalledWith(null)
})

it('retains the focused draft through native name echo and Studio label confirmation without replaying its target', () => {
  fixture.model.activeSectionId = 'repo-repo-b'
  const ready = vi.fn()
  const presentation = { scope, visible: true, onReady: ready }
  const view = render(page(presentation))
  const input = view.getByRole<HTMLInputElement>('textbox', { name: 'Native display name draft' })
  input.focus()
  fireEvent.change(input, { target: { value: 'Renamed and newer unsaved text' } })
  expect(fixture.open).toHaveBeenCalledOnce()
  fixture.model.repos = [{ ...repo, displayName: 'Renamed' }]
  view.rerender(page(presentation))
  expect(input.isConnected).toBe(true)
  expect(document.activeElement).toBe(input)
  expect(input.value).toBe('Renamed and newer unsaved text')
  view.rerender(page({ ...presentation, scope: { ...scope, name: 'Renamed' } }))
  expect(view.getByRole('textbox', { name: 'Native display name draft' })).toBe(input)
  expect(document.activeElement).toBe(input)
  expect(input.value).toBe('Renamed and newer unsaved text')
  expect(fixture.open).toHaveBeenCalledOnce()
  expect(ready).toHaveBeenLastCalledWith({ contextKey: 'trusted', repoId: 'repo-b', hostId: 'runtime:b',
    setupId: 'setup-b', sectionId: 'repo-repo-b' })
})

it('preserves and consumes a validated original repo subsection intent with an omitted host once', () => {
  fixture.model.settingsNavigationTarget = { pane: 'repo', repoId: 'repo-b' }
  render(page({ scope, visible: true }))
  expect(fixture.model.clearSettingsTarget).toHaveBeenCalledOnce()
  expect(fixture.open).not.toHaveBeenCalled()
})

it('does not consume an out-of-scope intent or fake readiness for a known unconnected global entry', () => {
  fixture.model.settingsNavigationTarget = { pane: 'quick-commands', repoId: null, intent: 'add-quick-command' }
  const ready = vi.fn()
  const view = render(page({ scope: { kind: 'global', contextKey: 'trusted', entry: 'development' },
    visible: true, onReady: ready }))
  expect(view.getByTestId('loading').textContent).toBe('environment')
  expect(fixture.model.setQuickCommandAddIntentSignal).not.toHaveBeenCalled()
  expect(fixture.model.clearSettingsTarget).not.toHaveBeenCalled()
  expect(ready).toHaveBeenLastCalledWith(null)
})

it('includes real inline participants in the original window-close pure guard', async () => {
  fixture.ask.mockResolvedValue(false)
  render(page({ scope, visible: true }))
  expect(await fixture.guard!()).toBe(false)
  expect(fixture.ask).toHaveBeenCalledOnce()
  expect(fixture.model.closeSettingsPage).not.toHaveBeenCalled()
})
