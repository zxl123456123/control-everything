// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
afterEach(() => cleanup())
it.each(['/studio', '/workbench/web-index.html?project_id=sample'])(
  'restores the previous view before opening the unified entry at %s',
  async (url) => {
    window.history.replaceState(null, '', url)
    fixture.activeView = 'mobile'
    fixture.close.mockReset().mockImplementation(() => {
      expect(window.location.hash).toBe('')
      fixture.activeView = fixture.previousView
    })
    render(<MobilePage />)
    expect(screen.getByText(/在工作台管理账号/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '打开账号与设备' }))
    expect(fixture.activeView).toBe('terminal')
    expect(fixture.close).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('#mobile')
  }
)
it('keeps the existing return action without navigating', () => {
  window.history.replaceState(null, '', '/studio#project/sample/workspace')
  fixture.close.mockReset()
  render(<MobilePage />)
  fireEvent.click(screen.getByRole('button', { name: '返回工作区' }))
  expect(fixture.close).toHaveBeenCalledTimes(1)
  expect(window.location.hash).toBe('#project/sample/workspace')
})
