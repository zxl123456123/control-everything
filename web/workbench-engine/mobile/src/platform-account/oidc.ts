import {
  AccessTokenRequest,
  AuthRequest,
  CodeChallengeMethod,
  RefreshTokenRequest,
  ResponseType,
  TokenResponse
} from 'expo-auth-session'
import * as Crypto from 'expo-crypto'
import { fetch as nativeFetch } from 'expo/fetch'
import { Buffer } from 'buffer'
import type { PlatformAccountConfig } from './config'
import type { AccountRecovery } from './secure-store'

export class AccountError extends Error {
  constructor(
    readonly kind: 'network' | 'incompatible' | 'callback' | 'identity' | 'expired' | 'cancelled'
  ) {
    super(kind)
  }
}
export type AccountSession = {
  issuer: string
  subject: string
  displayName?: string
  /** From the userinfo reply (needs the `email` scope); absent when the account has none. */
  email?: string
  accessToken: string
  expiresAt: number
}
export type AccountCandidate = { session: AccountSession; recovery: AccountRecovery | null }
type ObjectValue = Record<string, unknown>
type Discovery = {
  authorizationEndpoint: string
  tokenEndpoint: string
  userInfoEndpoint: string
  // Optional endpoints: absent or malformed values must never break sign-in.
  revocationEndpoint?: string
  endSessionEndpoint?: string
}
/** What a best-effort server-side sign-out achieved. Local credentials are cleared either way. */
export type RevocationOutcome = 'revoked' | 'unsupported' | 'failed'
const REVOCATION_TIMEOUT_MS = 8_000
const fail = (kind: AccountError['kind']): never => {
  throw new AccountError(kind)
}
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0
const object = (value: unknown): value is ObjectValue =>
  !!value && typeof value === 'object' && !Array.isArray(value)

function requireEndpoint(value: unknown, issuer: string): string {
  if (!nonempty(value)) return fail('incompatible')
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.origin !== new URL(issuer).origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.href !== value ||
      /%2[ef]|%5c|\\|\s/i.test(value)
    )
      return fail('incompatible')
    return value
  } catch {
    return fail('incompatible')
  }
}

// The ID-token TLS exception is confined to these direct, non-redirecting requests.
async function requestJson(
  url: string,
  signal: AbortSignal,
  init: RequestInit = {}
): Promise<ObjectValue> {
  if (signal.aborted) return fail('network')
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) controller.abort()
  let rejectAbort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new AccountError('network'))
    controller.signal.addEventListener('abort', rejectAbort, { once: true })
    if (controller.signal.aborted) rejectAbort()
  })
  const timer = setTimeout(abort, 15_000)
  try {
    return await Promise.race([
      (async () => {
        const response = await nativeFetch(url, {
          ...init,
          redirect: 'error',
          credentials: 'omit',
          signal: controller.signal
        })
        if (response.url !== url || (response.status >= 300 && response.status < 400))
          return fail('network')
        const body: unknown = await response.json()
        if (!object(body)) return fail('incompatible')
        if (body.error === 'invalid_grant') return fail('expired')
        if (!response.ok || body.error !== undefined) return fail('network')
        return body
      })(),
      aborted
    ])
  } catch (error) {
    throw error instanceof AccountError ? error : new AccountError('network')
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
    if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort)
  }
}

function optionalEndpoint(value: unknown, issuer: string): string | undefined {
  if (value === undefined) return undefined
  try {
    return requireEndpoint(value, issuer)
  } catch {
    return undefined
  }
}

// RFC 7009 answers 200 with an empty body, so this cannot reuse requestJson, which parses JSON.
async function postFormOk(
  url: string,
  body: URLSearchParams,
  signal: AbortSignal
): Promise<boolean> {
  if (signal.aborted) return false
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, REVOCATION_TIMEOUT_MS)
  try {
    const response = await nativeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'error',
      credentials: 'omit',
      signal: controller.signal
    })
    return response.url === url && response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

async function loadDiscovery(
  config: PlatformAccountConfig,
  signal: AbortSignal
): Promise<Discovery> {
  const url = `${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`
  requireEndpoint(url, config.issuer)
  const raw = await requestJson(url, signal)
  if (
    raw.issuer !== config.issuer ||
    !Array.isArray(raw.id_token_signing_alg_values_supported) ||
    !raw.id_token_signing_alg_values_supported.includes('RS256')
  )
    return fail('incompatible')
  return {
    authorizationEndpoint: requireEndpoint(raw.authorization_endpoint, config.issuer),
    tokenEndpoint: requireEndpoint(raw.token_endpoint, config.issuer),
    userInfoEndpoint: requireEndpoint(raw.userinfo_endpoint, config.issuer),
    revocationEndpoint: optionalEndpoint(raw.revocation_endpoint, config.issuer),
    endSessionEndpoint: optionalEndpoint(raw.end_session_endpoint, config.issuer)
  }
}

function exactCallback(url: string, request: AuthRequest, config: PlatformAccountConfig): string {
  if (url.includes('#') || url.split('?')[0] !== config.redirectUri) return fail('callback')
  const params = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1) : '')
  for (const key of ['code', 'state', 'error', 'iss']) {
    if (params.getAll(key).length > 1) return fail('callback')
  }
  if (
    params.has('error') ||
    params.has('access_token') ||
    params.has('id_token') ||
    params.has('token') ||
    params.get('state') !== request.state ||
    !nonempty(params.get('code')) ||
    (params.has('iss') && params.get('iss') !== config.issuer)
  )
    return fail('callback')
  return params.get('code')!
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}
function decodePart(part: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) return fail('identity')
  const bytes = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  if (base64url(bytes) !== part) return fail('identity')
  return bytes
}
function jsonPart(part: string): ObjectValue {
  const bytes = decodePart(part)
  const text = bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(bytes)) return fail('identity')
  try {
    const value: unknown = JSON.parse(text)
    return object(value) ? value : fail('identity')
  } catch {
    return fail('identity')
  }
}
const seconds = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

async function identityFromDirectResponse(
  raw: ObjectValue,
  config: PlatformAccountConfig,
  nonce: string,
  now: number,
  prior?: AccountRecovery
): Promise<{ subject: string; authTime?: number }> {
  if (raw.id_token === undefined && prior)
    return { subject: prior.subject, authTime: prior.optionalAuthTime }
  if (!nonempty(raw.id_token)) return fail('identity')
  const parts = raw.id_token.split('.')
  if (parts.length !== 3) return fail('identity')
  const header = jsonPart(parts[0]!)
  decodePart(parts[2]!)
  if (
    header.alg !== 'RS256' ||
    header.crit !== undefined ||
    header.b64 !== undefined ||
    header.jku !== undefined ||
    header.x5u !== undefined
  )
    return fail('identity')
  const claims = jsonPart(parts[1]!)
  const aud = claims.aud
  if (
    claims.iss !== config.issuer ||
    !nonempty(claims.sub) ||
    !(
      aud === config.clientId ||
      (Array.isArray(aud) && aud.length === 1 && aud[0] === config.clientId)
    ) ||
    (claims.azp !== undefined && claims.azp !== config.clientId) ||
    !seconds(claims.exp) ||
    !seconds(claims.iat) ||
    claims.exp <= claims.iat ||
    claims.exp <= now ||
    claims.iat > now + 60 ||
    (claims.nbf !== undefined && (!seconds(claims.nbf) || claims.nbf > now + 60)) ||
    ((!prior || claims.nonce !== undefined) && claims.nonce !== nonce) ||
    (prior && claims.sub !== prior.subject) ||
    (claims.auth_time !== undefined &&
      (!seconds(claims.auth_time) || claims.auth_time > now + 60)) ||
    (prior?.optionalAuthTime !== undefined &&
      claims.auth_time !== undefined &&
      claims.auth_time !== prior.optionalAuthTime)
  )
    return fail('identity')
  if (claims.at_hash !== undefined) {
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      raw.access_token as string,
      { encoding: Crypto.CryptoEncoding.BASE64 }
    )
    const expected = base64url(Buffer.from(digest, 'base64').subarray(0, 16))
    if (claims.at_hash !== expected) return fail('identity')
  }
  return {
    subject: claims.sub,
    authTime: prior?.optionalAuthTime ?? (claims.auth_time as number | undefined)
  }
}

async function exchange(
  config: PlatformAccountConfig,
  discovery: Discovery,
  request: AccessTokenRequest | RefreshTokenRequest,
  nonce: string,
  signal: AbortSignal,
  now: () => number,
  prior?: AccountRecovery
): Promise<AccountCandidate> {
  const raw = await requestJson(discovery.tokenEndpoint, signal, {
    method: 'POST',
    headers: request.getHeaders(),
    body: new URLSearchParams(request.getQueryBody()).toString()
  })
  if (
    !nonempty(raw.access_token) ||
    typeof raw.token_type !== 'string' ||
    raw.token_type.toLowerCase() !== 'bearer' ||
    typeof raw.expires_in !== 'number' ||
    !Number.isFinite(raw.expires_in) ||
    raw.expires_in <= 0 ||
    (raw.refresh_token !== undefined && !nonempty(raw.refresh_token))
  )
    return fail('incompatible')
  const issuedAt = now()
  const identity = await identityFromDirectResponse(raw, config, nonce, issuedAt / 1000, prior)
  const token = new TokenResponse({
    accessToken: raw.access_token,
    tokenType: 'bearer',
    expiresIn: raw.expires_in,
    issuedAt: issuedAt / 1000
  })
  const profile = await requestJson(discovery.userInfoEndpoint, signal, {
    headers: { Authorization: `Bearer ${token.accessToken}` }
  })
  if (profile.sub !== identity.subject) return fail('identity')
  const refreshToken = (raw.refresh_token as string | undefined) ?? prior?.refreshToken
  const expiresAt = issuedAt + raw.expires_in * 1000
  if (!Number.isFinite(expiresAt) || expiresAt <= now()) return fail('expired')
  return {
    session: {
      issuer: config.issuer,
      subject: identity.subject,
      accessToken: token.accessToken,
      expiresAt,
      ...(nonempty(profile.name) ? { displayName: profile.name } : {}),
      ...(nonempty(profile.email) ? { email: profile.email } : {})
    },
    recovery: refreshToken
      ? {
          version: 1,
          issuer: config.issuer,
          clientId: config.clientId,
          redirectUri: config.redirectUri,
          nativeIdentity: config.nativeIdentity,
          subject: identity.subject,
          authorizationNonce: nonce,
          ...(identity.authTime !== undefined ? { optionalAuthTime: identity.authTime } : {}),
          refreshToken
        }
      : null
  }
}

export const platformAccountOidc = {
  async login(
    config: PlatformAccountConfig,
    signal: AbortSignal,
    now = Date.now
  ): Promise<AccountCandidate> {
    const discovery = await loadDiscovery(config, signal)
    if (signal.aborted) return fail('network')
    const nonce = base64url(Crypto.getRandomBytes(32))
    const request = new AuthRequest({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      responseType: ResponseType.Code,
      usePKCE: true,
      codeChallengeMethod: CodeChallengeMethod.S256,
      scopes: ['openid', 'profile', 'email'],
      state: base64url(Crypto.getRandomBytes(32)),
      extraParams: { nonce }
    })
    await request.makeAuthUrlAsync(discovery)
    if (signal.aborted) return fail('network')
    const result = await request.promptAsync(discovery)
    if (signal.aborted) return fail('network')
    if (result.type === 'cancel' || result.type === 'dismiss') return fail('cancelled')
    if (result.type !== 'success') return fail('callback')
    const code = exactCallback(result.url, request, config)
    if (!request.codeVerifier) return fail('incompatible')
    return exchange(
      config,
      discovery,
      new AccessTokenRequest({
        clientId: config.clientId,
        code,
        redirectUri: config.redirectUri,
        extraParams: { code_verifier: request.codeVerifier }
      }),
      nonce,
      signal,
      now
    )
  },
  async restore(
    config: PlatformAccountConfig,
    record: AccountRecovery,
    signal: AbortSignal,
    now = Date.now
  ): Promise<AccountCandidate> {
    if (
      record.issuer !== config.issuer ||
      record.clientId !== config.clientId ||
      record.redirectUri !== config.redirectUri ||
      record.nativeIdentity !== config.nativeIdentity
    )
      return fail('identity')
    const discovery = await loadDiscovery(config, signal)
    return exchange(
      config,
      discovery,
      new RefreshTokenRequest({ clientId: config.clientId, refreshToken: record.refreshToken }),
      record.authorizationNonce,
      signal,
      now,
      record
    )
  },
  /**
   * Best-effort server-side sign-out so a refresh token copied off the device stops working.
   * Prefers RFC 7009 revocation; falls back to a direct end-session POST (Keycloak accepts the
   * refresh token there). Never throws: the caller clears local credentials regardless.
   */
  async revoke(
    config: PlatformAccountConfig,
    record: AccountRecovery,
    signal: AbortSignal
  ): Promise<RevocationOutcome> {
    if (
      record.issuer !== config.issuer ||
      record.clientId !== config.clientId ||
      record.redirectUri !== config.redirectUri ||
      record.nativeIdentity !== config.nativeIdentity
    )
      return 'failed'
    try {
      const discovery = await loadDiscovery(config, signal)
      if (discovery.revocationEndpoint) {
        const ok = await postFormOk(
          discovery.revocationEndpoint,
          new URLSearchParams({
            token: record.refreshToken,
            token_type_hint: 'refresh_token',
            client_id: config.clientId
          }),
          signal
        )
        return ok ? 'revoked' : 'failed'
      }
      if (discovery.endSessionEndpoint) {
        const ok = await postFormOk(
          discovery.endSessionEndpoint,
          new URLSearchParams({ refresh_token: record.refreshToken, client_id: config.clientId }),
          signal
        )
        return ok ? 'revoked' : 'failed'
      }
      return 'unsupported'
    } catch {
      return 'failed'
    }
  }
}
