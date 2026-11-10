import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { settingsDraftKey, type SettingsDraftParticipant, type PlatformBeforeNavigateDetail,
  type PlatformNavigationAcceptedDetail } from '@/web/platform-settings-navigation'
import type { SourceControlAiSettingsPatch } from '../../../../shared/source-control-ai-types'
import { useAppStore } from '../../store'
import { translate } from '@/i18n/i18n'
import { mergeFontSuggestions } from './SettingsConstants'
import type { SettingsStoreModel } from './use-settings-store-model'
import type { SettingsDeepLinkTargetWatch } from './settings-deep-link-target-watcher'
import {
  cancelPendingSettingsDeepLinkTargetWatch,
  cancelPendingSettingsSubsectionScrollFrame,
  readSourceControlAiSettings,
  SETTINGS_TARGET_HIGHLIGHT_MS
} from './settings-navigation-foundations'

export type SettingsInteractionModel = Pick<
  SettingsStoreModel,
  | 'closeSettingsPage'
  | 'confirm'
  | 'hasUnsavedBranchPromptChanges'
  | 'hasUnsavedChatPromptChanges'
  | 'hasUnsavedCommitPromptChanges'
  | 'highlightedSettingsTargetId'
  | 'setFontSuggestions'
  | 'setHasUnsavedBranchPromptChanges'
  | 'setHasUnsavedChatPromptChanges'
  | 'setHasUnsavedCommitPromptChanges'
  | 'setHighlightedSettingsTargetId'
  | 'setSettingsSearchQuery'
  | 'setSourceControlAiPromptDiscardSignal'
  | 'settings'
  | 'updateSettingsOrThrow'
> & { presentation?: SettingsStoreModel['presentation'] }

export function useSettingsInteractionController(model: SettingsInteractionModel) {
  const presentation = model.presentation
  const participants = useRef(new Map<string, SettingsDraftParticipant>())
  const localDrafts = useRef(new Map<string, unknown>())
  const {
    closeSettingsPage,
    confirm,
    hasUnsavedBranchPromptChanges,
    hasUnsavedChatPromptChanges,
    hasUnsavedCommitPromptChanges,
    highlightedSettingsTargetId,
    setFontSuggestions,
    setHasUnsavedBranchPromptChanges,
    setHasUnsavedChatPromptChanges,
    setHasUnsavedCommitPromptChanges,
    setHighlightedSettingsTargetId,
    setSettingsSearchQuery,
    setSourceControlAiPromptDiscardSignal,
    settings,
    updateSettingsOrThrow
  } = model
  const contentScrollRef = useRef<HTMLDivElement | null>(null)
  // Why state as well as the ref: windowed lists need a re-render once the scroller attaches.
  const [contentScrollElement, setContentScrollElement] = useState<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const installedFontsLoadedRef = useRef(false)
  const installedFontsLoadPromiseRef = useRef<Promise<void> | null>(null)
  const settingsMountedRef = useRef(true)
  const pendingNavSectionRef = useRef<string | null>(null)
  const pendingScrollTargetRef = useRef<string | null>(null)
  const pendingSubsectionScrollFrameRef = useRef<number | null>(null)
  const pendingScrollTargetWatchRef = useRef<SettingsDeepLinkTargetWatch | null>(null)
  const repoHooksRequestSeqRef = useRef(0)
  const shortcutsEscapeConfirmUntilRef = useRef(0)
  const sourceControlAiWriteQueueRef = useRef<Promise<void>>(undefined!)
  const closingRef = useRef(false)
  sourceControlAiWriteQueueRef.current ??= Promise.resolve()

  const hasUnsavedSourceControlAiPromptChanges =
    hasUnsavedCommitPromptChanges || hasUnsavedBranchPromptChanges || hasUnsavedChatPromptChanges
  // Why: the close guard registers once, so it reads latest dirty state from a ref instead of a lagging closure.
  const hasUnsavedSourceControlAiPromptChangesRef = useRef(hasUnsavedSourceControlAiPromptChanges)
  hasUnsavedSourceControlAiPromptChangesRef.current = hasUnsavedSourceControlAiPromptChanges

  const writeSourceControlAiSettingsOrThrow = useCallback(
    (patch: SourceControlAiSettingsPatch): Promise<void> => {
      const next = sourceControlAiWriteQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const latestSettings = useAppStore.getState().settings ?? settings
          if (!latestSettings) {
            return
          }

          const latestConfig = readSourceControlAiSettings(latestSettings)
          const resolvedPatch = typeof patch === 'function' ? patch(latestConfig) : patch
          await updateSettingsOrThrow({ sourceControlAi: { ...latestConfig, ...resolvedPatch } })
        })
      sourceControlAiWriteQueueRef.current = next
      return next
    },
    [settings, updateSettingsOrThrow]
  )

  const writeSourceControlAiSettings = useCallback(
    (patch: SourceControlAiSettingsPatch): Promise<void> =>
      writeSourceControlAiSettingsOrThrow(patch).catch((error: unknown) => {
        console.error('Failed to update settings:', error)
      }),
    [writeSourceControlAiSettingsOrThrow]
  )

  const setSettingsRootNode = useCallback(
    (node: HTMLDivElement | null): void => {
      if (node) {
        return
      }
      // Why: clear the transient search filter on close, else the next visit opens with whole sections still hidden.
      setSettingsSearchQuery('')
    },
    [setSettingsSearchQuery]
  )

  const setContentScrollNode = useCallback((node: HTMLDivElement | null): void => {
    contentScrollRef.current = node
    setContentScrollElement(node)
    if (node !== null) {
      return
    }
    // Why: cancel pending subsection jumps with the scroll container so a stale deep-link frame can't run after close.
    cancelPendingSettingsSubsectionScrollFrame(pendingSubsectionScrollFrameRef)
    cancelPendingSettingsDeepLinkTargetWatch(pendingScrollTargetWatchRef)
  }, [])

  useEffect(() => {
    // Why: StrictMode replays mount effects; async font requests should still commit while Settings is mounted.
    settingsMountedRef.current = true
    return () => {
      settingsMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!highlightedSettingsTargetId) {
      return
    }
    const timeout = window.setTimeout(
      () => setHighlightedSettingsTargetId(null),
      SETTINGS_TARGET_HIGHLIGHT_MS
    )
    return () => window.clearTimeout(timeout)
  }, [highlightedSettingsTargetId, setHighlightedSettingsTargetId])

  const requestFontSuggestions = useCallback((): void => {
    if (installedFontsLoadedRef.current || installedFontsLoadPromiseRef.current) {
      return
    }

    installedFontsLoadPromiseRef.current = window.api.settings
      .listFonts()
      .then((fonts) => {
        if (!settingsMountedRef.current) {
          return
        }
        // Latch after the first successful attempt even when empty, so a font-less system doesn't reissue listFonts() each time.
        installedFontsLoadedRef.current = true
        if (fonts.length === 0) {
          return
        }
        setFontSuggestions((prev) => mergeFontSuggestions(fonts, prev))
      })
      .catch(() => {
        // Fall back to curated cross-platform suggestions.
      })
      .finally(() => {
        installedFontsLoadPromiseRef.current = null
      })
  }, [setFontSuggestions])

  // Pure prompt (no side effects): the close guard must ask without clearing drafts, since a later guard can still cancel the close.
  const promptDiscardSourceControlAiPromptChanges = useCallback((): Promise<boolean> => {
    return confirm({
      title: translate(
        'auto.components.settings.Settings.17bdee4ff1',
        'Discard unsaved AI settings?'
      ),
      description: translate(
        'auto.components.settings.Settings.43b68e10f0',
        'You have unsaved AI settings. Leaving will discard them.'
      ),
      confirmLabel: translate('auto.components.settings.Settings.65358016ea', 'Discard'),
      confirmVariant: 'destructive'
    })
  }, [confirm])

  const askToLeaveSettings = useCallback(async (): Promise<boolean> => {
    if (hasUnsavedSourceControlAiPromptChangesRef.current &&
      !(await promptDiscardSourceControlAiPromptChanges())) return false
    for (const participant of participants.current.values()) {
      if (!(await participant.ask())) return false
    }
    return true
  }, [promptDiscardSourceControlAiPromptChanges])

  const commitSettingsDiscard = useCallback((): void => {
    if (hasUnsavedSourceControlAiPromptChangesRef.current) {
      setSourceControlAiPromptDiscardSignal((signal) => signal + 1)
      setHasUnsavedCommitPromptChanges(false)
      setHasUnsavedBranchPromptChanges(false)
      setHasUnsavedChatPromptChanges(false)
    }
    for (const participant of participants.current.values()) participant.discard?.()
  }, [setSourceControlAiPromptDiscardSignal, setHasUnsavedCommitPromptChanges,
    setHasUnsavedBranchPromptChanges, setHasUnsavedChatPromptChanges])

  const draftContext = useMemo(() => ({
    keyPrefix: presentation ? settingsDraftKey(presentation.scope) : 'standalone',
    drafts: presentation?.drafts ?? localDrafts.current,
    register: (participant: SettingsDraftParticipant) => {
      participants.current.set(participant.key, participant)
      return () => {
        if (participants.current.get(participant.key) === participant)
          participants.current.delete(participant.key)
      }
    },
    confirmDiscard: promptDiscardSourceControlAiPromptChanges
  }), [presentation?.scope, presentation?.drafts, promptDiscardSourceControlAiPromptChanges])

  useEffect(() => {
    if (!presentation || presentation.visible === false) return
    let pending: { from: string; to: string; accepted: boolean } | null = null
    const before = (event: Event) => {
      const detail = (event as CustomEvent<PlatformBeforeNavigateDetail>).detail
      if (!detail || typeof detail.waitUntil !== 'function') return
      const request = { from: detail.from, to: detail.to, accepted: false }
      pending = request
      detail.waitUntil(askToLeaveSettings().then((accepted) => {
        if (pending === request) request.accepted = accepted
        return accepted
      }))
    }
    const accepted = (event: Event) => {
      const detail = (event as CustomEvent<PlatformNavigationAcceptedDetail>).detail
      if (pending?.accepted && pending.from === detail?.from && pending.to === detail.to) {
        pending = null
        commitSettingsDiscard()
      }
    }
    window.addEventListener('platform-before-navigate', before)
    window.addEventListener('platform-navigation-accepted', accepted)
    return () => {
      pending = null
      window.removeEventListener('platform-before-navigate', before)
      window.removeEventListener('platform-navigation-accepted', accepted)
    }
  }, [presentation?.scope, presentation?.visible, askToLeaveSettings, commitSettingsDiscard])

  const confirmDiscardSourceControlAiPromptChanges = useCallback(async (): Promise<boolean> => {
    const shouldDiscard = await askToLeaveSettings()
    if (shouldDiscard) commitSettingsDiscard()
    return shouldDiscard
  }, [
    askToLeaveSettings,
    commitSettingsDiscard
  ])

  const closeSettingsPageWithPromptGuard = useCallback(async (): Promise<void> => {
    if (presentation?.onClose) {
      presentation.onClose()
      return
    }
    if (closingRef.current) return
    closingRef.current = true
    try {
      if (await confirmDiscardSourceControlAiPromptChanges()) closeSettingsPage()
    } finally {
      closingRef.current = false
    }
  }, [closeSettingsPage, confirmDiscardSourceControlAiPromptChanges, presentation?.onClose])

  return {
    askToLeaveSettings,
    draftContext,
    contentScrollRef,
    contentScrollElement,
    searchInputRef,
    pendingNavSectionRef,
    pendingScrollTargetRef,
    pendingSubsectionScrollFrameRef,
    pendingScrollTargetWatchRef,
    repoHooksRequestSeqRef,
    shortcutsEscapeConfirmUntilRef,
    hasUnsavedSourceControlAiPromptChanges,
    hasUnsavedSourceControlAiPromptChangesRef,
    writeSourceControlAiSettings,
    writeSourceControlAiSettingsOrThrow,
    setSettingsRootNode,
    setContentScrollNode,
    requestFontSuggestions,
    promptDiscardSourceControlAiPromptChanges,
    confirmDiscardSourceControlAiPromptChanges,
    closeSettingsPageWithPromptGuard
  }
}

export type SettingsInteractionController = ReturnType<typeof useSettingsInteractionController>
