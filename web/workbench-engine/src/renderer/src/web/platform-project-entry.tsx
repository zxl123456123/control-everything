import { Suspense, useEffect, useState } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { installWebPreloadApi } from './web-preload-api'
import { saveStoredWebRuntimeEnvironment } from './web-runtime-environment'
import { initWebDeviceKeySupport } from './web-device-key-support'
import './platform-project-entry.css'
import {
  createPlatformEnvironment,
  loadPlatformProjectBootstrap,
  readPlatformProjectId,
  type PlatformProjectBootstrap
} from './platform-project-bootstrap'

const App = lazy(() => import('../App'))
const PlatformNavigation = lazy(() => import('./platform-project-navigation-view'))

export default function PlatformProjectEntry(): React.JSX.Element {
  const [data, setData] = useState<PlatformProjectBootstrap | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    const timer = window.setTimeout(() => controller.abort(), 45_000)
    void (async () => {
      try {
        const projectId = readPlatformProjectId(window.location.search)
        const result = await loadPlatformProjectBootstrap(projectId, controller.signal)
        if (cancelled) return
        await initWebDeviceKeySupport()
        if (cancelled) return
        saveStoredWebRuntimeEnvironment(createPlatformEnvironment(result))
        installWebPreloadApi()
        document.title = `${result.project.name} · 掌控一切`
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
  }, [])
  if (!data)
    return (
      <main className="flex min-h-dvh flex-col items-start gap-4 bg-background p-8 text-foreground">
        <h1 className="text-lg font-medium">项目工作区</h1>
        <p role={error ? 'alert' : 'status'}>{error || '正在连接并恢复项目…'}</p>
        <a href="/studio" className="underline">
          返回工作台
        </a>
        {error && (
          <button
            type="button"
            className="rounded border px-3 py-2"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
        )}
      </main>
    )
  return (
    <div className="platform-project-entry bg-background">
      <Suspense
        fallback={
          <div className="platform-project-navigation-loading border-b px-4 py-2">
            <a href="/studio">返回工作台</a>
          </div>
        }
      >
        <PlatformNavigation data={data} />
      </Suspense>
      <div className="platform-project-content">
        <Suspense fallback={<div className="p-6">正在恢复工作区…</div>}>
          <App />
        </Suspense>
      </div>
    </div>
  )
}
