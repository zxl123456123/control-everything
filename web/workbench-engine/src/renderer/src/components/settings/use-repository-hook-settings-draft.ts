import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { RepoHookSettings } from '../../../../shared/orca-yaml-hook-types'
import type { Repo } from '../../../../shared/repo-types'
import { SettingsDraftContext } from '@/web/platform-settings-navigation'
import {
  areHookSettingsDraftsEqual,
  getHookSettingsDraft,
  type HookSettingsPolicyDraft,
  type LocalHookName
} from './repository-hook-settings-draft'

export type HookSaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type PersistHooks = (settings: RepoHookSettings) => Promise<boolean>

export function useRepositoryHookSettingsDraft({ repo, repoHostIdentity, onUpdateHookSettings }: {
  repo: Repo
  repoHostIdentity: string
  onUpdateHookSettings: PersistHooks
}) {
  const draftContext = useContext(SettingsDraftContext)
  const draftKey = `${draftContext?.keyPrefix ?? 'standalone'}:hooks:${repoHostIdentity}`
  const initial = () => (draftContext?.drafts.get(draftKey) as RepoHookSettings | undefined) ??
    getHookSettingsDraft(repo.hookSettings)
  const [hookSettingsDraft, setHookSettingsDraft] = useState(initial)
  const [saveStatus, setSaveStatus] = useState<HookSaveStatus>('idle')
  const [lastEditedHook, setLastEditedHook] = useState<LocalHookName | null>(null)
  const draftRef = useRef(hookSettingsDraft)
  const identityRef = useRef(repoHostIdentity)
  const versionRef = useRef(0)
  const dirtyRef = useRef(!areHookSettingsDraftsEqual(hookSettingsDraft, getHookSettingsDraft(repo.hookSettings)))
  const timerRef = useRef<number | null>(null)
  const pendingRef = useRef<{ version: number; promise: Promise<boolean> } | null>(null)
  const scheduledRef = useRef<{ promise: Promise<boolean>; resolve: (ok: boolean) => void } | null>(null)
  const persistRef = useRef(onUpdateHookSettings)
  const previousPersistRef = useRef(onUpdateHookSettings)
  const mountedRef = useRef(true)
  useEffect(() => { persistRef.current = onUpdateHookSettings }, [onUpdateHookSettings])
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const flushScriptDraft = useCallback((persist: PersistHooks = persistRef.current): Promise<boolean> => {
    clearTimer()
    const version = versionRef.current
    if (pendingRef.current?.version === version) return pendingRef.current.promise
    if (!dirtyRef.current) return Promise.resolve(true)
    const identity = identityRef.current
    const snapshot = draftRef.current
    const scheduled = scheduledRef.current
    scheduledRef.current = null
    if (mountedRef.current) setSaveStatus('saving')
    let write: Promise<boolean>
    try { write = persist(snapshot) } catch { write = Promise.resolve(false) }
    const promise = Promise.resolve(write).then((result) => result === true, () => false).then((ok) => {
      const current = identityRef.current === identity && versionRef.current === version
      if (current) {
        if (ok) {
          dirtyRef.current = false
          draftContext?.drafts.delete(draftKey)
        }
        if (mountedRef.current) setSaveStatus(ok ? 'saved' : 'error')
      }
      scheduled?.resolve(ok && current)
      return ok && current
    })
    pendingRef.current = { version, promise }
    void promise.then(() => {
      if (pendingRef.current?.promise === promise) pendingRef.current = null
    })
    return promise
  }, [clearTimer, draftContext?.drafts, draftKey])

  const updateDraft = useCallback((next: RepoHookSettings) => {
    versionRef.current += 1
    dirtyRef.current = true
    draftRef.current = next
    draftContext?.drafts.set(draftKey, next)
    setHookSettingsDraft(next)
    setSaveStatus('saving')
  }, [draftContext?.drafts, draftKey])

  const updateScriptDraft = useCallback((hookName: LocalHookName, nextScript: string) => {
    setLastEditedHook(hookName)
    updateDraft({ ...draftRef.current, scripts: { ...draftRef.current.scripts, [hookName]: nextScript } })
    clearTimer()
    if (!scheduledRef.current) {
      let resolve!: (ok: boolean) => void
      const promise = new Promise<boolean>((done) => { resolve = done })
      scheduledRef.current = { promise, resolve }
    }
    // The existing debounce owns writes; a navigation guard only waits for its result.
    timerRef.current = window.setTimeout(() => { void flushScriptDraft() }, 700)
  }, [updateDraft, clearTimer, flushScriptDraft])

  const commitScriptDraft = useCallback(() => flushScriptDraft(), [flushScriptDraft])
  const flushScriptDraftOnUnmount = useCallback((node: HTMLElement | null): void => {
    if (node === null) void flushScriptDraft()
  }, [flushScriptDraft])
  const updateHookSettingsPolicyDraft = useCallback((updates: HookSettingsPolicyDraft): void => {
    updateDraft({ ...draftRef.current, ...updates })
    void flushScriptDraft()
  }, [updateDraft, flushScriptDraft])

  useEffect(() => {
    const next = initial()
    if (identityRef.current === repoHostIdentity) {
      previousPersistRef.current = onUpdateHookSettings
      if (!dirtyRef.current && !pendingRef.current && !areHookSettingsDraftsEqual(draftRef.current, next)) {
        draftRef.current = next
        setHookSettingsDraft(next)
      }
      return
    }
    void flushScriptDraft(previousPersistRef.current)
    identityRef.current = repoHostIdentity
    versionRef.current += 1
    pendingRef.current = null
    previousPersistRef.current = onUpdateHookSettings
    draftRef.current = next
    dirtyRef.current = !areHookSettingsDraftsEqual(next, getHookSettingsDraft(repo.hookSettings))
    setHookSettingsDraft(next)
    setSaveStatus('idle')
    // initial reads the current identity's session draft; no persisted configuration is copied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.hookSettings, repoHostIdentity, onUpdateHookSettings, flushScriptDraft])

  useEffect(() => draftContext?.register({
    key: draftKey,
    ask: async () => {
      const pending = scheduledRef.current?.promise ?? pendingRef.current?.promise
      if (pending) await pending
      return !dirtyRef.current
    }
  }), [draftContext, draftKey])

  return { hookSettingsDraft, saveStatus, lastEditedHook, updateScriptDraft, commitScriptDraft,
    flushScriptDraftOnUnmount, updateHookSettingsPolicyDraft }
}
