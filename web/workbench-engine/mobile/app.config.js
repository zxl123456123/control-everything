// Why this file exists: a bare "expo-notifications" plugin entry writes
// `aps-environment: development` into the iOS entitlements, while push-token.ts
// reports `production` for every non-__DEV__ build. A TestFlight or App Store build
// would then register a production APNs token against a sandbox entitlement, and the
// gateway's pushes would be accepted by Apple and delivered nowhere. Deriving the
// mode from an env var the release workflow sets makes the two agree by construction
// instead of relying on the export step to rewrite the entitlement.
//
// app.json stays the source for everything else: Expo reads it first and hands it to
// this function, so the fastlane version/buildNumber rewrite still flows through.
const APS_ENVIRONMENT =
  process.env.ORCA_IOS_APS_ENVIRONMENT === 'production' ? 'production' : 'development'

module.exports = ({ config }) => {
  // Public native-client metadata only; credentials never belong in Expo extra.
  const platformAccount = {
    issuer: process.env.CE_NATIVE_OIDC_ISSUER ?? '',
    clientId: process.env.CE_NATIVE_OIDC_CLIENT_ID ?? '',
    scheme: process.env.CE_NATIVE_OAUTH_SCHEME ?? '',
    iosBundleId: process.env.CE_NATIVE_IOS_BUNDLE_ID ?? '',
    androidPackage: process.env.CE_NATIVE_ANDROID_PACKAGE ?? ''
  }
  const schemes = Array.isArray(config.scheme) ? config.scheme : [config.scheme].filter(Boolean)
  return {
    ...config,
    scheme: [
      ...new Set([...schemes, 'orca', ...(platformAccount.scheme ? [platformAccount.scheme] : [])])
    ],
    extra: {
      ...config.extra,
      platformAccount: {
        ...platformAccount,
        redirectUri: platformAccount.scheme ? `${platformAccount.scheme}:/oauth/callback` : ''
      }
    },
    ios: {
      ...config.ios,
      ...(platformAccount.iosBundleId ? { bundleIdentifier: platformAccount.iosBundleId } : {}),
      entitlements: { ...config.ios?.entitlements, 'aps-environment': APS_ENVIRONMENT }
    },
    android: {
      ...config.android,
      ...(platformAccount.androidPackage ? { package: platformAccount.androidPackage } : {})
    },
    plugins: (config.plugins ?? []).map((plugin) =>
      plugin === 'expo-notifications'
        ? [
            'expo-notifications',
            {
              enableBackgroundRemoteNotifications: true,
              mode: APS_ENVIRONMENT,
              icon: './assets/notification-icon.png'
            }
          ]
        : plugin
    )
  }
}
