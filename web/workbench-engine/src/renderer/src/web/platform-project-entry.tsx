import { assertContextActive, onContextInactive, remoteContext } from './remote-context'
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { saveStoredWebRuntimeEnvironment } from './web-runtime-environment'
import { initWebDeviceKeySupport } from './web-device-key-support'
import './platform-project-entry.css'
import {
  createPlatformEnvironment,
  loadPlatformProjectBootstrap,
  loadPlatformRuntimeBootstrap,
  type PlatformRuntimeBootstrap,
  type PlatformProjectBootstrap
} from './platform-project-bootstrap'
import PlatformStudioSurface, {
  type PlatformProject,
  type PlatformProjectsListener
} from './platform-studio-surface'
import { readPlatformRoute, projectRoute } from './platform-route'
import { PlatformProjectContext, PlatformProjectScopeContext } from './platform-project-context'
import { PlatformSettingsContext, type SettingsTargetReady } from './platform-settings-navigation'
import { isSettingsNavigationTarget, type SettingsPresentationScope } from '../lib/settings-navigation-types'

const App = lazy(() => import('./platform-workspace-app'))
const PlatformNavigation = lazy(() => import('./platform-project-navigation-view'))
const PlatformRuntimeNavigation = lazy(() => import('./platform-project-navigation-view').then(module => ({ default: module.PlatformRuntimeNavigation })))
const PlatformAgentBridge = lazy(() => import('./platform-agent-bridge'))
const TASK_ACTION_EVENTS = ['platform-start-task-agent', 'platform-open-task-session', 'platform-adopt-task-session'] as const
type TaskActionDetail = { projectId: string; taskId: string; resume?: boolean; sessionId?: string }

function WorkspaceMounted({ onReady }: { onReady: () => void }): null {
  useLayoutEffect(onReady, [onReady])
  return null
}

export default function PlatformProjectEntry(): React.JSX.Element {
  const [data, setData] = useState<PlatformProjectBootstrap | null>(null)
  const [runtimeData, setRuntimeData] = useState<PlatformRuntimeBootstrap | null>(null)
  const [runtimeError, setRuntimeError] = useState('')
  const [runtimeReadyRevision, setRuntimeReadyRevision] = useState<number | null>(null)
  const onRuntimeReady = useCallback((revision: number | null) => setRuntimeReadyRevision(revision), [])
  const [error, setError] = useState('')
  const [route, setRoute] = useState(() => readPlatformRoute(window.location))
  const [projects, setProjects] = useState<PlatformProject[]>([])
  const [archivedProjects, setArchivedProjects] = useState<PlatformProject[]>([])
  const [retry, setRetry] = useState(0)
  const cache = useRef(
    new Map<string, { project: PlatformProject; data: PlatformProjectBootstrap }>()
  )
  const latestProjects = useRef<PlatformProject[]>([])
  const [projectsReady, setProjectsReady] = useState(false)
  const [readyData, setReadyData] = useState<PlatformProjectBootstrap | null>(null)
  const [appMounted, setAppMounted] = useState(false)
  const onAppMounted = useCallback(() => setAppMounted(true), [])
  const [bridgeReadyData, setBridgeReadyData] = useState<PlatformProjectBootstrap | null>(null)
  const pendingAgentRequest = useRef<{ name: string; detail: TaskActionDetail } | null>(null)
  const [selectionOnlyProjectId, setSelectionOnlyProjectId] = useState<string | null>(null)
  const environment = useRef('')
  const endpoint = useRef('')
  const [unlinkedWorkspace, setUnlinkedWorkspace] = useState(false)
  const unlinked = useRef(false)
  const onWorkspaceSelection = useCallback((id: string | null) => {
    unlinked.current = !id
    setUnlinkedWorkspace(!id)
    if (id && readPlatformRoute(window.location).id !== id) window.location.hash = projectRoute(id)
  }, [])
  const acceptedHash = useRef(
    window.location.hash || (route.id ? projectRoute(route.id, route.tab) : '#home')
  )
  const [navigationNotice, setNavigationNotice] = useState('')
  const navigationGeneration = useRef(0)
  const pendingNavigation = useRef<{ from: string; to: string; generation: number } | null>(null)
  const [acceptedRevision, setAcceptedRevision] = useState(0)
  useEffect(() => setRuntimeError(''), [acceptedRevision])
  const trustedContextKey = useRef(remoteContext()?.scope ?? 'local-page')
  const drafts = useRef(new Map<string, unknown>())
  const settingsOrigin = useRef('#home')
  const settingsTrigger = useRef<HTMLElement | null>(null)
  const [contextActive, setContextActive] = useState(true)
  const projectSettings = route.view === 'project' && route.tab === 'settings'
  const globalSettings = route.view === 'settings' && !['account', 'sources'].includes(route.tab)
  const nativeSettings = projectSettings || globalSettings
  const settingsRequestKey = `${acceptedRevision}:${route.view}:${route.id}:${route.tab}`
  const currentSettingsRequest = useRef(settingsRequestKey)
  currentSettingsRequest.current = settingsRequestKey
  const [exactSettings, setExactSettings] = useState<{ request: string; scope: SettingsPresentationScope } | null>(null)
  const [settingsReady, setSettingsReady] = useState<{ request: string; ready: SettingsTargetReady } | null>(null)
  useEffect(() => onContextInactive(() => {
    navigationGeneration.current++
    drafts.current.clear()
    setContextActive(false)
    setSettingsReady(null)
  }), [])
  const onProjects = useCallback<PlatformProjectsListener>((rows, metadata) => {
    const previous = latestProjects.current
    latestProjects.current = rows
    const archived = metadata?.archived ?? []
    setArchivedProjects(archived)
    setProjectsReady(true)
    for (const [id, saved] of cache.current) {
      const project = rows.find((row) => row.id === id)
      if (
        !project ||
        project.name !== saved.project.name ||
        project.directory !== saved.project.directory
      )
        cache.current.delete(id)
    }
    const current = readPlatformRoute(window.location)
    if (current.view === 'project' && archived.some((row) => row.id === current.id))
      setNavigationNotice('已归档，仍停在当前页。')
    else if (
      current.view === 'project' &&
      rows.some((row) => row.id === current.id) &&
      !previous.some((row) => row.id === current.id)
    )
      setNavigationNotice('')
    if (
      previous.length !== rows.length ||
      rows.some(
        (row, index) =>
          row.id !== previous[index]?.id ||
          row.name !== previous[index]?.name ||
          row.directory !== previous[index]?.directory
      )
    )
      setProjects(rows)
  }, [])
  const projectScope = useMemo(
    () => ({ projects, executionHostId: runtimeData ? `runtime:${runtimeData.runtime.environmentId}` : '' }),
    [projects, runtimeData?.runtime.environmentId]
  )
  const projectId = route.view === 'project' ? route.id : ''
  const previousProjectId = useRef(projectId)
  const pendingProjectReveal = useRef(false)
  const currentData = data?.project.id === projectId ? data : null
  const developing = route.view === 'project' && ['workspace', 'activity'].includes(route.tab)
  const needsProjectRuntime = developing || projectSettings
  const workbench = route.view === 'workbench'
  const needsRuntime = workbench || nativeSettings || needsProjectRuntime
  const chosen = projects.find((project) => project.id === projectId)
  const archived = archivedProjects.find((project) => project.id === projectId)
  const connected = Boolean(
    chosen &&
    data?.project.id === projectId &&
    data.project.name === chosen.name &&
    cache.current.get(projectId)?.project.directory === chosen.directory &&
    !error
  )
  const showWorkspace = developing && connected && appMounted && readyData === data
  const scope = useMemo<SettingsPresentationScope>(() => {
    if (projectSettings && chosen && data?.project.id === projectId) {
      if (exactSettings?.request === settingsRequestKey) return exactSettings.scope
      return { kind: 'project', contextKey: trustedContextKey.current, platformId: projectId,
        repoId: data.target.repoId, hostId: `runtime:${data.runtime.environmentId}`, setupId: '',
        name: chosen.name, path: chosen.directory ?? '' }
    }
    return { kind: 'global', contextKey: trustedContextKey.current,
      entry: route.tab === 'appearance' ? 'appearance' : 'development',
      ...(globalSettings && runtimeData ? { environmentId: runtimeData.runtime.environmentId } : {}) }
  }, [projectSettings, globalSettings, projectId, chosen, data, runtimeData, exactSettings, settingsRequestKey, route.tab])
  const onSettingsScope = useCallback((value: Extract<SettingsPresentationScope, { kind: 'project' }> | null) => {
    if (currentSettingsRequest.current !== settingsRequestKey) return
    setExactSettings(previous => value ?
      (previous?.request === settingsRequestKey && JSON.stringify(previous.scope) === JSON.stringify(value)
        ? previous : { request: settingsRequestKey, scope: value }) : null)
  }, [settingsRequestKey])
  const onSettingsReady = useCallback((ready: SettingsTargetReady | null) => {
    if (currentSettingsRequest.current !== settingsRequestKey) return
    try { assertContextActive() } catch { return }
    if (ready && (ready.contextKey !== scope.contextKey || (scope.kind === 'project'
      ? (ready.repoId !== scope.repoId || ready.hostId !== scope.hostId || ready.setupId !== scope.setupId ||
        ready.sectionId !== `repo-${scope.repoId}`)
      : ready.repoId !== null || (ready.sectionId !== (route.tab === 'development' ? 'agents' : route.tab) &&
        !(scope.entry === 'development' && ready.sectionId === 'agents'))))) return
    setSettingsReady(previous => ready ?
      (previous?.request === settingsRequestKey && JSON.stringify(previous.ready) === JSON.stringify(ready)
        ? previous : { request: settingsRequestKey, ready }) : null)
  }, [settingsRequestKey, scope, route.tab])
  const closeSettings = useCallback(() => { window.location.hash = settingsOrigin.current }, [])
  const initialTarget = useMemo(() => {
    if (scope.kind === 'project') return { pane: 'repo' as const, repoId: scope.repoId, hostId: scope.hostId }
    const target = { pane: route.tab === 'development' ? 'agents' : route.tab, repoId: null }
    return isSettingsNavigationTarget(target) ? target : undefined
  }, [scope, route.tab])
  const presentation = useMemo(() => ({ scope, initialTarget, visible: (globalSettings || (projectSettings && connected)) && contextActive,
    onReady: onSettingsReady, onClose: closeSettings, drafts: drafts.current
  }), [scope, initialTarget, globalSettings, projectSettings, connected, contextActive, onSettingsReady, closeSettings])
  const showSettings = nativeSettings && contextActive && appMounted && Boolean(runtimeData) &&
    settingsReady?.request === settingsRequestKey && (globalSettings || connected)
  const showWorkbench = workbench && contextActive && appMounted && Boolean(runtimeData) && runtimeReadyRevision === acceptedRevision
  const preparationError = needsProjectRuntime ? error : runtimeError
  const preparingWorkspace = needsRuntime && !showWorkspace && !showSettings && !showWorkbench && !preparationError && !archived
  useEffect(() => {
    const changed = () => {
      const from = acceptedHash.current || '#home'
      const to = ['#workspace', '#project-setup'].includes(window.location.hash) ? '#workbench' : window.location.hash || '#home'
      if (to === from) return
      if (pendingNavigation.current?.from === from && pendingNavigation.current.to === to) {
        window.history.replaceState(null, '', from)
        return
      }
      pendingNavigation.current = null
      const generation = ++navigationGeneration.current
      const next = readPlatformRoute(window.location)
      const previous = readPlatformRoute({
        hash: acceptedHash.current,
        search: window.location.search
      })
      if (
        unlinked.current &&
        next.view === 'project' &&
        next.id === previous.id &&
        next.tab !== 'workspace' &&
        next.tab !== 'tasks'
      ) {
        window.history.replaceState(null, '', acceptedHash.current)
        setNavigationNotice('当前开发目录未关联登记项目，请从左侧项目栏选择已登记项目。')
        return
      }
      const studio = document.querySelector('.platform-studio-host')?.shadowRoot
      const projectDialog = document.querySelector('[data-platform-project-dialog]')?.shadowRoot
      const dialogs = [
        ...document.querySelectorAll(
          '[role="dialog"], [role="alertdialog"], [role="menu"], dialog[open]'
        ),
        ...(studio?.querySelectorAll('dialog[open]') || []),
        ...(projectDialog?.querySelectorAll('dialog[open]') || [])
      ]
      if (
        dialogs.some(
          (dialog) =>
            dialog.getAttribute('data-state') !== 'closed' && dialog.getClientRects().length > 0
        )
      ) {
        window.history.replaceState(null, '', acceptedHash.current)
        setNavigationNotice('请先完成或关闭当前窗口，再切换页面。')
        return
      }
      // The raw hash is a request. Keep the accepted surface intact while drafts ask permission.
      window.history.replaceState(null, '', from)
      const waits: Promise<boolean>[] = []
      const request = new CustomEvent('platform-before-navigate', {
        cancelable: true,
        detail: { from, to, waitUntil: (result: Promise<boolean>) => waits.push(Promise.resolve(result)) }
      })
      window.dispatchEvent(request)
      const commit = () => {
        if (generation !== navigationGeneration.current) return
        pendingNavigation.current = null
        try { assertContextActive() } catch { return }
        window.history.replaceState(null, '', to)
        acceptedHash.current = to
        setAcceptedRevision(value => value + 1)
        const isSettings = (value: typeof next) => value.view === 'settings' ||
          (value.view === 'project' && value.tab === 'settings')
        if (isSettings(next) && !isSettings(previous)) {
          settingsOrigin.current = from
          let focused = document.activeElement
          while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement
          settingsTrigger.current = focused instanceof HTMLElement ? focused : null
        }
        if (isSettings(previous) && !isSettings(next)) {
          const trigger = settingsTrigger.current
          requestAnimationFrame(() => {
            if (trigger?.isConnected) trigger.focus({ preventScroll: true })
            else document.querySelector<HTMLElement>('.platform-project-name, .platform-studio-host')?.focus({ preventScroll: true })
          })
        }
        if (
          pendingAgentRequest.current &&
          (next.id !== pendingAgentRequest.current.detail.projectId || next.tab !== 'workspace')
        ) pendingAgentRequest.current = null
        if (selectionOnlyProjectId && (next.id !== selectionOnlyProjectId || next.tab !== 'workspace'))
          setSelectionOnlyProjectId(null)
        setNavigationNotice('')
        setRoute(readPlatformRoute(window.location))
        window.dispatchEvent(new CustomEvent('platform-navigation-accepted', { detail: { from, to } }))
      }
      if (request.defaultPrevented) { pendingNavigation.current = null; return }
      if (!waits.length) commit()
      else {
        pendingNavigation.current = { from, to, generation }
        void Promise.all(waits).then(results => {
          if (results.every(result => result === true)) commit()
        }).catch(() => { /* A failed guard preserves the accepted route and every draft. */ })
          .finally(() => {
            if (pendingNavigation.current?.generation === generation) pendingNavigation.current = null
          })
      }
    }
    window.addEventListener('hashchange', changed)
    if (['#workspace', '#project-setup'].includes(window.location.hash)) changed()
    return () => { navigationGeneration.current++; pendingNavigation.current = null; window.removeEventListener('hashchange', changed) }
  }, [selectionOnlyProjectId])
  useLayoutEffect(() => {
    document.documentElement.dataset.platformView = showWorkspace || showWorkbench ? 'workspace' : 'studio'
    window.dispatchEvent(new Event('platform-surface-change'))
    return () => {
      delete document.documentElement.dataset.platformView
    }
  }, [showWorkspace, showWorkbench])
  useEffect(() => {
    if (!contextActive || (!showWorkspace && !showWorkbench)) return
    let active = true
    const openProject = () => {
      const hash = window.location.hash
      void import('../store').then(({ useAppStore }) => {
        if (!active || window.location.hash !== hash ||
          document.documentElement.dataset.platformView !== 'workspace') return
        try { assertContextActive() } catch { return }
        useAppStore.getState().openModal('add-repo')
      }).catch(() => { if (active) setNavigationNotice('添加项目暂不可用，请重试。') })
    }
    window.addEventListener('platform-open-add-repo', openProject)
    return () => { active = false; window.removeEventListener('platform-open-add-repo', openProject) }
  }, [contextActive, showWorkspace, showWorkbench])
  useEffect(() => {
    const receive = (event: Event) => {
      const request = (event as CustomEvent<TaskActionDetail>).detail
      const current = readPlatformRoute(window.location)
      if (
        !request ||
        typeof request.taskId !== 'string' ||
        !request.taskId ||
        (event.type === 'platform-adopt-task-session' && (typeof request.sessionId !== 'string' || !request.sessionId)) ||
        (request.resume !== undefined && typeof request.resume !== 'boolean') ||
        current.view !== 'project' ||
        (current.id !== request.projectId && current.tab !== 'tasks') ||
        !latestProjects.current.some((project) => project.id === request.projectId)
      )
        return
      setSelectionOnlyProjectId(event.type === 'platform-start-task-agent' ? null : request.projectId)
      if (
        current.id === request.projectId &&
        data?.project.id === request.projectId &&
        bridgeReadyData === data &&
        !pendingProjectReveal.current
      )
        return
      // Own the cold request before a bridge for another project can consume it.
      event.preventDefault()
      event.stopImmediatePropagation()
      setBridgeReadyData(null)
      pendingAgentRequest.current = { name: event.type, detail: { ...request } }
      window.location.hash = projectRoute(request.projectId)
    }
    for (const name of TASK_ACTION_EVENTS) window.addEventListener(name, receive, true)
    return () => { for (const name of TASK_ACTION_EVENTS) window.removeEventListener(name, receive, true) }
  }, [data, bridgeReadyData])
  useEffect(() => {
    const request = pendingAgentRequest.current
    if (!request || !showWorkspace || readyData !== data || bridgeReadyData !== data) return
    pendingAgentRequest.current = null
    const current = readPlatformRoute(window.location)
    if (current.id === request.detail.projectId && current.tab === 'workspace')
      window.dispatchEvent(
        new CustomEvent(request.name, { cancelable: true, detail: request.detail })
      )
  }, [showWorkspace, readyData, bridgeReadyData, data])
  const installRuntime = useCallback(async (result: PlatformRuntimeBootstrap, isCurrent: () => boolean) => {
    const { installWebPreloadApi } = await import('./web-preload-api')
    if (!isCurrent()) return
    assertContextActive()
    await initWebDeviceKeySupport()
    if (!isCurrent()) return
    assertContextActive()
    if (environment.current && (environment.current !== result.runtime.environmentId ||
      endpoint.current !== result.runtime.offer.endpoint)) throw new Error('运行组件已变化，请重新加载页面。')
    if (!environment.current) {
      saveStoredWebRuntimeEnvironment(createPlatformEnvironment(result))
      installWebPreloadApi()
      environment.current = result.runtime.environmentId
      endpoint.current = result.runtime.offer.endpoint
    }
    setRuntimeData(current => current ?? { runtime: result.runtime })
  }, [])
  useEffect(() => {
    if (!(workbench || globalSettings) || runtimeData || !projectsReady) return
    setRuntimeError('')
    const controller = new AbortController()
    let cancelled = false
    const isCurrent = () => {
      const current = readPlatformRoute(window.location)
      return !cancelled && current.view === route.view && current.tab === route.tab
    }
    const timer = window.setTimeout(() => controller.abort(), 45_000)
    void loadPlatformRuntimeBootstrap(controller.signal).then(async result => {
      if (!isCurrent()) return
      await installRuntime(result, isCurrent)
    }).catch(() => {
      if (!cancelled) setRuntimeError('工作台未能连接。请确认本地服务正在运行，再重试。')
    }).finally(() => window.clearTimeout(timer))
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timer) }
  }, [workbench, globalSettings, route.view, route.tab, runtimeData, projectsReady, retry, installRuntime])
  useEffect(() => {
    if (!(workbench || globalSettings) || showWorkbench || showSettings || runtimeError) return
    const timer = window.setTimeout(() => setRuntimeError('工作台尚未就绪，请重试连接或返回项目总览。'), 45_000)
    return () => window.clearTimeout(timer)
  }, [workbench, globalSettings, showWorkbench, showSettings, runtimeError, retry])
  useLayoutEffect(() => {
    if (previousProjectId.current !== projectId) pendingProjectReveal.current = true
    previousProjectId.current = projectId
    if (!projectId || !projectsReady) return
    if (!chosen) {
      pendingAgentRequest.current = null
      setError(archived ? '' : '项目不存在，仍停在当前页。')
      return
    }
    setError('')
    if (!needsProjectRuntime) return
    const previous = cache.current.get(projectId)
    if (previous) {
      // An explicit return from the project list must reveal this project's worktree again.
      if (data?.project.id !== projectId || pendingProjectReveal.current)
        setData({ ...previous.data })
      pendingProjectReveal.current = false
      return
    }
    const requestedProject = { ...chosen }
    const isCurrentProject = () =>
      readPlatformRoute(window.location).id === projectId &&
      latestProjects.current.some(
        (project) =>
          project.id === requestedProject.id &&
          project.name === requestedProject.name &&
          project.directory === requestedProject.directory
      )
    const controller = new AbortController()
    let cancelled = false
    const timer = window.setTimeout(() => controller.abort(), 45_000)
    void (async () => {
      try {
        const result = await loadPlatformProjectBootstrap(projectId, controller.signal)
        if (cancelled || !isCurrentProject()) return
        await installRuntime(result, () => !cancelled && isCurrentProject())
        if (cancelled || !isCurrentProject()) return
        assertContextActive()
        document.title = `${result.project.name} · 掌控一切`
        cache.current.set(projectId, { project: requestedProject, data: result })
        pendingProjectReveal.current = false
        setData(result)
      } catch {
        if (!cancelled && isCurrentProject()) {
          pendingAgentRequest.current = null
          setError(
            '项目工作区未能连接。请确认本地服务正在运行，再重新加载；已有会话状态需在恢复连接后核对。'
          )
        }
      } finally {
        window.clearTimeout(timer)
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [projectId, needsProjectRuntime, retry, projectsReady, chosen?.name, chosen?.directory, archived?.id, installRuntime])
  useEffect(() => {
    if (archived) document.title = `${archived.name} · 掌控一切`
    else if (chosen) document.title = `${chosen.name} · 掌控一切`
  }, [connected, chosen?.name, archived?.name])
  return (
    <div className="platform-project-entry bg-background">
      {projectId && (
        <nav className="platform-project-tabs" aria-label="项目工作区导航">
          <a href="#home" className="platform-project-back">
            项目总览
          </a>
          <span
            className="platform-project-name"
            aria-label="当前项目"
            title={chosen?.directory || archived?.directory}
          >
            {developing && unlinkedWorkspace
              ? '未关联的开发目录'
              : chosen?.name || archived?.name || currentData?.project.name || '项目工作区'}
          </span>
          <div className="platform-project-tablist">
            {(
              [
                ['workspace', '开发'],
                ['tasks', '进展']
              ] as const
            ).map(([tab, label]) => (
              <a
                key={tab}
                href={projectRoute(projectId, tab)}
                aria-current={
                  route.tab === tab ||
                  (tab === 'workspace' && route.tab === 'activity') ||
                  (tab === 'tasks' && ['review', 'attention', 'monitor', 'items', 'board'].includes(route.tab))
                    ? 'page'
                    : undefined
                }
              >
                {label}
              </a>
            ))}
          </div>
        </nav>
      )}
      {navigationNotice && (
        <p role="status" className="platform-navigation-notice">
          {navigationNotice}
        </p>
      )}
      {workbench && <nav className="platform-project-tabs" aria-label="项目工作台导航"><a href="#home" className="platform-project-back">项目总览</a><span className="platform-project-name">项目工作台</span></nav>}
      <PlatformStudioSurface
        hidden={showWorkspace || showSettings || showWorkbench}
        pending={Boolean(nativeSettings || workbench || (developing && !showWorkspace && !archived))}
        onProjects={onProjects}
      />
      {preparingWorkspace && (
        <div className="platform-navigation-notice" role="status">
          {needsProjectRuntime ? (connected ? `${chosen?.name || '项目'}的${projectSettings ? '设置' : '工作区'}尚未就绪。` : `正在打开${chosen?.name || '项目'}…`) : '正在打开工作台…'} <a href="#home">取消</a>
        </div>
      )}
      {needsRuntime && preparationError && !archived && (
        <div className="platform-surface-feedback" role="alert">
          {preparationError}
          {preparationError && (
            <button
              type="button"
              onClick={() => {
                cache.current.delete(projectId)
                setRuntimeError('')
                setRetry((value) => value + 1)
              }}
            >
              重试连接
            </button>
          )}
          <a href="#home">返回项目总览</a>
        </div>
      )}
      {data && (
        <Suspense fallback={null}>
          <PlatformNavigation
            data={data}
            projects={projects}
            active={needsProjectRuntime && connected}
            selectionOnly={projectSettings || selectionOnlyProjectId === data.project.id}
            settingsScope={projectSettings && connected ? scope : undefined}
            onSettingsScope={onSettingsScope}
            pending={Boolean(preparingWorkspace && connected)}
            canCreateWorkspace={
              route.tab === 'workspace' && connected && readyData === data && !unlinkedWorkspace
            }
            surface={
              route.view === 'project' && route.tab === 'activity' ? 'activity' : 'workspace'
            }
            onSelection={onWorkspaceSelection}
            onReady={setReadyData}
          />
          {!workbench && <PlatformAgentBridge data={data} onReady={setBridgeReadyData} />}
        </Suspense>
      )}
      {runtimeData && (workbench || globalSettings) && <Suspense fallback={null}><PlatformRuntimeNavigation data={runtimeData} projects={projects}
        active={workbench || globalSettings} workbench={workbench} entryRevision={acceptedRevision}
        settingsScope={globalSettings ? scope : undefined} onReady={onRuntimeReady} /></Suspense>}
      <div className="platform-project-content" hidden={!showWorkspace && !showSettings && !showWorkbench} inert={!showWorkspace && !showSettings && !showWorkbench}>
        <PlatformProjectContext.Provider
          value={connected && readyData === data && !unlinkedWorkspace ? data : null}
        >
          <PlatformProjectScopeContext.Provider value={projectScope}>
          <PlatformSettingsContext.Provider value={presentation}>
            <Suspense fallback={null}>
              {runtimeData && (
                <>
                  <App />
                  <WorkspaceMounted onReady={onAppMounted} />
                </>
              )}
            </Suspense>
          </PlatformSettingsContext.Provider>
          </PlatformProjectScopeContext.Provider>
        </PlatformProjectContext.Provider>
      </div>
    </div>
  )
}
