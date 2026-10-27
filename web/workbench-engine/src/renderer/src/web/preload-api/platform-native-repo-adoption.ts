import { z } from 'zod'
import { waitForPromiseWithSignal } from '../../../../shared/abort-signal-reason'
import type { RuntimeRpcResponse } from '../../../../shared/runtime-rpc-envelope'
import { assertContextActive, contextFetch } from '../remote-context'

const mutations = new Set(['repo.add', 'repo.create', 'repo.clone'])
const nativeRepo = z.object({ id: z.string().min(1).max(255) }).passthrough()
const adoptedProject = z.object({
  status: z.literal('adopted'),
  project: z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/), name: z.string().min(1) }).strict(),
  target: z.object({ repoId: z.string().min(1) }).strict(),
  runtime: z.object({ environmentId: z.string().uuid(), runtimeId: z.string().min(1) }).strict()
}).strict()

export function isPlatformNativeRepoMutation(method: string): boolean {
  return typeof window !== 'undefined' &&
    ['/studio', '/workbench/web-index.html'].includes(window.location.pathname) && mutations.has(method)
}

/** Adoption acknowledges an existing native operation; it never creates, clones or retries it. */
export async function adoptPlatformNativeRepo(
  method: string,
  environmentId: string,
  response: RuntimeRpcResponse<unknown>,
  assertCurrent: () => void
): Promise<void> {
  if (!isPlatformNativeRepoMutation(method) || !response.ok) return
  const result = response.result
  if (result && typeof result === 'object' && 'error' in result && typeof result.error === 'string') return
  const parsedRepo = nativeRepo.safeParse(
    result && typeof result === 'object' && 'repo' in result ? result.repo : null
  )
  let registered = false
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 30_000)
  const check = () => { assertContextActive(); assertCurrent() }
  try {
    check()
    if (!parsedRepo.success || !response._meta?.runtimeId) throw new Error('native_repo_invalid')
    const repoId = parsedRepo.data.id, runtimeId = response._meta.runtimeId
    const bootstrap = await contextFetch('/api/bootstrap', {
      credentials: 'same-origin', signal: controller.signal,
      headers: { 'X-Session-Client': 'panel' }
    })
    const credentials: unknown = await bootstrap.json()
    check()
    if (!bootstrap.ok || !credentials || typeof credentials !== 'object' ||
      !('csrf_token' in credentials) || typeof credentials.csrf_token !== 'string' || !credentials.csrf_token) {
      throw new Error('adoption_credentials_unavailable')
    }
    const reply = await contextFetch('/api/workbench/adopt-repo', {
      method: 'POST', credentials: 'same-origin', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Session-Client': 'panel', 'X-Session-CSRF': credentials.csrf_token },
      body: JSON.stringify({ environment_id: environmentId, runtime_id: runtimeId, repo_id: repoId })
    })
    const value: unknown = await reply.json()
    check()
    const adopted = adoptedProject.safeParse(value)
    if (!reply.ok || !adopted.success || adopted.data.target.repoId !== repoId ||
      adopted.data.runtime.environmentId !== environmentId || adopted.data.runtime.runtimeId !== runtimeId) {
      throw new Error('adoption_identity_unconfirmed')
    }
    registered = true
    const waits: Promise<boolean>[] = []
    window.dispatchEvent(new CustomEvent('platform-native-project-adopted', {
      detail: {
        projectId: adopted.data.project.id,
        waitUntil: (result: Promise<boolean>) => waits.push(Promise.resolve(result))
      }
    }))
    check()
    if (!waits.length) throw new Error('project_list_unconfirmed')
    const confirmed = await waitForPromiseWithSignal(Promise.all(waits), controller.signal)
    check()
    if (!confirmed.every(result => result === true)) throw new Error('project_list_unconfirmed')
  } catch {
    throw Object.assign(new Error(registered
      ? '项目已登记，但项目列表尚未确认。请用“浏览宿主”选择已有目录继续，无需再次创建或克隆。'
      : '原生项目目录已保留，但平台登记未确认。请用“浏览宿主”选择已有目录继续登记，勿再次创建或克隆。'), {
      code: registered ? 'platform_project_list_unconfirmed' : 'platform_repo_adoption_unconfirmed'
    })
  } finally {
    window.clearTimeout(timer)
  }
}
