import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRuntimeMetadata } from './metadata-selection'

const mocks = vi.hoisted(() => ({
  selected: vi.fn(),
  current: vi.fn(),
  legacy: vi.fn(),
  probe: vi.fn(),
  request: vi.fn()
}))
vi.mock('./metadata', () => ({
  readMetadata: mocks.selected,
  readPrimaryMetadataForPreflight: mocks.current,
  readLegacyMetadataForPreflight: mocks.legacy
}))
vi.mock('./runtime-listener-probe', () => ({ probeRuntimeListener: mocks.probe }))
vi.mock('./transport', () => ({ sendRequest: mocks.request }))

const current = {
  runtimeId: 'new',
  pid: 1,
  authToken: 'new-token',
  startedAt: 1,
  transports: [{ kind: 'named-pipe', endpoint: 'new-pipe' }]
}
const legacy = {
  runtimeId: 'old',
  pid: 2,
  authToken: 'old-token',
  startedAt: 2,
  transports: [{ kind: 'named-pipe', endpoint: 'old-pipe' }]
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.selected.mockReturnValue(current)
  mocks.current.mockReturnValue(current)
  mocks.legacy.mockReturnValue(legacy)
  mocks.probe.mockResolvedValue('not-listening')
  mocks.request.mockResolvedValue({ ok: true, result: {}, _meta: { runtimeId: 'old' } })
})

describe('runtime metadata selection', () => {
  it('selects the legacy record only after the current endpoint is absent and its identity answers', async () => {
    expect(await resolveRuntimeMetadata('/profile')).toEqual(legacy)
    expect(mocks.request).toHaveBeenCalledOnce()
    expect(mocks.request).toHaveBeenCalledWith(legacy, 'status.get', undefined, 1_000)
  })

  it.each(['accepting', 'unproven'])(
    'keeps the current record when its endpoint is %s',
    async (verdict) => {
      mocks.probe.mockResolvedValue(verdict)
      expect(await resolveRuntimeMetadata('/profile')).toEqual(current)
      expect(mocks.request).not.toHaveBeenCalled()
    }
  )

  it('does not switch when the old response has another identity or no identity', async () => {
    for (const runtimeId of ['other', null]) {
      mocks.request.mockResolvedValue({ ok: true, result: {}, _meta: { runtimeId } })
      expect(await resolveRuntimeMetadata('/profile')).toEqual(current)
    }
  })

  it('does not switch on a failed or unavailable old runtime', async () => {
    mocks.request.mockResolvedValueOnce({ ok: false, error: {}, _meta: { runtimeId: 'old' } })
    expect(await resolveRuntimeMetadata('/profile')).toEqual(current)
    mocks.request.mockRejectedValueOnce(new Error('unavailable'))
    expect(await resolveRuntimeMetadata('/profile')).toEqual(current)
  })

  it('fails before sending a user request when either record changes during the probe', async () => {
    const replacement = { ...current, runtimeId: 'replacement' }
    mocks.current.mockReturnValueOnce(current).mockReturnValueOnce(replacement)
    await expect(resolveRuntimeMetadata('/profile')).rejects.toMatchObject({
      code: 'runtime_metadata_changed'
    })
  })

  it('refuses a current record that changed before probing even when its ID is unchanged', () => {
    mocks.current.mockReturnValue({ ...current, authToken: 'newer-token' })
    expect(() => resolveRuntimeMetadata('/profile')).toThrow('Runtime discovery changed')
    expect(mocks.probe).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('keeps the current record when the old record is unreadable', async () => {
    mocks.legacy.mockImplementation(() => {
      throw new Error('unreadable')
    })
    expect(await resolveRuntimeMetadata('/profile')).toEqual(current)
    expect(mocks.probe).not.toHaveBeenCalled()
  })
})
