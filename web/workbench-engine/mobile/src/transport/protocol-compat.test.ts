import { describe, expect, it } from 'vitest'
import { evaluateCompat } from './protocol-compat'
import { MOBILE_PROTOCOL_VERSION, MIN_COMPATIBLE_DESKTOP_VERSION } from './protocol-version'
import {
  RUNTIME_PROTOCOL_VERSION,
  MIN_COMPATIBLE_RUNTIME_SERVER_VERSION
} from '../../../src/shared/protocol-version'

describe('evaluateCompat', () => {
  it('keeps the independently bundled mobile protocol synchronized', () => {
    expect(MOBILE_PROTOCOL_VERSION).toBe(RUNTIME_PROTOCOL_VERSION)
    expect(MIN_COMPATIBLE_DESKTOP_VERSION).toBe(MIN_COMPATIBLE_RUNTIME_SERVER_VERSION)
  })
  it('allows the current mobile and desktop journal identity', () => {
    expect(
      evaluateCompat({
        desktopProtocolVersion: MOBILE_PROTOCOL_VERSION,
        desktopMinCompatibleMobileVersion: MOBILE_PROTOCOL_VERSION
      })
    ).toEqual({ kind: 'ok' })
  })

  it.each([undefined, 0, 1, 2, 3])('requires an update for desktop protocol %s', (version) => {
    expect(
      evaluateCompat({ desktopProtocolVersion: version, desktopMinCompatibleMobileVersion: 0 })
    ).toMatchObject({
      kind: 'blocked',
      reason: 'desktop-too-old',
      requiredDesktopVersion: MIN_COMPATIBLE_DESKTOP_VERSION
    })
  })
})
