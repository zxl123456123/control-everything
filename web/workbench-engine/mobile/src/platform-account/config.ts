type EmbeddedConfig = {
  extra?: { platformAccount?: Record<string, unknown> }
  scheme?: string | string[]
  ios?: { bundleIdentifier?: string }
  android?: { package?: string }
}

export type PlatformAccountConfig = {
  issuer: string
  clientId: string
  scheme: string
  iosBundleId: string
  androidPackage: string
  redirectUri: string
  nativeIdentity: string
}
export type PlatformAccountConfiguration =
  | { status: 'missing' | 'invalid'; message: string }
  | { status: 'ready'; config: PlatformAccountConfig }

export function readPlatformAccountConfig(
  expoConfig: EmbeddedConfig | null | undefined,
  platform: string
): PlatformAccountConfiguration {
  const raw = expoConfig?.extra?.platformAccount ?? {}
  const fields = ['issuer', 'clientId', 'scheme', 'iosBundleId', 'androidPackage'] as const
  if (fields.every((field) => raw[field] === undefined || raw[field] === '')) {
    return { status: 'missing', message: '此安装包尚未配置自建身份服务与原生发行标识。' }
  }
  const invalid = (): PlatformAccountConfiguration => ({
    status: 'invalid',
    message: '平台账号配置不完整或与原生发行标识不一致，请联系发行者重新构建。'
  })
  if (
    fields.some(
      (field) => typeof raw[field] !== 'string' || !raw[field] || /\s/.test(raw[field] as string)
    )
  )
    return invalid()
  const { issuer, clientId, scheme, iosBundleId, androidPackage } = raw as Record<
    (typeof fields)[number],
    string
  >
  try {
    const url = new URL(issuer)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.href !== issuer ||
      /%2[ef]|%5c|\\/i.test(issuer)
    )
      return invalid()
  } catch {
    return invalid()
  }
  const reverseDomain = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,}$/
  if (
    ![scheme, iosBundleId, androidPackage].every((value) => reverseDomain.test(value)) ||
    scheme === 'com.stably.orca.mobile' ||
    iosBundleId === 'com.stably.orca.mobile' ||
    androidPackage === 'com.stably.orca.mobile'
  )
    return invalid()
  const schemes = Array.isArray(expoConfig?.scheme) ? expoConfig.scheme : [expoConfig?.scheme]
  const redirectUri = `${scheme}:/oauth/callback`
  if (
    !schemes.includes(scheme) ||
    raw.redirectUri !== redirectUri ||
    (platform !== 'ios' && platform !== 'android') ||
    (platform === 'ios' && expoConfig?.ios?.bundleIdentifier !== iosBundleId) ||
    (platform === 'android' && expoConfig?.android?.package !== androidPackage)
  )
    return invalid()
  return {
    status: 'ready',
    config: {
      issuer,
      clientId,
      scheme,
      iosBundleId,
      androidPackage,
      redirectUri,
      nativeIdentity: `${iosBundleId}|${androidPackage}|${scheme}`
    }
  }
}

export function accountConfigBinding(config: PlatformAccountConfig): string {
  return JSON.stringify([config.issuer, config.clientId, config.redirectUri, config.nativeIdentity])
}
