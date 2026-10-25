import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { saveStoredWebRuntimeEnvironment } from './web-runtime-environment'
import { initWebDeviceKeySupport } from './web-device-key-support'
import './platform-project-entry.css'
import {
  createPlatformEnvironment,
  loadPlatformProjectBootstrap,
  type PlatformProjectBootstrap
} from './platform-project-bootstrap'
import PlatformStudioSurface, {
  type PlatformProject,
  type PlatformProjectsListener
} from './platform-studio-surface'
import { readPlatformRoute, projectRoute } from './platform-route'
import { PlatformProjectContext, PlatformProjectScopeContext } from './platform-project-context'

const App = lazy(() => import('./platform-workspace-app'))
const PlatformNavigation = lazy(() => import('./platform-project-navigation-view'))
const PlatformAgentBridge = lazy(() => import('./platform-agent-bridge'))

function WorkspaceMounted({ onReady }: { onReady: () => void }): null {
  useLayoutEffect(onReady, [onReady])
  return null
}

export default function PlatformProjectEntry(): React.JSX.Element {
  const [data, setData] = useState<PlatformProjectBootstrap | null>(null)
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
  const pendingAgentRequest = useRef<{ projectId: string; taskId: string } | null>(null)
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
    () => ({ projects, executionHostId: data ? `runtime:${data.runtime.environmentId}` : '' }),
    [projects, data?.runtime.environmentId]
  )
  const projectId = route.view === 'project' ? route.id : ''
  const previousProjectId = useRef(projectId)
  const pendingProjectReveal = useRef(false)
  const currentData = data?.project.id === projectId ? data : null
  const developing = route.view === 'project' && ['workspace', 'activity'].includes(route.tab)
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
  const preparingWorkspace = developing && !showWorkspace && !error && !archived
  useEffect(() => {
    const changed = () => {
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
      acceptedHash.current = window.location.hash
      if (
        pendingAgentRequest.current &&
        (next.id !== pendingAgentRequest.current.projectId || next.tab !== 'workspace')
      )
        pendingAgentRequest.current = null
      setNavigationNotice('')
      setRoute(readPlatformRoute(window.location))
    }
    window.addEventListener('hashchange', changed)
    return () => window.removeEventListener('hashchange', changed)
  }, [])
  useLayoutEffect(() => {
    document.documentElement.dataset.platformView = showWorkspace ? 'workspace' : 'studio'
    window.dispatchEvent(new Event('platform-surface-change'))
    return () => {
      delete document.documentElement.dataset.platformView
    }
  }, [showWorkspace])
  useEffect(() => {
    const receive = (event: Event) => {
      const request = (event as CustomEvent<{ projectId: string; taskId: string }>).detail
      const current = readPlatformRoute(window.location)
      if (
        !request ||
        typeof request.taskId !== 'string' ||
        !request.taskId ||
        current.view !== 'project' ||
        (current.id !== request.projectId && current.tab !== 'tasks') ||
        !latestProjects.current.some((project) => project.id === request.projectId)
      )
        return
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
      pendingAgentRequest.current = request
      window.location.hash = projectRoute(request.projectId)
    }
    window.addEventListener('platform-start-task-agent', receive, true)
    return () => window.removeEventListener('platform-start-task-agent', receive, true)
  }, [data, bridgeReadyData])
  useEffect(() => {
    const request = pendingAgentRequest.current
    if (!request || !showWorkspace || readyData !== data || bridgeReadyData !== data) return
    pendingAgentRequest.current = null
    const current = readPlatformRoute(window.location)
    if (current.id === request.projectId && current.tab === 'workspace')
      window.dispatchEvent(
        new CustomEvent('platform-start-task-agent', { cancelable: true, detail: request })
      )
  }, [showWorkspace, readyData, bridgeReadyData, data])
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
    if (!developing) return
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
        const [result, { installWebPreloadApi }] = await Promise.all([
          loadPlatformProjectBootstrap(projectId, controller.signal),
          import('./web-preload-api')
        ])
        if (cancelled || !isCurrentProject()) return
        await initWebDeviceKeySupport()
        if (cancelled || !isCurrentProject()) return
        if (
          environment.current &&
          (environment.current !== result.runtime.environmentId ||
            endpoint.current !== result.runtime.offer.endpoint)
        )
          throw new Error('运行组件已变化，请重新加载页面。')
        if (!environment.current) {
          saveStoredWebRuntimeEnvironment(createPlatformEnvironment(result))
          installWebPreloadApi()
          environment.current = result.runtime.environmentId
          endpoint.current = result.runtime.offer.endpoint
        }
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
  }, [projectId, developing, retry, projectsReady, chosen?.name, chosen?.directory, archived?.id])
  useEffect(() => {
    if (archived) document.title = `${archived.name} · 掌控一切`
    else if (chosen) document.title = `${chosen.name} · 掌控一切`
  }, [connected, chosen?.name, archived?.name])
  return (
    <div className="platform-project-entry bg-background">
      {projectId && (
        <nav className="platform-project-tabs" aria-label="项目工作区导航">
          <a href="#home" className="platform-project-back">
            ‹ 项目
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
                ['tasks', '事项']
              ] as const
            ).map(([tab, label]) => (
              <a
                key={tab}
                href={projectRoute(projectId, tab)}
                aria-current={
                  route.tab === tab ||
                  (tab === 'workspace' && route.tab === 'activity') ||
                  (tab === 'tasks' && ['review', 'attention', 'monitor'].includes(route.tab))
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
      <PlatformStudioSurface
        hidden={showWorkspace}
        pending={Boolean(developing && !showWorkspace && !archived)}
        onProjects={onProjects}
      />
      {preparingWorkspace && (
        <div className="platform-navigation-notice" role="status">
          {connected ? `${chosen?.name || '项目'}的工作区尚未就绪。` : `正在打开${chosen?.name || '项目'}…`} <a href="#home">取消</a>
        </div>
      )}
      {developing && !connected && error && !archived && (
        <div className="platform-surface-feedback" role={error ? 'alert' : 'status'}>
          {error}
          {error && (
            <button
              type="button"
              onClick={() => {
                cache.current.delete(projectId)
                setRetry((value) => value + 1)
              }}
            >
              重试连接
            </button>
          )}
          {error && <a href="#home">返回项目</a>}
        </div>
      )}
      {data && (
        <Suspense fallback={null}>
          <PlatformNavigation
            data={data}
            projects={projects}
            active={developing && connected}
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
          <PlatformAgentBridge data={data} onReady={setBridgeReadyData} />
        </Suspense>
      )}
      <div className="platform-project-content" hidden={!showWorkspace} inert={!showWorkspace}>
        <PlatformProjectContext.Provider
          value={connected && readyData === data && !unlinkedWorkspace ? data : null}
        >
          <PlatformProjectScopeContext.Provider value={projectScope}>
            <Suspense fallback={null}>
              {data && (
                <>
                  <App />
                  <WorkspaceMounted onReady={onAppMounted} />
                </>
              )}
            </Suspense>
          </PlatformProjectScopeContext.Provider>
        </PlatformProjectContext.Provider>
      </div>
    </div>
  )
}
