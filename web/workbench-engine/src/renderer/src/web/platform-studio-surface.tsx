import { useEffect, useRef, useState } from 'react'

export type PlatformProject = { id: string; name: string; directory?: string }
type StudioWindow = Window & {
  StudioPreview?: {
    mount(
      root: HTMLElement,
      options: { onProjects: (projects: PlatformProject[]) => void }
    ): () => void
  }
}
const scripts = [
  '/onboarding.js',
  '/execution.js',
  '/task-center.js',
  '/monitor-art.js',
  '/monitor-scene.js',
  '/monitor-model.js',
  '/project-monitor.js',
  '/project-space.js',
  '/agents.js',
  '/studio-data.js',
  '/studio-preview.js'
]
let modules: Promise<void> | null = null
function loadModules(): Promise<void> {
  if (!modules)
    modules = Promise.all(
      scripts.map(
        (src) =>
          new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            // Download together while preserving the existing dependency order.
            script.async = false
            script.src = src
            script.onload = () => resolve()
            script.onerror = () => {
              script.remove()
              reject(new Error('工作台资源加载失败，请重新加载页面。'))
            }
            document.head.append(script)
          })
      )
    ).then(() => undefined)
      .catch((error) => {
        modules = null
        throw error
      })
  return modules
}

export default function PlatformStudioSurface({
  hidden,
  pending = false,
  onProjects
}: {
  hidden: boolean
  pending?: boolean
  onProjects: (projects: PlatformProject[]) => void
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let disposed = false
    let dispose: (() => void) | undefined
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 30_000)
    void (async () => {
      const [response] = await Promise.all([
        fetch('/studio-shell', { signal: controller.signal, credentials: 'same-origin' }),
        loadModules()
      ])
      if (!response.ok) throw new Error('工作台暂不可用，请重新加载页面。')
      const html = new DOMParser().parseFromString(await response.text(), 'text/html')
      const root = html.getElementById('ce-studio')
      if (!root || !(window as StudioWindow).StudioPreview)
        throw new Error('工作台资源不完整，请重新加载页面。')
      if (disposed || !host.current) return
      const shadow = host.current.shadowRoot || host.current.attachShadow({ mode: 'open' })
      shadow.replaceChildren()
      // Keep native editing keys inside this surface; app capture shortcuts are gated separately.
      const stopKeyboardBubble = (event: Event) => event.stopPropagation()
      shadow.addEventListener('keydown', stopKeyboardBubble)
      shadow.addEventListener('keyup', stopKeyboardBubble)
      const styles = ['/workspace.css', '/project-monitor.css', '/studio-preview.css'].map(
        (href) =>
          new Promise<void>((resolve, reject) => {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = href
            link.onload = () => resolve()
            link.onerror = () => reject(new Error('工作台样式加载失败，请重新加载页面。'))
            shadow.append(link)
          })
      )
      await Promise.all(styles)
      if (disposed) return
      root.dataset.unified = 'true'
      const syncTheme = () => {
        root.dataset.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      }
      syncTheme()
      const themeObserver = new MutationObserver(syncTheme)
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      })
      shadow.append(root)
      const unmount = (window as StudioWindow).StudioPreview!.mount(root, { onProjects })
      dispose = () => {
        unmount()
        themeObserver.disconnect()
        shadow.removeEventListener('keydown', stopKeyboardBubble)
        shadow.removeEventListener('keyup', stopKeyboardBubble)
      }
      setReady(true)
    })()
      .catch((error) => {
        if (!disposed) setError(error.message)
      })
      .finally(() => window.clearTimeout(timer))
    return () => {
      disposed = true
      controller.abort()
      window.clearTimeout(timer)
      dispose?.()
    }
  }, [onProjects])
  return (
    <section className="platform-studio-surface" hidden={hidden} inert={pending && ready} aria-label="项目与事项">
      {!ready && (
        <div className="platform-surface-feedback" role={error ? 'alert' : 'status'}>
          {error || '正在打开项目工作台…'}
          {error && (
            <button type="button" onClick={() => window.location.reload()}>
              重新加载
            </button>
          )}
        </div>
      )}
      <div ref={host} className="platform-studio-host" />
    </section>
  )
}
