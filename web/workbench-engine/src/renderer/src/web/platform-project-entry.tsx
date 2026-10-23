import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { installWebPreloadApi } from './web-preload-api'
import { saveStoredWebRuntimeEnvironment } from './web-runtime-environment'
import { initWebDeviceKeySupport } from './web-device-key-support'
import './platform-project-entry.css'
import {
  createPlatformEnvironment,
  loadPlatformProjectBootstrap,
  type PlatformProjectBootstrap
} from './platform-project-bootstrap'
import PlatformStudioSurface, { type PlatformProject } from './platform-studio-surface'
import { readPlatformRoute, projectRoute } from './platform-route'
import { PlatformProjectContext } from './platform-project-context'

const App = lazy(() => import('../App'))
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
  const [retry, setRetry] = useState(0)
  const cache = useRef(
    new Map<string, { project: PlatformProject; data: PlatformProjectBootstrap }>()
  )
  const latestProjects = useRef<PlatformProject[]>([])
  const [projectsReady, setProjectsReady] = useState(false)
  const [readyData, setReadyData] = useState<PlatformProjectBootstrap | null>(null)
  const [appMounted, setAppMounted] = useState(false)
  const onAppMounted = useCallback(() => setAppMounted(true), [])
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
  const onProjects = useCallback((rows: PlatformProject[]) => {
    const previous = latestProjects.current
    latestProjects.current = rows
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
    if (
      current.view === 'project' &&
      previous.some((row) => row.id === current.id) &&
      !rows.some((row) => row.id === current.id)
    )
      window.location.hash = '#home'
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
  const projectId = route.view === 'project' ? route.id : ''
  const developing = route.view === 'project' && ['workspace', 'activity'].includes(route.tab)
  const chosen = projects.find((project) => project.id === projectId)
  const connected = Boolean(
    chosen &&
    data?.project.id === projectId &&
    data.project.name === chosen.name &&
    cache.current.get(projectId)?.project.directory === chosen.directory &&
    !error
  )
  const showWorkspace = developing && connected && appMounted
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
        next.tab !== 'workspace'
      ) {
        window.history.replaceState(null, '', acceptedHash.current)
        setNavigationNotice('当前开发目录未关联登记项目，请先从项目选择器选择项目。')
        return
      }
      const studio = document.querySelector('.platform-studio-host')?.shadowRoot
      const dialogs = [
        ...document.querySelectorAll(
          '[role="dialog"], [role="alertdialog"], [role="menu"], dialog[open]'
        ),
        ...(studio?.querySelectorAll('dialog[open]') || [])
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
  useLayoutEffect(() => {
    if (!projectId || !projectsReady) return
    if (!chosen) {
      setError('项目已归档或不存在，请返回项目总览。')
      return
    }
    setError('')
    const previous = cache.current.get(projectId)
    if (previous) {
      // An explicit return from the project list must reveal this project's worktree again.
      setData({ ...previous.data })
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
        setData(result)
      } catch {
        if (!cancelled)
          setError(
            '项目工作区未能连接。请确认本地服务正在运行，再重新加载；已有会话状态需在恢复连接后核对。'
          )
      } finally {
        window.clearTimeout(timer)
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [projectId, retry, projectsReady, chosen?.name, chosen?.directory])
  useEffect(() => {
    if (connected && chosen) document.title = `${chosen.name} · 掌控一切`
  }, [connected, chosen?.name])
  return (
    <div className="platform-project-entry bg-background">
      {projectId && (!developing || showWorkspace || error) && (
        <nav className="platform-project-tabs" aria-label="项目工作区导航">
          <a href="#home" className="platform-project-back">
            ‹ 项目
          </a>
          <label className="platform-project-picker">
            <span className="sr-only">切换项目</span>
            <select
              aria-label="切换项目"
              value={developing && unlinkedWorkspace ? '' : projectId}
              onChange={(event) => {
                const id = event.target.value
                if (id === projectId && unlinkedWorkspace) {
                  cache.current.delete(id)
                  setRetry((value) => value + 1)
                } else window.location.hash = projectRoute(id)
              }}
            >
              {developing && unlinkedWorkspace && (
                <option value="" disabled>
                  未关联的开发目录
                </option>
              )}
              {!chosen && (
                <option value={projectId}>{connected ? data!.project.name : '项目工作区'}</option>
              )}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <div className="platform-project-tablist">
            {(
              [
                ['workspace', '开发'],
                ['tasks', '事项'],
                ['activity', '活动']
              ] as const
            ).map(([tab, label]) => (
              <a
                key={tab}
                href={projectRoute(projectId, tab)}
                aria-current={
                  route.tab === tab ||
                  (tab === 'tasks' && ['review', 'attention', 'monitor'].includes(route.tab))
                    ? 'page'
                    : undefined
                }
                aria-disabled={
                  developing && unlinkedWorkspace && tab !== 'workspace' ? true : undefined
                }
                onClick={(event) => {
                  if (developing && unlinkedWorkspace && tab !== 'workspace') {
                    event.preventDefault()
                    setNavigationNotice('当前开发目录未关联登记项目，请先从项目选择器选择项目。')
                  }
                }}
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
      <PlatformStudioSurface hidden={showWorkspace} pending={developing && !showWorkspace && !error} onProjects={onProjects} />
      {developing && !showWorkspace && !error && (
        <div className="platform-navigation-notice" role="status">
          正在打开{chosen?.name || '项目'}… <a href="#home">取消</a>
        </div>
      )}
      {developing && !connected && error && (
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
            canCreateWorkspace={route.tab === 'workspace' && connected && readyData === data && !unlinkedWorkspace}
            surface={
              route.view === 'project' && route.tab === 'activity' ? 'activity' : 'workspace'
            }
            onSelection={onWorkspaceSelection}
            onReady={setReadyData}
          />
          <PlatformAgentBridge data={data} />
        </Suspense>
      )}
      <div
        className="platform-project-content"
        hidden={!showWorkspace}
        inert={!showWorkspace}
      >
        <PlatformProjectContext.Provider
          value={connected && readyData === data && !unlinkedWorkspace ? data : null}
        >
          <Suspense fallback={null}>
            {data && <><App /><WorkspaceMounted onReady={onAppMounted} /></>}
          </Suspense>
        </PlatformProjectContext.Provider>
      </div>
    </div>
  )
}
