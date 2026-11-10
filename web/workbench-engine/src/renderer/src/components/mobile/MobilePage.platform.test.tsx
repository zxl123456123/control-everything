// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({
  close: vi.fn(),
  activeView: 'mobile',
  previousView: 'terminal'
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ closeMobilePage: fixture.close })
}))
vi.mock('./MobilePageContent', () => ({ MobilePageContent: () => null }))
import MobilePage from './MobilePage'
afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.platformView
})
it.each([
  '/studio#project/sample/workspace',
  '/workbench/web-index.html#project/sample/workspace',
  '/workbench/web-index.html?project_id=sample',
  '/studio#workbench',
  '/studio#workspace',
  '/studio#project-setup'
])('retires a visible native mobile page before opening the canonical account at %s', async (url) => {
  window.history.replaceState(null, '', url)
  document.documentElement.dataset.platformView = 'workspace'
  const before = window.location.hash
  fixture.activeView = 'mobile'
  fixture.close.mockReset().mockImplementation(() => {
    expect(window.location.hash).toBe(before)
    fixture.activeView = fixture.previousView
  })
  render(<MobilePage />)
  await waitFor(() => expect(window.location.hash).toBe('#settings/account'))
  expect(fixture.activeView).toBe('terminal')
  expect(fixture.close).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: '打开账号与设备' })).toBeNull()
})

it.each([
  '/studio#home',
  '/studio#news',
  '/studio#settings/account',
  '/studio#mobile',
  '/studio#settings/mobile',
  '/studio#project/sample/review',
  '/studio#project/sample/settings',
  '/workbench/web-index.html?project_id=sample#home',
  '/studio#project/%2Foutside/workspace'
])('retires a hidden persisted mobile view without replacing the outer route at %s', (url) => {
  window.history.replaceState(null, '', url)
  document.documentElement.dataset.platformView = 'studio'
  const before = window.location.hash
  fixture.activeView = 'mobile'
  fixture.close.mockReset().mockImplementation(() => {
    fixture.activeView = fixture.previousView
  })
  render(<MobilePage />)
  expect(fixture.activeView).toBe('terminal')
  expect(fixture.close).toHaveBeenCalledTimes(1)
  expect(window.location.hash).toBe(before)
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByRole('status')).toBeNull()
})

it.each(['/studio#project/sample/workspace', '/studio#workbench'])(
  'does not redirect during a still-hidden native bootstrap at %s', (url) => {
    window.history.replaceState(null, '', url)
    document.documentElement.dataset.platformView = 'studio'
    const before = window.location.hash
    fixture.close.mockReset()
    render(<MobilePage />)
    expect(fixture.close).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe(before)
  }
)
