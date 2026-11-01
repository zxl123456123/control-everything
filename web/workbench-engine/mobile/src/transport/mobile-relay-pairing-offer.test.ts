import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMobileRelayPairingFixtures,
  encodePairingFixturePayload
} from '../../../src/shared/mobile-relay-pairing-fixtures'
import { decodePairingUrl, parsePairingCode } from './pairing'
import { encodePairingOffer, parsePairingCode as parseDesktopPairing } from '../../../src/shared/pairing'
import { parseWebPairingInput } from '../../../src/renderer/src/web/web-pairing'

describe('mobile relay pairing contract', () => {
  const now = Date.UTC(2026, 6, 12, 16)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shares the zkyq scheme across desktop, web and phone without accepting the retired scheme', () => {
    const offer = {
      v: 2 as const,
      endpoint: 'wss://example.test/runtime',
      deviceToken: 'synthetic-token',
      publicKeyB64: Buffer.alloc(32, 1).toString('base64')
    }
    const url = encodePairingOffer(offer)
    expect(url).toMatch(/^zkyq:\/\/pair\?code=/)
    for (const parse of [parseDesktopPairing, parseWebPairingInput, parsePairingCode]) {
      expect(parse(url)).toEqual(offer)
      expect(parse(url.replace('zkyq:', 'orca:'))).toBeNull()
      expect(parse(url.replace('://pair?', '://pairing?'))).toBeNull()
      expect(parse(url.replace('://pair?', '://pair/nested?'))).toBeNull()
      expect(parse(new URL(url).searchParams.get('code')!)).toEqual(offer)
      expect(parse(url.replace('?code=', '#'))).toEqual(offer)
    }
  })

  for (const fixture of createMobileRelayPairingFixtures(now)) {
    it(fixture.name, () => {
      expect(decodePairingUrl(encodePairingFixturePayload(fixture.payload))).toEqual(
        fixture.expected
      )
    })
  }
})
