/** Product-managed synthetic runtimes inherit one explicit isolation policy. */
export function readPlatformRuntimePolicy(env: NodeJS.ProcessEnv = process.env): { origin: string } | null {
  if (env.CE_WORKBENCH_ISOLATED !== '1') return null
  const value = env.CE_WORKBENCH_ORIGIN
  if (!value) throw new Error('platform_origin_required')
  const origin = new URL(value)
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port ||
      origin.origin !== value || origin.username || origin.password) {
    throw new Error('platform_origin_invalid')
  }
  return { origin: value }
}

export function isPlatformRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return readPlatformRuntimePolicy(env) !== null
}

/** rawHeaders preserves duplicates that Node's normalized headers would hide. */
export function platformUpgradeAllowed(
  rawHeaders: readonly string[], requestUrl: string | undefined, port: number,
  policy: { origin: string } | null = readPlatformRuntimePolicy()
): boolean {
  if (!policy) return true
  // The upstream Web transport adds exactly this fixed marker to a root endpoint.
  if (requestUrl !== '/' && requestUrl !== '/?orca-client=web') return false
  const hosts: string[] = [], origins: string[] = []
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = rawHeaders[index].toLowerCase()
    if (name === 'host') hosts.push(rawHeaders[index + 1])
    if (name === 'origin') origins.push(rawHeaders[index + 1])
  }
  return hosts.length === 1 && hosts[0] === `127.0.0.1:${port}` &&
    origins.length === 1 && origins[0] === policy.origin
}
