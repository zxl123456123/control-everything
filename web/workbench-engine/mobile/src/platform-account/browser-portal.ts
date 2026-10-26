type EmbeddedPortal = {
  extra?: { platformAccount?: { remoteOrigin?: unknown } }
}

export type PlatformBrowserPortal =
  | { status: 'missing' | 'invalid' }
  | { status: 'ready'; origin: string; url: string }

export function readPlatformBrowserPortal(
  expoConfig: EmbeddedPortal | null | undefined
): PlatformBrowserPortal {
  const value = expoConfig?.extra?.platformAccount?.remoteOrigin
  if (value === undefined || value === '') return { status: 'missing' }
  if (typeof value !== 'string' || /[\s%\\]/.test(value)) return { status: 'invalid' }
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (value !== url.origin && value !== `${url.origin}/`)
    )
      return { status: 'invalid' }
    return { status: 'ready', origin: url.origin, url: `${url.origin}/remote` }
  } catch {
    return { status: 'invalid' }
  }
}
