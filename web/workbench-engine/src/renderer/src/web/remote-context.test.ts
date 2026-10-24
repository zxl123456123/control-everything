import { afterEach, beforeEach, expect, it, vi } from 'vitest'

let context = 'A'.repeat(32)
let scope = 'a'.repeat(64)
const values = new Map<string, string>()
const events = new Map<string, (event: {key: string; newValue?: string}) => void>()
beforeEach(() => {
  vi.resetModules()
  values.clear()
  events.clear()
  context = 'A'.repeat(32)
  scope = 'a'.repeat(64)
  const storage = {
    get length() {
      return values.size
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear()
  }
  vi.stubGlobal('document', {
    querySelector: (selector: string) => ({
      content: selector.includes('ce-remote-context') ? context : scope
    })
  })
  vi.stubGlobal('navigator', {userAgent:'Windows'})
  vi.stubGlobal('window', {
    addEventListener:(key: string, callback: (event: {key: string; newValue?: string}) => void) => events.set(key,callback),
    removeEventListener:(key: string) => events.delete(key),
    clearTimeout, clearInterval, setTimeout, setInterval,
    location: {
      href: 'https://workbench.example.test/studio',
      origin: 'https://workbench.example.test'
    },
    localStorage: storage,
    sessionStorage: storage
  })
})
afterEach(() => vi.unstubAllGlobals())

it('freezes page identity before the first read and never imports legacy or another account values', async () => {
  values.set('orca.web.settings.v1', 'legacy-private')
  values.set(`ce.remote.${'b'.repeat(64)}.orca.web.settings.v1`, 'other-private')
  const { browserStorage, remoteContext } = await import('./remote-context')
  expect(browserStorage('localStorage').getItem('orca.web.settings.v1')).toBeNull()
  browserStorage('localStorage').setItem('draft', 'own')
  scope = 'b'.repeat(64)
  context = 'B'.repeat(32)
  expect(remoteContext()?.context).toBe('A'.repeat(32))
  expect(browserStorage('localStorage').length).toBe(1)
  expect(browserStorage('localStorage').key(0)).toBe('draft')
  browserStorage('localStorage').clear()
  expect(values.get('orca.web.settings.v1')).toBe('legacy-private')
  expect(values.get(`ce.remote.${'b'.repeat(64)}.orca.web.settings.v1`)).toBe('other-private')
})

it('adds context only to same origin requests including the first bootstrap, preserving method and CSRF', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetcher)
  const { contextFetch } = await import('./remote-context')
  await contextFetch('/api/bootstrap')
  expect(new Headers(fetcher.mock.calls[0][1].headers).get('X-CE-Context')).toBe(context)
  await contextFetch('/api/workbench/bootstrap', {
    method: 'POST',
    headers: { 'X-Session-CSRF': 'csrf' },
    body: '{}'
  })
  expect(new Headers(fetcher.mock.calls[1][1].headers).get('X-Session-CSRF')).toBe('csrf')
  expect(fetcher.mock.calls[1][1].method).toBe('POST')
  await contextFetch('https://external.example.test/image.png')
  expect(fetcher.mock.calls[2][1]?.headers).toBeUndefined()
  await contextFetch('blob:https://workbench.example.test/image')
  expect(fetcher.mock.calls[3][1]?.headers).toBeUndefined()
})

it('accepts only the protected same origin WS and exact single web/context query', async () => {
  const { remoteWebSocketEndpoint } = await import('./remote-context')
  expect(remoteWebSocketEndpoint('wss://workbench.example.test/workbench-runtime')).toContain(
    'ce_context=' + context
  )
  for (const endpoint of [
    'ws://127.0.0.1:9876',
    'wss://other.test/workbench-runtime',
    'wss://workbench.example.test/other',
    'wss://workbench.example.test/workbench-runtime?orca-client=web&orca-client=web',
    'wss://workbench.example.test/workbench-runtime?ce_context=other',
    'wss://workbench.example.test/workbench-runtime?unexpected=1'
  ]) {
    expect(() => remoteWebSocketEndpoint(endpoint)).toThrow()
  }
})

it('rejects incomplete metadata instead of falling back to unpartitioned local mode', async () => {
  scope = ''
  const { browserStorage } = await import('./remote-context')
  expect(() => browserStorage('localStorage')).toThrow('remote_context_invalid')
})

it('opens composer drafts in the scoped database, never the legacy database', async () => {
  const { createIndexedDbNativeChatComposerDraftStorage } =
    await import('../components/native-chat/native-chat-composer-draft-indexeddb')
  const request = { error: new Error('synthetic database failure') } as IDBOpenDBRequest
  const open = vi.fn(() => request)
  const storage = createIndexedDbNativeChatComposerDraftStorage({ open } as unknown as IDBFactory)
  const rejected = expect(storage.loadAll()).rejects.toThrow('synthetic database failure')
  expect(open).toHaveBeenCalledWith(`ce.remote.${scope}.orca-native-chat-composer-drafts`, 1)
  request.onerror?.call(request, new Event('error'))
  await rejected
})

it('retires admitted late responses, bodies, storage and WS permanently after denial', async () => {
  const api = await import('./remote-context')
  let release!: (value: Response) => void
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve=>{release=resolve}))
    .mockResolvedValueOnce({status:401,ok:false})
  vi.stubGlobal('fetch',fetcher)
  let rendered = false
  const pending = api.contextFetch('/api/workspace').then(r=>r.json()).then(()=>{rendered=true})
  const rejected=expect(pending).rejects.toThrow('remote_context_inactive')
  const stop=vi.fn(); api.onContextInactive(stop)
  expect((await api.contextFetch('/api/bootstrap')).status).toBe(401)
  release({status:200,json:async()=>({private:'late'})} as Response)
  await rejected
  expect(rendered).toBe(false); expect(stop).toHaveBeenCalledTimes(1)
  api.invalidateContext(); expect(stop).toHaveBeenCalledTimes(1)
  expect(()=>api.browserStorage('localStorage').setItem('draft','late')).toThrow('remote_context_inactive')
  expect(()=>api.remoteWebSocketEndpoint('wss://workbench.example.test/workbench-runtime')).toThrow('remote_context_inactive')
  await expect(api.contextFetch('/api/workspace')).rejects.toThrow('remote_context_inactive')
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it.each(['json','text','blob'] as const)('guards delayed %s after Response already arrived', async body => {
  const api=await import('./remote-context')
  let release!: (value: unknown)=>void
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({status:200,[body]:()=>new Promise(resolve=>{release=resolve})}))
  const response=await api.contextFetch('/api/workspace')
  const rejected=expect(response[body]()).rejects.toThrow('remote_context_inactive')
  api.invalidateContext(); release('private'); await rejected
})
it('shares the actual plain helper one-way state on the same page', async()=>{
  const {readFileSync}=await import('node:fs')
  const {runInNewContext}=await import('node:vm')
  Object.assign(window,{document,fetch:vi.fn()})
  runInNewContext(readFileSync('../workspace/remote-context.js','utf8'),{window,Headers,Request,URL})
  const plain=(window as unknown as {CERemoteContext:{invalidate:()=>void;active:boolean}}).CERemoteContext
  const api=await import('./remote-context');const stopped=vi.fn()
  api.onContextInactive(stopped);plain.invalidate()
  expect(stopped).toHaveBeenCalledTimes(1)
  expect(()=>api.assertContextActive()).toThrow('remote_context_inactive')
  api.invalidateContext();expect(plain.active).toBe(false)
})
it.each([true,false])('keybinding storage events use the actual current key (remote=%s)',async remote=>{
  if(!remote){context='';scope=''}
  const {createWebKeybindingsApi}=await import('./preload-api/web-keybindings-api')
  const {KEYBINDINGS_STORAGE_KEY}=await import('./preload-api/web-storage')
  const {storageKey}=await import('./remote-context')
  const callback=vi.fn(); const unsubscribe=createWebKeybindingsApi().onChanged(callback)
  const actual=storageKey(KEYBINDINGS_STORAGE_KEY)
  events.get('storage')!({key:`ce.remote.${'b'.repeat(64)}.${KEYBINDINGS_STORAGE_KEY}`})
  expect(callback).not.toHaveBeenCalled()
  events.get('storage')!({key:actual})
  expect(callback).toHaveBeenCalledTimes(1)
  unsubscribe()
})
it('cross-tab account changes retire a page and local mode remains active',async()=>{
  const api=await import('./remote-context');api.assertContextActive()
  events.get('storage')!({key:'ce.remote.session-change',newValue:'opaque-change'})
  expect(()=>api.assertContextActive()).toThrow('remote_context_inactive')
  // Reinitializing imports cannot revive the shared inactive state.
  vi.resetModules();const again=await import('./remote-context')
  expect(()=>again.assertContextActive()).toThrow('remote_context_inactive')
})

it('retirement closes an existing transport and rejects pending RPC without reconnecting',async()=>{
  vi.doMock('./web-paired-e2ee-primitives',()=>({WEB_PAIRED_E2EE_PRIMITIVES:{publicKeyFromBase64:()=>new Uint8Array(32)}}))
  const {WebRuntimeConnectionTransport}=await import('./web-runtime-connection-transport')
  const opening=vi.spyOn(WebRuntimeConnectionTransport.prototype as unknown as {openConnection:()=>void},'openConnection').mockImplementation(()=>{})
  const api=await import('./remote-context')
  const transport=new WebRuntimeConnectionTransport({endpoint:'wss://workbench.example.test/workbench-runtime',hostPublicKeyB64:'synthetic',credential:{kind:'token',deviceToken:'synthetic'}},{now:()=>0,isDocumentVisible:()=>true})
  const socket={close:vi.fn()} as unknown as WebSocket
  transport.ws=socket
  const rejected=vi.fn()
  transport.requestRegistry.pending.set('request',{method:'status.get',resolve:vi.fn(),reject:rejected,timeout:0})
  api.invalidateContext()
  expect(socket.close).toHaveBeenCalledTimes(1)
  expect(rejected).toHaveBeenCalledTimes(1)
  expect(transport.state).toBe('disconnected');expect(transport.ws).toBeNull()
  expect(()=>transport.call('status.get',{})).toThrow('remote_context_inactive')
  expect(opening).toHaveBeenCalledTimes(1)
  opening.mockRestore();vi.doUnmock('./web-paired-e2ee-primitives')
})
it('draft storage cannot start a transaction after its delayed open completes on an inactive page',async()=>{
  const api=await import('./remote-context')
  const {createIndexedDbNativeChatComposerDraftStorage}=await import('../components/native-chat/native-chat-composer-draft-indexeddb')
  const transaction=vi.fn()
  const request={result:{transaction}} as unknown as IDBOpenDBRequest
  const storage=createIndexedDbNativeChatComposerDraftStorage({open:()=>request} as unknown as IDBFactory)
  const pending=storage.remove(['private-draft']);const rejected=expect(pending).rejects.toThrow('remote_context_inactive')
  api.invalidateContext();request.onsuccess?.call(request,new Event('success'))
  await rejected;expect(transaction).not.toHaveBeenCalled()
})

it('detects account changes even when a suspended tab missed the storage event',async()=>{
  const api=await import('./remote-context');api.assertContextActive()
  values.set('ce.remote.session-change','new-session-without-event')
  expect(()=>api.assertContextActive()).toThrow('remote_context_inactive')
})

it('drops delayed binary RPC payloads before subscription consumption after a missed account notification',async()=>{
  const {routeWebRuntimeConnectionFrame}=await import('./web-runtime-connection-frame-router')
  const api=await import('./remote-context');api.assertContextActive()
  let release!: (value: ArrayBuffer)=>void
  const body=new Blob(['private'])
  vi.spyOn(body,'arrayBuffer').mockImplementation(()=>new Promise(resolve=>{release=resolve}))
  const onBinary=vi.fn(),openBinary=vi.fn(()=>new Uint8Array([1]))
  const context={getState:()=> 'connected',getHandshake:()=>({channel:{openBinary}}),getSocket:()=>undefined,
    pending:new Map(),subscriptions:new Map([['subscription',{callbacks:{onBinary}}]]),sendAuth:vi.fn(),setConnected:vi.fn(),authRejected:vi.fn()}
  const pending=routeWebRuntimeConnectionFrame(body,undefined,context as unknown as Parameters<typeof routeWebRuntimeConnectionFrame>[2])
  values.set('ce.remote.session-change','new-session-without-event');release(new ArrayBuffer(8));await pending
  expect(openBinary).not.toHaveBeenCalled();expect(onBinary).not.toHaveBeenCalled()
})
