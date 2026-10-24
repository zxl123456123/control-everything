import { timingSafeEqual } from 'node:crypto'

export type PlatformRuntimePolicy = { origin: string; publicOrigin?: string; deviceProof?: string; deviceId?: string; generation?: number; platformInstallationId?: string }

/** Product-managed runtimes choose their access mode at startup, never from request headers. */
export function readPlatformRuntimePolicy(env: NodeJS.ProcessEnv = process.env): PlatformRuntimePolicy | null {
  const publicOrigin = env.CE_WORKBENCH_PUBLIC_ORIGIN
  const deviceProof = env.CE_WORKBENCH_DEVICE_PROOF
  if (env.CE_WORKBENCH_ISOLATED !== '1') {
    if (publicOrigin !== undefined || deviceProof !== undefined) throw new Error('platform_public_origin_requires_isolation')
    return null
  }
  const value = env.CE_WORKBENCH_ORIGIN
  if (!value) throw new Error('platform_origin_required')
  const origin = new URL(value)
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port ||
      origin.origin !== value || origin.username || origin.password) {
    throw new Error('platform_origin_invalid')
  }
  if (publicOrigin !== undefined) {
    const external = new URL(publicOrigin)
    if (external.protocol !== 'https:' || external.origin !== publicOrigin ||
        external.username || external.password) {
      throw new Error('platform_public_origin_invalid')
    }
    if (!deviceProof || !/^[A-Za-z0-9_-]{43,172}$/.test(deviceProof)) throw new Error('platform_device_proof_required')
    const deviceId = env.CE_REMOTE_DEVICE_ID
    const generation = Number(env.CE_REMOTE_GENERATION)
    const platformInstallationId = env.CE_REMOTE_INSTALLATION_ID
    if (deviceId !== undefined || platformInstallationId !== undefined || env.CE_REMOTE_GENERATION !== undefined) {
      if (!deviceId || !/^[A-Za-z0-9_-]{1,128}$/.test(deviceId) || !Number.isSafeInteger(generation) || generation < 1 ||
          !platformInstallationId || !/^[A-Za-z0-9_-]{16,128}$/.test(platformInstallationId)) throw new Error('platform_remote_identity_invalid')
    }
    return { origin: value, publicOrigin, deviceProof, deviceId, generation, platformInstallationId }
  }
  return { origin: value }
}

export function isPlatformRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return readPlatformRuntimePolicy(env) !== null
}

/** rawHeaders preserves duplicates that Node's normalized headers would hide. */
export function platformUpgradeAllowed(
  rawHeaders: readonly string[], requestUrl: string | undefined, port: number,
  policy: PlatformRuntimePolicy | null = readPlatformRuntimePolicy()
): boolean {
  if (!policy) return true
  // The upstream Web transport adds exactly this fixed marker to a root endpoint.
  if (requestUrl !== '/' && requestUrl !== '/?orca-client=web') return false
  const hosts: string[] = [], origins: string[] = [], proofs: string[] = []
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index].toLowerCase()
    if (name === 'host') hosts.push(rawHeaders[index + 1])
    if (name === 'origin') origins.push(rawHeaders[index + 1])
    if (name === 'x-ce-device-proof') proofs.push(rawHeaders[index + 1])
  }
  if (hosts.length === 1 && hosts[0] === `127.0.0.1:${port}` &&
      origins.length === 1 && origins[0] === policy.origin && proofs.length === 0) return true
  if (policy.publicOrigin) {
    const expected = Buffer.from(policy.deviceProof ?? '')
    const supplied = Buffer.from(proofs[0] ?? '')
    if (proofs.length !== 1 || !expected.length || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return false
  }
  const expectedHost = policy.publicOrigin ? new URL(policy.publicOrigin).host : `127.0.0.1:${port}`
  return hosts.length === 1 && hosts[0] === expectedHost &&
    origins.length === 1 && origins[0] === (policy.publicOrigin ?? policy.origin)
}

/** Read-only internal probe; loopback transport alone is never authority. */
export function platformRemoteHealth(
  rawHeaders: readonly string[], requestUrl: string | undefined, method: string | undefined,
  port: number, ready: boolean, policy: PlatformRuntimePolicy | null
): { status: number; body: Record<string, unknown> } {
  if (method !== 'GET') return { status: 405, body: { error: 'method_not_allowed' } }
  if (!policy?.publicOrigin || !platformUpgradeAllowed(rawHeaders, '/', port, policy)) {
    return { status: 403, body: { error: 'remote_probe_rejected' } }
  }
  const origins = rawHeaders.filter((_value, index) => index % 2 === 1 && rawHeaders[index - 1].toLowerCase() === 'origin')
  if (origins.length !== 1 || origins[0] !== policy.publicOrigin) return { status: 403, body: { error: 'remote_probe_rejected' } }
  const match = /^\/__ce_remote_health\?nonce=([A-Za-z0-9_-]{32})$/.exec(requestUrl ?? '')
  if (!match) return { status: 400, body: { error: 'remote_probe_invalid' } }
  if (!ready || !policy.deviceId || !policy.platformInstallationId || !Number.isSafeInteger(policy.generation) || policy.generation! < 1) {
    return { status: 503, body: { error: 'remote_runtime_unavailable' } }
  }
  return { status: 200, body: { nonce: match[1], device_id: policy.deviceId, generation: policy.generation,
    platform_installation_id: policy.platformInstallationId, channel: 'ws', ready: true } }
}
