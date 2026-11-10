import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import { waitForPromiseWithSignal } from '../../../shared/abort-signal-reason'
import { assertContextActive, onContextInactive } from './remote-context'
type RuntimeSession = Pick<typeof import('./preload-api/web-runtime-session'),
  'manuallyDisconnectedEnvironmentIds' | 'webRuntimeState'>

type ProjectRepo = Pick<Repo, 'id' | 'path' | 'executionHostId' | 'connectionId'>
export type PreparedPlatformProjectRename = {
  confirm: () => Promise<void>
  cancel: () => void
  assertCurrent: () => void
}
let ownedHost: string | null = null
let runtimeSession: RuntimeSession | null = null
const pending = new Set<AbortController>()

/** Only the trusted platform entry installs this host; null retires every pending action. */
export function setPlatformProjectActionHost(hostId: string | null, session?: RuntimeSession): void {
  const next = hostId ? session ?? null : null
  if (ownedHost === hostId && runtimeSession === next) return
  ownedHost = hostId
  runtimeSession = next
  for (const controller of pending) controller.abort()
}

export function isPlatformProjectActionMode(): boolean {
  return typeof window !== 'undefined' &&
    ['/studio', '/workbench/web-index.html'].includes(window.location?.pathname)
}

export function capturePlatformProjectActionGuard(repo: ProjectRepo): () => void {
  assertContextActive()
  const host = getRepoExecutionHostId(repo), parsed = parseExecutionHostId(host)
  const session = runtimeSession, state = session?.webRuntimeState
  const environment = state?.activeEnvironment, client = state?.activeClient
  if (!isPlatformProjectActionMode() || !ownedHost || host !== ownedHost || parsed?.kind !== 'runtime' ||
      repo.connectionId != null || !session || !state || !environment || environment.id !== parsed.environmentId ||
      !client || state?.activeClientEnvironmentId !== environment.id ||
      client.connectionEpoch <= 0 || !environment.runtimeId) {
    throw new Error('当前项目所属工作台尚未确认，请刷新后重试。')
  }
  const environmentId = environment.id, revision = environment.pairingRevision ?? environment.createdAt
  const runtimeId = environment.runtimeId, epoch = client.connectionEpoch
  return () => {
    assertContextActive()
    const current = state?.activeEnvironment
    if (ownedHost !== host || runtimeSession !== session || !current || current.id !== environmentId ||
        (current.pairingRevision ?? current.createdAt) !== revision || current.runtimeId !== runtimeId ||
        state.activeClient !== client || state.activeClientEnvironmentId !== current.id ||
        client.connectionEpoch !== epoch || session.manuallyDisconnectedEnvironmentIds.has(current.id)) {
      throw new Error('项目所属工作台已变化，请刷新后重试。')
    }
  }
}

function beginAction(repo: ProjectRepo, action: 'rename' | 'archive', name?: string) {
  const assertOwner = capturePlatformProjectActionGuard(repo)
  const controller = new AbortController()
  pending.add(controller)
  const timer = window.setTimeout(() => controller.abort(), 30_000)
  const unsubscribe = onContextInactive(() => controller.abort())
  const cancel = () => {
    controller.abort()
    pending.delete(controller)
    window.clearTimeout(timer)
    unsubscribe()
  }
  const assertCurrent = () => {
    assertOwner()
    if (controller.signal.aborted) {
      throw new Error('项目所属工作台已变化，请刷新后重试。')
    }
  }
  const waits: Promise<unknown>[] = []
  try {
    assertCurrent()
    window.dispatchEvent(new CustomEvent('platform-native-project-action', { detail: {
      action, repoId: repo.id, directory: repo.path, executionHostId: getRepoExecutionHostId(repo),
      ...(action === 'rename' ? { name } : {}), signal: controller.signal,
      waitUntil: (result: Promise<unknown>) => waits.push(Promise.resolve(result))
    } }))
    assertCurrent()
    if (waits.length !== 1) throw new Error('项目动作尚未连接，请刷新后重试。')
    return { cancel, assertCurrent, signal: controller.signal,
      result: waitForPromiseWithSignal(waits[0], controller.signal) }
  } catch (error) {
    cancel()
    throw error
  }
}

export async function preparePlatformProjectRename(repo: ProjectRepo, name: string): Promise<PreparedPlatformProjectRename> {
  const request = beginAction(repo, 'rename', name)
  try {
    const confirm = await request.result
    request.assertCurrent()
    if (typeof confirm !== 'function') throw new Error('项目名称保存尚未确认。')
    return { cancel: request.cancel, assertCurrent: request.assertCurrent, confirm: async () => {
      try {
        request.assertCurrent()
        await waitForPromiseWithSignal(Promise.resolve(confirm()), request.signal)
        request.assertCurrent()
      } finally { request.cancel() }
    } }
  } catch (error) {
    const aborted = request.signal.aborted
    request.cancel()
    if (!aborted && error instanceof Error) throw error
    throw new Error('项目名称保存未确认，请刷新后核对。')
  }
}

export async function archivePlatformProject(repo: ProjectRepo): Promise<void> {
  const request = beginAction(repo, 'archive')
  try {
    await request.result
    request.assertCurrent()
  } catch (error) {
    if (!request.signal.aborted && error instanceof Error) throw error
    throw new Error('项目归档未确认，原生项目与终端仍保留，请刷新后核对。')
  } finally { request.cancel() }
}
