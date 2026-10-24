/** The trusted meta is installed synchronously, before importing any application modules. */
type PageContext = { context: string; scope: string } | null
let initialized = false
let page: PageContext = null

export function remoteContext(): PageContext {
  if (!initialized) {
    const context =
      typeof document === 'undefined'
        ? null
        : document.querySelector?.<HTMLMetaElement>('meta[name="ce-remote-context"]')?.content
    const scope =
      typeof document === 'undefined'
        ? null
        : document.querySelector?.<HTMLMetaElement>('meta[name="ce-storage-scope"]')?.content
    if (
      (context || scope) &&
      (!/^[A-Za-z0-9_-]{32}$/.test(context ?? '') || !/^[a-f0-9]{64}$/.test(scope ?? ''))
    ) {
      throw new Error('remote_context_invalid')
    }
    page = context && scope ? Object.freeze({ context, scope }) : null
    initialized = true
  }
  return page
}

type PageState = { active: boolean; notice?: string | null; listeners: Set<() => void> }
type ContextWindow = Window & { CERemotePageState?: PageState }
function sessionNotice(): string | null | undefined {
  try { return window.localStorage.getItem('ce.remote.session-change') } catch { return undefined }
}
function pageState(): PageState {
  const host = window as ContextWindow
  if (!host.CERemotePageState) {
    host.CERemotePageState = { active: true, notice: sessionNotice(), listeners: new Set() }
    host.addEventListener?.('storage', (event) => {
      if (event.key === 'ce.remote.session-change' && event.newValue) invalidateContext()
    })
  }
  return host.CERemotePageState
}
export function assertContextActive(): void {
  if (!remoteContext()) return
  const state = pageState()
  if (state.active && state.notice !== sessionNotice()) invalidateContext()
  if (!state.active) throw new Error('remote_context_inactive')
}
export function onContextInactive(callback: () => void): () => void {
  if (!remoteContext()) return () => {}
  const state = pageState()
  if (!state.active) { callback(); return () => {} }
  state.listeners.add(callback)
  return () => { state.listeners.delete(callback) }
}
export function invalidateContext(): void {
  if (!remoteContext()) return
  const state = pageState()
  if (!state.active) return
  state.active = false
  for (const listener of [...state.listeners]) {
    try { listener() } catch { /* Stop every consumer. */ }
  }
  state.listeners.clear()
}
function guardedResponse(response: Response): Response {
  return new Proxy(response, { get(target, key) {
    if (key === 'clone') return () => { assertContextActive(); return guardedResponse(target.clone()) }
    const value = Reflect.get(target, key, target)
    if (['json', 'text', 'blob', 'arrayBuffer', 'formData', 'bytes'].includes(String(key)) && typeof value === 'function') {
      return async (...args: unknown[]) => {
        assertContextActive()
        const result = await value.apply(target, args)
        assertContextActive()
        return result
      }
    }
    return typeof value === 'function' ? value.bind(target) : value
  } })
}

export function storageKey(key: string): string {
  const context = remoteContext()
  return context ? `ce.remote.${context.scope}.${key}` : key
}

export function browserStorage(kind: 'localStorage' | 'sessionStorage'): Storage {
  const original = (typeof window === 'undefined' ? undefined : window[kind]) ?? globalThis[kind]
  if (!remoteContext()) return original
  const prefix = storageKey('')
  const keys = (): string[] => {
    assertContextActive()
    return Array.from({ length: original.length }, (_, index) => original.key(index)).filter(
      (key): key is string => !!key?.startsWith(prefix)
    )
  }
  return {
    get length() {
      return keys().length
    },
    key: (index) => keys()[index]?.slice(prefix.length) ?? null,
    getItem: (key) => { assertContextActive(); return original.getItem(prefix + key) },
    setItem: (key, value) => { assertContextActive(); original.setItem(prefix + key, value) },
    removeItem: (key) => { assertContextActive(); original.removeItem(prefix + key) },
    clear: () => keys().forEach((key) => original.removeItem(key))
  }
}

export const contextFetch: typeof fetch = async (input, init?: RequestInit) => {
  assertContextActive()
  const page = remoteContext()
  if (!page) return init === undefined ? fetch(input) : fetch(input, init)
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    window.location.href
  )
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin)
    return init === undefined ? fetch(input) : fetch(input, init)
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined)
  )
  headers.set('X-CE-Context', page.context)
  const response = await fetch(input, { ...init, headers })
  if (response.status === 401 || response.status === 403) invalidateContext()
  else assertContextActive()
  return guardedResponse(response)
}

export function remoteWebSocketEndpoint(endpoint: string): string {
  assertContextActive()
  const page = remoteContext()
  if (!page) return endpoint
  const url = new URL(endpoint)
  if (
    url.origin !== window.location.origin.replace(/^https:/, 'wss:') ||
    url.pathname !== '/workbench-runtime' ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error('remote_endpoint_rejected')
  }
  const params = url.searchParams
  if (
    [...params.keys()].some((key) => !['orca-client', 'ce_context'].includes(key)) ||
    params.getAll('orca-client').length > 1 ||
    params.getAll('ce_context').length > 1 ||
    (params.has('orca-client') && params.get('orca-client') !== 'web') ||
    (params.has('ce_context') && params.get('ce_context') !== page.context)
  ) {
    throw new Error('remote_query_rejected')
  }
  params.set('orca-client', 'web')
  params.set('ce_context', page.context)
  return url.href
}
