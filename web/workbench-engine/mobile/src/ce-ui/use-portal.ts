import { useRef, useState } from 'react'
import Constants from 'expo-constants'
import * as Linking from 'expo-linking'
import { readPlatformBrowserPortal } from '../platform-account/browser-portal'
import { copy } from './copy'

/**
 * The browser workbench entry, read from the same validated build config the old screen used.
 * Opening is explicit (never on mount), de-duplicated, and reports failure.
 */
export function usePortalOpener(disabled = false) {
  const portal = readPlatformBrowserPortal(Constants.expoConfig)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  async function open() {
    if (portal.status !== 'ready' || disabled || pending.current) return
    pending.current = true
    setOpening(true)
    setError('')
    try {
      await Linking.openURL(portal.url)
    } catch {
      setError(copy.account.portalFailed)
    } finally {
      pending.current = false
      setOpening(false)
    }
  }
  return { portal, opening, error, open }
}
