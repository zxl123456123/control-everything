import { createContext, useContext, type ReactNode } from 'react'
import Constants from 'expo-constants'
import type { HubClient } from './hub-client'
import { createMockHubClient } from './mock-hub-client'
import { unavailableHubClient } from './unavailable-hub-client'

/**
 * Chooses the hub client. There is no live hub client yet, so: a development build (or a build
 * that opts in with `expo.extra.ceHubMock: true`) shows labelled mock data, and every other build
 * gets the honest "not available" client instead of invented computers.
 */
export function resolveHubClient(input: {
  dev: boolean
  extra: Record<string, unknown> | undefined
}): HubClient {
  const optedIn = input.extra?.ceHubMock === true
  return input.dev || optedIn ? createMockHubClient() : unavailableHubClient
}

let shared: HubClient | null = null
function defaultHubClient(): HubClient {
  shared ??= resolveHubClient({
    dev: typeof __DEV__ !== 'undefined' && __DEV__,
    extra: Constants.expoConfig?.extra as Record<string, unknown> | undefined
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
