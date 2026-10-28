import { useCallback, useEffect, useRef, useState } from 'react'
import { toHubErrorKind } from '../copy'
import type { HubClient, HubDevice, HubErrorKind } from './hub-client'

export type DevicesState =
  | { phase: 'loading' }
  | { phase: 'ready'; devices: HubDevice[]; refreshing: boolean }
  | { phase: 'error'; error: HubErrorKind }

/** Loads the device list; `refresh` keeps the current rows on screen while it reloads. */
export function useDevices(client: HubClient) {
  const [state, setState] = useState<DevicesState>({ phase: 'loading' })
  const generation = useRef(0)
  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const mine = ++generation.current
      setState((current) =>
        mode === 'refresh' && current.phase === 'ready'
          ? { ...current, refreshing: true }
          : { phase: 'loading' }
      )
      try {
        const devices = await client.listDevices()
        if (mine === generation.current) setState({ phase: 'ready', devices, refreshing: false })
      } catch (error) {
        if (mine === generation.current) setState({ phase: 'error', error: toHubErrorKind(error) })
      }
    },
    [client]
  )
  useEffect(() => {
    void load('initial')
    return () => {
      generation.current += 1
    }
  }, [load])
  const replaceDevice = useCallback((device: HubDevice) => {
    setState((current) =>
      current.phase === 'ready'
        ? { ...current, devices: current.devices.map((d) => (d.id === device.id ? device : d)) }
        : current
    )
  }, [])
  return { state, refresh: () => load('refresh'), reload: () => load('initial'), replaceDevice }
}
