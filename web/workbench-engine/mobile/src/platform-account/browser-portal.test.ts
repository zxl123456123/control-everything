import { describe, expect, it } from 'vitest'
import { readPlatformBrowserPortal } from './browser-portal'

const config = (remoteOrigin: unknown) => ({ extra: { platformAccount: { remoteOrigin } } })

describe('platform browser workspace entry', () => {
  it.each(['https://workbench.example.test', 'https://workbench.example.test/'])(
    'opens the fixed central account page for %s without native account metadata',
    (origin) => {
      expect(readPlatformBrowserPortal(config(origin))).toEqual({
        status: 'ready',
        origin: 'https://workbench.example.test',
        url: 'https://workbench.example.test/remote'
      })
    }
  )
  it('accepts an explicit HTTPS service port', () => {
    expect(readPlatformBrowserPortal(config('https://workbench.example.test:8443'))).toEqual({
      status: 'ready',
      origin: 'https://workbench.example.test:8443',
      url: 'https://workbench.example.test:8443/remote'
    })
  })
  it.each([undefined, null, {}, { extra: {} }, config('')])('has no fallback for %j', (value) => {
    expect(readPlatformBrowserPortal(value)).toEqual({ status: 'missing' })
  })
  it.each([
    42,
    null,
    'http://workbench.example.test',
    'javascript:alert(1)',
    'https://name:password@workbench.example.test',
    'https://workbench.example.test/remote',
    'https://workbench.example.test?token=synthetic',
    'https://workbench.example.test#account',
    'https://workbench.example.test/%2e%2e',
    'https://workbench.example.test\\remote',
    ' https://workbench.example.test',
    'https://workbench.example.test ',
    'https://workbench.example.test/a/..',
    '//workbench.example.test'
  ])('rejects a non-origin or unsafe configured entry %j', (value) => {
    expect(readPlatformBrowserPortal(config(value))).toEqual({ status: 'invalid' })
  })
})
