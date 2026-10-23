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

const App = lazy(() => import('../App'))
const PlatformNavigation = lazy(() => import('./platform-project-navigation-view'))

export default function PlatformProjectEntry(): React.JSX.Element {
  const [data, setData] = useState<PlatformProjectBootstrap | null>(null)
  const [error, setError] = useState('')
  const [route, setRoute] = useState(() => readPlatformRoute(window.location))
  const [projects, setProjects] = useState<PlatformProject[]>([])
  const [retry, setRetry] = useState(0)
  const cache = useRef(new Map<string, PlatformProjectBootstrap>())
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
  const onProjects = useCallback((rows: PlatformProject[]) => setProjects(rows), [])
  const projectId = route.view === 'project' ? route.id : ''
  const developing = route.view === 'project' && route.tab === 'workspace'
  const connected = data?.project.id === projectId && !error
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
    document.documentElement.dataset.platformView = developing && connected ? 'workspace' : 'studio'
    window.dispatchEvent(new Event('platform-surface-change'))
    return () => {
      delete document.documentElement.dataset.platformView
    }
  }, [developing, connected])
  useEffect(() => {
    if (!projectId) return
    setError('')
    const previous = cache.current.get(projectId)
    if (previous) {
      // An explicit return from the project list must reveal this project's worktree again.
      setData({ ...previous })
      return
    }
    const controller = new AbortController()
    let cancelled = false
    const timer = window.setTimeout(() => controller.abort(), 45_000)
    void (async () => {
      try {
        const result = await loadPlatformProjectBootstrap(projectId, controller.signal)
        if (cancelled) return
        await initWebDeviceKeySupport()
        if (cancelled) return
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
        cache.current.set(projectId, result)
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
  }, [projectId, retry])
  const chosen = projects.find((project) => project.id === projectId)
  return (
    <div className="platform-project-entry bg-background">
      {projectId && (
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
                ['review', '验收'],
                ['monitor', '协作监控']
              ] as const
            ).map(([tab, label]) => (
              <a
                key={tab}
                href={projectRoute(projectId, tab)}
                aria-current={route.tab === tab ? 'page' : undefined}
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
      <PlatformStudioSurface hidden={developing} onProjects={onProjects} />
      {developing && !connected && (
        <div className="platform-surface-feedback" role={error ? 'alert' : 'status'}>
          {error || '正在连接并恢复项目…'}
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
          <a href="#home">返回项目</a>
        </div>
      )}
      {data && (
        <Suspense fallback={null}>
          <PlatformNavigation
            data={data}
            projects={projects}
            active={developing && connected}
            onSelection={onWorkspaceSelection}
          />
        </Suspense>
      )}
      <div
        className="platform-project-content"
        hidden={!developing || !connected}
        inert={!developing || !connected}
      >
        <Suspense fallback={<div className="p-6">正在恢复工作区…</div>}>{data && <App />}</Suspense>
      </div>
    </div>
  )
}
