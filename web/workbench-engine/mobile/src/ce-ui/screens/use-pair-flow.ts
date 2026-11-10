import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { decodePairingUrl, parsePairingCode } from '../../transport/pairing'
import {
  startPreProfilePairing,
  type PreProfilePairingAttempt
} from '../../transport/pre-profile-pairing-coordinator'
import type { PairingOffer } from '../../transport/types'
import { useRefreshHostClient } from '../../transport/host-client-hooks'
import {
  loadMobileOnboardingSteps,
  mobileOnboardingDestination
} from '../../onboarding/mobile-onboarding-plan'
import { copy } from '../copy'

export type PairStatus = 'scanning' | 'connecting' | 'success' | 'error'

// Same ceiling as app/pair-scan.tsx: a broken route must surface as an error, not an endless spinner.
const PAIRING_OVERALL_TIMEOUT_MS = 25_000
const SUCCESS_HOLD_MS = 900

/**
 * Pairing logic for the new screen. It calls the same transport functions as app/pair-scan.tsx
 * (decode -> startPreProfilePairing -> refresh host client -> onboarding destination); only the
 * presentation differs. The original scan/confirm routes are untouched.
 */
export function usePairFlow() {
  const router = useRouter()
  const refreshHostClient = useRefreshHostClient()
  const [status, setStatus] = useState<PairStatus>('scanning')
  const [errorMessage, setErrorMessage] = useState('')
  const processing = useRef(false)
  const mounted = useRef(true)
  const attemptRef = useRef<PreProfilePairingAttempt | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Callback ref used as the unmount hook (same pattern as the existing pairing screens).
  const rootRef = useCallback((node: unknown): void => {
    if (node !== null) {
      mounted.current = true
      return
    }
    mounted.current = false
    attemptRef.current?.dispose()
    attemptRef.current = null
    if (holdTimer.current) clearTimeout(holdTimer.current)
  }, [])

  const fail = useCallback((message: string) => {
    setStatus('error')
    setErrorMessage(message)
    processing.current = false
  }, [])

  const connect = useCallback(
    async (offer: PairingOffer) => {
      setStatus('connecting')
      attemptRef.current?.dispose()
      const attempt = startPreProfilePairing({
        offer,
        timeoutMs: PAIRING_OVERALL_TIMEOUT_MS,
        connectOptions: {}
      })
      attemptRef.current = attempt
      try {
        const { hostId } = await attempt.result
        const current = attemptRef.current === attempt
        attempt.dispose()
        if (attemptRef.current === attempt) attemptRef.current = null
        if (!mounted.current || !current) return
        refreshHostClient(hostId)
        const steps = await loadMobileOnboardingSteps()
        if (!mounted.current) return
        setStatus('success')
        holdTimer.current = setTimeout(() => {
          if (mounted.current) router.replace(mobileOnboardingDestination(steps, hostId))
        }, SUCCESS_HOLD_MS)
      } catch {
        const timedOut = attempt.timedOut
        const current = attemptRef.current === attempt
        attempt.dispose()
        if (attemptRef.current === attempt) attemptRef.current = null
        if (!mounted.current || !current) return
        fail(timedOut ? copy.pair.timeout : copy.pair.failed)
      }
    },
    [fail, refreshHostClient, router]
  )

  const submitQr = useCallback(
    (data: string) => {
      if (processing.current) return
      processing.current = true
      const offer = decodePairingUrl(data)
      if (!offer) return fail(copy.pair.invalidQr)
      void connect(offer)
    },
    [connect, fail]
  )
  const submitCode = useCallback(
    (input: string) => {
      if (processing.current) return
      processing.current = true
      const offer = parsePairingCode(input)
      if (!offer) return fail(copy.pair.invalidCode)
      void connect(offer)
    },
    [connect, fail]
  )
  const retry = useCallback(() => {
    processing.current = false
    setErrorMessage('')
    setStatus('scanning')
  }, [])
  const cancel = useCallback(() => {
    attemptRef.current?.dispose()
    attemptRef.current = null
    retry()
  }, [retry])

  return { status, errorMessage, rootRef, submitQr, submitCode, retry, cancel }
}
