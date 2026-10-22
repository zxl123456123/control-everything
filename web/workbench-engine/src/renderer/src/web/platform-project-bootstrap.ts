import { z } from 'zod'
import { PairingOfferSchema } from '../../../shared/mobile-relay-pairing-offer'
import {
  createStoredWebRuntimeEnvironment,
  type StoredWebRuntimeEnvironment
} from './web-runtime-environment'

const projectIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/
const BootstrapSchema = z
  .object({
    project: z.object({ id: z.string().regex(projectIdPattern), name: z.string().min(1) }).strict(),
    runtime: z.object({ environmentId: z.string().uuid(), offer: PairingOfferSchema }).strict(),
    target: z
      .object({
        repoId: z.string().min(1),
        worktreeId: z.string().min(1).optional(),
        instanceId: z.string().min(1).optional()
      })
      .strict(),
    returnUrl: z.string()
  })
  .strict()

export type PlatformProjectBootstrap = z.infer<typeof BootstrapSchema>

export function readPlatformProjectId(search: string): string {
  const params = new URLSearchParams(search)
  const values = params.getAll('project_id')
  if (
    values.length !== 1 ||
    [...params.keys()].some((key) => key !== 'project_id') ||
    !projectIdPattern.test(values[0])
  ) {
    throw new Error('项目入口无效，请从工作台重新选择项目。')
  }
  return values[0]
}

export function parsePlatformProjectBootstrap(
  value: unknown,
  projectId: string
): PlatformProjectBootstrap {
  const result = BootstrapSchema.safeParse(value)
  if (!result.success) throw new Error('项目初始化信息不完整，请返回工作台重试。')
  const data = result.data
  const endpoint = new URL(data.runtime.offer.endpoint)
  if (
    data.project.id !== projectId ||
    data.returnUrl !== `/studio#project/${encodeURIComponent(projectId)}` ||
    data.runtime.offer.scope !== 'runtime' ||
    endpoint.protocol !== 'ws:' ||
    endpoint.hostname !== '127.0.0.1' ||
    !endpoint.port ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash ||
    endpoint.search
  ) {
    throw new Error('项目或运行组件身份不匹配，请返回工作台重新打开。')
  }
  return data
}

export async function loadPlatformProjectBootstrap(
  projectId: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<PlatformProjectBootstrap> {
  const bootstrap = await fetcher('/api/bootstrap', {
    signal,
    credentials: 'same-origin',
    headers: { 'X-Session-Client': 'panel' }
  })
  const credentials: unknown = await bootstrap.json()
  if (
    !bootstrap.ok ||
    !credentials ||
    typeof credentials !== 'object' ||
    !('csrf_token' in credentials) ||
    typeof credentials.csrf_token !== 'string' ||
    !credentials.csrf_token
  ) {
    throw new Error('工作台保存凭据不可用，请刷新页面。')
  }
  const response = await fetcher('/api/workbench/bootstrap', {
    method: 'POST',
    signal,
    credentials: 'same-origin',
    headers: {
      'X-Session-Client': 'panel',
      'Content-Type': 'application/json',
      'X-Session-CSRF': credentials.csrf_token
    },
    body: JSON.stringify({ project_id: projectId })
  })
  if (!response.ok) throw new Error('项目工作区尚未连接或项目目录已变化，请返回工作台重试。')
  return parsePlatformProjectBootstrap(await response.json(), projectId)
}

export function createPlatformEnvironment(
  data: PlatformProjectBootstrap
): StoredWebRuntimeEnvironment {
  const environment = createStoredWebRuntimeEnvironment({
    name: '本机工作区',
    offer: data.runtime.offer
  })
  const id = data.runtime.environmentId
  return {
    ...environment,
    id,
    sessionOnly: true,
    preferredEndpointId: `ws-${id}`,
    endpoints: environment.endpoints.map((endpoint) => ({ ...endpoint, id: `ws-${id}` }))
  }
}
