import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('./web-device-key-support', () => ({ readWebDeviceKeySupport: () => 'persistent' }))
import {
  createPlatformEnvironment,
  loadPlatformProjectBootstrap,
  parsePlatformProjectBootstrap,
  readPlatformProjectId
} from './platform-project-bootstrap'
import {
  clearStoredWebRuntimeEnvironment,
  readStoredWebRuntimeEnvironment,
  saveStoredWebRuntimeEnvironment
} from './web-runtime-environment'

const data = {
  project: { id: 'fixture-project', name: 'Fixture' },
  runtime: {
    environmentId: '11111111-1111-4111-8111-111111111111',
    offer: {
      v: 2,
      scope: 'runtime',
      endpoint: 'ws://127.0.0.1:23456',
      deviceToken: 'temporary-fixture-token',
      publicKeyB64: 'host-key'
    }
  },
  target: { repoId: 'repo-fixture' },
  returnUrl: '/studio#project/fixture-project'
}

afterEach(() => vi.unstubAllGlobals())
describe('platform project bootstrap', () => {
  it('accepts only one business project id, never endpoint or token query arguments', () => {
    expect(readPlatformProjectId('?project_id=fixture-project')).toBe('fixture-project')
    for (const query of [
      '',
      '?project_id=../other',
      '?project_id=a&project_id=b',
      '?project_id=a&endpoint=ws://elsewhere',
      '?project_id=a&token=secret'
    ]) {
      expect(() => readPlatformProjectId(query)).toThrow()
    }
  })

  it('checks the server response against the requested project and loopback runtime', () => {
    expect(parsePlatformProjectBootstrap(data, 'fixture-project').target.repoId).toBe(
      'repo-fixture'
    )
    expect(() => parsePlatformProjectBootstrap(data, 'another-project')).toThrow()
    expect(() =>
      parsePlatformProjectBootstrap({ ...data, returnUrl: 'https://elsewhere' }, 'fixture-project')
    ).toThrow()
    expect(() =>
      parsePlatformProjectBootstrap(
        {
          ...data,
          runtime: {
            ...data.runtime,
            offer: { ...data.runtime.offer, endpoint: 'ws://elsewhere:1234' }
          }
        },
        'fixture-project'
      )
    ).toThrow()
  })

  it('uses a protected POST and never puts pairing material in the request URL', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrf_token: 'csrf-fixture' })))
      .mockResolvedValueOnce(new Response(JSON.stringify(data)))
    const value = await loadPlatformProjectBootstrap(
      'fixture-project',
      new AbortController().signal,
      fetcher
    )
    expect(value.target.repoId).toBe('repo-fixture')
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      '/api/bootstrap',
      '/api/workbench/bootstrap'
    ])
    expect(fetcher.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      headers: { 'X-Session-Client': 'panel', 'X-Session-CSRF': 'csrf-fixture' },
      body: '{"project_id":"fixture-project"}'
    })
  })

  it('missing CSRF never invokes the device bootstrap', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
    await expect(
      loadPlatformProjectBootstrap('fixture-project', new AbortController().signal, fetcher)
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('keeps the fixed host environment and pairing material in page memory only', () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() }
    vi.stubGlobal('window', { localStorage: storage })
    const environment = createPlatformEnvironment(
      parsePlatformProjectBootstrap(data, 'fixture-project')
    )
    expect(environment).toMatchObject({
      id: data.runtime.environmentId,
      sessionOnly: true,
      preferredEndpointId: `ws-${data.runtime.environmentId}`
    })
    saveStoredWebRuntimeEnvironment(environment)
    expect(readStoredWebRuntimeEnvironment()).toBe(environment)
    expect(storage.setItem).not.toHaveBeenCalled()
    clearStoredWebRuntimeEnvironment()
  })
})
