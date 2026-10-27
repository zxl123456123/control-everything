// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import PlatformStudioSurface from './platform-studio-surface'

afterEach(() => {
  cleanup()
  document
    .querySelectorAll('meta[name="ce-remote-context"], meta[name="ce-storage-scope"]')
    .forEach((meta) => meta.remove())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('downloads dependencies in order once and keeps load-error recovery available during navigation', async () => {
  document.head.insertAdjacentHTML(
    'beforeend',
    `<meta name="ce-remote-context" content="${'C'.repeat(32)}"><meta name="ce-storage-scope" content="${'a'.repeat(64)}">`
  )
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<div id="ce-studio"></div>'
    })
  )
  const scripts: HTMLScriptElement[] = []
  // Observe scheduling without enabling network execution in the test environment.
  vi.spyOn(document.head, 'append').mockImplementation((...nodes) => {
    scripts.push(
      ...nodes.filter((node): node is HTMLScriptElement => node instanceof HTMLScriptElement)
    )
  })
  const onProjects = vi.fn()
  const view = render(<PlatformStudioSurface hidden={false} onProjects={onProjects} />)
  // Every download is scheduled before the first script finishes, without changing execution order.
  expect(scripts.map((script) => new URL(script.src).pathname)).toEqual([
    '/ui-dialog.js',
    '/onboarding.js',
    '/execution.js',
    '/task-center.js',
    '/monitor-art.js',
    '/monitor-scene.js',
    '/monitor-model.js',
    '/project-monitor.js',
    '/project-space.js',
    '/project-progress-model.js',
    '/project-progress.js',
    '/agents.js',
    '/studio-data.js',
    '/remote/account-device.js',
    '/mobile-device-entry.js',
    '/news-pets.js',
    '/news-pet-dial.js',
    '/news-pet-wheel.js',
    '/news-pet-prefs.js',
    '/news-pet-director.js',
    '/news-pet-status.js',
    '/studio-shell.js',
    '/studio-pet-settings.js',
    '/studio-mascot.js',
    '/studio-preview.js'
  ])
  expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('X-CE-Context')).toBe(
    'C'.repeat(32)
  )
  expect(scripts.every((script) => script.async === false)).toBe(true)
  view.rerender(<PlatformStudioSurface hidden onProjects={onProjects} />)
  view.rerender(<PlatformStudioSurface hidden={false} pending onProjects={onProjects} />)
  expect(view.container.querySelector('section')?.hasAttribute('inert')).toBe(false)
  expect(view.container.querySelector<HTMLElement>('.platform-studio-host')?.hidden).toBe(true)
  view.rerender(<PlatformStudioSurface hidden={false} onProjects={onProjects} />)
  expect(view.container.querySelector('section')?.hasAttribute('inert')).toBe(false)
  expect(view.container.querySelector<HTMLElement>('.platform-studio-host')?.hidden).toBe(false)
  expect(scripts).toHaveLength(23)
  view.rerender(<PlatformStudioSurface hidden={false} pending onProjects={onProjects} />)
  await act(async () => {
    scripts[0].dispatchEvent(new Event('error'))
  })
  expect(screen.getByRole('alert').textContent).toContain('工作台资源加载失败')
  expect(screen.getByRole('button', { name: '重新加载' }).closest('[inert]')).toBeNull()
})
