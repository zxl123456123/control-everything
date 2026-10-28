import { createContext, useContext, type ReactNode } from 'react'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { readPlatformAccountConfig } from '../../platform-account/config'
import { readPlatformBrowserPortal } from '../../platform-account/browser-portal'
import { platformAccountController } from '../../platform-account/controller'
import type { HubClient } from './hub-client'
import { createLiveHubClient, hubOrigin, type LiveHubClientOptions } from './live-hub-client'
import { createMockHubClient } from './mock-hub-client'
import { unavailableHubClient } from './unavailable-hub-client'

export type LiveHubInput = Pick<LiveHubClientOptions, 'origin' | 'tokens' | 'fetch'>

/**
 * Chooses the hub client:
 * 1. a build that opts in with `expo.extra.ceHubMock: true` shows labelled mock data (demos);
 * 2. a build with a remote hub origin and a configured account talks to the live hub;
 * 3. a development build otherwise shows labelled mock data;
 * 4. everything else gets the honest "not available" client instead of invented computers.
 * `live` is passed only when both the origin and the account are configured.
 */
export function resolveHubClient(input: {
  dev: boolean
  extra: Record<string, unknown> | undefined
  live?: LiveHubInput | null
}): HubClient {
  if (input.extra?.ceHubMock === true) return createMockHubClient()
  if (input.live && hubOrigin(input.live.origin))
    return createLiveHubClient({ ...input.live, origin: input.live.origin })
  return input.dev ? createMockHubClient() : unavailableHubClient
}

function liveInput(): LiveHubInput | null {
  const portal = readPlatformBrowserPortal(Constants.expoConfig)
  const account = readPlatformAccountConfig(Constants.expoConfig, Platform.OS)
  if (portal.status !== 'ready' || account.status !== 'ready') return null
  return {
    origin: portal.origin,
    tokens: platformAccountController,
    // `expo/fetch` is used (as for the identity service) so redirects can be refused natively. It is
    // loaded on first request so importing this module never needs the native fetch module.
    fetch: async (url, init) => (await import('expo/fetch')).fetch(url, init)
  }
}

let shared: HubClient | null = null
function defaultHubClient(): HubClient {
  shared ??= resolveHubClient({
    dev: typeof __DEV__ !== 'undefined' && __DEV__,
    extra: Constants.expoConfig?.extra as Record<string, unknown> | undefined,
    live: liveInput()
  })
  return shared
}

const HubClientContext = createContext<HubClient | null>(null)

export function HubClientProvider({
  client,
  children
}: {
  client: HubClient
  children: ReactNode
}) {
  return <HubClientContext.Provider value={client}>{children}</HubClientContext.Provider>
}

export function useHubClient(): HubClient {
  return useContext(HubClientContext) ?? defaultHubClient()
}
