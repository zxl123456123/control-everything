// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeRpcResponse } from '../../../../shared/runtime-rpc-envelope'

const fixture = vi.hoisted(() => ({
  active: true,
  environment: { id: '11111111-1111-4111-8111-111111111111', createdAt: 1, pairingRevision: 1, runtimeId: 'runtime-a' },
  client: { connectionEpoch: 1, call: vi.fn() },
  disconnected: new Set<string>(),
  fetch: vi.fn()
}))
vi.mock('../remote-context', () => ({
  assertContextActive: () => { if (!fixture.active) throw new Error('remote_context_inactive') },
  contextFetch: (...args: unknown[]) => fixture.fetch(...args)
}))
vi.mock('./web-runtime-session', () => ({
  getClientForEnvironment: () => fixture.client,
  manuallyDisconnectedEnvironmentIds: fixture.disconnected,
  manuallyDisconnectedResponse: () => ({ ok: false }),
  requireActiveEnvironment: () => fixture.environment,
  resolveEnvironment: () => fixture.environment,
  runtimeCallQueuePool: { enqueue: (_id: string, _method: string, run: () => unknown) => run() },
  updateEnvironmentFromResponse: (_environment: unknown, response: RuntimeRpcResponse<unknown>) => {
    if (response.ok) fixture.environment.runtimeId = response._meta.runtimeId
  }
}))
import { callEnvironmentEnvelope, callRuntimeEnvelope } from './web-runtime-calls'

const listeners: EventListener[] = []
function listen(accept: (event: CustomEvent<{ projectId: string; waitUntil: (result: Promise<boolean>) => void }>) => void) {
  const listener = accept as EventListener
  window.addEventListener('platform-native-project-adopted', listener)
  listeners.push(listener)
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const nativeReply = () => ({
  id: 'native-result', ok: true as const,
  result: { repo: { id: 'native-repo', path: '/projects/existing', displayName: 'Existing', addedAt: 1, badgeColor: 'blue' } },
  _meta: { runtimeId: 'runtime-a' }
})
const adoptedReply = () => ({
  status: 'adopted', project: { id: 'p-one', name: 'Existing' }, target: { repoId: 'native-repo' },
  runtime: { environmentId: fixture.environment.id, runtimeId: 'runtime-a' }
})
const entries = [
  { name: 'active environment', call: (method: string) => callRuntimeEnvelope(method, { path: '/projects/existing' }) },
  { name: 'explicit environment', call: (method: string) => callEnvironmentEnvelope(fixture.environment.id, method, { path: '/projects/existing' }, 15_000, 1) }
]
beforeEach(() => {
  window.history.replaceState(null, '', '/studio')
  fixture.active = true
  fixture.environment.pairingRevision = 1
  fixture.environment.runtimeId = 'runtime-a'
  fixture.client.connectionEpoch = 1
  fixture.disconnected.clear()
  fixture.client.call.mockReset().mockImplementation(async () => nativeReply())
  fixture.fetch.mockReset().mockImplementation(async (path: string) =>
    json(path === '/api/bootstrap' ? { csrf_token: 'synthetic-csrf' } : adoptedReply()))
})
afterEach(() => {
  for (const listener of listeners.splice(0)) window.removeEventListener('platform-native-project-adopted', listener)
  vi.useRealTimers()
})

for (const entry of entries) describe(entry.name, () => {
  it.each(['repo.add', 'repo.create', 'repo.clone'])('adopts one %s result before returning its original envelope', async (method) => {
    const response = nativeReply()
    fixture.client.call.mockResolvedValueOnce(response)
    const events: string[] = []
    listen(event => { events.push(event.detail.projectId); event.detail.waitUntil(Promise.resolve(true)) })
    expect(await entry.call(method)).toBe(response)
    expect(fixture.client.call).toHaveBeenCalledTimes(1)
    expect(fixture.fetch).toHaveBeenCalledTimes(2)
    const [path, options] = fixture.fetch.mock.calls[1]
    expect(path).toBe('/api/workbench/adopt-repo')
    expect(JSON.parse(options.body)).toEqual({ environment_id: fixture.environment.id, runtime_id: 'runtime-a', repo_id: 'native-repo' })
    expect(options.headers['X-Session-CSRF']).toBe('synthetic-csrf')
    expect(options.credentials).toBe('same-origin')
    expect(events).toEqual(['p-one'])
    expect(response._meta).toEqual({ runtimeId: 'runtime-a' })
  })

  it('preserves a failed native operation without adoption or replay', async () => {
    const response = { id: 'failed', ok: false as const, error: { code: 'native-failure', message: 'Native failure' }, _meta: { runtimeId: 'runtime-a' } }
    fixture.client.call.mockResolvedValueOnce(response)
    expect(await entry.call('repo.create')).toBe(response)
    expect(fixture.fetch).not.toHaveBeenCalled()
    expect(fixture.client.call).toHaveBeenCalledTimes(1)
  })

  it('reports adoption failure without repeating a successful native clone', async () => {
    fixture.fetch.mockImplementation(async (path: string) => json(path === '/api/bootstrap' ? { csrf_token: 'synthetic-csrf' } : { error: 'unavailable' }, path === '/api/bootstrap' ? 200 : 503))
    await expect(entry.call('repo.clone')).rejects.toThrow('勿再次创建或克隆')
    expect(fixture.client.call).toHaveBeenCalledTimes(1)
  })
})

it.each(['/web-index.html', '/index.html'])('keeps standalone operations outside adoption at %s', async (path) => {
  window.history.replaceState(null, '', path)
  await callRuntimeEnvelope('repo.add')
  expect(fixture.fetch).not.toHaveBeenCalled()
})
it('does not adopt reads or nested native error results', async () => {
  await callRuntimeEnvelope('repo.list')
  fixture.client.call.mockResolvedValueOnce({ id: 'native', ok: true, result: { error: 'directory_exists' }, _meta: { runtimeId: 'runtime-a' } })
  await callRuntimeEnvelope('repo.create')
  expect(fixture.fetch).not.toHaveBeenCalled()
})

it.each(['repo', 'environment', 'runtime'])('refuses a mismatched %s adoption identity', async (field) => {
  const reply = adoptedReply()
  if (field === 'repo') reply.target.repoId = 'other-repo'
  if (field === 'environment') reply.runtime.environmentId = '22222222-2222-4222-8222-222222222222'
  if (field === 'runtime') reply.runtime.runtimeId = 'runtime-b'
  fixture.fetch.mockImplementation(async (path: string) => json(path === '/api/bootstrap' ? { csrf_token: 'synthetic-csrf' } : reply))
  const published = vi.fn()
  listen(published)
  await expect(callRuntimeEnvelope('repo.add')).rejects.toThrow('平台登记未确认')
  expect(published).not.toHaveBeenCalled()
})
it('does not complete when the registered project has no list listener', async () => {
  await expect(callRuntimeEnvelope('repo.add')).rejects.toThrow('项目已登记，但项目列表尚未确认')
  expect(fixture.client.call).toHaveBeenCalledTimes(1)
})
it.each([false, true])('requires a true list acknowledgement (reject=%s)', async (reject) => {
  listen(event => event.detail.waitUntil(reject ? Promise.reject(new Error('refresh failed')) : Promise.resolve(false)))
  await expect(callRuntimeEnvelope('repo.add')).rejects.toThrow('项目已登记，但项目列表尚未确认')
})
it('waits for the registered project snapshot before the native completion can proceed', async () => {
  let accept!: (result: boolean) => void
  const published = vi.fn()
  listen(event => { published(); event.detail.waitUntil(new Promise(resolve => { accept = resolve })) })
  let completed = false
  const result = callRuntimeEnvelope('repo.add').then(value => { completed = true; return value })
  await vi.waitFor(() => expect(published).toHaveBeenCalledOnce())
  expect(completed).toBe(false)
  accept(true)
  expect((await result).ok).toBe(true)
})

it.each(['context', 'pairing', 'connection', 'runtime', 'disconnect'])('blocks native completion after %s changes during snapshot refresh', async (kind) => {
  let accept!: (result: boolean) => void
  const published = vi.fn()
  listen(event => { published(); event.detail.waitUntil(new Promise(resolve => { accept = resolve })) })
  const result = callEnvironmentEnvelope(fixture.environment.id, 'repo.create')
  await vi.waitFor(() => expect(published).toHaveBeenCalledOnce())
  if (kind === 'context') fixture.active = false
  if (kind === 'pairing') fixture.environment.pairingRevision++
  if (kind === 'connection') fixture.client.connectionEpoch++
  if (kind === 'runtime') fixture.environment.runtimeId = 'runtime-b'
  if (kind === 'disconnect') fixture.disconnected.add(fixture.environment.id)
  accept(true)
  await expect(result).rejects.toThrow('项目列表尚未确认')
  expect(fixture.client.call).toHaveBeenCalledTimes(1)
})
it('does not issue adoption after a pairing changes while credentials are read', async () => {
  let release!: (value: Response) => void
  fixture.fetch.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  const result = callRuntimeEnvelope('repo.add')
  await vi.waitFor(() => expect(fixture.fetch).toHaveBeenCalledOnce())
  fixture.environment.pairingRevision++
  release(json({ csrf_token: 'synthetic-csrf' }))
  await expect(result).rejects.toThrow('平台登记未确认')
  expect(fixture.fetch).toHaveBeenCalledOnce()
})

it('permits the first established connection of a fresh native client', async () => {
  fixture.client.connectionEpoch = 0
  fixture.client.call.mockImplementationOnce(async () => {
    fixture.client.connectionEpoch = 1
    return nativeReply()
  })
  listen(event => event.detail.waitUntil(Promise.resolve(true)))
  expect((await callRuntimeEnvelope('repo.add')).ok).toBe(true)
})

it('rejects a late native result after reconnecting to the same runtime', async () => {
  let release!: (result: ReturnType<typeof nativeReply>) => void
  fixture.client.call.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  const result = callRuntimeEnvelope('repo.add')
  await vi.waitFor(() => expect(fixture.client.call).toHaveBeenCalledOnce())
  fixture.client.connectionEpoch++
  release(nativeReply())
  await expect(result).rejects.toThrow('平台登记未确认')
  expect(fixture.fetch).not.toHaveBeenCalled()
})

it('recovers a successful create whose adoption failed through an explicit add of the existing repo', async () => {
  let adopts = 0
  fixture.fetch.mockImplementation(async (path: string) => {
    if (path === '/api/bootstrap') return json({ csrf_token: 'synthetic-csrf' })
    return ++adopts === 1 ? json({ error: 'temporarily_unavailable' }, 503) : json(adoptedReply())
  })
  listen(event => event.detail.waitUntil(Promise.resolve(true)))
  await expect(callRuntimeEnvelope('repo.create')).rejects.toThrow('浏览宿主')
  const recovered = await callEnvironmentEnvelope(fixture.environment.id, 'repo.add', { path: '/projects/existing' })
  expect(recovered).toEqual(nativeReply())
  expect(fixture.client.call.mock.calls.map(call => call[0])).toEqual(['repo.create', 'repo.add'])
  const adoptedIds = fixture.fetch.mock.calls.filter(call => call[0] === '/api/workbench/adopt-repo')
    .map(call => JSON.parse(call[1].body).repo_id)
  expect(adoptedIds).toEqual(['native-repo', 'native-repo'])
})
