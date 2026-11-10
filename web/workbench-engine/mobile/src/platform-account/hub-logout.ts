// Best-effort sign-out call to the remote hub (`POST /remote/mobile/logout`). It ends the hub's
// browser sessions for this member. The caller clears local credentials regardless of the outcome,
// so this function never throws and never retries: a slow or failing hub must not hold up logout.

export type HubLogoutFetchInit = {
  method: 'POST'
  headers: Record<string, string>
  body: string
  signal: AbortSignal
  redirect: 'error'
}
export type HubLogoutFetch = (
  url: string,
  init: HubLogoutFetchInit
) => Promise<{ status: number; text(): Promise<string> }>

export const HUB_LOGOUT_TIMEOUT_MS = 6_000
export const HUB_LOGOUT_PATH = '/remote/mobile/logout'

/** Returns a function that reports whether the hub acknowledged the logout. */
export function createHubLogout(options: {
  origin: string
  fetch: HubLogoutFetch
  timeoutMs?: number
}): (accessToken: string, signal: AbortSignal) => Promise<boolean> {
  let origin: string | null = null
  try {
    const url = new URL(options.origin)
    // A Bearer token is only ever sent to a plain https origin without credentials or a path.
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    )
      origin = url.origin
  } catch {
    origin = null
  }
  const timeoutMs = options.timeoutMs ?? HUB_LOGOUT_TIMEOUT_MS
  return async (accessToken, signal) => {
    if (!origin || !accessToken || signal.aborted) return false
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal.addEventListener('abort', abort, { once: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    // Aborting is not trusted to end the wait on a stalled connection, so the deadline also rejects.
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error('timeout'))
      }, timeoutMs)
    })
    try {
      const response = await Promise.race([
        options.fetch(`${origin}${HUB_LOGOUT_PATH}`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: '{}',
          signal: controller.signal,
          redirect: 'error'
        }),
        deadline
      ])
      return response.status >= 200 && response.status < 300
    } catch {
      return false
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    }
  }
}
