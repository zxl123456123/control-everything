import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installBrowserGlobals } from '../web-preload-api-test-harness'

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

it.each([
  ['/studio', 'Control Everything'],
  ['/workbench/web-index.html', 'Control Everything'],
  ['/web-index.html', 'Orca'],
  ['/workbench/other.html', 'Orca']
])('reports the app identity for %s without renaming standalone builds', async (pathname, name) => {
  const globals = installBrowserGlobals('Linux')
  Object.assign(globals.window.location, { pathname })
  const { createWebAppApi } = await import('./web-app-api')
  expect(await createWebAppApi().app!.getIdentity()).toMatchObject({ name })
})
