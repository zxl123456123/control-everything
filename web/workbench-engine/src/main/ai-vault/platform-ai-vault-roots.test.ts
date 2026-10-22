import { afterEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ wsl: vi.fn(), filter: vi.fn(), readers: vi.fn() }))
vi.mock('../wsl', async (original) => ({ ...(await original<object>()), listRunningWslHomeDirsAsync: mocks.wsl }))
vi.mock('../wsl-running-path-filter', () => ({ filterPathsToRunningWslDistrosAsync: mocks.filter }))
vi.mock('./opencode-wsl-runtime-preparation', () => ({ prepareOpenCodeWslReaders: mocks.readers }))
import { configureAiVaultSessionSources, configuredAdditionalCodexHomePaths, getAiVaultWslHomeDirs,
  localAiVaultScanRoots } from './cached-session-list'

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); configureAiVaultSessionSources({}) })
it('list and search roots bypass all WSL and extra-home discovery in the synthetic profile', async () => {
  vi.stubEnv('CE_WORKBENCH_ISOLATED', '1')
  vi.stubEnv('CE_WORKBENCH_ORIGIN', 'http://127.0.0.1:14401')
  const homes = vi.fn(() => ['/fixture/other-account'])
  configureAiVaultSessionSources({ getAdditionalCodexHomePaths: homes })
  const roots = await localAiVaultScanRoots()
  expect(roots.additionalCodexSessionsDirs).toEqual([])
  expect(roots.wslHomeDirs).toEqual([])
  expect(roots.wslOpenCodeReaders).toEqual([])
  expect(roots.claudeProfileProjectsDirs).toEqual([])
  expect(configuredAdditionalCodexHomePaths()).toEqual([])
  expect(await getAiVaultWslHomeDirs()).toEqual([])
  for (const probe of [homes, mocks.wsl, mocks.filter, mocks.readers]) expect(probe).not.toHaveBeenCalled()
})
